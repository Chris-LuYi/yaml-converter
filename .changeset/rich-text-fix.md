---
"yaml-converter": patch
---

Fix Excel cells with rich text formatting (bold, colors, mixed styles) or formula results being read as "[object Object]" instead of their actual string value. Affects any cell with character-level formatting or a computed formula.
