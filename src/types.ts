export type FieldType = "string" | "number" | "date" | "boolean" | "options"

export interface ColumnSchema {
  field: string
  header: string
  group?: string
  type: FieldType
  format?: string // date only — dayjs format string e.g. "YYYY-MM-DD"
  options?: string[] // options only
  required?: boolean
}

export interface Schema {
  columns: ColumnSchema[]
}

export interface ValidationError {
  row: number // 1-based data row index (not Excel row number)
  field: string
  expected: string
  actual: unknown
  message: string
  sheet?: string // populated for multi-sheet conversions
}

export interface ErrorOutput {
  summary: {
    total: number
    file: string
  }
  errors: ValidationError[]
}

export interface ExcelStyle {
  fontName?: string
  fontSizeHeader?: number
  fontSizeData?: number
  colorGroupBg?: string   // ARGB hex, e.g. "1F4E79"
  colorGroupFg?: string
  colorHeaderBg?: string
  colorHeaderFg?: string
  colMinWidth?: number
  colMaxWidth?: number
  rowHeightHeader?: number
  rowHeightData?: number
}

export interface AppConfig {
  excel?: {
    style?: ExcelStyle
  }
}

export interface ConvertOptions {
  input: string
  output?: string
  schema?: string
  validate?: boolean
  errorOutput?: string
  json?: boolean
  sheetSchemas?: string // placeholder — not yet implemented
  recursive?: boolean
  merge?: boolean
  tagField?: string
  splitBy?: string
  dropField?: string
}
