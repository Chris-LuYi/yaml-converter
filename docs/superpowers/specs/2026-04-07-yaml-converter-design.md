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
│   │   ├── data.yaml
│   │   ├── schema.yaml
│   │   └── data.xlsx
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

# Validate only (no output file written)
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
| `--validate` | Validate only, do not write output |
| `--error-output <file>` | Override default error file path |

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

| Type | Excel behavior |
|------|---------------|
| `string` | Plain text cell |
| `number` | Numeric cell with number format |
| `date` | Date cell with specified `format` |
| `boolean` | Boolean cell |
| `options` | Text cell + Excel data validation dropdown |

**Schema fields:**

- `field` — key in YAML data
- `header` — column header label in Excel
- `group` (optional) — parent header; columns sharing a group get a merged header spanning them
- `type` — one of the supported types above
- `format` (date only) — date format string
- `options` (options only) — list of allowed values
- `required` (optional) — if true, null/empty values fail validation

---

## Data Flow

### YAML → Excel

```
data.yaml
  → parse with `yaml`
  → validate all rows against Zod schema (from schema.yaml)
  → if errors: write <output>.errors.json, exit 1
  → build Excel workbook (exceljs):
      · row 1: merged group header cells (where group is defined)
      · row 2: individual column headers
      · freeze top 2 rows
      · apply cell types (date format, number format)
      · apply dropdown validation for `options` fields
      · write data rows
  → write .xlsx
```

### Excel → YAML

```
data.xlsx
  → read with exceljs
  → map column headers back to field names via schema
  → cast cell values to schema types:
      · dates → ISO string (per schema format)
      · numbers → JS number
      · booleans → JS boolean
      · options/strings → string
  → validate all rows against Zod schema
  → if errors: write <output>.errors.json, exit 1
  → serialize to YAML with `yaml`
  → write .yaml
```

---

## Error Output

Validation errors are:
1. Printed to terminal (summary count + first few errors)
2. Written in full to `<output-name>.errors.json`

No error file is created if validation passes.

**Error file format:**

```json
{
  "summary": {
    "total": 3,
    "file": "data.xlsx"
  },
  "errors": [
    {
      "row": 4,
      "field": "status",
      "expected": "options: Active | Inactive | Pending",
      "actual": "Archived",
      "message": "Value 'Archived' is not in allowed options"
    }
  ]
}
```

---

## Testing

Using Bun's built-in test runner (`bun test`).

**Key test cases:**

- Round-trip: `data.yaml → .xlsx → .yaml` produces identical output
- Date fields serialize/deserialize correctly across both directions
- Options dropdown validation rejects invalid values with correct error shape
- Grouped columns produce correct merged header cells in Excel
- Missing required fields produce errors in `.errors.json`
- `--validate` flag runs validation without writing output
- `--error-output` flag overrides error file path

---

## Publishing

Built with `bun build --compile` to produce a self-contained binary, or bundled ESM output for `npm publish`. The `bin` field in `package.json` points to `src/cli.ts` for local development via `bun run`.
