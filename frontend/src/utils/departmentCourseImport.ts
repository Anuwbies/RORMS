import * as XLSX from 'xlsx'

export const DEPARTMENT_COURSE_HEADERS = ['Session', 'Semester', 'Code', 'Course', 'Type', 'Credits'] as const

export interface DepartmentCourseRow {
  rowNumber: number
  values: string[]
}

export interface DepartmentCourseSheet {
  name: string
  headerRow: number
  rows: DepartmentCourseRow[]
}

export function createEmptyDepartmentCourseSheet(): DepartmentCourseSheet {
  return {
    name: 'Courses',
    headerRow: 1,
    rows: Array.from({ length: 50 }, (_, index) => ({ rowNumber: index + 2, values: DEPARTMENT_COURSE_HEADERS.map(() => '') })),
  }
}

/** Finds the six course headers without depending on a sheet name or cell position. */
export function readDepartmentCourses(workbook: XLSX.WorkBook): DepartmentCourseSheet[] {
  const matches: DepartmentCourseSheet[] = []
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const cells = Object.keys(sheet).filter(address => /^[A-Z]+[1-9]\d*$/.test(address))
      .map(address => XLSX.utils.decode_cell(address))
    const read = (row: number, column: number): string => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
      return cell ? XLSX.utils.format_cell(cell) : ''
    }
    const anchors = cells.filter(cell => normalize(read(cell.r, cell.c)) === 'session')
      .sort((first, second) => first.r - second.r || first.c - second.c)
    for (const anchor of anchors) {
      if (!DEPARTMENT_COURSE_HEADERS.every((header, column) => normalize(read(anchor.r, anchor.c + column)) === header.toLowerCase())) continue
      const rowNumbers = [...new Set(cells.filter(cell => cell.r > anchor.r && cell.c >= anchor.c
        && cell.c < anchor.c + DEPARTMENT_COURSE_HEADERS.length).map(cell => cell.r))].sort((first, second) => first - second)
      const rows = rowNumbers.map(row => ({
        rowNumber: row + 1,
        values: DEPARTMENT_COURSE_HEADERS.map((_, column) => read(row, anchor.c + column)),
      })).filter(row => row.values.some(value => value.trim()))
      matches.push({ name, headerRow: anchor.r + 1, rows })
      break
    }
  }
  return matches
}
