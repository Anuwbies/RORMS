const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

// Exercise the shared validator, live subscriptions and Save directory refresh
// without Firebase credentials or database writes.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename)

const { departmentExternalRoomAssignments, validateOtherDepartmentRoomAssignments } = require('../src/utils/ScheduleValidation.ts')
const { scheduleMeetingRecords } = require('../src/utils/scheduleMeetings.ts')
const { createEmptyDepartmentScheduleSheet } = require('../src/utils/departmentScheduleImport.ts')
const { parseDepartmentScheduleImportRows, extractDepartmentScheduleImportRows } = require('../src/utils/departmentScheduleImportRows.ts')
const { createDepartmentScheduleWorkbookSnapshot } = require('../src/utils/departmentScheduleWorkbookState.ts')

const term = { departmentId: 'cite', departmentCode: 'CITE', academicYearId: 'year-1', academicYear: '2026 - 2027', semester: 'sem1', membershipId: 'member-1' }
const rooms = [{ id: 'room-1', name: 'PTC 403', code: 'PTC-403', buildingId: 'ptc' },
  { id: 'room-2', name: 'PTC 404', code: 'PTC-404', buildingId: 'ptc' }]
const data = { departmentId: 'cba', department: 'CBA', academicYearId: 'year-1', academicYear: term.academicYear,
  semesterKey: 'sem1', status: 'Draft', roomId: 'room-1', startTime: '07:30', endTime: '09:00', days: ['Mon'] }
const record = (id, overrides = {}) => ({ id, ...data, ...overrides })
const document = (id, value) => ({ id, data: () => value })
const convert = (...meetings) => departmentExternalRoomAssignments(meetings, term, rooms)
assert.equal(convert(record('draft')).length, 1)
assert.equal(convert(record('plot', { status: 'Plot' })).length, 1)
assert.equal(convert(record('legacy-term', { academicYearId: '', semesterKey: '', semester: '1st Semester' })).length, 1)
assert.equal(convert(record('alias', { roomId: '', room: 'PTC-403' }))[0].roomId, 'room-1')
for (const overrides of [
  { department: 'CITE' }, { departmentId: 'cite' }, { academicYearId: 'other-year' }, { semesterKey: 'sem2' },
  { status: 'Returned' }, { status: 'Cancelled' }, { isActive: false }, { department: '' },
  { academicYearId: '', academicYear: '' }, { semesterKey: '', semester: '' },
  { roomId: '', room: 'TBA' }, { room: 'TBA' }, { startTime: 'TBA' }, { endTime: '07:30' },
  { days: ['TBA'] }, { days: 'MON' }, { startTime: '25:00' },
]) assert.equal(convert(record('excluded', overrides)).length, 0, JSON.stringify(overrides))

const current = { location: 'current-row', code: 'ITE 101', section: '1', room: 'PTC 403', roomId: 'room-1',
  start: 8 * 60, end: 9 * 60 + 30, days: ['Mon', 'Tue'] }
const external = convert(record('one'), record('duplicate'))
const issues = validateOtherDepartmentRoomAssignments([current], external)
assert.equal(issues.length, 1, 'Same department/day/room/time warning is deduplicated')
assert.equal(issues[0].message, 'CBA is using Room PTC 403 on MON (07:30–09:00).')
for (const overrides of [{ startTime: '09:30', endTime: '11:00' }, { endTime: '08:00' }, { days: ['Wed'] }, { roomId: 'room-2' }]) {
  assert.equal(validateOtherDepartmentRoomAssignments([current], convert(record('no-overlap', overrides))).length, 0)
}

const workbook = document('saved-workbook', { ...data, source: 'workbook', schemaVersion: 2, meetings: [
  { roomId: 'room-1', startTime: '07:30', endTime: '09:00', days: ['Mon'], format: 'Lec' },
  { roomId: 'room-2', startTime: '10:30', endTime: '12:00', days: ['Tue'], format: 'Lab' },
] })
const directory = { departmentCode: 'CITE', faculty: [], rooms,
  externalRoomAssignments: departmentExternalRoomAssignments(scheduleMeetingRecords([workbook]), term, rooms) }
