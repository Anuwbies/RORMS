import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { parseDepartmentScheduleImportRows } from '../src/utils/departmentScheduleImportRows.ts'
import { departmentFacultyScheduleAssignments, facultyScheduleRowKey, parseExcelScheduleDays, parseExcelScheduleTime } from '../src/utils/ScheduleValidation.ts'
import { recommendInstructorSchedule, recommendInstructorScheduleOptions } from '../src/utils/instructorScheduleRecommendations.ts'
import type { ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'

const directory: ScheduleDirectory = {
  departmentCode: 'CITE', faculty: ['Cruz, Engelbert', 'Diaz, Jeremie'].map((fullName, index) => ({ id: String(index), fullName, department: 'CITE' })),
  rooms: ['A', 'B'].map(id => ({ id, code: `${id}101`, name: `${id} 101`, buildingId: 'main' })),
}
const values = (room = 'A101', time = '13:30-15:00', day = 'FRI', faculty = 'Cruz, Engelbert') => [
  'CITE', 'IT', 'ITE 101', 'Computing', 'BSIT', '2', '1', '3', '2', '3', '5', '40', '1', faculty, '', time, '', day, '', room, '',
]
function setup(usedDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']) {
  const first = createEmptyDepartmentScheduleSheet(), second = createEmptyDepartmentScheduleSheet()
  second.name = 'Other year'
  first.rows[0].values = values()
  second.rows[0].values = values('B101'); second.rows[0].values[12] = '2'
  for (const [index, day] of usedDays.entries()) {
    first.rows[20 + index].values = values('B101', '7:30-9:00', day, 'Diaz, Jeremie')
    first.rows[20 + index].values[2] = `ITE ${200 + index}`
  }
  const sheets = [first, second]
  const recommendations = (column: number) => recommendInstructorSchedule(
    departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(sheets, directory), directory),
    facultyScheduleRowKey(first.name, first.rows[0].rowNumber), column, first.rows[0].values[column])
  const verify = (column: number, choices: string[]) => {
    assert.ok(choices.length > 0)
    for (const choice of choices) {
      const proposed = structuredClone(sheets)
      proposed[0].rows[0].values[column] = choice
      const row = parseDepartmentScheduleImportRows(proposed, directory).find(item => item.sourceSheet === first.name && item.sourceRow === first.rows[0].rowNumber)!
      assert.ok(row.validationIssues.every(message => !message.includes('is also assigned on')), `${choice}: ${row.validationIssues.join('; ')}`)
    }
  }
  return { first, second, sheets, recommendations, verify }
}

test('time alternatives preserve duration, use numeric ranges and avoid instructor conflicts across worksheets', () => {
  const h = setup(), choices = h.recommendations(15)
  assert.equal(choices.length, 14)
  for (const choice of choices) {
    const time = parseExcelScheduleTime(choice)!
    assert.equal(time.end - time.start, 90)
    assert.ok(time.start >= 450 && time.end <= 1080)
    assert.ok(!/[APM]/i.test(choice))
  }
  h.verify(15, choices)
})

test('day alternatives keep the time and exclude instructor and room conflicts', () => {
  const h = setup()
  assert.deepEqual([...h.recommendations(17)].sort(), ['MON', 'TUE', 'WED', 'THU', 'SAT', 'SUN'].sort())
  h.second.rows[1].values = values('A101', '13:30-15:00', 'MON', 'Diaz, Jeremie')
  const choices = h.recommendations(17)
  assert.equal(choices.length, 5)
  assert.ok(choices.every(day => day !== 'FRI' && day !== 'MON' && parseExcelScheduleDays(day).length === 1))
  assert.equal(h.first.rows[0].values[15], '13:30-15:00')
  h.verify(17, choices)
})

test('day recommendations use only the department workbook days, including other sheets and Lab entries', () => {
  const h = setup([])
  h.second.rows[1].values = values('B101', '7:30-9:00', 'TUE', 'Diaz, Jeremie')
  h.second.rows[1].values[14] = 'Diaz, Jeremie'
  h.second.rows[1].values[16] = '9:00-10:30'
  h.second.rows[1].values[18] = 'WED/SAT'
  h.second.rows[1].values[20] = 'B101'
  const days = h.recommendations(17)
  assert.deepEqual([...days].sort(), ['TUE', 'WED', 'SAT'].sort())
  h.verify(17, days)
  h.second.rows[1].values[18] = ''
  assert.deepEqual(h.recommendations(17), ['TUE'])
})

