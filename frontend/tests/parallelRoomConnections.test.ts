import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { parseDepartmentScheduleImportRows } from '../src/utils/departmentScheduleImportRows.ts'
import { departmentFacultyScheduleAssignments, facultyScheduleRowKey } from '../src/utils/ScheduleValidation.ts'
import { recommendScheduleRooms } from '../src/utils/scheduleRoomRecommendations.ts'
import type { ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'

function setup(codes = ['PTC 301', 'PTC 300', 'PTC 302', 'PTC 303']) {
  const directory: ScheduleDirectory = {
    departmentCode: 'CITE', faculty: [{ id: 'teacher', fullName: 'Cruz, Engelbert', department: 'CITE' }],
    rooms: ['PTC', 'ITS'].flatMap(buildingId => [200, 201, 202, 203, 299, 300, 301, 302, 303, 304, 305, 398, 399, 400, 401].map(number => ({
      id: `${buildingId}${number}`, code: `${buildingId} ${number}`, name: `${buildingId} Room ${number}`, buildingId, floor: Math.floor(number / 100),
      type: 'Lecture',
    }))),
  }
  const sheet = createEmptyDepartmentScheduleSheet()
  for (const [index, room] of codes.entries()) sheet.rows[index].values = [
    index === 0 ? 'PARALLEL' : '', 'IT', 'ITE 083', 'Project Management', 'BSIT', '3', '0', '3', '3', '0', '3', '40',
    String(index + 1), 'Cruz, Engelbert', '', '7:30-9:00', '', 'FRI', '', room, '',
  ]
  const rows = () => parseDepartmentScheduleImportRows([sheet], directory)
  const recommend = (index: number) => recommendScheduleRooms(departmentFacultyScheduleAssignments(rows(), directory), directory.rooms,
    facultyScheduleRowKey(sheet.name, sheet.rows[index].rowNumber), 19, 0)
  return { directory, sheet, rows, recommend }
}
const connectionIssues = (issues: string[]) => issues.filter(message => message.startsWith('Parallel classes must use'))

test('four parallel sections accept an unordered consecutive chain rather than all rooms needing to touch section one', () => {
  const h = setup()
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
  h.sheet.rows[0].values[19] = 'PTC Room 301'
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
})

test('gaps, different buildings and repeated rooms are flagged for the parallel group', () => {
  for (const codes of [
    ['PTC 300', 'PTC 301', 'PTC 302', 'PTC 304'],
    ['PTC 300', 'PTC 301', 'PTC 302', 'ITS 303'],
    ['PTC 300', 'PTC 301', 'PTC 302', 'PTC 302'],
  ]) {
    const h = setup(codes)
    assert.ok(h.rows().every(row => connectionIssues(row.validationIssues).length === 1), codes.join('/'))
    assert.ok(h.rows().every(row => !row.validationIssues.some(message => message.includes('is also assigned on'))))
  }
})

test('consecutive numbers cannot connect rooms across floors, using metadata and legacy floor-number fallback', () => {
  const h = setup(['PTC 398', 'PTC 399', 'PTC 400', 'PTC 401'])
  assert.ok(h.rows().every(row => connectionIssues(row.validationIssues).length === 1))
  h.directory.rooms.forEach(room => { delete room.floor })
  assert.ok(h.rows().every(row => connectionIssues(row.validationIssues).length === 1))
  const other = setup()
  other.directory.rooms.find(room => room.id === 'PTC303')!.floor = 4
  assert.ok(other.rows().every(row => connectionIssues(row.validationIssues).length === 1))
})

test('TBA parallel rooms recommend the missing connected room and the result clears validation', () => {
  const h = setup(['PTC 300', 'PTC 301', 'PTC 302', 'TBA'])
  assert.ok(h.rows().every(row => connectionIssues(row.validationIssues).length === 0))
  assert.deepEqual(h.recommend(3), ['PTC Room 303'])
  h.sheet.rows[3].values[19] = h.recommend(3)[0]
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
})

test('blank parallel rooms continue the assigned chain instead of showing only the ordinary room list', () => {
  const h = setup(['PTC 300', 'PTC 301', '', ''])
  assert.deepEqual(h.recommend(2), ['PTC Room 302'])
  h.sheet.rows[2].values[19] = h.recommend(2)[0]
  assert.deepEqual(h.recommend(3), ['PTC Room 303'])
  h.sheet.rows[3].values[19] = h.recommend(3)[0]
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
})

test('a blank parallel room can fill the middle of a chain and excludes occupied rooms', () => {
  const h = setup(['PTC 300', '', 'PTC 302', 'PTC 303'])
  assert.equal(h.recommend(1)[0], 'PTC Room 301')
  h.sheet.rows[4].values = [...h.sheet.rows[0].values]
  h.sheet.rows[4].values[0] = ''
  h.sheet.rows[4].values[2] = 'ITE 084'
  h.sheet.rows[4].values[19] = 'PTC 301'
  assert.ok(!h.recommend(1).includes('PTC Room 301'))
})

test('blank parallel laboratory room recommendations use their own chain and meeting time', () => {
  const h = setup()
  for (let index = 0; index < 4; index++) {
    const values = h.sheet.rows[index].values
    values[14] = 'Cruz, Engelbert'; values[16] = '10:00-11:30'; values[18] = 'FRI'
    values[20] = index < 2 ? `ITS ${200 + index}` : ''
  }
  const recommend = () => recommendScheduleRooms(departmentFacultyScheduleAssignments(h.rows(), h.directory), h.directory.rooms,
    facultyScheduleRowKey(h.sheet.name, h.sheet.rows[2].rowNumber), 20, 0)
  assert.deepEqual(recommend(), ['ITS Room 202'])
  h.sheet.rows[2].values[18] = 'BAT'
  assert.deepEqual(recommend(), [])
})

test('disconnected parallel rooms offer connected replacements even without a room overlap', () => {
  const h = setup(['PTC 300', 'PTC 301', 'PTC 302', 'ITS 303'])
  assert.equal(h.recommend(3)[0], 'PTC Room 303')
  h.sheet.rows[3].values[19] = h.recommend(3)[0]
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
})

test('two disconnected pairs recommend progress toward a full chain from every cell', () => {
  const h = setup(['PTC 300', 'PTC 301', 'ITS 302', 'ITS 303'])
  for (let index = 0; index < 4; index++) {
    const recommendations = h.recommend(index)
    assert.ok(recommendations.length > 0, `section ${index + 1}`)
    assert.ok(!recommendations.includes(h.directory.rooms.find(room => room.code === h.sheet.rows[index].values[19])!.name))
    assert.ok(recommendations.every(name => !h.sheet.rows.some((row, other) => other !== index
      && h.directory.rooms.find(room => room.code === row.values[19])?.name === name)))
  }
  assert.ok(h.recommend(3).includes('PTC Room 302'))
  h.sheet.rows[3].values[19] = 'PTC Room 302'
  assert.equal(h.recommend(2)[0], 'PTC Room 303')
  h.sheet.rows[2].values[19] = h.recommend(2)[0]
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
})

test('three connected rooms and an outlier offer recommendations for the connected cells too', () => {
  const h = setup(['PTC 300', 'PTC 301', 'PTC 302', 'ITS 303'])
  for (let index = 0; index < 4; index++) assert.ok(h.recommend(index).length > 0, `section ${index + 1}`)
  assert.ok(h.recommend(0).includes('ITS Room 302'))
  assert.equal(h.recommend(3)[0], 'PTC Room 303')
})

test('BE 201/202 and PTC 405/406 offer rooms leading to a complete chain in either building', () => {
  const h = setup(['BE 201', 'BE 202', 'PTC 405', 'PTC 406'])
  h.directory.rooms = ['BE', 'PTC'].flatMap(buildingId => [201, 202, 203, 204, 403, 404, 405, 406, 407, 408].map(number => ({
    id: `${buildingId}${number}`, code: `${buildingId} ${number}`, name: `${buildingId} ${number}`, buildingId, floor: Math.floor(number / 100), type: 'Lecture',
  })))
  for (let index = 0; index < 4; index++) assert.ok(h.recommend(index).length > 0)
  assert.ok(h.recommend(3).includes('BE 203'))
  assert.ok(h.recommend(0).includes('PTC 404'))
})

test('replacing PTC 404 joins existing rooms immediately instead of skipping over its vacated room', () => {
  const h = setup(['BE 201', 'PTC 402', 'PTC 403', 'PTC 404'])
  h.directory.rooms = [
    ...[201, 202, 203, 204].map(number => ({ id: `BE${number}`, code: `BE ${number}`, name: `BE ${number}`, buildingId: 'BE', floor: 2, type: 'Lecture' })),
    ...[401, 402, 403, 404, 405, 406, 407].map(number => ({ id: `PTC${number}`, code: `PTC ${number}`, name: `PTC ${number}`, buildingId: 'PTC', floor: 4, type: 'Lecture' })),
  ]
  assert.deepEqual(h.recommend(3), ['PTC 401', 'BE 202'])
  assert.ok(h.recommend(0).includes('PTC 401') && h.recommend(0).includes('PTC 405'))
})

test('multi-step parallel recommendations require a complete available chain on one floor', () => {
  const h = setup(['PTC 300', 'PTC 301', 'ITS 302', 'ITS 303'])
  h.sheet.rows[4].values = [...h.sheet.rows[0].values]
  h.sheet.rows[4].values[0] = ''
  h.sheet.rows[4].values[2] = 'ITE 084'
  h.sheet.rows[4].values[19] = 'PTC 302'
  h.directory.rooms = h.directory.rooms.filter(room => !['ITS 300', 'ITS 304', 'ITS 305'].includes(room.code))
  assert.deepEqual(h.recommend(3), [])
})

test('lecture and laboratory parallel groups can use separate connected chains', () => {
  const h = setup()
  for (let index = 0; index < 4; index++) {
    const values = h.sheet.rows[index].values
    values[14] = 'Cruz, Engelbert'; values[16] = '10:00-11:30'; values[18] = 'FRI'; values[20] = `ITS ${200 + index}`
  }
  assert.ok(h.rows().every(row => row.validationIssues.length === 0))
  h.sheet.rows[3].values[20] = 'ITS 299'
  assert.ok(h.rows().every(row => connectionIssues(row.validationIssues).length === 1))
})
