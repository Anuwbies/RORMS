import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentCourseSheet } from '../src/utils/departmentCourseImport.ts'
import { canEditDepartmentCourses, decodeDepartmentCoursesWorkbook, departmentCourseBatchRanges, departmentCourseDocuments,
  encodeDepartmentCoursesWorkbook, type DepartmentCoursesWorkbookState } from '../src/utils/departmentCoursesWorkbookState.ts'

function workbook(): DepartmentCoursesWorkbookState {
  return { sheets: [createEmptyDepartmentCourseSheet()], selectedSheet: 0, columnWidths: [40, 100, 100, 100, 300, 100, 60] }
}

test('compressed courses workbook restores all blank rows, sheets, widths, and source row IDs', async () => {
  const state = workbook()
  state.sheets.push({ ...createEmptyDepartmentCourseSheet(), name: 'Another sheet' })
  state.selectedSheet = 1
  state.sheets[1].rows[0] = { rowNumber: 501, values: [' 1 ', '1st', 'ITE 101', '日本語\nTitle', 'Lecture', '3.00'] }
  const encoded = await encodeDepartmentCoursesWorkbook(state)
  const loaded = await decodeDepartmentCoursesWorkbook(encoded.data, encoded.jsonByteLength)
  assert.deepEqual({ sheets: loaded.sheets, selectedSheet: loaded.selectedSheet, columnWidths: loaded.columnWidths }, state)
  assert.equal(loaded.sheets[0].rows.length, 50)
})

test('course documents include populated rows from every sheet, with original values and source identity', () => {
  const state = workbook()
  state.sheets[0].rows[0].values = ['1', '2nd', 'ITE 101', ' Computing ', 'Lecture and Laboratory', '3.00']
  state.sheets[0].rows[1].values[0] = '   '
  state.sheets.push({ name: 'Second', headerRow: 1, rows: [{ rowNumber: 42, values: ['', '', 'ABC', '', '', ''] }] })
  assert.deepEqual(departmentCourseDocuments(state), [
    { sheetName: 'Courses', rowNumber: 2, session: '1', semester: '2nd', code: 'ITE 101', course: ' Computing ', type: 'Lecture and Laboratory', credits: '3.00' },
    { sheetName: 'Second', rowNumber: 42, session: '', semester: '', code: 'ABC', course: '', type: '', credits: '' },
  ])
  state.sheets[0].rows[0].values.fill('')
  state.sheets.pop()
  assert.deepEqual(departmentCourseDocuments(state), [])
})

test('only accepted department editors and Admins can save courses', () => {
  const member = { userId: 'user', status: 'accepted', role: 'Dean', department: 'CITE' }
  assert.equal(canEditDepartmentCourses(member, 'user', 'CITE'), true)
  assert.equal(canEditDepartmentCourses({ ...member, role: 'Program Head' }, 'user', 'CITE'), true)
  assert.equal(canEditDepartmentCourses({ ...member, role: 'Admin', department: '' }, 'user', 'OTHER'), true)
  assert.equal(canEditDepartmentCourses(member, 'other', 'CITE'), false)
  assert.equal(canEditDepartmentCourses(member, 'user', 'OTHER'), false)
  assert.equal(canEditDepartmentCourses({ ...member, status: 'pending' }, 'user', 'CITE'), false)
  assert.equal(canEditDepartmentCourses({ ...member, role: 'Instructor' }, 'user', 'CITE'), false)
})

test('rejects malformed columns, duplicate row IDs, invalid widths, and oversized course cells', async () => {
  let state = workbook()
  state.sheets[0].rows[1].rowNumber = state.sheets[0].rows[0].rowNumber
  await assert.rejects(() => encodeDepartmentCoursesWorkbook(state), /Invalid saved courses/)
  state = workbook()
  state.sheets[0].rows[0].values.pop()
  await assert.rejects(() => encodeDepartmentCoursesWorkbook(state), /Invalid saved courses/)
  state = workbook()
  state.columnWidths![0] = 0
  await assert.rejects(() => encodeDepartmentCoursesWorkbook(state), /Invalid saved courses/)
  state = workbook()
  state.sheets[0].rows[0].values[3] = 'A'.repeat(65537)
  assert.throws(() => departmentCourseDocuments(state), /64 KiB/)
})

test('batches large course sets by document count and payload size without losing row order', () => {
  const state = workbook()
  state.sheets[0].rows = Array.from({ length: 901 }, (_, index) => ({ rowNumber: index + 2, values: ['', '', String(index), '', '', ''] }))
  let rows = departmentCourseDocuments(state)
  assert.deepEqual(departmentCourseBatchRanges(rows), [{ start: 0, count: 400 }, { start: 400, count: 400 }, { start: 800, count: 101 }])
  state.sheets[0].rows = state.sheets[0].rows.slice(0, 40).map(row => ({ ...row, values: row.values.map(() => 'A'.repeat(65536)) }))
  rows = departmentCourseDocuments(state)
  const ranges = departmentCourseBatchRanges(rows)
  assert.ok(ranges.length > 1)
  assert.deepEqual(ranges.flatMap(({ start, count }) => rows.slice(start, start + count)), rows)
  for (const { start, count } of ranges) assert.ok(rows.slice(start, start + count).reduce((sum, row) => sum + new TextEncoder().encode(JSON.stringify(row)).byteLength + 1024, 0) <= 4 * 1024 * 1024)
})
