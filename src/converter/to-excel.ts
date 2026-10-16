import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import utc from "dayjs/plugin/utc"
import ExcelJS from "exceljs"
import { COMMENTS_KEY, type ExcelStyle, type Schema } from "../types"

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
  blankRows: 1000,
}

// Hidden sheet holding dropdown lists too long (or containing commas/quotes)
// to inline in a validation formula. Skipped when converting Excel → YAML.
export const OPTIONS_SHEET = "_yc_options"

// Excel limits: inline list formula and validation message text.
const MAX_INLINE_LIST = 255
const MAX_MESSAGE = 255
const EXCEL_MAX_NUMBER = 9.99999999999999e307

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
    const comments = rowComments(row)
    schema.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const value = row[col.field]

      cell.font = { name: style.fontName, size: style.fontSizeData }
      cell.alignment = { vertical: "middle", wrapText: false }

      // Comments can sit on empty cells too, so set before the null check
      const comment = comments[col.field]
      if (comment) cell.note = comment

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
    })
  }

  // ── Column typing: data rows + blank rows below, so new entries get it too ──
  const firstDataRow = headerRowNum + 1
  const lastTypedRow = firstDataRow + rows.length + style.blankRows - 1
  if (lastTypedRow >= firstDataRow) {
    applyColumnTypes(wb, ws, schema, firstDataRow, lastTypedRow)
  }

  // ── Apply column widths ──────────────────────────────────────────────────────
  schema.columns.forEach((_, idx) => {
    ws.getColumn(idx + 1).width = colWidths[idx]
  })
}

/** Extract the row's cell comments, ignoring anything that isn't text. */
function rowComments(row: Record<string, unknown>): Record<string, string> {
  const raw = row[COMMENTS_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [field, text] of Object.entries(raw)) {
    if (typeof text === "string" && text.trim()) out[field] = text
  }
  return out
}

function truncate(text: string, max = MAX_MESSAGE): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Build the list formula for an options column: inline when Excel allows it,
 *  otherwise a range on the hidden options sheet. */
function optionsFormula(wb: ExcelJS.Workbook, options: string[]): string {
  const inline = options.join(",")
  const inlineSafe =
    inline.length <= MAX_INLINE_LIST &&
    options.every((o) => !o.includes(",") && !o.includes('"'))
  if (inlineSafe) return `"${inline}"`

  const listSheet =
    wb.getWorksheet(OPTIONS_SHEET) ??
    wb.addWorksheet(OPTIONS_SHEET, { state: "veryHidden" })
  const colNum = listSheet.columnCount + 1
  options.forEach((opt, i) => {
    listSheet.getCell(i + 1, colNum).value = opt
  })
  const letter = listSheet.getColumn(colNum).letter
  return `'${OPTIONS_SHEET}'!$${letter}$1:$${letter}$${options.length}`
}

// Range-based validations exist at runtime but are missing from ExcelJS types
type RangeValidations = {
  dataValidations: { add(range: string, rule: ExcelJS.DataValidation): void }
}

/** Apply schema-driven cell typing to each column over a row range:
 *  number format (so typed values are stored as the right type) and a data
 *  validation rule (dropdown / date / number check) with an input hint. */
function applyColumnTypes(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  schema: Schema,
  firstRow: number,
  lastRow: number,
): void {
  const { dataValidations } = ws as unknown as RangeValidations
  schema.columns.forEach((col, idx) => {
    const column = ws.getColumn(idx + 1)
    const range = `${column.letter}${firstRow}:${column.letter}${lastRow}`
    const base = {
      allowBlank: !col.required,
      showInputMessage: true,
      showErrorMessage: true,
      errorStyle: "stop" as const,
      promptTitle: truncate(col.header, 32),
      errorTitle: truncate(`Invalid ${col.header}`, 32),
    }

    switch (col.type) {
      case "string":
        // Text format stops Excel turning "007" into 7 or "1-2" into a date
        column.numFmt = "@"
        break

      case "options":
        if (!col.options?.length) break
        column.numFmt = "@"
        dataValidations.add(range, {
          ...base,
          type: "list",
          formulae: [optionsFormula(wb, col.options)],
          prompt: truncate(`Choose from the list: ${col.options.join(", ")}`),
          error: truncate(`Must be one of: ${col.options.join(", ")}`),
        })
        break

      case "date": {
        const fmt = col.format ?? "YYYY-MM-DD"
        column.numFmt = toExcelDateFmt(fmt)
        dataValidations.add(range, {
          ...base,
          type: "date",
          operator: "greaterThan",
          formulae: [new Date(Date.UTC(1900, 0, 1))],
          prompt: `Enter a date (${fmt})`,
          error: `Must be a valid date (${fmt})`,
        })
        break
      }

      case "number":
        dataValidations.add(range, {
          ...base,
          type: "decimal",
          operator: "between",
          formulae: [-EXCEL_MAX_NUMBER, EXCEL_MAX_NUMBER],
          prompt: "Enter a number",
          error: "Must be a number",
        })
        break

      case "boolean":
        dataValidations.add(range, {
          ...base,
          type: "list",
          formulae: ['"TRUE,FALSE"'],
          prompt: "Choose TRUE or FALSE",
          error: "Must be TRUE or FALSE",
        })
        break
    }
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
