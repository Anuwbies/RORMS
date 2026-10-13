import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EditHistory } from '../src/utils/editHistory.ts'

interface Snapshot {
  sheets: readonly string[]
  cells: Map<string, string>
  selectedSheet: string
}

const sameContent = (a: Snapshot, b: Snapshot) => a.sheets === b.sheets && a.cells === b.cells
const initial = (): Snapshot => ({ sheets: ['Original'], cells: new Map(), selectedSheet: 'Original' })

test('undo and redo restore values across multiple edits', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  const first = { ...start, cells: new Map([['A1', 'First']]) }
  const second = { ...first, cells: new Map([['A1', 'Second'], ['B1', 'Other']]) }
  history.record(start)
  history.record(first)
  history.record(second)
  assert.equal(history.undo(), first)
  assert.equal(history.undo(), start)
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), first)
  assert.equal(history.redo(), second)
  assert.equal(history.redo(), null)
  assert.equal(start.cells.size, 0)
  assert.equal(first.cells.get('A1'), 'First')
})

test('a compound sheet action restores its sheet list, data and active sheet together', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  const renamed = { sheets: ['Renamed'], cells: new Map([['Renamed!A1', 'Value']]), selectedSheet: 'Renamed' }
  history.record(start)
  history.record(renamed)
  assert.equal(history.undo(), start)
  assert.equal(history.redo(), renamed)
})

test('a new edit after undo discards the abandoned redo branch', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  history.record(start)
  history.record({ ...start, cells: new Map([['A1', 'Abandoned']]) })
  history.undo()
  const replacement = { ...start, cells: new Map([['A1', 'Replacement']]) }
  history.record(replacement)
  assert.equal(history.redo(), null)
  assert.equal(history.undo(), start)
  assert.equal(history.redo(), replacement)
})

test('sheet navigation preserves redo and does not create an undo step', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  const edited = { ...start, cells: new Map([['A1', 'Edited']]) }
  history.record(start)
  history.record(edited)
  history.undo()
  history.record({ ...start, selectedSheet: 'Another' })
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), edited)
})

test('recording a restored snapshot does not re-add the edit to history', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  const edited = { ...start, cells: new Map([['A1', 'Edited']]) }
  history.record(start)
  history.record(edited)
  history.record(history.undo()!)
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), edited)
  history.record(edited)
  assert.equal(history.redo(), null)
  assert.equal(history.undo(), start)
})

test('reset prevents undoing or redoing changes from a previous workbook', () => {
  const history = new EditHistory(sameContent)
  const start = initial()
  history.record(start)
  history.record({ ...start, cells: new Map([['A1', 'Old workbook']]) })
  history.undo()
  history.reset()
  history.record(initial())
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)
})

test('history stays within its configured edit limit', () => {
  const history = new EditHistory(sameContent, 2)
  const start = initial()
  history.record(start)
  const edits = ['One', 'Two', 'Three'].map(value => ({ ...start, cells: new Map([['A1', value]]) }))
  edits.forEach(edit => history.record(edit))
  assert.equal(history.undo(), edits[1])
  assert.equal(history.undo(), edits[0])
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), edits[1])
  assert.equal(history.redo(), edits[2])
})