const sheet = createEmptyDepartmentScheduleSheet()
sheet.rows[0].values[0] = 'LECTURE'
sheet.rows[0].values[2] = 'ITE 101'
sheet.rows[0].values[15] = '7:30-9:00/10:30-12:00'
sheet.rows[0].values[17] = 'MON/TUE'
sheet.rows[0].values[19] = 'PTC-403/PTC 404'
const live = parseDepartmentScheduleImportRows([sheet], directory)
assert.equal(live[0].validationIssues.length, 2, 'Every slash-separated meeting is checked')
assert(live[0].validationIssues.some(message => message.includes('PTC 404 on TUE (10:30–12:00)')))
const state = createDepartmentScheduleWorkbookSnapshot([sheet], 0, null)
assert.deepEqual(extractDepartmentScheduleImportRows(state.snapshot, state.ownedNames, [sheet], directory)[0].validationIssues, live[0].validationIssues)
assert.deepEqual(parseDepartmentScheduleImportRows([sheet], { ...directory, externalRoomAssignments: [] })[0].validationIssues, [])

const listeners = []
let savedDocuments = [workbook], failReads = false
const read = reference => savedDocuments.filter(item => reference.constraints.every(constraint => item.data()[constraint.field] === constraint.value))
const originalLoad = Module._load
Module._load = function(request, ...args) {
  if (request.endsWith('/firebase')) return { db: {} }
  if (request === 'firebase/firestore') return {
    collection: (_, name) => ({ name, constraints: [] }),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (reference, ...constraints) => ({ ...reference, constraints }),
    async getDocs(reference) {
      if (reference.name === 'schedules' && failReads) throw new Error('Schedule read failed')
      return { docs: reference.name === 'rooms' ? rooms.map(room => document(room.id, room)) : reference.name === 'schedules' ? read(reference) : [] }
    },
    onSnapshot(reference, next, error) {
      const listener = { reference, next, error, closed: false }
      listeners.push(listener)
      return () => { listener.closed = true }
    },
  }
  return originalLoad.call(this, request, ...args)
}
const { loadDepartmentScheduleDirectory, subscribeDepartmentRoomSchedules } = require('../src/services/departmentScheduleRows.ts')
async function main() {
  const loaded = await loadDepartmentScheduleDirectory('CITE', term)
  assert.equal(loaded.externalRoomAssignments.length, 2, 'Overlapping year queries do not duplicate documents')
  savedDocuments = []
  assert.equal((await loadDepartmentScheduleDirectory('CITE', term)).externalRoomAssignments.length, 0, 'Save refreshes saved schedules')
  let received, failures = 0
  const unsubscribe = subscribeDepartmentRoomSchedules(term, rooms, rows => { received = rows }, () => { failures++ })
  listeners[0].next({ docs: [workbook] })
  assert.equal(received, undefined, 'Wait for both year query snapshots')
  listeners[1].next({ docs: [workbook] })
  assert.equal(received.length, 2)
  listeners.forEach(listener => listener.next({ docs: [] }))
  assert.deepEqual(received, [], 'Removing another department schedule clears warnings')
  listeners[0].error(new Error('Permission denied'))
  assert.equal(failures, 1)
  unsubscribe()
  assert(listeners.every(listener => listener.closed), 'Close all listeners when the workbook closes')
  failReads = true
  await assert.rejects(loadDepartmentScheduleDirectory('CITE', term), /Schedule read failed/)
  assert.equal((await loadDepartmentScheduleDirectory('CITE')).externalRoomAssignments, undefined, 'Standalone workbooks do not invent term conflicts')
  console.log('Passed: cross-department room conflicts, term/status filters, room aliases, split meetings, live/Save parity, refresh, subscription cleanup and load failures.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
