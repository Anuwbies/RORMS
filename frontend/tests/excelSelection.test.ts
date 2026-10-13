import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expandSelectionForMerges, findBorderedRegion, type BorderedCell } from '../src/utils/excelSelection.ts'

test('bottom-to-top selection includes the top of a vertically merged cell', () => {
  const merged = { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } }
  const selection = { s: { r: 2, c: 0 }, e: { r: 5, c: 0 } }
  assert.deepEqual(expandSelectionForMerges(selection, [merged]), { s: { r: 0, c: 0 }, e: { r: 5, c: 0 } })
})

test('right-to-left selection includes the left of a horizontally merged cell', () => {
  const merged = { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
  const selection = { s: { r: 0, c: 2 }, e: { r: 0, c: 5 } }
  assert.deepEqual(expandSelectionForMerges(selection, [merged]), { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } })
})

test('selection expands to all sides of a merge touched at its bottom-right corner', () => {
  const merged = { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }
  const selection = { s: { r: 2, c: 2 }, e: { r: 5, c: 5 } }
  assert.deepEqual(expandSelectionForMerges(selection, [merged]), { s: { r: 0, c: 0 }, e: { r: 5, c: 5 } })
})

test('dragging out of an initially selected merge preserves its full extent', () => {
  const merged = { s: { r: 3, c: 3 }, e: { r: 5, c: 5 } }
  const selection = { s: { r: 0, c: 0 }, e: { r: 3, c: 3 } }
  assert.deepEqual(expandSelectionForMerges(selection, [merged]), { s: { r: 0, c: 0 }, e: { r: 5, c: 5 } })
})

test('expansion includes merges newly touched by another merge regardless of order', () => {
  const horizontal = { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }
  const vertical = { s: { r: 1, c: 0 }, e: { r: 4, c: 0 } }
  const selection = { s: { r: 0, c: 2 }, e: { r: 2, c: 3 } }
  const expected = { s: { r: 0, c: 0 }, e: { r: 4, c: 3 } }
  assert.deepEqual(expandSelectionForMerges(selection, [vertical, horizontal]), expected)
  assert.deepEqual(expandSelectionForMerges(selection, [horizontal, vertical]), expected)
})

test('unrelated merged cells do not enlarge a selection', () => {
  const selection = { s: { r: 3, c: 3 }, e: { r: 5, c: 5 } }
  const merged = { s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }
  assert.deepEqual(expandSelectionForMerges(selection, [merged]), selection)
})

test('calculating the highlight leaves the drag endpoints and workbook merges unchanged', () => {
  const selection = { s: { r: 2, c: 0 }, e: { r: 5, c: 0 } }
  const merged = { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } }
  const before = structuredClone({ selection, merged })
  expandSelectionForMerges(selection, [merged])
  assert.deepEqual({ selection, merged }, before)
})

const line = '1px solid #000000'
const allBorders = { borderTop: line, borderRight: line, borderBottom: line, borderLeft: line }
const point = (r: number, c: number) => ({ s: { r, c }, e: { r, c } })

function borderGrid(firstRow: number, firstColumn: number, size: number): BorderedCell[] {
  return Array.from({ length: size * size }, (_, index) => ({ range: point(firstRow + Math.floor(index / size), firstColumn + index % size), borders: allBorders }))
}

test('Ctrl+A expands a single cell to its entire 6x6 bordered block', () => {
  const cells = borderGrid(2, 3, 6)
  const expected = { s: { r: 2, c: 3 }, e: { r: 7, c: 8 } }
  for (const cell of cells) assert.deepEqual(findBorderedRegion(cell.range, cells), expected)
})

test('an outer border selects blank interior cells and keeps unrelated blocks separate', () => {
  const range = { s: { r: 2, c: 3 }, e: { r: 7, c: 8 } }
  const cells = [{ range, borders: allBorders }, ...borderGrid(10, 3, 3)]
  assert.deepEqual(findBorderedRegion(point(4, 5), cells), range)
  assert.deepEqual(findBorderedRegion(point(11, 4), cells), { s: { r: 10, c: 3 }, e: { r: 12, c: 5 } })
  assert.equal(findBorderedRegion(point(9, 5), cells), null)
})

test('merged bordered headers remain part of the enclosing block', () => {
  const cells = borderGrid(1, 0, 5)
  cells.push({ range: { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, borders: allBorders })
  const expected = { s: { r: 0, c: 0 }, e: { r: 5, c: 4 } }
  assert.deepEqual(findBorderedRegion(point(3, 2), cells), expected)
  assert.deepEqual(findBorderedRegion(cells[cells.length - 1].range, cells), expected)
})

test('unbordered cells and incomplete border lines do not select the whole sheet', () => {
  assert.equal(findBorderedRegion(point(2, 2), [{ range: { s: { r: 0, c: 0 }, e: { r: 5, c: 5 } }, borders: { borderTop: line, borderBottom: 'none', borderLeft: '0px solid black', borderRight: '1px hidden black' } }]), null)
  assert.equal(findBorderedRegion(point(2, 2), []), null)
})

test('the nearest enclosing disconnected border is selected without mutating its cells', () => {
  const cells = [{ range: { s: { r: 0, c: 0 }, e: { r: 9, c: 9 } }, borders: allBorders }, { range: { s: { r: 2, c: 2 }, e: { r: 5, c: 5 } }, borders: allBorders }]
  const before = structuredClone(cells)
  assert.deepEqual(findBorderedRegion(point(3, 3), cells), cells[1].range)
  assert.deepEqual(cells, before)
})
