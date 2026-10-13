import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomScheduleInstructor, roomScheduleMeetings, roomScheduleRoom, roomScheduleSection, scheduleMatchesTerm } from '../src/utils/roomSchedule.ts'
import { scheduleMeetingRecords, type ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const meeting = (changes: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord => ({ id: 'row', roomId: 'room1', startTime: '07:30', endTime: '09:00', days: ['Wed'], ...changes })
const document = (id: string, values: Record<string, unknown>) => ({ id, data: () => values })

test('room view includes only the selected room, including its second or later workbook meetings', () => {
  const documents = [document('row', { source: 'workbook', schemaVersion: 2, subjectCode: 'ITE 298', course: '2BSIT', classSection: '1', meetings: [
    meeting({ roomId: 'room1', instructorId: 'cruz', startTime: '07:30', endTime: '09:00', days: ['Wed'] }),
    meeting({ roomId: 'room2', instructorId: 'jan', startTime: '13:30', endTime: '15:00', days: ['Sat'] }),
  ] })]
  const first = roomScheduleMeetings(documents, 'room1')
  const second = roomScheduleMeetings(documents, 'room2')
  assert.equal(first.length, 1)
  assert.equal(second.length, 1)
  assert.equal(second[0].instructorId, 'jan')
  assert.deepEqual(second[0].days, ['Sat'])
  assert.equal(second[0].startTime, '13:30')
  assert.notEqual(first[0].id, second[0].id)
  assert.equal(roomScheduleMeetings(documents, 'room3').length, 0)
})

test('one room retains both Lec/Lab sessions and recurring days without dropping shared faculty or room entries', () => {
  const documents = [document('row', { source: 'workbook', schemaVersion: 2, meetings: [
    meeting({ format: 'Lec', faculty: 'Cruz, Engelbert', days: ['Thu', 'Fri'] }),
    meeting({ format: 'Lab', faculty: 'Narvasa, Jan Julienne', startTime: '13:30', endTime: '15:00', days: ['Sat'] }),
  ] })]
  const rooms = roomScheduleMeetings(documents, 'room1')
  assert.equal(rooms.length, 2)
  assert.deepEqual(rooms.map(row => row.format), ['Lec', 'Lab'])
  assert.deepEqual(rooms[0].days, ['Thu', 'Fri'])
})

test('parallel sections are restricted to the selected room and retain their shared group', () => {
  const documents = ['room1', 'room2', 'room3', 'room4'].map((roomId, index) => document(`section${index}`, {
    source: 'workbook', schemaVersion: 2, type: 'parallel', groupId: 'parallel1', classSection: String(index + 1), meetings: [meeting({ roomId })],
  }))
  const rows = roomScheduleMeetings(documents, 'room3')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].classSection, '3')
  assert.equal(rows[0].groupId, 'parallel1')
})

test('legacy schedules still display and incomplete or invalid meetings do not occupy timetable slots', () => {
  const documents = [document('valid', meeting()), ...[
    { startTime: '' }, { endTime: '' }, { startTime: '25:00' }, { startTime: '07:65' },
    { endTime: '07:30' }, { days: [] }, { days: 'Wed' }, { days: [null] }, { roomId: '' },
  ].map((changes, index) => document(`invalid${index}`, { ...meeting(), ...changes, id: `invalid${index}` }))]
  assert.deepEqual(roomScheduleMeetings(documents, 'room1').map(row => row.id), ['row'])
})

test('school year filters prefer document identity; legacy labels tolerate spacing and dash differences', () => {
  const year = { id: 'year1', academicYear: '2026 - 2027' }
  assert.equal(scheduleMatchesTerm(meeting({ academicYearId: 'year1', academicYear: 'Renamed year', semesterKey: 'sem1' }), year, '1st Semester'), true)
  assert.equal(scheduleMatchesTerm(meeting({ academicYearId: 'year2', academicYear: year.academicYear }), year, '1st Semester'), false)
  assert.equal(scheduleMatchesTerm(meeting({ academicYear: '2026–2027', semester: '1st Semester' }), year, '1st Semester'), true)
  assert.equal(scheduleMatchesTerm(meeting({ academicYear: '2025 - 2026', semester: '1st Semester' }), year, '1st Semester'), false)
  assert.equal(scheduleMatchesTerm(meeting({ academicYearId: 'year1', semesterKey: 'sem2' }), year, '1st Semester'), false)
  assert.equal(scheduleMatchesTerm(meeting({ academicYearId: 'year1', semesterKey: 'sem2' }), year, '2nd Semester'), true)
})

test('instructor cards use saved room text for unresolved or deleted rooms and keep split meetings separate', () => {
  const names = new Map([['room1', 'Lecture 201']])
  const documents = [document('row', { source: 'workbook', schemaVersion: 2, meetings: [
    meeting({ roomId: '', room: ' Unlisted Lab ' }),
    meeting({ roomId: 'deleted', room: 'PTC 999' }),
    meeting({ roomId: 'room1', room: 'PTC 201' }),
  ] })]
  const rows = scheduleMeetingRecords(documents)
  assert.deepEqual(rows.map(row => roomScheduleRoom(row, names)), ['Unlisted Lab', 'PTC 999', 'Lecture 201'])
  assert.equal(roomScheduleRoom({ room: 'TBA' }, names), 'TBA')
  assert.equal(roomScheduleRoom({ roomId: 'missing', room: '   ' }, names), 'TBA')
  assert.equal(roomScheduleRoom({}, names), 'TBA')
  assert.equal(roomScheduleRoom({ room: { lec: ['PTC 201'] } }, names), 'TBA')
})

test('room cards retain saved faculty names when there is no matching membership and display course with section', () => {
  const names = new Map([['cruz', 'Engelbert Cruz']])
  const saved = meeting({ instructorId: '', faculty: 'Lobendino, Joy Chrisky', course: '2BSIT/2ACT', classSection: '1' })
  assert.equal(roomScheduleInstructor(saved, names), 'Lobendino, Joy Chrisky')
  assert.equal(roomScheduleInstructor({ ...saved, instructorId: 'cruz' }, names), 'Engelbert Cruz')
  assert.equal(roomScheduleSection(saved), '2BSIT/2ACT - 1')
  assert.equal(roomScheduleSection({ classSection: '3BSIT · 1' }), '3BSIT - 1')
  assert.equal(roomScheduleSection(meeting({ classSection: 'BSIT 3-1' })), 'BSIT 3-1')
  assert.equal(roomScheduleInstructor(meeting(), names), 'TBA')
})
