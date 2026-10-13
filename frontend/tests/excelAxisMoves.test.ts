import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import type { CSSProperties } from 'react'
import { axisMoveIndex, axisMoveRanges, reorderWorkbookAxis, validateAxisMove, type AxisMove } from '../src/utils/excelAxisMoves.ts'
import type { WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { serializeWorkbookState, deserializeWorkbookState } from '../src/utils/excelWorkbookState.ts'
import { createExcelExport } from '../src/utils/excelWorkbookExport.ts'
import { EditHistory } from '../src/utils/editHistory.ts'
import type { SheetPreviewFormatting } from '../src/utils/excelPreviewStyles.ts'

const formatting = (): SheetPreviewFormatting => ({ indexes: new Map([['A2', 1]]), rowIndexes: new Map([[1, 2]]), columnIndexes: [{ first: 0, last: 1, styleId: 3 }],
  conditionalRules: [{ ranges: [XLSX.utils.decode_range('A1:B3')], type: 'notContainsBlanks', operator: null, threshold: 0, style: { color: 'red' }, priority: 1 }] })

function snapshot(): WorkbookEditSnapshot {
  return {
    workbook: { SheetNames: ['Sheet1', 'Other'], Sheets: {
      Sheet1: { '!ref': 'A1:E6',
        A1: { t: 's', v: 'First' }, A2: { t: 's', v: 'Second', c: [{ a: 'Dean', t: 'Keep comment' }], l: { Target: 'https://example.com' } },
        A3: { t: 's', v: 'Third' }, A4: { t: 's', v: 'Fourth' }, A5: { t: 's', v: 'Fifth' }, A6: { t: 's', v: 'Sixth' },
        B2: { t: 'n', v: 3, f: '1+2' }, C2: { t: 's', v: 'Rich', previewFontRuns: [{ text: 'Rich', fontFamily: 'Arial' }] },
        '!rows': [{ hpt: 12 }, { hpt: 27, hidden: true }, { hpt: 33 }], '!cols': [{ width: 12 }, { width: 27, hidden: true }, { width: 33 }],
      }, Other: { A1: { t: 's', v: 'Unchanged' } },
    } },
    previewStyles: null, sheetColors: new Map(), addedRowsBySheet: new Map([['Sheet1', 25]]),
    rowHeightOverrides: new Map([['Sheet1', new Map([[1, 44], [2, 55]])]]), columnWidthOverrides: new Map([['Sheet1', new Map([[1, 144], [2, 155]])]]),
    cellTextOverrides: new Map([['Sheet1', new Map([['A2', 'Edited second'], ['E6', 'New cell']])]]),
    cellStyleOverrides: new Map([['Sheet1', new Map([['A2', { fontSize: 22, backgroundColor: '#ffff00' }]])]]),
    mergeOverrides: new Map(), formattingOverrides: new Map([['Sheet1', formatting()]]), scheduleSetups: new Map(),
    hiddenRangeToggles: new Map([['Sheet1', { row: [{ start: 1, end: 2 }], column: [{ start: 1, end: 2 }] }]]),
    selectedSheet: 'Sheet1', selection: { anchor: { r: 1, c: 0 }, focus: { r: 2, c: 4 }, axis: 'row' },
  }
}

const rowMove: AxisMove = { axis: 'row', start: 1, count: 2, before: 5 }

test('moving single or multiple headers inserts the block in either direction without losing or duplicating indexes', () => {
  for (const axis of ['row', 'column'] as const) for (let start = 0; start < 8; start++) for (let count = 1; count <= 8 - start; count++) for (let before = 0; before <= 8; before++) {
    const move = { axis, start, count, before }
    const original = Array.from({ length: 8 }, (_, index) => index)
    const expected = [...original]
    if (before < start || before > start + count) {
      const moved = expected.splice(start, count)
      expected.splice(before < start ? before : before - count, 0, ...moved)
    }
    const result: number[] = []
    original.forEach(index => { result[axisMoveIndex(index, move)] = index })
    assert.deepEqual(result, expected)
    for (let first = 0; first < 8; first++) for (let last = first; last < 8; last++) {
      const mapped = axisMoveRanges(first, last, move).flatMap(range => Array.from({ length: range.end - range.start + 1 }, (_, offset) => range.start + offset))
      assert.deepEqual(mapped, original.slice(first, last + 1).map(index => axisMoveIndex(index, move)).sort((a, b) => a - b))
    }
  }
})

test('row moves carry cell data, edits, comments, rich text, formulas, hidden metadata, heights, and selection', () => {
  const source = snapshot(), next = reorderWorkbookAxis(source, rowMove, formatting())
  const sheet = next.workbook.Sheets.Sheet1
  assert.deepEqual([sheet.A1.v, sheet.A2.v, sheet.A3.v, sheet.A4.v, sheet.A5.v, sheet.A6.v], ['First', 'Fourth', 'Fifth', 'Second', 'Third', 'Sixth'])
  assert.equal(sheet.A4, source.workbook.Sheets.Sheet1.A2)
  assert.equal(sheet.B4.f, '1+2')
  assert.equal(sheet.C4.previewFontRuns[0].text, 'Rich')
  assert.equal(next.cellTextOverrides.get('Sheet1')?.get('A4'), 'Edited second')
  assert.deepEqual(next.cellStyleOverrides.get('Sheet1')?.get('A4'), { fontSize: 22, backgroundColor: '#ffff00' })
  assert.deepEqual(sheet['!rows']?.[3], { hpt: 27, hidden: true })
  assert.equal(next.rowHeightOverrides.get('Sheet1')?.get(3), 44)
  assert.equal(next.columnWidthOverrides, source.columnWidthOverrides)
  assert.deepEqual(next.hiddenRangeToggles.get('Sheet1')?.row, [{ start: 3, end: 4 }])
  assert.equal(next.selection.anchor.r, 3)
  assert.equal(next.selection.focus.r, 4)
  assert.equal(next.workbook.Sheets.Other, source.workbook.Sheets.Other)
  assert.equal(source.workbook.Sheets.Sheet1.A2.v, 'Second')
  assert.equal(source.cellTextOverrides.get('Sheet1')?.get('A2'), 'Edited second')
})

test('column blocks move widths, hidden columns, formatting, and cells horizontally', () => {
  const source = snapshot()
  source.selection = { anchor: { r: 0, c: 1 }, focus: { r: 5, c: 2 }, axis: 'column' }
  const next = reorderWorkbookAxis(source, { axis: 'column', start: 1, count: 2, before: 5 }, formatting())
  assert.equal(next.workbook.Sheets.Sheet1.D2.f, '1+2')
  assert.equal(next.workbook.Sheets.Sheet1.E2.v, 'Rich')
  assert.deepEqual(next.workbook.Sheets.Sheet1['!cols']?.[3], { width: 27, hidden: true })
  assert.equal(next.columnWidthOverrides.get('Sheet1')?.get(3), 144)
  assert.equal(next.rowHeightOverrides, source.rowHeightOverrides)
  assert.deepEqual(next.formattingOverrides.get('Sheet1')?.columnIndexes, [{ first: 0, last: 0, styleId: 3 }, { first: 3, last: 3, styleId: 3 }])
  assert.deepEqual(next.hiddenRangeToggles.get('Sheet1')?.column, [{ start: 3, end: 4 }])
})

test('moving empty rows or columns beside an outline leaves mirrored borders with the bordered cells', () => {
  for (const axis of ['row', 'column'] as const) for (const edge of ['leading', 'trailing'] as const) for (const imported of [false, true]) {
    const source = snapshot(), coordinate = axis === 'row' ? 'r' : 'c'
    const position = { r: 1, c: 1, [coordinate]: edge === 'leading' ? 2 : 3 }
    const neighbor = { ...position, [coordinate]: edge === 'leading' ? 1 : 4 }
    const address = XLSX.utils.encode_cell(position), neighborAddress = XLSX.utils.encode_cell(neighbor)
    const side = axis === 'row' ? edge === 'leading' ? 'borderTop' : 'borderBottom' : edge === 'leading' ? 'borderLeft' : 'borderRight'
    const opposite = axis === 'row' ? edge === 'leading' ? 'borderBottom' : 'borderTop' : edge === 'leading' ? 'borderRight' : 'borderLeft'
    const line = '2px solid #000000'
    source.workbook.Sheets.Sheet1 = { '!ref': 'A1:G7', [address]: { t: 's', v: '' }, [neighborAddress]: { t: 's', v: '' } }
    source.cellTextOverrides = new Map()
    const emptyStyle = { [side]: line }, borderStyle = { [opposite]: line, backgroundColor: '#e3edda' }
    const styles: SheetPreviewFormatting = { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] }
    if (imported) {
      // Export/reimport writes explicit pale gridlines on the other edges.
      for (const gridSide of ['borderTop', 'borderRight', 'borderBottom', 'borderLeft']) {
        if (gridSide !== side) emptyStyle[gridSide] = '1px solid #D4D4D4'
      }
      source.previewStyles = { files: {}, sheetPaths: {}, cellStyles: [{}, emptyStyle, borderStyle], differentialStyles: [] }
      styles.indexes = new Map([[address, 1], [neighborAddress, 2]])
      source.cellStyleOverrides = new Map()
    } else source.cellStyleOverrides = new Map([['Sheet1', new Map([[address, emptyStyle], [neighborAddress, borderStyle]])]])
    const move: AxisMove = { axis, start: 2, count: 2, before: edge === 'leading' ? 6 : 0 }
    const next = reorderWorkbookAxis(source, move, styles)
    const movedAddress = XLSX.utils.encode_cell({ ...position, [coordinate]: axisMoveIndex(position[coordinate], move) })
    const remainingAddress = XLSX.utils.encode_cell({ ...neighbor, [coordinate]: axisMoveIndex(neighbor[coordinate], move) })
    assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(movedAddress)?.[side], 'none')
    if (imported) {
      assert.equal(next.formattingOverrides.get('Sheet1')?.indexes.get(remainingAddress), 2)
      assert.equal(source.previewStyles?.cellStyles[1][side], line)
    } else {
      assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(remainingAddress)?.[opposite], line)
      assert.equal(source.cellStyleOverrides.get('Sheet1')?.get(address)?.[side], line)
    }
    const restored = deserializeWorkbookState(serializeWorkbookState(next))
    assert.equal(restored.cellStyleOverrides.get('Sheet1')?.get(movedAddress)?.[side], 'none')
  }
})

