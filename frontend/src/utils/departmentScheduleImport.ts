import * as XLSX from 'xlsx'
import { SCHEDULE_COLUMN_COUNT, scheduleHeaderAt, validateScheduleHeader } from './excelScheduleTemplate.ts'

export interface DepartmentScheduleImportRow {
  rowNumber: number
  values: string[]
}

export interface DepartmentScheduleImportSheet {
  name: string
  headerRow: number
  rows: DepartmentScheduleImportRow[]
  yearSections?: DepartmentScheduleYearSection[]
}

export interface DepartmentScheduleYearSection {
  label: string
  sourceLabel?: string
  start: number
  count: number
  hidden?: boolean
}

const YEAR_LABELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']

const yearHeading = (row: DepartmentScheduleImportRow): string | undefined => {
  const label = row.values[0].trim()
  if (row.values.slice(1).some(value => value.trim())) return
  const curriculum = /^([1-4])\s*[A-Z][A-Z0-9]*\s*:\s*.+\bCURRICULUM\b/i.exec(label)
  if (curriculum) return YEAR_LABELS[Number(curriculum[1]) - 1]
  const year = /^([1-4])(?:st|nd|rd|th)\s+Year$/i.exec(label)
  return year ? YEAR_LABELS[Number(year[1]) - 1] : undefined
}

export function detectDepartmentScheduleYearSections(rows: readonly DepartmentScheduleImportRow[]): DepartmentScheduleYearSection[] {
  const sections: DepartmentScheduleYearSection[] = []
  rows.forEach((row, index) => {
    const sourceLabel = row.values[0].trim()
    const label = yearHeading(row)
    if (!label) return
    if (!sections.length && index > 0) sections.push({ label: '', start: 0, count: index })
    sections.push({ label, sourceLabel, start: index, count: 0 })
  })
  if (!sections.length) {
    return YEAR_LABELS.flatMap((label, index) => {
      const start = index * 10
      const count = index === 3 ? rows.length - start : Math.min(10, rows.length - start)
      return count > 0 ? [{ label, start, count }] : []
    })
  }
  return sections.map((section, index) => ({ ...section, count: (sections[index + 1]?.start ?? rows.length) - section.start }))
}

export function createEmptyDepartmentScheduleSheet(): DepartmentScheduleImportSheet {
  return {
    name: 'Schedule',
    headerRow: 1,
    yearSections: YEAR_LABELS.map((label, index) => ({ label, start: index * 10, count: 10 })),
    rows: Array.from({ length: 40 }, (_, index) => ({
      rowNumber: index + 3,
      values: Array<string>(SCHEDULE_COLUMN_COUNT).fill(''),
    })),
  }
}

/** Finds the fixed two-row schedule header anywhere in each worksheet. */
export function readDepartmentScheduleImport(workbook: XLSX.WorkBook): DepartmentScheduleImportSheet[] {
  const matches: DepartmentScheduleImportSheet[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet?.['!ref']) continue
    const cells = Object.keys(sheet).filter(key => /^[A-Z]+[1-9]\d*$/.test(key))
      .map(address => ({ address, ...XLSX.utils.decode_cell(address) }))
    const read = (row: number, column: number): string => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
      return cell ? XLSX.utils.format_cell(cell) : ''
    }
    const anchors = cells.filter(cell => read(cell.r, cell.c).trim().toLowerCase() === 'college')
      .sort((first, second) => first.r - second.r || first.c - second.c)
    for (const anchor of anchors) {
      const header = scheduleHeaderAt(anchor)
      if (validateScheduleHeader(header, read)) continue
      // Use populated cells to locate headings and classes; formatting can extend far below them.
      const rowNumbers = [...new Set(cells.filter(cell => cell.r > header.e.r
        && cell.c >= anchor.c && cell.c < anchor.c + SCHEDULE_COLUMN_COUNT).map(cell => cell.r))]
        .sort((first, second) => first - second)
      const populatedRows = rowNumbers.map(row => ({
        rowNumber: row + 1,
        values: Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, column) => read(row, anchor.c + column)),
      })).filter(row => row.values.some(value => value.trim()))
      const firstYearHeading = populatedRows.findIndex(yearHeading)
      const rows = firstYearHeading < 0 ? populatedRows : populatedRows.slice(firstYearHeading)
      if (!rows.length) {
        matches.push({ ...createEmptyDepartmentScheduleSheet(), name, headerRow: anchor.r + 1 })
        break
      }
      const rowAt = (rowNumber: number): DepartmentScheduleImportRow => ({
        rowNumber,
        values: Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, column) => read(rowNumber - 1, anchor.c + column)),
      })
      const isScheduleRow = (row: DepartmentScheduleImportRow): boolean => row.values.slice(2).some(value => value.trim())
      const importedRows: DepartmentScheduleImportRow[] = []
      let nextBlankRowNumber = populatedRows.reduce((maximum, row) => Math.max(maximum, row.rowNumber), header.e.r + 1) + 1
      const sections = detectDepartmentScheduleYearSections(rows)
      const yearSections = sections.map((section, index) => {
        const sectionRows = rows.slice(section.start + (section.sourceLabel ? 1 : 0), section.start + section.count)
        const scheduleRows = sectionRows.filter(isScheduleRow)
        let firstRow: number
        let lastRow: number
        if (scheduleRows.length) {
          // Preserve blank rows between classes, but discard separators after the last class.
          firstRow = scheduleRows[0].rowNumber
          lastRow = scheduleRows[scheduleRows.length - 1].rowNumber
        } else if (section.sourceLabel) {
          const headingRow = rows[section.start].rowNumber
          const nextHeadingRow = sections[index + 1] ? rows[sections[index + 1].start].rowNumber : headingRow + 11
          firstRow = headingRow + 1
          lastRow = Math.max(firstRow, nextHeadingRow - 1)
        } else {
          firstRow = sectionRows[0]?.rowNumber ?? 0
          lastRow = sectionRows.at(-1)?.rowNumber ?? firstRow - 1
        }
        const retainedRows = Array.from({ length: Math.max(0, lastRow - firstRow + 1) }, (_, offset) => rowAt(firstRow + offset))
        while (section.label && retainedRows.length < 10) {
          retainedRows.push({ rowNumber: nextBlankRowNumber++, values: Array<string>(SCHEDULE_COLUMN_COUNT).fill('') })
        }
        const start = importedRows.length
        importedRows.push(...retainedRows)
        return { ...section, label: section.sourceLabel ?? section.label, start, count: retainedRows.length }
      })
      matches.push({ name, headerRow: anchor.r + 1, rows: importedRows, yearSections })
      break
    }
  }
  return matches
}
