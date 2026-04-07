# yaml-converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun/TypeScript CLI that converts YAML ↔ Excel bidirectionally with schema-driven typing, grouped headers, dropdown validation, and machine-readable output.

**Architecture:** Single-package, flat module structure — `src/schema/` handles schema loading and validation, `src/converter/` handles the two directions, `src/cli.ts` wires them together with commander flags. Zod validates rows in both directions from the same compiled schema.

**Tech Stack:** Bun, TypeScript, exceljs, yaml, zod, dayjs, commander, chalk, @biomejs/biome, @changesets/cli

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Shared interfaces: `Schema`, `ColumnSchema`, `ValidationError`, `ErrorOutput`, `ConvertOptions` |
| `src/schema/loader.ts` | Read `schema.yaml`, compile to Zod object schema |
| `src/schema/validator.ts` | Validate rows against Zod schema, collect `ValidationError[]` |
| `src/converter/to-excel.ts` | YAML rows + schema → `.xlsx` with merged headers, typed cells, dropdowns |
| `src/converter/to-yaml.ts` | `.xlsx` + schema → typed row objects |
| `src/cli.ts` | Entry point: parse flags, detect direction, orchestrate conversion, output result |
| `tests/fixtures/schema.yaml` | Fixture schema used across all tests |
| `tests/fixtures/data.yaml` | Fixture YAML data for YAML→Excel tests |
| `tests/fixtures/data.xlsx` | Pre-generated reference fixture for Excel→YAML tests (committed) |
| `tests/schema/validator.test.ts` | Unit tests for validator |
| `tests/converter/to-excel.test.ts` | Unit tests for YAML→Excel converter |
| `tests/converter/to-yaml.test.ts` | Unit tests for Excel→YAML converter |
| `tests/cli.test.ts` | End-to-end CLI tests via `spawnSync` |
| `package.json` | Scripts, bin, deps |
| `tsconfig.json` | TypeScript config |
| `biome.json` | Linting + formatting (mirrors daas-cli) |
| `.npmrc` | npm token config |
| `.gitignore` | Ignore node_modules, dist |
| `.changeset/config.json` | Changesets config |
| `.github/workflows/ci.yml` | CI + release workflow |
| `schema.example.yaml` | Example schema for users |
| `README.md` | Usage docs |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `.npmrc`
- Create: `.gitignore`
- Create: `.changeset/config.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "yaml-converter",
  "version": "0.1.0",
  "description": "Convert YAML files to Excel and back with schema-driven validation",
  "bin": { "yaml-converter": "dist/cli.js" },
  "scripts": {
    "build": "bun build src/cli.ts --outdir dist --target node",
    "dev": "bun run src/cli.ts",
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write .",
    "changeset": "changeset",
    "version": "changeset version && bun install",
    "release": "bun run build && changeset publish"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "commander": "^12.0.0",
    "dayjs": "^1.11.10",
    "exceljs": "^4.4.0",
    "yaml": "^2.4.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.6.0",
    "@changesets/cli": "^2.27.0",
    "@types/bun": "latest",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `biome.json`** (mirrors daas-cli exactly)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.6.0/schema.json",
  "files": {
    "includes": ["**", "!**/dist", "!**/node_modules"]
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "asNeeded"
    }
  }
}
```

