import ExcelJS from "exceljs"
import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import utc from "dayjs/plugin/utc"
import type { Schema } from "../types"

dayjs.extend(customParseFormat)
dayjs.extend(utc)

export async function toExcel(
  rows: Record<string, unknown>[],
  schema: Schema,
  outputPath: string
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Sheet1")

  const hasGroups = schema.columns.some((c) => c.group)
  const headerRowNum = hasGroups ? 2 : 1
  if (hasGroups) {
    addGroupHeaderRow(ws, schema)
  }

  ws.addRow(schema.columns.map((c) => c.header))
  ws.views = [{ state: "frozen", ySplit: headerRowNum }]

  for (const row of rows) {
    const excelRow = ws.addRow([])
    schema.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const value = row[col.field]

      if (value === undefined || value === null) {
        cell.value = null
        return
      }

      if (col.type === "date" && typeof value === "string") {
        const date = dayjs.utc(value, col.format ?? "YYYY-MM-DD", true)
        if (date.isValid()) {
          cell.value = date.toDate()
          cell.numFmt = toExcelDateFmt(col.format ?? "YYYY-MM-DD")
        } else {
          cell.value = value  // preserve original string rather than silently dropping
        }
      } else if (col.type === "number") {
        cell.value = typeof value === "number" ? value : Number(value)
      } else if (col.type === "boolean") {
        cell.value = Boolean(value)
      } else {
        cell.value = String(value)
      }

      if (col.type === "options" && col.options) {
        cell.dataValidation = {
          type: "list",
          allowBlank: !col.required,
          formulae: [`"${col.options.join(",")}"`],
        }
      }
    })
  }

  await wb.xlsx.writeFile(outputPath)
}

function addGroupHeaderRow(ws: ExcelJS.Worksheet, schema: Schema) {
  const row = ws.addRow([])

  const groupSpans = new Map<string, { start: number; end: number }>()
  schema.columns.forEach((col, idx) => {
    const colNum = idx + 1
    if (!col.group) return
    const existing = groupSpans.get(col.group)
    if (!existing) {
      groupSpans.set(col.group, { start: colNum, end: colNum })
    } else {
      existing.end = colNum
    }
  })

  schema.columns.forEach((col, idx) => {
    const colNum = idx + 1
    if (!col.group) return
    const span = groupSpans.get(col.group)!
    if (span.start === colNum) {
      row.getCell(colNum).value = col.group
      if (span.start !== span.end) {
        ws.mergeCells(1, span.start, 1, span.end)
      }
    }
  })
}

function toExcelDateFmt(fmt: string): string {
  // Map dayjs tokens to Excel numFmt tokens (common subset)
  return fmt
    .replace(/YYYY/g, "yyyy")
    .replace(/YY/g, "yy")
    .replace(/MMMM/g, "mmmm")
    .replace(/MMM/g, "mmm")
    .replace(/MM/g, "mm")
    .replace(/M/g, "m")
    .replace(/DDDD/g, "dddd")
    .replace(/DDD/g, "ddd")
    .replace(/DD/g, "dd")
    .replace(/D/g, "d")
    .replace(/HH/g, "hh")
    .replace(/H/g, "h")
    .replace(/ss/g, "ss")
    .replace(/s/g, "s")
}
