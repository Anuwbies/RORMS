import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import * as XLSX from 'xlsx'

const require = createRequire(import.meta.url)
const modules = new Map()
export function loadTypeScript(file) {
  file = resolve(file)
  if (modules.has(file)) return modules.get(file).exports
  const module = { exports: {} }
  modules.set(file, module)
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText
  const run = vm.runInThisContext(`(function(require, exports, module) { ${compiled}\n})`, { filename: file })
  run(name => name.startsWith('.') ? loadTypeScript(resolve(dirname(file), name.endsWith('.ts') ? name : `${name}.ts`)) : require(name), module.exports, module)
  return module.exports
}
const root = fileURLToPath(new URL('../src/utils/', import.meta.url))
const { DEPARTMENT_TEMPLATE_KEY, emptyTemplateSnapshot, facultySubjectCellAddresses, findDepartmentTemplateSheets, readDepartmentCourseTemplate, readDepartmentTemplatePreview, extractDepartmentTemplateRows } = loadTypeScript(resolve(root, 'departmentScheduleTemplates.ts'))
const { formatFacultySubject, formatRoomSubject, roomScheduleSuggestions } = loadTypeScript(resolve(root, 'ScheduleValidation.ts'))
const { readRoomScheduleTemplate } = loadTypeScript(resolve(root, 'departmentScheduleTemplates.ts'))
const { filterDepartmentCourses, subjectFragment } = loadTypeScript(resolve(root, 'departmentCourseSuggestions.ts'))
const { filterRoomNames } = loadTypeScript(resolve(root, 'excelRoomSuggestions.ts'))
const { appendImportedSheets } = loadTypeScript(resolve(root, 'excelSheetImport.ts'))
const { serializeFirestoreWorkbookState, splitFirestoreWorkbookState, joinFirestoreWorkbookState } = loadTypeScript(resolve(root, 'firestoreWorkbookState.ts'))

function fixture() {
  const snapshot = emptyTemplateSnapshot()
  snapshot.workbook = { SheetNames: ['Faculty', 'CITE'], Sheets: {
    Faculty: XLSX.utils.aoa_to_sheet([
      [], ['F2F'], ['REMOTE COACHING'], ['INDEPENDENT LEARNING'],
      ['', '', '', '', 'Example, Teacher'],
      ['', '', '', '', 'SHIFT, AM', 'TUE', 'THU', 'FRI'],
      ['', '', '', '', '7:30-8:00', '', 'ITE 314-2'],
      ['', '', '', '', '8:00-9:00'],
      ['', '', '', '', '9:00-9:30', '', 'ITE314-2'],
      ['', '', '', '', '9:30-10:30'],
      ['', '', '', '', '10:30-11:00', '', '', 'ITE 083 G1'],
      ['', '', '', '', '11:00-12:00'],
      ['', '', '', '', '12:00-12:30'],
      ['', '', '', '', '12:30-1:30'],
      [],
      ['', '', '', '', '1:30-2:30', '', 'ITE 314-2'],
      ['', '', '', '', '2:30-3:00'],
      ['', '', '', '', '6:00-7:00'],
      ['', '', '', '', '7:00-7:30', '', 'ITE314-2'],
    ]),
    CITE: XLSX.utils.aoa_to_sheet([
      ['PHINMA EDUCATION'], ['Session', 'Semester', 'Code', 'Course', 'Type', 'Credits'],
      ['SY 25-26 SEM I', 'Y3S1', 'ITE 314', 'Advanced Database Systems', 'Lecture and Laboratory', 3],
      ['SY 24-25 SEM I', 'Y2S1', 'ITE 083', 'IT Project Management', 'Lecture', 3],
    ]),
  } }
  snapshot.selectedSheet = 'Faculty'
  snapshot.workbook.Sheets.Faculty['!merges'] = ['G7:G8', 'G9:G10', 'H11:H12', 'G16:G17'].map(XLSX.utils.decode_range)
  snapshot.workbook.Sheets.Faculty[DEPARTMENT_TEMPLATE_KEY] = { version: 1, role: 'faculty' }
  snapshot.workbook.Sheets.CITE[DEPARTMENT_TEMPLATE_KEY] = { version: 1, role: 'courses' }
  snapshot.previewStyles = { files: {}, sheetPaths: {}, cellStyles: [{ backgroundColor: '#fff2cc' }, { backgroundColor: '#cfe2f3' }, { backgroundColor: '#b6d7a8' }], differentialStyles: [] }
  const indexes = new Map([['A2', 0], ['A3', 1], ['A4', 2], ['G7', 0], ['G9', 0], ['H11', 0], ['G16', 1], ['G19', 0]])
  for (const name of snapshot.workbook.SheetNames) snapshot.formattingOverrides.set(name, { indexes: name === 'Faculty' ? indexes : new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] })
  return snapshot
}
const directory = { departmentCode: 'CITE', faculty: [{ id: 'faculty-1', fullName: 'Example, Teacher', department: 'CITE' }], rooms: [] }

test('faculty subject formatting pads codes and retains explicit sections', () => {
  assert.equal(formatFacultySubject('ite314-2'), 'ITE 314-2')
  assert.equal(formatFacultySubject('ite48-12'), 'ITE 048-12')
  assert.equal(formatFacultySubject('ITE 083 G1'), 'ITE 083-1')
  assert.equal(formatFacultySubject('ssp7-9'), 'SSP 007-9')
  assert.equal(formatFacultySubject('ite314'), 'ITE 314')
  assert.equal(formatFacultySubject('ITE3142'), 'ITE3142')
  assert.equal(formatFacultySubject('Example, Teacher'), 'Example, Teacher')
})

test('faculty subject formatting targets timetable cells, including blank slots', () => {
  const addresses = facultySubjectCellAddresses(fixture(), 'Faculty')
  assert.ok(addresses.has('G7'))
  assert.ok(addresses.has('F7'))
  assert.ok(addresses.has('H11'))
  assert.ok(!addresses.has('E7'))
  assert.ok(!addresses.has('G6'))
})

