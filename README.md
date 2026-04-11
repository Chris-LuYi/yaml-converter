# yaml-converter

Convert YAML files to rich Excel (`.xlsx`) and back, with schema-driven column types, grouped headers, dropdown validation, auto-filter, styled headers, and machine-readable output.

## Install

```bash
npm install -g yaml-converter
```

## Usage

```bash
# YAML → Excel (output path defaults to data.xlsx)
yaml-converter -i data.yaml --schema schema.yaml

# Excel → YAML (outputs to ./data/ directory, one file per sheet)
yaml-converter -i data.xlsx --schema schema.yaml

# Directory of YAMLs → multi-sheet Excel
yaml-converter -i ./mfe-dir --schema schema.yaml

# Validate only — no output written
yaml-converter -i data.yaml --schema schema.yaml --validate

# Machine-readable JSON output (for agents/scripts)
yaml-converter -i data.yaml --schema schema.yaml --json
```

## Default Output Paths

When `-o` is omitted the output path is derived from the input:

| Input | Default output |
|-------|---------------|
| `data.yaml` | `data.xlsx` |
| `data.xlsx` | `./data/` (directory) |
| `./folder/` | `./folder.xlsx` |
| `data.yaml --split-by field` | `./data/` (directory) |

## Schema

Place `schema.yaml` in your working directory (the default) or pass `--schema path/to/schema.yaml`.

```yaml
columns:
  - field: app_name
    header: App Name
    group: App Info        # optional — merges cells across grouped columns
    type: string
    required: true

  - field: status
    header: Status
    group: Lifecycle
    type: options
    options: [Active, Beta, Deprecated, Planned]
    required: true

  - field: deploy_date
    header: Deploy Date
    group: Lifecycle
    type: date
    format: YYYY-MM-DD
```

Supported field types:

| Type | Excel behaviour |
|------|----------------|
| `string` | Plain text cell |
| `number` | Numeric cell |
| `date` | Date cell — formatted via `format` (dayjs tokens) |
| `boolean` | Boolean cell |
| `options` | Text cell + dropdown validation list |

For a directory input, a per-file schema override is loaded from `{basename}-schema.yaml` in CWD if it exists, falling back to the shared schema.

## Multi-Sheet Excel → YAML

Each worksheet is written as a separate YAML file in the output directory:

```
data.xlsx  (Sheet1, Sheet2)
  ↓
yaml-converter -i data.xlsx --schema schema.yaml
  ↓
./data/Sheet1.yaml
./data/Sheet2.yaml
```

Sheet names with filesystem-unsafe characters (`/ \ : * ? " < > |`) are sanitized to `_`.

## Pipeline Flags

These flags support multi-agent / batch-scanning workflows.

### `--recursive`

Scan subdirectories when using a directory as input. The tag injected into each row is the relative path without extension (e.g. `project-a/mfe1`).

```bash
yaml-converter -i ./projects --recursive --schema schema.yaml
```

### `--merge` + `--tag-field <name>`

Flatten all YAML files from a directory into a single Excel sheet. A column named `<name>` is prepended to each row to record the source file.

```bash
yaml-converter -i ./mfe-dir --merge --tag-field source --schema schema.yaml
```

### `--split-by <field>` + `--drop-field <field>`

Group rows by a field value and write one YAML file per group. Combine with `--drop-field` to strip the tag column from the output.

```bash
# Excel → per-group YAMLs
yaml-converter -i merged.xlsx --split-by source --drop-field source --schema schema.yaml

# YAML → per-group YAMLs (no schema required)
yaml-converter -i flat.yaml --split-by source --drop-field source
```

### Round-trip example

```bash
# Merge many YAMLs into one Excel
yaml-converter -i ./projects --recursive --merge --tag-field source --schema schema.yaml -o merged.xlsx

# Split back out — one YAML per source value
yaml-converter -i merged.xlsx --split-by source --drop-field source --schema schema.yaml -o ./projects-out
```

## Excel Styling

The generated Excel file includes:

- Coloured group header row (dark navy) and field header row (medium blue)
- Bold white text on all header rows
- Auto-filter dropdowns on the header row
- Frozen header row(s)
- Auto-fitted column widths (capped at a configurable maximum)
- Row height and font size tuned for readability

### Config file

Create `yaml-converter.config.yaml` in your working directory to override any style default:

```yaml
excel:
  style:
    fontName: Public Sans       # font must be installed on target machines
    fontSizeHeader: 11
    fontSizeData: 10
    colorGroupBg: "1F4E79"     # ARGB hex (no #) — deep navy
    colorGroupFg: "FFFFFF"
    colorHeaderBg: "2E75B6"   # medium blue
    colorHeaderFg: "FFFFFF"
    colMinWidth: 8
    colMaxWidth: 50
    rowHeightHeader: 20
    rowHeightData: 18
```

All keys are optional — omit any to keep the built-in default.

## Special Characters

Strings containing `"`, `&`, `'`, commas, Unicode, and URL query parameters are handled transparently in both directions. YAML output uses the minimal quoting style required (YAML 1.2 — no automatic date coercion).

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Validation errors (see `.errors.json`) |
| `2` | Fatal error (missing file, invalid schema) |

## All Flags

```
-i, --input <path>         Input file or directory
-o, --output <path>        Output file or directory (default derived from input)
--schema <path>            Schema file (default: schema.yaml in CWD)
--validate                 Validate only — do not write output
--json                     Emit machine-readable JSON to stdout
--recursive                Scan subdirectories (directory input only)
--merge                    Merge all YAMLs into one sheet (requires --tag-field)
--tag-field <name>         Column name to inject as source tag when merging
--split-by <field>         Split rows into one YAML per unique field value
--drop-field <field>       Remove a field from rows when writing split output
--error-output <path>      Path for the validation errors JSON file
-V, --version              Print version
```
