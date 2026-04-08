import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import utc from "dayjs/plugin/utc"
import ExcelJS from "exceljs"
import type { Schema } from "../types"

dayjs.extend(customParseFormat)
dayjs.extend(utc)

export function sanitizeSheetName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_")
}

export async function toYaml(
  inputPath: string,
  schema: Schema,
): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputPath)
  return convertSheet(wb.worksheets[0], schema)
}

export async function toYamlAll(
  inputPath: string,
  schema: Schema,
): Promise<Map<string, Record<string, unknown>[]>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(inputPath)
  const result = new Map<string, Record<string, unknown>[]>()
  for (const ws of wb.worksheets) {
    result.set(ws.name, convertSheet(ws, schema))
  }
  return result
}

function convertSheet(
  ws: ExcelJS.Worksheet,
  schema: Schema,
): Record<string, unknown>[] {
  const schemaHeaders = new Set(schema.columns.map((c) => c.header))
  const headerRowNum = detectHeaderRow(ws, schemaHeaders)
  const dataStartRow = headerRowNum + 1

  const colIndexToField = new Map<number, string>()
  const headerRow = ws.getRow(headerRowNum)
  ;(headerRow.values as unknown[]).forEach((val, idx) => {
    if (typeof val === "string") {
      const col = schema.columns.find((c) => c.header === val)
      if (col) colIndexToField.set(idx, col.field)
    }
  })

  const rows: Record<string, unknown>[] = []

  ws.eachRow((row, rowNum) => {
    if (rowNum < dataStartRow) return

    const obj: Record<string, unknown> = {}
    ;(row.values as unknown[]).forEach((cellValue, colIdx) => {
      const field = colIndexToField.get(colIdx)
      if (!field) return

      const col = schema.columns.find((c) => c.field === field)
      if (!col) return

      if (cellValue === null || cellValue === undefined || cellValue === "")
        return

      if (col.type === "date") {
        if (cellValue instanceof Date) {
          obj[field] = dayjs.utc(cellValue).format(col.format ?? "YYYY-MM-DD")
        } else if (typeof cellValue === "string") {
          obj[field] = cellValue.trim()
        }
      } else if (col.type === "number") {
        obj[field] =
          typeof cellValue === "number" ? cellValue : Number(cellValue)
      } else if (col.type === "boolean") {
        obj[field] = Boolean(cellValue)
      } else {
        obj[field] = String(cellValue).trim()
      }
    })

    if (Object.keys(obj).length > 0) rows.push(obj)
  })

  return rows
}

function detectHeaderRow(
  ws: ExcelJS.Worksheet,
  schemaHeaders: Set<string>,
): number {
  const row1Values = (ws.getRow(1).values as unknown[]).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  )

  const allMatch =
    row1Values.length > 0 && row1Values.every((v) => schemaHeaders.has(v))
  return allMatch ? 1 : 2
}
