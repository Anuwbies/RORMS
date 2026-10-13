import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { strFromU8, unzipSync } from 'fflate'
import { createExcelExport } from '../src/utils/excelWorkbookExport.ts'
import type { WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { clearRangeText } from '../src/utils/excelGridEdits.ts'

function exportedBorder(bytes: Uint8Array, address: string): string {
  const files = unzipSync(bytes)
  const sheetXml = strFromU8(files['xl/worksheets/sheet1.xml'])
  const stylesXml = strFromU8(files['xl/styles.xml'])
  const cell = [...sheetXml.matchAll(/<c\b([^>]*)>/g)].find(match => match[1].includes(`r="${address}"`))
  assert.ok(cell, `Expected exported cell ${address}`)
  const styleId = Number(cell[1].match(/\bs="(\d+)"/)?.[1] || 0)
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)![1].match(/<xf\b[^>]*?\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)!
  const borderId = Number(xfs[styleId].match(/\bborderId="(\d+)"/)?.[1] || 0)
  return stylesXml.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)![1].match(/<border>[\s\S]*?<\/border>/g)![borderId]
}

function snapshot(): WorkbookEditSnapshot {
  return {
    workbook: {
      SheetNames: ['First', 'Second', 'Hidden'],
      Sheets: {
        First: { '!ref': 'A1:D3', A1: { t: 's', v: 'Original', c: [{ a: 'Author', t: 'Keep comment' }] }, A2: { t: 's', v: 'Clear me' }, B1: { t: 'n', v: 3, f: '1+2' }, C1: { t: 'n', v: 0.5, z: '0.00%' }, '!rows': [{ hpt: 20 }, { hidden: true }], '!cols': [{ width: 20 }, { hidden: true }] },
        Second: { '!ref': 'A1', A1: { t: 's', v: 'Second sheet' } },
        Hidden: { '!ref': 'A1', A1: { t: 's', v: 'Hidden sheet' } },
      },
      Workbook: { Sheets: [{ name: 'First' }, { name: 'Second' }, { name: 'Hidden', Hidden: 1 }] },
    },
    previewStyles: null,
    cellTextOverrides: new Map([['First', new Map([['A1', 'Edited & <new>'], ['A2', ''], ['D3', 'New cell']])]]),
    cellStyleOverrides: new Map([['First', new Map([['A1', { backgroundColor: '#ffff00', color: '#62853e', fontFamily: 'Arial', fontSize: '16pt', fontWeight: 'bold', borderBottom: '2px solid #000000', textAlign: 'center', whiteSpace: 'pre-wrap' }]])]]),
    mergeOverrides: new Map([['First', [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }]]]),
    rowHeightOverrides: new Map([['First', new Map([[0, 40]])]]),
    columnWidthOverrides: new Map([['First', new Map([[0, 160]])]]),
    addedRowsBySheet: new Map(), formattingOverrides: new Map(), scheduleSetups: new Map(), hiddenRangeToggles: new Map(),
    sheetColors: new Map([['First', '#62853e']]), selectedSheet: 'First', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}

test('exports only chosen sheets in workbook order with current edits, formulas, comments and dimensions', () => {
  const current = snapshot()
  const before = JSON.stringify(current.workbook)
  const bytes = createExcelExport(current, ['Hidden', 'First'])
  const exported = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true })
  assert.deepEqual(exported.SheetNames, ['First', 'Hidden'])
  assert.equal(exported.Sheets.First.A1.v, 'Edited & <new>')
  assert.equal(exported.Sheets.First.A2.v ?? '', '')
  assert.equal(exported.Sheets.First.D3.v, 'New cell')
  assert.equal(exported.Sheets.First.B1.f, '1+2')
  assert.equal(exported.Sheets.First.C1.z, '0.00%')
  assert.equal(exported.Sheets.First.A1.c?.[0].t, 'Keep comment')
  assert.deepEqual(exported.Sheets.First['!merges'], [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }])
  assert.equal(exported.Sheets.First['!rows']?.[0].hpt, 30)
  assert.equal(exported.Sheets.First['!rows']?.[1].hidden, true)
  assert.equal(exported.Sheets.First['!cols']?.[1].hidden, true)
  assert.ok(Math.abs((exported.Sheets.First['!cols']?.[0].wpx ?? 0) - 160) < 8)
  assert.equal(exported.Workbook?.Sheets?.[1].Hidden, 1)
  assert.equal(JSON.stringify(current.workbook), before)
  assert.equal(current.cellTextOverrides.get('First')?.get('A1'), 'Edited & <new>')
})

