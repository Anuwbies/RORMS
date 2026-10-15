import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CELL_UNDO_COOLDOWN_MS, CellTextHistory } from '../src/utils/cellTextHistory.ts'

const first = { sheet: 0, row: 8, column: 3 }
const second = { sheet: 1, row: 12, column: 4 }

test('pasting different values into a range is one undo action and redoes each pasted value', () => {
  const history = new CellTextHistory()
  const other = { ...first, row: 9 }
  history.recordChanges([{ cell: first, before: 'Old first', after: 'Pasted first' }, { cell: other, before: 'Old second', after: 'Pasted second' }])
  const undone = history.undo()!
  assert.equal(undone.before, 'Old first')
  assert.equal(undone.related?.[0].before, 'Old second')
  assert.equal(history.undo(), null)
  const redone = history.redo()!
  assert.equal(redone.after, 'Pasted first')
  assert.equal(redone.related?.[0].after, 'Pasted second')
  assert.equal(history.redo(), null)
})

test('rapid typing is one undo group, even when undone before the cooldown finishes', () => {
  const history = new CellTextHistory()
  history.recordTyping([{ cell: first, before: '' }], 'H', 0)
  history.recordTyping([{ cell: first, before: 'H' }], 'He', 100)
  history.recordTyping([{ cell: first, before: 'He' }], 'Hello', 200)
  assert.equal(history.undo()?.before, '')
  assert.equal(history.undo(), null)
  assert.equal(history.redo()?.after, 'Hello')
  assert.equal(history.redo(), null)
})

test('every keystroke resets the cooldown rather than using total typing duration', () => {
  const history = new CellTextHistory()
  history.recordTyping([{ cell: first, before: '' }], 'A', 0)
  history.recordTyping([{ cell: first, before: 'A' }], 'AB', CELL_UNDO_COOLDOWN_MS - 1)
  history.recordTyping([{ cell: first, before: 'AB' }], 'ABC', 2 * (CELL_UNDO_COOLDOWN_MS - 1))
  assert.equal(history.undo()?.before, '')
  assert.equal(history.undo(), null)
})

test('a pause starts a new group so undo removes only the latest burst', () => {
  const history = new CellTextHistory()
  history.recordTyping([{ cell: first, before: '' }], 'First', 0)
  history.recordTyping([{ cell: first, before: 'First' }], 'First second', CELL_UNDO_COOLDOWN_MS)
  history.recordTyping([{ cell: first, before: 'First second' }], 'First second burst', CELL_UNDO_COOLDOWN_MS + 100)
  assert.equal(history.undo()?.before, 'First')
  assert.equal(history.undo()?.before, '')
  assert.equal(history.redo()?.after, 'First')
  assert.equal(history.redo()?.after, 'First second burst')
})

test('the idle timer flush and switching cells close a group without adding duplicate steps', () => {
  const history = new CellTextHistory()
  history.recordTyping([{ cell: first, before: '' }], 'A', 0)
  history.flushPending()
  history.flushPending()
  history.recordTyping([{ cell: first, before: 'A' }], 'AB', 1000)
  history.recordTyping([{ cell: second, before: '' }], 'Other cell', 1100)
  assert.deepEqual(history.undo()?.cell, second)
  assert.equal(history.undo()?.before, 'A')
  assert.equal(history.undo()?.before, '')
  assert.equal(history.undo(), null)
})

test('range typing shares each cooldown group and restores different original values', () => {
  const history = new CellTextHistory()
  const other = { ...first, row: 9 }
  history.recordTyping([{ cell: first, before: 'Original' }, { cell: other, before: 'Different' }], 'A', 0)
  history.recordTyping([{ cell: first, before: 'A' }, { cell: other, before: 'A' }], 'AB', 100)
  history.recordTyping([{ cell: first, before: 'AB' }, { cell: other, before: 'AB' }], 'ABC', 1000)
  assert.equal(history.undo()?.related?.[0].before, 'AB')
  const edit = history.undo()!
  assert.equal(edit.before, 'Original')
  assert.equal(edit.related?.[0].before, 'Different')
  assert.equal(history.redo()?.related?.[0].after, 'AB')
  assert.equal(history.redo()?.related?.[0].after, 'ABC')
})

