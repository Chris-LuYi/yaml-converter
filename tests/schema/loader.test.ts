import { describe, expect, test } from "bun:test"
import { unlinkSync, writeFileSync } from "node:fs"
import { buildZodSchema, loadSchema } from "../../src/schema/loader"

const FIXTURE_SCHEMA = `
columns:
  - field: name
    header: Name
    type: string
    required: true
  - field: score
    header: Score
    type: number
  - field: status
    header: Status
    type: options
    options: [Active, Inactive]
    required: true
  - field: birthday
    header: Birthday
    type: date
    format: YYYY-MM-DD
  - field: active
    header: Active
    type: boolean
`

describe("loadSchema", () => {
  test("parses a valid schema YAML", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    expect(schema.columns).toHaveLength(5)
    expect(schema.columns[0].field).toBe("name")
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("throws on missing file", () => {
    expect(() => loadSchema("/tmp/nonexistent-schema.yaml")).toThrow()
  })
})

describe("buildZodSchema", () => {
  test("required string rejects empty string", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "", status: "Active" })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("options field rejects invalid value", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "Alice", status: "Archived" })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("optional fields allow null and undefined", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({ name: "Alice", status: "Active" }) // score, birthday, active absent
    expect(result.success).toBe(true)
    unlinkSync("/tmp/test-schema.yaml")
  })

  test("date field rejects non-date string", () => {
    writeFileSync("/tmp/test-schema.yaml", FIXTURE_SCHEMA)
    const schema = loadSchema("/tmp/test-schema.yaml")
    const zod = buildZodSchema(schema)
    const result = zod.safeParse({
      name: "Alice",
      status: "Active",
      birthday: "not-a-date",
    })
    expect(result.success).toBe(false)
    unlinkSync("/tmp/test-schema.yaml")
  })
})
