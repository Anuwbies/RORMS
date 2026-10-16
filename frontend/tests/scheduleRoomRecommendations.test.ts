import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { parseDepartmentScheduleImportRows } from '../src/utils/departmentScheduleImportRows.ts'
import { departmentFacultyScheduleAssignments, facultyScheduleRowKey, type FacultySubjectAssignment } from '../src/utils/ScheduleValidation.ts'
import { recommendScheduleRooms } from '../src/utils/scheduleRoomRecommendations.ts'
import type { ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'

const directory: ScheduleDirectory = {
  departmentCode: 'CITE', faculty: [{ id: 'teacher', fullName: 'Cruz, Engelbert', department: 'CITE' }],
  rooms: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(letter => ({ id: letter, code: `${letter}101`, name: `${letter} 101`, buildingId: 'main' })),
}
const values = (room = 'A101', time = '7:30-9:00', day = 'FRI') => [
  'CITE', 'IT', 'ITE 101', 'Computing', 'BSIT', '2', '1', '3', '2', '3', '5', '40', '1', 'Cruz, Engelbert', '', time, '', day, '', room, '',
]
function setup() {
  const first = createEmptyDepartmentScheduleSheet(), second = createEmptyDepartmentScheduleSheet()
  second.name = 'Other year'
  first.rows[0].values = values()
  second.rows[0].values = values('A 101'); second.rows[0].values[12] = '2'
  const sheets = [first, second]
  const recommendations = (column = 19, entry = 0) => recommendScheduleRooms(
    departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(sheets, directory), directory), directory.rooms,
    facultyScheduleRowKey(first.name, first.rows[0].rowNumber), column, entry)
  return { first, second, sheets, recommendations }
}

