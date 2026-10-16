import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const modules = new Map()
const root = fileURLToPath(new URL('../src/', import.meta.url))
function load(file) {
  if (modules.has(file)) return modules.get(file)
  const exports = {}
  modules.set(file, exports)
  const context = { exports, require: name => name.startsWith('.')
    ? load(resolve(dirname(file), /\.tsx?$/.test(name) ? name : existsSync(resolve(dirname(file), `${name}.ts`)) ? `${name}.ts` : `${name}.tsx`))
    : require(name) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS,
  } }).outputText, context)
  return exports
}

const { plotParallelRoomGroupRecommendations } = load(resolve(root, 'utils/plotRoomRecommendations.ts'))
const { schedulePlotSelectionKey } = load(resolve(root, 'utils/schedulePlotting.ts'))
const room = number => ({ id: `ptc-${number}`, code: `PTC ${number}`, name: `PTC ${number}`, buildingId: 'PTC', floor: 3,
  status: 'Available', availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40 })
const meeting = (index, changes = {}) => ({ id: `class-${index}`, sourceScheduleId: `class-${index}`, source: 'workbook', schemaVersion: 2,
  sourceWorkbook: 'dept/workbook', sourceSheet: 'Schedule', department: 'CITE', groupId: 'parallel-1',
  instructorId: 'instructor', faculty: 'Teacher', subjectCode: 'ITE 101', classSection: `Section ${index}`,
  format: 'Lec', days: ['Mon'], startTime: '07:30', endTime: '09:00', roomId: '', room: 'TBA', providedRoomKeys: [],
  status: 'Draft', maxStudents: 30, ...changes })
const rooms = Array.from({ length: 6 }, (_, index) => room(300 + index))
const parallel = Array.from({ length: 4 }, (_, index) => meeting(index))
const recommendations = (entries, availableRooms = rooms) => plotParallelRoomGroupRecommendations(entries, availableRooms, parallel)

test('a parallel room choice fills four consecutive rooms and appears for each editable section', () => {
  const choices = recommendations(parallel)
  for (const item of parallel) assert.ok(choices.get(schedulePlotSelectionKey(item))?.length)
  const first = choices.get(schedulePlotSelectionKey(parallel[0]))[0]
  assert.equal(first.label, 'PTC 300 / PTC 301 / PTC 302 / PTC 303')
  assert.deepEqual(Array.from(first.assignments, entry => entry.roomId), ['ptc-300', 'ptc-301', 'ptc-302', 'ptc-303'])
  assert.deepEqual(Array.from(first.assignments, entry => entry.meeting.id), parallel.map(item => item.id))
})

test('Plot labels a four-room choice with room names while keeping the correct room IDs', () => {
  const namedRooms = rooms.map(item => ({ ...item, name: `Room ${item.code}` }))
  const choices = recommendations(parallel, namedRooms).get(schedulePlotSelectionKey(parallel[0])) ?? []
  assert.equal(choices[0]?.label, 'Room PTC 300 / Room PTC 301 / Room PTC 302 / Room PTC 303')
  assert.deepEqual(Array.from(choices[0].assignments, entry => entry.roomId), ['ptc-300', 'ptc-301', 'ptc-302', 'ptc-303'])
})

test('cross-department occupancy and room constraints exclude unsafe four-room choices', () => {
  const occupied = meeting('outside', { groupId: undefined, department: 'CBA', instructorId: 'other', faculty: 'Other', roomId: 'ptc-300' })
  const choices = recommendations([...parallel, occupied])
  const options = choices.get(schedulePlotSelectionKey(parallel[0])) ?? []
  assert.ok(options.length)
  assert.ok(options.every(option => option.assignments.every(entry => entry.roomId !== 'ptc-300')))
  assert.ok(options.every(option => option.assignments.length === 4))
  assert.equal(recommendations(parallel, rooms.map(item => item.id === 'ptc-302' ? { ...item, capacity: 10 } : item))
    .get(schedulePlotSelectionKey(parallel[0]))?.some(option => option.assignments.some(entry => entry.roomId === 'ptc-302')), false)
})

test('provided rooms are never bulk-editable, while smaller actual parallel groups are supported', () => {
  const withProvidedRoom = parallel.map((item, index) => index === 1
    ? { ...item, providedRoomKeys: [JSON.stringify(['instructor', '07:30', '09:00', ['Mon'], 'Lec', ''])] } : item)
  assert.equal(plotParallelRoomGroupRecommendations(withProvidedRoom, rooms, withProvidedRoom).size, 0)
  for (const count of [1, 2, 3]) {
    const members = parallel.slice(0, count)
    const choices = plotParallelRoomGroupRecommendations(members, rooms, members)
    assert.equal(choices.size, count)
    for (const member of members) {
      const options = choices.get(schedulePlotSelectionKey(member)) ?? []
      assert.ok(options.length > 0)
      assert.ok(options.every(option => option.assignments.length === count))
    }
  }
})

test('staged room values do not make a previously editable group look department-provided', () => {
  const original = parallel.map(item => ({ ...item, room: '', providedRoomKeys: undefined }))
  const staged = original.map((item, index) => ({ ...item, roomId: `ptc-${300 + index}` }))
  const choices = plotParallelRoomGroupRecommendations(staged, rooms, original)
  assert.ok(choices.get(schedulePlotSelectionKey(original[0]))?.length)
})

test('four-room groups prefer the most-used building, then fall back when it has no valid chain', () => {
  const rankedRooms = ['Z', 'Y', 'A'].flatMap(building => Array.from({ length: 4 }, (_, index) => ({
    ...room(300 + index), id: `${building}-${300 + index}`, code: `${building} ${300 + index}`,
    name: `${building} ${300 + index}`, buildingId: building,
  })))
  const usage = [['Z', 4], ['Y', 3], ['A', 2]].flatMap(([building, count]) => Array.from({ length: count }, (_, index) =>
    meeting(`${building}-${index}`, { groupId: undefined, instructorId: `other-${building}-${index}`,
      faculty: `Other ${index}`, roomId: `${building}-300`, room: `${building} 300`,
      startTime: ['09:00', '10:30', '12:00', '13:30'][index], endTime: ['10:30', '12:00', '13:30', '15:00'][index] })))
  const choices = plotParallelRoomGroupRecommendations([...parallel, ...usage], rankedRooms, parallel)
    .get(schedulePlotSelectionKey(parallel[0])) ?? []
  assert.deepEqual(Array.from(choices, option => option.assignments[0].roomId[0]), ['Z', 'Z', 'Y', 'Y', 'A'])

  const withoutZChain = rankedRooms.map(item => item.id === 'Z-303' ? { ...item, status: 'Maintenance' } : item)
  const fallback = plotParallelRoomGroupRecommendations([...parallel, ...usage], withoutZChain, parallel)
    .get(schedulePlotSelectionKey(parallel[0])) ?? []
  assert.equal(fallback[0]?.assignments[0].roomId[0], 'Y')
})