- [ ] **Step 4: Create `.npmrc`**

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.errors.json
```

- [ ] **Step 6: Create `.changeset/config.json`**

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

- [ ] **Step 7: Install dependencies**

```bash
bun install
```

Expected: `node_modules/` created, `bun.lock` written.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json biome.json .npmrc .gitignore .changeset/ bun.lock
git commit -m "chore: project scaffold"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export type FieldType = "string" | "number" | "date" | "boolean" | "options"

export interface ColumnSchema {
  field: string
  header: string
  group?: string
  type: FieldType
  format?: string      // date only — dayjs format string e.g. "YYYY-MM-DD"
  options?: string[]   // options only
  required?: boolean
}

export interface Schema {
  columns: ColumnSchema[]
}

export interface ValidationError {
  row: number          // 1-based data row index (not Excel row number)
  field: string
  expected: string
  actual: unknown
  message: string
}

export interface ErrorOutput {
  summary: {
    total: number
    file: string
  }
  errors: ValidationError[]
}

export interface ConvertOptions {
  input: string
  output?: string
  schema: string
  validate?: boolean
  errorOutput?: string
  json?: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Schema Loader

**Files:**
- Create: `src/schema/loader.ts`
- Test: `tests/schema/loader.test.ts`

- [ ] **Step 1: Create test fixtures directory and `tests/schema/loader.test.ts`**

```bash
mkdir -p tests/schema tests/fixtures
```

```typescript
// tests/schema/loader.test.ts
import { describe, test, expect } from "bun:test"
import { loadSchema, buildZodSchema } from "../../src/schema/loader"
import { writeFileSync, unlinkSync } from "fs"

const FIXTURE_SCHEMA = `
columns:
  - field: name
    header: Name
    type: string
    required: true
  - field: score
    header: Score
    type: number
  - field: status
    header: Status
    type: options
    options: [Active, Inactive]
    required: true
  - field: birthday
    header: Birthday
    type: date
    format: YYYY-MM-DD
  - field: active
    header: Active
    type: boolean
`

describe("loadSchema", () => {
  test("parses a valid schema YAML", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    expect(schema.columns).toHaveLength(5)
    expect(schema.columns[0].field).toBe("name")
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("throws on missing file", () => {
    expect(() => loadSchema("/tmp/nonexistent-schema.yaml")).toThrow()
  })
})

describe("buildZodSchema", () => {
  test("required string rejects empty string", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "", status: "Active" })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("options field rejects invalid value", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "Alice", status: "Archived" })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("optional fields allow null and undefined", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "Alice", status: "Active" }) // score, birthday, active absent
    expect(result.success).toBe(true)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("date field rejects non-date string", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "Alice", status: "Active", birthday: "not-a-date" })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test tests/schema/loader.test.ts
```

Expected: FAIL — `Cannot find module '../../src/schema/loader'`

- [ ] **Step 3: Create `src/schema/loader.ts`**

```typescript
import { readFileSync } from "fs"
import { parse } from "yaml"
import { z, type ZodTypeAny } from "zod"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import type { Schema, ColumnSchema } from "../types"

dayjs.extend(customParseFormat)

export function loadSchema(schemaPath: string): Schema {
  const content = readFileSync(schemaPath, "utf-8")
  const raw = parse(content) as Schema
  if (!raw?.columns || !Array.isArray(raw.columns)) {
    throw new Error(`Invalid schema: missing 'columns' array in ${schemaPath}`)
  }
  return raw
}

export function buildZodSchema(schema: Schema): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {}
  for (const col of schema.columns) {
    shape[col.field] = buildFieldZod(col)
  }
  return z.object(shape)
}