test('room conflicts offer available rooms, including occupancy from other worksheets and room aliases', () => {
  const { second, recommendations } = setup()
  second.rows[1].values = values('B101')
  assert.deepEqual(recommendations(), ['C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
})

test('TBA room entries offer available rooms without requiring an overlap', () => {
  const h = setup()
  h.first.rows[0].values[19] = ' tba '
  assert.deepEqual(h.recommendations(), ['B 101', 'C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
  h.first.rows[0].values[14] = 'Cruz, Engelbert'
  h.first.rows[0].values[16] = '7:30-9:00'
  h.first.rows[0].values[18] = 'FRI'
  h.first.rows[0].values[20] = 'TBA'
  assert.deepEqual(h.recommendations(20), ['B 101', 'C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
})

test('shared and separate TBA room entries check every affected meeting', () => {
  const h = setup()
  h.first.rows[0].values[15] = '7:30-9:00/10:00-11:00'
  h.first.rows[0].values[19] = 'TBA'
  h.second.rows[1].values = values('B101', '10:00-11:00')
  assert.deepEqual(h.recommendations(), ['C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
  h.first.rows[0].values[19] = 'A101/TBA'
  assert.deepEqual(h.recommendations(19, 1), ['A 101', 'C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
})

test('TBA rooms still require valid days and times before recommending', () => {
  const h = setup()
  h.first.rows[0].values[19] = 'TBA'
  h.first.rows[0].values[17] = 'BAT'; assert.deepEqual(h.recommendations(), [])
  h.first.rows[0].values[17] = 'FRI'; h.first.rows[0].values[15] = ''; assert.deepEqual(h.recommendations(), [])
})

function buildingFixture(busy = false) {
  const rooms = ['PTC', 'ITS', 'MBA', 'BE'].flatMap(buildingId => [101, 102, 103].map(number => ({
    id: `${buildingId}${number}`, code: `${buildingId}${number}`, name: `${buildingId} ${number}`, buildingId,
  })))
  const assignment = (roomId: string, row: string, start = 450): FacultySubjectAssignment => ({
    location: row, rowKey: row, code: 'ITE 101', section: row, faculty: 'Cruz, Engelbert', instructorId: 'teacher',
    roomId, room: rooms.find(room => room.id === roomId)!.name, start, end: start + 90, days: ['Fri'], roomColumn: 19, roomEntryIndex: 0,
  })
  const assignments = [assignment('BE101', 'target'), assignment('BE101', 'conflict')]
  for (const [building, count] of [['PTC', 5], ['ITS', 4], ['MBA', 3]] as const) {
    for (let index = 0; index < count; index++) assignments.push(assignment(`${building}${101 + index % 3}`, `${building}-${index}`, busy ? 450 : 780))
  }
  return { rooms, assignments, assignment }
}

test('available rooms from the top three buildings are recommended in usage order', () => {
  const { rooms, assignments } = buildingFixture()
  assert.deepEqual(recommendScheduleRooms(assignments, rooms, 'target', 19, 0), [
    'PTC 101', 'PTC 102', 'PTC 103', 'ITS 101', 'ITS 102', 'ITS 103', 'MBA 101', 'MBA 102', 'MBA 103',
  ])
})

test('only the third building is capped at five distinct available rooms', () => {
  const { rooms, assignments } = buildingFixture()
  for (const buildingId of ['PTC', 'ITS', 'MBA']) for (let number = 104; number <= 110; number++) {
    rooms.push({ id: `${buildingId}${number}`, code: `${buildingId}${number}`, name: `${buildingId} ${number}`, buildingId })
  }
  // Occupied and duplicate entries must not consume the five recommendations.
  const occupied = assignments.find(item => item.rowKey === 'MBA-0')!
  occupied.start = 450; occupied.end = 540
  rooms.push({ ...rooms.find(room => room.id === 'MBA102')! })
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.equal(result.filter(name => name.startsWith('PTC')).length, 10)
  assert.equal(result.filter(name => name.startsWith('ITS')).length, 10)
  assert.deepEqual(result.filter(name => name.startsWith('MBA')), ['MBA 102', 'MBA 103', 'MBA 104', 'MBA 105', 'MBA 106'])
  assert.equal(result.length, 25)
})

test('TBA recommendations retain the top-three buildings and the third-building room cap', () => {
  const { rooms, assignments } = buildingFixture()
  assignments[0].room = 'TBA'; assignments[0].roomId = ''
  for (let number = 104; number <= 108; number++) rooms.push({
    id: `MBA${number}`, code: `MBA${number}`, name: `MBA ${number}`, buildingId: 'MBA',
  })
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.equal(result.filter(name => name.startsWith('MBA')).length, 5)
  assert.ok(result.every(name => !name.startsWith('BE')))
  assert.ok(result.includes('PTC 101') && result.includes('ITS 101'))
})

test('occupied top-three buildings do not cause recommendations from a fourth building', () => {
  const { rooms, assignments } = buildingFixture(true)
  assert.deepEqual(recommendScheduleRooms(assignments, rooms, 'target', 19, 0), [])
})

test('usage counts schedules rather than repeated meetings and resolves room aliases', () => {
  const { rooms, assignments, assignment } = buildingFixture()
  const repeated = assignment('BE102', 'conflict', 780)
  repeated.roomId = ''; repeated.room = 'be-102'
  assignments.push(...Array.from({ length: 20 }, () => ({ ...repeated })))
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.ok(result.every(name => !name.startsWith('BE')))
  assignments.push(assignment('BE102', 'BE-new-1', 780), assignment('BE103', 'BE-new-2', 780))
  const updated = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.ok(updated.includes('BE 102'))
  assert.ok(!updated.some(name => name.startsWith('MBA')))
})

test('rooms with unknown building links are excluded from building recommendations', () => {
  const { rooms, assignments } = buildingFixture()
  rooms.push({ id: 'unknown', name: 'Unknown 101', code: 'X101', buildingId: '' })
  assert.ok(!recommendScheduleRooms(assignments, rooms, 'target', 19, 0).includes('Unknown 101'))
})

test('different days, adjacent times, missing data and instructor-only conflicts do not trigger recommendations', () => {
  const h = setup()
  h.second.rows[0].values[17] = 'SAT'; assert.deepEqual(h.recommendations(), [])
  h.second.rows[0].values = values('A101', '9:00-10:30'); assert.deepEqual(h.recommendations(), [])
  h.second.rows[0].values = values('B101'); assert.deepEqual(h.recommendations(), [])
  h.second.rows[0].values = values()
  h.first.rows[0].values[15] = 'bad'; assert.deepEqual(h.recommendations(), [])
  h.first.rows[0].values[15] = '7:30-9:00'; h.first.rows[0].values[17] = 'BAT'; assert.deepEqual(h.recommendations(), [])
})

test('one shared room must be available for both slash-separated meeting times and days', () => {
  const h = setup()
  h.first.rows[0].values[15] = '7:30-9:00/10:00-11:00'
  h.first.rows[0].values[17] = 'FRI/SAT'
  h.second.rows[1].values = values('B101', '10:00-11:00', 'SAT')
  h.second.rows[2].values = values('C101', '10:00-11:00', 'SUN')
  assert.deepEqual(h.recommendations(), ['C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
})

test('separate room entries and Lec/Lab columns recommend against only their affected meetings', () => {
  const h = setup()
  h.first.rows[0].values[19] = 'A101/B101'
  h.first.rows[0].values[15] = '7:30-9:00/10:00-11:00'
  h.second.rows[1].values = values('B101', '10:00-11:00')
  h.second.rows[2].values = values('C101', '10:00-11:00')
  assert.ok(h.recommendations(19, 0).includes('C 101'))
  assert.ok(!h.recommendations(19, 1).includes('C 101'))
  assert.ok(!h.recommendations(19, -1).includes('C 101'))
  h.first.rows[0].values[14] = 'Cruz, Engelbert'
  h.first.rows[0].values[16] = '7:30-9:00'
  h.first.rows[0].values[18] = 'FRI'
  h.first.rows[0].values[20] = 'D101'
  assert.ok(!h.recommendations(19, 0).includes('D 101'))
  assert.ok(h.recommendations(20, 0).length === 0)
})

test('parallel room recommendations preserve a connected chain and exclude occupied replacement rooms', () => {
  const h = setup()
  h.sheets.splice(1)
  const parallelDirectory: ScheduleDirectory = { ...directory, rooms: Array.from({ length: 8 }, (_, index) => ({
    id: `ptc${300 + index}`, code: `PTC ${300 + index}`, name: `PTC ${300 + index}`, buildingId: 'ptc', floor: 3,
  })) }
  const recommend = () => recommendScheduleRooms(departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(h.sheets, parallelDirectory), parallelDirectory),
    parallelDirectory.rooms, facultyScheduleRowKey(h.first.name, h.first.rows[0].rowNumber), 19, 0)
  for (let index = 0; index < 4; index++) {
    h.first.rows[index].values = values()
    h.first.rows[index].values[0] = index === 0 ? 'PARALLEL' : ''
    h.first.rows[index].values[12] = String(index + 1)
    h.first.rows[index].values[19] = `PTC ${300 + index}`
  }
  assert.deepEqual(recommend(), [])
  h.first.rows[4].values = values('PTC 300'); h.first.rows[4].values[2] = 'ITE 102'
  assert.deepEqual(recommend(), ['PTC 304'])
  h.first.rows[5].values = values('PTC 304'); h.first.rows[5].values[2] = 'ITE 103'
  assert.deepEqual(recommend(), [])
})

test('internally overlapping meetings sharing one room cannot be fixed by merely choosing a different room', () => {
  const h = setup()
  h.first.rows[0].values[15] = '7:30-9:00/8:00-9:30'
  assert.deepEqual(h.recommendations(), [])
})
