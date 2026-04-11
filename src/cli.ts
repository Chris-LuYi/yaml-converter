import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, extname, join, relative } from "node:path"
import chalk from "chalk"
import { Command } from "commander"
import { Document, parse, stringify } from "yaml"
import { version } from "../package.json"
import { toExcel, toExcelMulti } from "./converter/to-excel"
import { sanitizeSheetName, toYamlAll } from "./converter/to-yaml"
import { loadSchema } from "./schema/loader"
import { validateRows } from "./schema/validator"
import type {
  AppConfig,
  ConvertOptions,
  ErrorOutput,
  ExcelStyle,
  Schema,
  ValidationError,
} from "./types"

const CONFIG_FILE = "yaml-converter.config.yaml"

function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) return {}
  try {
    return (parse(readFileSync(CONFIG_FILE, "utf-8")) as AppConfig) ?? {}
  } catch {
    return {}
  }
}

const program = new Command()

program
  .name("yaml-converter")
  .description(
    "Convert YAML files to Excel and back with schema-driven validation",
  )
  .version(version)
  .requiredOption("-i, --input <file>", "Input file path")
  .option("-o, --output <file>", "Output file path (directory for Excel→YAML)")
  .option(
    "--schema <file>",
    "Schema YAML file path (default: schema.yaml next to input)",
  )
  .option(
    "--validate",
    "Validate only, do not write output; errors file still written",
    false,
  )
  .option("--error-output <file>", "Override default error file path")
  .option(
    "--json",
    "Output results as JSON to stdout (for agent/script use)",
    false,
  )
  .option(
    "--sheet-schemas <mapping>",
    "Per-sheet schema overrides (not yet implemented)",
  )
  .option(
    "--recursive",
    "Recursively collect YAML files from subdirectories",
    false,
  )
  .option(
    "--merge",
    "Merge all YAML files into one Excel sheet (directory input)",
    false,
  )
  .option(
    "--tag-field <name>",
    "Column name injected with source filename when using --merge",
  )
  .option(
    "--split-by <field>",
    "Split rows into separate YAML files grouped by field value",
  )
  .option(
    "--drop-field <field>",
    "Remove a field from each row in split output",
  )
  .action(async (opts: ConvertOptions) => {
    await run(opts)
  })

program.parseAsync(process.argv).catch(() => process.exit(2))