test('moving bordered cells keeps their own outlines and removes the copies left on empty neighbors', () => {
  for (const axis of ['row', 'column'] as const) {
    const source = snapshot(), coordinate = axis === 'row' ? 'r' : 'c'
    const position = { r: 1, c: 1, [coordinate]: 2 }, neighbor = { ...position, [coordinate]: 1 }
    const address = XLSX.utils.encode_cell(position), neighborAddress = XLSX.utils.encode_cell(neighbor)
    const side = axis === 'row' ? 'borderTop' : 'borderLeft', opposite = axis === 'row' ? 'borderBottom' : 'borderRight'
    const line = '2px solid #000000'
    source.workbook.Sheets.Sheet1 = { '!ref': 'A1:G7', [address]: { t: 's', v: 'Border owner' }, [neighborAddress]: { t: 's', v: '' } }
    source.cellTextOverrides = new Map()
    source.cellStyleOverrides = new Map([['Sheet1', new Map([[address, { [side]: line }], [neighborAddress, { [opposite]: line }]])]])
    const styles: SheetPreviewFormatting = { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] }
    const next = reorderWorkbookAxis(source, { axis, start: 2, count: 1, before: 6 }, styles)
    const movedAddress = XLSX.utils.encode_cell({ ...position, [coordinate]: 5 })
    assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(movedAddress)?.[side], line)
    assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(neighborAddress)?.[opposite], 'none')
    assert.equal(source.cellStyleOverrides.get('Sheet1')?.get(neighborAddress)?.[opposite], line)
    const history = new EditHistory<WorkbookEditSnapshot>((a, b) => a === b)
    history.record(source); history.record(next)
    assert.equal(history.undo(), source)
    assert.equal(history.redo(), next)
  }
})

