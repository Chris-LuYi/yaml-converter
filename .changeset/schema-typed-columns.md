---
"yaml-converter": minor
---

Apply schema column types to the whole column in generated Excel files. Empty cells and a block of blank rows below the data (`excel.style.blankRows`, default 1000) now get the column's dropdown, cell format and validation. Dates and numbers are validated, booleans get a TRUE/FALSE dropdown, string columns are text-formatted, and invalid entries show an error. Dropdown lists over Excel's 255-character inline limit, or containing commas or quotes, are stored on a hidden sheet, which Excel → YAML skips. Text "TRUE"/"FALSE" boolean cells are now read back correctly.
