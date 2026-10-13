import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { extractWorkbookScheduleRows, type ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'
import type { WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { scheduleMeetingRecords } from '../src/utils/scheduleMeetings.ts'
import { plotScheduleRows } from '../src/utils/excelScheduleTemplate.ts'
import { deserializeWorkbookState, serializeWorkbookState } from '../src/utils/excelWorkbookState.ts'

const directory: ScheduleDirectory = { departmentCode: 'CITE', faculty: [
  { id: 'cruz', fullName: 'Engelbert Cruz', department: 'CITE' },
  { id: 'jan', fullName: 'Narvasa, Jan Julienne', department: 'CITE' },
], rooms: [
  { id: 'room1', code: 'PTC-201', name: 'Lecture 201', buildingId: 'ptc' },
  { id: 'room2', code: 'PTC 305', name: 'Lecture 305', buildingId: 'ptc' },
] }

function values(overrides: Record<number, string> = {}) {
  const row = ['', 'IT', 'ITE 298', 'Information Management', '2BSIT', '2', '1', '3', '2', '3', '5.00', '50', '1', 'Cruz, Engelbert', '', '7:30-9:00', '', 'WED', '', 'PTC 201', '']
  for (const [column, value] of Object.entries(overrides)) row[Number(column)] = value
  return row
}

function snapshot(rows: string[][], years: number[] = rows.map(() => 2)): WorkbookEditSnapshot {
  const sheet = XLSX.utils.aoa_to_sheet([[], [], ...rows])
  return { workbook: { SheetNames: ['UY', 'Notes'], Sheets: { UY: sheet, Notes: XLSX.utils.aoa_to_sheet([['Not a schedule']]) }, Workbook: { Sheets: [{ name: 'UY', Hidden: 1 }, { name: 'Notes' }] } },
    scheduleSetups: new Map([['UY', { header: { s: { r: 0, c: 0 }, e: { r: 1, c: 20 } }, columns: Array.from({ length: 21 }, (_, i) => i), years: new Map(rows.map((_, i) => [i + 2, years[i] as 1 | 2 | 3 | 4])), includesEmptyRows: true }]]),
    cellTextOverrides: new Map(), mergeOverrides: new Map(), previewStyles: null,
    sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(), columnWidthOverrides: new Map(), cellStyleOverrides: new Map(), formattingOverrides: new Map(), hiddenRangeToggles: new Map(),
    selectedSheet: 'UY', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } } }
}

test('extracts every assigned year and header field; skips blank/heading/unconfigured rows, keeps hidden data', () => {
  const state = snapshot([['1BSIT: CURRICULUM'], values(), [], values({ 12: '2' }), values({ 12: '3' }), values({ 12: '4' })], [1, 1, 1, 2, 3, 4])
  state.workbook.Sheets.UY['!rows'] = [undefined, undefined, undefined, { hidden: true }]
  const rows = extractWorkbookScheduleRows(state, directory)
  assert.deepEqual(rows.map(row => row.yearLevel), [1, 2, 3, 4])
  assert.deepEqual(rows.map(row => row.sourceRow), [4, 6, 7, 8])
  assert.equal(rows[0].subjectArea, 'IT')
  assert.deepEqual(rows[0].units, { lec: 2, lab: 1, total: 3 })
  assert.deepEqual(rows[0].hours, { lec: 2, lab: 3, total: 5 })
  assert.equal(rows[0].maxStudents, 50)
  assert.equal(rows[0].meetings[0].instructorId, 'cruz')
  assert.equal(rows[0].meetings[0].roomId, 'room1')
})

