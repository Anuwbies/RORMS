import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet, type DepartmentScheduleImportSheet } from '../src/utils/departmentScheduleImport.ts'
import { createDepartmentScheduleWorkbookState } from '../src/utils/departmentScheduleWorkbookState.ts'
import { departmentScheduleImportRowIssues, extractDepartmentScheduleImportRows } from '../src/utils/departmentScheduleImportRows.ts'
import type { ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'
import { parseExcelScheduleDays } from '../src/utils/ScheduleValidation.ts'

const directory: ScheduleDirectory = { departmentCode: 'CITE', faculty: [{ id: 'member1', fullName: 'Engelbert Cruz', department: 'CITE' }],
  rooms: [{ id: 'room1', code: 'PTC 201', name: 'Lecture 201', buildingId: 'ptc' }] }
const values = () => ['CITE', 'IT', 'ITE 101', 'Computing', 'BSIT', '2', '1', '3', '2', '3', '5.00', '40', '1', 'Cruz, Engelbert', '', '7:30-9:00', '', 'WED', '', 'PTC 201', '']
function extract(sheets: DepartmentScheduleImportSheet[]) {
  const saved = createDepartmentScheduleWorkbookState(sheets, 0, null)
  return extractDepartmentScheduleImportRows(saved.snapshot, saved.ownedNames, sheets, directory)
}

function parallelSheet() {
  const sheet = createEmptyDepartmentScheduleSheet()
  for (let index = 0; index < 4; index++) {
    sheet.rows[index].values = values()
    sheet.rows[index].values[0] = index === 0 ? 'PARALLEL' : ''
    sheet.rows[index].values[12] = String(index + 1)
  }
  return sheet
}

test('four parallel sections share one instructor meeting and room without overlap warnings', () => {
  const sheet = parallelSheet()
  const rows = extract([sheet])
  assert.equal(rows.length, 4)
  assert.ok(rows.every(row => row.parallelSourceRow === sheet.rows[0].rowNumber))
  assert.ok(rows.every(row => row.validationIssues.length === 0))
  assert.equal(departmentScheduleImportRowIssues([sheet], directory).size, 0)
})

test('parallel classes still conflict with outside classes and separate parallel groups', () => {
  const sheet = parallelSheet()
  sheet.rows[4].values = values()
  sheet.rows[4].values[0] = 'PARALLEL'
  sheet.rows[4].values[12] = '5'
  const rows = extract([sheet])
  assert.equal(rows[4].parallelSourceRow, sheet.rows[4].rowNumber)
  assert.ok(rows.every(row => row.validationIssues.some(message => message.includes('is also assigned on'))))
  sheet.rows[4].values[0] = 'CITE'
  sheet.rows[4].values[2] = 'ITE 102'
  assert.ok(extract([sheet]).every(row => row.validationIssues.some(message => message.includes('is also assigned on'))))
})

test('parallel exemption requires matching instructor, days, times and different sections', () => {
  for (const [field, value] of [[13, 'Other Faculty'], [17, 'WED/FRI'], [15, '8:00-10:00'], [12, '1']] as const) {
    const sheet = parallelSheet()
    sheet.rows[1].values[field] = value
    assert.ok(extract([sheet])[1].validationIssues.some(message => message.includes('is also assigned on')), `${field}: ${value}`)
  }
  const sheet = parallelSheet()
  sheet.rows[0].values[0] = 'CITE'
  assert.ok(extract([sheet]).every(row => row.validationIssues.some(message => message.includes('is also assigned on'))))
})

test('saves a schedule with an assigned room as Draft and retains all 21 header fields', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  const [row] = extract([sheet])
  assert.equal(row.status, 'Draft')
  assert.equal(row.sourceSheet, 'Schedule')
  assert.equal(row.sourceRow, 3)
  assert.equal(row.yearLevel, 1)
  assert.equal(row.subjectCode, 'ITE 101')
  assert.equal(row.subjectTitle, 'Computing')
  assert.equal(row.classSection, '1')
  assert.equal(row.college, 'CITE')
  assert.equal(row.subjectArea, 'IT')
  assert.equal(row.course, 'BSIT')
  assert.deepEqual(row.units, { lec: 2, lab: 1, total: 3 })
  assert.deepEqual(row.hours, { lec: 2, lab: 3, total: 5 })
  assert.equal(row.maxStudents, 40)
  assert.deepEqual(row.rawValues, values())
  assert.deepEqual(row.meetings.map(meeting => [meeting.instructorId, meeting.startTime, meeting.endTime, meeting.days, meeting.roomId]),
    [['member1', '07:30', '09:00', ['Wed'], 'room1']])
})

