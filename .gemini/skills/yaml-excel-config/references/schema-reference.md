# Schema reference

A schema is a YAML file with a single top-level `columns` list. The CLI fails
with exit code `2` if `columns` is missing or not a list.

```yaml
columns:
  - field: app_name        # required — key used in each data row
    header: App Name       # required — label shown in the Excel header row
    group: App Info        # optional — merged parent header for adjacent columns
    type: string           # required — string | number | date | boolean | options
    required: true         # optional — default false
```

## Column properties

| Property   | Required | Applies to | Description |
|------------|----------|------------|-------------|
| `field`    | yes | all | Data key. Use `snake_case`; must be unique. |
| `header`   | yes | all | Excel column header text. |
| `type`     | yes | all | See types below. Unknown types are a fatal error. |
| `required` | no  | all | `true` = must be present and non-null (and non-empty for `string`). |
| `group`    | no  | all | Columns with the same `group` (adjacent) share a merged header cell in an extra top row. If no column has a group, there is a single header row. |
| `format`   | no  | `date` | dayjs format tokens. Default `YYYY-MM-DD`. Parsing is **strict**. |
| `options`  | yes for `options` | `options` | Non-empty list of allowed string values. Becomes an Excel dropdown. |

## Types

| Type | Valid YAML value | Excel output |
|------|------------------|--------------|
| `string`  | Any string. Required strings must be non-empty. | Text cell |
| `number`  | Unquoted integer or float (`42`, `3.5`). | Numeric cell |
| `date`    | String matching `format` exactly (`"2024-03-01"`). | Real Excel date cell with matching number format |
| `boolean` | `true` / `false` | Boolean cell |
| `options` | One of `options`, case-sensitive. | Text cell + dropdown validation (blank allowed unless required) |

Optional fields may be omitted or set to `null` (`~`).

## Common date formats (dayjs tokens)

| Format | Example |
|--------|---------|
| `YYYY-MM-DD` | `2024-03-01` |
| `DD/MM/YYYY` | `01/03/2024` |
| `MM/DD/YYYY` | `03/01/2024` |
| `YYYY-MM-DD HH:mm` | `2024-03-01 14:30` |

## Designing a good schema

- One row = one entity. If a value is a list (e.g. several owners), either join
  it into a string (`"alice, bob"`) or create a separate YAML file/sheet.
- Prefer `options` over free text whenever the set of values is known — it
  gives the Excel user a dropdown and catches typos at validation time.
- Mark the identifying column(s) `required: true`.
- Put grouped columns next to each other, in the order they should appear.
- Use `number` only for real numbers. IDs, versions, zip codes, phone numbers
  → `string` (and quote them in data).

## Validation error file

On validation failure the CLI writes `<output-or-input-base>.errors.json`
(override with `--error-output <path>`):

```json
{
  "summary": { "total": 2, "file": "apps.yaml" },
  "errors": [
    {
      "row": 3,
      "field": "status",
      "expected": "options: Active | Beta | Deprecated",
      "actual": "active",
      "message": "Invalid enum value. Expected 'Active' | 'Beta' | 'Deprecated', received 'active'"
    }
  ]
}
```

`row` is the 1-based index into the data list (not the Excel row number).
For multi-sheet/directory input each error also has `sheet`.
