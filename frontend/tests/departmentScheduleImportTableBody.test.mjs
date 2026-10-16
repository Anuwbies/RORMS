import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const modules = new Map()
const root = fileURLToPath(new URL('../src/', import.meta.url))
const portalTargets = []
const tooltipBody = { id: 'body' }
function load(file) {
  if (modules.has(file)) return modules.get(file)
  const exports = {}
  modules.set(file, exports)
  const context = { exports, document: { body: tooltipBody }, require: name => name === 'react-dom'
    ? { createPortal: (content, target) => { portalTargets.push(target); return content } }
    : name.startsWith('.') ? load(resolve(dirname(file), /\.tsx?$/.test(name) ? name : existsSync(resolve(dirname(file), `${name}.ts`)) ? `${name}.ts` : `${name}.tsx`)) : require(name) }
  vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context)
  return exports
}
const { DepartmentScheduleImportTableBody } = load(resolve(root, 'components/DepartmentScheduleImportTableBody.tsx'))
const { createEmptyDepartmentScheduleSheet } = load(resolve(root, 'utils/departmentScheduleImport.ts'))
const { filterScheduleEditableChanges, indexScheduleRows } = load(resolve(root, 'utils/departmentScheduleEdits.ts'))
const { facultyScheduleRowKey, validateFacultyScheduleAssignments } = load(resolve(root, 'utils/ScheduleValidation.ts'))
const { recommendParallelRoomGroups } = load(resolve(root, 'utils/scheduleRoomRecommendations.ts'))
const actions = Object.fromEntries(['startSelection', 'moveSelection', 'endSelection', 'focusCell', 'beginEditing', 'updateCell', 'finishEditing', 'renameYear'].map(name => [name, () => {}]))
function table(rowIssues, selection = null) {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values[2] = 'ITE 101'
  return renderToStaticMarkup(createElement('table', null, createElement(DepartmentScheduleImportTableBody, {
    rows: sheet.rows, yearSections: sheet.yearSections, sheetIndex: 0, selection, actions,
    columnLabels: Array(21).fill('Column'), hasSheet: true, rowIssues,
  })))
}

