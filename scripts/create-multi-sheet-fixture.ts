import ExcelJS from "exceljs"

const wb = new ExcelJS.Workbook()

function addSheet(name: string, rows: unknown[][]) {
  const ws = wb.addWorksheet(name)

  // Group header row (row 1): "Personal Info" spans columns 1-2 (name + birthdate)
  const groupRow = ws.addRow([])
  groupRow.getCell(1).value = "Personal Info"
  ws.mergeCells(1, 1, 1, 2)

  // Column header row (row 2)
  ws.addRow(["Name", "Date of Birth", "Status", "Score", "Verified"])
  ws.views = [{ state: "frozen", ySplit: 2 }]

  for (const r of rows) {
    ws.addRow(r)
  }
}

addSheet("People", [
  ["Alice", new Date("1990-01-15"), "Active", 95, true],
  ["Bob", null, "Inactive", 72, false],
])

addSheet("Staff", [
  ["Carol", new Date("1985-06-20"), "Active", 88, true],
  ["Dave", new Date("1992-03-10"), "Pending", 60, false],
])

await wb.xlsx.writeFile("tests/fixtures/multi-sheet.xlsx")
console.log("Created tests/fixtures/multi-sheet.xlsx")