test('exports cell formatting and tab colors into actual XLSX styles', () => {
  const bytes = createExcelExport(snapshot(), ['First'])
  const files = unzipSync(bytes)
  const style = strFromU8(files['xl/styles.xml'])
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
  assert.match(style, /<fgColor rgb="FFFFFF00"\/>/)
  assert.match(style, /<sz val="16"\/>/)
  assert.match(style, /<b\/>/)
  assert.match(style, /<bottom style="medium"><color rgb="FF000000"\/><\/bottom>/)
  assert.match(style, /horizontal="center" wrapText="1"/)
  assert.match(sheet, /<tabColor rgb="FF62853E"\/>/)
  const styleId = Number(sheet.match(/<c\b[^>]*r="A1"[^>]*s="(\d+)"/)?.[1])
  assert.ok(styleId > 0)
  const exported = XLSX.read(bytes, { type: 'array', cellStyles: true })
  assert.equal(exported.Sheets.First.A1.s.fgColor.rgb, 'FFFF00')
})

test('exporting hidden sheets alone makes one visible without changing the original workbook', () => {
  const current = snapshot()
  const exported = XLSX.read(createExcelExport(current, ['Hidden']), { type: 'array' })
  assert.deepEqual(exported.SheetNames, ['Hidden'])
  assert.equal(exported.Workbook?.Sheets?.[0].Hidden, 0)
  assert.equal(current.workbook.Workbook?.Sheets?.[2].Hidden, 1)
})

test('export requires a nonempty valid selection', () => {
  assert.throws(() => createExcelExport(snapshot(), []), /Choose at least one/)
  assert.throws(() => createExcelExport(snapshot(), ['Unknown']), /valid sheet/)
})

test('inherited row and column formatting preserves styled blank cells, hidden columns and merged borders', () => {
  const current = snapshot()
  current.previewStyles = { files: {}, sheetPaths: {}, cellStyles: [{}, { backgroundColor: '#e3edda' }, { borderRight: '1px solid #000000' }], differentialStyles: [] }
  current.formattingOverrides.set('First', {
    indexes: new Map([['B3', 2]]), rowIndexes: new Map([[2, 1]]),
    columnIndexes: [{ first: 1, last: 1, styleId: 1 }, { first: 0, last: 5, styleId: 0 }], conditionalRules: [],
  })
  const bytes = createExcelExport(current, ['First'])
  const exported = XLSX.read(bytes, { type: 'array', cellStyles: true })
  assert.equal(exported.Sheets.First.A3.s.fgColor.rgb, 'E3EDDA')
  assert.equal(exported.Sheets.First['!cols']?.[1].hidden, true)
  const sheetXml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml'])
  const columns = [...sheetXml.matchAll(/<col\b[^>]*min="(\d+)"[^>]*max="(\d+)"/g)].map(match => ({ start: Number(match[1]), end: Number(match[2]) }))
  assert.ok(columns.every((column, index) => index === 0 || column.start > columns[index - 1].end))
  const stylesXml = strFromU8(unzipSync(bytes)['xl/styles.xml'])
  assert.match(stylesXml, /<right style="thin"><color rgb="FF000000"\/><\/right>/)
})

