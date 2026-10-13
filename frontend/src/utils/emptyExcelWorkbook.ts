import * as XLSX from 'xlsx'

export const EMPTY_WORKBOOK_ROWS = 30

export function createEmptyWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, { '!ref': `A1:Z${EMPTY_WORKBOOK_ROWS}`, '!rormsDefaultSheet': true }, 'Sheet1')
  return workbook
}

export function createEmptyWorkbookFile(): File {
  const bytes: ArrayBuffer = XLSX.write(createEmptyWorkbook(), { type: 'array', bookType: 'xlsx' })
  return new File([bytes], 'Untitled.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
