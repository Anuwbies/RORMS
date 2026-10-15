import type { ColumnCellSelection } from './columnCellSelection'
import { DEPARTMENT_COURSE_HEADERS, type DepartmentCourseSheet } from './departmentCourseImport.ts'
import type { ScheduleCellValueChange } from './departmentScheduleEdits'
import { planScheduleCellPaste, scheduleClipboardText, scheduleRowClipboardText } from './scheduleCellClipboard.ts'

export const COURSE_CLIPBOARD_TYPE = 'application/x-rorms-course-selection'
export type CourseClipboard = { version: 1; kind: 'cells'; column: number; values: string[] }
  | { version: 1; kind: 'rows'; rows: string[][] }

export function readCourseClipboard(serialized: string): CourseClipboard | null {
  try {
    const data: unknown = JSON.parse(serialized)
    if (!data || typeof data !== 'object') return null
    const item = data as Record<string, unknown>
    if (item.version !== 1) return null
    if (item.kind === 'cells' && typeof item.column === 'number' && Number.isInteger(item.column)
      && item.column >= 0 && item.column < DEPARTMENT_COURSE_HEADERS.length && Array.isArray(item.values)
      && item.values.length && item.values.every(value => typeof value === 'string')) {
      return { version: 1, kind: 'cells', column: item.column, values: item.values as string[] }
    }
    if (item.kind === 'rows' && Array.isArray(item.rows) && item.rows.length
      && item.rows.every(row => Array.isArray(row) && row.length === DEPARTMENT_COURSE_HEADERS.length && row.every(value => typeof value === 'string'))) {
      return { version: 1, kind: 'rows', rows: item.rows as string[][] }
    }
    return null
  } catch { return null }
}

export function courseClipboardText(source: CourseClipboard): string {
  return source.kind === 'cells' ? scheduleClipboardText(source.values) : scheduleRowClipboardText(source.rows)
}

export function planCoursePaste(source: CourseClipboard, selection: ColumnCellSelection, sheet: DepartmentCourseSheet): ScheduleCellValueChange[] {
  if (!readCourseClipboard(JSON.stringify(source))) throw new Error('Invalid course clipboard data.')
  if (source.kind === 'cells') {
    if (source.column !== selection.column) throw new Error('Paste cells into the same course column.')
    return planScheduleCellPaste({ version: 1, column: source.column, values: source.values }, selection, sheet.rows)
  }
  if (selection.column !== -1) throw new Error('Select a row number to paste complete rows.')
  return DEPARTMENT_COURSE_HEADERS.flatMap((_, column) => planScheduleCellPaste(
    { version: 1, column, values: source.rows.map(row => row[column]) }, { ...selection, column }, sheet.rows,
  ))
}

export function changeDepartmentCourseRows(sheet: DepartmentCourseSheet, selection: ColumnCellSelection, action: 'add' | 'delete'): { sheet: DepartmentCourseSheet; rowIndex: number } {
  const first = Math.min(selection.anchor, selection.end)
  const last = Math.max(selection.anchor, selection.end)
  if (first < 0 || last >= sheet.rows.length) throw new Error('Select an existing course row.')
  const blankRow = () => ({
    rowNumber: sheet.rows.reduce((maximum, row) => Math.max(maximum, row.rowNumber), 1) + 1,
    values: DEPARTMENT_COURSE_HEADERS.map(() => ''),
  })
  const rows = action === 'add' ? [...sheet.rows.slice(0, last + 1), blankRow(), ...sheet.rows.slice(last + 1)]
    : [...sheet.rows.slice(0, first), ...sheet.rows.slice(last + 1)]
  if (!rows.length) rows.push(blankRow())
  return { sheet: { ...sheet, rows }, rowIndex: action === 'add' ? last + 1 : Math.min(first, rows.length - 1) }
}
