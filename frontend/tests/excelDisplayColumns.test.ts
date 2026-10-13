import assert from 'node:assert/strict'
import { test } from 'node:test'
import { worksheetDisplayColumns, worksheetDisplayMerges, worksheetSelectionColumns } from '../src/utils/excelDisplayColumns.ts'

test('mixed selections include Status while keeping physical cell coordinates unchanged', () => {
  const forward = { anchor: { r: 3, c: 20 }, focus: { r: 6, c: 21 }, focusStatus: true }
  assert.deepEqual(worksheetSelectionColumns(forward, 21), { first: 20, last: 21, includesStatus: true })
  const fromStatus = { anchor: { r: 3, c: 21 }, focus: { r: 6, c: 22 }, anchorStatus: true }
  assert.deepEqual(worksheetSelectionColumns(fromStatus, 21), { first: 22, last: 22, includesStatus: true })
  assert.deepEqual(worksheetSelectionColumns({ anchor: forward.focus, focus: forward.anchor, anchorStatus: true }, 21), { first: 20, last: 21, includesStatus: true })
  assert.deepEqual(worksheetSelectionColumns({ anchor: { r: 3, c: 21 }, focus: { r: 6, c: 22 } }, 21), { first: 21, last: 22, includesStatus: true })
  assert.deepEqual(worksheetSelectionColumns({ anchor: { r: 3, c: 21 }, focus: { r: 6, c: 21 }, anchorStatus: true, focusStatus: true }, 21), { first: 22, last: 21, includesStatus: true })
  assert.deepEqual(worksheetSelectionColumns(forward), { first: 20, last: 21, includesStatus: false })
  assert.equal(forward.focus.c, 21)
})

test('Status appears between V and W without becoming a worksheet coordinate', () => {
  const columns = [19, 20, 21, 22, 23]
  const display = worksheetDisplayColumns(columns, 21)
  assert.deepEqual(display, [19, 20, 21, null, 22, 23])
  assert.deepEqual(display.filter(column => column !== null), columns)
  assert.deepEqual(columns, [19, 20, 21, 22, 23])
  assert.deepEqual(worksheetDisplayColumns(columns), columns)
})

test('Status follows the configured end even when template columns are hidden or the schedule ends the sheet', () => {
  assert.deepEqual(worksheetDisplayColumns([0, 1, 19, 22, 23], 21), [0, 1, 19, null, 22, 23])
  assert.deepEqual(worksheetDisplayColumns([4, 5, 24], 24), [4, 5, 24, null])
  assert.deepEqual(worksheetDisplayColumns([22, 23], 21), [null, 22, 23])
})

test('merged cells spanning the display column leave space for Status and keep the original range and source', () => {
  const source = { s: { r: 3, c: 20 }, e: { r: 4, c: 23 } }
  const merges = worksheetDisplayMerges([3, 4, 5], [19, 20, 21, 22, 23, 24], [source], 21)
  const left = merges.get('U4')!, right = merges.get('W4')!
  assert.deepEqual([left.firstColumn, left.columnSpan, left.rowSpan, left.continuation], [20, 2, 2, false])
  assert.deepEqual([right.firstColumn, right.columnSpan, right.rowSpan, right.continuation], [22, 2, 2, true])
  assert.equal(merges.get('V5'), left)
  assert.equal(merges.get('X5'), right)
  assert.equal(left.source, source)
  assert.equal(right.source, source)
  assert.equal(right.anchor, 'U4')
  assert.equal(merges.has('Y4'), false)
  assert.deepEqual(source, { s: { r: 3, c: 20 }, e: { r: 4, c: 23 } })
})

test('hidden rows/columns and sheets without Status retain normal merge projection', () => {
  const source = { s: { r: 3, c: 20 }, e: { r: 5, c: 23 } }
  const regular = worksheetDisplayMerges([4, 5], [21, 23], [source]).get('V5')!
  assert.deepEqual([regular.firstRow, regular.firstColumn, regular.rowSpan, regular.columnSpan, regular.continuation], [4, 21, 2, 2, false])
  const onlyRight = worksheetDisplayMerges([4, 5], [22, 23], [source], 21).get('W5')!
  assert.deepEqual([onlyRight.columnSpan, onlyRight.continuation, onlyRight.anchor], [2, false, 'U4'])
  assert.equal(worksheetDisplayMerges([], [21, 22], [source], 21).size, 0)
})
