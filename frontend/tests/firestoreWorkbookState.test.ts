import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { deserializeWorkbookState, type WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { serializeFirestoreWorkbookState, splitFirestoreWorkbookState, joinFirestoreWorkbookState, joinSheetParts, MAX_SHEET_JSON_BYTES, MAX_SHEET_PART_BYTES } from '../src/utils/firestoreWorkbookState.ts'
import { createExcelExport } from '../src/utils/excelWorkbookExport.ts'

function fixture(): WorkbookEditSnapshot {
  const formatting = () => ({ indexes: new Map([['A1', 1]]), rowIndexes: new Map([[1, 1]]), columnIndexes: [{ first: 0, last: 0, styleId: 1 }], conditionalRules: [] })
  return {
    workbook: { SheetNames: ['First', 'Hidden'], Sheets: {
      First: { '!ref': 'A1:B3', A1: { t: 's', v: 'Original', c: [{ a: 'Dean', t: 'Keep comment', resolved: true }] }, B1: { t: 'n', v: 3, f: '1+2' }, '!rows': [{ hpt: 26 }], '!cols': [{ wpx: 180 }] },
      Hidden: { '!ref': 'A1', A1: { t: 's', v: 'Hidden subject' } },
    }, Props: { CreatedDate: new Date('2026-10-10T00:00:00Z') }, Workbook: { Sheets: [{ name: 'First' }, { name: 'Hidden', Hidden: 1 }] } },
    previewStyles: { files: { 'xl/worksheets/sheet1.xml': new TextEncoder().encode('DO NOT PERSIST THIS SOURCE XML') }, sheetPaths: { First: 'xl/worksheets/sheet1.xml' }, cellStyles: [{}, { backgroundColor: '#62853e' }], differentialStyles: [] },
    sheetColors: new Map([['Hidden', '#f59e0b']]), addedRowsBySheet: new Map([['First', 2]]),
    rowHeightOverrides: new Map([['First', new Map([[1, 40]])]]), columnWidthOverrides: new Map([['First', new Map([[1, 200]])]]),
    cellTextOverrides: new Map([['First', new Map([['A1', 'Edited subject']])]]), cellStyleOverrides: new Map([['First', new Map([['A1', { fontWeight: 'bold' }]])]]),
    mergeOverrides: new Map([['First', [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }]]]),
    formattingOverrides: new Map([['First', formatting()], ['Hidden', formatting()]]),
    scheduleSetups: new Map(), hiddenRangeToggles: new Map([['First', { row: [{ start: 1, end: 1 }], column: [] }]]),
    selectedSheet: 'Hidden', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}

test('per-sheet text restores values, comments, styles, hidden sheets, dimensions and selection without XLSX/XML', () => {
  const current = fixture()
  const state = serializeFirestoreWorkbookState(current)
  const { manifest, sheets } = splitFirestoreWorkbookState(state)
  assert.equal(sheets.length, 2)
  for (const sheet of sheets) {
    const restored = deserializeWorkbookState(sheet.json, {})
    assert.deepEqual(restored.workbook.SheetNames, [sheet.name])
    assert.deepEqual(Object.keys(restored.workbook.Sheets), [sheet.name])
    assert.equal(restored.previewStyles?.files && Object.keys(restored.previewStyles.files).length, 0)
    assert.deepEqual(restored.previewStyles?.sheetPaths, {})
    assert.ok(sheet.byteLength < MAX_SHEET_JSON_BYTES)
    assert.equal(sheet.json.includes('DO NOT PERSIST'), false)
  }
  const restored = deserializeWorkbookState(joinFirestoreWorkbookState(manifest, sheets), {})
  assert.deepEqual(restored.workbook, current.workbook)
  assert.deepEqual(restored.cellTextOverrides, current.cellTextOverrides)
  assert.deepEqual(restored.cellStyleOverrides, current.cellStyleOverrides)
  assert.deepEqual(restored.formattingOverrides, current.formattingOverrides)
  assert.deepEqual(restored.rowHeightOverrides, current.rowHeightOverrides)
  assert.deepEqual(restored.columnWidthOverrides, current.columnWidthOverrides)
  assert.deepEqual(restored.mergeOverrides, current.mergeOverrides)
  assert.deepEqual(restored.hiddenRangeToggles, current.hiddenRangeToggles)
  assert.equal(restored.selectedSheet, 'Hidden')
  assert.deepEqual(restored.selection, current.selection)
  assert.ok(current.previewStyles?.files['xl/worksheets/sheet1.xml'])
})

test('restored Firestore sheets can still export locally with edited text, formula, comments and dimensions', () => {
  const { manifest, sheets } = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(fixture()))
  const restored = deserializeWorkbookState(joinFirestoreWorkbookState(manifest, sheets), {})
  const exported = XLSX.read(createExcelExport(restored, ['First', 'Hidden']), { type: 'array', cellStyles: true })
  assert.deepEqual(exported.SheetNames, ['First', 'Hidden'])
  assert.equal(exported.Sheets.First.A1.v, 'Edited subject')
  assert.equal(exported.Sheets.First.A1.c?.[0].t, 'Keep comment')
  assert.equal(exported.Sheets.First.B1.f, '1+2')
  assert.equal(exported.Sheets.First['!rows']?.[1].hpt, 30)
  assert.equal(exported.Workbook?.Sheets?.[1].Hidden, 1)
})

