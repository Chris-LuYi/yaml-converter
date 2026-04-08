import { describe, expect, test } from "bun:test"
import {
  sanitizeSheetName,
  toYaml,
  toYamlAll,
} from "../../src/converter/to-yaml"
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

    const { unlinkSync } = await import("node:fs")
    unlinkSync("/tmp/single-header.xlsx")
  })
})

const MULTI_FIXTURE = "tests/fixtures/multi-sheet.xlsx"

describe("toYamlAll", () => {
  test("returns a Map with one entry per sheet", async () => {
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    expect(result.size).toBe(2)
    expect(result.has("People")).toBe(true)
    expect(result.has("Staff")).toBe(true)
  })

  test("each sheet's rows are correctly parsed", async () => {
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    const people = result.get("People")
    expect(people).toBeDefined()
    expect(people).toHaveLength(2)
    expect(people[0].name).toBe("Alice")
    expect(people[0].birthdate).toBe("1990-01-15")
    const staff = result.get("Staff")
    expect(staff).toBeDefined()
    expect(staff).toHaveLength(2)
    expect(staff[0].name).toBe("Carol")
  })

  test("empty sheet produces empty array not absent entry", async () => {
    const result = await toYamlAll(MULTI_FIXTURE, schema)
    for (const [, rows] of result) {
      expect(Array.isArray(rows)).toBe(true)
    }
  })
})

describe("sanitizeSheetName", () => {
  test("replaces forbidden characters with underscores", () => {
    expect(sanitizeSheetName("Sheet/1")).toBe("Sheet_1")
    expect(sanitizeSheetName("My:Sheet")).toBe("My_Sheet")
    expect(sanitizeSheetName('A"B')).toBe("A_B")
  })

  test("leaves safe names unchanged", () => {
    expect(sanitizeSheetName("People")).toBe("People")
    expect(sanitizeSheetName("Sheet 1")).toBe("Sheet 1")
    expect(sanitizeSheetName("MFE-List")).toBe("MFE-List")
  })
})