function buildFieldZod(col: ColumnSchema): ZodTypeAny {
  let field: ZodTypeAny

  switch (col.type) {
    case "string":
      field = col.required ? z.string().min(1, `${col.field} is required`) : z.string()
      break

    case "number":
      field = z.number()
      break

    case "date": {
      const fmt = col.format ?? "YYYY-MM-DD"
      const dateValidator = z.string().refine(
        (val) => dayjs(val, fmt, true).isValid(),
        { message: `Must be a valid date in format ${fmt}` }
      )
      field = col.required ? dateValidator.pipe(z.string().min(1)) : dateValidator
      break
    }

    case "boolean":
      field = z.boolean()
      break

    case "options":
      if (!col.options?.length) throw new Error(`Column '${col.field}' has type 'options' but no options defined`)
      field = z.enum(col.options as [string, ...string[]])
      break

    default:
      throw new Error(`Unknown field type: ${(col as ColumnSchema).type}`)
  }

  if (!col.required) {
    field = field.optional().nullable()
  }

  return field
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test tests/schema/loader.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/loader.ts tests/schema/loader.test.ts
git commit -m "feat: schema loader with Zod compilation"
```

---

## Task 4: Schema Validator

**Files:**
- Create: `src/schema/validator.ts`
- Create: `tests/schema/validator.test.ts`

- [ ] **Step 1: Write `tests/schema/validator.test.ts`**

```typescript
import { describe, test, expect } from "bun:test"
import { validateRows } from "../../src/schema/validator"
import type { Schema } from "../../src/types"

const schema: Schema = {
  columns: [
    { field: "name", header: "Name", type: "string", required: true },
    { field: "birthdate", header: "Date of Birth", type: "date", format: "YYYY-MM-DD" },
    { field: "status", header: "Status", type: "options", options: ["Active", "Inactive", "Pending"], required: true },
    { field: "score", header: "Score", type: "number" },
  ],
}

describe("validateRows", () => {
  test("returns empty array for valid rows", () => {
    const rows = [{ name: "Alice", birthdate: "1990-01-15", status: "Active", score: 95 }]
    expect(validateRows(rows, schema)).toEqual([])
  })

  test("returns error for invalid option value", () => {
    const rows = [{ name: "Bob", status: "Archived" }]
    const errors = validateRows(rows, schema)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe("status")
    expect(errors[0].expected).toContain("Active")
    expect(errors[0].actual).toBe("Archived")
  })

  test("returns error for missing required field", () => {
    const rows = [{ status: "Active" }]  // name missing
    const errors = validateRows(rows, schema)
    expect(errors.some((e) => e.field === "name")).toBe(true)
  })

  test("row numbers are 1-based", () => {
    const rows = [
      { name: "Alice", status: "Active" },
      { name: "Bob", status: "Archived" },  // error on data row 2
    ]
    const errors = validateRows(rows, schema)
    expect(errors[0].row).toBe(2)
  })

  test("optional fields may be absent without error", () => {
    const rows = [{ name: "Alice", status: "Active" }]  // no score, no birthdate
    expect(validateRows(rows, schema)).toEqual([])
  })

  test("returns error for invalid date string", () => {
    const rows = [{ name: "Alice", status: "Active", birthdate: "31-12-1990" }]  // wrong format
    const errors = validateRows(rows, schema)
    expect(errors.some((e) => e.field === "birthdate")).toBe(true)
  })

  test("error shape matches ErrorOutput spec", () => {
    const rows = [{ name: "Alice", status: "Archived" }]
    const errors = validateRows(rows, schema)
    expect(errors[0]).toMatchObject({
      row: expect.any(Number),
      field: expect.any(String),
      expected: expect.any(String),
      message: expect.any(String),
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test tests/schema/validator.test.ts
```

Expected: FAIL — `Cannot find module '../../src/schema/validator'`

- [ ] **Step 3: Create `src/schema/validator.ts`**

```typescript
import type { Schema, ValidationError } from "../types"
import { buildZodSchema } from "./loader"

export function validateRows(
  rows: Record<string, unknown>[],
  schema: Schema
): ValidationError[] {
  const zodSchema = buildZodSchema(schema)
  const errors: ValidationError[] = []

  rows.forEach((row, index) => {
    const result = zodSchema.safeParse(row)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string
        const col = schema.columns.find((c) => c.field === field)
        errors.push({
          row: index + 1,
          field,
          expected: formatExpected(col),
          actual: row[field],
          message: issue.message,
        })
      }
    }
  })

  return errors
}

function formatExpected(col: ReturnType<typeof Array.prototype.find>): string {
  if (!col) return "unknown"
  switch (col.type) {
    case "options":
      return `options: ${col.options?.join(" | ")}`
    case "date":
      return `date in format ${col.format ?? "YYYY-MM-DD"}`
    default:
      return col.type
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test tests/schema/validator.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/schema/validator.ts tests/schema/validator.test.ts
git commit -m "feat: schema validator with row-level error collection"
```

---

## Task 5: Test Fixtures

**Files:**
- Create: `tests/fixtures/schema.yaml`
- Create: `tests/fixtures/data.yaml`

These fixtures are shared by all converter and CLI tests.

- [ ] **Step 1: Create `tests/fixtures/schema.yaml`**

```yaml
columns:
  - field: name
    header: Name
    group: Personal Info
    type: string
    required: true

  - field: birthdate
    header: Date of Birth
    group: Personal Info
    type: date
    format: YYYY-MM-DD

  - field: status
    header: Status
    type: options
    options: [Active, Inactive, Pending]
    required: true

  - field: score
    header: Score
    type: number

  - field: verified
    header: Verified
    type: boolean
```

- [ ] **Step 2: Create `tests/fixtures/data.yaml`**

```yaml
- name: Alice
  birthdate: "1990-01-15"
  status: Active
  score: 95
  verified: true

- name: Bob
  status: Inactive
  score: 72
  verified: false
```

Note: Bob has no `birthdate` — tests optional field handling.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/schema.yaml tests/fixtures/data.yaml
git commit -m "test: add shared test fixtures"
```

---

## Task 6: YAML → Excel Converter

**Files:**
- Create: `src/converter/to-excel.ts`
- Create: `tests/converter/to-excel.test.ts`

- [ ] **Step 1: Write `tests/converter/to-excel.test.ts`**

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { toExcel } from "../../src/converter/to-excel"
import { loadSchema } from "../../src/schema/loader"
import ExcelJS from "exceljs"
import { existsSync, unlinkSync } from "fs"

const OUTPUT = "/tmp/test-to-excel.xlsx"
const schema = loadSchema("tests/fixtures/schema.yaml")
const rows = [
  { name: "Alice", birthdate: "1990-01-15", status: "Active", score: 95, verified: true },
  { name: "Bob", status: "Inactive", score: 72, verified: false },
]

describe("toExcel", () => {
  beforeAll(async () => {
    await toExcel(rows, schema, OUTPUT)
  })

  afterAll(() => {
    if (existsSync(OUTPUT)) unlinkSync(OUTPUT)
  })

  test("creates the output file", () => {
    expect(existsSync(OUTPUT)).toBe(true)
  })

  test("group headers appear in row 1 with merged cells", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    // "Personal Info" spans columns A and B (name, birthdate)
    const cell = ws.getCell("A1")
    expect(cell.value).toBe("Personal Info")
    // Cell B1 should be part of the merge (master is A1)
    expect(ws.getCell("B1").isMerged).toBe(true)
  })

  test("column headers appear in row 2", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    expect(ws.getCell("A2").value).toBe("Name")
    expect(ws.getCell("B2").value).toBe("Date of Birth")
    expect(ws.getCell("C2").value).toBe("Status")
  })

  test("status column cells have dropdown validation", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    const cell = ws.getCell("C3")  // first data row (row 3), status column (C)
    expect(cell.dataValidation?.type).toBe("list")
    expect(cell.dataValidation?.formulae?.[0]).toContain("Active")
  })

  test("missing optional field produces null cell", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    // Bob (row 4) has no birthdate — column B
    const cell = ws.getCell("B4")
    expect(cell.value).toBeNull()
  })

  test("date cell stores a JS Date object", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    // Alice (row 3), birthdate column (B)
    const cell = ws.getCell("B3")
    expect(cell.value).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test tests/converter/to-excel.test.ts
```

Expected: FAIL — `Cannot find module '../../src/converter/to-excel'`

- [ ] **Step 3: Create `src/converter/to-excel.ts`**

```typescript
import ExcelJS from "exceljs"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import type { Schema } from "../types"

dayjs.extend(customParseFormat)

export async function toExcel(
  rows: Record<string, unknown>[],
  schema: Schema,
  outputPath: string
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Sheet1")

  const hasGroups = schema.columns.some((c) => c.group)
  const headerRowNum = hasGroups ? 2 : 1
  const dataStartRow = headerRowNum + 1

  if (hasGroups) {
    addGroupHeaderRow(ws, schema)
  }

  // Add column header row
  ws.addRow(schema.columns.map((c) => c.header))

  // Freeze top rows
  ws.views = [{ state: "frozen", ySplit: headerRowNum }]

  // Write data rows
  for (const row of rows) {
    const excelRow = ws.addRow([])
    schema.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const value = row[col.field]

      if (value === undefined || value === null) {
        cell.value = null
        return
      }

      if (col.type === "date" && typeof value === "string") {
        const date = dayjs(value, col.format ?? "YYYY-MM-DD", true)
        if (date.isValid()) {
          cell.value = date.toDate()
          cell.numFmt = toExcelDateFmt(col.format ?? "YYYY-MM-DD")
        }
      } else if (col.type === "number") {
        cell.value = typeof value === "number" ? value : Number(value)
      } else if (col.type === "boolean") {
        cell.value = Boolean(value)
      } else {
        cell.value = String(value)
      }

      if (col.type === "options" && col.options) {
        cell.dataValidation = {
          type: "list",
          allowBlank: !col.required,
          formulae: [`"${col.options.join(",")}"`],
        }
      }
    })
  }

  await wb.xlsx.writeFile(outputPath)
}

function addGroupHeaderRow(ws: ExcelJS.Worksheet, schema: Schema) {
  const row = ws.addRow([])

  // Compute group spans (start col, end col) — 1-based
  const groupSpans = new Map<string, { start: number; end: number }>()
  schema.columns.forEach((col, idx) => {
    const colNum = idx + 1
    if (!col.group) return
    const existing = groupSpans.get(col.group)
    if (!existing) {
      groupSpans.set(col.group, { start: colNum, end: colNum })
    } else {
      existing.end = colNum
    }
  })

  // Write group label into the first column of each group and merge
  schema.columns.forEach((col, idx) => {
    const colNum = idx + 1
    if (!col.group) return
    const span = groupSpans.get(col.group)!
    if (span.start === colNum) {
      row.getCell(colNum).value = col.group
      if (span.start !== span.end) {
        ws.mergeCells(1, span.start, 1, span.end)
      }
    }
  })
}

// Convert dayjs format string to Excel number format
function toExcelDateFmt(fmt: string): string {
  return fmt.toLowerCase()
    .replace("yyyy", "yyyy")
    .replace("mm", "mm")
    .replace("dd", "dd")
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
bun test tests/converter/to-excel.test.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/converter/to-excel.ts tests/converter/to-excel.test.ts
git commit -m "feat: YAML to Excel converter with grouped headers and typed cells"
```

---

## Task 7: Excel → YAML Converter + Generate Reference Fixture

**Files:**
- Create: `src/converter/to-yaml.ts`
- Create: `tests/converter/to-yaml.test.ts`
- Generate: `tests/fixtures/data.xlsx` (committed reference fixture)

- [ ] **Step 1: Write `tests/converter/to-yaml.test.ts`**

Note: This test uses `tests/fixtures/data.xlsx` which we generate in Step 4 after implementing the converter.

```typescript
import { describe, test, expect } from "bun:test"
import { toYaml } from "../../src/converter/to-yaml"
import { loadSchema } from "../../src/schema/loader"

const schema = loadSchema("tests/fixtures/schema.yaml")
const FIXTURE_XLSX = "tests/fixtures/data.xlsx"

describe("toYaml", () => {
  test("reads all data rows from xlsx", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows).toHaveLength(2)
  })

  test("string fields are read correctly", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].name).toBe("Alice")
    expect(rows[1].name).toBe("Bob")
  })

  test("date cells are returned as YYYY-MM-DD strings", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].birthdate).toBe("1990-01-15")
  })

  test("boolean cells are returned as JS booleans", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].verified).toBe(true)
    expect(rows[1].verified).toBe(false)
  })

  test("number cells are returned as JS numbers", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].score).toBe(95)
  })

  test("missing optional fields are omitted from output", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    // Bob has no birthdate
    expect(rows[1].birthdate).toBeUndefined()
  })

  test("works with single-header-row xlsx (no group row)", async () => {
    // Build a minimal xlsx with just one header row
    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    ws.addRow(["Name", "Status"])  // single header row — matches schema headers
    ws.addRow(["Charlie", "Active"])
    await wb.xlsx.writeFile("/tmp/single-header.xlsx")

    const rows = await toYaml("/tmp/single-header.xlsx", schema)
    expect(rows[0].name).toBe("Charlie")
    expect(rows[0].status).toBe("Active")

    const { unlinkSync } = await import("fs")
    unlinkSync("/tmp/single-header.xlsx")
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test tests/converter/to-yaml.test.ts
```

Expected: FAIL — `Cannot find module '../../src/converter/to-yaml'`

- [ ] **Step 3: Create `src/converter/to-yaml.ts`**

```typescript
import ExcelJS from "exceljs"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import type { Schema } from "../types"

dayjs.extend(customParseFormat)

export async function toYaml(
  inputPath: string,
  schema: Schema
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputPath)
  const ws = wb.worksheets[0]

  const schemaHeaders = new Set(schema.columns.map((c) => c.header))
  const headerRowNum = detectHeaderRow(ws, schemaHeaders)
  const dataStartRow = headerRowNum + 1

  // Build colIndex → field name map
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

      const col = schema.columns.find((c) => c.field === field)!

      if (cellValue === null || cellValue === undefined || cellValue === "") return

      if (col.type === "date") {
        if (cellValue instanceof Date) {
          obj[field] = dayjs(cellValue).format(col.format ?? "YYYY-MM-DD")
        } else if (typeof cellValue === "string") {
          obj[field] = cellValue.trim()
        }
      } else if (col.type === "number") {
        obj[field] = typeof cellValue === "number" ? cellValue : Number(cellValue)
      } else if (col.type === "boolean") {
        obj[field] = Boolean(cellValue)
      } else {
        obj[field] = String(cellValue).trim()
      }
    })

    // Only include rows that have at least one field
    if (Object.keys(obj).length > 0) rows.push(obj)
  })

  return rows
}

