import type { WorkbookEditSnapshot } from './excelWorkbookState.ts'
import { detectDepartmentScheduleYearSections, type DepartmentScheduleImportSheet } from './departmentScheduleImport.ts'
import { scheduleHeaderAt, type ScheduleSetup, type ScheduleYear } from './excelScheduleTemplate.ts'
import { extractWorkbookScheduleRows, type ScheduleDirectory } from './excelScheduleRows.ts'
import { facultyScheduleRowKey, validateDepartmentFacultyScheduleRows, type DepartmentCourseIdentity } from './ScheduleValidation.ts'
import { createDepartmentScheduleWorkbookSnapshot } from './departmentScheduleWorkbookState.ts'

/** The editor uses the same validation as Save without serializing a workbook. */
export function departmentScheduleImportRowIssues(sheets: readonly DepartmentScheduleImportSheet[], directory: ScheduleDirectory,
  courses?: readonly DepartmentCourseIdentity[]): ReadonlyMap<string, readonly string[]> {
  return new Map(parseDepartmentScheduleImportRows(sheets, directory, courses)
    .filter(row => row.validationIssues.length)
    .map(row => [facultyScheduleRowKey(row.sourceSheet, row.sourceRow), row.validationIssues]))
}

export function parseDepartmentScheduleImportRows(sheets: readonly DepartmentScheduleImportSheet[], directory: ScheduleDirectory,
  courses?: readonly DepartmentCourseIdentity[]) {
  if (!sheets.length) return []
  const state = createDepartmentScheduleWorkbookSnapshot(sheets, 0, null)
  return extractDepartmentScheduleImportRows(state.snapshot, state.ownedNames, sheets, directory, courses)
}

/** Project the compact workbook's editable year sections into saved schedule records. */
export function extractDepartmentScheduleImportRows(snapshot: WorkbookEditSnapshot, sheetNames: readonly string[],
  sheets: readonly DepartmentScheduleImportSheet[], directory: ScheduleDirectory, courses?: readonly DepartmentCourseIdentity[]) {
  const setups = new Map<string, ScheduleSetup>()
  const sourceSheets = new Map(sheetNames.map((name, index) => [name, sheets[index]]))
  const sectionForRow = new Map<string, Map<number, { label: string; sourceLabel?: string; start: number }>>()
  const rowDescriptions = new Map<string, string>()
  sheets.forEach((sheet, index) => {
    const years = new Map<number, ScheduleYear>()
    const labels = new Map<number, { label: string; sourceLabel?: string; start: number }>()
    const sections = sheet.yearSections ?? detectDepartmentScheduleYearSections(sheet.rows)
    sections.forEach((section, sectionIndex) => {
      const match = /^\s*([1-4])(?:st|nd|rd|th|\s*[a-z])/i.exec(section.label)
        ?? /^\s*([1-4])(?:st|nd|rd|th|\s*[a-z])/i.exec(section.sourceLabel ?? '')
      const year = Number(match?.[1] ?? Math.min(sectionIndex + 1, 4)) as ScheduleYear
      for (let row = section.start; row < section.start + section.count; row++) {
        years.set(row + 2, year)
        labels.set(row + 2, section)
      }
    })
    setups.set(sheetNames[index], { header: scheduleHeaderAt({ r: 0, c: 0 }),
      columns: Array.from({ length: 21 }, (_, column) => column), years, includesEmptyRows: true })
    sectionForRow.set(sheetNames[index], labels)
  })
  const rows = extractWorkbookScheduleRows({ ...snapshot, scheduleSetups: setups }, directory, { includeCollegeOnlyRows: true }).map(row => {
    const sheet = sourceSheets.get(row.sourceSheet)!
    const section = sectionForRow.get(row.sourceSheet)?.get(row.sourceRow - 1)
    const curriculum = /^\s*([1-4]\s*[a-z][a-z0-9]*)\s*(?=:|\s|$)/i.exec(section?.sourceLabel ?? section?.label ?? '')
    rowDescriptions.set(facultyScheduleRowKey(row.sourceSheet, sheet.rows[row.sourceRow - 3].rowNumber),
      `${section?.label.split(':')[0].trim() || `Year ${row.yearLevel}`} · Row ${row.sourceRow - 2 - (section?.start ?? 0)}`)
    return { ...row, status: 'Draft' as const,
      sourceRow: sheet.rows[row.sourceRow - 3].rowNumber,
      parallelSourceRow: row.parallelSourceRow === null ? null : sheet.rows[row.parallelSourceRow - 3].rowNumber,
      course: row.course || curriculum?.[1].replace(/\s/g, '').toUpperCase() || '',
    }
  })
  const validation = validateDepartmentFacultyScheduleRows(rows, directory, rowDescriptions, courses)
  return rows.map(row => ({ ...row, validationIssues: [...(validation.get(facultyScheduleRowKey(row.sourceSheet, row.sourceRow)) ?? [])] }))
}
