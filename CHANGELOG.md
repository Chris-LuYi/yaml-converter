# yaml-converter

## 0.3.0

### Minor Changes

- 4cd37e2: Add directory input mode: pass a folder as `-i` to convert all YAML files into one Excel workbook (one sheet per file). Schema defaults to `schema.yaml` inside the directory; per-file overrides use `{name}-schema.yaml`. The `--schema` flag is now optional globally.

## 0.2.4

### Patch Changes

- 2390b9c: Add completion summary: row counts and output paths printed after every successful conversion. JSON mode includes `rows` (YAML→Excel) or `sheets`/`totalRows` (Excel→YAML) fields.

## 0.2.3

### Patch Changes

- 584680c: Use input YAML filename stem as Excel sheet name so round-trips produce the original filename (e.g. data.yaml → Excel sheet "data" → data.yaml)

## 0.2.2

### Patch Changes

- 0f7ebf8: Fix Excel→YAML output fidelity: quote date fields and semver-like version strings, add blank lines between entries. Fix fatal errors (missing file, schema, etc.) silently swallowed in non-JSON mode.

## 0.2.1

### Patch Changes

- eb5279f: Fix CLI binary not executable: add shebang and chmod after build, add "type": "module" to suppress Node ESM warning

## 0.2.0

### Minor Changes

- 2bec816: Add multi-sheet Excel→YAML: each sheet converts to its own YAML file in the output directory

## 0.1.1

### Patch Changes

- 4c52b27: Initial release