test('faculty subject suggestions search current course codes and titles while keeping the section outside the replacement', () => {
  const courses = readDepartmentCourseTemplate(fixture(), 'CITE').courses
  assert.deepEqual(filterDepartmentCourses(courses, '').map(course => course.code), ['ITE 314', 'ITE 083'])
  assert.deepEqual(filterDepartmentCourses(courses, 'ite314').map(course => course.code), ['ITE 314'])
  assert.deepEqual(filterDepartmentCourses(courses, 'project management').map(course => course.code), ['ITE 083'])
  assert.deepEqual(filterDepartmentCourses(courses, 'missing'), [])
  assert.deepEqual(subjectFragment('ITE 314-2', 'ITE 314-2'.length), { start: 0, end: 7, query: 'ITE 314' })
  assert.deepEqual(subjectFragment('ITE 083 G1', 'ITE 083 G1'.length), { start: 0, end: 7, query: 'ITE 083' })
})

test('course validation identifies each missing field and ignores fully empty rows', () => {
  const snapshot = fixture()
  snapshot.cellTextOverrides.set('CITE', new Map(['A3', 'B3', 'D3', 'E3', 'F3'].map(address => [address, ''])))
  const { issues } = readDepartmentCourseTemplate(snapshot, 'CITE')
  assert.deepEqual(issues.map(issue => issue.location).sort(), ['CITE!A3', 'CITE!B3', 'CITE!D3', 'CITE!E3', 'CITE!F3'])
  assert.ok(issues.every(issue => issue.message.includes('is missing')))
  assert.ok(issues.every(issue => issue.message.includes('ITE 314')))
  snapshot.cellTextOverrides.get('CITE').set('C3', '')
  assert.deepEqual(readDepartmentCourseTemplate(snapshot, 'CITE').issues, [])
  snapshot.cellTextOverrides.get('CITE').set('D3', 'Advanced Database Systems')
  assert.ok(readDepartmentCourseTemplate(snapshot, 'CITE').issues.every(issue => issue.message.includes('Advanced Database Systems')))
})

test('course duplicates normalize codes and titles independently across years and semesters', () => {
  const snapshot = fixture()
  snapshot.cellTextOverrides.set('CITE', new Map([
    ['A5', 'SY 25-26 SEM I'], ['B5', ' y3s1 '], ['C5', 'ite314'], ['D5', 'Duplicate title'], ['E5', 'Lecture'], ['F5', '0'],
  ]))
  const duplicates = readDepartmentCourseTemplate(snapshot, 'CITE').issues.filter(issue => issue.message.includes('Duplicate code'))
  assert.deepEqual(duplicates.map(issue => issue.location), ['CITE!C3', 'CITE!C5'])
  assert.ok(duplicates.every(issue => !issue.message.includes('row')))
  snapshot.cellTextOverrides.get('CITE').set('B5', 'Y3S2')
  assert.equal(readDepartmentCourseTemplate(snapshot, 'CITE').issues.filter(issue => issue.message.includes('Duplicate code')).length, 2)
  snapshot.cellTextOverrides.get('CITE').set('B5', 'Y4S1')
  assert.equal(readDepartmentCourseTemplate(snapshot, 'CITE').issues.filter(issue => issue.message.includes('Duplicate code')).length, 2)
  snapshot.cellTextOverrides.get('CITE').set('C5', 'ITE 999')
  snapshot.cellTextOverrides.get('CITE').set('D5', '  advanced   database systems  ')
  const courseDuplicates = readDepartmentCourseTemplate(snapshot, 'CITE').issues.filter(issue => issue.message.includes('Duplicate course'))
  assert.deepEqual(courseDuplicates.map(issue => issue.location), ['CITE!D3', 'CITE!D5'])
  snapshot.cellTextOverrides.get('CITE').set('D5', 'Unique course')
  assert.deepEqual(readDepartmentCourseTemplate(snapshot, 'CITE').issues, [])
})

function withRooms(snapshot = fixture()) {
  snapshot.workbook.SheetNames.push('Rooms & Labs')
  snapshot.workbook.Sheets['Rooms & Labs'] = XLSX.utils.aoa_to_sheet([
    ['', '', 'PTC 303', 'PTC 304'],
    ['', '7:30-9:00 THU', 'ITE 314-2'],
    ['', '9:00-10:30 THU', '', 'ITE 314-2'],
    ['', '10:30-12:00 FRI', 'ITE 083 G1'],
  ])
  snapshot.workbook.Sheets['Rooms & Labs'][DEPARTMENT_TEMPLATE_KEY] = { version: 1, role: 'rooms' }
  snapshot.formattingOverrides.set('Rooms & Labs', { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] })
  return snapshot
}
const roomDirectory = { ...directory, rooms: [
  { id: 'room-303', code: 'PTC 303', name: 'Room 303', buildingId: 'ptc' },
  { id: 'room-304', code: 'PTC 304', name: 'Room 304', buildingId: 'ptc' },
] }

test('dense subject rows never replace the Rooms & Labs table headers', () => {
  const snapshot = withRooms()
  snapshot.workbook.Sheets['Rooms & Labs'] = XLSX.utils.aoa_to_sheet([
    ['', 'PTC 403', 'PTC 404', 'PTC 405'],
    ['7:30-9:00 THU', 'ITE 310', 'ITE 381', 'SSP 006'],
    ['9:00-10:30 THU', 'ITE 310', 'ITE 381', 'SSP 007-2'],
    ['10:30-12:00 THU', 'SSP 006', 'ITE 381', 'SSP 007-2'],
  ])
  const parsed = readRoomScheduleTemplate(snapshot, 'Rooms & Labs')
  assert.equal(parsed.entries.length, 9)
  assert.ok(parsed.entries.every(entry => ['PTC 403', 'PTC 404', 'PTC 405'].includes(entry.room)))
  assert.equal(parsed.entries.find(entry => entry.location === 'Rooms & Labs!D3').room, 'PTC 405')
  assert.ok(parsed.cells.has('B2'))
  assert.ok(!parsed.cells.has('B1'))
})

