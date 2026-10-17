import type { CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import { detectDepartmentScheduleYearSections, type DepartmentScheduleImportRow, type DepartmentScheduleImportSheet } from './departmentScheduleImport.ts'
import { createDepartmentScheduleWorkbookSnapshot } from './departmentScheduleWorkbookState.ts'
import { createExcelExport } from './excelWorkbookExport.ts'
import { SCHEDULE_COLUMN_COUNT, scheduleHeaderAt, scheduleHeaderMerges, scheduleHeaderValues } from './excelScheduleTemplate.ts'

const headerStyle: CSSProperties = {
  backgroundColor: '#ffff00', color: '#000000', fontFamily: 'Arial', fontSize: '11pt', fontWeight: 'bold',
  textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'normal',
  borderTop: '2px solid #000000', borderRight: '2px solid #000000',
  borderBottom: '2px solid #000000', borderLeft: '2px solid #000000',
}
const yearStyle: CSSProperties = {
  ...headerStyle, backgroundColor: '#e3edda', color: '#41572a', textAlign: 'left',
}
const dataStyle: CSSProperties = {
  backgroundColor: '#ffffff', color: '#0f172a', fontFamily: 'Arial', fontSize: '11pt',
  textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'normal',
  borderTop: '2px solid #000000', borderRight: '2px solid #000000',
  borderBottom: '2px solid #000000', borderLeft: '2px solid #000000',
}

/** Export the visible schedule in the same header-and-year layout as the download template. */
export function createDepartmentScheduleExport(sheets: readonly DepartmentScheduleImportSheet[], columnWidths: readonly number[] | null,
  statusForRow: (sheet: DepartmentScheduleImportSheet, row: DepartmentScheduleImportRow) => string): Uint8Array {
  const { snapshot, ownedNames } = createDepartmentScheduleWorkbookSnapshot(sheets, 0, columnWidths ? [...columnWidths] : null)
  const headers = scheduleHeaderValues()
  sheets.forEach((sourceSheet, sheetIndex) => {
    const grid: (string | undefined)[][] = [[], [undefined, ...headers[0], 'Status'], [undefined, ...headers[1], '']]
    const merges = [...scheduleHeaderMerges(scheduleHeaderAt({ r: 1, c: 1 })),
      { s: { r: 1, c: 22 }, e: { r: 2, c: 22 } }]
    const styles = new Map<string, CSSProperties>()
    const styleRow = (row: number, style: CSSProperties) => {
      for (let column = 1; column <= SCHEDULE_COLUMN_COUNT + 1; column++) {
        styles.set(XLSX.utils.encode_cell({ r: row, c: column }), style)
      }
    }
    styleRow(1, headerStyle)
    styleRow(2, headerStyle)
    const sections = sourceSheet.yearSections ?? detectDepartmentScheduleYearSections(sourceSheet.rows)
    for (const section of sections) {
      if (section.label) {
        const headingRow = grid.length
        grid.push([undefined, section.label])
        merges.push({ s: { r: headingRow, c: 1 }, e: { r: headingRow, c: 22 } })
        styleRow(headingRow, yearStyle)
      }
      for (const row of sourceSheet.rows.slice(section.start, section.start + section.count)) {
        const dataRow = grid.length
        const status = statusForRow(sourceSheet, row)
        grid.push([undefined, ...row.values, status])
        styleRow(dataRow, dataStyle)
        if (status === 'Plot') styles.set(XLSX.utils.encode_cell({ r: dataRow, c: 22 }), { ...dataStyle, color: '#526f34' })
      }
    }
    const worksheet = XLSX.utils.aoa_to_sheet(grid)
    worksheet['!ref'] = `A1:W${grid.length}`
    worksheet['!merges'] = merges
    worksheet['!cols'] = [{ wpx: 64 }, ...Array.from({ length: SCHEDULE_COLUMN_COUNT + 1 }, (_, column) => ({ wpx: columnWidths?.[column + 1] ?? (column === SCHEDULE_COLUMN_COUNT ? 96 : 120) }))]
    worksheet['!rows'] = Array.from({ length: grid.length }, (_, row) => row === 1 ? { hpt: 24.75 } : {})
    const name = ownedNames[sheetIndex]
    snapshot.workbook.Sheets[name] = worksheet
    snapshot.cellStyleOverrides.set(name, styles)
  })
  return createExcelExport(snapshot, ownedNames)
}