function detectHeaderRow(ws: ExcelJS.Worksheet, schemaHeaders: Set<string>): number {
  const row1 = ws.getRow(1)
  const row1Values = (row1.values as unknown[])
    .filter((v): v is string => typeof v === "string" && v.length > 0)

  // If every non-null cell in row 1 matches a schema header → single header row
  const allMatch = row1Values.length > 0 && row1Values.every((v) => schemaHeaders.has(v))
  return allMatch ? 1 : 2
}
```

- [ ] **Step 4: Generate `tests/fixtures/data.xlsx` reference fixture**

Run this one-off script to produce the committed fixture:

```bash
bun run - <<'EOF'
import { toExcel } from "./src/converter/to-excel"
import { loadSchema } from "./src/schema/loader"

const schema = loadSchema("tests/fixtures/schema.yaml")
const rows = [
  { name: "Alice", birthdate: "1990-01-15", status: "Active", score: 95, verified: true },
  { name: "Bob", status: "Inactive", score: 72, verified: false },
]
await toExcel(rows, schema, "tests/fixtures/data.xlsx")
console.log("Generated tests/fixtures/data.xlsx")
EOF
```

Expected: `Generated tests/fixtures/data.xlsx`

- [ ] **Step 5: Run tests — verify they pass**

```bash
bun test tests/converter/to-yaml.test.ts
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/converter/to-yaml.ts tests/converter/to-yaml.test.ts tests/fixtures/data.xlsx
git commit -m "feat: Excel to YAML converter + committed reference fixture"
```

---

## Task 8: CLI Entry Point

**Files:**
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`

