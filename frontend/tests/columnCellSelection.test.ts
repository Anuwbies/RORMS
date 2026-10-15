import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampColumnSelectionToYear, isColumnCellSelected, scheduleSelectionYearBounds } from '../src/utils/columnCellSelection.ts'
import { planScheduleCellPaste, planScheduleRowPaste } from '../src/utils/scheduleCellClipboard.ts'

test('selection includes both endpoints and intervening rows in only its original column and sheet', () => {
  const selection = { sheet: 0, column: 3, anchor: 2, end: 5 }
  assert.equal(isColumnCellSelected(selection, 0, 3, 2), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 4), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 5), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 6), false)
  assert.equal(isColumnCellSelected(selection, 0, 4, 4), false)
  assert.equal(isColumnCellSelected(selection, 1, 3, 4), false)
})

test('upward dragging selects the same contiguous range and no selection selects nothing', () => {
  const selection = { sheet: 0, column: 3, anchor: 5, end: 2 }
  assert.equal(isColumnCellSelected(selection, 0, 3, 2), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 3), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 5), true)
  assert.equal(isColumnCellSelected(selection, 0, 3, 1), false)
  assert.equal(isColumnCellSelected(null, 0, 3, 2), false)
})

test('cell and row ranges clamp in both directions to their anchor year with variable section sizes', () => {
  const sections = [{ label: 'First', start: 0, count: 10 }, { label: 'Second', start: 10, count: 17 }, { label: 'Third', start: 27, count: 5 }]
  const selection = { sheet: 0, column: 3, anchor: 8, end: 15 }
  assert.equal(clampColumnSelectionToYear(selection, sections, 32).end, 9)
  assert.equal(clampColumnSelectionToYear({ ...selection, anchor: 13, end: 0 }, sections, 32).end, 10)
  assert.equal(clampColumnSelectionToYear({ ...selection, column: -1, anchor: 28, end: 2 }, sections, 32).end, 27)
  const within = { ...selection, anchor: 12, end: 20 }
  assert.equal(clampColumnSelectionToYear(within, sections, 32), within)
  assert.deepEqual(scheduleSelectionYearBounds(20, sections, 32), { first: 10, last: 26 })
})

test('cell and row pastes cannot expand into the next year', () => {
  const sections = [{ label: 'First', start: 0, count: 10 }, { label: 'Second', start: 10, count: 10 }]
  const rows = Array.from({ length: 20 }, (_, index) => ({ rowNumber: index + 3, values: Array<string>(21).fill('') }))
  const selection = { sheet: 0, column: 3, anchor: 9, end: 9 }
  const { last } = scheduleSelectionYearBounds(selection.anchor, sections, rows.length)
  const boundedRows = rows.slice(0, last + 1)
  assert.throws(() => planScheduleCellPaste({ version: 1, column: 3, values: ['One', 'Two'] }, selection, boundedRows))
  assert.throws(() => planScheduleRowPaste({ version: 1, rows: [rows[0].values, rows[1].values] }, { ...selection, column: -1 }, boundedRows))
  assert.equal(planScheduleCellPaste({ version: 1, column: 3, values: ['One', 'Two'] }, { ...selection, anchor: 8, end: 8 }, boundedRows).length, 2)
})
