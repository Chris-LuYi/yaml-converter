import { describe, test, expect } from "bun:test"
import { toYaml } from "../../src/converter/to-yaml"
import { loadSchema } from "../../src/schema/loader"

const schema = loadSchema("tests/fixtures/schema.yaml")
const FIXTURE_XLSX = "tests/fixtures/data.xlsx"

describe("toYaml", () => {
  test("reads all data rows from xlsx", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows).toHaveLength(2)
  })

  test("string fields are read correctly", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].name).toBe("Alice")
    expect(rows[1].name).toBe("Bob")
  })

  test("date cells are returned as YYYY-MM-DD strings", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].birthdate).toBe("1990-01-15")
  })

  test("boolean cells are returned as JS booleans", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].verified).toBe(true)
    expect(rows[1].verified).toBe(false)
  })

  test("number cells are returned as JS numbers", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[0].score).toBe(95)
  })

  test("missing optional fields are omitted from output", async () => {
    const rows = await toYaml(FIXTURE_XLSX, schema)
    expect(rows[1].birthdate).toBeUndefined()
  })

  test("works with single-header-row xlsx (no group row)", async () => {
    const ExcelJS = (await import("exceljs")).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Sheet1")
    ws.addRow(["Name", "Status"])
    ws.addRow(["Charlie", "Active"])
    await wb.xlsx.writeFile("/tmp/single-header.xlsx")

    const rows = await toYaml("/tmp/single-header.xlsx", schema)
    expect(rows[0].name).toBe("Charlie")
    expect(rows[0].status).toBe("Active")

    const { unlinkSync } = await import("fs")
    unlinkSync("/tmp/single-header.xlsx")
  })
})
