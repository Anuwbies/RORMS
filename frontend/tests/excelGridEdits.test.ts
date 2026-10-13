import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearRangeText, formatClipboardRows, parseClipboardRows, moveCellMap, moveRange, moveSheet, moveFormatting, setSheetAxisHidden } from '../src/utils/excelGridEdits.ts'
import type { SheetPreviewFormatting } from '../src/utils/excelPreviewStyles.ts'
import { EditHistory } from '../src/utils/editHistory.ts'

test('clearing a selection removes all displayed contents in one undoable update while retaining cell metadata', () => {
  const sheet = {
    A1: { t: 's' as const, v: 'Keep' },
    B2: { t: 's' as const, v: 'Original', c: [{ a: 'Author', t: 'Keep comment' }], s: { fill: { fgColor: { rgb: 'FFFF00' } } } },
    C2: { t: 'n' as const, v: 0 },
    B3: { t: 'n' as const, f: 'SUM(C2)', v: 0 },
    D4: { t: 's' as const, v: 'Outside' },
    '!ref': 'A1:D4',
  }
  const overrides = new Map([['B2', 'Edited'], ['C3', 'New text'], ['D4', 'Keep edit']])
  const history = new EditHistory<Map<string, string>>((a, b) => a === b)
  history.record(overrides)
  const cleared = clearRangeText(sheet, overrides, { s: { r: 1, c: 1 }, e: { r: 2, c: 2 } }, [])
  history.record(cleared)
  assert.deepEqual([...cleared], [['B2', ''], ['C3', ''], ['D4', 'Keep edit'], ['C2', ''], ['B3', '']])
  assert.equal(sheet.B2.v, 'Original')
  assert.equal(sheet.B2.c[0].t, 'Keep comment')
  assert.equal(sheet.B2.s.fill.fgColor.rgb, 'FFFF00')
  assert.equal(overrides.get('B2'), 'Edited')
  assert.equal(history.undo(), overrides)
  assert.equal(history.redo(), cleared)
  assert.equal(clearRangeText(sheet, cleared, { s: { r: 1, c: 1 }, e: { r: 2, c: 2 } }, []), cleared)
})

test('clearing selected merged cells includes intersecting anchors without clearing unrelated cells', () => {
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } }, { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }]
  const sheet = { A1: { t: 's' as const, v: 'Vertical merge' }, B2: { t: 's' as const, v: 'Horizontal merge' }, B3: { t: 's' as const, v: 'Keep' }, '!merges': merges }
  const cleared = clearRangeText(sheet, new Map(), { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }, merges)
  assert.deepEqual([...cleared], [['A1', ''], ['B2', '']])
  assert.equal(sheet['!merges'], merges)
  assert.equal(sheet.B3.v, 'Keep')
})

test('clearing a large blank selection avoids creating unnecessary overrides', () => {
  const overrides = new Map<string, string>()
  assert.equal(clearRangeText({ '!ref': 'A1:XFD1048576' }, overrides, { s: { r: 0, c: 0 }, e: { r: 1048575, c: 16383 } }, []), overrides)
})

test('hide and show preserve row heights, column widths, contents and undo snapshots', () => {
  const sheet = { A1: { t: 's' as const, v: 'Keep', c: [{ a: 'Author', t: 'Comment' }] }, '!ref': 'A1:C5', '!rows': [{ hpt: 28 }, { hidden: true, hpt: 35 }], '!cols': [{ width: 22 }, { hidden: true, width: 15 }] }
  const history = new EditHistory<typeof sheet>((a, b) => a === b)
  history.record(sheet)
  const hidden = setSheetAxisHidden(sheet, 'row', [0, 4], true)
  history.record(hidden as typeof sheet)
  assert.equal(sheet['!rows'][0].hidden, undefined)
  assert.equal(hidden['!rows']?.[0].hpt, 28)
  assert.equal(hidden['!rows']?.[4].hidden, true)
  assert.equal(hidden.A1, sheet.A1)
  assert.equal(hidden['!cols'], sheet['!cols'])
  assert.equal(history.undo(), sheet)
  assert.equal(history.redo(), hidden)
  const shown = setSheetAxisHidden(hidden, 'row', [0, 1, 4], false)
  assert.equal(shown['!rows']?.[1].hpt, 35)
  assert.ok([0, 1, 4].every(index => !shown['!rows']?.[index].hidden))
  assert.equal(hidden['!rows']?.[1].hidden, true)
  const columns = setSheetAxisHidden(shown, 'column', [0], true)
  assert.equal(columns['!cols']?.[0].width, 22)
  const shownColumns = setSheetAxisHidden(columns, 'column', [0, 1], false)
  assert.equal(shownColumns['!cols']?.[1].width, 15)
  assert.equal(shownColumns['!rows'], shown['!rows'])
  assert.equal(setSheetAxisHidden(shownColumns, 'column', [0, 1], false), shownColumns)
})