async function run(opts: ConvertOptions) {
  const config = loadConfig()
  const style: ExcelStyle | undefined = config.excel?.style

  if (opts.sheetSchemas) {
    console.error(
      chalk.yellow("--sheet-schemas is not yet implemented, ignored"),
    )
  }

  if (!existsSync(opts.input)) {
    emitFatal(opts.json, `Input file not found: ${opts.input}`)
    process.exit(2)
  }

  // Split mode: works on YAML or Excel file input (not directories)
  if (opts.splitBy) {
    await runSplit(opts)
    return
  }

  // Directory input → multi-YAML-to-Excel mode
  if (statSync(opts.input).isDirectory()) {
    await runDirectory(opts, style)
    return
  }

  // Resolve schema: explicit flag > schema.yaml in CWD (where the CLI is run)
  const resolvedSchema = opts.schema ?? "schema.yaml"
  if (!existsSync(resolvedSchema)) {
    emitFatal(opts.json, `Schema file not found: ${resolvedSchema}`)
    process.exit(2)
  }

  const ext = opts.input.split(".").pop()?.toLowerCase() ?? ""
  const isYamlInput = ext === "yaml" || ext === "yml"

  // Derive default output when not specified
  if (!opts.validate && !opts.output) {
    opts.output = isYamlInput
      ? opts.input.replace(/\.(yaml|yml)$/i, ".xlsx")
      : opts.input.replace(/\.[^.]+$/, "")
  }

  try {
    const schema = loadSchema(resolvedSchema)

    if (isYamlInput) {
      // YAML → Excel (single file output, unchanged)
      const content = readFileSync(opts.input, "utf-8")
      const rows = parse(content) as Record<string, unknown>[]
      const errors = validateRows(rows, schema)

      if (errors.length > 0) {
        const errorPath = deriveErrorPath(opts, false)
        writeErrors(errorPath, opts.input, errors)
        emitErrors(opts, errors, errorPath)
        process.exit(1)
      }

      if (!opts.validate && opts.output) {
        const sheetName = basename(opts.input, extname(opts.input))
        await toExcel(rows, schema, opts.output, sheetName, style)
      }

      emit(opts.json, {
        status: "ok",
        input: opts.input,
        output: opts.output ?? null,
        rows: rows.length,
      })
      if (!opts.json) {
        const verb = opts.validate ? "validated" : "converted"
        const dest =
          opts.output && !opts.validate ? chalk.gray(` → ${opts.output}`) : ""
        console.log(
          `${chalk.green("Done")}  ${rows.length} rows ${verb}${dest}`,
        )
      }
    } else {
      // Excel → YAML (multi-sheet directory output)
      const sheetMap = await toYamlAll(opts.input, schema)
      const allErrors: ValidationError[] = []
      const nonEmptySheets = new Map<string, Record<string, unknown>[]>()

      for (const [sheetName, rows] of sheetMap) {
        if (rows.length === 0) {
          console.error(
            chalk.yellow(`  Sheet "${sheetName}" has no data rows, skipping`),
          )
          continue
        }
        nonEmptySheets.set(sheetName, rows)
        const sheetErrors = validateRows(rows, schema).map((e) => ({
          ...e,
          sheet: sheetName,
        }))
        allErrors.push(...sheetErrors)
      }

      if (allErrors.length > 0) {
        const errorPath = deriveErrorPath(opts, true)
        writeErrors(errorPath, opts.input, allErrors)
        emitErrors(opts, allErrors, errorPath)
        process.exit(1)
      }

      const sheetRowCounts: Record<string, number> = {}
      if (!opts.validate && opts.output) {
        mkdirSync(opts.output, { recursive: true })
        for (const [sheetName, rows] of nonEmptySheets) {
          const fileName = `${sanitizeSheetName(sheetName)}.yaml`
          writeFileSync(join(opts.output, fileName), formatYaml(rows, schema))
          sheetRowCounts[sheetName] = rows.length
        }
      } else {
        for (const [sheetName, rows] of nonEmptySheets) {
          sheetRowCounts[sheetName] = rows.length
        }
      }

      const totalRows = Object.values(sheetRowCounts).reduce((a, b) => a + b, 0)
      emit(opts.json, {
        status: "ok",
        input: opts.input,
        output: opts.output ?? null,
        sheets: sheetRowCounts,
        totalRows,
      })
      if (!opts.json) {
        console.log(chalk.green("Done"))
        const nameWidth = Math.max(
          ...Object.keys(sheetRowCounts).map((n) => n.length),
          4,
        )
        for (const [sheetName, count] of Object.entries(sheetRowCounts)) {
          const dest =
            opts.output && !opts.validate
              ? chalk.gray(
                  ` → ${join(opts.output, `${sanitizeSheetName(sheetName)}.yaml`)}`,
                )
              : ""
          console.log(
            `  ${chalk.cyan(sheetName.padEnd(nameWidth))}  ${count} rows${dest}`,
          )
        }
        if (nonEmptySheets.size > 1) {
          console.log(chalk.gray(`  ${"─".repeat(nameWidth + 12)}`))
          const verb = opts.validate ? "validated" : "converted"
          const destNote =
            opts.output && !opts.validate ? chalk.gray(` → ${opts.output}`) : ""
          console.log(
            `  ${chalk.bold(String(totalRows))} rows ${verb} across ${nonEmptySheets.size} sheets${destNote}`,
          )
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitFatal(opts.json, message)
    process.exit(2)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collect YAML files from a directory. In recursive mode, tag = relative path
 *  from root dir without extension (e.g. "project-a/mfe1"). Otherwise, tag = basename. */
function collectYamlFiles(
  dir: string,
  recursive: boolean,
): Array<{ absPath: string; tag: string }> {
  function walk(current: string): Array<{ absPath: string; tag: string }> {
    const results: Array<{ absPath: string; tag: string }> = []
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && recursive) {
        results.push(...walk(join(current, entry.name)))
      } else if (
        entry.isFile() &&
        /\.(yaml|yml)$/i.test(entry.name) &&
        entry.name !== "schema.yaml" &&
        !entry.name.endsWith("-schema.yaml")
      ) {
        const absPath = join(current, entry.name)
        const rel = relative(dir, absPath)
        const tag = recursive
          ? rel.replace(/\.(yaml|yml)$/i, "").replace(/\\/g, "/")
          : basename(entry.name, extname(entry.name))
        results.push({ absPath, tag })
      }
    }
    return results
  }
  return walk(dir).sort((a, b) => a.tag.localeCompare(b.tag))
}

/** Prepend a synthetic tag column to a schema for merged Excel output. */
function buildTaggedSchema(schema: Schema, tagField: string): Schema {
  return {
    columns: [
      { field: tagField, header: tagField, type: "string" },
      ...schema.columns,
    ],
  }
}

/** Inject a tag field as the first key of each row (for merge mode). */
function injectTag(
  rows: Record<string, unknown>[],
  tag: string,
  tagField: string,
): Record<string, unknown>[] {
  return rows.map((r) => ({ [tagField]: tag, ...r }))
}

/** Remove a field from every row (for split --drop-field). */
function dropFieldFromRows(
  rows: Record<string, unknown>[],
  field: string,
): Record<string, unknown>[] {
  return rows.map((r) => {
    const copy = { ...r }
    delete copy[field]
    return copy
  })
}

// ─── Directory mode (YAML folder → Excel) ────────────────────────────────────

async function runDirectory(opts: ConvertOptions, style?: ExcelStyle) {
  const inputDir = opts.input

  if (opts.merge && !opts.tagField) {
    emitFatal(opts.json, "--merge requires --tag-field <name>")
    process.exit(2)
  }

  const entries = collectYamlFiles(inputDir, opts.recursive ?? false)

  if (entries.length === 0) {
    emitFatal(opts.json, `No YAML files found in directory: ${inputDir}`)
    process.exit(2)
  }

  // Derive default output: ./data/ → ./data.xlsx
  if (!opts.validate && !opts.output) {
    opts.output = `${inputDir.replace(/\/+$/, "")}.xlsx`
  }

  // In merge mode, load one shared schema (no per-file overrides)
  let mergeSchema: Schema | null = null
  if (opts.merge) {
    const schemaPath = opts.schema ?? "schema.yaml"
    if (!existsSync(schemaPath)) {
      emitFatal(opts.json, `Schema not found: ${schemaPath}`)
      process.exit(2)
    }
    mergeSchema = loadSchema(schemaPath)
  }

  // Phase 1: parse + validate all files
  const allErrors: ValidationError[] = []
  const sheetData: Array<{
    name: string
    rows: Record<string, unknown>[]
    schema: Schema
  }> = []

  for (const entry of entries) {
    let schema: Schema
    if (opts.merge && mergeSchema) {
      schema = mergeSchema
    } else {
      // Per-file schema override: {basename}-schema.yaml in CWD
      const fileBase = basename(entry.tag)
      const perFileSchemaPath = `${fileBase}-schema.yaml`
      const fallbackSchemaPath = opts.schema ?? "schema.yaml"
      const schemaPath = existsSync(perFileSchemaPath)
        ? perFileSchemaPath
        : fallbackSchemaPath
      if (!existsSync(schemaPath)) {
        emitFatal(
          opts.json,
          `Schema not found for ${entry.tag}: tried ${perFileSchemaPath} and ${fallbackSchemaPath}`,
        )
        process.exit(2)
      }
      schema = loadSchema(schemaPath)
    }

    try {
      let rows = parse(readFileSync(entry.absPath, "utf-8")) as Record<
        string,
        unknown
      >[]
      if (opts.merge && opts.tagField) {
        rows = injectTag(rows, entry.tag, opts.tagField)
      }
      const errors = validateRows(rows, schema).map((e) => ({
        ...e,
        sheet: entry.tag,
      }))
      allErrors.push(...errors)
      sheetData.push({ name: entry.tag, rows, schema })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitFatal(opts.json, `Error processing ${entry.tag}: ${message}`)
      process.exit(2)
    }
  }

  if (allErrors.length > 0) {
    const errorPath =
      opts.errorOutput ?? `${opts.output ?? opts.input}.errors.json`
    writeErrors(errorPath, opts.input, allErrors)
    emitErrors(opts, allErrors, errorPath)
    process.exit(1)
  }

  // Phase 2: write output
  if (opts.merge) {
    const mergedRows = sheetData.flatMap((s) => s.rows)
    const taggedSchema = buildTaggedSchema(
      mergeSchema as Schema,
      opts.tagField as string,
    )
    const sheetName = sanitizeSheetName(basename(inputDir.replace(/\/+$/, "")))

    if (!opts.validate && opts.output) {
      await toExcel(mergedRows, taggedSchema, opts.output, sheetName, style)
    }

    emit(opts.json, {
      status: "ok",
      input: opts.input,
      output: opts.output ?? null,
      rows: mergedRows.length,
      files: entries.length,
    })
    if (!opts.json) {
      const verb = opts.validate ? "validated" : "merged"
      const dest =
        opts.output && !opts.validate ? chalk.gray(` → ${opts.output}`) : ""
      console.log(
        `${chalk.green("Done")}  ${mergedRows.length} rows ${verb} from ${entries.length} files${dest}`,
      )
    }
  } else {
    if (!opts.validate && opts.output) {
      await toExcelMulti(
        sheetData.map((s) => ({ ...s, name: sanitizeSheetName(s.name) })),
        opts.output,
        style,
      )
    }

    const sheetRowCounts: Record<string, number> = {}
    for (const { name, rows } of sheetData) {
      sheetRowCounts[sanitizeSheetName(name)] = rows.length
    }
    const totalRows = Object.values(sheetRowCounts).reduce((a, b) => a + b, 0)

    emit(opts.json, {
      status: "ok",
      input: opts.input,
      output: opts.output ?? null,
      sheets: sheetRowCounts,
      totalRows,
    })

    if (!opts.json) {
      console.log(chalk.green("Done"))
      const nameWidth = Math.max(
        ...Object.keys(sheetRowCounts).map((n) => n.length),
        4,
      )
      for (const [sheetName, count] of Object.entries(sheetRowCounts)) {
        const dest =
          opts.output && !opts.validate
            ? chalk.gray(` → ${opts.output} (sheet: ${sheetName})`)
            : ""
        console.log(
          `  ${chalk.cyan(sheetName.padEnd(nameWidth))}  ${count} rows${dest}`,
        )
      }
      if (sheetData.length > 1) {
        console.log(chalk.gray(`  ${"─".repeat(nameWidth + 12)}`))
        const verb = opts.validate ? "validated" : "converted"
        const destNote =
          opts.output && !opts.validate ? chalk.gray(` → ${opts.output}`) : ""
        console.log(
          `  ${chalk.bold(String(totalRows))} rows ${verb} across ${sheetData.length} files${destNote}`,
        )
      }
    }
  }
}

// ─── Split mode (Excel/YAML → per-group YAML files) ──────────────────────────

async function runSplit(opts: ConvertOptions) {
  const ext = opts.input.split(".").pop()?.toLowerCase() ?? ""
  const isYaml = ext === "yaml" || ext === "yml"

  const outputDir =
    opts.output ??
    (isYaml
      ? opts.input.replace(/\.(yaml|yml)$/i, "")
      : opts.input.replace(/\.[^.]+$/, ""))

  // Schema: required for Excel input, optional for YAML input
  let schema: Schema | null = null
  const resolvedSchema = opts.schema ?? "schema.yaml"
  if (!isYaml) {
    if (!existsSync(resolvedSchema)) {
      emitFatal(opts.json, `Schema file not found: ${resolvedSchema}`)
      process.exit(2)
    }
    schema = loadSchema(resolvedSchema)
  } else if (existsSync(resolvedSchema)) {
    schema = loadSchema(resolvedSchema)
  }

  // Collect all rows
  let allRows: Record<string, unknown>[]
  try {
    if (isYaml) {
      allRows = parse(readFileSync(opts.input, "utf-8")) as Record<
        string,
        unknown
      >[]
    } else {
      const sheetMap = await toYamlAll(opts.input, schema as Schema)
      allRows = [...sheetMap.values()].flat()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emitFatal(opts.json, message)
    process.exit(2)
  }

  // Validate if schema available and not validate-only (validate-only still validates)
  if (schema) {
    const errors = validateRows(allRows, schema)
    if (errors.length > 0) {
      const errorPath = opts.errorOutput ?? `${outputDir}.errors.json`
      writeErrors(errorPath, opts.input, errors)
      emitErrors(opts, errors, errorPath)
      process.exit(1)
    }
  }

  // Group rows by split-by field
  const groups = new Map<string, Record<string, unknown>[]>()
  for (const row of allRows) {
    const key = String(row[opts.splitBy as string] ?? "__unknown__")
    const group = groups.get(key)
    if (group) {
      group.push(row)
    } else {
      groups.set(key, [row])
    }
  }

  // Write output files
  if (!opts.validate) {
    mkdirSync(outputDir, { recursive: true })
    for (const [key, rows] of groups) {
      const outRows = opts.dropField
        ? dropFieldFromRows(rows, opts.dropField)
        : rows
      const fileName = `${sanitizeSheetName(key)}.yaml`
      const content = schema ? formatYaml(outRows, schema) : stringify(outRows)
      writeFileSync(join(outputDir, fileName), content)
    }
  }

  const groupCounts = Object.fromEntries(
    [...groups.entries()].map(([k, r]) => [k, r.length]),
  )
  const totalRows = allRows.length

  emit(opts.json, {
    status: "ok",
    input: opts.input,
    output: opts.validate ? null : outputDir,
    groups: groupCounts,
    totalRows,
  })

  if (!opts.json) {
    console.log(chalk.green("Done"))
    const nameWidth = Math.max(
      ...Object.keys(groupCounts).map((n) => n.length),
      4,
    )
    for (const [key, count] of Object.entries(groupCounts)) {
      const dest = !opts.validate
        ? chalk.gray(` → ${join(outputDir, `${sanitizeSheetName(key)}.yaml`)}`)
        : ""
      console.log(
        `  ${chalk.cyan(key.padEnd(nameWidth))}  ${count} rows${dest}`,
      )
    }
    if (groups.size > 1) {
      console.log(chalk.gray(`  ${"─".repeat(nameWidth + 12)}`))
      const verb = opts.validate ? "validated" : "split"
      const destNote = !opts.validate ? chalk.gray(` → ${outputDir}/`) : ""
      console.log(
        `  ${chalk.bold(String(totalRows))} rows ${verb} into ${groups.size} files${destNote}`,
      )
    }
  }
}

function emit(jsonMode: boolean | undefined, data: object) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(data)}\n`)
  }
}

function emitFatal(jsonMode: boolean | undefined, error: string) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify({ status: "fatal", error })}\n`)
  } else {
    console.error(chalk.red(`Error: ${error}`))
  }
}

