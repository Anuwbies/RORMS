import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterWorksheetRows, worksheetFilterLabel, worksheetFilterOptions, worksheetFilterReader, type WorksheetFilter } from '../src/utils/excelWorksheetFilters.ts'

const rows = [0, 1, 2, 3, 4, 5, 6]
const cells = [
  ['Schedule', ''], ['Faculty', 'Room'], ['Smith', '101'], ['Jones', '102'], ['Smith', '102'], ['', '101'], ['', ''],
]
const read = (row: number, column: number) => cells[row]?.[column] ?? ''
const filter = (values: WorksheetFilter['values']): WorksheetFilter => ({ header: { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }, lastRow: 5, values })

test('column filters combine with AND and retain headers, outside rows and source coordinates', () => {
  const selected = filter(new Map([[0, new Set(['Smith'])], [1, new Set(['102'])]]))
  assert.deepEqual(filterWorksheetRows(rows, selected, read), [0, 1, 4, 6])
  assert.deepEqual(rows, [0, 1, 2, 3, 4, 5, 6])
  assert.equal(cells[2][0], 'Smith')
})

test('blank values, no selected values and clearing filters are distinct', () => {
  assert.deepEqual(filterWorksheetRows(rows, filter(new Map([[0, new Set([''])]])), read), [0, 1, 5, 6])
  assert.deepEqual(filterWorksheetRows(rows, filter(new Map([[0, new Set()]])), read), [0, 1, 6])
  assert.deepEqual(filterWorksheetRows(rows, filter(new Map()), read), rows)
  assert.deepEqual(filterWorksheetRows(rows, undefined, read), rows)
})

test('merged headers supply full labels and merged body values match all their rows', () => {
  const values = [['Faculty', ''], ['Lec', 'Lab'], [' Smith ', 'Jones'], ['', 'Jones']]
  const merged = worksheetFilterReader((row, column) => values[row]?.[column] ?? '', [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },
  ])
  const setup: WorksheetFilter = { header: { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }, lastRow: 3, values: new Map([[0, new Set(['Smith'])]]) }
  assert.equal(worksheetFilterLabel(setup, 1, merged, 'B'), 'Faculty · Lab')
  assert.deepEqual(filterWorksheetRows([0, 1, 2, 3], setup, merged), [0, 1, 2, 3])
  assert.deepEqual(worksheetFilterOptions([0, 1, 2, 3], setup, 0, merged), ['Smith'])
})

test('value lists exclude headers, trailing empty rows and manually hidden rows', () => {
  assert.deepEqual(worksheetFilterOptions([0, 1, 2, 4, 5, 6], filter(new Map()), 0, read), ['', 'Smith'])
  assert.equal(worksheetFilterLabel(filter(new Map()), 5, read, 'F'), 'F')
})

test('filtering reflects current cell edits without changing stored rows', () => {
  const selected = filter(new Map([[0, new Set(['Smith'])]]))
  const editedRead = (row: number, column: number) => row === 3 && column === 0 ? 'Smith' : read(row, column)
  assert.deepEqual(filterWorksheetRows(rows, selected, editedRead), [0, 1, 2, 3, 4, 6])
  assert.equal(cells[3][0], 'Jones')
})