test('inserting rows moves cells, comments, hidden-row metadata and merged areas together', () => {
  const sheet = { A1: { t: 's' as const, v: 'Header' }, A2: { t: 's' as const, v: 'Data', c: [{ a: 'Author', t: 'Note' }] }, '!ref': 'A1:B3', '!rows': [{}, { hidden: true }] }
  const edit = { axis: 'row' as const, start: 1, count: 2, remove: false }
  const merged = moveRange({ s: { r: 1, c: 0 }, e: { r: 2, c: 1 } }, edit)!
  const result = moveSheet(sheet, edit, [merged])
  assert.equal(result.A2, undefined)
  assert.equal(result.A4.v, 'Data')
  assert.equal(result.A4.c[0].t, 'Note')
  assert.equal(result['!rows']?.[3].hidden, true)
  assert.deepEqual(result['!merges'], [{ s: { r: 3, c: 0 }, e: { r: 4, c: 1 } }])
  assert.equal(sheet.A2.v, 'Data')
})

test('deleting columns removes selected data and shifts cell overrides left', () => {
  const edit = { axis: 'column' as const, start: 1, count: 2, remove: true }
  const result = moveCellMap(new Map([['A1', 'Keep'], ['B1', 'Delete'], ['C1', 'Delete'], ['D1', 'Move']]), edit)
  assert.deepEqual([...result], [['A1', 'Keep'], ['B1', 'Move']])
})

test('shifting cells affects only the selected rows', () => {
  const edit = { axis: 'column' as const, start: 1, count: 1, remove: false, band: { start: 1, end: 1 } }
  const result = moveCellMap(new Map([['B1', 'Unchanged'], ['B2', 'Moved'], ['B3', 'Unchanged']]), edit)
  assert.deepEqual([...result], [['B1', 'Unchanged'], ['C2', 'Moved'], ['B3', 'Unchanged']])
})

test('deletion shrinks a partially retained merged area and removes an entirely deleted merge', () => {
  const edit = { axis: 'row' as const, start: 1, count: 2, remove: true }
  assert.deepEqual(moveRange({ s: { r: 0, c: 0 }, e: { r: 3, c: 0 } }, edit), { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } })
  assert.equal(moveRange({ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, edit), null)
})

test('a cell shift that would split a merge is rejected', () => {
  assert.throws(() => moveRange({ s: { r: 0, c: 0 }, e: { r: 1, c: 2 } }, { axis: 'row', start: 0, count: 1, remove: false, band: { start: 1, end: 1 } }), /split a merged cell/)
})

test('formatting indexes and conditional formatting follow inserted rows', () => {
  const formatting: SheetPreviewFormatting = { indexes: new Map([['A2', 4]]), rowIndexes: new Map([[1, 7]]), columnIndexes: [{ first: 0, last: 2, styleId: 3 }], conditionalRules: [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: { fontWeight: 'bold' }, ranges: [{ s: { r: 1, c: 0 }, e: { r: 3, c: 2 } }] }] }
  const result = moveFormatting(formatting, { axis: 'row', start: 1, count: 1, remove: false })
  assert.equal(result.indexes.get('A3'), 4)
  assert.equal(result.rowIndexes.get(2), 7)
  assert.deepEqual(result.conditionalRules[0].ranges, [{ s: { r: 2, c: 0 }, e: { r: 4, c: 2 } }])
  assert.equal(formatting.indexes.get('A2'), 4)
})

