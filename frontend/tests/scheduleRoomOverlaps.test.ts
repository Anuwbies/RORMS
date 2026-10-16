import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleRoomOverlapMessages } from '../src/utils/scheduleRoomOverlaps.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const meeting = (id: string, overrides: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord => ({
  id, subjectCode: id, roomId: 'room1', days: ['Thu'], startTime: '07:30', endTime: '10:30', status: 'Draft', ...overrides,
})
const conflicts = (meetings: ScheduleMeetingRecord[]) => scheduleRoomOverlapMessages(meetings, item => item.roomId === 'room1' ? 'ITS 201' : 'PTC 403')

test('both schedules receive room, subject, section, department, day and time details before Plot', () => {
  const result = conflicts([meeting('ITE 292'), meeting('ITE 298', { department: 'CITE', classSection: '2BSIT-2', startTime: '09:00' })])
  assert.equal(result.size, 2)
  assert.match(result.get('ITE 292')![0], /ITE 292 overlaps ITE 298 \(2BSIT-2\) · CITE in ITS 201 on Thu/)
  assert.match(result.get('ITE 292')![0], /09:00–10:30/)
  assert.match(result.get('ITE 298')![0], /overlaps ITE 292/)
})

test('adjacent times, different days, different rooms and TBA are clear', () => {
  for (const change of [{ startTime: '10:30', endTime: '12:00' }, { days: ['Wed'] }, { roomId: 'room2' }, { roomId: '' }]) {
    assert.equal(conflicts([meeting('first'), meeting('second', change)]).size, 0)
  }
})

test('changing or clearing a staged room clears the overlap; assigning it introduces the overlap', () => {
  const saved = [meeting('first'), meeting('second')]
  assert.equal(conflicts(saved).size, 2)
  assert.equal(conflicts(saved.map(item => item.id === 'first' ? { ...item, roomId: 'room2' } : item)).size, 0)
  assert.equal(conflicts(saved.map(item => item.id === 'first' ? { ...item, roomId: '' } : item)).size, 0)
  assert.equal(conflicts(saved).size, 2)
})

test('returned schedules and repeated copies do not produce conflicts', () => {
  assert.equal(conflicts([meeting('first'), meeting('returned', { status: 'Returned' }), meeting('return', { status: 'Return' })]).size, 0)
  assert.equal(conflicts([meeting('same'), meeting('same')]).size, 0)
})

test('each conflicted meeting in a multi-meeting schedule is identified independently', () => {
  const result = conflicts([meeting('class'), meeting('class:meeting:1', { days: ['Wed'] }), meeting('other')])
  assert.ok(result.has('class'))
  assert.ok(!result.has('class:meeting:1'))
  assert.ok(result.has('other'))
})