test('exports edited rich font runs and handles blank sheets', () => {
  const current = snapshot()
  current.workbook.Sheets.First.A1.previewFontRuns = [{ text: 'Edited & ', fontFamily: 'Arial' }, { text: '<new>', fontFamily: 'Calibri' }]
  const bytes = createExcelExport(current, ['First'])
  const exported = XLSX.read(bytes, { type: 'array' })
  assert.equal(exported.Sheets.First.A1.v, 'Edited & <new>')
  const sheetXml = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml'])
  assert.match(sheetXml, /<rFont val="Calibri"\/>/)
  current.workbook = { SheetNames: ['Blank'], Sheets: { Blank: { '!ref': 'A1:Z30' } } }
  const emptyExport = XLSX.read(createExcelExport(current, ['Blank']), { type: 'array' })
  assert.deepEqual(emptyExport.SheetNames, ['Blank'])
  assert.equal(emptyExport.Sheets.Blank['!ref'], 'A1:Z30')
})

test('clearing filled cells and removing their borders retains the editor grid in export', () => {
  const current = snapshot()
  current.mergeOverrides.set('First', [])
  current.previewStyles = { files: {}, sheetPaths: {}, cellStyles: [{ backgroundColor: '#ffffff', borderTop: '2px solid #000000', borderRight: '2px solid #000000', borderBottom: '2px solid #000000', borderLeft: '2px solid #000000' }], differentialStyles: [] }
  current.formattingOverrides.set('First', { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] })
  current.cellTextOverrides.set('First', clearRangeText(current.workbook.Sheets.First, new Map(), { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, []))
  current.cellStyleOverrides.set('First', new Map(['A1', 'A2'].map(address => [address, { borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none' }])))
  const bytes = createExcelExport(current, ['First'])
  const exported = XLSX.read(bytes, { type: 'array', cellStyles: true })
  for (const address of ['A1', 'A2']) {
    assert.equal(exported.Sheets.First[address].v, '')
    assert.equal(exported.Sheets.First[address].s.fgColor.rgb, 'FFFFFF')
    const border = exportedBorder(bytes, address)
    for (const side of ['top', 'right', 'bottom', 'left']) assert.ok(border.includes(`<${side} style="thin"><color rgb="FFD4D4D4"/></${side}>`))
  }
  assert.match(exportedBorder(bytes, 'B1'), /<bottom style="medium"><color rgb="FF000000"\/><\/bottom>/)
  assert.equal(current.cellStyleOverrides.get('First')?.get('A1')?.borderBottom, 'none')
})

test('filled cells with inherited formatting also export light grid lines', () => {
  const current = snapshot()
  current.previewStyles = { files: {}, sheetPaths: {}, cellStyles: [{ backgroundColor: '#ffffff' }], differentialStyles: [] }
  current.formattingOverrides.set('First', { indexes: new Map(), rowIndexes: new Map([[1, 0]]), columnIndexes: [{ first: 0, last: 3, styleId: 0 }], conditionalRules: [] })
  const bytes = createExcelExport(current, ['First'])
  assert.match(exportedBorder(bytes, 'A2'), /<bottom style="thin"><color rgb="FFD4D4D4"\/><\/bottom>/)
})

test('merged cells retain perimeter grid lines without adding internal grid lines', () => {
  const current = snapshot()
  current.mergeOverrides.set('First', [{ s: { r: 3, c: 0 }, e: { r: 4, c: 1 } }])
  const bytes = createExcelExport(current, ['First'])
  const topLeft = exportedBorder(bytes, 'A4')
  const bottomRight = exportedBorder(bytes, 'B5')
  assert.match(topLeft, /<top style="thin">/)
  assert.match(topLeft, /<left style="thin">/)
  assert.match(topLeft, /<right\/>/)
  assert.match(topLeft, /<bottom\/>/)
  assert.match(bottomRight, /<right style="thin">/)
  assert.match(bottomRight, /<bottom style="thin">/)
  assert.match(bottomRight, /<top\/>/)
  assert.match(bottomRight, /<left\/>/)
})