test('unused or invalid department days are never introduced and time recommendations remain available', () => {
  const h = setup([])
  assert.deepEqual(h.recommendations(17), [])
  h.second.rows[1].values = values('B101', '7:30-9:00', 'BAT', 'Diaz, Jeremie')
  assert.deepEqual(h.recommendations(17), [])
  assert.equal(h.recommendations(15).length, 14)
})

test('recommendation dropdown distinguishes an inactive search from a triggered search with no alternatives', () => {
  const h = setup([])
  const options = (column: number) => recommendInstructorScheduleOptions(
    departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(h.sheets, directory), directory),
    facultyScheduleRowKey(h.first.name, h.first.rows[0].rowNumber), column, h.first.rows[0].values[column])
  assert.deepEqual(options(17), []) // Friday conflict, with no other department weekdays.
  assert.ok(options(15)!.length > 0)
  h.second.rows[0].values[13] = 'Diaz, Jeremie'
  assert.equal(options(15), null)
  assert.equal(options(17), null)
  h.second.rows[0].values[19] = 'A101' // A room-only conflict is not an instructor trigger.
  assert.equal(options(15), null)
  assert.equal(options(17), null)
  h.first.rows[0].values[17] = 'TBA'
  assert.equal(options(17), null)
})

test('a non-overlapping day stays fixed while its conflicting partner uses only existing department days', () => {
  const h = setup(['TUE'])
  h.first.rows[0].values[17] = 'WED/FRI'
  assert.deepEqual(h.recommendations(17), ['WED/TUE'])
})

test('two Friday meetings can both move to Wednesday when the instructor is free at both times', () => {
  const h = setup([])
  h.first.rows[0].values[15] = '10:30-12:00/13:30-15:00'
  h.first.rows[0].values[17] = 'FRI/FRI'
  h.second.rows[1].values = values('B101', '11:00-12:00', 'FRI')
  h.second.rows[2].values = values('B101', '12:00-13:30', 'WED')
  h.second.rows[3].values = values('B101', '10:30-12:00/13:30-15:00', 'SAT/SAT')
  assert.deepEqual(h.recommendations(17), ['WED/WED'])
  h.verify(17, h.recommendations(17))
  h.second.rows[4].values = values('A101', '10:30-12:00', 'WED', 'Diaz, Jeremie')
  assert.deepEqual(h.recommendations(17), [])
})

test('paired repeated-day recommendations preserve the unaffected meeting and reject overlapping times', () => {
  const h = setup(['WED'])
  h.first.rows[0].values[15] = '10:30-12:00/13:30-15:00'
  h.first.rows[0].values[17] = 'FRI/FRI'
  h.second.rows[0].values[15] = '11:00-12:00'
  assert.deepEqual(h.recommendations(17), ['WED/FRI'])
  h.verify(17, h.recommendations(17))
  h.first.rows[0].values[15] = '10:30-12:00/11:30-13:00'
  assert.ok(!h.recommendations(17).includes('WED/WED'))
  h.first.rows[0].values[15] = '10:30-12:00'
  assert.deepEqual(h.recommendations(17), [])
})

test('time alternatives reject a free instructor slot when the assigned room is occupied', () => {
  const h = setup(), blocked = h.recommendations(15)[0]
  h.second.rows[1].values = values('A101', blocked, 'FRI', 'Diaz, Jeremie')
  const choices = h.recommendations(15)
  assert.ok(!choices.includes(blocked))
  h.verify(15, choices)
})

test('slash-separated time and day recommendations preserve the unaffected meeting', () => {
  const h = setup()
  h.first.rows[0].values[15] = '13:30-15:00/15:00-16:30'
  h.first.rows[0].values[17] = 'FRI/SAT'
  const times = h.recommendations(15), days = h.recommendations(17)
  assert.ok(times.every(text => text.split('/')[1] === '15:00-16:30'))
  assert.ok(days.every(text => text.split('/')[1] === 'SAT' && text.split('/').every(day => parseExcelScheduleDays(day).length === 1)))
  assert.ok(days.includes('SAT/SAT'))
  h.verify(15, times); h.verify(17, days)
})