test('moving interior rows or columns preserves shared edges on the moved block and remaining border group', () => {
  const line = '2px solid #000000'
  for (const axis of ['row', 'column'] as const) for (const imported of [false, true]) for (const count of [1, 2]) for (const before of [0, 9]) {
    const source = snapshot(), coordinate = axis === 'row' ? 'r' : 'c'
    source.workbook.Sheets.Sheet1 = { '!ref': 'A1:J10' }
    source.cellTextOverrides = new Map()
    const styles: SheetPreviewFormatting = { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] }
    const cellStyles: CSSProperties[] = [{}]
    const edits = new Map<string, CSSProperties>()
    // Excel can store a shared grid edge on only one of its two cells.
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const address = XLSX.utils.encode_cell({ r, c })
      source.workbook.Sheets.Sheet1[address] = { t: 's', v: '' }
      const style = { borderBottom: line, borderRight: line, ...(r === 1 ? { borderTop: line } : {}), ...(c === 1 ? { borderLeft: line } : {}) }
      if (imported) { styles.indexes.set(address, cellStyles.length); cellStyles.push(style) }
      else edits.set(address, style)
    }
    source.previewStyles = { files: {}, sheetPaths: {}, cellStyles, differentialStyles: [] }
    source.cellStyleOverrides = new Map([['Sheet1', edits]])
    const move: AxisMove = { axis, start: 2, count, before }
    const next = reorderWorkbookAxis(source, move, styles)
    const leadingSide = axis === 'row' ? 'borderTop' : 'borderLeft', trailingSide = axis === 'row' ? 'borderBottom' : 'borderRight'
    for (let orthogonal = 1; orthogonal <= 5; orthogonal++) {
      const first = { r: orthogonal, c: orthogonal, [coordinate]: axisMoveIndex(2, move) }
      const last = { ...first, [coordinate]: axisMoveIndex(1 + count, move) }
      const following = { ...first, [coordinate]: axisMoveIndex(2 + count, move) }
      assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(XLSX.utils.encode_cell(first))?.[leadingSide], line)
      assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(XLSX.utils.encode_cell(last))?.[trailingSide], line)
      assert.equal(next.cellStyleOverrides.get('Sheet1')?.get(XLSX.utils.encode_cell(following))?.[leadingSide], line)
      assert.equal(edits.get(XLSX.utils.encode_cell({ r: orthogonal, c: orthogonal, [coordinate]: 2 }))?.[leadingSide], undefined)
    }
    const restored = deserializeWorkbookState(serializeWorkbookState(next))
    assert.deepEqual(restored.cellStyleOverrides.get('Sheet1'), next.cellStyleOverrides.get('Sheet1'))
  }
})

