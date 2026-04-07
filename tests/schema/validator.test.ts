import { describe, expect, test } from "bun:test"
import { validateRows } from "../../src/schema/validator"
import type { Schema } from "../../src/types"

const schema: Schema = {
  columns: [
    { field: "name", header: "Name", type: "string", required: true },
    {
      field: "birthdate",
      header: "Date of Birth",
      type: "date",
      format: "YYYY-MM-DD",
    },
    {
      field: "status",
      header: "Status",
      type: "options",
      options: ["Active", "Inactive", "Pending"],
      required: true,
    },
    { field: "score", header: "Score", type: "number" },
  ],
}

describe("validateRows", () => {
  test("returns empty array for valid rows", () => {
    const rows = [
      { name: "Alice", birthdate: "1990-01-15", status: "Active", score: 95 },
    ]
    expect(validateRows(rows, schema)).toEqual([])
  })

  test("returns error for invalid option value", () => {
    const rows = [{ name: "Bob", status: "Archived" }]
    const errors = validateRows(rows, schema)
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe("status")
    expect(errors[0].expected).toContain("Active")
    expect(errors[0].actual).toBe("Archived")
  })

  test("returns error for missing required field", () => {
    const rows = [{ status: "Active" }] // name missing
    const errors = validateRows(rows, schema)
    expect(errors.some((e) => e.field === "name")).toBe(true)
  })

  test("row numbers are 1-based", () => {
    const rows = [
      { name: "Alice", status: "Active" },
      { name: "Bob", status: "Archived" }, // error on data row 2
    ]
    const errors = validateRows(rows, schema)
    expect(errors[0].row).toBe(2)
  })

  test("optional fields may be absent without error", () => {
    const rows = [{ name: "Alice", status: "Active" }] // no score, no birthdate
    expect(validateRows(rows, schema)).toEqual([])
  })

  test("returns error for invalid date string", () => {
    const rows = [{ name: "Alice", status: "Active", birthdate: "31-12-1990" }] // wrong format
    const errors = validateRows(rows, schema)
    expect(errors.some((e) => e.field === "birthdate")).toBe(true)
  })

  test("error shape matches ErrorOutput spec", () => {
    const rows = [{ name: "Alice", status: "Archived" }]
    const errors = validateRows(rows, schema)
    expect(errors[0]).toMatchObject({
      row: expect.any(Number),
      field: expect.any(String),
      expected: expect.any(String),
      message: expect.any(String),
    })
  })
})
