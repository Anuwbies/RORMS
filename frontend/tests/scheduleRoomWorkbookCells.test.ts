import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { createDepartmentScheduleWorkbookState, readDepartmentScheduleWorkbookState } from '../src/utils/departmentScheduleWorkbookState.ts'
import { scheduleRoomWorkbookLocation, scheduleRoomWorkbookTexts } from '../src/utils/scheduleRoomWorkbookCells.ts'
import { serializeFirestoreWorkbookState } from '../src/utils/firestoreWorkbookState.ts'
import type { WorkbookScheduleMeeting } from '../src/utils/excelScheduleRows.ts'

function meeting(overrides: Partial<WorkbookScheduleMeeting> = {}): WorkbookScheduleMeeting {
  return { format: 'Lec', faculty: 'Teacher', time: '7:30-9:00', day: 'MON', room: 'TBA',
    startTime: '07:30', endTime: '09:00', days: ['Mon'], instructorId: 'teacher', roomId: '', buildingId: '', ...overrides }
}

test('maps preserved row IDs to actual workbook cells after inserting rows', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].rowNumber = 501
  sheet.rows[0].values[2] = 'ITE 101'
  const saved = createDepartmentScheduleWorkbookState([sheet], 0, null)
  const row = { id: 'class1', sourceWorkbook: 'path', sourceSheet: 'Schedule', sourceRow: 501, rawValues: [...sheet.rows[0].values], meetings: [] }
  const location = scheduleRoomWorkbookLocation(saved.editorState, row)
  assert.equal(location.workbookRow, 3)
  const texts = scheduleRoomWorkbookTexts([meeting()], [meeting({ room: 'Room 201', roomId: 'room1' })], location.values)
  saved.snapshot.cellTextOverrides.set('Schedule', new Map([['T3', texts[0]], ['U3', texts[1]]]))
  const reopened = readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(saved.snapshot))
  assert.equal(reopened.sheets[0].rows[0].values[19], 'Room 201')
  assert.equal(reopened.sheets[0].rows[0].values[2], 'ITE 101')
  assert.equal(reopened.sheets[0].rows.length, 40)
})

test('slash-separated rooms retain their meeting positions and independent Lab values', () => {
  const before = [meeting(), meeting({ startTime: '09:00', endTime: '10:30' }), meeting({ format: 'Lab', room: 'Existing Lab', roomId: 'lab' })]
  const after = before.map((entry, index) => index === 1 ? { ...entry, room: 'PTC 202', roomId: 'room2' } : entry)
  const values = Array(21).fill('')
  values[19] = ''
  values[20] = 'Existing Lab'
  assert.deepEqual(scheduleRoomWorkbookTexts(before, after, values), ['TBA/PTC 202', 'Existing Lab'])
  assert.deepEqual(scheduleRoomWorkbookTexts(after, before, values), ['TBA', 'Existing Lab'])
})

test('same room can be shared across multiple meetings; unchanged room text is preserved on approval', () => {
  const before = [meeting(), meeting({ startTime: '09:00', endTime: '10:30' })]
  const after = before.map(entry => ({ ...entry, room: 'PTC 201', roomId: 'room1' }))
  assert.deepEqual(scheduleRoomWorkbookTexts(before, after, Array(21).fill('')), ['PTC 201', ''])
  const values = Array(21).fill('')
  values[19] = ' PTC 201 / PTC 201 '
  assert.deepEqual(scheduleRoomWorkbookTexts(after, after, values), [' PTC 201 / PTC 201 ', ''])
})

test('unprovided room slots stay blank when another room is assigned or cleared', () => {
  const before = [meeting({ room: '' }), meeting({ room: '', startTime: '09:00', endTime: '10:30' })]
  const after = before.map((entry, index) => index === 1 ? { ...entry, room: 'PTC 202', roomId: 'room2' } : entry)
  assert.deepEqual(scheduleRoomWorkbookTexts(before, after, Array(21).fill('')), ['/PTC 202', ''])
  assert.deepEqual(scheduleRoomWorkbookTexts(after, before, Array(21).fill('')), ['', ''])
})

test('missing, unmarked, or changed workbook source rows fail before plotting', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values[2] = 'New code'
  const saved = createDepartmentScheduleWorkbookState([sheet], 0, null)
  const row = { id: 'class1', sourceWorkbook: 'path', sourceSheet: 'Schedule', sourceRow: 3, rawValues: Array(21).fill(''), meetings: [] }
  assert.throws(() => scheduleRoomWorkbookLocation(saved.editorState, row), /row changed/)
  assert.throws(() => scheduleRoomWorkbookLocation(saved.editorState, { ...row, sourceRow: 999 }), /cannot be located/)
  delete saved.snapshot.workbook.Sheets.Schedule['!rormsDepartmentScheduleImport']
  assert.throws(() => scheduleRoomWorkbookLocation(serializeFirestoreWorkbookState(saved.snapshot), row), /cannot be located/)
})