test('room headers validate against the room directory, including empty columns and current edits', () => {
  const snapshot = withRooms()
  assert.equal(readRoomScheduleTemplate(snapshot, 'Rooms & Labs', roomDirectory.rooms).issues.length, 0)
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['C1', 'PTC 000'], ['C2', ''], ['C4', '']]))
  const unknown = readRoomScheduleTemplate(snapshot, 'Rooms & Labs', roomDirectory.rooms)
  assert.ok(unknown.issues.some(issue => issue.location === 'Rooms & Labs!C1' && issue.message.includes('does not exist')))
  assert.ok(!unknown.issues.some(issue => issue.location === 'Rooms & Labs!D1'))
  assert.equal(readRoomScheduleTemplate(snapshot, 'Rooms & Labs').issues.length, 0)
  assert.ok(readRoomScheduleTemplate(snapshot, 'Rooms & Labs', []).issues.some(issue => issue.location === 'Rooms & Labs!C1'))

  snapshot.cellTextOverrides.get('Rooms & Labs').set('C1', 'room 303')
  assert.equal(readRoomScheduleTemplate(snapshot, 'Rooms & Labs', roomDirectory.rooms).issues.length, 0)
  const duplicateRooms = [...roomDirectory.rooms, { code: 'OTHER 303', name: 'Room 303' }]
  assert.ok(readRoomScheduleTemplate(snapshot, 'Rooms & Labs', duplicateRooms).issues.some(issue => issue.location === 'Rooms & Labs!C1' && issue.message.includes('multiple rooms')))
})

test('missing room headers are highlighted inside the table without validating empty worksheet cells to its right', () => {
  const snapshot = withRooms()
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['C1', ''], ['D1', ''], ['M1', '']]))
  snapshot.workbook.Sheets['Rooms & Labs'].J1 = { t: 'z' }
  snapshot.workbook.Sheets['Rooms & Labs'].K1 = { t: 's', v: '' }
  snapshot.workbook.Sheets['Rooms & Labs'].N1 = { t: 's', v: 'Notes outside the table' }
  let parsed = readRoomScheduleTemplate(snapshot, 'Rooms & Labs', roomDirectory.rooms)
  assert.deepEqual([...parsed.headerCells], ['C1', 'D1'])
  assert.deepEqual(parsed.issues.filter(issue => issue.message.includes('missing')).map(issue => issue.location), ['Rooms & Labs!C1', 'Rooms & Labs!D1'])

  snapshot.workbook.Sheets['Rooms & Labs'].D1.v = ''
  snapshot.cellStyleOverrides.set('Rooms & Labs', new Map([['D1', { borderTop: '1px solid #000000', borderRight: '1px solid #000000' }]]))
  parsed = readRoomScheduleTemplate(snapshot, 'Rooms & Labs', roomDirectory.rooms)
  assert.deepEqual([...parsed.headerCells], ['C1', 'D1'])
  assert.ok(parsed.issues.some(issue => issue.location === 'Rooms & Labs!D1' && issue.message.includes('missing')))
})

test('room suggestions search codes and names, ignore spacing and return unique room names', () => {
  assert.deepEqual(filterRoomNames(roomDirectory.rooms, 'ptc303'), ['Room 303'])
  assert.deepEqual(filterRoomNames(roomDirectory.rooms, 'room 304'), ['Room 304'])
  assert.deepEqual(filterRoomNames(roomDirectory.rooms, 'PTC 000'), [])
  assert.deepEqual(filterRoomNames([...roomDirectory.rooms, roomDirectory.rooms[0]], ''), ['Room 303', 'Room 304'])
})

test('faculty membership issues highlight the name and matching room assignments; invalid faculty cannot supply room choices', () => {
  for (const [name, status, message] of [
    ['', 'missing', 'Faculty is missing'],
    ['Another, Teacher', 'invalid', 'active Instructor or Program Head in this department'],
    ['tba', 'tba', 'Faculty is TBA'],
  ]) {
    const snapshot = withRooms()
    snapshot.cellTextOverrides.set('Faculty', new Map([['E5', name]]))
    if (status === 'missing') {
      for (const sheet of snapshot.workbook.SheetNames) delete snapshot.workbook.Sheets[sheet][DEPARTMENT_TEMPLATE_KEY]
      assert.equal(findDepartmentTemplateSheets(snapshot).facultySheet, 'Faculty')
    }
    const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs', ['Example, Teacher'])
    const issue = preview.issues.find(issue => issue.location === 'Faculty!E5' && issue.message.includes(message))
    assert.ok(issue, `${status}: faculty name validation is missing`)
    assert.equal(issue.tone, status === 'tba' ? 'warning' : undefined)
    assert.ok(preview.issues.some(issue => issue.location === 'Rooms & Labs!C2' && issue.message.includes(message)))
    assert.ok(preview.facultyAssignments.every(assignment => assignment.facultyStatus === status))
    assert.deepEqual(roomScheduleSuggestions(preview.facultyAssignments, [], preview.courses), [])
  }
})

test('an empty faculty timetable does not require a name until a subject-section is entered', () => {
  const snapshot = fixture()
  const edits = new Map([['E5', ''], ['G7', ''], ['G9', ''], ['H11', ''], ['G16', ''], ['G19', '']])
  snapshot.cellTextOverrides.set('Faculty', edits)
  const preview = () => readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', undefined, ['Example, Teacher'])
  assert.ok(!preview().issues.some(issue => issue.location === 'Faculty!E5'))
  assert.equal(preview().facultyAssignments.length, 0)
  edits.set('G7', 'ITE 314-2')
  assert.ok(preview().issues.some(issue => issue.location === 'Faculty!E5' && issue.message.includes('Faculty is missing')))
  edits.set('G7', '')
  assert.ok(!preview().issues.some(issue => issue.location === 'Faculty!E5'))
})

