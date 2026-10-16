import { afterAll, describe, expect, test } from "bun:test"
import { existsSync, unlinkSync } from "node:fs"
import ExcelJS from "exceljs"
import { toExcel } from "../../src/converter/to-excel"
import { toYamlAll } from "../../src/converter/to-yaml"
import { loadSchema } from "../../src/schema/loader"
import { validateRows } from "../../src/schema/validator"

const schema = loadSchema("tests/fixtures/schema.yaml")
// Columns: A name, B birthdate, C status, D score, E verified. Data at row 3.
const rows = [
  {
    name: "Alice",
    status: "Active",
    score: 95,
    _comments: {
      status: "Confirmed by ops on 2026-10-01",
      birthdate: "Waiting on HR", // comment on an empty cell
    },
  },
  { name: "Bob", status: "Inactive" },
]

const OUTPUT = "/tmp/test-comments.xlsx"

afterAll(() => {
  if (existsSync(OUTPUT)) unlinkSync(OUTPUT)
})

describe("cell comments", () => {
  test("_comments become Excel notes, including on empty cells", async () => {
    await toExcel(rows, schema, OUTPUT)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(OUTPUT)
    const ws = wb.worksheets[0]

    const noteText = (addr: string) =>
      JSON.stringify(ws.getCell(addr).note ?? null)
    expect(noteText("C3")).toContain("Confirmed by ops on 2026-10-01")
    expect(noteText("B3")).toContain("Waiting on HR")
    expect(ws.getCell("B3").value).toBeNull()
    expect(ws.getCell("A3").note).toBeUndefined()
    expect(ws.getCell("C4").note).toBeUndefined()
  })

  test("notes are read back into _comments (Excel → YAML round-trip)", async () => {
    const sheets = await toYamlAll(OUTPUT, schema)
    expect(sheets.get("Sheet1")).toEqual(rows)
  })

  test("valid _comments pass validation", () => {
    expect(validateRows(rows, schema)).toEqual([])
  })

  test("comment for an unknown field is a validation error", () => {
    const errors = validateRows(
      [{ name: "A", status: "Active", _comments: { nmae: "typo" } }],
      schema,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ row: 1, field: "_comments" })
    expect(errors[0].message).toContain("nmae")
  })

  test("non-map or non-text comments are validation errors", () => {
    const errors = validateRows(
      [
        { name: "A", status: "Active", _comments: "oops" },
        { name: "B", status: "Active", _comments: { status: 42 } },
      ],
      schema,
    )
    expect(errors.map((e) => e.row)).toEqual([1, 2])
    expect(errors.every((e) => e.field === "_comments")).toBe(true)
  })
})