function emitErrors(
  opts: ConvertOptions,
  errors: ValidationError[],
  errorPath: string,
) {
  if (opts.json) {
    emit(true, {
      status: "error",
      input: opts.input,
      errorFile: errorPath,
      errorCount: errors.length,
    })
  } else {
    console.error(chalk.red(`Validation failed: ${errors.length} error(s)`))
    for (const e of errors.slice(0, 5)) {
      const sheetPrefix = e.sheet ? `[${e.sheet}] ` : ""
      console.error(
        chalk.yellow(`  Row ${e.row} ${sheetPrefix}[${e.field}]: ${e.message}`),
      )
    }
    if (errors.length > 5)
      console.error(chalk.gray(`  ... and ${errors.length - 5} more`))
    console.error(chalk.gray(`Full errors written to ${errorPath}`))
  }
}

function deriveErrorPath(opts: ConvertOptions, isMultiSheet: boolean): string {
  if (opts.errorOutput) return opts.errorOutput
  if (isMultiSheet) {
    // -o is a directory: append .errors.json directly (no regex stripping)
    // If -o is absent (--validate mode), strip extension from input path
    const base = opts.output ?? opts.input.replace(/\.[^.]+$/, "")
    return `${base}.errors.json`
  }
  const base = opts.output ?? opts.input
  return `${base.replace(/\.[^.]+$/, "")}.errors.json`
}

/**
 * Serialize rows to YAML with blank lines between each array entry for readability.
 * Quoting style is left to the yaml library (YAML 1.2 — no automatic date coercion).
 */
function formatYaml(rows: Record<string, unknown>[], _schema: Schema): string {
  const parts = rows.map((row) => new Document([row]).toString().trimEnd())
  return `${parts.join("\n\n")}\n`
}

function writeErrors(
  filePath: string,
  file: string,
  errors: ValidationError[],
) {
  const out: ErrorOutput = { summary: { total: errors.length, file }, errors }
  writeFileSync(filePath, JSON.stringify(out, null, 2))
}
