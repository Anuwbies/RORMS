import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changeDepartmentScheduleRows, toggleDepartmentScheduleYearVisibility } from '../src/utils/departmentScheduleRowActions.ts'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { CellTextHistory } from '../src/utils/cellTextHistory.ts'

const selection = { sheet: 0, column: -1, anchor: 9, end: 9 }

test('hiding and showing a year retains its rows, numbering, and label and supports history', () => {
  const before = createEmptyDepartmentScheduleSheet()
  before.rows[12].values[2] = 'Retained course'
  const hidden = toggleDepartmentScheduleYearVisibility(before, 10)
  assert.equal(hidden.yearSections?.[1].hidden, true)
  assert.equal(hidden.rows, before.rows)
  assert.equal(hidden.yearSections?.[0], before.yearSections?.[0])
  assert.equal(hidden.yearSections?.[1].label, '2nd Year')
  const shown = toggleDepartmentScheduleYearVisibility(hidden, 10)
  assert.equal(shown.yearSections?.[1].hidden, false)
  assert.equal(shown.rows[12].values[2], 'Retained course')
  assert.equal(toggleDepartmentScheduleYearVisibility(before, 999), before)
  const history = new CellTextHistory()
  history.recordStructure({ sheet: 0, row: before.rows[10].rowNumber, column: 0 }, before, hidden)
  assert.equal(history.undo()?.structure?.before, before)
  assert.equal(history.redo()?.structure?.after, hidden)
})

test('bulk add appends the requested rows to one year without modifying later years', () => {
  const before = createEmptyDepartmentScheduleSheet()
  const { sheet } = changeDepartmentScheduleRows(before, { ...selection, anchor: 19, end: 19 }, 'add', 7)
  assert.deepEqual(sheet.yearSections?.map(section => [section.start, section.count]), [[0, 10], [10, 17], [27, 10], [37, 10]])
  assert.ok(sheet.rows.slice(20, 27).every(row => row.values.length === 21 && row.values.every(value => value === '')))
  assert.equal(sheet.rows[27], before.rows[20])
  assert.equal(new Set(sheet.rows.map(row => row.rowNumber)).size, 47)
  for (const count of [0, -1, 1.5, Number.NaN]) assert.throws(() => changeDepartmentScheduleRows(before, selection, 'add', count))
})

test('adding at a year boundary inserts into the preceding year and preserves existing row identities', () => {
  const before = createEmptyDepartmentScheduleSheet()
  const { sheet, rowIndex } = changeDepartmentScheduleRows(before, selection, 'add')
  assert.equal(rowIndex, 10)
  assert.deepEqual(sheet.yearSections?.map(section => [section.start, section.count]), [[0, 11], [11, 10], [21, 10], [31, 10]])
  assert.ok(sheet.rows[10].values.every(value => value === ''))
  assert.equal(sheet.rows[11], before.rows[10])
  assert.equal(before.rows.length, 40)
  assert.equal(new Set(sheet.rows.map(row => row.rowNumber)).size, 41)
})

test('deleting a reverse range across years preserves data and recomputes each year span', () => {
  const before = createEmptyDepartmentScheduleSheet()
  before.rows[12].values[2] = 'Retained course'
  const { sheet, rowIndex } = changeDepartmentScheduleRows(before, { ...selection, anchor: 11, end: 8 }, 'delete')
  assert.equal(rowIndex, 8)
  assert.deepEqual(sheet.yearSections?.map(section => [section.start, section.count]), [[0, 8], [8, 8], [16, 10], [26, 10]])
  assert.equal(sheet.rows[8], before.rows[12])
  assert.equal(sheet.rows[8].values[2], 'Retained course')
  assert.equal(before.rows.length, 40)
})

test('deleting all rows retains each year and one unique editable blank row per year', () => {
  const before = createEmptyDepartmentScheduleSheet()
  const { sheet } = changeDepartmentScheduleRows(before, { ...selection, anchor: 0, end: 39 }, 'delete')
  assert.equal(sheet.rows.length, 4)
  assert.deepEqual(sheet.yearSections?.map(section => section.label), before.yearSections?.map(section => section.label))
  assert.deepEqual(sheet.yearSections?.map(section => [section.start, section.count]), [[0, 1], [1, 1], [2, 1], [3, 1]])
  assert.equal(new Set(sheet.rows.map(row => row.rowNumber)).size, 4)
  assert.ok(sheet.rows.every(row => row.values.length === 21 && row.values.every(value => value === '')))
  assert.throws(() => changeDepartmentScheduleRows(before, { ...selection, anchor: -1 }, 'delete'))
})

test('row operations undo and redo in order with cell edits without losing deleted data', () => {
  const before = createEmptyDepartmentScheduleSheet()
  before.rows[9].values[2] = 'Original course'
  const history = new CellTextHistory()
  const cell = { sheet: 0, row: before.rows[9].rowNumber, column: 2 }
  history.record(cell, '', 'Original course')
  const added = changeDepartmentScheduleRows(before, selection, 'add').sheet
  history.recordStructure(cell, before, added)
  const deleted = changeDepartmentScheduleRows(added, selection, 'delete').sheet
  history.recordStructure(cell, added, deleted)
  assert.equal(history.undo()?.structure?.before, added)
  assert.equal(history.undo()?.structure?.before, before)
  assert.equal(history.undo()?.after, 'Original course')
  assert.equal(history.redo()?.after, 'Original course')
  assert.equal(history.redo()?.structure?.after, added)
  assert.equal(history.redo()?.structure?.after, deleted)
  history.undo()
  history.recordStructure(cell, added, before)
  assert.equal(history.redo(), null)
})
