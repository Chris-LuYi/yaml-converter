import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import ExcelJS from "exceljs"
import { toExcel } from "../../src/converter/to-excel"
import { loadSchema } from "../../src/schema/loader"

const OUTPUT = "/tmp/test-to-excel.xlsx"
const schema = loadSchema("tests/fixtures/schema.yaml")
const rows = [
  {
    name: "Alice",
    birthdate: "1990-01-15",
    status: "Active",
    score: 95,
    verified: true,
  },
  { name: "Bob", status: "Inactive", score: 72, verified: false },
]

describe("toExcel", () => {
  beforeAll(async () => {
    await toExcel(rows, schema, OUTPUT)
  })

  afterAll(() => {
    if (existsSync(OUTPUT)) unlinkSync(OUTPUT)
  })

  test("creates the output file", () => {
    expect(existsSync(OUTPUT)).toBe(true)
  })

  test("group headers appear in row 1 with merged cells", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    const cell = ws.getCell("A1")
    expect(cell.value).toBe("Personal Info")
    expect(ws.getCell("B1").isMerged).toBe(true)
  })

  test("column headers appear in row 2", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    expect(ws.getCell("A2").value).toBe("Name")
    expect(ws.getCell("B2").value).toBe("Date of Birth")
    expect(ws.getCell("C2").value).toBe("Status")
  })

  test("status column cells have dropdown validation", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    const cell = ws.getCell("C3")
    expect(cell.dataValidation?.type).toBe("list")
    expect(cell.dataValidation?.formulae?.[0]).toContain("Active")
  })

  test("missing optional field produces null cell", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    const cell = ws.getCell("B4")
    expect(cell.value).toBeNull()
  })

  test("date cell stores a JS Date object", async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]
    const cell = ws.getCell("B3")
    expect(cell.value).toBeInstanceOf(Date)
  })
})
