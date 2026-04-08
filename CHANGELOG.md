# yaml-converter

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