test('conditional formatting outside a shifted band stays in place', () => {
  const formatting: SheetPreviewFormatting = { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: {}, ranges: [{ s: { r: 0, c: 0 }, e: { r: 2, c: 2 } }] }] }
  const result = moveFormatting(formatting, { axis: 'row', start: 0, count: 1, remove: false, band: { start: 1, end: 1 } })
  assert.deepEqual(result.conditionalRules[0].ranges, [
    { s: { r: 0, c: 0 }, e: { r: 2, c: 0 } },
    { s: { r: 1, c: 1 }, e: { r: 3, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 2, c: 2 } },
  ])
})

test('shifts cannot silently drop cells past Excel limits', () => {
  assert.throws(() => moveCellMap(new Map([['XFD1', 'Last column']]), { axis: 'column', start: 0, count: 1, remove: false }), /limit/)
  assert.throws(() => moveRange({ s: { r: 0, c: 16383 }, e: { r: 1, c: 16383 } }, { axis: 'column', start: 22, count: 1, remove: false }), /limit/)
  assert.throws(() => moveRange({ s: { r: 1048575, c: 0 }, e: { r: 1048575, c: 1 } }, { axis: 'row', start: 1, count: 1, remove: false }), /limit/)
})

test('column styles and conditional formatting reaching XFD stay within Excel bounds on insertion', () => {
  const fullRange = { s: { r: 0, c: 0 }, e: { r: 1048575, c: 16383 } }
  const formatting: SheetPreviewFormatting = {
    indexes: new Map([['W3', 4]]), rowIndexes: new Map(),
    columnIndexes: [{ first: 0, last: 21, styleId: 1 }, { first: 22, last: 16383, styleId: 2 }],
    conditionalRules: [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: { fontWeight: 'bold' }, ranges: [fullRange] }],
  }
  const moved = moveFormatting(formatting, { axis: 'column', start: 22, count: 1, remove: false })
  assert.deepEqual(moved.columnIndexes, [{ first: 0, last: 21, styleId: 1 }, { first: 23, last: 16383, styleId: 2 }])
  assert.deepEqual(moved.conditionalRules[0].ranges, [fullRange])
  assert.equal(moved.indexes.get('X3'), 4)
  assert.equal(formatting.columnIndexes[1].first, 22)
  assert.equal(formatting.conditionalRules[0].ranges[0], fullRange)
})

test('whole-column conditional formatting clips shifted rows only within the edited band', () => {
  const fullRange = { s: { r: 0, c: 0 }, e: { r: 1048575, c: 2 } }
  const formatting: SheetPreviewFormatting = {
    indexes: new Map(), rowIndexes: new Map(), columnIndexes: [],
    conditionalRules: [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: {}, ranges: [fullRange] }],
  }
  const moved = moveFormatting(formatting, { axis: 'row', start: 0, count: 2, remove: false, band: { start: 1, end: 1 } })
  assert.deepEqual(moved.conditionalRules[0].ranges, [
    { s: { r: 0, c: 0 }, e: { r: 1048575, c: 0 } },
    { s: { r: 2, c: 1 }, e: { r: 1048575, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 1048575, c: 2 } },
  ])
})

test('formatting shifted entirely outside the grid is removed rather than producing invalid ranges', () => {
  const formatting: SheetPreviewFormatting = {
    indexes: new Map(), rowIndexes: new Map(), columnIndexes: [{ first: 16383, last: 16383, styleId: 2 }],
    conditionalRules: [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: {}, ranges: [{ s: { r: 0, c: 16383 }, e: { r: 5, c: 16383 } }] }],
  }
  const moved = moveFormatting(formatting, { axis: 'column', start: 22, count: 1, remove: false })
  assert.deepEqual(moved.columnIndexes, [])
  assert.deepEqual(moved.conditionalRules[0].ranges, [])
})

test('clipboard roundtrip preserves tabs, line breaks, quotes, empty cells and trailing blank rows', () => {
  const values = [['One', 'Tab\there', 'Line\nbreak', 'A "quote"'], ['', ''], ['', '']]
  assert.deepEqual(parseClipboardRows(formatClipboardRows(values)), values)
})

test('external Windows clipboard text drops the final line terminator without losing empty cells', () => {
  assert.deepEqual(parseClipboardRows('A\tB\r\nC\t\r\n'), [['A', 'B'], ['C', '']])
})