test('includes hidden years and multiple sheets; keeps stable source IDs after inserted rows', () => {
  const first = createEmptyDepartmentScheduleSheet()
  first.yearSections![2].hidden = true
  first.rows[20] = { rowNumber: 501, values: values() }
  const second = { ...createEmptyDepartmentScheduleSheet(), name: 'Second' }
  second.rows[30] = { rowNumber: 900, values: values() }
  const rows = extract([first, second])
  assert.deepEqual(rows.map(row => [row.sourceSheet, row.sourceRow, row.yearLevel, row.status]),
    [['Schedule', 501, 3, 'Draft'], ['Second', 900, 4, 'Draft']])
})

test('uses detected curriculum headings and renamed year labels for year level', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.yearSections![0] = { start: 0, count: 10, label: '2BSIT: 2023-24 CURRICULUM' }
  sheet.rows[0].values = values()
  sheet.rows[0].values[4] = ''
  let [row] = extract([sheet])
  assert.equal(row.yearLevel, 2)
  assert.equal(row.course, '2BSIT')
  sheet.yearSections![0].sourceLabel = sheet.yearSections![0].label
  sheet.yearSections![0].label = '3rd Year'
  ;[row] = extract([sheet])
  assert.equal(row.yearLevel, 3)
})

test('blank rows and year labels are not schedule documents, but partially filled rows are included', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  assert.deepEqual(extract([sheet]), [])
  sheet.rows[0].values[0] = 'CITE'
  sheet.rows[1].values[2] = ' ITE 101 '
  const rows = extract([sheet])
  assert.deepEqual(rows.map(row => [row.sourceRow, row.status]), [[3, 'Draft'], [4, 'Draft']])
  assert.equal(rows[1].subjectCode, 'ITE 101')
  sheet.rows[0].values.fill('')
  sheet.rows[1].values.fill('')
  assert.deepEqual(extract([sheet]), [])
})

test('no assigned room stays Draft, including TBA, unknown, and ambiguous room text', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  for (const room of ['', 'TBA', 'N/A', '-', 'Unknown Room']) {
    sheet.rows[0].values = values()
    sheet.rows[0].values[19] = room
    const [row] = extract([sheet])
    assert.equal(row.status, 'Draft', room)
    assert.equal(row.meetings[0].roomId, '')
  }
  sheet.rows[0].values[19] = 'PTC 201'
  const saved = createDepartmentScheduleWorkbookState([sheet], 0, null)
  const [ambiguous] = extractDepartmentScheduleImportRows(saved.snapshot, saved.ownedNames, [sheet], {
    ...directory, rooms: [...directory.rooms, { ...directory.rooms[0], id: 'duplicate' }],
  })
  assert.equal(ambiguous.status, 'Draft')
})

test('assigned Lec or Lab rooms keep a partially assigned schedule Draft', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  sheet.rows[0].values[14] = 'Cruz, Engelbert'
  sheet.rows[0].values[16] = '9:00-10:30'
  sheet.rows[0].values[18] = 'WED'
  let [row] = extract([sheet])
  assert.equal(row.status, 'Draft')
  assert.deepEqual(row.meetings.map(meeting => meeting.roomId), ['room1', ''])
  sheet.rows[0].values[19] = ''
  sheet.rows[0].values[20] = 'PTC 201'
  ;[row] = extract([sheet])
  assert.equal(row.status, 'Draft')
  assert.deepEqual(row.meetings.map(meeting => meeting.roomId), ['', 'room1'])
  sheet.rows[0].values[20] = ''
  ;[row] = extract([sheet])
  assert.equal(row.status, 'Draft')
})

test('validates overlapping instructor and room meetings across sheets using directory aliases', () => {
  const first = createEmptyDepartmentScheduleSheet()
  const second = { ...createEmptyDepartmentScheduleSheet(), name: 'Second' }
  first.rows[0].values = values()
  second.rows[0].values = values()
  second.rows[0].values[2] = 'ITE 102'
  second.rows[0].values[3] = 'Other subject'
  second.rows[0].values[13] = 'Engelbert Cruz (NEW)'
  second.rows[0].values[15] = '8:00-10:00'
  second.rows[0].values[19] = 'Lecture 201'
  const rows = extract([first, second])
  for (const row of rows) {
    assert.ok(row.validationIssues.some(message => message.startsWith(`${row.meetings[0].faculty} is also assigned on `)))
    assert.ok(row.validationIssues.some(message => message.startsWith('Room ') && message.includes('is also assigned on')))
    assert.ok(!row.validationIssues.some(message => message.includes('not an active member') || message.includes('does not exist')))
  }
})