test('department faculty membership validation reacts to directory changes and supports NEW annotations and merged name cells', () => {
  const snapshot = withRooms()
  snapshot.workbook.Sheets.Faculty['!merges'].push(XLSX.utils.decode_range('E5:H5'))
  snapshot.cellTextOverrides.set('Faculty', new Map([['E5', 'Example, Teacher (NEW)']]))
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs', ['Example, Teacher'])
  assert.ok(preview.facultyAssignments.every(assignment => assignment.facultyStatus === 'valid'))
  assert.ok(!preview.issues.some(issue => issue.location === 'Faculty!E5'))
  assert.ok(roomScheduleSuggestions(preview.facultyAssignments, [], preview.courses).length > 0)

  const removed = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs', [])
  assert.ok(removed.issues.some(issue => issue.location === 'Faculty!E5' && issue.message.includes('active Instructor or Program Head')))
  assert.deepEqual(roomScheduleSuggestions(removed.facultyAssignments, [], removed.courses), [])
  const pending = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.ok(!pending.issues.some(issue => issue.location === 'Faculty!E5'))
})

test('room validation distinguishes wrong days, wrong times, and missing faculty classes', () => {
  const snapshot = withRooms()
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['B2', '7:30-9:00 FRI']]))
  let preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.ok(preview.issues.some(issue => issue.location === 'Rooms & Labs!C2' && issue.message.includes('wrong day') && issue.message.includes('Thu 07:30')))
  snapshot.cellTextOverrides.get('Rooms & Labs').set('B2', '10:30-12:00 THU')
  preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.ok(preview.issues.some(issue => issue.location === 'Rooms & Labs!C2' && issue.message.includes('wrong time')))
  snapshot.cellTextOverrides.get('Rooms & Labs').set('C2', 'ITE999-2')
  preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.ok(preview.issues.some(issue => issue.location === 'Rooms & Labs!C2' && issue.message.includes('not in Faculty Schedules')))
})

test('room duplicates flag every conflicting cell while adjacent meetings remain valid', () => {
  const snapshot = withRooms()
  assert.ok(!readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs').issues.some(issue => issue.message.includes('Duplicate class')))
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['D2', 'ite314-2']]))
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.deepEqual(preview.issues.filter(issue => issue.message.includes('Duplicate class')).map(issue => issue.location).sort(), ['Rooms & Labs!C2', 'Rooms & Labs!D2'])
  assert.equal(preview.classes.find(item => item.course.code === 'ITE 314').meetings[0].room, undefined)
})

test('room suggestions exclude entered classes even with wrong or malformed day/time labels', () => {
  const snapshot = withRooms()
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['D3', ''], ['C4', ''], ['B2', '7:30-9:00 FRI']]))
  const faculty = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1')
  const suggestions = () => roomScheduleSuggestions(faculty.facultyAssignments, readRoomScheduleTemplate(snapshot, 'Rooms & Labs').entries, faculty.courses)
  assert.deepEqual(suggestions().map(item => item.code), ['ITE 083-1'])
  snapshot.cellTextOverrides.get('Rooms & Labs').set('B2', '7:30-9:00 WRONGDAY')
  const rooms = readRoomScheduleTemplate(snapshot, 'Rooms & Labs')
  assert.ok(rooms.issues.some(issue => issue.location === 'Rooms & Labs!C2' && issue.message.includes('invalid time/day')))
  assert.deepEqual(suggestions().map(item => item.code), ['ITE 083-1'])
  assert.ok(roomScheduleSuggestions(faculty.facultyAssignments, rooms.entries, faculty.courses, 'Rooms & Labs!C2').some(item => item.code === 'ITE 314-2'))
  snapshot.cellTextOverrides.get('Rooms & Labs').set('C2', '')
  assert.deepEqual(suggestions().map(item => item.code).sort(), ['ITE 083-1', 'ITE 314-2'])
  assert.ok(suggestions().find(item => item.code === 'ITE 314-2').schedules.some(schedule => schedule.includes('Thu 07:30–09:00')))
})

test('room formatting pads subject codes and retains sections without inventing one', () => {
  assert.equal(formatRoomSubject('ite31 g2'), 'ITE 031-2')
  assert.equal(formatRoomSubject(' ite 314 - 2 '), 'ITE 314-2')
  assert.equal(formatRoomSubject('ite31'), 'ITE 031')
  assert.equal(formatRoomSubject('X'), 'X')
})

test('room suggestions prioritize the day and time of the edited blank cell', () => {
  const snapshot = withRooms()
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['C2', ''], ['D3', ''], ['C4', '']]))
  const faculty = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1')
  const rooms = readRoomScheduleTemplate(snapshot, 'Rooms & Labs')
  const suggestions = address => roomScheduleSuggestions(faculty.facultyAssignments, rooms.entries, faculty.courses,
    `Rooms & Labs!${address}`, rooms.slots.get(address)).map(item => item.code)
  assert.deepEqual(suggestions('C4'), ['ITE 083-1', 'ITE 314-2'])
  assert.deepEqual(suggestions('C2'), ['ITE 314-2', 'ITE 083-1'])
  const ranked = roomScheduleSuggestions(faculty.facultyAssignments, rooms.entries, faculty.courses, 'Rooms & Labs!C2', rooms.slots.get('C2'))
  assert.equal(ranked[0].matchesRoomSlot, true)
  assert.equal(ranked[1].matchesRoomSlot, false)
  assert.equal(filterDepartmentCourses(ranked, 'ITE 314')[0].matchesRoomSlot, true)
})