test('cancelling discards pending and flushed typing groups while preserving previous redo', () => {
  const history = new CellTextHistory()
  history.record(first, '', 'Old edit')
  history.undo()
  const checkpoint = history.checkpoint()
  history.recordTyping([{ cell: first, before: '' }], 'A', 0)
  history.flushPending()
  history.recordTyping([{ cell: first, before: 'A' }], 'AB', 1000)
  history.restore(checkpoint)
  history.flushPending()
  assert.equal(history.undo(), null)
  assert.equal(history.redo()?.after, 'Old edit')
})

test('typing after undo starts a fresh group and invalidates the old redo branch', () => {
  const history = new CellTextHistory()
  history.recordTyping([{ cell: first, before: '' }], 'Old', 0)
  history.undo()
  history.recordTyping([{ cell: first, before: '' }], 'New', 100)
  assert.equal(history.redo(), null)
  assert.equal(history.undo()?.before, '')
  assert.equal(history.redo()?.after, 'New')
})

test('a completed cell edit undoes and redoes its entire value in one step', () => {
  const history = new CellTextHistory()
  history.record(first, 'Old value', 'New value')
  assert.equal(history.undo()?.before, 'Old value')
  assert.equal(history.undo(), null)
  assert.equal(history.redo()?.after, 'New value')
  assert.equal(history.redo(), null)
})

test('deletion and pasted text each remain one completed action', () => {
  const history = new CellTextHistory()
  history.record(first, 'A123Z', 'AZ')
  history.record(first, 'AZ', 'Entire pasted text')
  assert.equal(history.undo()?.before, 'AZ')
  assert.equal(history.undo()?.before, 'A123Z')
  assert.equal(history.redo()?.after, 'AZ')
  assert.equal(history.redo()?.after, 'Entire pasted text')
})

test('history follows completed edits across cells and worksheets', () => {
  const history = new CellTextHistory()
  history.record(first, '', 'A')
  history.record(second, '', 'BC')
  assert.deepEqual(history.undo()?.cell, second)
  assert.deepEqual(history.undo()?.cell, first)
  assert.equal(history.undo(), null)
  assert.deepEqual(history.redo()?.cell, first)
  assert.equal(history.redo()?.after, 'BC')
})

test('a new completed edit clears redo; an unchanged edit preserves it', () => {
  const history = new CellTextHistory()
  history.record(first, '', 'AB')
  history.undo()
  history.record(first, '', '')
  assert.equal(history.redo()?.after, 'AB')
  history.undo()
  history.record(second, '', 'X')
  assert.equal(history.redo(), null)
})

test('cancelling an edit restores the previous history including redo', () => {
  const history = new CellTextHistory()
  history.record(first, '', 'AB')
  history.undo()
  const checkpoint = history.checkpoint()
  history.record(second, '', 'X')
  history.restore(checkpoint)
  assert.equal(history.redo()?.after, 'AB')
  assert.equal(history.undo()?.before, '')
  assert.equal(history.undo(), null)
})

test('a selected range restores every original in one undo and reapplies the common value in one redo', () => {
  const history = new CellTextHistory()
  const other = { ...first, row: 9 }
  history.recordMany([{ cell: first, before: 'First' }, { cell: other, before: 'Second' }], 'Shared value')
  const edit = history.undo()!
  assert.equal(edit.before, 'First')
  assert.equal(edit.related?.[0].before, 'Second')
  assert.equal(history.undo(), null)
  const redone = history.redo()!
  assert.equal(redone.after, 'Shared value')
  assert.equal(redone.related?.[0].after, 'Shared value')
  assert.equal(history.redo(), null)
})

test('filling other selected cells is recorded even when the active value is unchanged', () => {
  const history = new CellTextHistory()
  history.recordMany([{ cell: first, before: 'A' }, { cell: second, before: 'B' }], 'A')
  assert.equal(history.undo()?.related?.[0].before, 'B')
  assert.equal(history.redo()?.related?.[0].after, 'A')
})

test('Unicode text is restored intact and a new import clears history', () => {
  const history = new CellTextHistory()
  history.record(first, '', 'a\u0301👩‍💻')
  assert.equal(history.undo()?.before, '')
  assert.equal(history.redo()?.after, 'a\u0301👩‍💻')
  history.reset()
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)
})
