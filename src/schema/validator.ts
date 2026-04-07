import type { Schema, ColumnSchema, ValidationError } from "../types"
import { buildZodSchema } from "./loader"

export function validateRows(
  rows: Record<string, unknown>[],
  schema: Schema
): ValidationError[] {
  const zodSchema = buildZodSchema(schema)
  const errors: ValidationError[] = []

  rows.forEach((row, index) => {
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