test('assigning one meeting keeps the other times and days available for the same class', () => {
  const snapshot = withRooms()
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1')
  const faculty = preview.facultyAssignments.filter(meeting => meeting.code.replace(/\s/g, '') === 'ITE314').slice(0, 2)
  const entries = readRoomScheduleTemplate(snapshot, 'Rooms & Labs').entries.filter(entry => entry.code === 'ITE 314')
  const all = roomScheduleSuggestions([...faculty].reverse(), [], preview.courses)
  assert.equal(all[0].title, 'Advanced Database Systems')
  assert.equal(all[0].schedules.length, 2)
  assert.ok(all[0].schedules[0].includes('Thu 07:30–09:00'))
  assert.ok(all[0].schedules[1].includes('Thu 09:00–10:30'))
  const remaining = roomScheduleSuggestions(faculty, entries.slice(0, 1), preview.courses, undefined, { day: 'Thu', start: 540, end: 630 })
  assert.equal(remaining[0].code, 'ITE 314-2')
  assert.equal(remaining[0].matchesRoomSlot, true)
  assert.equal(remaining[0].schedules.length, 1)
  assert.ok(remaining[0].schedules[0].includes('Thu 09:00–10:30'))
  assert.deepEqual(roomScheduleSuggestions(faculty, entries, preview.courses), [])
  const otherDay = [{ ...faculty[0], day: 'Sat' }, faculty[1]]
  const saturday = roomScheduleSuggestions(otherDay, entries.slice(1), preview.courses, undefined, { day: 'Sat', start: 450, end: 540 })
  assert.equal(saturday[0].matchesRoomSlot, true)
  assert.ok(saturday[0].schedules[0].includes('Sat 07:30–09:00'))
})

test('assigning part of a longer faculty meeting keeps its remaining room interval available', () => {
  const snapshot = withRooms()
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1')
  const faculty = [{ ...preview.facultyAssignments[0], start: 450, end: 630 }]
  const entries = readRoomScheduleTemplate(snapshot, 'Rooms & Labs').entries.slice(0, 1)
  const remaining = roomScheduleSuggestions(faculty, entries, preview.courses, undefined, { day: 'Thu', start: 540, end: 630 })
  assert.equal(remaining[0].matchesRoomSlot, true)
  assert.ok(remaining[0].schedules[0].includes('Thu 09:00–10:30'))
})

function preparationHarness() {
  let reads = 0
  const context = { exports: {}, Map, require: name => {
    if (name === 'firebase/firestore') return { collection: (_db, path) => path, getDocs: async () => { reads++; return { docs: [] } } }
    if (name === '../firebase') return { db: {} }
    return loadTypeScript(resolve(root, `${name.split('/').at(-1)}.ts`))
  } }
  const source = readFileSync(new URL('../src/services/departmentScheduleRows.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText, context)
  return { prepare: snapshot => context.exports.prepareDepartmentScheduleRows(serializeFirestoreWorkbookState(snapshot), 'CITE', 'sem1'), reads: () => reads }
}

test('reads the supplied block layout, merged durations, sections, and contextual evening times', () => {
  const preview = readDepartmentTemplatePreview(fixture(), 'Faculty', 'CITE', 'sem1')
  assert.deepEqual(preview.issues.filter(i => i.severity === 'error'), [])
  assert.equal(preview.classes.length, 2)
  const flexible = preview.classes.find(item => item.course.code === 'ITE 314')
  assert.equal(flexible.course.yearLevel, 3)
  assert.equal(flexible.section, '2')
  assert.deepEqual(flexible.meetings, [
    { day: 'Thu', start: 450, end: 540, modality: 'F2F' },
    { day: 'Thu', start: 540, end: 630, modality: 'F2F' },
    { day: 'Thu', start: 810, end: 900, modality: 'Remote Coaching' },
    { day: 'Thu', start: 1140, end: 1170, modality: 'F2F' },
  ])
  assert.equal(preview.classes.find(item => item.course.code === 'ITE 083').section, '1')
})

test('faculty validation no longer reports missing sections or unknown courses', () => {
  const snapshot = fixture()
  snapshot.cellTextOverrides.set('Faculty', new Map([['G7', 'ITE 314'], ['G9', 'ITE 999-2']]))
  const issues = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1').issues
  assert.ok(!issues.some(issue => issue.location === 'Faculty!G7' && issue.message.includes('section is missing; add a section')))
  assert.ok(!issues.some(issue => issue.location === 'Faculty!G9' && issue.message.includes('no matching course')))
  assert.ok(!issues.some(issue => issue.location === 'Faculty!G9' && issue.message.includes('section is missing; add a section')))
})

test('faculty validation no longer caps weekly subject-section hours at three', () => {
  const snapshot = fixture()
  const issues = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1').issues
  const overLimit = issues.filter(issue => issue.message.includes('maximum is 3 hours'))
  assert.equal(overLimit.length, 0)

  snapshot.cellTextOverrides.set('Faculty', new Map([['G16', ''], ['G19', '']]))
  assert.ok(!readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1').issues.some(issue => issue.message.includes('maximum is 3 hours')))
})

test('generates Flexible/Open Lab without guessing program, contact hours, room or lecture/lab split', () => {
  const rows = extractDepartmentTemplateRows(fixture(), directory, 'sem1')
  const flexible = rows.find(row => row.subjectCode === 'ITE 314')
  assert.ok(flexible.meetings.every(m => m.format === 'Flexible' && m.instructorId === 'faculty-1' && m.roomId === ''))
  assert.equal(flexible.credits, 3)
  assert.deepEqual(flexible.meetings.slice(0, 2).map(m => m.time), ['07:30-09:00', '09:00-10:30'])
  assert.deepEqual(flexible.f2fRoom.flexible.slice(0, 2), ['TBA', 'TBA'])
  assert.ok(rows.every(row => !Object.hasOwn(row, 'units')))
  assert.equal(flexible.hours.total, null)
  assert.equal(flexible.course, '')
  assert.equal(flexible.status, 'Draft')
  assert.equal(rows.find(row => row.subjectCode === 'ITE 083').meetings[0].format, 'Lec')
})

test('optional room sheet assigns adjacent class meetings to different existing rooms', () => {
  const snapshot = withRooms()
  assert.equal(findDepartmentTemplateSheets(snapshot).roomsSheet, 'Rooms & Labs')
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  const flexible = preview.classes.find(item => item.course.code === 'ITE 314')
  assert.deepEqual(flexible.meetings.slice(0, 2).map(meeting => meeting.room), ['PTC 303', 'PTC 304'])
  const row = extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1').find(item => item.subjectCode === 'ITE 314')
  assert.deepEqual(row.meetings.slice(0, 2).map(meeting => meeting.roomId), ['room-303', 'room-304'])
  assert.deepEqual(row.f2fRoom.flexible.slice(0, 2), ['PTC 303', 'PTC 304'])
  assert.equal(row.status, 'Plot')
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['D3', '']]))
  assert.deepEqual(extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1').find(item => item.subjectCode === 'ITE 314').meetings.slice(0, 2).map(meeting => meeting.room), ['PTC 303', 'TBA'])
})

test('unmarked room table is recognized; ambiguous or unknown room assignments stay unplotted', () => {
  const snapshot = withRooms()
  delete snapshot.workbook.Sheets['Rooms & Labs'][DEPARTMENT_TEMPLATE_KEY]
  assert.equal(findDepartmentTemplateSheets(snapshot).roomsSheet, 'Rooms & Labs')
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['D2', 'ITE 314-2'], ['C2', 'ITE 314-2']]))
  const preview = readDepartmentTemplatePreview(snapshot, 'Faculty', 'CITE', 'sem1', 'Rooms & Labs')
  assert.ok(preview.issues.some(issue => issue.message.includes('Conflicting room entries')))
  assert.equal(preview.classes.find(item => item.course.code === 'ITE 314').meetings[0].room, undefined)
  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['C1', 'UNKNOWN 999']]))
  const row = extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1').find(item => item.subjectCode === 'ITE 314')
  assert.equal(row.meetings[0].room, 'UNKNOWN 999')
  assert.equal(row.meetings[0].roomId, '')
  assert.equal(row.status, 'Plot')
  assert.ok(row.validationIssues.some(issue => issue.includes('could not be matched uniquely')))
})