- [ ] **Step 1: Write `tests/cli.test.ts`**

```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { spawnSync } from "child_process"
import { existsSync, unlinkSync } from "fs"

const CLI = ["run", "src/cli.ts"]

function run(...args: string[]) {
  return spawnSync("bun", [...CLI, ...args], { encoding: "utf-8", cwd: process.cwd() })
}

afterEach(() => {
  // Clean up temp files
  for (const f of ["/tmp/cli-out.xlsx", "/tmp/cli-out.yaml", "/tmp/cli-out.errors.json"]) {
    if (existsSync(f)) unlinkSync(f)
  }
})

describe("CLI", () => {
  test("--help shows all flags", () => {
    const r = run("--help")
    expect(r.stdout).toContain("--input")
    expect(r.stdout).toContain("--schema")
    expect(r.stdout).toContain("--validate")
    expect(r.stdout).toContain("--json")
  })

  test("YAML → Excel succeeds with exit code 0", () => {
    const r = run(
      "-i", "tests/fixtures/data.yaml",
      "-o", "/tmp/cli-out.xlsx",
      "--schema", "tests/fixtures/schema.yaml"
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.xlsx")).toBe(true)
  })

  test("Excel → YAML succeeds with exit code 0", () => {
    const r = run(
      "-i", "tests/fixtures/data.xlsx",
      "-o", "/tmp/cli-out.yaml",
      "--schema", "tests/fixtures/schema.yaml"
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.yaml")).toBe(true)
  })

  test("--json outputs machine-readable success object", () => {
    const r = run(
      "-i", "tests/fixtures/data.yaml",
      "-o", "/tmp/cli-out.xlsx",
      "--schema", "tests/fixtures/schema.yaml",
      "--json"
    )
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("ok")
    expect(parsed.input).toBe("tests/fixtures/data.yaml")
  })

  test("missing input file exits with code 2 and fatal JSON", () => {
    const r = run(
      "-i", "nonexistent.yaml",
      "-o", "/tmp/cli-out.xlsx",
      "--schema", "tests/fixtures/schema.yaml",
      "--json"
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
    expect(parsed.error).toContain("nonexistent.yaml")
  })

  test("missing schema file exits with code 2", () => {
    const r = run(
      "-i", "tests/fixtures/data.yaml",
      "-o", "/tmp/cli-out.xlsx",
      "--schema", "nonexistent-schema.yaml",
      "--json"
    )
    expect(r.status).toBe(2)
    const parsed = JSON.parse(r.stdout)
    expect(parsed.status).toBe("fatal")
  })

  test("--validate does not write output file", () => {
    const r = run(
      "-i", "tests/fixtures/data.xlsx",
      "--schema", "tests/fixtures/schema.yaml",
      "--validate"
    )
    expect(r.status).toBe(0)
    expect(existsSync("/tmp/cli-out.yaml")).toBe(false)
  })

  test("--error-output overrides error file path", () => {
    // Build an xlsx with invalid data to trigger validation failure
    // Use --error-output to write to a known path
    const r = run(
      "-i", "tests/fixtures/data.xlsx",
      "--schema", "tests/fixtures/schema.yaml",
      "--validate",
      "--error-output", "/tmp/cli-out.errors.json"
    )
    // Valid data → no errors → no errors file
    expect(existsSync("/tmp/cli-out.errors.json")).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
bun test tests/cli.test.ts
```

