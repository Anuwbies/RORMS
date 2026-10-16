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
    assert.match(issues[0], /separate, consecutive rooms in the same building and floor/)
    assert.match(issues[0], /BE 203 \/ BE 204 \/ BE 403 \/ BE 404/)
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

test('unassigned and TBA rooms retain workbook treatment while known rooms are checked', () => {
  const meetings = group([203, 204, 205, 206])
  meetings[3] = { ...meetings[3], roomId: '', room: 'TBA' }
  assert.equal(plotParallelRoomMessages(meetings, rooms).size, 0)
})
