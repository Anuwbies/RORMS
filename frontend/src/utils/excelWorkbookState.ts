import type { CSSProperties } from 'react'
import type { CellAddress, Range, WorkBook } from 'xlsx'
import type { ExcelPreviewStyles, SheetPreviewFormatting } from './excelPreviewStyles'
import type { ScheduleSetup } from './excelScheduleTemplate'
import type { SheetHiddenRanges } from './excelHiddenRanges'
import { materializeScheduleStatuses } from './excelScheduleStatusColumn.ts'

export interface WorkbookSelection {
  anchor: CellAddress
  focus: CellAddress
  axis?: 'row' | 'column'
  anchorStatus?: boolean
  focusStatus?: boolean
}

export interface WorkbookEditSnapshot {
  workbook: WorkBook
  previewStyles: ExcelPreviewStyles | null
  sheetColors: Map<string, string>
  addedRowsBySheet: Map<string, number>
  rowHeightOverrides: Map<string, Map<number, number>>
  columnWidthOverrides: Map<string, Map<number, number>>
  cellTextOverrides: Map<string, Map<string, string>>
  cellStyleOverrides: Map<string, Map<string, CSSProperties>>
  mergeOverrides: Map<string, Range[]>
  formattingOverrides: Map<string, SheetPreviewFormatting>
  scheduleSetups: Map<string, ScheduleSetup>
  hiddenRangeToggles: Map<string, SheetHiddenRanges>
  selectedSheet: string
  selection: WorkbookSelection
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
const TYPE_KEY = '$workbookType'

function encode(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date) return { [TYPE_KEY]: 'date', value: value.toISOString() }
  if (value instanceof Map) return { [TYPE_KEY]: 'map', entries: [...value].map(([key, item]) => [encode(key), encode(item)]) }
  if (value instanceof Uint8Array) return { [TYPE_KEY]: 'bytes', values: [...value] }
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : encode(item))
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)]))
  throw new Error('The workbook contains a value that cannot be saved.')
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map)
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (!object(value)) return value
  if (value[TYPE_KEY] === 'map') {
    if (!Array.isArray(value.entries) || value.entries.some(entry => !Array.isArray(entry) || entry.length !== 2)) throw new Error('Invalid saved workbook map.')
    return new Map(value.entries.map(entry => [decode(entry[0]), decode(entry[1])]))
  }
  if (value[TYPE_KEY] === 'date') {
    if (typeof value.value !== 'string' || !Number.isFinite(Date.parse(value.value))) throw new Error('Invalid saved workbook date.')
    return new Date(value.value)
  }
  if (value[TYPE_KEY] === 'bytes') {
    if (!Array.isArray(value.values) || value.values.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('Invalid saved workbook bytes.')
    return Uint8Array.from(value.values)
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]))
}

export function serializeWorkbookState(snapshot: WorkbookEditSnapshot): string {
  snapshot = materializeScheduleStatuses(snapshot)
  // The original XLSX already holds the XML files; keep them out of every revision.
  const previewStyles = snapshot.previewStyles ? { ...snapshot.previewStyles, files: undefined } : null
  return JSON.stringify(encode({ version: 1, snapshot: { ...snapshot, previewStyles } }))
}

export function deserializeWorkbookState(json: string, originalFiles: Record<string, Uint8Array>): WorkbookEditSnapshot {
  const saved = decode(JSON.parse(json))
  if (!object(saved) || saved.version !== 1 || !object(saved.snapshot)) throw new Error('This saved workbook version is not supported.')
  const snapshot = saved.snapshot
  const workbook = snapshot.workbook
  if (!object(workbook) || !Array.isArray(workbook.SheetNames)
    || workbook.SheetNames.some(name => typeof name !== 'string') || new Set(workbook.SheetNames).size !== workbook.SheetNames.length
    || !object(workbook.Sheets)) throw new Error('The saved workbook is invalid.')
  const sheets = workbook.Sheets
  if (workbook.SheetNames.some(name => !object(sheets[name]))) throw new Error('The saved workbook is invalid.')
  if (typeof snapshot.selectedSheet !== 'string' || (workbook.SheetNames.length ? !workbook.SheetNames.includes(snapshot.selectedSheet) : snapshot.selectedSheet !== '' || Object.keys(sheets).length !== 0)) throw new Error('The saved sheet could not be found.')
  const mapKeys = ['sheetColors', 'addedRowsBySheet', 'rowHeightOverrides', 'columnWidthOverrides', 'cellTextOverrides', 'cellStyleOverrides', 'mergeOverrides', 'formattingOverrides', 'scheduleSetups', 'hiddenRangeToggles']
  if (mapKeys.some(key => !(snapshot[key] instanceof Map))) throw new Error('The saved workbook settings are invalid.')
  for (const key of ['rowHeightOverrides', 'columnWidthOverrides', 'cellTextOverrides', 'cellStyleOverrides']) {
    for (const value of (snapshot[key] as Map<unknown, unknown>).values()) if (!(value instanceof Map)) throw new Error('The saved cell settings are invalid.')
  }
  for (const value of (snapshot.scheduleSetups as Map<unknown, unknown>).values()) {
    if (!object(value) || !(value.years instanceof Map) || !Array.isArray(value.columns)) throw new Error('The saved schedule setup is invalid.')
    if (value.statusColumn !== undefined && (!Number.isInteger(value.statusColumn) || Number(value.statusColumn) < 0 || Number(value.statusColumn) >= 16384)) throw new Error('The saved status column is invalid.')
    if (value.rowStatuses !== undefined && (!(value.rowStatuses instanceof Map)
      || [...value.rowStatuses].some(([row, status]) => !Number.isInteger(row) || row < 0 || row >= 1048576 || status !== 'Plot'))) throw new Error('The saved schedule row statuses are invalid.')
    if (value.statusStyles !== undefined && (!(value.statusStyles instanceof Map)
      || [...value.statusStyles].some(([row, style]) => !Number.isInteger(row) || row < 0 || row >= 1048576 || !object(style)))) throw new Error('The saved status formatting is invalid.')
  }
  for (const value of (snapshot.formattingOverrides as Map<unknown, unknown>).values()) {
    if (!object(value) || !(value.indexes instanceof Map) || !(value.rowIndexes instanceof Map) || !Array.isArray(value.columnIndexes) || !Array.isArray(value.conditionalRules)) throw new Error('The saved formatting is invalid.')
  }
  const selection = snapshot.selection
  const validCell = (value: unknown) => object(value) && Number.isInteger(value.r) && Number.isInteger(value.c)
    && Number(value.r) >= 0 && Number(value.r) < 1048576 && Number(value.c) >= 0 && Number(value.c) < 16384
  if (!object(selection) || !validCell(selection.anchor) || !validCell(selection.focus)
    || (selection.anchorStatus !== undefined && typeof selection.anchorStatus !== 'boolean')
    || (selection.focusStatus !== undefined && typeof selection.focusStatus !== 'boolean')
    || (selection.axis !== undefined && selection.axis !== 'row' && selection.axis !== 'column')) throw new Error('The saved selection is invalid.')
  if (snapshot.previewStyles !== null) {
    if (!object(snapshot.previewStyles) || !object(snapshot.previewStyles.sheetPaths) || !Array.isArray(snapshot.previewStyles.cellStyles) || !Array.isArray(snapshot.previewStyles.differentialStyles)) throw new Error('The saved styles are invalid.')
    snapshot.previewStyles.files = originalFiles
  }
  return snapshot as unknown as WorkbookEditSnapshot
}