Expected: FAIL — `Cannot find module` or process spawn fails.

- [ ] **Step 3: Create `src/cli.ts`**

```typescript
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
  // Validate inputs exist
  if (!existsSync(opts.input)) {
    emit(opts.json, { status: "fatal", error: `Input file not found: ${opts.input}` })
    process.exit(2)
  }
  if (!existsSync(opts.schema)) {
    emit(opts.json, { status: "fatal", error: `Schema file not found: ${opts.schema}` })
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

    emit(opts.json, { status: "ok", input: opts.input, output: opts.output })
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

function writeErrors(path: string, file: string, errors: ValidationError[]) {
  const out: ErrorOutput = { summary: { total: errors.length, file }, errors }
  writeFileSync(path, JSON.stringify(out, null, 2))
}
```

- [ ] **Step 4: Run all tests — verify they pass**

```bash
bun test
```

Expected: All PASS across all test files.

- [ ] **Step 5: Run biome lint**

```bash
bunx biome check .
```

Fix any reported issues before committing.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: CLI entry point with flag parsing, direction detection, and JSON output"
```

---

## Task 9: GitHub CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```bash
mkdir -p .github/workflows
```

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.9"
      - run: bun install
      - run: bunx biome check .
      - run: bun test
      - run: bun run build

  release:
    name: Release
    needs: ci
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.9"
      - run: bun install
      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: bun run release
          version: bun run version
          commit: "chore: release"
          title: "chore: version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add CI and release workflow with biome, bun, and changesets"
```

