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

export function detectDepartmentScheduleYearSections(rows: readonly DepartmentScheduleImportRow[]): DepartmentScheduleYearSection[] {
  const sections: DepartmentScheduleYearSection[] = []
  rows.forEach((row, index) => {
    const sourceLabel = row.values[0].trim()
    const match = /^([1-4])\s*[A-Z][A-Z0-9]*\s*:\s*.+\bCURRICULUM\b/i.exec(sourceLabel)
    if (!match || row.values.slice(1).some(value => value.trim())) return
    if (!sections.length && index > 0) sections.push({ label: '', start: 0, count: index })
    sections.push({ label: YEAR_LABELS[Number(match[1]) - 1], sourceLabel, start: index, count: 0 })
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
      // Visit populated rows only, avoiding oversized worksheet ranges caused by formatting.
      const rowNumbers = [...new Set(cells.filter(cell => cell.r > header.e.r
        && cell.c >= anchor.c && cell.c < anchor.c + SCHEDULE_COLUMN_COUNT).map(cell => cell.r))]
        .sort((first, second) => first - second)
      const rows = rowNumbers.map(row => ({
        rowNumber: row + 1,
        values: Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, column) => read(row, anchor.c + column)),
      })).filter(row => row.values.some(value => value.trim()))
      const importedRows: DepartmentScheduleImportRow[] = []
      let nextBlankRowNumber = rows.reduce((maximum, row) => Math.max(maximum, row.rowNumber), header.e.r + 1) + 1
      const yearSections = detectDepartmentScheduleYearSections(rows).map(section => {
        const sectionRows = rows.slice(section.start + (section.sourceLabel ? 1 : 0), section.start + section.count)
        // Keep empty years visible without leaving their heading in the editable data.
        if (!sectionRows.length && section.sourceLabel) {
          sectionRows.push({ rowNumber: rows[section.start].rowNumber, values: Array<string>(SCHEDULE_COLUMN_COUNT).fill('') })
        }
        if (section.label) {
          while (sectionRows.length < 10) {
            sectionRows.push({ rowNumber: nextBlankRowNumber++, values: Array<string>(SCHEDULE_COLUMN_COUNT).fill('') })
          }
        }
        const start = importedRows.length
        importedRows.push(...sectionRows)
        return { ...section, label: section.sourceLabel ?? section.label, start, count: sectionRows.length }
      })
      matches.push({ name, headerRow: anchor.r + 1, rows: importedRows, yearSections })
      break
    }
  }
  return matches
}
