import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import utc from "dayjs/plugin/utc"
import ExcelJS from "exceljs"
import type { ExcelStyle, Schema } from "../types"

dayjs.extend(customParseFormat)
dayjs.extend(utc)

// ── Style defaults (overridden by yaml-converter.config.yaml) ─────────────────
const DEFAULT_STYLE: Required<ExcelStyle> = {
  fontName: "Public Sans",
  fontSizeHeader: 11,
  fontSizeData: 10,
  colorGroupBg: "1F4E79", // deep navy   — group header row
  colorGroupFg: "FFFFFF",
  colorHeaderBg: "2E75B6", // medium blue — field header row
  colorHeaderFg: "FFFFFF",
  colMinWidth: 8,
  colMaxWidth: 50,
  rowHeightHeader: 20,
  rowHeightData: 18,
}

function resolveStyle(overrides?: ExcelStyle): Required<ExcelStyle> {
  return { ...DEFAULT_STYLE, ...overrides }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function clampWidth(raw: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, raw))
}

function styleHeaderCell(
  cell: ExcelJS.Cell,
  bgArgb: string,
  fgArgb: string,
  fontName: string,
  fontSize: number,
): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } }
  cell.font = {
    name: fontName,
    size: fontSize,
    bold: true,
    color: { argb: fgArgb },
  }
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
}

function addSheetToWorkbook(
  wb: ExcelJS.Workbook,
  rows: Record<string, unknown>[],
  schema: Schema,
  sheetName: string,
  style: Required<ExcelStyle>,
): void {
  const ws = wb.addWorksheet(sheetName)

  const hasGroups = schema.columns.some((c) => c.group)
  const headerRowNum = hasGroups ? 2 : 1

  // ── Group header row ─────────────────────────────────────────────────────────
  if (hasGroups) {
    addGroupHeaderRow(ws, schema)
    ws.getRow(1).height = style.rowHeightHeader
    ws.getRow(1).eachCell((cell) => {
      if (cell.value)
        styleHeaderCell(
          cell,
          style.colorGroupBg,
          style.colorGroupFg,
          style.fontName,
          style.fontSizeHeader,
        )
    })
  }

  // ── Field header row ─────────────────────────────────────────────────────────
  const headerRow = ws.addRow(schema.columns.map((c) => c.header))
  headerRow.height = style.rowHeightHeader
  headerRow.eachCell((cell) =>
    styleHeaderCell(
      cell,
      style.colorHeaderBg,
      style.colorHeaderFg,
      style.fontName,
      style.fontSizeHeader,
    ),
  )

  ws.views = [{ state: "frozen", ySplit: headerRowNum }]

  const lastCol = ws.getColumn(schema.columns.length).letter
  ws.autoFilter = `A${headerRowNum}:${lastCol}${headerRowNum}`

  // ── Track max content width per column ───────────────────────────────────────
  const colWidths = schema.columns.map((c) =>
    clampWidth(
      c.header.length * 1.15 + 2,
      style.colMinWidth,
      style.colMaxWidth,
    ),
  )

  // ── Data rows ────────────────────────────────────────────────────────────────
  for (const row of rows) {
    const excelRow = ws.addRow([])
    excelRow.height = style.rowHeightData
    schema.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const value = row[col.field]

      cell.font = { name: style.fontName, size: style.fontSizeData }
      cell.alignment = { vertical: "middle", wrapText: false }

      if (value === undefined || value === null) {
        cell.value = null
        return
      }

      if (col.type === "date" && typeof value === "string") {
        const date = dayjs.utc(value, col.format ?? "YYYY-MM-DD", true)
        if (date.isValid()) {
          cell.value = date.toDate()
          cell.numFmt = toExcelDateFmt(col.format ?? "YYYY-MM-DD")
          colWidths[colIdx] = Math.max(
            colWidths[colIdx],
            clampWidth(
              value.length * 1.15 + 2,
              style.colMinWidth,
              style.colMaxWidth,
            ),
          )
        } else {
          cell.value = value
          colWidths[colIdx] = Math.max(
            colWidths[colIdx],
            clampWidth(
              value.length * 1.15 + 2,
              style.colMinWidth,
              style.colMaxWidth,
            ),
          )
        }
      } else if (col.type === "number") {
        cell.value = typeof value === "number" ? value : Number(value)
        colWidths[colIdx] = Math.max(
          colWidths[colIdx],
          clampWidth(
            cellText(value).length * 1.15 + 2,
            style.colMinWidth,
            style.colMaxWidth,
          ),
        )
      } else if (col.type === "boolean") {
        cell.value = Boolean(value)
        colWidths[colIdx] = Math.max(
          colWidths[colIdx],
          clampWidth(
            cellText(value).length * 1.15 + 2,
            style.colMinWidth,
            style.colMaxWidth,
          ),
        )
      } else {
        cell.value = String(value)
        colWidths[colIdx] = Math.max(
          colWidths[colIdx],
          clampWidth(
            String(value).length * 1.15 + 2,
            style.colMinWidth,
            style.colMaxWidth,
          ),
        )
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

  // ── Apply column widths ──────────────────────────────────────────────────────
  schema.columns.forEach((_, idx) => {
    ws.getColumn(idx + 1).width = colWidths[idx]
  })
}

export async function toExcel(
  rows: Record<string, unknown>[],
  schema: Schema,
  outputPath: string,
  sheetName = "Sheet1",
  styleOverrides?: ExcelStyle,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  addSheetToWorkbook(wb, rows, schema, sheetName, resolveStyle(styleOverrides))
  await wb.xlsx.writeFile(outputPath)
}

export async function toExcelMulti(
  sheets: Array<{
    name: string
    rows: Record<string, unknown>[]
    schema: Schema
  }>,
  outputPath: string,
  styleOverrides?: ExcelStyle,
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const style = resolveStyle(styleOverrides)
  for (const { name, rows, schema } of sheets) {
    addSheetToWorkbook(wb, rows, schema, name, style)
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
    const span = groupSpans.get(col.group)
    if (!span) return
    if (span.start === colNum) {
      row.getCell(colNum).value = col.group
      if (span.start !== span.end) {
        ws.mergeCells(1, span.start, 1, span.end)
      }
    }
  })
}

function toExcelDateFmt(fmt: string): string {
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