test('room templates retain Plot with partial assignments and return to Draft when all rooms are removed', () => {
  const snapshot = withRooms()
  snapshot.cellTextOverrides.set('Faculty', new Map([['G19', '']]))
  const rows = extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1')
  assert.ok(rows.every(row => row.status === 'Plot'))
  assert.ok(rows.every(row => !row.validationIssues.includes('Room allocation is pending.')))
  const flexible = rows.find(row => row.subjectCode === 'ITE 314')
  assert.ok(flexible.meetings.some(meeting => meeting.modality === 'Remote Coaching' && !meeting.roomId))

  snapshot.cellTextOverrides.set('Rooms & Labs', new Map([['D3', '']]))
  const updated = extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1')
  assert.equal(updated.find(row => row.subjectCode === 'ITE 314').status, 'Plot')
  assert.ok(updated.find(row => row.subjectCode === 'ITE 314').validationIssues.includes('Room allocation is pending.'))
  assert.equal(updated.find(row => row.subjectCode === 'ITE 083').status, 'Plot')
  snapshot.cellTextOverrides.get('Rooms & Labs').set('C2', '')
  assert.equal(extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1').find(row => row.subjectCode === 'ITE 314').status, 'Draft')
})

test('two room slots split a single three-hour faculty cell into independently assignable meetings', () => {
  const snapshot = withRooms()
  delete snapshot.workbook.Sheets.Faculty.G9
  snapshot.workbook.Sheets.Faculty['!merges'] = snapshot.workbook.Sheets.Faculty['!merges']
    .filter(merge => XLSX.utils.encode_range(merge) !== 'G7:G8' && XLSX.utils.encode_range(merge) !== 'G9:G10')
  snapshot.workbook.Sheets.Faculty['!merges'].push(XLSX.utils.decode_range('G7:G10'))
  const row = extractDepartmentTemplateRows(snapshot, roomDirectory, 'sem1').find(item => item.subjectCode === 'ITE 314')
  assert.deepEqual(row.meetings.slice(0, 2).map(meeting => [meeting.time, meeting.roomId]), [
    ['07:30-09:00', 'room-303'], ['09:00-10:30', 'room-304'],
  ])
})

test('current cell edits regenerate schedules and unresolved faculty never receive guessed IDs', () => {
  const snapshot = fixture()
  const original = extractDepartmentTemplateRows(snapshot, directory, 'sem1')
  snapshot.cellTextOverrides.set('Faculty', new Map([['E5', 'Unregistered, Teacher'], ['G7', 'ITE314-3'], ['G9', 'ITE314-3'], ['G16', 'ITE314-3'], ['G19', 'ITE314-3']]))
  const rows = extractDepartmentTemplateRows(snapshot, directory, 'sem1')
  const changed = rows.find(row => row.subjectCode === 'ITE 314')
  assert.equal(changed.classSection, '3')
  assert.ok(changed.meetings.every(m => m.instructorId === ''))
  assert.notEqual(changed.sourceKey, original[0].sourceKey)
  assert.ok(changed.validationIssues.some(i => i.includes('could not be matched uniquely')))
})

test('Save reflects added assignments and course edits from the current workbook', async () => {
  const snapshot = fixture()
  const h = preparationHarness()
  snapshot.cellTextOverrides.set('CITE', new Map([
    ['D3', 'Advanced Database Systems II'], ['F3', '4'],
    ['A5', 'SY 25-26 SEM I'], ['B5', 'Y1S1'], ['C5', 'ITE 101'],
    ['D5', 'New Course'], ['E5', 'Lecture'], ['F5', '2'],
  ]))
  snapshot.cellTextOverrides.set('Faculty', new Map([['H13', 'ITE101-1']]))
  const rows = await h.prepare(snapshot)
  assert.equal(rows.length, 3)
  assert.equal(rows.find(row => row.subjectCode === 'ITE 314').subjectTitle, 'Advanced Database Systems II')
  assert.equal(rows.find(row => row.subjectCode === 'ITE 314').credits, 4)
  assert.equal(rows.find(row => row.subjectCode === 'ITE 101').classSection, '1')
})

test('Save removes classes deleted from the faculty sheet, including the last class', async () => {
  const snapshot = fixture()
  const h = preparationHarness()
  snapshot.cellTextOverrides.set('Faculty', new Map([['G7', ''], ['G9', ''], ['G16', ''], ['G19', '']]))
  assert.equal((await h.prepare(snapshot)).map(row => row.subjectCode).join(','), 'ITE 083')
  snapshot.cellTextOverrides.get('Faculty').set('H11', '')
  assert.equal((await h.prepare(snapshot)).length, 0)
})

test('Save removes schedules whose course was deleted while keeping other classes', async () => {
  const snapshot = fixture()
  const h = preparationHarness()
  snapshot.cellTextOverrides.set('CITE', new Map(['A3', 'B3', 'C3', 'D3', 'E3', 'F3'].map(address => [address, ''])))
  assert.equal((await h.prepare(snapshot)).map(row => row.subjectCode).join(','), 'ITE 083')
  for (const address of ['A4', 'B4', 'C4', 'D4', 'E4', 'F4']) snapshot.cellTextOverrides.get('CITE').set(address, '')
  assert.equal((await h.prepare(snapshot)).length, 0)
})

test('existing unmarked template sheets generate classes after reopening instead of silently saving zero', () => {
  const snapshot = fixture()
  for (const name of snapshot.workbook.SheetNames) delete snapshot.workbook.Sheets[name][DEPARTMENT_TEMPLATE_KEY]
  const state = serializeFirestoreWorkbookState(snapshot)
  const parts = splitFirestoreWorkbookState(state)
  const restored = loadTypeScript(resolve(root, 'excelWorkbookState.ts')).deserializeWorkbookState(joinFirestoreWorkbookState(parts.manifest, parts.sheets), {})
  const rows = extractDepartmentTemplateRows(restored, directory, 'sem1')
  assert.equal(rows.length, 2)
  assert.equal(rows.find(row => row.subjectCode === 'ITE 314').credits, 3)
})

test('Save preparation recognizes earlier imports before its old zero-class early return', async () => {
  const snapshot = fixture()
  for (const name of snapshot.workbook.SheetNames) delete snapshot.workbook.Sheets[name][DEPARTMENT_TEMPLATE_KEY]
  const h = preparationHarness()
  const rows = await h.prepare(snapshot)
  assert.equal(rows.length, 2)
  assert.equal(h.reads(), 3)
  assert.ok(rows.every(row => row.meetings.length && row.sourceKey && row.status === 'Draft'))
})

test('Save blocks populated unrecognized or incomplete templates before reading directories', async () => {
  const h = preparationHarness()
  const unrelated = emptyTemplateSnapshot()
  unrelated.workbook = { SheetNames: ['Old import'], Sheets: { 'Old import': XLSX.utils.aoa_to_sheet([['Subject', 'Faculty'], ['ITE314-2', 'Example, Teacher']]) } }
  unrelated.selectedSheet = 'Old import'
  await assert.rejects(h.prepare(unrelated), /No classes were recognized/)
  const incomplete = fixture()
  for (const name of incomplete.workbook.SheetNames) delete incomplete.workbook.Sheets[name][DEPARTMENT_TEMPLATE_KEY]
  incomplete.workbook.SheetNames = ['Faculty']
  delete incomplete.workbook.Sheets.CITE
  await assert.rejects(h.prepare(incomplete), /together before saving/)
  assert.equal(h.reads(), 0)
})

test('Save does not guess between multiple old templates and still permits intentional empty saves', async () => {
  const snapshot = fixture()
  for (const name of snapshot.workbook.SheetNames) delete snapshot.workbook.Sheets[name][DEPARTMENT_TEMPLATE_KEY]
  snapshot.workbook.SheetNames.push('Other courses')
  snapshot.workbook.Sheets['Other courses'] = { ...snapshot.workbook.Sheets.CITE }
  const h = preparationHarness()
  await assert.rejects(h.prepare(snapshot), /Multiple matching sheets/)
  assert.equal((await h.prepare(emptyTemplateSnapshot())).length, 0)
  assert.equal(h.reads(), 0)
})

test('unmatched courses are skipped, while ambiguous sources and invalid times block saves', () => {
  const unknown = fixture()
  unknown.cellTextOverrides.set('Faculty', new Map([['G7', 'ITE999-1']]))
  assert.ok(!readDepartmentTemplatePreview(unknown, 'Faculty', 'CITE', 'sem1').issues.some(i => i.severity === 'warning' && i.message.includes('no matching course')))
  assert.equal(extractDepartmentTemplateRows(unknown, directory, 'sem1').length, 2)
  const duplicate = fixture()
  XLSX.utils.sheet_add_aoa(duplicate.workbook.Sheets.CITE, [['-', 'Y4S1', 'ITE314', 'Other title', 'Lecture', 3]], { origin: 'A5' })
  assert.throws(() => extractDepartmentTemplateRows(duplicate, directory, 'sem1'), /ambiguous/)
  const missing = fixture()
  delete missing.workbook.Sheets.CITE[DEPARTMENT_TEMPLATE_KEY]
  assert.throws(() => extractDepartmentTemplateRows(missing, directory, 'sem1'), /together/)
  const invalid = fixture()
  invalid.cellTextOverrides.set('Faculty', new Map([['E8', 'BREAK']]))
  assert.throws(() => extractDepartmentTemplateRows(invalid, directory, 'sem1'), /time rows/)
})

test('source identities distinguish different instructor blocks with assignments on the same row', () => {
  const snapshot = fixture()
  XLSX.utils.sheet_add_aoa(snapshot.workbook.Sheets.Faculty, [['Other, Teacher'], ['SHIFT, AM', 'TUE', 'THU'], ['7:30-8:00', '', 'ITE314-2'], ['8:00-9:00']], { origin: 'L5' })
  snapshot.workbook.Sheets.Faculty['!merges'].push(XLSX.utils.decode_range('N7:N8'))
  const rows = extractDepartmentTemplateRows(snapshot, directory, 'sem1').filter(row => row.subjectCode === 'ITE 314')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].sourceRow, rows[1].sourceRow)
  assert.notEqual(rows[0].sourceKey, rows[1].sourceKey)
})

