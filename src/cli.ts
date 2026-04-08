import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import chalk from "chalk"
import { Command } from "commander"
import { parse, stringify } from "yaml"
import { toExcel } from "./converter/to-excel"
import { sanitizeSheetName, toYamlAll } from "./converter/to-yaml"
import { loadSchema } from "./schema/loader"
import { validateRows } from "./schema/validator"
import type { ConvertOptions, ErrorOutput, ValidationError } from "./types"

const program = new Command()

program
  .name("yaml-converter")
  .description(
    "Convert YAML files to Excel and back with schema-driven validation",
  )
  .version("0.1.0")
  .requiredOption("-i, --input <file>", "Input file path")
  .option("-o, --output <file>", "Output file path (directory for Excel→YAML)")
  .requiredOption("--schema <file>", "Schema YAML file path")
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
    emit(opts.json, {
      status: "fatal",
      error: `Input file not found: ${opts.input}`,
    })
    process.exit(2)
  }
  if (!existsSync(opts.schema)) {
    emit(opts.json, {
      status: "fatal",
      error: `Schema file not found: ${opts.schema}`,
    })
    process.exit(2)
  }

  const ext = opts.input.split(".").pop()?.toLowerCase() ?? ""
  const isYamlInput = ext === "yaml" || ext === "yml"

  // --output is required unless --validate is set
  if (!opts.validate && !opts.output) {
    emit(opts.json, {
      status: "fatal",
      error:
        "Missing required option: -o, --output <file> (required unless --validate is set)",
    })
    process.exit(2)
  }

  try {
    const schema = loadSchema(opts.schema)

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
        await toExcel(rows, schema, opts.output)
      }

      emit(opts.json, {
        status: "ok",
        input: opts.input,
        output: opts.output ?? null,
      })
      if (!opts.json) console.log(chalk.green("Done"))
    } else {
      // Excel → YAML (multi-sheet directory output)
      const sheetMap = await toYamlAll(opts.input, schema)
      const allErrors: ValidationError[] = []

      for (const [sheetName, rows] of sheetMap) {
        if (rows.length === 0) {
          console.error(
            chalk.yellow(`  Sheet "${sheetName}" has no data rows, skipping`),
          )
          continue
        }
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

      if (!opts.validate && opts.output) {
        mkdirSync(opts.output, { recursive: true })
        for (const [sheetName, rows] of sheetMap) {
          if (rows.length === 0) continue
          const fileName = `${sanitizeSheetName(sheetName)}.yaml`
          writeFileSync(join(opts.output, fileName), stringify(rows))
        }
      }

      emit(opts.json, {
        status: "ok",
        input: opts.input,
        output: opts.output ?? null,
      })
      if (!opts.json) console.log(chalk.green("Done"))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit(opts.json, { status: "fatal", error: message })
    process.exit(2)
  }
}

function emit(jsonMode: boolean | undefined, data: object) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(data)}\n`)
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

function writeErrors(
  filePath: string,
  file: string,
  errors: ValidationError[],
) {
  const out: ErrorOutput = { summary: { total: errors.length, file }, errors }
  writeFileSync(filePath, JSON.stringify(out, null, 2))
}