test('different days and adjacent times are valid, even for the same instructor and room', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  sheet.rows[1].values = values()
  sheet.rows[1].values[2] = 'ITE 102'
  sheet.rows[1].values[3] = 'Other subject'
  for (const [time, day] of [['9:00-10:30', 'WED'], ['7:30-9:00', 'THU']]) {
    sheet.rows[1].values[15] = time
    sheet.rows[1].values[17] = day
    assert.ok(extract([sheet]).every(row => row.validationIssues.length === 0))
  }
})

test('slash-separated meetings and Lec/Lab overlaps within one row are checked', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  sheet.rows[0].values[15] = '7:30-9:00/8:00-10:00'
  sheet.rows[0].values[17] = 'WED/WED'
  let [row] = extract([sheet])
  assert.ok(row.validationIssues.some(message => message.startsWith(`${row.meetings[0].faculty} is also assigned on `)))
  assert.ok(row.validationIssues.some(message => message.startsWith('Room ') && message.includes('is also assigned on')))
  assert.ok(!row.validationIssues.some(message => message.includes('Duplicate Subject')))
  sheet.rows[0].values = values()
  sheet.rows[0].values[14] = 'Cruz, Engelbert'
  sheet.rows[0].values[16] = '8:00-10:00'
  sheet.rows[0].values[18] = 'WED'
  sheet.rows[0].values[20] = 'Lecture 201'
  ;[row] = extract([sheet])
  assert.ok(row.validationIssues.some(message => message.includes('is also assigned on')))
})

test('duplicate subjects are flagged per section, program and year, independent of meeting times', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  sheet.rows[1].values = values()
  sheet.rows[1].values[15] = '9:00-10:30'
  assert.ok(extract([sheet]).every(row => row.validationIssues.some(message => message.includes('Duplicate Subject'))))
  assert.deepEqual(extract([sheet])[0].validationIssues, [
    'Duplicate Subject ITE 101 for Section 1 · Row 2.',
  ])
  sheet.rows[1].values[12] = '2'
  assert.ok(extract([sheet]).every(row => row.validationIssues.length === 0))
  sheet.rows[1].values[12] = '1'
  sheet.rows[1].values[4] = 'BITE'
  assert.ok(extract([sheet]).every(row => row.validationIssues.length === 0))
  sheet.rows[1].values.fill('')
  sheet.rows[10].values = values()
  sheet.rows[10].values[15] = '9:00-10:30'
  assert.ok(extract([sheet]).every(row => row.validationIssues.length === 0))
})

test('only non-placeholder instructors outside the department and nonexistent rooms are reported', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  sheet.rows[0].values[13] = 'Outside Instructor'
  sheet.rows[0].values[19] = 'Missing Room'
  const [row] = extract([sheet])
  assert.equal(row.validationIssues.length, 2)
  assert.ok(row.validationIssues.includes('Outside Instructor is not an active member of CITE.'))
  assert.ok(row.validationIssues.some(message => message.includes('does not exist in the rooms collection')))
  for (const placeholder of ['', 'TBA', 'N/A', '-']) {
    sheet.rows[0].values[13] = placeholder
    sheet.rows[0].values[19] = placeholder
    assert.equal(extract([sheet])[0].validationIssues.length, 0)
  }
})

test('blank fields, durations and unmatched courses remain allowed while malformed times and days are reported', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values[2] = 'UNKNOWN 999'
  assert.deepEqual(extract([sheet])[0].validationIssues, [])
  sheet.rows[0].values = values()
  sheet.rows[0].values[15] = '7:30-19:00'
  assert.deepEqual(extract([sheet])[0].validationIssues, [])
  sheet.rows[0].values[15] = 'invalid time'
  sheet.rows[0].values[17] = 'invalid day'
  assert.deepEqual(extract([sheet])[0].validationIssues, [
    'invalid time is not a valid time. Use a range such as 7:30-9:00.',
    'invalid day is not a valid day. Use MON, TUE, WED, THU, FRI, SAT, or SUN.',
  ])
})

test('invalid Lec and Lab days and time ranges are reported and clear after correction', () => {
  for (const [column, text, expected] of [[15, '25:00-26:00', 'not a valid time'], [16, '9:99-10:30', 'not a valid time'],
    [15, '7:30AM-9:00AM', 'not a valid time'], [16, '1:00 PM-2:00 PM', 'not a valid time'],
    [15, '7:30-9:00am', 'not a valid time'], [16, '1:00p.m.-2:00p.m.', 'not a valid time'],
    [17, 'BAT', 'BAT is not a valid day'], [17, 'SAS', 'SAS is not a valid day'], [18, 'MON/BAT', 'not a valid day']] as const) {
    const sheet = createEmptyDepartmentScheduleSheet()
    sheet.rows[0].values = values()
    sheet.rows[0].values[column] = text
    assert.ok(extract([sheet])[0].validationIssues.some(message => message.includes(expected)), `${column}: ${text}`)
    assert.ok([...departmentScheduleImportRowIssues([sheet], directory).values()].flat().some(message => message.includes(expected)))
    sheet.rows[0].values[column] = column < 17 ? '7:30-9:00/13:00-14:00' : 'MON/WED'
    assert.ok(extract([sheet])[0].validationIssues.every(message => !message.includes('not a valid')))
  }
})

