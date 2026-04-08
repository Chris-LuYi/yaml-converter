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