test('plotted row statuses survive reopening and extraction; unmarked rows stay Draft and split meetings inherit Plot', () => {
  const state = snapshot([values(), [], values({ 12: '2', 13: 'Cruz, Engelbert/Narvasa, Jan Julienne' }), values({ 12: '3' })])
  const sheet = state.workbook.Sheets.UY
  const read = (r: number, c: number) => String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? '')
  state.scheduleSetups.set('UY', plotScheduleRows(state.scheduleSetups.get('UY')!, { s: { r: 2, c: 13 }, e: { r: 4, c: 13 } }, read))
  const restored = deserializeWorkbookState(serializeWorkbookState(state), {})
  const rows = extractWorkbookScheduleRows(restored, directory)
  assert.deepEqual(rows.map(row => [row.sourceRow, row.status]), [[3, 'Plot'], [5, 'Plot'], [6, 'Draft']])
  const meetings = scheduleMeetingRecords(rows.map((row, index) => ({ id: String(index), data: () => ({ ...row, source: 'workbook', schemaVersion: 2 }) })))
  assert.deepEqual(meetings.map(row => row.status), ['Plot', 'Plot', 'Plot', 'Draft'])
  assert.equal(extractWorkbookScheduleRows(snapshot([values()]), directory)[0].status, 'Draft')
})

test('pairs two faculty, times, days and rooms by position; commas stay inside names', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({ 13: 'Cruz, Engelbert/Narvasa, Jan Julienne', 15: '10:30-12:00/1:30-3:00', 17: 'WED/SAT', 19: 'PTC 201/PTC 305' })]), directory)
  assert.deepEqual(row.meetings.map(item => [item.instructorId, item.startTime, item.endTime, item.days, item.roomId]), [
    ['cruz', '10:30', '12:00', ['Wed'], 'room1'], ['jan', '13:30', '15:00', ['Sat'], 'room2'],
  ])
  assert.deepEqual(row.faculty.lec, ['Cruz, Engelbert', 'Narvasa, Jan Julienne'])
})

test('shares one room/faculty across two times and aligns two days', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({ 15: '10:30-12:00/1:30-3:00', 17: 'SAT/SAT' })]), directory)
  assert.equal(row.meetings.length, 2)
  assert.deepEqual(row.meetings.map(item => [item.instructorId, item.roomId, item.days]), [['cruz', 'room1', ['Sat']], ['cruz', 'room1', ['Sat']]])
})

test('one time with two days is one meeting recurring on both days; two resources reuse one time', () => {
  const [one] = extractWorkbookScheduleRows(snapshot([values({ 17: 'THU/FRI' })]), directory)
  assert.equal(one.meetings.length, 1)
  assert.deepEqual(one.meetings[0].days, ['Thu', 'Fri'])
  const [two] = extractWorkbookScheduleRows(snapshot([values({ 13: 'Cruz, Engelbert/Narvasa, Jan Julienne', 19: 'PTC 201/PTC 305' })]), directory)
  assert.deepEqual(two.meetings.map(item => [item.instructorId, item.startTime, item.roomId]), [['cruz', '07:30', 'room1'], ['jan', '07:30', 'room2']])
})

test('preserves Lec and Lab, edited values, merged resources, and inherited course', () => {
  const state = snapshot([values(), values({ 4: '', 12: '2', 13: '', 14: 'Narvasa, Jan Julienne', 16: '3:00-4:30', 18: 'FRI', 20: 'PTC 305' })])
  state.mergeOverrides.set('UY', [{ s: { r: 2, c: 13 }, e: { r: 3, c: 13 } }])
  state.cellTextOverrides.set('UY', new Map([['C4', 'ITE 083']]))
  const rows = extractWorkbookScheduleRows(state, directory)
  assert.equal(rows[1].subjectCode, 'ITE 083')
  assert.equal(rows[1].course, '2BSIT')
  assert.deepEqual(rows[1].meetings.map(item => [item.format, item.instructorId]), [['Lec', 'cruz'], ['Lab', 'jan']])
  assert.equal(rows[1].rawValues[13], '')
})

test('incomplete and invalid rows are retained with errors; empty positional entries are not shifted', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({ 2: '', 3: '', 13: '/Unregistered Teacher', 15: 'bad/1:30-3:00', 17: 'INVALID/WED', 19: 'Unknown/PTC 305' })]), directory)
  assert.equal(row.meetings[0].faculty, '')
  assert.equal(row.meetings[1].faculty, 'Unregistered Teacher')
  assert.equal(row.meetings[1].roomId, 'room2')
  assert.ok(row.validationIssues.some(issue => issue.includes('Missing Code')))
  assert.ok(row.validationIssues.some(issue => issue.includes('Invalid F2F Time')))
  assert.ok(row.validationIssues.some(issue => issue.includes('matched uniquely')))
})

