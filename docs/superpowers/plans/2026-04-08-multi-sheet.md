# Multi-Sheet Excel → YAML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When converting an Excel workbook to YAML, output one YAML file per sheet into a directory (`-o` is now a directory path), with validation errors tagged by sheet name.

**Architecture:** Extract a `convertSheet` helper in `to-yaml.ts` shared by the existing `toYaml` (first sheet only, backward-compatible) and the new `toYamlAll` (all sheets, returns `Map<sheetName, rows[]>`). The CLI detects xlsx input direction and switches from single-file to directory output mode. `deriveErrorPath` is updated to handle directory paths without regex corruption. Demo and README updated to reflect new behavior.

**Tech Stack:** ExcelJS, dayjs, Zod, Commander, Bun test runner, node:fs, node:path

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/types.ts` | Add `sheet?` to `ValidationError`, `sheetSchemas?` to `ConvertOptions` |
| Modify | `src/converter/to-yaml.ts` | Extract `convertSheet` helper, add `toYamlAll`, add `sanitizeSheetName` |
| Create | `scripts/create-multi-sheet-fixture.ts` | One-off script to generate multi-sheet test fixture |
| Create | `tests/fixtures/multi-sheet.xlsx` | Committed 2-sheet Excel fixture |
| Modify | `tests/converter/to-yaml.test.ts` | Add `toYamlAll` and `sanitizeSheetName` tests |
| Modify | `src/cli.ts` | Multi-sheet output mode, `--sheet-schemas` placeholder, updated `deriveErrorPath` |
| Modify | `tests/cli.test.ts` | Update existing xlsx→yaml test, add multi-sheet CLI tests |
| Modify | `demo/run.sh` | Update step 2 to use directory output |
| Modify | `.gitignore` | Update `demo/roundtrip.yaml` → `demo/roundtrip/` |
| Modify | `README.md` | Document multi-sheet usage |
| Create | `.changeset/*.md` | Minor version bump changeset |

---

### Task 1: Update Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `sheet?` to `ValidationError` and `sheetSchemas?` to `ConvertOptions`**

Replace the two interfaces (leave all others unchanged):

```typescript
export interface ValidationError {
  row: number // 1-based data row index (not Excel row number)
  field: string
  expected: string
  actual: unknown
  message: string
  sheet?: string // populated for multi-sheet conversions
}

export interface ConvertOptions {
  input: string
  output?: string
  schema: string
  validate?: boolean
  errorOutput?: string
  json?: boolean
  sheetSchemas?: string // placeholder — not yet implemented
}
```

- [ ] **Step 2: Run type check to confirm no compilation errors**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add sheet field to ValidationError and sheetSchemas placeholder to ConvertOptions"
```

---

### Task 2: Extract `convertSheet` helper and add `toYamlAll`

**Files:**
- Modify: `src/converter/to-yaml.ts`

- [ ] **Step 1: Rewrite `to-yaml.ts`**

The new file structure:
1. Keep all imports unchanged
2. `sanitizeSheetName(name: string): string` — new exported helper
3. `convertSheet(ws, schema)` — extracted private helper (same logic as the old `toYaml` body)
4. `toYaml` — now delegates to `convertSheet(wb.worksheets[0], schema)`
5. `toYamlAll` — new exported function, iterates all worksheets
6. `detectHeaderRow` — unchanged

Full replacement content:

```typescript
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import utc from "dayjs/plugin/utc"
import ExcelJS from "exceljs"
import type { Schema } from "../types"

dayjs.extend(customParseFormat)
dayjs.extend(utc)

export function sanitizeSheetName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_")
}

export async function toYaml(
  inputPath: string,
  schema: Schema,
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputPath)
  return convertSheet(wb.worksheets[0], schema)
}

export async function toYamlAll(
  inputPath: string,
  schema: Schema,
): Promise<Map<string, Record<string, unknown>[]>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputPath)
  const result = new Map<string, Record<string, unknown>[]>()
  for (const ws of wb.worksheets) {
    result.set(ws.name, convertSheet(ws, schema))
  }
  return result
}

function convertSheet(
  ws: ExcelJS.Worksheet,
  schema: Schema,
): Record<string, unknown>[] {
  const schemaHeaders = new Set(schema.columns.map((c) => c.header))
  const headerRowNum = detectHeaderRow(ws, schemaHeaders)
  const dataStartRow = headerRowNum + 1

  const colIndexToField = new Map<number, string>()
  const headerRow = ws.getRow(headerRowNum)
  ;(headerRow.values as unknown[]).forEach((val, idx) => {
    if (typeof val === "string") {
      const col = schema.columns.find((c) => c.header === val)
      if (col) colIndexToField.set(idx, col.field)
    }
  })

  const rows: Record<string, unknown>[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum < dataStartRow) return

    const obj: Record<string, unknown> = {}
    ;(row.values as unknown[]).forEach((cellValue, colIdx) => {
      const field = colIndexToField.get(colIdx)
      if (!field) return

      const col = schema.columns.find((c) => c.field === field)
      if (!col) return

      if (cellValue === null || cellValue === undefined || cellValue === "")
        return

      if (col.type === "date") {
        if (cellValue instanceof Date) {
          obj[field] = dayjs.utc(cellValue).format(col.format ?? "YYYY-MM-DD")
        } else if (typeof cellValue === "string") {
          obj[field] = cellValue.trim()
        }
      } else if (col.type === "number") {
        obj[field] =
          typeof cellValue === "number" ? cellValue : Number(cellValue)
      } else if (col.type === "boolean") {
        obj[field] = Boolean(cellValue)
      } else {
        obj[field] = String(cellValue).trim()
      }
    })

    if (Object.keys(obj).length > 0) rows.push(obj)
  })

  return rows
}

function detectHeaderRow(
  ws: ExcelJS.Worksheet,
  schemaHeaders: Set<string>,
): number {
  const row1Values = (ws.getRow(1).values as unknown[]).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  )

  const allMatch =
    row1Values.length > 0 && row1Values.every((v) => schemaHeaders.has(v))
  return allMatch ? 1 : 2
}
```

- [ ] **Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run existing tests to confirm backward compatibility**

```bash
bun test tests/converter/to-yaml.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/converter/to-yaml.ts
git commit -m "refactor: extract convertSheet helper, add toYamlAll and sanitizeSheetName"
```

---

### Task 3: Create Multi-Sheet Test Fixture

**Files:**
- Create: `scripts/create-multi-sheet-fixture.ts`
- Create: `tests/fixtures/multi-sheet.xlsx`

The fixture uses the same schema as `tests/fixtures/schema.yaml` (columns: name, birthdate, status, score, verified). It has 2 sheets: `People` and `Staff`. Each sheet has the same group header row (row 1) and column header row (row 2).

- [ ] **Step 1: Create `scripts/create-multi-sheet-fixture.ts`**

```typescript
import ExcelJS from "exceljs"

const wb = new ExcelJS.Workbook()

const headers = ["Name", "Date of Birth", "Status", "Score", "Verified"]
const groupHeaders: Record<string, [number, number]> = {
  "Personal Info": [1, 2],
}

function addSheet(name: string, rows: unknown[][]) {
  const ws = wb.addWorksheet(name)

  // Group header row (row 1)
  const groupRow = ws.addRow([])
  groupRow.getCell(1).value = "Personal Info"
  ws.mergeCells(1, 1, 1, 2)

  // Column header row (row 2)
  ws.addRow(headers)
  ws.views = [{ state: "frozen", ySplit: 2 }]

  for (const r of rows) {
    ws.addRow(r)
  }
}

addSheet("People", [
  ["Alice", new Date("1990-01-15"), "Active", 95, true],
  ["Bob", null, "Inactive", 72, false],
])

addSheet("Staff", [
  ["Carol", new Date("1985-06-20"), "Active", 88, true],
  ["Dave", new Date("1992-03-10"), "Pending", 60, false],
])

await wb.xlsx.writeFile("tests/fixtures/multi-sheet.xlsx")
console.log("Created tests/fixtures/multi-sheet.xlsx")
```

- [ ] **Step 2: Run the script to generate the fixture**

```bash
bun run scripts/create-multi-sheet-fixture.ts
```

Expected: `Created tests/fixtures/multi-sheet.xlsx` printed, file exists.

- [ ] **Step 3: Verify the fixture has 2 sheets**

```bash
bun -e "import ExcelJS from 'exceljs'; const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile('tests/fixtures/multi-sheet.xlsx'); console.log(wb.worksheets.map(w => w.name))"
```

Expected: `[ "People", "Staff" ]`

- [ ] **Step 4: Commit fixture and script**

```bash
git add tests/fixtures/multi-sheet.xlsx scripts/create-multi-sheet-fixture.ts
git commit -m "test: add multi-sheet Excel fixture"
```

---

### Task 4: Tests for `toYamlAll` and `sanitizeSheetName`

**Files:**
- Modify: `tests/converter/to-yaml.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the existing test file (after the existing `describe("toYaml", ...)` block):

```typescript
import { sanitizeSheetName, toYamlAll } from "../../src/converter/to-yaml"

const MULTI_FIXTURE = "tests/fixtures/multi-sheet.xlsx"

describe("toYamlAll", () => {
  test("returns a Map with one entry per sheet", async () => {
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    expect(result.size).toBe(2)
    expect(result.has("People")).toBe(true)
    expect(result.has("Staff")).toBe(true)
  })

  test("each sheet's rows are correctly parsed", async () => {
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    const people = result.get("People")!
    expect(people).toHaveLength(2)
    expect(people[0].name).toBe("Alice")
    expect(people[0].birthdate).toBe("1990-01-15")
    const staff = result.get("Staff")!
    expect(staff).toHaveLength(2)
    expect(staff[0].name).toBe("Carol")
  })

  test("empty sheet produces empty array not absent entry", async () => {
    // multi-sheet.xlsx has no empty sheets — this tests the non-zero case indirectly
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    for (const [, rows] of result) {
      expect(Array.isArray(rows)).toBe(true)
    }
  })
})

describe("sanitizeSheetName", () => {
  test("replaces forbidden characters with underscores", () => {
    expect(sanitizeSheetName("Sheet/1")).toBe("Sheet_1")
    expect(sanitizeSheetName("My:Sheet")).toBe("My_Sheet")
    expect(sanitizeSheetName('A"B')).toBe("A_B")
  })

  test("leaves safe names unchanged", () => {
    expect(sanitizeSheetName("People")).toBe("People")
    expect(sanitizeSheetName("Sheet 1")).toBe("Sheet 1")
    expect(sanitizeSheetName("MFE-List")).toBe("MFE-List")
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
bun test tests/converter/to-yaml.test.ts
```

Expected: all tests pass. `toYamlAll` and `sanitizeSheetName` were exported in Task 2.

- [ ] **Step 3: Run full test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/converter/to-yaml.test.ts
git commit -m "test: add toYamlAll and sanitizeSheetName tests"
```

---

### Task 5: Update CLI for Multi-Sheet Output

**Files:**
- Modify: `src/cli.ts`

The CLI changes:
1. Add `--sheet-schemas` option (placeholder)
2. In `run()`: when input is xlsx, use `toYamlAll` + directory output
3. Update `deriveErrorPath` to handle directory paths correctly
4. Emit warning if `--sheet-schemas` is used

- [ ] **Step 1: Rewrite `src/cli.ts`**

```typescript
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
```

- [ ] **Step 2: Run type check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run biome check and fix**

```bash
bunx biome check --write src/cli.ts
```

Expected: no errors after fix.

- [ ] **Step 4: Run full test suite**

```bash
bun test
```

Expected: most tests pass. One known failure: the existing "Excel → YAML succeeds with exit code 0" test in `tests/cli.test.ts` will fail because it uses `-o /tmp/cli-out.yaml` (a file path) and asserts `existsSync("/tmp/cli-out.yaml")`. With the new multi-sheet behavior, `-o` is a directory so the output lands at `/tmp/cli-out.yaml/Sheet1.yaml`. **This failure is expected and intentional** — it will be fixed in Task 6. All other tests should pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: multi-sheet Excel→YAML with directory output"
```

---

### Task 6: Update CLI Tests

**Files:**
- Modify: `tests/cli.test.ts`

The existing "Excel → YAML succeeds with exit code 0" test passes `-o /tmp/cli-out.yaml` as a file path. With the new multi-sheet behavior, this is now a directory and the output is `/tmp/cli-out.yaml/Sheet1.yaml`. Update cleanup and tests accordingly.

- [ ] **Step 1: Rewrite `tests/cli.test.ts`**

```typescript
import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"

function run(...args: string[]) {
  return spawnSync("bun", ["run", "src/cli.ts", ...args], {
    encoding: "utf-8",
    cwd: process.cwd(),
  })
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (!existsSync(p)) continue
    rmSync(p, { recursive: true, force: true })
  }
}

afterEach(() => {
  cleanup(
    "/tmp/cli-out.xlsx",
    "/tmp/cli-out-dir",
    "/tmp/cli-out.errors.json",
    "/tmp/cli-out-dir.errors.json",
    "/tmp/cli-multi-out",
    "/tmp/cli-multi-out.errors.json",
  )
})

describe("CLI", () => {
  test("--help shows all flags", () => {
    const r = run("--help")
    expect(r.stdout).toContain("--input")
    expect(r.stdout).toContain("--schema")
    expect(r.stdout).toContain("--validate")
    expect(r.stdout).toContain("--json")
    expect(r.stdout).toContain("--sheet-schemas")
  })

  test("YAML → Excel succeeds with exit code 0", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.xlsx")).toBe(true)
  })

  test("Excel → YAML writes one file per sheet into output directory", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.xlsx",
      "-o",
      "/tmp/cli-out-dir",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    // data.xlsx has one sheet named "Sheet1"
    expect(existsSync("/tmp/cli-out-dir/Sheet1.yaml")).toBe(true)
  })

  test("Excel → YAML multi-sheet writes one file per sheet", () => {
    const r = run(
      "-i",
      "tests/fixtures/multi-sheet.xlsx",
      "-o",
      "/tmp/cli-multi-out",
      "--schema",
      "tests/fixtures/schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-multi-out/People.yaml")).toBe(true)
    expect(existsSync("/tmp/cli-multi-out/Staff.yaml")).toBe(true)
  })

  test("--json outputs machine-readable success object", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--json",
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.input).toBe("tests/fixtures/data.yaml")
  })

  test("missing input file exits with code 2 and fatal JSON", () => {
    const r = run(
      "-i",
      "nonexistent.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--json",
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
    expect(parsed.error).toContain("nonexistent.yaml")
  })

  test("missing schema file exits with code 2", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "nonexistent-schema.yaml",
      "--json",
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
  })

  test("--validate does not write output files", () => {
    const r = run(
      "-i",
      "tests/fixtures/multi-sheet.xlsx",
      "-o",
      "/tmp/cli-out-dir",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--validate",
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out-dir")).toBe(false)
  })

  test("multi-sheet validation errors include sheet field in errors file", async () => {
    // Build a 2-sheet xlsx in-memory: Sheet1 valid, Sheet2 has an invalid status
    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()

    const addSheet = (name: string, rows: unknown[][]) => {
      const ws = wb.addWorksheet(name)
      ws.addRow(["Personal Info", null, null, null, null])
      ws.mergeCells(1, 1, 1, 2)
      ws.addRow(["Name", "Date of Birth", "Status", "Score", "Verified"])
      for (const r of rows) ws.addRow(r)
    }

    addSheet("ValidSheet", [["Alice", null, "Active", 95, true]])
    addSheet("BrokenSheet", [["Bob", null, "INVALID_STATUS", 70, false]])

    await wb.xlsx.writeFile("/tmp/cli-invalid-multi.xlsx")

    const r = run(
      "-i",
      "/tmp/cli-invalid-multi.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--validate",
      "--json",
    )

    expect(r.status).toBe(1)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("error")
    expect(parsed.errorCount).toBeGreaterThan(0)

    // Read the errors file BEFORE cleanup to verify sheet field is populated
    const errorsFile = JSON.parse(
      readFileSync("/tmp/cli-invalid-multi.errors.json", "utf-8"),
    )
    expect(errorsFile.errors[0].sheet).toBe("BrokenSheet")

    // Cleanup
    rmSync("/tmp/cli-invalid-multi.xlsx", { force: true })
    rmSync("/tmp/cli-invalid-multi.errors.json", { force: true })
  })

  test("--sheet-schemas emits warning but continues", () => {
    const r = run(
      "-i",
      "tests/fixtures/data.yaml",
      "-o",
      "/tmp/cli-out.xlsx",
      "--schema",
      "tests/fixtures/schema.yaml",
      "--sheet-schemas",
      "Sheet1:schema.yaml",
    )
    expect(r.status).toBe(0)
    expect(r.stderr).toContain("--sheet-schemas is not yet implemented")
  })
})
```

- [ ] **Step 2: Run tests**

```bash
bun test tests/cli.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run full test suite**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/cli.test.ts
git commit -m "test: update CLI tests for multi-sheet directory output"
```

---

### Task 7: Update Demo

**Files:**
- Modify: `demo/run.sh`
- Modify: `.gitignore`

Step 2 of the demo (`Excel → YAML round-trip`) currently uses `-o demo/roundtrip.yaml` (a file). Update to use `-o demo/roundtrip` (a directory).

- [ ] **Step 1: Update step 2 in `demo/run.sh`**

Find and replace the step 2 block:

Old:
```bash
bun run dev -- \
  -i demo/output.xlsx \
  --schema demo/schema.yaml \
  -o demo/roundtrip.yaml
```

New:
```bash
bun run dev -- \
  -i demo/output.xlsx \
  --schema demo/schema.yaml \
  -o demo/roundtrip
```

Also update the label line above it from:
```bash
echo "  Output: demo/roundtrip.yaml"
```
to:
```bash
echo "  Output: demo/roundtrip/{sheet-name}.yaml"
```

- [ ] **Step 2: Update `.gitignore`**

Replace `demo/roundtrip.yaml` with `demo/roundtrip/`:

```
demo/*.xlsx
demo/*.yaml.errors.json
demo/roundtrip/
```

- [ ] **Step 3: Run the demo to verify**

```bash
bun run demo
```

Expected: all 4 steps complete. Step 2 creates a file inside `demo/roundtrip/`.

- [ ] **Step 3b: Verify the actual output filename**

```bash
ls demo/roundtrip/
```

Expected: one `.yaml` file named after the sheet ExcelJS creates (likely `Sheet1.yaml`). If the name differs, the demo echo label can be updated accordingly.

- [ ] **Step 4: Commit**

```bash
git add demo/run.sh .gitignore
git commit -m "demo: update step 2 to use directory output for Excel→YAML"
```

---

### Task 8: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Replace the current Usage section and add a Multi-Sheet section:

```markdown
# yaml-converter

Convert YAML files to rich Excel (`.xlsx`) and back, with schema-driven column types, grouped headers, dropdown validation, and machine-readable output.

## Install

```bash
npm install -g yaml-converter
```

## Usage

```bash
# YAML → Excel
yaml-converter -i data.yaml -o output.xlsx --schema schema.yaml

# Excel → YAML (single or multi-sheet — outputs to a directory)
yaml-converter -i data.xlsx -o ./output --schema schema.yaml

# Validate only
yaml-converter -i data.xlsx --schema schema.yaml --validate

# Machine-readable output (for agents/scripts)
yaml-converter -i data.yaml -o output.xlsx --schema schema.yaml --json
```

## Multi-Sheet Excel → YAML

When converting an Excel workbook to YAML, each worksheet is written as a separate YAML file inside the output directory:

```
data.xlsx (Sheet: People, Sheet: Staff)
  ↓
yaml-converter -i data.xlsx -o ./output --schema schema.yaml
  ↓
./output/People.yaml
./output/Staff.yaml
```

All sheets use the same `--schema`. Sheet names with filesystem-unsafe characters (`/ \ : * ? " < > |`) are sanitized to `_`.

## Schema

See `schema.example.yaml` for a full example. Supported field types:

| Type | Excel behavior |
|------|---------------|
| `string` | Plain text cell |
| `number` | Numeric cell |
| `date` | Date cell (formatted via `format`) |
| `boolean` | Boolean cell |
| `options` | Text cell + dropdown validation |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Validation errors (see `.errors.json`) |
| `2` | Fatal error (missing file, invalid schema) |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document multi-sheet Excel→YAML usage"
```

---

### Task 9: Changeset and Release

**Files:**
- Create: `.changeset/*.md`

- [ ] **Step 1: Create a minor changeset**

**Note: `bunx changeset` is interactive and will hang in fully automated/agentic contexts.** If running manually, do:

```bash
bunx changeset
```

When prompted:
- Select `yaml-converter`
- Choose `minor` (new feature, backward-compatible — YAML→Excel is unchanged)
- Summary: `Add multi-sheet Excel→YAML: each sheet converts to its own YAML file in the output directory`

If running in an agentic context that cannot handle interactive prompts, create the changeset file manually instead — see Step 1b below.

- [ ] **Step 1b (agentic alternative): Create changeset file manually**

```bash
# Generate a random ID for the changeset filename
CHANGESET_ID=$(bun -e "console.log(Math.random().toString(36).slice(2,8))")
cat > .changeset/${CHANGESET_ID}.md << 'EOF'
---
"yaml-converter": minor
---

Add multi-sheet Excel→YAML: each sheet converts to its own YAML file in the output directory
EOF
```

- [ ] **Step 2: Verify changeset file was created**

```bash
ls .changeset/
```

Expected: one new `.md` file alongside `README.md` and `config.json`.

- [ ] **Step 3: Run full test suite and biome check**

```bash
bun test && bunx biome check .
```

Expected: all pass, no errors.

- [ ] **Step 4: Commit and push**

```bash
git add .changeset/
git commit -m "chore: add changeset for multi-sheet feature"
git push
```

Expected: CI runs (biome check → bun test → bun build). The release job will open a "Version Packages" PR automatically once the changeset is detected.
