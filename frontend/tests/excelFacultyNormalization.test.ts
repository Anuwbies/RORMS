import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { canonicalizeFacultyText, canonicalizeFacultyFontRuns } from '../src/utils/excelFacultySuggestions.ts'
import { canonicalizeWorkbookFaculty } from '../src/utils/excelFacultyNormalization.ts'
import { scheduleHeaderValues } from '../src/utils/excelScheduleTemplate.ts'
import { serializeWorkbookState, deserializeWorkbookState, type WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { EditHistory } from '../src/utils/editHistory.ts'
import { createExcelExport } from '../src/utils/excelWorkbookExport.ts'

const names = ['Rodas, Allen Francis', 'De La Cruz, José', 'Narvasa, Jan Julienne']

test('uses the directory spelling, capitalization and name order for exact full-name matches', () => {
  assert.equal(canonicalizeFacultyText('RODAS, ALLEN FRANCIS', names), names[0])
  assert.equal(canonicalizeFacultyText('ALLEN FRANCIS RODAS', names), names[0])
  assert.equal(canonicalizeFacultyText('DE LA CRUZ, JOSE', names), names[1])
  assert.equal(canonicalizeFacultyText('  RODAS,   ALLEN FRANCIS  ', names), `  ${names[0]}  `)
})

test('formats every faculty entry, preserves positions and separators, and capitalizes TBA', () => {
  const text = 'RODAS, ALLEN FRANCIS / tba;UNKNOWN\r\nJAN JULIENNE NARVASA / N/A'
  assert.equal(canonicalizeFacultyText(text, names), `${names[0]} / TBA;Unknown\r\n${names[2]} / N/A`)
  assert.equal(canonicalizeFacultyText('RODAS', names), 'Rodas')
  assert.equal(canonicalizeFacultyText('JOSE DE LA CRUZ', ['De la Cruz, José', 'De la Cruz, Jose']), 'Cruz, Jose De La')
  assert.equal(canonicalizeFacultyText('N/A', ['N', 'A']), 'N/A')
  assert.equal(canonicalizeFacultyText('tba', ['TBA']), 'TBA')
  assert.equal(canonicalizeFacultyText(text, []), `${names[0]} / TBA;Unknown\r\n${names[2]} / N/A`)
})

test('unmatched names use title case and surname-first order with the last word as the fallback surname', () => {
  assert.equal(canonicalizeFacultyText('SMITH, JOHN PAUL', names), 'Smith, John Paul')
  assert.equal(canonicalizeFacultyText('john paul smith', names), 'Smith, John Paul')
  assert.equal(canonicalizeFacultyText('DE LA CRUZ, ALLEN FRANCIS', []), 'De La Cruz, Allen Francis')
  assert.equal(canonicalizeFacultyText("O’NEILL, JEAN-LUC", []), 'O’Neill, Jean-Luc')
  assert.equal(canonicalizeFacultyText('tBa / TBA; tba', []), 'TBA / TBA; TBA')
  assert.equal(canonicalizeFacultyText('RODAS,', []), 'Rodas,')
  assert.equal(canonicalizeFacultyText('RODAS, ', []), 'Rodas, ')
  assert.equal(canonicalizeFacultyText(' / ;\n', []), ' / ;\n')
  for (const input of ['john paul smith', 'RODAS, ', 'tba', 'DE LA CRUZ, ALLEN FRANCIS']) {
    const normalized = canonicalizeFacultyText(input, [])
    assert.equal(canonicalizeFacultyText(normalized, []), normalized)
  }
})

test('keeps each faculty font and the separator font while changing case', () => {
  const runs = [{ text: 'RODAS, ALLEN FRANCIS', fontFamily: 'Arial' }, { text: ' / ', fontFamily: 'Times New Roman' }, { text: 'NARVASA, JAN JULIENNE', fontFamily: 'Calibri' }]
  assert.deepEqual(canonicalizeFacultyFontRuns(runs, names), [
    { ...runs[0], text: names[0] }, runs[1], { ...runs[2], text: names[2] },
  ])
  assert.equal(runs[0].text, 'RODAS, ALLEN FRANCIS')
  assert.deepEqual(canonicalizeFacultyFontRuns(runs, []), [
    { ...runs[0], text: names[0] }, runs[1], { ...runs[2], text: names[2] },
  ])
})

function snapshot(): WorkbookEditSnapshot {
  const sheet = XLSX.utils.aoa_to_sheet(scheduleHeaderValues())
  sheet.N3 = { t: 's', v: 'RODAS, ALLEN FRANCIS', previewFontRuns: [{ text: 'RODAS, ALLEN FRANCIS', fontFamily: 'Calibri' }] } as XLSX.CellObject
  sheet.O3 = { t: 's', v: 'JAN JULIENNE NARVASA / tba' }
  sheet.P3 = { t: 's', v: 'RODAS, ALLEN FRANCIS' }
  sheet.N5 = { t: 's', v: 'RODAS, ALLEN FRANCIS', f: 'N3' }
  sheet['!ref'] = 'A1:W5'
  sheet['!merges'] = [{ s: { r: 2, c: 13 }, e: { r: 3, c: 13 } }]
  sheet['!rows'] = [undefined, undefined, { hidden: true }]
  return {
    workbook: { SheetNames: ['UY', 'Notes'], Sheets: { UY: sheet, Notes: { N3: { t: 's', v: 'RODAS, ALLEN FRANCIS' }, '!ref': 'N3:N3' } }, Workbook: { Sheets: [{ name: 'UY', Hidden: 1 }, { name: 'Notes' }] } },
    scheduleSetups: new Map([['UY', { header: { s: { r: 0, c: 0 }, e: { r: 1, c: 20 } }, columns: Array.from({ length: 21 }, (_, i) => i), years: new Map([[2, 3]]) }]]),
    previewStyles: null, sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(), columnWidthOverrides: new Map(), cellTextOverrides: new Map(),
    cellStyleOverrides: new Map([['UY', new Map([['N3', { color: '#123456', backgroundColor: '#abcdef', fontSize: '18px', borderLeft: '1px solid black' }]])]]),
    mergeOverrides: new Map(), formattingOverrides: new Map(), hiddenRangeToggles: new Map(),
    selectedSheet: 'UY', selection: { anchor: { r: 2, c: 13 }, focus: { r: 2, c: 13 } },
  }
}

test('normalizes configured faculty cells including hidden and merged cells, preserves formatting and skips formulas and other columns/sheets', () => {
  const original = snapshot()
  const normalized = canonicalizeWorkbookFaculty(original, names)
  assert.equal(normalized.cellTextOverrides.get('UY')?.get('N3'), names[0])
  assert.equal(normalized.cellTextOverrides.get('UY')?.get('O3'), `${names[2]} / TBA`)
  assert.equal(normalized.cellTextOverrides.get('UY')?.has('P3'), false)
  assert.equal(normalized.cellTextOverrides.get('UY')?.has('N5'), false)
  assert.equal(normalized.workbook.Sheets.Notes, original.workbook.Sheets.Notes)
  assert.equal(normalized.cellStyleOverrides, original.cellStyleOverrides)
  assert.equal(normalized.workbook.Sheets.UY['!merges'], original.workbook.Sheets.UY['!merges'])
  assert.equal(normalized.workbook.Sheets.UY['!rows'], original.workbook.Sheets.UY['!rows'])
  assert.equal(original.cellTextOverrides.size, 0)
  assert.equal(canonicalizeWorkbookFaculty(normalized, names), normalized)
  const reopened = deserializeWorkbookState(serializeWorkbookState(normalized), {})
  assert.equal(reopened.cellTextOverrides.get('UY')?.get('N3'), names[0])
  const exported = XLSX.read(createExcelExport(normalized, ['UY']), { type: 'array' })
  assert.equal(exported.Sheets.UY.N3.v, names[0])
})

test('uses text overrides and skips invalid or missing schedule setups', () => {
  const original = snapshot()
  original.cellTextOverrides.set('UY', new Map([['N3', 'DE LA CRUZ, JOSE']]))
  assert.equal(canonicalizeWorkbookFaculty(original, names).cellTextOverrides.get('UY')?.get('N3'), names[1])
  original.workbook.Sheets.UY.A1.v = 'Not the schedule header'
  assert.equal(canonicalizeWorkbookFaculty(original, names), original)
  const unconfigured = snapshot()
  unconfigured.scheduleSetups.clear()
  assert.equal(canonicalizeWorkbookFaculty(unconfigured, names), unconfigured)
  const emptyDirectory = snapshot()
  const normalized = canonicalizeWorkbookFaculty(emptyDirectory, [])
  assert.equal(normalized.cellTextOverrides.get('UY')?.get('N3'), names[0])
  assert.equal(normalized.cellTextOverrides.get('UY')?.get('O3'), `${names[2]} / TBA`)
  assert.equal(canonicalizeWorkbookFaculty(normalized, []), normalized)
})

test('normalization preserves undo and redo across a delayed directory load', () => {
  const initial = snapshot()
  const edited = { ...initial, cellTextOverrides: new Map([['UY', new Map([['P3', 'Edited time']])]]) }
  const history = new EditHistory<WorkbookEditSnapshot>((a, b) => a.workbook === b.workbook && a.cellTextOverrides === b.cellTextOverrides)
  history.record(initial)
  history.record(edited)
  const normalize = (state: WorkbookEditSnapshot) => canonicalizeWorkbookFaculty(state, names)
  history.transform(normalize)
  assert.equal(history.undo()?.cellTextOverrides.get('UY')?.get('N3'), names[0])
  const redo = history.redo()
  assert.equal(redo?.cellTextOverrides.get('UY')?.get('N3'), names[0])
  assert.equal(redo?.cellTextOverrides.get('UY')?.get('P3'), 'Edited time')
})
