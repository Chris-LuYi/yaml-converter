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
