import {
  COMMENTS_KEY,
  type ColumnSchema,
  type Schema,
  type ValidationError,
} from "../types"
import { buildZodSchema } from "./loader"

export function validateRows(
  rows: Record<string, unknown>[],
  schema: Schema,
): ValidationError[] {
  const zodSchema = buildZodSchema(schema)
  const errors: ValidationError[] = []

  const fields = new Set(schema.columns.map((c) => c.field))

  rows.forEach((row, index) => {
    errors.push(...validateComments(row, index + 1, fields))
    const result = zodSchema.safeParse(row)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = (issue.path[0] as string | undefined) ?? "__row__"
        const col = schema.columns.find((c) => c.field === field)
        errors.push({
          row: index + 1,
          field,
          expected: formatExpected(col),
          actual: row[field],
          message: issue.message,
        })
      }
    }
  })

  return errors
}

function validateComments(
  row: Record<string, unknown>,
  rowNum: number,
  fields: Set<string>,
): ValidationError[] {
  const raw = row?.[COMMENTS_KEY]
  if (raw === undefined || raw === null) return []
  const expected = "map of schema field → comment text"
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return [
      {
        row: rowNum,
        field: COMMENTS_KEY,
        expected,
        actual: raw,
        message: `${COMMENTS_KEY} must be a map of field names to text`,
      },
    ]
  }
  const errors: ValidationError[] = []
  for (const [field, text] of Object.entries(raw)) {
    if (!fields.has(field)) {
      errors.push({
        row: rowNum,
        field: COMMENTS_KEY,
        expected,
        actual: field,
        message: `Comment for unknown field '${field}'`,
      })
    } else if (typeof text !== "string") {
      errors.push({
        row: rowNum,
        field: COMMENTS_KEY,
        expected,
        actual: text,
        message: `Comment for '${field}' must be text`,
      })
    }
  }
  return errors
}

function formatExpected(col: ColumnSchema | undefined): string {
  if (!col) return "unknown"
  switch (col.type) {
    case "options":
      return `options: ${col.options?.join(" | ")}`
    case "date":
      return `date in format ${col.format ?? "YYYY-MM-DD"}`
    default:
      return col.type
  }
}
