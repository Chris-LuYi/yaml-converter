import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import ExcelJS from "exceljs"
import { OPTIONS_SHEET, toExcel } from "../../src/converter/to-excel"
import { toYamlAll } from "../../src/converter/to-yaml"
import { loadSchema } from "../../src/schema/loader"
import type { Schema } from "../../src/types"

const schema = loadSchema("tests/fixtures/schema.yaml")
// Columns: A name (string), B birthdate (date), C status (options),
//          D score (number), E verified (boolean). Data starts at row 3.
const rows = [
  {
    name: "Alice",
    birthdate: "1990-01-15",
    status: "Active",
    score: 95,
    verified: true,
  },
  { name: "Bob", status: "Inactive" },
]

const OUTPUT = "/tmp/test-column-types.xlsx"
const NO_BLANK = "/tmp/test-column-types-no-blank.xlsx"
const LONG = "/tmp/test-column-types-long.xlsx"

async function open(path: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(path)
  return wb
}

afterAll(() => {
  for (const f of [OUTPUT, NO_BLANK, LONG]) if (existsSync(f)) unlinkSync(f)
})

describe("schema-typed columns", () => {
  let ws: ExcelJS.Worksheet

  beforeAll(async () => {
    await toExcel(rows, schema, OUTPUT, "Sheet1", { blankRows: 10 })
    ws = (await open(OUTPUT)).worksheets[0]
  })

  test("options dropdown covers empty data cells and blank rows below", () => {
    for (const addr of ["C3", "C4", "C5", "C14"]) {
      const dv = ws.getCell(addr).dataValidation
      expect(dv?.type).toBe("list")
      expect(dv?.formulae?.[0]).toBe('"Active,Inactive,Pending"')
      expect(dv?.showErrorMessage).toBe(true)
    }
  })

  test("typing stops after the configured blank rows", () => {
    // 2 data rows + 10 blank rows → rows 3..14
    expect(ws.getCell("C15").dataValidation).toBeUndefined()
  })

  test("required columns disallow blank, optional ones allow it", () => {
    // ExcelJS omits allowBlank when false (the OOXML default)
    expect(ws.getCell("C5").dataValidation?.allowBlank).toBeFalsy()
    expect(ws.getCell("D5").dataValidation?.allowBlank).toBe(true)
  })

  test("date column gets date validation and date format on blank cells", () => {
    const cell = ws.getCell("B4") // Bob has no birthdate
    expect(cell.dataValidation?.type).toBe("date")
    expect(ws.getCell("B10").numFmt).toBe("yyyy-mm-dd")
    expect(ws.getCell("B10").dataValidation?.prompt).toContain("YYYY-MM-DD")
  })

  test("number column gets decimal validation", () => {
    expect(ws.getCell("D4").dataValidation?.type).toBe("decimal")
    expect(ws.getCell("D12").dataValidation?.type).toBe("decimal")
  })

  test("boolean column gets a TRUE/FALSE dropdown", () => {
    const dv = ws.getCell("E8").dataValidation
    expect(dv?.type).toBe("list")
    expect(dv?.formulae?.[0]).toBe('"TRUE,FALSE"')
  })

  test("string column is text-formatted with no validation", () => {
    expect(ws.getCell("A10").numFmt).toBe("@")
    expect(ws.getCell("A10").dataValidation).toBeUndefined()
  })

  test("blank typed rows are not read back as data", async () => {
    const sheets = await toYamlAll(OUTPUT, schema)
    expect(sheets.get("Sheet1")).toHaveLength(2)
  })

  test("blankRows: 0 types only the data rows", async () => {
    await toExcel(rows, schema, NO_BLANK, "Sheet1", { blankRows: 0 })
    const sheet = (await open(NO_BLANK)).worksheets[0]
    expect(sheet.getCell("C4").dataValidation?.type).toBe("list")
    expect(sheet.getCell("C5").dataValidation).toBeUndefined()
  })
})

describe("long or comma-containing option lists", () => {
  const longOptions = Array.from(
    { length: 40 },
    (_, i) => `Capability option ${i}`,
  )
  const longSchema: Schema = {
    columns: [
      { field: "name", header: "Name", type: "string", required: true },
      { field: "area", header: "Area", type: "options", options: longOptions },
      {
        field: "phase",
        header: "Phase",
        type: "options",
        options: ["Live, partial", "Live, full"],
      },
    ],
  }
  const longRows = [
    { name: "a", area: "Capability option 39", phase: "Live, partial" },
  ]

  beforeAll(async () => {
    await toExcel(longRows, longSchema, LONG, "Data", { blankRows: 5 })
  })

  test("lists go to a hidden sheet referenced by range", async () => {
    const wb = await open(LONG)
    const lists = wb.getWorksheet(OPTIONS_SHEET)
    expect(lists?.state).toBe("veryHidden")

    const data = wb.getWorksheet("Data") as ExcelJS.Worksheet
    expect(data.getCell("B2").dataValidation?.formulae?.[0]).toBe(
      `'${OPTIONS_SHEET}'!$A$1:$A$40`,
    )
    expect(data.getCell("C2").dataValidation?.formulae?.[0]).toBe(
      `'${OPTIONS_SHEET}'!$B$1:$B$2`,
    )
    expect(lists?.getCell("B1").value).toBe("Live, partial")
  })

  test("Excel → YAML skips the hidden lists sheet", async () => {
    const sheets = await toYamlAll(LONG, longSchema)
    expect([...sheets.keys()]).toEqual(["Data"])
    expect(sheets.get("Data")).toEqual(longRows)
  })
})

describe("boolean read-back", () => {
  const BOOL = "/tmp/test-column-types-bool.xlsx"
  afterAll(() => {
    if (existsSync(BOOL)) unlinkSync(BOOL)
  })

  test('text "FALSE" / "TRUE" cells are parsed, not coerced to true', async () => {
    const boolSchema: Schema = {
      columns: [{ field: "flag", header: "Flag", type: "boolean" }],
    }
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("S")
    ws.addRow(["Flag"])
    ws.addRow(["FALSE"])
    ws.addRow(["TRUE"])
    await wb.xlsx.writeFile(BOOL)

    const sheets = await toYamlAll(BOOL, boolSchema)
    expect(sheets.get("S")).toEqual([{ flag: false }, { flag: true }])
  })
})