test('weekday typos cannot silently discard assignments, and unspecified types are preserved', () => {
  const invalid = fixture()
  invalid.cellTextOverrides.set('Faculty', new Map([['H6', 'FRIX']]))
  assert.throws(() => extractDepartmentTemplateRows(invalid, directory, 'sem1'), /outside a recognized/)
  const unspecified = fixture()
  unspecified.cellTextOverrides.set('CITE', new Map([['E3', '-']]))
  const row = extractDepartmentTemplateRows(unspecified, directory, 'sem1').find(row => row.subjectCode === 'ITE 314')
  assert.ok(row.meetings.every(m => m.format === 'Unspecified'))
  assert.equal(row.subjectType, '-')
  assert.equal(row.credits, 3)
  assert.deepEqual(row.faculty.unspecified, ['Example, Teacher'])
})

test('faculty matching accepts NEW annotations and refuses ambiguous directory entries', () => {
  const snapshot = fixture()
  snapshot.cellTextOverrides.set('Faculty', new Map([['E5', 'EXAMPLE, TEACHER (NEW)']]))
  assert.equal(extractDepartmentTemplateRows(snapshot, directory, 'sem1')[0].meetings[0].instructorId, 'faculty-1')
  const ambiguous = { ...directory, faculty: [...directory.faculty, { ...directory.faculty[0], id: 'faculty-2' }] }
  assert.equal(extractDepartmentTemplateRows(snapshot, ambiguous, 'sem1')[0].meetings[0].instructorId, '')
})

