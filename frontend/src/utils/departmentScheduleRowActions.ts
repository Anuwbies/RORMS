import type { ColumnCellSelection } from './columnCellSelection'
import type { DepartmentScheduleImportSheet } from './departmentScheduleImport'
import { SCHEDULE_COLUMN_COUNT } from './excelScheduleTemplate.ts'

export function toggleDepartmentScheduleYearVisibility(sheet: DepartmentScheduleImportSheet, start: number): DepartmentScheduleImportSheet {
  const section = sheet.yearSections?.find(item => item.start === start)
  if (!section) return sheet
  return { ...sheet, yearSections: sheet.yearSections?.map(item => item === section ? { ...item, hidden: !item.hidden } : item) }
}

export function changeDepartmentScheduleRows(sheet: DepartmentScheduleImportSheet, selection: ColumnCellSelection, action: 'add' | 'delete', count = 1): { sheet: DepartmentScheduleImportSheet; rowIndex: number } {
  if (action === 'add' && (!Number.isSafeInteger(count) || count < 1)) throw new Error('Enter a positive whole number of rows.')
  const first = Math.min(selection.anchor, selection.end)
  const last = Math.max(selection.anchor, selection.end)
  if (first < 0 || last >= sheet.rows.length) throw new Error('Select an existing row.')
  const sections = sheet.yearSections?.length ? sheet.yearSections : [{ label: '', start: 0, count: sheet.rows.length }]
  let nextRowNumber = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.rowNumber), 0) + 1
  const blankRow = () => ({ rowNumber: nextRowNumber++, values: Array<string>(SCHEDULE_COLUMN_COUNT).fill('') })
  const rows: DepartmentScheduleImportSheet['rows'] = []
  const yearSections = sections.map(section => {
    const end = section.start + section.count
    let sectionRows = sheet.rows.slice(section.start, end)
    if (action === 'add' && last >= section.start && last < end) {
      const insertAt = last - section.start + 1
      sectionRows = [...sectionRows.slice(0, insertAt), ...Array.from({ length: count }, blankRow), ...sectionRows.slice(insertAt)]
    } else if (action === 'delete') {
      sectionRows = sectionRows.filter((_, offset) => section.start + offset < first || section.start + offset > last)
      // Retain the year header and one editable row when its entire contents are deleted.
      if (!sectionRows.length) sectionRows.push(blankRow())
    }
    const start = rows.length
    rows.push(...sectionRows)
    return { ...section, start, count: sectionRows.length }
  })
  return { sheet: { ...sheet, rows, yearSections }, rowIndex: action === 'add' ? last + 1 : Math.min(first, rows.length - 1) }
}
