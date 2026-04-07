import { readFileSync } from "fs"
import { parse } from "yaml"
import { z, type ZodTypeAny } from "zod"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import type { Schema, ColumnSchema } from "../types"

dayjs.extend(customParseFormat)

export function loadSchema(schemaPath: string): Schema {
  const content = readFileSync(schemaPath, "utf-8")
  const raw = parse(content) as Schema
  if (!raw?.columns || !Array.isArray(raw.columns)) {
    throw new Error(`Invalid schema: missing 'columns' array in ${schemaPath}`)
  }
  return raw
}

export function buildZodSchema(schema: Schema): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {}
  for (const col of schema.columns) {
    shape[col.field] = buildFieldZod(col)
  }
  return z.object(shape)
}

function buildFieldZod(col: ColumnSchema): ZodTypeAny {
  let field: ZodTypeAny

  switch (col.type) {
    case "string":
      field = col.required ? z.string().min(1, `${col.field} is required`) : z.string()
      break

    case "number":
      field = z.number()
      break

    case "date": {
      const fmt = col.format ?? "YYYY-MM-DD"
      field = z.string().refine(
        (val) => dayjs(val, fmt, true).isValid(),
        { message: `Must be a valid date in format ${fmt}` }
      )
      break
    }

    case "boolean":
      field = z.boolean()
      break

    case "options":
      if (!col.options?.length) throw new Error(`Column '${col.field}' has type 'options' but no options defined`)
      field = z.enum(col.options as [string, ...string[]])
      break

    default:
      throw new Error(`Unknown field type: ${(col as ColumnSchema).type}`)
  }

  if (!col.required) {
    field = field.optional().nullable()
  }

  return field
}
