import type { DepartmentScheduleYearSection } from './departmentScheduleImport'

export interface ColumnCellSelection {
  sheet: number
  column: number
  anchor: number
  end: number
}

export function scheduleSelectionYearBounds(anchor: number, sections: readonly DepartmentScheduleYearSection[] | undefined, rowCount: number): { first: number; last: number } {
  const section = sections?.find(item => anchor >= item.start && anchor < item.start + item.count)
  return section ? { first: section.start, last: section.start + section.count - 1 } : { first: 0, last: rowCount - 1 }
}

export function clampColumnSelectionToYear(selection: ColumnCellSelection, sections: readonly DepartmentScheduleYearSection[] | undefined, rowCount: number): ColumnCellSelection {
  const { first, last } = scheduleSelectionYearBounds(selection.anchor, sections, rowCount)
  const end = Math.max(first, Math.min(last, selection.end))
  return end === selection.end ? selection : { ...selection, end }
}

export function isColumnCellSelected(selection: ColumnCellSelection | null, sheet: number, column: number, rowIndex: number): boolean {
  return Boolean(selection && selection.sheet === sheet && selection.column === column
    && rowIndex >= Math.min(selection.anchor, selection.end) && rowIndex <= Math.max(selection.anchor, selection.end))
}
