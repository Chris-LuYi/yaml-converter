# yaml-converter — Design Spec

**Date:** 2026-04-07
**Package:** `yaml-converter` (npm)
**CLI command:** `yaml-converter`
**Runtime:** Bun + TypeScript

---

## Overview

A Node.js CLI tool that converts YAML files to rich Excel (`.xlsx`) and back, driven by a schema file that defines column types, groupings, dropdown options, and validation rules. Bidirectional conversion with full schema validation in both directions.

---

## Project Structure

```
yaml-converter/
├── src/
│   ├── cli.ts                  # Entry point, flag parsing (commander)
│   ├── converter/
│   │   ├── to-excel.ts         # YAML → Excel
│   │   └── to-yaml.ts          # Excel → YAML
│   ├── schema/
│   │   ├── loader.ts           # Load & parse schema.yaml into Zod schema
│   │   └── validator.ts        # Validate data rows against compiled schema
│   └── types.ts                # Shared TypeScript interfaces
├── tests/
│   ├── fixtures/
│   │   ├── data.yaml           # Sample input data
│   │   ├── schema.yaml         # Sample schema
│   │   └── data.xlsx           # Pre-generated reference fixture for snapshot testing (committed)
│   ├── converter/
│   │   ├── to-excel.test.ts
│   │   └── to-yaml.test.ts
│   ├── schema/
│   │   └── validator.test.ts
│   └── cli.test.ts
├── schema.example.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `yaml` | Parse/stringify YAML (better TS support than js-yaml) |
| `exceljs` | Rich Excel read/write — typed cells, dropdowns, merged headers |
| `commander` | CLI flag parsing |
| `zod` | Runtime schema validation (TypeScript-first) |
| `dayjs` | Date parsing and formatting (handles `YYYY-MM-DD` and other format strings) |
| `chalk` | Terminal error/success output coloring |

Dev: `bun` (runtime + test runner + build tool), `typescript`

---

## CLI Interface

Direction is auto-detected from the input file extension (`.yaml`/`.yml` → Excel, `.xlsx` → YAML).

```bash
# YAML → Excel
yaml-converter -i data.yaml -o output.xlsx --schema schema.yaml

# Excel → YAML
yaml-converter -i data.xlsx -o output.yaml --schema schema.yaml

# Validate only (no output file written; errors file IS still written if errors exist)
yaml-converter -i data.xlsx --schema schema.yaml --validate

# Override error output path
yaml-converter -i data.xlsx -o output.yaml --schema schema.yaml --error-output errors.json
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-i, --input <file>` | Input file path (required) |
| `-o, --output <file>` | Output file path (optional for validate-only) |
| `--schema <file>` | Schema YAML file path (required) |
| `--validate` | Validate only, do not write output; errors file is still written |
| `--error-output <file>` | Override default error file path |
| `--json` | Output results as JSON to stdout (no chalk formatting; for agent/script use) |

**Error file path derivation:**
- Default: replace the output file extension with `.errors.json` (e.g., `-o output.yaml` → `output.errors.json`)
- In `--validate` mode (no `-o`): derive from input file (e.g., `-i data.xlsx` → `data.errors.json`)
- Override with `--error-output`
- No error file is created if validation passes

---

## Agent / Machine-Readable Output

The CLI must be usable by AI agents and scripts without parsing human-readable text. Two mechanisms support this:

**`--help` flag:** `commander` auto-generates structured help text. The help output must include all flags with descriptions and default values — this is the primary discovery mechanism for agents.

**`--json` flag (output mode):** When passed, all output (success and errors) is written to stdout as a single JSON object instead of colored text. No chalk formatting is applied. This allows agents to parse results programmatically.

```json
// Success
{ "status": "ok", "input": "data.yaml", "output": "output.xlsx" }

// Validation failure (exit code 1)
{ "status": "error", "input": "data.xlsx", "errorFile": "data.errors.json", "errorCount": 3 }

// Fatal error (exit code 2 — missing file, invalid schema, parse failure)
{ "status": "fatal", "error": "Schema file not found: schema.yaml" }
```

**Exit codes:**
- `0` — success
- `1` — validation errors found
- `2` — fatal error (missing file, invalid schema, parse failure)

---

## Schema Format

Defined in `schema.yaml` alongside data files:

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
```

**Supported field types:**

| Type | Excel behavior | YAML type |
|------|---------------|-----------|
| `string` | Plain text cell | `string` |
| `number` | Numeric cell with number format | `number` |
| `date` | Date cell formatted via `format` (dayjs) | `string` (ISO/formatted) |
| `boolean` | Boolean cell | `boolean` |
| `options` | Text cell + Excel data validation dropdown | `string` |

**Schema fields:**

- `field` — key in YAML data
- `header` — column header label in Excel
- `group` (optional) — parent header; columns sharing a group get a merged header spanning them
- `type` — one of the supported types above
- `format` (date only) — dayjs-compatible format string (e.g., `YYYY-MM-DD`); used for both writing and reading
- `options` (options only) — list of allowed values
- `required` (optional) — if true, null/empty/undefined values fail validation

**YAML input structure:** The YAML file must contain a top-level array of objects. Object-with-key structures (e.g., `{ data: [...] }`) are not supported; wrap your data directly as a sequence.