test('template credits retain zero and leave missing or invalid values null without legacy units', () => {
  for (const [value, expected] of [['0', 0], ['', null], ['-', null], ['invalid', null]]) {
    const snapshot = fixture()
    snapshot.cellTextOverrides.set('CITE', new Map([['F3', value]]))
    const row = extractDepartmentTemplateRows(snapshot, directory, 'sem1').find(row => row.subjectCode === 'ITE 314')
    assert.equal(row.credits, expected)
    assert.ok(!Object.hasOwn(row, 'units'))
  }
})

test('reimport replaces only marked templates, preserves layouts, and survives Firestore round trips', () => {
  const original = fixture()
  original.workbook.SheetNames.push('Notes')
  original.workbook.Sheets.Notes = XLSX.utils.aoa_to_sheet([['Keep this sheet']])
  const incomingSnapshot = fixture()
  incomingSnapshot.workbook.Sheets.Faculty['!cols'] = [{ wch: 7 }, { wch: 23 }]
  incomingSnapshot.workbook.Sheets.Faculty['!rows'] = [{ hpt: 29 }]
  const incoming = { workbook: incomingSnapshot.workbook, styles: incomingSnapshot.previewStyles, formatting: incomingSnapshot.formattingOverrides,
    sheetNames: ['Faculty', 'CITE'], id: 'test', replaceDepartmentTemplates: true }
  const { snapshot } = appendImportedSheets(original, incoming)
  assert.deepEqual(snapshot.workbook.SheetNames, ['Notes', 'Faculty', 'CITE'])
  assert.equal(snapshot.workbook.Sheets.Notes.A1.v, 'Keep this sheet')
  assert.deepEqual(snapshot.workbook.Sheets.Faculty['!cols'], incomingSnapshot.workbook.Sheets.Faculty['!cols'])
  assert.deepEqual(snapshot.workbook.Sheets.Faculty['!rows'], incomingSnapshot.workbook.Sheets.Faculty['!rows'])
  assert.deepEqual(snapshot.workbook.Sheets.Faculty['!merges'], incomingSnapshot.workbook.Sheets.Faculty['!merges'])
  const state = serializeFirestoreWorkbookState(snapshot)
  const parts = splitFirestoreWorkbookState(state)
  const restored = loadTypeScript(resolve(root, 'excelWorkbookState.ts')).deserializeWorkbookState(joinFirestoreWorkbookState(parts.manifest, parts.sheets), {})
  assert.deepEqual(extractDepartmentTemplateRows(restored, directory, 'sem1'), extractDepartmentTemplateRows(snapshot, directory, 'sem1'))
})

test('uploading Rooms & Labs alone preserves previously edited faculty and course sheets', () => {
  const current = withRooms()
  current.cellTextOverrides.set('CITE', new Map([['D3', 'Edited course title']]))
  current.cellTextOverrides.set('Faculty', new Map([['E5', 'Edited, Teacher']]))
  const roomSource = withRooms()
  roomSource.workbook.Sheets['Rooms & Labs'].C2.v = 'ITE 314-3'
  const incoming = { workbook: { SheetNames: ['Rooms & Labs'], Sheets: { 'Rooms & Labs': roomSource.workbook.Sheets['Rooms & Labs'] } },
    styles: roomSource.previewStyles, formatting: new Map([['Rooms & Labs', roomSource.formattingOverrides.get('Rooms & Labs')]]),
    sheetNames: ['Rooms & Labs'], id: 'room-only', replaceDepartmentRooms: true }
  const { snapshot } = appendImportedSheets(current, incoming)
  assert.deepEqual(snapshot.workbook.SheetNames, ['Faculty', 'CITE', 'Rooms & Labs'])
  assert.equal(snapshot.cellTextOverrides.get('CITE').get('D3'), 'Edited course title')
  assert.equal(snapshot.cellTextOverrides.get('Faculty').get('E5'), 'Edited, Teacher')
  assert.equal(snapshot.workbook.Sheets['Rooms & Labs'].C2.v, 'ITE 314-3')
  assert.equal(findDepartmentTemplateSheets(snapshot).roomsSheet, 'Rooms & Labs')
  const state = serializeFirestoreWorkbookState(snapshot)
  const parts = splitFirestoreWorkbookState(state)
  const restored = loadTypeScript(resolve(root, 'excelWorkbookState.ts')).deserializeWorkbookState(joinFirestoreWorkbookState(parts.manifest, parts.sheets), {})
  assert.equal(restored.cellTextOverrides.get('CITE').get('D3'), 'Edited course title')
  assert.equal(findDepartmentTemplateSheets(restored).roomsSheet, 'Rooms & Labs')
})
