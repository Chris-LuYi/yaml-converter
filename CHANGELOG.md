# yaml-converter

## 0.4.0

### Minor Changes

- f36649f: Add `--recursive`, `--merge`, and `--split-by` flags for multi-project agent pipeline support. Merge flattens a directory of YAML files into one Excel sheet with an injected tag column; split reverses the operation by grouping rows back into separate YAML files by field value.

### Patch Changes

- 9b37178: Fix Excel cells with rich text formatting (bold, colors, mixed styles) or formula results being read as "[object Object]" instead of their actual string value. Affects any cell with character-level formatting or a computed formula.

## 0.3.1

### Patch Changes

- 7ae3f1e: Fix schema lookup to resolve from CWD instead of input file directory. Fix --version always reporting 0.1.0 — now reads from package.json. Default output path derived from input name when -o is omitted.

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
