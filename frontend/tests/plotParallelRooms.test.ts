import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plotParallelRoomMessages } from '../src/utils/plotParallelRooms.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'
import type { PlotRoom } from '../src/utils/schedulePlotting.ts'

const rooms: PlotRoom[] = [203, 204, 205, 206, 207, 403, 404].map(number => ({
  id: `be${number}`, code: `BE ${number}`, name: `BE ${number}`, buildingId: 'be', status: 'Available',
  availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40,
}))
const group = (numbers: number[]): ScheduleMeetingRecord[] => numbers.map((number, index) => ({
  id: `class${index}`, sourceScheduleId: `class${index}`, sourceWorkbook: 'workbook', sourceSheet: 'Schedule', groupId: 'parallel1',
  department: 'CITE', subjectCode: 'ITE 083', classSection: String(index + 5), faculty: 'Teacher', instructorId: 'teacher',
  format: 'Lec', startTime: '07:30', endTime: '10:30', days: ['Mon'], roomId: `be${number}`, status: 'Plot',
}))

test('BE 203/204/403/404 produces a shared connection error on every parallel schedule', () => {
  const messages = plotParallelRoomMessages(group([203, 204, 403, 404]), rooms)
  assert.equal(messages.size, 4)
  for (const issues of messages.values()) {
    assert.equal(issues[0], 'Parallel classes must use separate, consecutive rooms in the same building and floor.')
  }
})

test('connected room chains work in any section order and clear after staged corrections', () => {
  assert.equal(plotParallelRoomMessages(group([205, 203, 206, 204]), rooms).size, 0)
  const meetings = group([203, 204, 403, 404])
  meetings[2].roomId = 'be205'; meetings[3].roomId = 'be206'
  assert.equal(plotParallelRoomMessages(meetings, rooms).size, 0)
})

test('room-number gaps, repeats, different buildings and different floor metadata are rejected', () => {
  assert.equal(plotParallelRoomMessages(group([203, 204, 205, 207]), rooms).size, 4)
  assert.equal(plotParallelRoomMessages(group([203, 204, 205, 205]), rooms).size, 4)
  for (const change of [{ floor: 4 }, { buildingId: 'other' }]) {
    const changedRooms = rooms.map(room => room.id === 'be206' ? { ...room, ...change } : room)
    assert.equal(plotParallelRoomMessages(group([203, 204, 205, 206]), changedRooms).size, 4)
  }
})

test('other groups, returned records and separate Lec/Lab meetings do not join a parallel chain', () => {
  const meetings = group([203, 204])
  const other = { ...group([403])[0], id: 'other', sourceScheduleId: 'other', classSection: '8' }
  for (const change of [{ groupId: 'other' }, { department: 'CBA' }, { sourceWorkbook: 'other' }, { format: 'Lab' },
    { startTime: '10:30', endTime: '12:00' }, { days: ['Wed'] }, { status: 'Returned' }]) {
    assert.equal(plotParallelRoomMessages([...meetings, { ...other, ...change }], rooms).size, 0)
  }
})

test('a missing room marks all four parallel sections red until every room is assigned', () => {
  const meetings = group([203, 204, 205, 206])
  meetings[3] = { ...meetings[3], roomId: '', room: 'TBA' }
  const messages = plotParallelRoomMessages(meetings, rooms)
  assert.equal(messages.size, 4)
  for (const issues of messages.values()) {
    assert.equal(issues[0], 'All 4 parallel sections must have assigned rooms. 3 of 4 rooms assigned.')
  }
  meetings[3].roomId = 'be206'
  assert.equal(plotParallelRoomMessages(meetings, rooms).size, 0)
})

test('one assigned room and three TBA rooms produces errors for editable and provided groups', () => {
  for (const provided of [false, true]) {
    const meetings = group([203, 204, 205, 206]).map((meeting, index) => ({ ...meeting,
      ...(index ? { roomId: '', room: 'TBA' } : {}),
      ...(provided ? { providedRoomKeys: ['source-room-key'] } : { providedRoomKeys: [] }),
    }))
    const messages = plotParallelRoomMessages(meetings, rooms)
    assert.equal(messages.size, 4)
    for (const issues of messages.values()) assert.match(issues[0], /1 of 4 rooms assigned/)
  }
})

test('blank, unknown and deleted rooms cannot satisfy the parallel room requirement', () => {
  for (const change of [{ roomId: '', room: '' }, { roomId: '', room: 'Unknown Room' }, { roomId: 'deleted-room', room: 'BE 206' }]) {
    const meetings = group([203, 204, 205, 206])
    meetings[3] = { ...meetings[3], ...change }
    assert.equal(plotParallelRoomMessages(meetings, rooms).size, 4)
  }
})

test('a completely unassigned group stays clear until its first room is selected and clears when undone', () => {
  for (const room of ['', 'TBA']) {
    const meetings = group([203, 204, 205, 206]).map(meeting => ({ ...meeting, roomId: '', room }))
    assert.equal(plotParallelRoomMessages(meetings, rooms).size, 0)
    meetings[0].roomId = 'be203'
    const messages = plotParallelRoomMessages(meetings, rooms)
    assert.equal(messages.size, 4)
    assert.match(messages.get('class0')![0], /1 of 4 rooms assigned/)
    meetings[0].roomId = ''
    assert.equal(plotParallelRoomMessages(meetings, rooms).size, 0)
  }
})