test('only an overlapping second day changes, allowing a shared day for separate meetings', () => {
  for (const time of ['13:30-15:00', '7:30-9:00/13:30-15:00']) {
    const h = setup()
    h.first.rows[0].values[15] = time
    h.first.rows[0].values[17] = 'WED/FRI'
    for (const [index, day] of ['TUE', 'THU', 'SAT'].entries()) h.second.rows[index + 1].values = values('B101', '13:30-15:00', day)
    const choices = h.recommendations(17)
    const replacementDays = time.includes('/') ? ['MON', 'SUN', 'WED'] : ['MON', 'SUN']
    assert.equal(choices.length, replacementDays.length)
    assert.ok(choices.every(text => text.startsWith('WED/') && replacementDays.includes(text.split('/')[1])))
    h.verify(17, choices)
  }
})

test('only an overlapping first day changes and a clear second day remains in its original position', () => {
  const h = setup()
  h.first.rows[0].values[17] = 'FRI/WED'
  const choices = h.recommendations(17)
  assert.equal(choices.length, 5)
  assert.ok(choices.every(text => text.endsWith('/WED') && !text.startsWith('FRI/')))
  h.verify(17, choices)
})

test('fully blocked replacements do not move a non-overlapping day to fill the list', () => {
  const h = setup()
  h.first.rows[0].values[17] = 'WED/FRI'
  for (const [index, day] of ['MON', 'TUE', 'THU', 'SAT', 'SUN'].entries()) h.second.rows[index + 1].values = values('B101', '13:30-15:00', day)
  assert.deepEqual(h.recommendations(17), [])
})

test('multiple conflicting meetings are both corrected and shared day counts remain unchanged', () => {
  const h = setup()
  h.first.rows[0].values[15] = '13:30-15:00/15:00-16:30'
  h.first.rows[0].values[17] = 'FRI/SAT'
  h.second.rows[1].values = values('B101', '15:00-16:30', 'SAT')
  const choices = h.recommendations(15)
  assert.ok(choices.every(text => text.split('/').length === 2))
  h.verify(15, choices)
  h.first.rows[0].values[15] = '13:30-15:00'; h.first.rows[0].values[17] = 'MON/FRI'
  const days = h.recommendations(17)
  assert.ok(days.every(text => parseExcelScheduleDays(text).length === 2))
  assert.equal(new Set(days.map(text => parseExcelScheduleDays(text).join('/'))).size, days.length)
  h.verify(17, days)
})

test('Lec recommendations check Lab meetings too, and Lab conflicts get their own choices', () => {
  const h = setup()
  const blocked = h.recommendations(15)[0]
  h.first.rows[0].values[14] = 'Cruz, Engelbert'
  h.first.rows[0].values[16] = blocked
  h.first.rows[0].values[18] = 'FRI'
  h.first.rows[0].values[20] = 'A101'
  assert.ok(!h.recommendations(15).includes(blocked))
  h.verify(15, h.recommendations(15))
  h.first.rows[0].values[15] = '7:30-9:00'
  h.first.rows[0].values[16] = '13:30-15:00'
  h.first.rows[0].values[18] = 'FRI'
  h.verify(16, h.recommendations(16))
  h.verify(18, h.recommendations(18))
})

test('parallel schedules do not trigger suggestions unless an outside meeting conflicts', () => {
  const h = setup(); h.sheets.splice(1)
  for (let index = 0; index < 4; index++) {
    h.first.rows[index].values = values()
    h.first.rows[index].values[0] = index === 0 ? 'PARALLEL' : ''
    h.first.rows[index].values[12] = String(index + 1)
  }
  assert.deepEqual(h.recommendations(15), []); assert.deepEqual(h.recommendations(17), [])
  h.first.rows[4].values = values(); h.first.rows[4].values[2] = 'ITE 102'
  h.verify(15, h.recommendations(15)); h.verify(17, h.recommendations(17))
})

test('invalid input, room-only conflicts and fully occupied instructors do not offer unsafe alternatives', () => {
  const h = setup()
  h.second.rows[0].values = values('A101', '13:30-15:00', 'FRI', 'Diaz, Jeremie')
  assert.deepEqual(h.recommendations(15), []); assert.deepEqual(h.recommendations(17), [])
  h.first.rows[0].values[15] = 'bad'; assert.deepEqual(h.recommendations(15), [])
  h.first.rows[0].values[15] = '13:30-15:00'; h.first.rows[0].values[17] = 'BAT'
  assert.deepEqual(h.recommendations(17), [])
  h.first.rows[0].values[17] = 'FRI'
  for (const [index, day] of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].entries()) h.second.rows[index].values = values('B101', '7:30-18:00', day)
  assert.deepEqual(h.recommendations(15), []); assert.deepEqual(h.recommendations(17), [])
})