test('parallel groups use the validation grouping and end when time changes', () => {
  const rows = extractWorkbookScheduleRows(snapshot([values({ 0: 'PARALLEL' }), values({ 4: '', 12: '2', 19: 'PTC 305' }), values({ 4: '', 12: '3', 15: '9:00-10:30' })]), directory)
  assert.deepEqual(rows.map(row => row.parallelSourceRow), [3, 3, null])
})

test('ambiguous names do not silently select an instructor', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values()]), { ...directory, faculty: [...directory.faculty, { ...directory.faculty[0], id: 'other' }] })
  assert.equal(row.meetings[0].instructorId, '')
  assert.ok(row.validationIssues.some(issue => issue.includes('Faculty')))
})

test('saved validation issues include unknown Lec/Lab rooms using the same room directory check as the editor', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({ 19: 'PTC 201/Unknown', 20: 'Missing Lab' })]), directory)
  assert.ok(row.validationIssues.includes('Room "Unknown" (Lec) does not exist in the rooms collection.'))
  assert.ok(row.validationIssues.includes('Room "Missing Lab" (Lab) does not exist in the rooms collection.'))
  assert.equal(row.meetings[0].roomId, 'room1')
  assert.equal(row.meetings[1].roomId, '')
})

test('saved faculty validation rejects names outside the department and does not assign their membership IDs', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({ 13: 'Cruz, Engelbert/Other Teacher', 14: 'Unknown Lab Teacher' })]), {
    ...directory,
    faculty: [...directory.faculty, { id: 'external', fullName: 'Other Teacher', department: 'CAS' }],
  })
  assert.equal(row.meetings[0].instructorId, 'cruz')
  assert.equal(row.meetings[1].instructorId, '')
  assert.ok(row.validationIssues.includes('Faculty "Other Teacher" (Lec) is not an active Instructor or Program Head in department "CITE".'))
  assert.ok(row.validationIssues.includes('Faculty "Unknown Lab Teacher" (Lab) is not an active Instructor or Program Head in department "CITE".'))
})

test('saved TBA faculty and rooms preserve meeting positions without resource IDs or validation errors', () => {
  const [row] = extractWorkbookScheduleRows(snapshot([values({
    13: ' tba /Cruz, Engelbert', 14: 'TBA',
    15: '7:30-9:00/9:00-10:30', 16: '1:30-3:00',
    17: 'MON', 18: 'MON', 19: 'TBA/PTC 201', 20: ' tBa ',
  })]), directory)
  assert.deepEqual(row.faculty, { lec: ['tba', 'Cruz, Engelbert'], lab: ['TBA'] })
  assert.deepEqual(row.f2fRoom, { lec: ['TBA', 'PTC 201'], lab: ['tBa'] })
  assert.deepEqual(row.meetings.map(item => [item.instructorId, item.roomId, item.buildingId]), [
    ['', '', ''], ['cruz', 'room1', 'ptc'], ['', '', ''],
  ])
  assert.deepEqual(row.validationIssues, [])
})

test('calendar adapter exposes each meeting, preserves legacy records and draft rows without meetings', () => {
  const documents = [
    { id: 'legacy', data: () => ({ instructorId: 'cruz', startTime: '07:30' }) },
    { id: 'row', data: () => ({ source: 'workbook', schemaVersion: 2, subjectCode: 'ITE 298', meetings: [{ instructorId: 'cruz', roomId: 'room1' }, { instructorId: 'jan', roomId: 'room2' }] }) },
    { id: 'blank', data: () => ({ source: 'workbook', schemaVersion: 2, meetings: [] }) },
  ]
  const records = scheduleMeetingRecords(documents)
  assert.equal(records.length, 4)
  assert.deepEqual(records.map(row => row.instructorId), ['cruz', 'cruz', 'jan', undefined])
  assert.equal(records[2].sourceScheduleId, 'row')
  assert.equal(records[2].parentId, 'row')
  assert.equal(records[1].id, records[2].parentId)
  assert.equal(new Set(records.map(row => row.id)).size, 4)
})
