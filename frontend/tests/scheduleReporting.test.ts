import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ScheduleReportRecord } from '../src/utils/reportingData.ts'
import { scheduleMeetingRecords } from '../src/utils/scheduleMeetings.ts'
import { roomScheduleSection } from '../src/utils/roomSchedule.ts'
import {
  reportingScheduleConflicts,
  reportingScheduleDayText,
  reportingScheduleDuration,
  reportingScheduleMeetings,
  reportingScheduleResource,
  reportingScheduleTimeText,
  reportingScheduleWeeklyMinutes,
  scheduleReportRowId,
} from '../src/utils/scheduleReporting.ts'

const meeting = (changes: Partial<ScheduleReportRecord> = {}): ScheduleReportRecord => ({
  id: 'subject', source: 'workbook', schemaVersion: 2,
  academicYearId: 'year1', academicYear: '2026 - 2027', semesterKey: 'sem1',
  startTime: '07:30', endTime: '09:00', days: ['Mon'],
  roomId: 'room1', instructorId: 'faculty1', format: 'Lec', ...changes,
})

function workbookMeetings() {
  return scheduleMeetingRecords([{
    id: 'stored-subject',
    data: () => ({
      id: 'subject', source: 'workbook', schemaVersion: 2,
      course: '2BSIT/2ACT', classSection: '1', subjectCode: 'ITE 310', status: 'Plot',
      academicYearId: 'year1', semesterKey: 'sem1',
      meetings: [
        meeting({ days: ['Mon', 'Wed', 'Fri'] }),
        meeting({ format: 'Lab', startTime: '13:00', endTime: '15:00', days: ['Tue'], roomId: 'room2', instructorId: 'faculty2' }),
      ],
    }),
  }]) as ScheduleReportRecord[]
}

test('reports and analytics retain every workbook meeting and count the subject once', () => {
  const records = reportingScheduleMeetings(workbookMeetings())
  assert.equal(records.length, 2)
  assert.equal(records.reduce((sum, record) => sum + reportingScheduleWeeklyMinutes(record), 0), 390)
  assert.deepEqual(records.map(record => [record.format, record.roomId, record.instructorId]), [
    ['Lec', 'room1', 'faculty1'], ['Lab', 'room2', 'faculty2'],
  ])
  assert.equal(new Set(records.map(scheduleReportRowId)).size, 1)
  assert.equal(scheduleReportRowId(records[1]), 'stored-subject')
  assert.equal(roomScheduleSection(records[1]), '2BSIT/2ACT - 1')
  assert.equal(records[1].status, 'Plot')
})

test('all recurring days appear in reports and weekly hours without duplicate aliases', () => {
  const record = meeting({ days: ['Monday', 'MON', ' wednesday ', 'Fri', 'TBA'] })
  assert.equal(reportingScheduleDayText(record), 'Mon / Wed / Fri')
  assert.equal(reportingScheduleWeeklyMinutes(record), 270)
  assert.equal(reportingScheduleDayText(meeting({ days: [], day: 'TBA' })), 'TBA')
  assert.equal(reportingScheduleWeeklyMinutes(meeting({ days: [] })), 0)
})

test('reports preserve unresolved saved resource names without assigning IDs', () => {
  const record = meeting({ roomId: '', instructorId: '', faculty: 'Cruz, Josephine', room: 'PTC 304' })
  assert.equal(reportingScheduleResource(undefined, record.faculty), 'Cruz, Josephine')
  assert.equal(reportingScheduleResource(undefined, record.room), 'PTC 304')
  assert.equal(reportingScheduleResource('Registered room', record.room), 'Registered room')
  assert.equal(reportingScheduleResource('', ' TBA '), 'TBA')
  assert.equal(reportingScheduleResource(undefined, { lec: ['Faculty'] }), '----')
  assert.equal(record.roomId, '')
})

test('invalid raw workbook time stays visible but does not contribute teaching hours', () => {
  for (const changes of [
    { startTime: '', endTime: '', time: '3' },
    { startTime: '25:00', endTime: '26:00', time: '25:00-26:00' },
    { startTime: '07:65', endTime: '09:00', time: '7:65-9:00' },
    { startTime: '09:00', endTime: '07:30', time: '9:00-7:30' },
  ]) {
    const record = meeting(changes)
    assert.equal(reportingScheduleTimeText(record), changes.time)
    assert.equal(reportingScheduleDuration(record), null)
    assert.equal(reportingScheduleWeeklyMinutes(record), 0)
  }
  assert.equal(reportingScheduleTimeText(meeting()), '07:30 - 09:00')
  assert.equal(reportingScheduleTimeText(meeting({ startTime: '', endTime: '' })), '----')
})

test('secondary meetings participate in conflicts, including full weekday aliases', () => {
  const records = workbookMeetings()
  const overlapping = meeting({ id: 'other', startTime: '14:00', endTime: '16:00', days: ['Tuesday'], roomId: 'room2', instructorId: 'faculty2' })
  assert.deepEqual(reportingScheduleConflicts([...records, overlapping]), { rooms: 1, instructors: 1 })
  assert.deepEqual(reportingScheduleConflicts([records[0], overlapping]), { rooms: 0, instructors: 0 })
})

test('conflicts stay within the same academic year and semester', () => {
  const first = meeting()
  assert.deepEqual(reportingScheduleConflicts([first, meeting({ id: 'other', semesterKey: 'sem2' })]), { rooms: 0, instructors: 0 })
  assert.deepEqual(reportingScheduleConflicts([first, meeting({ id: 'other', academicYearId: 'year2' })]), { rooms: 0, instructors: 0 })
  assert.deepEqual(reportingScheduleConflicts([first, meeting({ id: 'other', semesterKey: '', semester: '1st Semester' })]), { rooms: 1, instructors: 1 })
  assert.deepEqual(reportingScheduleConflicts([
    meeting({ academicYearId: '', academicYear: '2026 – 2027' }),
    meeting({ id: 'other', academicYearId: '', academicYear: '2026-2027' }),
  ]), { rooms: 1, instructors: 1 })
})

test('missing IDs, invalid times, missing days, and adjacent time ranges create no conflicts', () => {
  for (const changes of [
    { roomId: '', instructorId: '' }, { startTime: '', endTime: '' },
    { startTime: '25:00', endTime: '26:00' }, { days: [] },
    { startTime: '09:00', endTime: '10:00' }, { startTime: '06:00', endTime: '07:30' },
  ]) assert.deepEqual(reportingScheduleConflicts([meeting(), meeting({ id: 'other', ...changes })]), { rooms: 0, instructors: 0 })
})

test('legacy second sessions retain their own days, resource IDs, and duration', () => {
  const legacy = meeting({
    source: undefined, schemaVersion: undefined, days: ['Mon', 'Tue'], format2: 'Lab',
    startTime2: '13:00', endTime2: '15:00', instructorId2: 'faculty2', roomId2: 'room2',
  })
  const records = reportingScheduleMeetings([legacy])
  assert.equal(records.length, 2)
  assert.equal(records.reduce((sum, record) => sum + reportingScheduleWeeklyMinutes(record), 0), 210)
  assert.equal(records[1].instructorId, 'faculty2')
  assert.equal(records[1].roomId, 'room2')
  assert.equal(records[1].format, 'Lab')
  assert.equal(reportingScheduleMeetings([meeting({ startTime2: '13:00' })]).length, 1)
})
