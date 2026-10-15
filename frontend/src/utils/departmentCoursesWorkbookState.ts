import type { DepartmentCourseSheet } from './departmentCourseImport.ts'
import type { WorkbookMembership } from './departmentWorkbookPermissions.ts'
import { compressSnapshot, decompressSnapshot } from './firestoreWorkbookSnapshots.ts'

export interface DepartmentCoursesContext {
  departmentId: string
  departmentCode: string
  membershipId: string
}

export interface DepartmentCoursesWorkbookState {
  sheets: DepartmentCourseSheet[]
  selectedSheet: number
  columnWidths: number[] | null
}

export const MAX_COURSES_DATA_CHARS = 900 * 1024

export function departmentCourseDocuments(state: DepartmentCoursesWorkbookState) {
  validateState(state)
  return state.sheets.flatMap(sheet => sheet.rows.filter(row => row.values.some(value => value.trim())).map(row => {
    if (row.values.some(value => new TextEncoder().encode(value).byteLength > 64 * 1024)) {
      throw new Error(`A course cell in ${sheet.name}, row ${row.rowNumber} exceeds the 64 KiB text limit.`)
    }
    const [session, semester, code, course, type, credits] = row.values
    return { sheetName: sheet.name, rowNumber: row.rowNumber, session, semester, code, course, type, credits }
  }))
}

export function departmentCourseBatchRanges(rows: ReturnType<typeof departmentCourseDocuments>) {
  const ranges: { start: number; count: number }[] = []
  let start = 0, bytes = 0
  rows.forEach((row, index) => {
    const size = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1024
    if (index > start && (index - start >= 400 || bytes + size > 4 * 1024 * 1024)) {
      ranges.push({ start, count: index - start })
      start = index
      bytes = 0
    }
    bytes += size
  })
  if (rows.length > start) ranges.push({ start, count: rows.length - start })
  return ranges
}

export function canEditDepartmentCourses(member: WorkbookMembership | undefined, userId: string, departmentCode: string): boolean {
  return Boolean(member && member.userId === userId && member.status === 'accepted'
    && (member.role === 'Admin' || member.department === departmentCode && ['Dean', 'Program Head'].includes(member.role ?? '')))
}

function validateState(value: unknown): DepartmentCoursesWorkbookState {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved courses workbook.')
  const state = value as DepartmentCoursesWorkbookState
  if (!Array.isArray(state.sheets) || !state.sheets.length || state.sheets.some(sheet => {
    if (!sheet || typeof sheet.name !== 'string' || !sheet.name.length || sheet.name.length > 31
      || !Number.isSafeInteger(sheet.headerRow) || sheet.headerRow < 1 || !Array.isArray(sheet.rows)) return true
    const ids = new Set<number>()
    return sheet.rows.some(row => {
      if (!row || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 1 || ids.has(row.rowNumber)
        || !Array.isArray(row.values) || row.values.length !== 6 || row.values.some(text => typeof text !== 'string')) return true
      ids.add(row.rowNumber)
      return false
    })
  }) || new Set(state.sheets.map(sheet => sheet.name)).size !== state.sheets.length
    || !Number.isInteger(state.selectedSheet) || state.selectedSheet < 0 || state.selectedSheet >= state.sheets.length
    || state.columnWidths !== null && (!Array.isArray(state.columnWidths) || state.columnWidths.length !== 7
      || state.columnWidths.some(width => !Number.isFinite(width) || width <= 0))) throw new Error('Invalid saved courses workbook.')
  return state
}

export async function encodeDepartmentCoursesWorkbook(state: DepartmentCoursesWorkbookState) {
  validateState(state)
  const json = JSON.stringify({ version: 1, ...state })
  const data = await compressSnapshot(json)
  if (data.length > MAX_COURSES_DATA_CHARS) throw new Error('This courses workbook is too large to save (900 KiB compressed limit).')
  return { data, jsonByteLength: new TextEncoder().encode(json).byteLength }
}

export async function decodeDepartmentCoursesWorkbook(data: string, jsonByteLength: number): Promise<DepartmentCoursesWorkbookState> {
  if (data.length > MAX_COURSES_DATA_CHARS) throw new Error('The saved courses workbook is too large.')
  const value: unknown = JSON.parse(await decompressSnapshot(data, jsonByteLength))
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) throw new Error('Unsupported saved courses workbook version.')
  return validateState(value)
}