```yaml
# Correct
- name: Alice
  status: Active

# Not supported
data:
  - name: Alice
```

---

## Schema Loader: YAML → Zod Mapping

`schema/loader.ts` reads `schema.yaml` and compiles each column definition into a Zod field:

| Schema type | Zod type | Notes |
|-------------|----------|-------|
| `string` | `z.string()` | + `.min(1)` if `required: true` |
| `number` | `z.number()` | + `.nonnegative()` not applied by default — any number accepted |
| `date` | `z.string()` | Refined with dayjs to confirm parseable with the given `format`; `required` adds `.min(1)` |
| `boolean` | `z.boolean()` | |
| `options` | `z.enum([...options])` | Derived from the `options` array in schema |

For all types: if `required: false` or `required` is absent, the field is wrapped with `.optional().nullable()`.

The resulting Zod object schema (`z.object({...})`) is used by `schema/validator.ts` to validate each row and collect `ZodError` issues into the error output format.

---

## Data Flow

### YAML → Excel

```
data.yaml
  → parse with `yaml` (must be top-level array)
  → validate all rows against Zod schema (from schema.yaml)
  → if errors: write <output>.errors.json, exit 1
  → build Excel workbook (exceljs):
      · if any column has a `group`: add row 1 with merged group header cells
        (columns without a group get an empty merged cell spanning just themselves)
      · add column header row (row 1 if no groups, row 2 if groups present)
      · freeze top rows (1 or 2 depending on groups)
      · apply cell types: date cells formatted with dayjs + exceljs numFmt,
        number cells with number format, boolean cells as boolean
      · apply dropdown data validation for `options` fields
      · write data rows starting after header row(s)
  → write .xlsx
```

**Missing fields in data rows:** If a field defined in the schema is absent from a YAML row and is not `required`, write an empty cell. If it is `required`, it will have already failed validation above.

### Excel → YAML

```
data.xlsx (sheet: first sheet)
  → read with exceljs
  → determine header rows:
      · if the workbook was produced by this tool and has group headers:
        row 1 = group row (merged cells), row 2 = column headers — use row 2
      · if no group row detected (all cells in row 1 are non-merged and match
        schema `header` values): use row 1 as column headers
      · merged cells in the group row: non-master cells return null in exceljs —
        skip them; only the master cell of a merge is read
  → map column header text → schema `field` name (case-sensitive match to `header`)
  → for each data row, cast cell values per schema type:
      · date cells: exceljs returns JS Date objects → format with dayjs using
        schema `format` string → YAML string
      · number cells → JS number
      · boolean cells → JS boolean
      · string / options cells → string (trim whitespace)
  → validate all rows against Zod schema
  → if errors: write <output>.errors.json, exit 1
  → serialize array to YAML with `yaml`
  → write .yaml
```

---

## Error Output

Validation errors are:
1. Printed to terminal — summary count + first 5 errors (unless `--json` is passed, in which case see Agent / Machine-Readable Output — the JSON object is written to stdout instead)
2. Written in full to the derived `.errors.json` path (see CLI Interface section)

No error file is created if validation passes. In `--validate` mode, errors file is still written.

**Error file format:**

```json
{
  "summary": {
    "total": 3,
    "file": "data.xlsx"
  },
  "errors": [
    {
      "row": 2,
      "field": "status",
      "expected": "options: Active | Inactive | Pending",
      "actual": "Archived",
      "message": "Value 'Archived' is not in allowed options"
    }
  ]
}
```

**Row numbering:** `row` is 1-based and refers to the data row index (row 1 = first data row, not the header row). This is independent of the Excel row number, which is offset by the number of header rows.

---

## Testing

Using Bun's built-in test runner (`bun test`).

`tests/fixtures/data.xlsx` is a committed pre-generated reference fixture used for snapshot-style round-trip tests. It is not regenerated during tests — it represents the known-good Excel output.

**Key test cases:**

- Round-trip: `data.yaml → .xlsx → .yaml` produces identical output to the original `data.yaml`
- Date fields serialize/deserialize correctly (YAML string → Excel date cell → YAML string)
- Boolean fields correctly cast in both directions
- Options dropdown validation rejects invalid values with correct error shape in `.errors.json`
- Grouped columns produce correct merged header cells spanning the right column range
- Columns without a group produce a single non-merged header cell in the group row
- Missing required fields produce row-level errors in `.errors.json`
- Missing optional fields produce empty cells (YAML→Excel) or omitted keys (Excel→YAML)
- `--validate` flag: no output file written, errors file still written
- `--error-output` flag overrides error file path
- Error `row` numbers are 1-based data row indices, not Excel row numbers
- Single-header-row Excel files (no group row) resolve column names from row 1

---

## Publishing

**Primary target:** npm package with a JS entry point (not a compiled binary). Use `bun build` to bundle `src/cli.ts` to ESM output at `dist/cli.js`. The `bin` field in `package.json` points to `dist/cli.js`.

```json
{
  "name": "yaml-converter",
  "bin": { "yaml-converter": "dist/cli.js" },
  "scripts": {
    "build": "bun build src/cli.ts --outdir dist --target node",
    "dev": "bun run src/cli.ts"
  }
}
```

This ensures the package works with `npm install -g yaml-converter` on any Node.js/Bun environment without requiring Bun at runtime.