test('partly selected merges and insertion inside destination merges are rejected on both axes, including hidden rows/columns', () => {
  for (const axis of ['row', 'column'] as const) {
    const merge = XLSX.utils.decode_range('B2:D4')
    assert.throws(() => validateAxisMove({ axis, start: 2, count: 1, before: 6 }, [merge]), /Select all/)
    assert.throws(() => validateAxisMove({ axis, start: 0, count: 1, before: 2 }, [merge]), /drop would split/)
    assert.doesNotThrow(() => validateAxisMove({ axis, start: 1, count: 3, before: 6 }, [merge]))
    assert.doesNotThrow(() => validateAxisMove({ axis, start: 0, count: 1, before: 1 }, [merge]))
    assert.doesNotThrow(() => validateAxisMove({ axis, start: 0, count: 1, before: 4 }, [merge]))
  }
  const source = snapshot()
  source.mergeOverrides.set('Sheet1', [XLSX.utils.decode_range('A2:A4')])
  assert.throws(() => reorderWorkbookAxis(source, rowMove, formatting()), /Select all/)
  assert.equal(source.workbook.Sheets.Sheet1.A2.v, 'Second')
})

test('complete source and destination merges retain their anchors, shapes, and stored cells', () => {
  const source = snapshot()
  source.mergeOverrides.set('Sheet1', [XLSX.utils.decode_range('A2:B3'), XLSX.utils.decode_range('C4:D5')])
  const next = reorderWorkbookAxis(source, rowMove, formatting())
  assert.deepEqual(next.mergeOverrides.get('Sheet1')?.map(XLSX.utils.encode_range), ['A4:B5', 'C2:D3'])
  assert.equal(next.workbook.Sheets.Sheet1.A4.v, 'Second')
  assert.equal(next.workbook.Sheets.Sheet1.B4.f, '1+2')
  assert.deepEqual(next.workbook.Sheets.Sheet1['!merges'], next.mergeOverrides.get('Sheet1'))
})

