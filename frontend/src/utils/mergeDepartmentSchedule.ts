import type { DepartmentScheduleImportSheet } from './departmentScheduleImport'
import { hasDepartmentScheduleChanges } from './departmentScheduleSaveStatus'

interface ScheduleContent {
  sheets: DepartmentScheduleImportSheet[]
  columnWidths: number[] | null
}

function sameStructure(first: ScheduleContent, second: ScheduleContent): boolean {
  return first.sheets.length === second.sheets.length && first.sheets.every((sheet, index) => {
    const other = second.sheets[index]
    return sheet.name === other.name && sheet.rows.length === other.rows.length
      && sheet.rows.every((row, rowIndex) => row.rowNumber === other.rows[rowIndex].rowNumber && row.values.length === other.rows[rowIndex].values.length)
      && JSON.stringify(sheet.yearSections?.map(section => [section.start, section.count]))
        === JSON.stringify(other.yearSections?.map(section => [section.start, section.count]))
  })
}

/** Three-way merge: retain local edits on conflicts and take other remote changes.
 * Changed row layouts require an explicit whole-workbook choice instead. */
export function mergeDepartmentSchedule(base: ScheduleContent, local: ScheduleContent, remote: ScheduleContent) {
  const changed = (value: ScheduleContent, before: ScheduleContent) => hasDepartmentScheduleChanges(
    { ...before, file: null, persisted: true }, value.sheets, value.columnWidths, null)
  if (!changed(local, base)) return { ...remote, conflicts: 0, conflictingCells: [], structuralConflict: false }
  if (!changed(local, remote)) return { ...remote, conflicts: 0, conflictingCells: [], structuralConflict: false }
  if (!changed(remote, base)) return { ...local, conflicts: 0, conflictingCells: [], structuralConflict: false }
  if (!sameStructure(base, local) || !sameStructure(base, remote)) return { ...local, conflicts: 0, conflictingCells: [], structuralConflict: true }

  let conflicts = 0
  const conflictingCells: { sheet: number; row: number; column: number; remoteValue: string }[] = []
  const merge = <T>(before: T, ours: T, theirs: T): T => {
    if (Object.is(ours, before)) return theirs
    if (!Object.is(theirs, before) && !Object.is(ours, theirs)) conflicts++
    return ours
  }
  const sheets = remote.sheets.map((sheet, index) => {
    const before = base.sheets[index], ours = local.sheets[index]
    return { ...sheet,
      rows: sheet.rows.map((row, rowIndex) => ({ ...row,
        values: row.values.map((value, column) => {
          const original = before.rows[rowIndex].values[column]
          const localValue = ours.rows[rowIndex].values[column]
          if (localValue !== original && value !== original && localValue !== value) {
            conflictingCells.push({ sheet: index, row: row.rowNumber, column, remoteValue: value })
          }
          return merge(original, localValue, value)
        }),
      })),
      yearSections: sheet.yearSections?.map((section, sectionIndex) => ({ ...section,
        label: merge(before.yearSections![sectionIndex].label, ours.yearSections![sectionIndex].label, section.label),
        sourceLabel: merge(before.yearSections![sectionIndex].sourceLabel, ours.yearSections![sectionIndex].sourceLabel, section.sourceLabel),
        hidden: merge(before.yearSections![sectionIndex].hidden, ours.yearSections![sectionIndex].hidden, section.hidden),
      })),
    }
  })
  const sameWidths = (first: number[] | null, second: number[] | null) => first === second
    || first?.length === second?.length && Boolean(first?.every((value, index) => value === second?.[index]))
  let columnWidths: number[] | null
  if (sameWidths(local.columnWidths, base.columnWidths)) columnWidths = remote.columnWidths
  else if (sameWidths(remote.columnWidths, base.columnWidths) || sameWidths(local.columnWidths, remote.columnWidths)) columnWidths = local.columnWidths
  else if (base.columnWidths && local.columnWidths && remote.columnWidths
    && base.columnWidths.length === local.columnWidths.length && base.columnWidths.length === remote.columnWidths.length) {
    columnWidths = remote.columnWidths.map((value, index) => merge(base.columnWidths![index], local.columnWidths![index], value))
  } else { columnWidths = local.columnWidths; conflicts++ }
  return { sheets, columnWidths, conflicts, conflictingCells, structuralConflict: false }
}
