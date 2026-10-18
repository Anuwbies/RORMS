import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plotRoomRecommendations } from '../src/utils/plotRoomRecommendations.ts'
import { schedulePlotSelectionKey, type PlotRoom } from '../src/utils/schedulePlotting.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const room = (id: string, overrides: Partial<PlotRoom> = {}): PlotRoom => ({ id, code: id, name: id, buildingId: 'PTC', floor: 3,
  status: 'Available', availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40, ...overrides })
const meeting = (id: string, overrides: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord => ({ id, sourceScheduleId: id,
  department: 'CITE', subjectCode: 'ITE 101', classSection: id, faculty: 'Teacher', instructorId: 'teacher', format: 'Lec',
  startTime: '07:30', endTime: '09:00', days: ['Mon'], roomId: 'PTC 300', status: 'Plot', maxStudents: 30, ...overrides })
const recommend = (meetings: ScheduleMeetingRecord[], rooms: PlotRoom[]) => plotRoomRecommendations(meetings, rooms, [meetings[0]]).get(schedulePlotSelectionKey(meetings[0]))

test('cross-department room overlaps trigger safe recommendations; other departments do not change building ranking', () => {
  const rooms = [room('PTC 300'), room('PTC 301'), room('ITS 200', { buildingId: 'ITS' })]
  const target = meeting('target')
  const other = meeting('other', { department: 'CBA' })
  const external = Array.from({ length: 5 }, (_, i) => meeting(`external${i}`, { department: 'CBA', roomId: 'ITS 200', startTime: '12:00', endTime: '13:30' }))
  assert.deepEqual(recommend([target, other, ...external], rooms), ['PTC 301'])
})

test('TBA recommendations exclude unavailable rooms, wrong days/hours, insufficient capacity and occupied rooms', () => {
  const rooms = [room('PTC 300'), room('PTC 301'), room('maintenance', { status: 'Maintenance' }), room('wrong-day', { availableDays: ['Tuesday'] }),
    room('wrong-hours', { startTime: '09:00' }), room('small', { capacity: 20 })]
  const target = meeting('target', { roomId: '' })
  assert.deepEqual(recommend([target, meeting('busy')], rooms), ['PTC 301'])
})

test('a lone schedule with no current or previous room usage has no recommendations', () => {
  const rooms = [room('PTC 300'), room('PTC 301')]
  assert.deepEqual(recommend([meeting('target', { roomId: '', room: '' })], rooms), [])
})

test('an unassigned department uses only its previous term for building ranking', () => {
  const rooms = [room('PTC 300'), room('ITS 200', { buildingId: 'ITS' }), room('ITS 201', { buildingId: 'ITS' })]
  const target = meeting('target', { roomId: '', room: '' })
  const previous = [meeting('old', { roomId: 'ITS 200' }), meeting('other', { department: 'CBA', roomId: 'PTC 300' })]
  const choices = plotRoomRecommendations([target], rooms, [target], undefined, previous)
  assert.deepEqual(choices.get(schedulePlotSelectionKey(target)), ['ITS 200', 'ITS 201'])
})

test('clear meetings and malformed time/day entries do not offer recommendations', () => {
  const rooms = [room('PTC 300'), room('PTC 301')]
  assert.deepEqual(recommend([meeting('target')], rooms), [])
  for (const change of [{ startTime: 'bad' }, { endTime: '07:00' }, { days: [] }]) {
    assert.deepEqual(recommend([meeting('target', { roomId: '', ...change }), meeting('usage')], rooms), [])
  }
})

test('only the affected meeting is changed and staged room changes affect availability', () => {
  const rooms = [room('PTC 300'), room('PTC 301'), room('PTC 302')]
  const target = meeting('target', { roomId: '' })
  const next = meeting('target:meeting:1', { sourceScheduleId: 'target', roomId: 'PTC 301', startTime: '09:00', endTime: '10:30' })
  assert.deepEqual(recommend([target, next, meeting('other')], rooms), ['PTC 301', 'PTC 302'])
  assert.deepEqual(recommend([target, next, meeting('other', { roomId: 'PTC 301' })], rooms), ['PTC 300', 'PTC 302'])
})

test('parallel recommendations preserve a consecutive room chain and Plot room exclusivity', () => {
  const rooms = Array.from({ length: 5 }, (_, i) => room(`PTC ${300 + i}`))
  const parallel = Array.from({ length: 3 }, (_, i) => meeting(`class${i}`, { groupId: 'group', roomId: `PTC ${300 + i}` }))
  assert.deepEqual(recommend([...parallel, meeting('outside')], rooms), ['PTC 303'])
  assert.deepEqual(recommend([...parallel, meeting('outside'), meeting('busy303', { roomId: 'PTC 303' })], rooms), [])
})

test('third-building cap counts only rooms that pass Plot constraints', () => {
  const rooms = ['A', 'B', 'C', 'D'].flatMap(building => Array.from({ length: 8 }, (_, i) => room(`${building}${i}`, {
    buildingId: building, ...(building === 'C' && i < 2 ? { capacity: 10 } : {}),
  })))
  const entries = [meeting('target', { roomId: '' })]
  for (const [building, count] of [['A', 5], ['B', 4], ['C', 3], ['D', 1]] as const) {
    for (let i = 0; i < count; i++) entries.push(meeting(`${building}-usage${i}`, { roomId: `${building}0`, startTime: '12:00', endTime: '13:30' }))
  }
  const result = recommend(entries, rooms)!
  assert.equal(result.filter(id => id.startsWith('A')).length, 8)
  assert.equal(result.filter(id => id.startsWith('B')).length, 8)
  assert.deepEqual(result.filter(id => id.startsWith('C')), ['C2', 'C3', 'C4', 'C5', 'C6'])
  assert.ok(result.every(id => !id.startsWith('D')))
})
