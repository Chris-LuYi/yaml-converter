---
"yaml-converter": patch
---

Fix schema lookup to resolve from CWD instead of input file directory. Fix --version always reporting 0.1.0 — now reads from package.json. Default output path derived from input name when -o is omitted.
