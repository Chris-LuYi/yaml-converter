import { Command } from "commander"
import { existsSync, writeFileSync, readFileSync } from "fs"
import chalk from "chalk"
import { parse, stringify } from "yaml"
import { loadSchema } from "./schema/loader"
import { validateRows } from "./schema/validator"
import { toExcel } from "./converter/to-excel"
import { toYaml } from "./converter/to-yaml"
import type { ConvertOptions, ErrorOutput, ValidationError } from "./types"

const program = new Command()

program
  .name("yaml-converter")
  .description("Convert YAML files to Excel and back with schema-driven validation")
  .version("0.1.0")
  .requiredOption("-i, --input <file>", "Input file path")
  .option("-o, --output <file>", "Output file path")
  .requiredOption("--schema <file>", "Schema YAML file path")
  .option("--validate", "Validate only, do not write output; errors file still written", false)
  .option("--error-output <file>", "Override default error file path")
  .option("--json", "Output results as JSON to stdout (for agent/script use)", false)
  .action(async (opts: ConvertOptions) => {
    await run(opts)
  })

program.parseAsync(process.argv).catch(() => process.exit(2))

async function run(opts: ConvertOptions) {
  if (!existsSync(opts.input)) {
    emit(opts.json, { status: "fatal", error: `Input file not found: ${opts.input}` })
    process.exit(2)
  }
  if (!existsSync(opts.schema)) {
    emit(opts.json, { status: "fatal", error: `Schema file not found: ${opts.schema}` })
    process.exit(2)
  }

  // --output is required unless --validate is set
  if (!opts.validate && !opts.output) {
    emit(opts.json, { status: "fatal", error: "Missing required option: -o, --output <file> (required unless --validate is set)" })
    process.exit(2)
  }

  try {
    const schema = loadSchema(opts.schema)
    const ext = opts.input.split(".").pop()?.toLowerCase() ?? ""
    const isYamlInput = ext === "yaml" || ext === "yml"

    let rows: Record<string, unknown>[]
    if (isYamlInput) {
      const content = readFileSync(opts.input, "utf-8")
      rows = parse(content) as Record<string, unknown>[]
    } else {
      rows = await toYaml(opts.input, schema)
    }

    const errors = validateRows(rows, schema)

    if (errors.length > 0) {
      const errorPath = deriveErrorPath(opts)
      writeErrors(errorPath, opts.input, errors)
      if (opts.json) {
        emit(true, { status: "error", input: opts.input, errorFile: errorPath, errorCount: errors.length })
      } else {
        console.error(chalk.red(`Validation failed: ${errors.length} error(s)`))
        errors.slice(0, 5).forEach((e) => {
          console.error(chalk.yellow(`  Row ${e.row} [${e.field}]: ${e.message}`))
        })
        if (errors.length > 5) console.error(chalk.gray(`  ... and ${errors.length - 5} more`))
        console.error(chalk.gray(`Full errors written to ${errorPath}`))
      }
      process.exit(1)
    }

    if (!opts.validate && opts.output) {
      if (isYamlInput) {
        await toExcel(rows, schema, opts.output)
      } else {
        writeFileSync(opts.output, stringify(rows))
      }
    }

    emit(opts.json, { status: "ok", input: opts.input, output: opts.output ?? null })
    if (!opts.json) console.log(chalk.green("Done"))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit(opts.json, { status: "fatal", error: message })
    process.exit(2)
  }
}

function emit(jsonMode: boolean | undefined, data: object) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(data) + "\n")
  }
}

function deriveErrorPath(opts: ConvertOptions): string {
  if (opts.errorOutput) return opts.errorOutput
  const base = opts.output ?? opts.input
  return base.replace(/\.[^.]+$/, "") + ".errors.json"
}

function writeErrors(filePath: string, file: string, errors: ValidationError[]) {
  const out: ErrorOutput = { summary: { total: errors.length, file }, errors }
  writeFileSync(filePath, JSON.stringify(out, null, 2))
}
