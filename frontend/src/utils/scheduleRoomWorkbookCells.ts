import { readDepartmentScheduleWorkbookState } from './departmentScheduleWorkbookState.ts'
import type { WorkbookScheduleMeeting } from './excelScheduleRows.ts'

export interface ScheduleRoomWorkbookRow {
  id: string
  sourceWorkbook: string
  sourceSheet: string
  sourceRow: number
  rawValues: string[]
  meetings: WorkbookScheduleMeeting[]
}

export function scheduleRoomWorkbookLocation(editorState: string, row: ScheduleRoomWorkbookRow) {
  const workbook = readDepartmentScheduleWorkbookState(editorState)
  const sheet = workbook.sheets.find(sheet => sheet.name === row.sourceSheet)
  const index = sheet?.rows.findIndex(item => item.rowNumber === row.sourceRow) ?? -1
  const worksheet = workbook.snapshot.workbook.Sheets[row.sourceSheet]
  if (!sheet || index < 0 || !worksheet?.['!rormsDepartmentScheduleImport']) {
    throw new Error('This schedule cannot be located in its saved workbook. Open and save the workbook again before plotting.')
  }
  const values = sheet.rows[index].values
  if (row.rawValues.length !== 21 || values.some((value, column) => column < 19 && value.trim() !== row.rawValues[column].trim())) {
    throw new Error('The workbook row changed. Reopen the schedule before plotting.')
  }
  return { workbookRow: index + 3, sheetName: sheet.name, values }
}

/** Keep slash-separated room positions aligned with Faculty/Time, including blank slots. */
export function scheduleRoomWorkbookTexts(before: readonly WorkbookScheduleMeeting[], after: readonly WorkbookScheduleMeeting[], values: readonly string[]) {
  const result = [values[19] ?? '', values[20] ?? '']
  for (const [offset, format] of ['Lec', 'Lab'].entries()) {
    const original = before.filter(meeting => meeting.format === format)
    const current = after.filter(meeting => meeting.format === format)
    if (original.length !== current.length) throw new Error('The schedule meetings changed. Reopen the schedule before plotting.')
    if (!current.some((meeting, index) => meeting.roomId !== original[index].roomId || meeting.room !== original[index].room)) continue
    const rooms = current.map(meeting => meeting.room.trim())
    result[offset] = rooms.every(room => room === rooms[0]) ? rooms[0] ?? '' : rooms.join('/')
  }
  return result
}
