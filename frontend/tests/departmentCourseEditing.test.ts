import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changeDepartmentCourseRows, courseClipboardText, planCoursePaste, readCourseClipboard } from '../src/utils/departmentCourseEditing.ts'
import { createEmptyDepartmentCourseSheet } from '../src/utils/departmentCourseImport.ts'
import { applyScheduleCellValues, indexScheduleRows } from '../src/utils/departmentScheduleEdits.ts'
import { sameScheduleClipboardText } from '../src/utils/scheduleCellClipboard.ts'
import { CellTextHistory } from '../src/utils/cellTextHistory.ts'

test('course clipboard accepts only valid course columns and six-cell rows', () => {
  assert.deepEqual(readCourseClipboard(JSON.stringify({ version: 1, kind: 'cells', column: 5, values: ['', '3.00'] })), { version: 1, kind: 'cells', column: 5, values: ['', '3.00'] })
  for (const payload of [
    { version: 1, kind: 'cells', column: 6, values: ['Invalid column'] },
    { version: 1, kind: 'cells', column: -1, values: ['Row counter'] },
    { version: 1, kind: 'rows', rows: [Array(21).fill('Schedule row')] },
    { version: 1, kind: 'rows', rows: [[1, 2, 3, 4, 5, 6]] },
    { version: 1, column: 3, values: ['Schedule cell'] },
  ]) assert.equal(readCourseClipboard(JSON.stringify(payload)), null)
})

test('multi-cell paste fills only the same column and preserves Windows clipboard values', () => {
  const sheet = createEmptyDepartmentCourseSheet()
  const source = { version: 1 as const, kind: 'cells' as const, column: 3, values: ['First  course', 'Second\ncourse'] }
  const selection = { sheet: 0, column: 3, anchor: 4, end: 4 }
  const changes = planCoursePaste(source, selection, sheet)
  assert.deepEqual(changes.map(change => [change.cell.row, change.cell.column, change.value]), [[6, 3, 'First  course'], [7, 3, 'Second\ncourse']])
  assert.throws(() => planCoursePaste(source, { ...selection, column: 4 }, sheet))
  assert.throws(() => planCoursePaste(source, { ...selection, column: -1 }, sheet))
  const text = courseClipboardText(source)
  assert.equal(sameScheduleClipboardText(text, text.replace(/\n/g, '\r\n')), true)
})

test('one copied value fills a selected cell range and invalid paste ranges are rejected', () => {
  const sheet = createEmptyDepartmentCourseSheet()
  const selection = { sheet: 0, column: 2, anchor: 5, end: 3 }
  const source = { version: 1 as const, kind: 'cells' as const, column: 2, values: ['ITE 101'] }
  assert.deepEqual(planCoursePaste(source, selection, sheet).map(change => change.value), ['ITE 101', 'ITE 101', 'ITE 101'])
  assert.throws(() => planCoursePaste({ ...source, values: ['First', 'Second'] }, selection, sheet))
  assert.throws(() => planCoursePaste({ ...source, values: ['First', 'Second'] }, { ...selection, anchor: 49, end: 49 }, sheet))
})

test('whole-row pastes retain all six columns, clear blanks, and undo as one action', () => {
  const sheet = createEmptyDepartmentCourseSheet()
  sheet.rows[4].values = ['Old session', 'Old semester', 'Old code', 'Old course', 'Old type', 'Old credits']
  const source = { version: 1 as const, kind: 'rows' as const, rows: [
    ['SY 26-27', 'Y1S1', 'ITE 101', 'Computing', 'Lecture', '3.00'],
    ['', '', '', '', '', ''],
  ] }
  const selection = { sheet: 0, column: -1, anchor: 4, end: 4 }
  const changes = planCoursePaste(source, selection, sheet)
  assert.equal(changes.length, 12)
  const indexes = indexScheduleRows([sheet])
  const pasted = applyScheduleCellValues([sheet], indexes, changes)
  assert.deepEqual(pasted[0].rows[4].values, source.rows[0])
  assert.deepEqual(pasted[0].rows[5].values, source.rows[1])
  assert.equal(pasted[0].rows[3], sheet.rows[3])
  assert.throws(() => planCoursePaste(source, { ...selection, column: 0 }, sheet))
  const history = new CellTextHistory()
  history.recordChanges(changes.map(change => ({ cell: change.cell, before: sheet.rows[indexes[0].get(change.cell.row)!].values[change.cell.column], after: change.value })))
  const undo = history.undo()!
  const restored = applyScheduleCellValues(pasted, indexes, [undo, ...(undo.related ?? [])].map(change => ({ cell: change.cell, value: change.before })))
  assert.deepEqual(restored[0].rows[4].values, sheet.rows[4].values)
  assert.equal(history.undo(), null)
  assert.ok(history.redo())
})

test('adding and deleting course ranges preserves row identifiers and unrelated data', () => {
  const before = createEmptyDepartmentCourseSheet()
  before.rows[6].values[2] = 'Retained course'
  const selection = { sheet: 0, column: -1, anchor: 5, end: 3 }
  const added = changeDepartmentCourseRows(before, selection, 'add')
  assert.equal(added.rowIndex, 6)
  assert.equal(added.sheet.rows.length, 51)
  assert.ok(added.sheet.rows[6].values.every(value => value === ''))
  assert.equal(added.sheet.rows[7], before.rows[6])
  assert.equal(new Set(added.sheet.rows.map(row => row.rowNumber)).size, 51)
  const deleted = changeDepartmentCourseRows(before, selection, 'delete')
  assert.equal(deleted.sheet.rows.length, 47)
  assert.equal(deleted.sheet.rows[3], before.rows[6])
  assert.equal(deleted.sheet.rows[3].values[2], 'Retained course')
  const allDeleted = changeDepartmentCourseRows(before, { ...selection, anchor: 0, end: 49 }, 'delete')
  assert.equal(allDeleted.sheet.rows.length, 1)
  assert.equal(allDeleted.sheet.rows[0].values.length, 6)
  assert.ok(allDeleted.sheet.rows[0].values.every(value => value === ''))
  assert.equal(before.rows.length, 50)
})

test('row operations share undo and redo history with course text edits', () => {
  const before = createEmptyDepartmentCourseSheet()
  const cell = { sheet: 0, row: before.rows[0].rowNumber, column: 3 }
  const history = new CellTextHistory()
  history.record(cell, '', 'Course')
  const after = changeDepartmentCourseRows(before, { sheet: 0, column: -1, anchor: 0, end: 0 }, 'add').sheet
  history.recordStructure(cell, before, after)
  assert.equal(history.undo()?.structure?.before, before)
  assert.equal(history.undo()?.after, 'Course')
  assert.equal(history.redo()?.after, 'Course')
  assert.equal(history.redo()?.structure?.after, after)
})
