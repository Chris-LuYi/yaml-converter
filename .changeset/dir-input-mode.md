---
"yaml-converter": minor
---

Add directory input mode: pass a folder as `-i` to convert all YAML files into one Excel workbook (one sheet per file). Schema defaults to `schema.yaml` inside the directory; per-file overrides use `{name}-schema.yaml`. The `--schema` flag is now optional globally.