test('only the seven three-letter days and at most two slash-separated days are valid', () => {
  for (const value of ['SAS', 'SS', 'SATSAT', 'FRIF', 'SA', 'M', 'TTH', 'MONDAY', 'MONWED', 'MON,SAT', 'MON;SAT', 'MON/SAT/SUN', 'MON/MON', 'MON/']) {
    assert.deepEqual(parseExcelScheduleDays(value), [], value)
  }
  for (const value of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) assert.equal(parseExcelScheduleDays(value)[0]?.toUpperCase(), value)
  assert.deepEqual(parseExcelScheduleDays('MON/SAT'), ['Mon', 'Sat'])
})

test('live row issues match Save, update after edits and clear when a conflicting row is removed', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0] = { rowNumber: 501, values: values() }
  sheet.rows[1] = { rowNumber: 902, values: values() }
  let issues = departmentScheduleImportRowIssues([sheet], directory)
  for (const row of extract([sheet])) assert.deepEqual(issues.get(JSON.stringify([row.sourceSheet, row.sourceRow])), row.validationIssues)
  assert.ok(issues.has(JSON.stringify(['Schedule', 501])))
  assert.ok(issues.has(JSON.stringify(['Schedule', 902])))
  sheet.rows[1].values[2] = 'ITE 102'
  sheet.rows[1].values[3] = 'Other subject'
  sheet.rows[1].values[15] = '9:00-10:30'
  issues = departmentScheduleImportRowIssues([sheet], directory)
  assert.equal(issues.size, 0)
  sheet.rows[1].values[15] = '8:00-10:00'
  assert.equal(departmentScheduleImportRowIssues([sheet], directory).size, 2)
  sheet.rows[1].values.fill('')
  assert.equal(departmentScheduleImportRowIssues([sheet], directory).size, 0)
  assert.equal(departmentScheduleImportRowIssues([], directory).size, 0)
})

test('the standalone workbook skips department membership checks until a department is available', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values = values()
  const noDepartment = { ...directory, departmentCode: '', faculty: [] }
  assert.equal(departmentScheduleImportRowIssues([sheet], noDepartment).size, 0)
  sheet.rows[0].values[19] = 'Missing room'
  const messages = departmentScheduleImportRowIssues([sheet], noDepartment).get(JSON.stringify(['Schedule', sheet.rows[0].rowNumber]))!
  assert.equal(messages.length, 1)
  assert.ok(messages[0].includes('does not exist'))
})

test('conflict locations use year labels and visible row counters instead of XLSX source rows', () => {
  const sheet = { ...createEmptyDepartmentScheduleSheet(), name: 'UY' }
  sheet.rows[9] = { rowNumber: 501, values: values() }
  sheet.rows[10] = { rowNumber: 922, values: values() }
  sheet.rows[10].values[2] = 'ITE 102'
  sheet.rows[10].values[3] = 'Other subject'
  const rows = extract([sheet])
  assert.ok(rows[0].validationIssues.every(message => message.includes('2nd Year · Row 1')))
  assert.ok(rows[1].validationIssues.every(message => message.includes('1st Year · Row 10')))
  assert.ok(rows.every(row => row.validationIssues.every(message => !message.includes('UY') && !message.includes('501') && !message.includes('922'))))
  sheet.yearSections![1].label = '2BSIT: 2023-24 CURRICULUM'
  assert.ok(extract([sheet])[0].validationIssues.every(message => message.includes('2BSIT · Row 1') && !message.includes('CURRICULUM')))
})

test('conflict locations omit worksheet names and use only the year and visible row', () => {
  const first = { ...createEmptyDepartmentScheduleSheet(), name: 'UY' }
  const second = { ...createEmptyDepartmentScheduleSheet(), name: 'Other' }
  first.rows[0] = { rowNumber: 501, values: values() }
  second.rows[30] = { rowNumber: 922, values: values() }
  second.rows[30].values[2] = 'ITE 102'
  second.rows[30].values[3] = 'Other subject'
  const rows = extract([first, second])
  assert.ok(rows[0].validationIssues.every(message => message.includes('4th Year · Row 1')))
  assert.ok(rows[1].validationIssues.every(message => message.includes('1st Year · Row 1')))
  assert.ok(rows.every(row => row.validationIssues.every(message => !message.includes('Worksheet') && !message.includes('UY') && !message.includes('Other'))))
})
