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

test('workbook mode recommends other available rooms without a room conflict', () => {
  const h = setup()
  h.second.rows[0].values[17] = 'SAT'
  const assignments = departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(h.sheets, directory), directory)
  const suggestions = recommendScheduleRooms(assignments, directory.rooms,
    facultyScheduleRowKey(h.first.name, h.first.rows[0].rowNumber), 19, 0, { alwaysRecommend: true })
  assert.deepEqual(suggestions, ['B 101', 'C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
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

test('saved rooms in other departments trigger alternatives and are excluded from ordinary recommendations', () => {
  const h = setup()
  h.second.rows[0].values[17] = 'SAT'
  const external: FacultySubjectAssignment[] = [
    { location: 'other-A', code: '', section: '', departmentCode: 'CBA', roomId: 'A', room: 'A 101',
      days: ['Fri'], start: 450, end: 540 },
    { location: 'other-C', code: '', section: '', departmentCode: 'CBA', roomId: 'C', room: 'C 101',
      days: ['Fri'], start: 450, end: 540 },
    { location: 'other-E', code: '', section: '', departmentCode: 'CBA', roomId: 'E', room: 'E 101',
      days: ['Sat'], start: 450, end: 540 },
  ]
  const recommend = () => recommendScheduleRooms(
    departmentFacultyScheduleAssignments(parseDepartmentScheduleImportRows(h.sheets, directory), directory), directory.rooms,
    facultyScheduleRowKey(h.first.name, h.first.rows[0].rowNumber), 19, 0, { externalRoomAssignments: external })
  assert.deepEqual(recommend(), ['B 101', 'D 101', 'E 101', 'F 101', 'G 101'])
  h.first.rows[0].values[19] = 'TBA'
  assert.deepEqual(recommend(), ['B 101', 'D 101', 'E 101', 'F 101', 'G 101'])
})

test('unavailable and maintenance rooms are excluded from room recommendations', () => {
  const h = setup()
  h.first.rows[0].values[19] = 'TBA'
  h.second.rows[0].values[19] = 'C101'
  h.second.rows[0].values[17] = 'SAT'
  h.second.rows[1].values[19] = 'D101'
  h.second.rows[1].values[17] = 'SAT'
  h.first.rows[0].values[17] = 'FRI'
  directory.rooms.find(room => room.id === 'C')!.status = 'Unavailable'
  directory.rooms.find(room => room.id === 'D')!.status = 'Maintenance'
  try {
    assert.deepEqual(h.recommendations(), ['A 101', 'B 101', 'E 101', 'F 101', 'G 101'])
    h.first.rows[0].values[19] = 'C101'
    assert.deepEqual(h.recommendations(), ['A 101', 'B 101', 'E 101', 'F 101', 'G 101'])
  } finally {
    delete directory.rooms.find(room => room.id === 'C')!.status
    delete directory.rooms.find(room => room.id === 'D')!.status
  }
})

test('department workbook recommendations use the same college and room type rule', () => {
  const h = setup()
  h.first.rows[0].values[0] = 'LECTURE'
  h.first.rows[0].values[19] = 'A101'
  h.second.rows[0].values[17] = 'SAT'
  directory.rooms.find(room => room.id === 'A')!.type = 'Laboratory'
  directory.rooms.find(room => room.id === 'B')!.type = 'Laboratory'
  for (const room of directory.rooms.filter(room => !['A', 'B'].includes(room.id))) room.type = 'Lecture'
  try {
    assert.deepEqual(h.recommendations(), ['C 101', 'D 101', 'E 101', 'F 101', 'G 101'])
  } finally {
    for (const room of directory.rooms) delete room.type
  }
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

test('an empty current workbook uses previous-term buildings and stops when history is empty', () => {
  const rooms = [
    { id: 'A101', code: 'A101', name: 'A 101', buildingId: 'A' },
    { id: 'B101', code: 'B101', name: 'B 101', buildingId: 'B' },
  ]
  const target: FacultySubjectAssignment = { location: 'current', rowKey: 'current', code: 'ITE 101', section: '1',
    room: '', start: 450, end: 540, days: ['Mon'], roomColumn: 19, roomEntryIndex: 0 }
  const previous: FacultySubjectAssignment = { location: 'previous', rowKey: 'previous', code: '', section: '', roomId: 'B101' }
  assert.deepEqual(recommendScheduleRooms([target], rooms, 'current', 19, 0), [])
  assert.deepEqual(recommendScheduleRooms([target], rooms, 'current', 19, 0, { previousTermAssignments: [previous] }), ['B 101'])
  assert.deepEqual(recommendScheduleRooms([{ ...target, roomId: 'A101', room: 'A 101' }], rooms, 'current', 19, 0,
    { alwaysRecommend: true, previousTermAssignments: [previous] }), [])
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

test('available rooms from every used building are recommended in usage order', () => {
  const { rooms, assignments } = buildingFixture()
  assert.deepEqual(recommendScheduleRooms(assignments, rooms, 'target', 19, 0), [
    'PTC 101', 'PTC 102', 'PTC 103', 'ITS 101', 'ITS 102', 'ITS 103', 'MBA 101', 'MBA 102', 'MBA 103', 'BE 102', 'BE 103',
  ])
})

test('every used building contributes all distinct available rooms', () => {
  const { rooms, assignments } = buildingFixture()
  for (const buildingId of ['PTC', 'ITS', 'MBA']) for (let number = 104; number <= 110; number++) {
    rooms.push({ id: `${buildingId}${number}`, code: `${buildingId}${number}`, name: `${buildingId} ${number}`, buildingId })
  }
  // Occupied rooms are excluded and duplicate room records produce one recommendation.
  const occupied = assignments.find(item => item.rowKey === 'MBA-0')!
  occupied.start = 450; occupied.end = 540
  rooms.push({ ...rooms.find(room => room.id === 'MBA102')! })
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.equal(result.filter(name => name.startsWith('PTC')).length, 10)
  assert.equal(result.filter(name => name.startsWith('ITS')).length, 10)
  assert.deepEqual(result.filter(name => name.startsWith('MBA')),
    ['MBA 102', 'MBA 103', 'MBA 104', 'MBA 105', 'MBA 106', 'MBA 107', 'MBA 108', 'MBA 109', 'MBA 110'])
  assert.deepEqual(result.filter(name => name.startsWith('BE')), ['BE 102', 'BE 103'])
  assert.equal(result.length, 31)
})

test('TBA recommendations include all rooms from every used building', () => {
  const { rooms, assignments } = buildingFixture()
  assignments[0].room = 'TBA'; assignments[0].roomId = ''
  for (let number = 104; number <= 108; number++) rooms.push({
    id: `MBA${number}`, code: `MBA${number}`, name: `MBA ${number}`, buildingId: 'MBA',
  })
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.equal(result.filter(name => name.startsWith('MBA')).length, 8)
  assert.deepEqual(result.filter(name => name.startsWith('BE')), ['BE 102', 'BE 103'])
  assert.ok(result.includes('PTC 101') && result.includes('ITS 101'))
})

test('occupied higher-usage buildings do not hide available rooms in another used building', () => {
  const { rooms, assignments } = buildingFixture(true)
  assert.deepEqual(recommendScheduleRooms(assignments, rooms, 'target', 19, 0), ['BE 102', 'BE 103'])
})

test('usage counts schedules rather than repeated meetings and resolves room aliases', () => {
  const { rooms, assignments, assignment } = buildingFixture()
  const repeated = assignment('BE102', 'conflict', 780)
  repeated.roomId = ''; repeated.room = 'be-102'
  assignments.push(...Array.from({ length: 20 }, () => ({ ...repeated })))
  const result = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.deepEqual(result.filter(name => name.startsWith('BE')), ['BE 102', 'BE 103'])
  assert.ok(result.indexOf('MBA 101') < result.indexOf('BE 102'))
  assignments.push(assignment('BE102', 'BE-new-1', 780), assignment('BE103', 'BE-new-2', 780))
  const updated = recommendScheduleRooms(assignments, rooms, 'target', 19, 0)
  assert.ok(updated.includes('BE 102'))
  assert.ok(updated.indexOf('BE 102') < updated.indexOf('ITS 101'))
  assert.ok(updated.some(name => name.startsWith('MBA')))
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
    id: `ptc${300 + index}`, code: `PTC ${300 + index}`, name: `PTC ${300 + index}`, buildingId: 'ptc', floor: 3, type: 'Lecture',
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