test('only invalid schedule rows are red; their cells and row counter expose all issues', () => {
  const issue = 'Room Missing Room does not exist in the rooms collection.'
  const html = table(new Map([[3, [issue, 'Duplicate Subject on section 1.']]]))
  assert.match(html, /data-row-index="0" aria-invalid="true" class="bg-rose-100 text-rose-900/)
  assert.match(html, /aria-label="Select row 1\. Room Missing Room/)
  assert.match(html, /aria-label="Column, row 1\. Room Missing Room/)
  assert.equal((html.match(/bg-rose-100 text-rose-900/g) ?? []).length, 1)
  assert.match(html, /data-row-index="1" class="bg-slate-50/)
})

test('fixing a row removes red styling and keeps the existing full-value titles', () => {
  const html = table(new Map())
  assert.ok(!html.includes('bg-rose-100') && !html.includes('aria-invalid="true"'))
  assert.match(html, /title="ITE 101"/)
})

test('parallel continuation rows can edit their own Lec faculty, time, day and room', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  for (let index = 0; index < 4; index++) {
    sheet.rows[index].values[0] = index === 0 ? 'PARALLEL' : ''
    sheet.rows[index].values[2] = 'ITE 083'
    sheet.rows[index].values[3] = 'Project Management'
    sheet.rows[index].values[4] = 'BSIT'
    sheet.rows[index].values[19] = `PTC ${403 + index}`
  }
  sheet.rows[4].values[2] = 'ITE 292'
  sheet.rows[10].values[2] = 'ITE 083'
  sheet.rows[10].values[3] = 'Project Management'
  const changes = [0, 1, 2, 3, 4, 10].flatMap(index => [13, 15, 17, 19, 20].map(column => ({
    cell: { sheet: 0, row: sheet.rows[index].rowNumber, column }, value: 'Edited',
  })))
  const allowed = filterScheduleEditableChanges([sheet], indexScheduleRows([sheet]), changes)
  assert.deepEqual(allowed.map(({ cell }) => [cell.row, cell.column]),
    [0, 1, 2, 3].flatMap(index => [13, 15, 17, 19].map(column => [sheet.rows[index].rowNumber, column])))
  const html = renderToStaticMarkup(createElement('table', null, createElement(DepartmentScheduleImportTableBody, {
    rows: sheet.rows, yearSections: sheet.yearSections, sheetIndex: 0, selection: null, actions,
    columnLabels: Array(21).fill('Column'), hasSheet: true,
  })))
  for (let index = 1; index < 4; index++) for (const column of [13, 15, 17, 19]) {
    const tag = html.match(new RegExp(`<td[^>]*data-edit-cell="0:${sheet.rows[index].rowNumber}:${column}"[^>]*>`))?.[0]
    assert.ok(tag && !tag.includes('aria-readonly'), `row ${index + 1}, column ${column}`)
  }
})

test('parallel rows without repeated Section values do not conflict with their shared instructor', () => {
  const assignments = [403, 404, 405, 406].map((room, index) => ({
    location: `row-${index}`, rowKey: `row-${index}`, parallelGroup: 'row-0', code: 'ITE 083', section: '',
    faculty: 'Narvasa, Jan Julienne', instructorId: 'instructor', room: `PTC ${room}`,
    meetingKind: 'Lec', start: 900, end: 1080, days: ['Wed'],
  }))
  assert.deepEqual([...validateFacultyScheduleAssignments(assignments)].filter(issue => issue.message.includes('also assigned')), [])
  assignments[1].section = '5'
  assignments[2].section = '5'
  assert.ok(validateFacultyScheduleAssignments(assignments).some(issue => issue.message.includes('also assigned')))
})

test('Status renders as a selectable read-only grid cell and rejects workbook edits', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.rows[0].values[2] = 'ITE 083'
  const html = renderToStaticMarkup(createElement('table', null, createElement(DepartmentScheduleImportTableBody, {
    rows: sheet.rows, yearSections: sheet.yearSections, sheetIndex: 0,
    selection: { sheet: 0, column: 21, anchor: 0, end: 0 }, actions,
    columnLabels: Array(21).fill('Column'), hasSheet: true, statusesReady: true,
    sheetName: sheet.name, rowStatuses: new Map([[facultyScheduleRowKey(sheet.name, sheet.rows[0].rowNumber), 'Plot']]),
  })))
  const tag = html.match(new RegExp(`<td[^>]*data-edit-cell="0:${sheet.rows[0].rowNumber}:21"[^>]*>`))?.[0]
  assert.ok(tag?.includes('aria-readonly="true"') && tag.includes('aria-selected="true"'))
  assert.ok(tag.includes('border-slate-300') && html.includes('>Plot</span></td>'))
  const changes = [{ cell: { sheet: 0, row: sheet.rows[0].rowNumber, column: 21 }, value: 'Edited' }]
  assert.deepEqual(filterScheduleEditableChanges([sheet], indexScheduleRows([sheet]), changes), [])
})

test('four-room parallel recommendations fill distinct connected rooms and avoid other schedules', () => {
  const assignments = Array.from({ length: 4 }, (_, index) => ({
    location: `row-${index}`, rowKey: `row-${index}`, parallelGroup: 'row-0', code: 'ITE 083', section: String(index + 1),
    faculty: 'Narvasa, Jan Julienne', instructorId: 'instructor', room: '', roomColumn: 19, roomEntryIndex: 0,
    meetingKind: 'Lec', start: 450, end: 540, days: ['Wed'],
  }))
  const rooms = Array.from({ length: 8 }, (_, index) => ({
    id: `room-${index}`, code: `PTC ${401 + index}`, name: `PTC ${401 + index}`, buildingId: 'PTC', floor: 4,
  }))
  const available = recommendParallelRoomGroups(assignments, rooms, 'row-2', 19, 0)
  assert.ok(available.length > 0)
  assert.deepEqual(Array.from(available[0].rooms, entry => entry.room), ['PTC 401', 'PTC 402', 'PTC 403', 'PTC 404'])
  assert.deepEqual(Array.from(available[0].rooms, entry => entry.rowKey), assignments.map(assignment => assignment.rowKey))
  const occupied = [{ ...assignments[0], rowKey: 'outside', parallelGroup: undefined, room: 'PTC 402', roomId: 'room-1' }]
  assert.ok(recommendParallelRoomGroups(assignments, rooms, 'row-2', 19, 0, occupied)
    .every(option => option.rooms.every(entry => entry.room !== 'PTC 402')))
  assert.ok(recommendParallelRoomGroups(assignments.slice(0, 3), rooms, 'row-2', 19, 0)
    .every(option => option.rooms.length === 3))
  rooms[1].status = 'Maintenance'
  rooms[6].status = 'Unavailable'
  const safe = recommendParallelRoomGroups(assignments, rooms, 'row-2', 19, 0)
  assert.ok(safe.length > 0)
  assert.ok(safe.every(option => option.rooms.every(entry => entry.room !== 'PTC 402' && entry.room !== 'PTC 407')))
})

test('partial parallel room assignments warn on all four rows until every room is assigned', () => {
  const rooms = Array.from({ length: 4 }, (_, index) => ({
    id: `room-${index}`, code: `PTC ${401 + index}`, name: `Room ${401 + index}`, buildingId: 'PTC', floor: 4,
  }))
  const assignments = rooms.map((room, index) => ({
    location: `row-${index}`, rowKey: `row-${index}`, parallelGroup: 'row-0', code: 'ITE 083', section: String(index + 1),
    faculty: 'Teacher', instructorId: 'teacher', room: index === 0 ? room.code : 'TBA',
    roomId: index === 0 ? room.id : '', roomColumn: 19, roomEntryIndex: 0,
    meetingKind: 'Lec', start: 450, end: 540, days: ['Wed'],
  }))
  const messages = entries => validateFacultyScheduleAssignments(entries, [], rooms).map(issue => issue.message)
  assert.equal(messages(assignments).filter(message => message.includes('1 of 4 rooms assigned')).length, 4)
  assert.equal(messages(assignments.map(item => ({ ...item, room: 'TBA', roomId: '' }))).length, 0)
  assert.equal(messages(assignments.map((item, index) => ({ ...item, room: rooms[index].name, roomId: rooms[index].id }))).length, 0)
  const unknown = assignments.map((item, index) => ({ ...item, room: index === 3 ? 'Unknown room' : rooms[index].name,
    roomId: index === 3 ? '' : rooms[index].id }))
  assert.equal(messages(unknown).filter(message => message.includes('3 of 4 rooms assigned')).length, 4)
})

test('selected unavailable and maintenance rooms report their status', () => {
  const rooms = [
    { id: 'unavailable', code: 'PTC 401', name: 'PTC Room 401', buildingId: 'PTC', status: 'Unavailable' },
    { id: 'maintenance', code: 'PTC 402', name: 'PTC Room 402', buildingId: 'PTC', status: 'Maintenance' },
    { id: 'available', code: 'PTC 403', name: 'PTC Room 403', buildingId: 'PTC', status: 'Available' },
  ]
  const assignments = rooms.map((room, index) => ({
    location: `row-${index}`, rowKey: `row-${index}`, code: 'ITE 101', section: String(index + 1),
    room: room.code, roomId: room.id, roomColumn: 19, roomEntryIndex: 0,
    start: 450, end: 540, days: ['Mon'],
  }))
  const messages = validateFacultyScheduleAssignments(assignments, [], rooms).map(issue => issue.message)
  assert.ok(messages.includes('Room PTC Room 401 is unavailable. Choose an available room.'))
  assert.ok(messages.includes('Room PTC Room 402 is under maintenance. Choose an available room.'))
  assert.ok(!messages.some(message => message.includes('PTC Room 403')))
})

test('duplicate-only rows and their tooltip use purple', () => {
  const message = 'Duplicate Subject ITE 101 for Section 1 · Row 2.'
  const html = table(new Map([[3, [message]]]))
  assert.match(html, /data-row-index="0" aria-invalid="true" class="bg-purple-100 text-purple-900/)
  assert.ok(!html.includes('bg-rose-100'))
  const { ExcelValidationTooltip } = load(resolve(root, 'components/ExcelValidationTooltip.tsx'))
  const tooltip = renderToStaticMarkup(createElement(ExcelValidationTooltip, {
    anchor: { left: 10, right: 100, top: 100, bottom: 140 }, tone: 'purple', messages: [message],
  }))
  assert.match(tooltip, /bg-purple-950/)
  assert.ok(tooltip.includes(message))
  assert.equal((tooltip.match(/>•<\/span>/g) ?? []).length, 1)
})

test('invalid rows keep selection outlines and the existing year label styling', () => {
  const html = table(new Map([[3, ['Instructor has overlapping time and day.']]]), { sheet: 0, column: -1, anchor: 0, end: 0 })
  assert.match(html, /bg-rose-100 text-rose-900/)
  assert.match(html, /after:border-t-2 after:border-b-2/)
  assert.match(html, /bg-\[#e3edda\]/)
  assert.match(html, /data-row-counter[^>]*aria-selected="true"/)
  assert.match(html, /data-row-counter[^>]*class="sticky left-\[var\(--schedule-year-width,3rem\)\] z-\[4\]/)
})

test('the red validation tooltip stays in its modal and displays every issue', () => {
  const { ExcelValidationTooltip } = load(resolve(root, 'components/ExcelValidationTooltip.tsx'))
  const dialog = { id: 'schedule-dialog' }
  const html = renderToStaticMarkup(createElement(ExcelValidationTooltip, {
    anchor: { left: 10, right: 100, top: 100, bottom: 140 }, portalTarget: dialog, tone: 'danger',
    messages: ['Instructor overlaps on Monday.', 'Room does not exist.'],
  }))
  assert.equal(portalTargets.at(-1), dialog)
  assert.match(html, /role="tooltip"/)
  assert.match(html, /bg-rose-950/)
  assert.match(html, /max-w-\[90vw\]/)
  assert.ok(html.includes('Instructor overlaps on Monday.') && html.includes('Room does not exist.'))
})

test('existing tooltip callers still use the document body by default', () => {
  const { ExcelValidationTooltip } = load(resolve(root, 'components/ExcelValidationTooltip.tsx'))
  renderToStaticMarkup(createElement(ExcelValidationTooltip, {
    anchor: { left: 10, right: 100, top: 100, bottom: 140 }, messages: ['Existing validation.'],
  }))
  assert.equal(portalTargets.at(-1), tooltipBody)
})

test('room dropdown recommendations are labeled without changing room names or option selection', () => {
  const { ExcelFacultySuggestions } = load(resolve(root, 'components/ExcelFacultySuggestions.tsx'))
  const html = renderToStaticMarkup(createElement(ExcelFacultySuggestions, {
    id: 'rooms', anchor: { current: null }, names: ['BE 201', 'BE 202'], recommendedNames: ['BE 201'],
    loading: false, activeIndex: 0, onSelect: () => {}, label: 'System rooms', matchAnchorWidth: true,
  }))
  assert.match(html, /role="listbox" aria-label="System rooms"/)
  assert.equal((html.match(/>Recommended<\/span>/g) ?? []).length, 1)
  assert.match(html, /aria-selected="true"[^>]*>BE 201<span/)
  assert.match(html, />BE 202<\/button>/)
})

test('the time dropdown can show an empty recommendation status alongside the manual TBA option', () => {
  const { ExcelFacultySuggestions } = load(resolve(root, 'components/ExcelFacultySuggestions.tsx'))
  const html = renderToStaticMarkup(createElement(ExcelFacultySuggestions, {
    id: 'times', anchor: { current: null }, names: ['TBA'], recommendedNames: [], statusMessage: 'No recommendations available.',
    loading: false, activeIndex: -1, onSelect: () => {}, label: 'Time options', matchAnchorWidth: true,
  }))
  assert.match(html, /role="status"[^>]*>No recommendations available\.<\/p>/)
  assert.match(html, /role="option"[^>]*>TBA<\/button>/)
  assert.ok(!html.includes('>Recommended</span>'))
})
