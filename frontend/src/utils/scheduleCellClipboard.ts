import type { ColumnCellSelection } from './columnCellSelection'
import type { DepartmentScheduleImportRow } from './departmentScheduleImport'
import type { ScheduleCellValueChange } from './departmentScheduleEdits'
import { SCHEDULE_COLUMN_COUNT, SCHEDULE_HEADER_GROUPS } from './excelScheduleTemplate.ts'

export const SCHEDULE_CELL_CLIPBOARD_TYPE = 'application/x-rorms-schedule-cells'
export const SCHEDULE_ROW_CLIPBOARD_TYPE = 'application/x-rorms-schedule-rows'

/** Windows clipboard APIs may return CRLF even when we wrote LF. */
export function sameScheduleClipboardText(first: string, second: string): boolean {
  return first.replace(/\r\n?/g, '\n') === second.replace(/\r\n?/g, '\n')
}

export interface ScheduleRowClipboard {
  version: 1
  rows: string[][]
}

export function readScheduleRowClipboard(serialized: string): ScheduleRowClipboard | null {
  try {
    const data: unknown = JSON.parse(serialized)
    if (!data || typeof data !== 'object') return null
    const item = data as Record<string, unknown>
    if (item.version !== 1 || !Array.isArray(item.rows) || !item.rows.length
      || !item.rows.every(row => Array.isArray(row) && row.length === SCHEDULE_COLUMN_COUNT && row.every(value => typeof value === 'string'))) return null
    return { version: 1, rows: item.rows as string[][] }
  } catch { return null }
}

export function scheduleRowClipboardText(rows: readonly string[][]): string {
  return rows.map(row => row.map(value => scheduleClipboardText([value])).join('\t')).join('\n')
}

export function planScheduleRowPaste(source: ScheduleRowClipboard, destination: ColumnCellSelection, rows: readonly DepartmentScheduleImportRow[]): ScheduleCellValueChange[] {
  if (destination.column !== -1 || !readScheduleRowClipboard(JSON.stringify(source))) throw new Error('Select a row number to paste complete rows.')
  return Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, column) => planScheduleCellPaste(
    { version: 1, column, values: source.rows.map(row => row[column]) }, { ...destination, column }, rows,
  )).flat()
}

export interface ScheduleCellClipboard {
  version: 1
  column: number
  values: string[]
}

const pasteParents = new Map<number, string>()
SCHEDULE_HEADER_GROUPS.forEach((group, groupIndex) => {
  const parent = group.label || SCHEDULE_HEADER_GROUPS[groupIndex - 1]?.label
  group.children.forEach((label, childIndex) => {
    if (parent && (label === 'Lec' || label === 'Lab')) pasteParents.set(group.offset + childIndex, parent)
  })
})

export function canPasteScheduleColumn(source: number, destination: number): boolean {
  if (![source, destination].every(column => Number.isInteger(column) && column >= 0 && column < SCHEDULE_COLUMN_COUNT)) return false
  return source === destination || pasteParents.has(source) && pasteParents.get(source) === pasteParents.get(destination)
}

export function readScheduleCellClipboard(serialized: string): ScheduleCellClipboard | null {
  try {
    const data: unknown = JSON.parse(serialized)
    if (!data || typeof data !== 'object') return null
    const item = data as Record<string, unknown>
    if (item.version !== 1 || typeof item.column !== 'number' || !canPasteScheduleColumn(item.column, item.column)
      || !Array.isArray(item.values) || !item.values.length || !item.values.every(value => typeof value === 'string')) return null
    return { version: 1, column: item.column, values: item.values as string[] }
  } catch { return null }
}

/** External course columns have no app-specific clipboard metadata. */
export function readScheduleCourseClipboard(text: string, column: number): ScheduleCellClipboard | null {
  if (column !== 2 && column !== 3 || !text) return null
  const input = text.replace(/\r\n?/g, '\n')
  const values: string[] = []
  let value = '', quoted = false
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (char === '"' && (quoted || !value)) {
      if (quoted && input[index + 1] === '"') { value += '"'; index++ }
      else quoted = !quoted
    } else if (char === '\t' && !quoted) return null
    else if (char === '\n' && !quoted) { values.push(value); value = '' }
    else value += char
  }
  if (quoted) return null
  if (value || !input.endsWith('\n')) values.push(value)
  return values.length ? { version: 1, column, values } : null
}

export function scheduleClipboardText(values: readonly string[]): string {
  return values.map(value => /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join('\n')
}

export function planScheduleCellPaste(source: ScheduleCellClipboard, destination: ColumnCellSelection, rows: readonly DepartmentScheduleImportRow[]): ScheduleCellValueChange[] {
  if (!canPasteScheduleColumn(source.column, destination.column)) {
    throw new Error('Paste into the same column, or between Lec and Lab columns under the same parent header.')
  }
  const first = Math.min(destination.anchor, destination.end)
  const selectedCount = Math.abs(destination.end - destination.anchor) + 1
  const count = selectedCount === 1 ? source.values.length : selectedCount
  if (!source.values.length || first < 0 || first + count > rows.length) {
    throw new Error('There are not enough rows below the selected cell for this paste.')
  }
  if (source.values.length !== 1 && count % source.values.length !== 0) {
    throw new Error('Select one destination cell, the same number of rows, or a multiple of the copied row count.')
  }
  return Array.from({ length: count }, (_, offset) => ({
    cell: { sheet: destination.sheet, row: rows[first + offset].rowNumber, column: destination.column },
    value: source.values[offset % source.values.length],
  }))
}

export function insertScheduleCellText(value: string, text: string, start: number, end = start): { value: string; caret: number } {
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length }
}