test('conditional formatting follows moved cells even when its range becomes disjoint', () => {
  const next = reorderWorkbookAxis(snapshot(), rowMove, formatting())
  const styles = next.formattingOverrides.get('Sheet1')!
  assert.equal(styles.indexes.get('A4'), 1)
  assert.equal(styles.rowIndexes.get(3), 2)
  assert.deepEqual(styles.conditionalRules[0].ranges.map(XLSX.utils.encode_range), ['A1:B1', 'A4:B5'])
  const huge = axisMoveRanges(0, 1048575, rowMove)
  assert.deepEqual(huge, [{ start: 0, end: 1048575 }])
})

test('year assignments and Plot markers move with their rows, and moving above the registered header is blocked', () => {
  const source = snapshot()
  source.scheduleSetups.set('Sheet1', { header: XLSX.utils.decode_range('A1:U2'), columns: Array.from({ length: 21 }, (_, index) => index), years: new Map([[2, 1], [3, 2], [4, 3]]), rowStatuses: new Map([[2, 'Plot']]), statusColumn: 21 })
  const next = reorderWorkbookAxis(source, { axis: 'row', start: 2, count: 1, before: 5 }, formatting())
  assert.equal(next.scheduleSetups.get('Sheet1')?.years.get(4), 1)
  assert.equal(next.scheduleSetups.get('Sheet1')?.rowStatuses?.get(4), 'Plot')
  assert.throws(() => reorderWorkbookAxis(source, { axis: 'row', start: 2, count: 1, before: 0 }, formatting()), /below their registered header/)
  const reorderedFields = reorderWorkbookAxis(source, { axis: 'column', start: 2, count: 1, before: 5 }, formatting())
  assert.equal(reorderedFields.scheduleSetups.has('Sheet1'), false)
})

test('moves are one undoable snapshot and survive workbook save/reload and XLSX export', () => {
  const source = snapshot()
  source.mergeOverrides.set('Sheet1', [XLSX.utils.decode_range('A2:B3')])
  const history = new EditHistory<WorkbookEditSnapshot>((a, b) => a === b)
  history.record(source)
  const moved = reorderWorkbookAxis(source, rowMove, formatting())
  history.record(moved)
  assert.equal(history.undo(), source)
  assert.equal(history.redo(), moved)
  const restored = deserializeWorkbookState(serializeWorkbookState(moved))
  assert.equal(restored.cellTextOverrides.get('Sheet1')?.get('A4'), 'Edited second')
  assert.deepEqual(restored.mergeOverrides.get('Sheet1'), moved.mergeOverrides.get('Sheet1'))
  const exported = XLSX.read(createExcelExport(moved, ['Sheet1']), { type: 'array', cellStyles: true })
  assert.equal(exported.Sheets.Sheet1.A4.v, 'Edited second')
  assert.equal(exported.Sheets.Sheet1.A4.c[0].t, 'Keep comment')
  assert.deepEqual(exported.Sheets.Sheet1['!merges'], moved.mergeOverrides.get('Sheet1'))
})

test('dropping within the selected block is a no-op and out-of-range moves are rejected', () => {
  const source = snapshot()
  assert.equal(reorderWorkbookAxis(source, { ...rowMove, before: 2 }, formatting()), source)
  assert.throws(() => validateAxisMove({ axis: 'column', start: 16383, count: 2, before: 0 }, []), /limits/)
})
