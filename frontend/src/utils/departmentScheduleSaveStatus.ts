import type { DepartmentScheduleImportSheet } from './departmentScheduleImport'

export interface DepartmentScheduleSaveBaseline {
  sheets: readonly DepartmentScheduleImportSheet[]
  columnWidths: readonly number[] | null
  file: File | null
  persisted: boolean
}

/** Compare changed rows only; selection and validation do not change saved content. */
export function hasDepartmentScheduleChanges(baseline: DepartmentScheduleSaveBaseline,
  sheets: readonly DepartmentScheduleImportSheet[], columnWidths: readonly number[] | null, file: File | null): boolean {
  if (!baseline.persisted || baseline.file !== file || baseline.sheets.length !== sheets.length) return true
  if (baseline.columnWidths !== columnWidths && (baseline.columnWidths?.length !== columnWidths?.length
    || baseline.columnWidths?.some((width, index) => width !== columnWidths?.[index]))) return true
  return sheets.some((sheet, index) => {
    const saved = baseline.sheets[index]
    if (sheet === saved) return false
    if (sheet.name !== saved.name || sheet.headerRow !== saved.headerRow || sheet.rows.length !== saved.rows.length) return true
    if (sheet.yearSections !== saved.yearSections && JSON.stringify(sheet.yearSections) !== JSON.stringify(saved.yearSections)) return true
    return sheet.rows.some((row, rowIndex) => {
      const before = saved.rows[rowIndex]
      return row !== before && (row.rowNumber !== before.rowNumber || row.values.length !== before.values.length
        || row.values.some((value, column) => value !== before.values[column]))
    })
  })
}
