import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, extname, join } from "node:path"
import chalk from "chalk"
import { Command } from "commander"
import { Document, isMap, isPair, isScalar, isSeq, parse } from "yaml"
import { toExcel, toExcelMulti } from "./converter/to-excel"
import { sanitizeSheetName, toYamlAll } from "./converter/to-yaml"
import { loadSchema } from "./schema/loader"
import { validateRows } from "./schema/validator"
import type {
  ConvertOptions,
  ErrorOutput,
  Schema,
  ValidationError,
} from "./types"

const program = new Command()

program
  .name("yaml-converter")
  .description(
    "Convert YAML files to Excel and back with schema-driven validation",
  )
  .version("0.1.0")
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
  .action(async (opts: ConvertOptions) => {
    await run(opts)
  })

program.parseAsync(process.argv).catch(() => process.exit(2))

async function run(opts: ConvertOptions) {
  if (opts.sheetSchemas) {
    console.error(
      chalk.yellow("--sheet-schemas is not yet implemented, ignored"),
    )
  }

  if (!existsSync(opts.input)) {
    emitFatal(opts.json, `Input file not found: ${opts.input}`)
    process.exit(2)
  }

  // Directory input → multi-YAML-to-Excel mode
  if (statSync(opts.input).isDirectory()) {
    await runDirectory(opts)
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
        await toExcel(rows, schema, opts.output, sheetName)
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

async function runDirectory(opts: ConvertOptions) {
  const inputDir = opts.input

  const yamlFiles = readdirSync(inputDir)
    .filter(
      (f) =>
        /\.(yaml|yml)$/i.test(f) &&
        f !== "schema.yaml" &&
        !f.endsWith("-schema.yaml"),
    )
    .sort()
    .map((f) => join(inputDir, f))

  if (yamlFiles.length === 0) {
    emitFatal(opts.json, `No YAML files found in directory: ${inputDir}`)
    process.exit(2)
  }

  // Derive default output: ./data/ → ./data.xlsx
  if (!opts.validate && !opts.output) {
    opts.output = `${inputDir.replace(/\/+$/, "")}.xlsx`
  }

  // Phase 1: parse + validate all files, collect errors and sheet data
  const allErrors: ValidationError[] = []
  const sheetData: Array<{
    name: string
    rows: Record<string, unknown>[]
    schema: ReturnType<typeof loadSchema>
  }> = []

  for (const yamlFilePath of yamlFiles) {
    const baseName = basename(yamlFilePath, extname(yamlFilePath))

    // Per-file schema override: {baseName}-schema.yaml in CWD
    const perFileSchemaPath = `${baseName}-schema.yaml`
    const fallbackSchemaPath = opts.schema ?? "schema.yaml"
    const schemaPath = existsSync(perFileSchemaPath)
      ? perFileSchemaPath
      : fallbackSchemaPath

    if (!existsSync(schemaPath)) {
      emitFatal(
        opts.json,
        `Schema not found for ${baseName}.yaml: tried ${perFileSchemaPath} and ${fallbackSchemaPath}`,
      )
      process.exit(2)
    }

    try {
      const schema = loadSchema(schemaPath)
      const rows = parse(readFileSync(yamlFilePath, "utf-8")) as Record<
        string,
        unknown
      >[]
      const errors = validateRows(rows, schema).map((e) => ({
        ...e,
        sheet: baseName,
      }))
      allErrors.push(...errors)
      sheetData.push({ name: baseName, rows, schema })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      emitFatal(opts.json, `Error processing ${baseName}.yaml: ${message}`)
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
  if (!opts.validate && opts.output) {
    await toExcelMulti(sheetData, opts.output)
  }

  const sheetRowCounts: Record<string, number> = {}
  for (const { name, rows } of sheetData) {
    sheetRowCounts[name] = rows.length
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
 * Serialize rows to YAML with schema-aware quoting and blank lines between entries.
 * - date fields: always QUOTE_DOUBLE (cross-parser safety for YAML 1.1 consumers)
 * - strings matching digits+dots (semver-like): QUOTE_DOUBLE to preserve intent
 * - blank line between each array entry for readability
 */
function formatYaml(rows: Record<string, unknown>[], schema: Schema): string {
  const dateFields = new Set(
    schema.columns.filter((c) => c.type === "date").map((c) => c.field),
  )

  const parts = rows.map((row) => {
    const doc = new Document([row])
    const seq = doc.contents
    if (isSeq(seq)) {
      for (const item of seq.items) {
        if (isMap(item)) {
          for (const pair of item.items) {
            if (isPair(pair) && isScalar(pair.key) && isScalar(pair.value)) {
              const fieldName = String(pair.key.value)
              const val = pair.value.value
              if (
                typeof val === "string" &&
                (dateFields.has(fieldName) || /^\d+(\.\d+)+$/.test(val))
              ) {
                pair.value.type = "QUOTE_DOUBLE"
              }
            }
          }
        }
      }
    }
    return doc.toString().trimEnd()
  })

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
