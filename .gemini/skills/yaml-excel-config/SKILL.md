---
name: yaml-excel-config
description: Design a schema-driven YAML config (column schema + data rows) and convert it to a styled Excel workbook with the yaml-converter CLI — or convert an edited Excel file back to YAML. Use when the user wants to create, generate, or maintain a YAML-based config/inventory/registry/tracker, turn YAML into an .xlsx spreadsheet, validate YAML rows against a schema, merge many YAML files into one sheet, or split an Excel sheet back into YAML files.
---

# YAML config → Excel with yaml-converter

You help the user author their own YAML-based config and turn it into a rich
Excel workbook (grouped headers, dropdowns, date cells, auto-filter, frozen
headers) using the `yaml-converter` CLI. The CLI also converts Excel back to
YAML, so the spreadsheet can be edited by non-developers and round-tripped.

Every conversion needs two YAML files:

1. **`schema.yaml`** — describes the columns (field, header, type, group, ...).
2. **data file** (e.g. `apps.yaml`) — a top-level **list of row objects** whose
   keys match the schema `field` names.

## Workflow

Follow these steps in order. Do not skip validation.

### 1. Understand what the user is tracking

Ask (or infer from context) only what you need:

- What is one row? (an app, a service, a feature flag, an environment, a person...)
- Which columns, and for each: type, whether it is required, and allowed values
  for enumerations.
- Whether columns should be visually grouped (e.g. "App Info", "Lifecycle").
- Where the files should live and what the output `.xlsx` should be called.

If the user gives existing data (JSON, CSV, a table, prose), derive the schema
from it instead of asking.

### 2. Write `schema.yaml`

Use `assets/schema.template.yaml` as the starting point. Rules — see
`references/schema-reference.md` for full detail:

- Top-level key `columns:` holding a list. Column order = Excel column order.
- Each column needs `field` (snake_case key used in data), `header` (Excel
  label) and `type`: one of `string | number | date | boolean | options`.
- `options` type **must** have a non-empty `options: [...]` list → Excel dropdown.
- `date` type takes an optional `format` (dayjs tokens, default `YYYY-MM-DD`).
- `required: true` makes the field mandatory; otherwise it may be omitted/null.
- `group` is optional; consecutive columns with the same `group` get a merged
  parent header. Keep grouped columns adjacent.

### 3. Write the data YAML

Use `assets/data.template.yaml` as a guide. Type rules the validator enforces
(these are the most common causes of failure):

| Schema type | Write values as | Pitfall |
|-------------|-----------------|---------|
| `string`  | `"text"` | Quote anything YAML would read as a number/bool: `version: "1.0"`, `code: "007"`, `flag: "yes"` |
| `number`  | `3000` (unquoted) | `"3000"` (quoted) fails |
| `date`    | `"2024-03-01"` (quoted, exact `format`) | `2024-3-1` fails strict parsing for `YYYY-MM-DD` |
| `boolean` | `true` / `false` | `"true"`, `yes`, `1` fail |
| `options` | exactly one of the listed values | Case-sensitive: `active` ≠ `Active` |

- A required `string` may not be an empty string.
- Keys not in the schema are ignored (not written to Excel). Nested objects or
  lists are not supported as cell values — flatten them into separate columns.
- Separate rows with a blank line for readability.

### 4. Validate, then convert

Run the helper script (it uses a global `yaml-converter` if installed, else
`npx -y yaml-converter`). Always use `--json` so results are machine-readable.

```bash
# Validate only — writes nothing except an errors file on failure
bash <skill-dir>/scripts/convert.sh -i apps.yaml --schema schema.yaml --validate --json

# Convert YAML → Excel (default output: apps.xlsx next to the input)
bash <skill-dir>/scripts/convert.sh -i apps.yaml --schema schema.yaml -o apps.xlsx --json
```

`<skill-dir>` is the directory containing this SKILL.md. Equivalent direct
command: `npx -y yaml-converter -i apps.yaml --schema schema.yaml --json`.

### 5. Interpret the result and fix errors

The JSON line on stdout and the exit code tell you what happened:

| Exit | JSON `status` | Meaning / next step |
|------|---------------|---------------------|
| `0` | `ok` | Success. Report `output` path and `rows`/`sheets` counts. |
| `1` | `error` | Validation failed. Read the file at `errorFile` (`<name>.errors.json`). Each entry has `row` (1-based data row), `field`, `expected`, `actual`, `message`. Fix the data (or the schema if the schema is wrong), then re-run. |
| `2` | `fatal` | Missing input/schema, invalid schema (e.g. `options` without values), bad YAML. Read `error` and fix. |

Loop validate → fix until exit code is `0`, then convert. Never hand-edit the
generated `.xlsx`; regenerate it from YAML.

### 6. Report back

Tell the user: the files you created, the output `.xlsx` path, the row count,
and how to regenerate (`npx yaml-converter -i <data> --schema <schema>`).
Mention they can edit the Excel and convert it back (see below).

## Other operations

See `references/cli-reference.md` for every flag. Common recipes:

```bash
# Excel → YAML (writes ./apps/<SheetName>.yaml, one file per sheet)
npx -y yaml-converter -i apps.xlsx --schema schema.yaml --json

# Folder of YAML files → one workbook, one sheet per file
npx -y yaml-converter -i ./configs --schema schema.yaml -o configs.xlsx --json

# Folder (recursive) → ONE merged sheet with a "source" column
npx -y yaml-converter -i ./configs --recursive --merge --tag-field source \
  --schema schema.yaml -o merged.xlsx --json

# Merged Excel → back to one YAML per source, dropping the tag column
npx -y yaml-converter -i merged.xlsx --split-by source --drop-field source \
  --schema schema.yaml -o ./configs-out --json
```

Notes:

- Schema resolution: `--schema` flag, else `schema.yaml` in the **current
  working directory** (not next to the input). Prefer passing `--schema`.
- In directory mode, a per-file schema `<basename>-schema.yaml` in CWD
  overrides the shared schema for that file. Files named `schema.yaml` or
  `*-schema.yaml` are never treated as data.
- Styling (fonts, header colours, column widths, row heights) is configured
  via `yaml-converter.config.yaml` in the CWD — copy
  `assets/yaml-converter.config.yaml` and edit. Colours are hex without `#`.

## Example

User: "I want an Excel sheet tracking our microfrontends: name, owning team,
framework (React/Vue/Angular), status, and go-live date."

1. Create `mfe-schema.yaml`:
   ```yaml
   columns:
     - { field: app_name, header: App Name, group: App Info, type: string, required: true }
     - { field: team, header: Team, group: App Info, type: string, required: true }
     - { field: framework, header: Framework, group: Technical, type: options, options: [React, Vue, Angular], required: true }
     - { field: status, header: Status, group: Lifecycle, type: options, options: [Planned, Beta, Active, Deprecated], required: true }
     - { field: go_live, header: Go-Live Date, group: Lifecycle, type: date, format: YYYY-MM-DD }
   ```
2. Create `mfe.yaml` with a list of rows using those fields.
3. Run `scripts/convert.sh -i mfe.yaml --schema mfe-schema.yaml --validate --json`,
   fix any errors, then run without `--validate` to produce `mfe.xlsx`.
