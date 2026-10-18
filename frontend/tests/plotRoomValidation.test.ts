import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plotRoomValidationMessages } from '../src/utils/plotRoomValidation.ts'
import { plotRoomRecommendations } from '../src/utils/plotRoomRecommendations.ts'
import { schedulePlotSelectionKey, type PlotRoom } from '../src/utils/schedulePlotting.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const room = (number: number, overrides: Partial<PlotRoom> = {}): PlotRoom => ({
  id: `room-${number}`, code: `PTC ${number}`, name: `PTC ${number}`, buildingId: 'PTC', floor: 3,
  status: 'Available', availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40, ...overrides,
})
const meeting = (id: string, overrides: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord => ({
  id, sourceScheduleId: id, sourceSheet: 'Schedule', sourceRow: Number(id.replace(/\D/g, '')) || 1,
  department: 'CITE', subjectCode: 'ITE 101', classSection: id, faculty: 'Teacher', instructorId: 'teacher',
  format: 'Lec', startTime: '07:30', endTime: '09:00', days: ['Mon'], roomId: 'room-300', room: 'PTC 300',
  status: 'Draft', maxStudents: 30, ...overrides,
})
const issues = (meetings: ScheduleMeetingRecord[], rooms = [room(300), room(301), room(302)]) =>
  plotRoomValidationMessages(meetings, rooms, 'CITE')

test('Plot uses workbook messages for overlaps within the department and with another department', () => {
  const records = [meeting('one'), meeting('two', { sourceSheet: 'UY', sourceRow: 84,
    yearLevelLabel: '4BSIT: 2023-24 CURRICULUM' }), meeting('external', { department: 'CBA' })]
  const messages = issues(records)
  assert.ok(messages.get('one')?.includes('Room PTC 300 is also assigned on 4BSIT on Mon (07:30–09:00).'))
  assert.ok(messages.get('two')?.some(message => message.startsWith('Room PTC 300 is also assigned on ')))
  assert.ok(messages.get('one')?.includes('CBA is also using Room PTC 300 on MON (07:30–09:00).'))
  assert.equal(messages.has('external'), false)
})

test('Plot falls back to a numeric year level when an older schedule has no saved heading', () => {
  const messages = issues([meeting('one'), meeting('two', { sourceSheet: 'UY', sourceRow: 84, yearLevel: 4 })])
  assert.ok(messages.get('one')?.includes('Room PTC 300 is also assigned on Year 4 on Mon (07:30–09:00).'))
})

test('Plot reports incomplete and disconnected parallel rooms with workbook messages', () => {
  const parallel = [meeting('one', { groupId: 'group' }), meeting('two', { groupId: 'group', roomId: '', room: '' })]
  const incomplete = issues(parallel)
  assert.ok(incomplete.get('one')?.includes('All 2 parallel sections must have assigned rooms. 1 of 2 rooms assigned.'))
  assert.ok(incomplete.get('two')?.includes('All 2 parallel sections must have assigned rooms. 1 of 2 rooms assigned.'))
  parallel[1] = { ...parallel[1], roomId: 'room-302', room: 'PTC 302' }
  assert.ok(issues(parallel).get('one')?.includes('Parallel classes must use separate, consecutive rooms in the same building and floor.'))
})

test('Plot reports unknown, unavailable, maintenance and ambiguous rooms', () => {
  const rooms = [room(300, { status: 'Unavailable' }), room(301, { status: 'Maintenance' }),
    room(302, { code: 'SHARED' }), room(303, { code: 'SHARED' })]
  const records = [meeting('unavailable'), meeting('maintenance', { roomId: 'room-301', room: 'PTC 301' }),
    meeting('unknown', { roomId: '', room: 'Unknown Room' }), meeting('ambiguous', { roomId: '', room: 'SHARED' })]
  const messages = issues(records, rooms)
  assert.ok(messages.get('unavailable')?.includes('Room PTC 300 is unavailable. Choose an available room.'))
  assert.ok(messages.get('maintenance')?.includes('Room PTC 301 is under maintenance. Choose an available room.'))
  assert.ok(messages.get('unknown')?.includes('Room Unknown Room does not exist in the rooms collection.'))
  assert.ok(messages.get('ambiguous')?.includes('Room SHARED could not be matched uniquely to a room.'))
})

test('Plot warns above room capacity and recommends a room that fits', () => {
  const rooms = [room(300, { capacity: 20 }), room(301, { capacity: 40 })]
  const target = meeting('target', { maxStudents: 30 })
  const messages = issues([target], rooms)
  assert.ok(messages.get('target')?.includes('Room PTC 300 has a capacity of 20, below the Max No. of Stud. (30).'))
  const recommendations = plotRoomRecommendations([target], rooms, [target], messages)
  assert.deepEqual(recommendations.get(schedulePlotSelectionKey(target)), ['room-301'])
  assert.equal(issues([{ ...target, maxStudents: 20 }], rooms).has('target'), false)
})
