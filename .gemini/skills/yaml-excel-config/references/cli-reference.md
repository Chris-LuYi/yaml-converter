# yaml-converter CLI reference

Install globally with `npm install -g yaml-converter`, or run ad hoc with
`npx -y yaml-converter ...`. Direction is chosen from the input:
`.yaml`/`.yml` → Excel, anything else (`.xlsx`) → YAML, directory → Excel.

## Flags

```
-i, --input <path>         Input file or directory (required)
-o, --output <path>        Output file or directory (default derived from input)
--schema <path>            Schema file (default: schema.yaml in CWD)
--validate                 Validate only — do not write output
--json                     Emit one machine-readable JSON line to stdout
--recursive                Scan subdirectories (directory input only)
--merge                    Merge all YAMLs into one sheet (requires --tag-field)
--tag-field <name>         Column name injected with the source file tag when merging
--split-by <field>         Split rows into one YAML per unique field value
--drop-field <field>       Remove a field from rows when writing split output
--error-output <path>      Path for the validation errors JSON file
-V, --version              Print version
```

## Default output paths

| Input | Default output |
|-------|----------------|
| `data.yaml` | `data.xlsx` |
| `data.xlsx` | `./data/` (one `<Sheet>.yaml` per worksheet) |
| `./folder/` | `./folder.xlsx` (one sheet per file) |
| `data.yaml --split-by f` | `./data/` (one YAML per value of `f`) |

## Exit codes and JSON output

| Exit | Example `--json` stdout |
|------|-------------------------|
| `0` | `{"status":"ok","input":"apps.yaml","output":"apps.xlsx","rows":12}` |
| `0` (multi-sheet) | `{"status":"ok","input":"apps.xlsx","output":"apps","sheets":{"Sheet1":12},"totalRows":12}` |
| `1` | `{"status":"error","input":"apps.yaml","errorFile":"apps.errors.json","errorCount":2}` |
| `2` | `{"status":"fatal","error":"Schema file not found: schema.yaml"}` |

## Modes

### YAML file → Excel
`yaml-converter -i apps.yaml --schema schema.yaml -o apps.xlsx`
Sheet name = input file basename.

### Excel → YAML
`yaml-converter -i apps.xlsx --schema schema.yaml -o ./apps`
Each worksheet becomes `<sanitized-sheet-name>.yaml`. Empty sheets are skipped.
Rows are validated against the schema before writing.

### Directory → multi-sheet Excel
`yaml-converter -i ./configs --schema schema.yaml`
One sheet per YAML file. Per-file schema override: `<basename>-schema.yaml` in CWD.
Add `--recursive` to include subfolders (tag = relative path without extension).

### Directory → single merged sheet
`yaml-converter -i ./configs --recursive --merge --tag-field source --schema schema.yaml`
Prepends a `source` column holding each row's file tag. One shared schema.

### Split
`yaml-converter -i merged.xlsx --split-by source --drop-field source --schema schema.yaml`
Groups rows by the field value; schema is required for Excel input and optional
for YAML input.

## Styling config

`yaml-converter.config.yaml` in the CWD (all keys optional):

```yaml
excel:
  style:
    fontName: Public Sans
    fontSizeHeader: 11
    fontSizeData: 10
    colorGroupBg: "1F4E79"
    colorGroupFg: "FFFFFF"
    colorHeaderBg: "2E75B6"
    colorHeaderFg: "FFFFFF"
    colMinWidth: 8
    colMaxWidth: 50
    rowHeightHeader: 20
    rowHeightData: 18
    blankRows: 1000   # empty rows below data that get dropdowns/date/number typing
```
