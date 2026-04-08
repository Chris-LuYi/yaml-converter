# Multi-Sheet Excel → YAML Design

**Date:** 2026-04-08
**Topic:** Convert each sheet in an Excel workbook to its own YAML file

## Background

The current `toYaml` converter reads only the first worksheet (`wb.worksheets[0]`). This feature extends the tool to read all sheets, writing one YAML file per sheet into an output directory.

**Primary use case:** Excel is the human-editable master sheet (maintained by non-developers); YAML files are source-of-truth for consumer codebases. When users update the Excel, the CLI syncs all sheets back to YAML files in the target directory, which can be directly in the source code repo.

## CLI Behavior

### Input direction: Excel → YAML

When `-i` is an `.xlsx` file:

- `-o` is now an **output directory** (not a file path)
- Each worksheet produces one file: `{-o}/{sheet-name}.yaml`
- The directory is created if it does not exist
- All sheets use the same `--schema`
- A new optional flag `--sheet-schemas` is accepted and parsed but not yet implemented (placeholder for future per-sheet schema overrides); using it produces a warning: `--sheet-schemas is not yet implemented, ignored`

### Unchanged behavior

- YAML → Excel direction: `-o` remains a file path, behavior unchanged
- The "required unless `--validate`" guard on `-o` still applies in xlsx→yaml direction
- `--validate` mode: validates all sheets, no YAML files written, errors file still written
- When `--validate` is set and `-o` is omitted, the errors file path falls back to the input path base: `{input-base}.errors.json` (existing behavior preserved)

### Error file path

`deriveErrorPath` must be updated for the xlsx→yaml direction. The current implementation strips the last extension with a regex (`base.replace(/\.[^.]+$/, "")`), which corrupts directory paths containing dots (e.g. `./my.project` → `./my.errors.json`).

New behavior when `-o` is a directory: use the directory path directly, appended with `.errors.json` — no regex stripping. For example:
- `-o ./output` → `./output.errors.json`
- `-o ./my.project/output` → `./my.project/output.errors.json`

The regex-strip logic is only applied in the YAML→Excel direction where `-o` is a file path.

### `-o` directory creation

The CLI creates the output directory (and any intermediate paths) if it does not exist, using `mkdirSync(opts.output, { recursive: true })`. A directory path with a file extension is accepted without complaint — the path is used as-is.

### Output naming

Only the sheet name determines the YAML filename. The Excel filename is not used in naming. Sheet names are sanitized for filesystem safety: characters that are invalid in filenames (`/ \ : * ? " < > |`) are replaced with `_`.

## Converter Changes

### `src/converter/to-yaml.ts`

Add a new exported function:

```typescript
export async function toYamlAll(
  inputPath: string,
  schema: Schema,
): Promise<Map<string, Record<string, unknown>[]>>
```

Returns a `Map<sheetName, rows[]>` for all worksheets in the workbook. The existing `toYaml` function is kept unchanged for backward compatibility with existing tests and single-sheet callers.

The per-sheet conversion logic (header detection, column mapping, type coercion) is extracted into a shared helper `convertSheet(ws, schema)` used by both `toYaml` and `toYamlAll`.

### `src/types.ts`

`ConvertOptions` gains a `sheetSchemas` field to match the new Commander option:

```typescript
export interface ConvertOptions {
  // ...existing fields...
  sheetSchemas?: string  // placeholder, not yet implemented
}
```

`ValidationError` gains an optional `sheet` field:

```typescript
export interface ValidationError {
  row: number
  field: string
  expected: string
  actual: unknown
  message: string
  sheet?: string   // populated for multi-sheet conversions
}
```

### `src/cli.ts`

The Excel → YAML branch is updated:

1. Call `toYamlAll(opts.input, schema)` to get a `Map<sheetName, rows[]>`
2. Validate each sheet's rows; tag each error with the sheet name
3. Collect all errors across sheets
4. If errors exist: write combined errors file and exit 1 (skip writing YAML files)
5. If `--validate` flag is set: stop here (no YAML files written regardless)
6. Otherwise: `mkdirSync(opts.output, { recursive: true })` then write one YAML file per sheet

The `summary.file` field in the errors output is set to the input xlsx path (the single source file for the multi-sheet conversion).

## Error Handling

- Directory creation failure → fatal exit 2
- Sheet with zero data rows → skip silently (no file written); emit a non-fatal warning to stderr so the user knows the sheet was skipped
- Type coercion in `to-yaml.ts` stores best-effort values (e.g. invalid dates are stored as raw strings). These surface as validation errors via `validateRows` — no new detection logic needed. Each error is tagged with the sheet name.
- `--sheet-schemas` flag used → emit yellow warning `--sheet-schemas is not yet implemented, ignored`; continue with base schema

## `--sheet-schemas` Placeholder

The flag is defined in Commander with description "Per-sheet schema overrides (not yet implemented)". If the flag is provided, the CLI emits a yellow warning `--sheet-schemas is not yet implemented, ignored` and continues normally using `--schema` for all sheets.

## Testing

- Add a new fixture `tests/fixtures/multi-sheet.xlsx` (2 sheets, same schema as existing `data.xlsx`) — do NOT mutate the existing committed fixture
- Unit test for `toYamlAll` against the new fixture: verify both sheets are returned with correct rows
- Test sanitization of sheet names with special characters (e.g. `Sheet/1` → `Sheet_1`)
- CLI integration test: multi-sheet xlsx → verify 2 YAML files written to output directory, exit 0
- CLI integration test: `--validate` on multi-sheet xlsx with one invalid row → exit 1, errors file has `sheet` field set
- Existing single-sheet tests remain unchanged (both `toYaml` and CLI tests)

## `--json` output for multi-sheet success

In `--json` mode, the success emit includes `output: opts.output` (the directory path). For example: `{"status":"ok","input":"report.xlsx","output":"./output"}`. Individual file paths are not enumerated in the JSON — the directory is sufficient.

## What is NOT included

- Actual per-sheet schema logic (deferred, `--sheet-schemas` is a placeholder only)
- YAML → Excel multi-sheet support (not requested)
- Custom output filename templates