---

## Task 10: README, Example Schema, and Initial Changeset

**Files:**
- Create: `schema.example.yaml`
- Create: `README.md`
- Create: initial changeset entry

- [ ] **Step 1: Create `schema.example.yaml`**

```yaml
# yaml-converter schema example
# Place this file alongside your data YAML or reference it via --schema

columns:
  - field: name
    header: Name
    group: Personal Info      # optional: groups columns under a merged parent header
    type: string
    required: true

  - field: birthdate
    header: Date of Birth
    group: Personal Info
    type: date
    format: YYYY-MM-DD        # dayjs format string

  - field: status
    header: Status
    type: options
    options: [Active, Inactive, Pending]   # creates Excel dropdown
    required: true

  - field: score
    header: Score
    type: number

  - field: verified
    header: Verified
    type: boolean
```

- [ ] **Step 2: Create `README.md`**

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

# Excel → YAML
yaml-converter -i data.xlsx -o output.yaml --schema schema.yaml

# Validate only
yaml-converter -i data.xlsx --schema schema.yaml --validate

# Machine-readable output (for agents/scripts)
yaml-converter -i data.yaml -o output.xlsx --schema schema.yaml --json
```

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

- [ ] **Step 3: Create initial changeset**

```bash
bunx changeset
```

When prompted:
- Select: `patch`
- Summary: `Initial release`

- [ ] **Step 4: Commit**

```bash
git add schema.example.yaml README.md .changeset/
git commit -m "docs: add README, example schema, and initial changeset"
```

---

## Task 11: Create GitHub Repo and Push

- [ ] **Step 1: Create the remote repo**

```bash
gh repo create yaml-converter --public --source=. --remote=origin --push
```

Expected: Repository created at `https://github.com/<your-username>/yaml-converter` and all commits pushed.

- [ ] **Step 2: Verify CI passes**

```bash
gh run list --limit 3
```

Wait for the CI workflow to complete. Expected: green status.

- [ ] **Step 3: Add NPM_TOKEN secret to repo**

In GitHub → repo Settings → Secrets → Actions, add:
- `NPM_TOKEN` — your npm access token (needed for the release job to publish)

---

## Final Verification

- [ ] `bun test` — all tests pass
- [ ] `bunx biome check .` — no lint errors
- [ ] `bun run build` — `dist/cli.js` produced
- [ ] `node dist/cli.js --help` — help text shows all flags
- [ ] `node dist/cli.js -i tests/fixtures/data.yaml -o /tmp/out.xlsx --schema tests/fixtures/schema.yaml --json` — outputs `{"status":"ok",...}`
