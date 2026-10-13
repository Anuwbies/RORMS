import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dashboardInstructorMeetings, dashboardScheduleDays, dashboardScheduleMeetings, dashboardScheduleRows, dashboardScheduleStats } from '../src/utils/dashboardSchedules.ts'
import { roomScheduleRoom, roomScheduleSection, scheduleMatchesTerm } from '../src/utils/roomSchedule.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const year = { id: 'year1', academicYear: '2026 - 2027' }
const row = (id: string, changes: Record<string, unknown> = {}): ScheduleMeetingRecord => ({
  id, source: 'workbook', schemaVersion: 2, academicYearId: year.id, semesterKey: 'sem1', status: 'Draft', ...changes,
})
const document = (values: ScheduleMeetingRecord) => ({ id: values.id, data: () => values })
const meeting = (changes: Record<string, unknown> = {}) => ({
  format: 'Lec', instructorId: 'faculty1', roomId: 'room1', room: 'PTC 303',
  startTime: '07:30', endTime: '09:00', days: ['Mon'], ...changes,
})

test('dashboard totals count workbook rows once, with only Draft/Plot and separate validation issues', () => {
  const rows = dashboardScheduleRows([
    row('plot', { status: 'Plot', meetings: [meeting(), meeting({ format: 'Lab' })] }),
    row('draft', { meetings: [], validationIssues: ['Missing time', 'Missing room'] }),
    row('default', { status: undefined }),
    row('retired', { status: 'Revise' }), row('returned', { status: 'Return' }),
  ], year, '1st Semester')
  assert.deepEqual(dashboardScheduleStats(rows), { total: 3, plotted: 1, drafted: 2, withIssues: 1 })
})

test('counts and expanded timetable meetings use school year identity and semester key', () => {
  const rows = [
    row('current', { academicYear: 'Renamed year', meetings: [meeting(), meeting({ format: 'Lab' })] }),
    row('otherYear', { academicYearId: 'year2', academicYear: year.academicYear, meetings: [meeting()] }),
    row('otherSemester', { semesterKey: 'sem2', meetings: [meeting()] }),
  ]
  assert.deepEqual(dashboardScheduleRows(rows, year, '1st Semester').map(row => row.id), ['current'])
  const current = dashboardScheduleMeetings(rows.map(document)).filter(item => scheduleMatchesTerm(item, year, '1st Semester'))
  assert.equal(current.length, 2)
  assert.equal(current[1].format, 'Lab')
})

test('faculty sees only their own Lec/Lab meetings, including the second faculty on a row', () => {
  const records = dashboardScheduleMeetings([document(row('shared', {
    instructorId: 'faculty1', instructorId2: 'faculty2', userId: 'faculty1', instructorIds: ['faculty1', 'faculty2'],
    meetings: [meeting(), meeting({ format: 'Lab', instructorId: 'faculty2', days: ['Tue'], startTime: '13:00', endTime: '16:00' })],
  }))])
  assert.deepEqual(dashboardInstructorMeetings(records, ['faculty1']).map(item => item.format), ['Lec'])
  const second = dashboardInstructorMeetings(records, ['faculty2'])
  assert.deepEqual(second.map(item => item.format), ['Lab'])
  assert.deepEqual(second[0].days, ['Tue'])
  assert.equal(second[0].startTime, '13:00')
  assert.equal(dashboardInstructorMeetings(records, ['unassigned']).length, 0)
})

test('incomplete saved rows stay in statistics without occupying a timetable slot', () => {
  const invalid = [{ startTime: '' }, { endTime: '' }, { endTime: '07:30' }, { startTime: '25:00' },
    { startTime: '07:65' }, { days: [] }, { days: ['TBA'] }, { days: [null] }]
  const rows = invalid.map((changes, index) => row(`invalid${index}`, { meetings: [meeting(changes)] }))
  assert.equal(dashboardScheduleRows(rows, year, '1st Semester').length, invalid.length)
  assert.deepEqual(dashboardScheduleMeetings(rows.map(document)), [])
  assert.equal(dashboardScheduleMeetings([document(row('noMeetings', { meetings: [] }))]).length, 0)
})

test('weekly grouping normalizes recurring days, removes duplicate day aliases and sorts actual times', () => {
  const records = dashboardScheduleMeetings([document(row('row', { meetings: [
    meeting({ startTime: '13:30', endTime: '16:30', days: ['mon', 'Monday', ' wednesday '] }),
    meeting({ startTime: '07:30', endTime: '08:00', days: ['MON'] }),
  ] }))])
  const days = dashboardScheduleDays(records)
  assert.deepEqual(days.get('Mon')!.map(item => item.startTime), ['07:30', '13:30'])
  assert.equal(days.get('Wed')!.length, 1)
  assert.equal(days.get('Sun')!.length, 0)
})

test('parallel rows remain separate and saved course, section and unresolved room are retained', () => {
  const rows = ['1', '2'].map(section => row(`parallel${section}`, {
    groupId: 'parallelGroup', course: '2BSIT/2ACT', classSection: section,
    meetings: [meeting({ roomId: '', room: 'Unregistered Lab' })],
  }))
  const records = dashboardScheduleMeetings(rows.map(document))
  assert.equal(dashboardScheduleRows(rows, year, '1st Semester').length, 2)
  assert.equal(records.length, 2)
  assert.equal(records[0].groupId, records[1].groupId)
  assert.equal(roomScheduleSection(records[0]), '2BSIT/2ACT - 1')
  assert.equal(roomScheduleRoom(records[0], new Map()), 'Unregistered Lab')
})

test('legacy Draft/Plot schedules support labels, split meetings and instructor aliases', () => {
  const rows = [
    { ...meeting({ startTime: '7:30 am', endTime: '9:00 am' }), id: 'legacy', academicYear: '2026–2027', semester: '1st Semester', status: 'Plot', userId: 'legacyUser' },
    { ...meeting(), id: 'child', parentId: 'legacy', academicYear: '2026–2027', semester: '1st Semester', status: 'Plot' },
  ]
  assert.equal(dashboardScheduleRows(rows, year, '1st Semester').length, 1)
  const records = dashboardScheduleMeetings(rows.map(document))
  assert.equal(records.length, 2)
  assert.equal(records[0].startTime, '07:30')
  assert.equal(dashboardInstructorMeetings(records, ['legacyUser']).length, 1)
})