test('large sheets split safely at UTF-8 code points and reassemble with every character intact', () => {
  const current = fixture()
  const text = '漢😀'.repeat(420000)
  current.workbook.Sheets.Hidden.A1.v = text
  const { manifest, sheets, parts } = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(current))
  const largeParts = parts.filter(part => part.sheetId === 'sheet_1')
  assert.ok(largeParts.length > 1)
  for (const part of largeParts) {
    assert.ok(part.byteLength <= MAX_SHEET_PART_BYTES)
    assert.equal(part.byteLength, new TextEncoder().encode(part.json).byteLength)
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(part.json)), part.json)
  }
  const joined = joinSheetParts('sheet_1', 'Hidden', largeParts)
  assert.equal(joined.json, sheets[1].json)
  const restored = deserializeWorkbookState(joinFirestoreWorkbookState(manifest, [sheets[0], joined]), {})
  assert.equal(restored.workbook.Sheets.Hidden.A1.v, text)
  assert.throws(() => joinSheetParts('sheet_1', 'Hidden', largeParts.slice(1)), /incomplete/)
  assert.throws(() => joinSheetParts('sheet_1', 'Hidden', [...largeParts].reverse()), /invalid/)
  assert.throws(() => joinSheetParts('sheet_1', 'Hidden', [largeParts[0], ...largeParts.slice(0, -1)]), /invalid/)
  assert.throws(() => joinSheetParts('sheet_1', 'Hidden', [{ ...largeParts[0], json: largeParts[0].json.slice(1) }, ...largeParts.slice(1)]), /invalid/)
})

test('missing, reordered, duplicate and truncated sheets cannot silently reopen as a partial workbook', () => {
  const { manifest, sheets } = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(fixture()))
  assert.throws(() => joinFirestoreWorkbookState(manifest, sheets.slice(0, 1)), /incomplete/)
  assert.throws(() => joinFirestoreWorkbookState(manifest, [...sheets].reverse()), /invalid/)
  assert.throws(() => joinFirestoreWorkbookState({ ...manifest, sheetIds: ['sheet_0', 'sheet_0'] }, sheets), /incomplete/)
  assert.throws(() => joinFirestoreWorkbookState(manifest, [{ ...sheets[0], json: sheets[0].json.slice(1) }, sheets[1]]), /invalid/)
})

test('new empty sheets get standalone formatting settings', () => {
  const current = fixture()
  current.previewStyles = null
  current.formattingOverrides.clear()
  const { sheets } = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(current))
  assert.equal(sheets.length, 2)
  assert.ok(deserializeWorkbookState(sheets[0].json, {}).formattingOverrides.has('First'))
})

test('a small text edit does not shift chunks containing large resolved formatting', () => {
  const current = fixture()
  const formatting = current.formattingOverrides.get('First')!
  formatting.indexes = new Map(Array.from({ length: 100000 }, (_, index) => [`A${index + 1}`, 1]))
  const original = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(current))
  current.cellTextOverrides.get('First')!.set('A1', 'One text added to the saved sheet')
  const edited = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(current))
  const originalParts = original.parts.filter(part => part.sheetId === 'sheet_0')
  const editedParts = edited.parts.filter(part => part.sheetId === 'sheet_0')
  assert.ok(originalParts.length > 2)
  assert.equal(editedParts.length, originalParts.length)
  assert.equal(editedParts.filter((part, index) => part.json !== originalParts[index].json).length, 1)
  assert.deepEqual(editedParts.slice(0, -1).map(part => part.json), originalParts.slice(0, -1).map(part => part.json))
})
