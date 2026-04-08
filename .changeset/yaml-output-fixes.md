---
"yaml-converter": patch
---

Fix Excel→YAML output fidelity: quote date fields and semver-like version strings, add blank lines between entries. Fix fatal errors (missing file, schema, etc.) silently swallowed in non-JSON mode.
