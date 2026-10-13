import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { ensureScheduleStatusColumns, materializeScheduleStatuses, scheduleStatusText, rangeIncludesScheduleStatus, selectionHasScheduleStatusText, scheduleStatusSelectionHighlight } from '../src/utils/excelScheduleStatusColumn.ts'
import { scheduleHeaderValues, moveScheduleSetup, detectScheduleSetup, plotScheduleRows } from '../src/utils/excelScheduleTemplate.ts'
import { serializeWorkbookState, deserializeWorkbookState, type WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { createExcelExport } from '../src/utils/excelWorkbookExport.ts'
import { clearRangeText } from '../src/utils/excelGridEdits.ts'

function snapshot(): WorkbookEditSnapshot {
  const sheet = XLSX.utils.aoa_to_sheet(scheduleHeaderValues().map(row => ['', ...row]))
  sheet.B3 = { t: 's', v: 'College' }
  sheet.D3 = { t: 's', v: 'ITE 101' }
  sheet.E3 = { t: 's', v: 'Subject' }
  sheet.D4 = { t: 's', v: 'ITE 102' }
  sheet.E4 = { t: 's', v: 'Other subject' }
  sheet.W3 = { t: 's', v: 'Right-hand data' }
  sheet['!ref'] = 'A1:X6'
  sheet['!merges'] = [{ s: { r: 4, c: 22 }, e: { r: 4, c: 23 } }]
  sheet['!cols'] = Array.from({ length: 24 }, () => ({ width: 20 }))
  return {
    workbook: { SheetNames: ['Schedule'], Sheets: { Schedule: sheet } }, previewStyles: null,
    sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map([['Schedule', new Map([[2, 35]])]]),
    columnWidthOverrides: new Map([['Schedule', new Map([[22, 180]])]]),
    cellTextOverrides: new Map([['Schedule', new Map([['W3', 'Edited right-hand data']])]]),
    cellStyleOverrides: new Map([['Schedule', new Map([['W3', { fontSize: 18 }]])]]), mergeOverrides: new Map(),
    formattingOverrides: new Map([['Schedule', { indexes: new Map([['W3', 2]]), rowIndexes: new Map(), columnIndexes: [{ first: 22, last: 23, styleId: 2 }], conditionalRules: [] }]]),
    scheduleSetups: new Map([['Schedule', { header: { s: { r: 0, c: 1 }, e: { r: 1, c: 21 } }, columns: Array.from({ length: 21 }, (_, index) => index + 1), years: new Map([[2, 1], [3, 1], [4, 1], [5, 1]]), rowStatuses: new Map([[3, 'Plot']]), includesEmptyRows: true }]]),
    hiddenRangeToggles: new Map([['Schedule', { row: [], column: [{ start: 22, end: 23 }] }]]), selectedSheet: 'Schedule',
    selection: { anchor: { r: 2, c: 22 }, focus: { r: 2, c: 22 } },
  }
}

test('selecting Status highlights only the schedule columns on those rows without expanding the editing selection', () => {
  const setup = ensureScheduleStatusColumns(snapshot()).scheduleSetups.get('Schedule')!
  const selected = { s: { r: 2, c: 22 }, e: { r: 2, c: 22 } }
  assert.deepEqual(scheduleStatusSelectionHighlight(setup, selected), { s: { r: 2, c: 1 }, e: { r: 2, c: 22 } })
  assert.deepEqual(selected, { s: { r: 2, c: 22 }, e: { r: 2, c: 22 } })
  const multiple = { s: { r: 2, c: 22 }, e: { r: 4, c: 22 } }
  assert.deepEqual(scheduleStatusSelectionHighlight(setup, multiple), { s: { r: 2, c: 1 }, e: { r: 4, c: 22 } })
  for (const range of [
    { s: { r: 0, c: 22 }, e: { r: 1, c: 22 } },
    { s: { r: 2, c: 21 }, e: { r: 2, c: 21 } },
    { s: { r: 2, c: 23 }, e: { r: 2, c: 23 } },
    { s: { r: 2, c: 21 }, e: { r: 2, c: 22 } },
  ]) assert.equal(scheduleStatusSelectionHighlight(setup, range), range)
  assert.equal(scheduleStatusSelectionHighlight(undefined, selected), selected)
  assert.equal(scheduleStatusSelectionHighlight({ ...setup, statusColumn: undefined }, selected), selected)
})

test('Status remains text-protected when merged vertically or with neighboring columns', () => {
  assert.equal(rangeIncludesScheduleStatus({ s: { r: 2, c: 22 }, e: { r: 5, c: 22 } }, 22), true)
  assert.equal(rangeIncludesScheduleStatus({ s: { r: 2, c: 21 }, e: { r: 5, c: 23 } }, 22), true)
  assert.equal(rangeIncludesScheduleStatus({ s: { r: 2, c: 20 }, e: { r: 5, c: 21 } }, 22), false)
  assert.equal(rangeIncludesScheduleStatus({ s: { r: 2, c: 23 }, e: { r: 5, c: 24 } }, 22), false)
  assert.equal(rangeIncludesScheduleStatus({ s: { r: 2, c: 21 }, e: { r: 5, c: 23 } }), false)
  const sheet = { V3: { t: 's' as const, v: 'Merged content' }, W3: { t: 's' as const, v: 'Plot' }, X3: { t: 's' as const, v: 'Clear me' } }
  const range = { s: { r: 2, c: 21 }, e: { r: 2, c: 23 } }
  const merge = { s: { r: 2, c: 21 }, e: { r: 2, c: 22 } }
  const cleared = clearRangeText(sheet, new Map(), range, [merge], 22)
  assert.equal(cleared.has('V3'), false)
  assert.equal(cleared.has('W3'), false)
  assert.equal(cleared.get('X3'), '')
  assert.equal(clearRangeText(sheet, new Map(), range, []).get('V3'), '')
})

test('only selections containing displayed Status text block merging; empty Status cells stay available', () => {
  const upgraded = ensureScheduleStatusColumns(snapshot())
  const setup = upgraded.scheduleSetups.get('Schedule')!
  const read = (row: number, column: number) => String(upgraded.workbook.Sheets.Schedule[XLSX.utils.encode_cell({ r: row, c: column })]?.v ?? '')
  const range = (firstRow: number, lastRow: number, firstColumn = 22, lastColumn = 22) => ({ s: { r: firstRow, c: firstColumn }, e: { r: lastRow, c: lastColumn } })
  assert.equal(selectionHasScheduleStatusText(setup, range(2, 2), read), true) // Draft
  assert.equal(selectionHasScheduleStatusText(setup, range(3, 3), read), true) // Plot
  assert.equal(selectionHasScheduleStatusText(setup, range(4, 5), read), false) // Assigned empty rows
  assert.equal(selectionHasScheduleStatusText(setup, range(6, 8), read), false) // Unassigned empty rows
  assert.equal(selectionHasScheduleStatusText(setup, range(4, 5, 21, 23), read), false) // Mixed selection of blank Status cells
  assert.equal(selectionHasScheduleStatusText(setup, range(3, 5, 21, 23), read), true)
  assert.equal(selectionHasScheduleStatusText(setup, range(2, 3, 20, 21), read), false)
  assert.equal(selectionHasScheduleStatusText(setup, range(2, 3, 23, 24), read), false)
  assert.equal(selectionHasScheduleStatusText(setup, range(0, 1), read), true) // Status header text
  assert.equal(selectionHasScheduleStatusText(undefined, range(2, 3), read), false)
})

test('inserts a real W Status column once and moves existing cells, edits, formatting and selections to X', () => {
  const original = snapshot()
  const upgraded = ensureScheduleStatusColumns(original)
  const sheet = upgraded.workbook.Sheets.Schedule
  assert.equal(upgraded.scheduleSetups.get('Schedule')?.statusColumn, 22)
  assert.equal(sheet.W1.v, 'Status')
  assert.equal(sheet.X3.v, 'Right-hand data')
  assert.equal(sheet.W3, undefined)
  assert.equal(upgraded.cellTextOverrides.get('Schedule')?.get('X3'), 'Edited right-hand data')
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')?.get('X3')?.fontSize, 18)
  assert.equal(upgraded.columnWidthOverrides.get('Schedule')?.get(23), 180)
  assert.equal(upgraded.columnWidthOverrides.get('Schedule')?.get(22), 96)
  assert.equal(upgraded.formattingOverrides.get('Schedule')?.indexes.get('X3'), 2)
  assert.equal(upgraded.selection.focus.c, 23)
  assert.deepEqual(upgraded.hiddenRangeToggles.get('Schedule')?.column, [{ start: 23, end: 24 }])
  assert.deepEqual(upgraded.mergeOverrides.get('Schedule'), [{ s: { r: 4, c: 23 }, e: { r: 4, c: 24 } }, { s: { r: 0, c: 22 }, e: { r: 1, c: 22 } }])
  assert.equal(upgraded.rowHeightOverrides, original.rowHeightOverrides)
  assert.equal(ensureScheduleStatusColumns(upgraded), upgraded)
  assert.equal(original.workbook.Sheets.Schedule.W3.v, 'Right-hand data')
  assert.equal(original.scheduleSetups.get('Schedule')?.statusColumn, undefined)
})

test('old virtual Status formatting and selection migrate into normal cell metadata', () => {
  const original = snapshot()
  const setup = original.scheduleSetups.get('Schedule')!
  original.scheduleSetups.set('Schedule', { ...setup, statusStyles: new Map([[3, { fontFamily: 'Georgia', fontSize: 18, backgroundColor: '#e3edda' }]]) })
  original.selection = { anchor: { r: 3, c: 21 }, focus: { r: 3, c: 21 }, anchorStatus: true, focusStatus: true }
  const upgraded = ensureScheduleStatusColumns(original)
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')?.get('W4')?.fontFamily, 'Georgia')
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')?.get('W4')?.backgroundColor, '#e3edda')
  assert.equal(upgraded.scheduleSetups.get('Schedule')?.statusStyles, undefined)
  assert.deepEqual(upgraded.selection, { anchor: { r: 3, c: 22 }, focus: { r: 3, c: 22 } })
})

test('new Status cells copy left-cell workbook formatting and edits once, including merged headers', () => {
  const original = snapshot()
  original.previewStyles = { files: {}, sheetPaths: {}, differentialStyles: [], cellStyles: [{}, {
    backgroundColor: '#62853e', fontFamily: 'Georgia', fontSize: '14pt', color: '#ffffff',
    fontWeight: 'bold', fontStyle: 'italic', borderTop: '2px solid #000000', borderBottom: '3px double #000000',
    borderLeft: '1px dashed #334322', borderRight: '2px solid #526f34',
  }] }
  const formatting = original.formattingOverrides.get('Schedule')!
  formatting.indexes.set('U1', 1)
  formatting.indexes.set('V3', 1)
  original.workbook.Sheets.Schedule['!merges']!.push({ s: { r: 0, c: 20 }, e: { r: 0, c: 21 } })
  original.cellStyleOverrides.get('Schedule')!.set('V1', { borderRight: '3px solid #f59e0b' })
  original.cellStyleOverrides.get('Schedule')!.set('V3', { backgroundColor: '#e3edda', fontSize: 20, color: '#41572a', borderBottom: 'none' })
  const upgraded = ensureScheduleStatusColumns(original)
  const header = upgraded.cellStyleOverrides.get('Schedule')!.get('W1')!
  assert.equal(header.backgroundColor, '#62853e')
  assert.equal(header.fontFamily, 'Georgia')
  assert.equal(header.fontSize, '14pt')
  assert.equal(header.color, '#ffffff')
  assert.equal(header.borderRight, '3px solid #f59e0b')
  const body = upgraded.cellStyleOverrides.get('Schedule')!.get('W3')!
  assert.equal(body.backgroundColor, '#e3edda')
  assert.equal(body.fontFamily, 'Georgia')
  assert.equal(body.fontSize, 20)
  assert.equal(body.fontWeight, 'bold')
  assert.equal(body.fontStyle, 'italic')
  assert.equal(body.color, '#41572a')
  assert.equal(body.borderTop, '2px solid #000000')
  assert.equal(body.borderBottom, 'none')
  assert.equal(body.borderLeft, '1px dashed #334322')
  assert.equal(body.borderRight, '2px solid #526f34')
  assert.deepEqual(deserializeWorkbookState(serializeWorkbookState(upgraded), {}).cellStyleOverrides.get('Schedule')!.get('W3'), body)
  // Subsequent left-cell edits must not reset the independently editable Status style.
  upgraded.cellStyleOverrides.get('Schedule')!.set('V3', { backgroundColor: '#ff0000' })
  assert.equal(ensureScheduleStatusColumns(upgraded), upgraded)
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')!.get('W3')!.backgroundColor, '#e3edda')
  assert.deepEqual(original.cellStyleOverrides.get('Schedule')!.get('W3'), { fontSize: 18 })
})

test('Status initialization respects row and column styles, conditional fills, and blank-cell defaults', () => {
  const original = snapshot()
  original.previewStyles = { files: {}, sheetPaths: {}, differentialStyles: [], cellStyles: [{},
    { fontFamily: 'Verdana', fontSize: '16pt', color: '#334322', backgroundColor: '#c6dbb6' },
    { fontFamily: 'Tahoma', fontSize: '10pt', color: '#526f34' },
  ] }
  const formatting = original.formattingOverrides.get('Schedule')!
  formatting.columnIndexes.push({ first: 21, last: 21, styleId: 1 })
  formatting.rowIndexes.set(3, 2)
  original.workbook.Sheets.Schedule.V3 = { t: 'n', v: -1 }
  formatting.conditionalRules.push({ ranges: [{ s: { r: 2, c: 21 }, e: { r: 2, c: 21 } }], type: 'cellIs', operator: 'lessThan', threshold: 0, priority: 1, style: { backgroundColor: '#fca5a5' } })
  const upgraded = ensureScheduleStatusColumns(original)
  const styles = upgraded.cellStyleOverrides.get('Schedule')!
  assert.equal(styles.get('W3')?.fontFamily, 'Verdana')
  assert.equal(styles.get('W3')?.fontSize, '16pt')
  assert.equal(styles.get('W3')?.color, '#334322')
  assert.equal(styles.get('W3')?.backgroundColor, '#fca5a5')
  assert.equal(styles.get('W4')?.fontFamily, 'Tahoma')
  assert.equal(styles.get('W4')?.fontSize, '10pt')
  assert.equal(styles.get('W4')?.backgroundColor, '#ffffff')
  const blank = ensureScheduleStatusColumns(snapshot()).cellStyleOverrides.get('Schedule')!.get('W5')!
  assert.equal(blank.fontFamily, 'Arial')
  assert.equal(blank.fontSize, '11pt')
  assert.equal(blank.color, '#000000')
  assert.equal(blank.backgroundColor, '#ffffff')
  assert.equal(blank.borderLeft, '1px solid #d4d4d4')
})

test('saves and exports computed Status text in W without including empty rows or overwriting live state', () => {
  const upgraded = ensureScheduleStatusColumns(snapshot())
  const saved = deserializeWorkbookState(serializeWorkbookState(upgraded), {})
  assert.equal(saved.cellTextOverrides.get('Schedule')?.get('W1'), 'Status')
  assert.equal(saved.cellTextOverrides.get('Schedule')?.get('W3'), 'Draft')
  assert.equal(saved.cellTextOverrides.get('Schedule')?.get('W4'), 'Plot')
  assert.equal(saved.cellTextOverrides.get('Schedule')?.get('W5'), '')
  assert.equal(upgraded.cellTextOverrides.get('Schedule')?.has('W3'), false)
  const exported = XLSX.read(createExcelExport(upgraded, ['Schedule']), { type: 'array', cellStyles: true })
  assert.equal(exported.Sheets.Schedule.W1.v, 'Status')
  assert.equal(exported.Sheets.Schedule.W3.v, 'Draft')
  assert.equal(exported.Sheets.Schedule.W4.v, 'Plot')
  assert.equal(exported.Sheets.Schedule.X3.v, 'Edited right-hand data')
  assert.ok(exported.Sheets.Schedule.W3.s)
})

test('unplotted rows save and export Draft instead of a stale Plot value', () => {
  const upgraded = materializeScheduleStatuses(ensureScheduleStatusColumns(snapshot()))
  assert.equal(upgraded.cellTextOverrides.get('Schedule')?.get('W4'), 'Plot')
  const setup = upgraded.scheduleSetups.get('Schedule')!
  const read = (row: number, column: number) => String(upgraded.workbook.Sheets.Schedule[XLSX.utils.encode_cell({ r: row, c: column })]?.v ?? '')
  const draft = plotScheduleRows(setup, { s: { r: 3, c: 22 }, e: { r: 3, c: 22 } }, read, 'Draft')
  const changed = { ...upgraded, scheduleSetups: new Map(upgraded.scheduleSetups).set('Schedule', draft) }
  const saved = deserializeWorkbookState(serializeWorkbookState(changed), {})
  assert.equal(saved.scheduleSetups.get('Schedule')?.rowStatuses?.has(3), false)
  assert.equal(saved.cellTextOverrides.get('Schedule')?.get('W4'), 'Draft')
  const exported = XLSX.read(createExcelExport(changed, ['Schedule']), { type: 'array' })
  assert.equal(exported.Sheets.Schedule.W4.v, 'Draft')
  assert.equal(upgraded.cellTextOverrides.get('Schedule')?.get('W4'), 'Plot')
})

test('Backspace clears neighboring cells while protecting Status, and stale saved Status is recalculated', () => {
  const upgraded = materializeScheduleStatuses(ensureScheduleStatusColumns(snapshot()))
  const texts = upgraded.cellTextOverrides.get('Schedule')!
  const cleared = clearRangeText(upgraded.workbook.Sheets.Schedule, texts, { s: { r: 2, c: 3 }, e: { r: 2, c: 23 } }, upgraded.mergeOverrides.get('Schedule')!, 22)
  assert.equal(cleared.get('W3'), 'Draft')
  assert.equal(cleared.get('X3'), '')
  assert.equal(cleared.get('D3'), '')
  const changed = { ...upgraded, cellTextOverrides: new Map([['Schedule', cleared]]) }
  assert.equal(materializeScheduleStatuses(changed).cellTextOverrides.get('Schedule')?.get('W3'), '')
  assert.equal(scheduleStatusText(upgraded.scheduleSetups.get('Schedule')!, 3, (row, col) => String(upgraded.workbook.Sheets.Schedule[XLSX.utils.encode_cell({ r: row, c: col })]?.v ?? '')), 'Plot')
})

test('physical Status follows column edits and a saved/exported Status header is recognized instead of inserted again', () => {
  const upgraded = ensureScheduleStatusColumns(snapshot())
  const setup = upgraded.scheduleSetups.get('Schedule')!
  assert.equal(moveScheduleSetup(setup, { axis: 'column', start: 0, count: 1, remove: false })?.statusColumn, 23)
  assert.equal(moveScheduleSetup(setup, { axis: 'column', start: 22, count: 1, remove: true })?.statusColumn, undefined)
  const sheet = XLSX.read(createExcelExport(upgraded, ['Schedule']), { type: 'array' }).Sheets.Schedule
  sheet.B3 = { t: 's', v: '1BSIT: Curriculum' }
  delete sheet.D3
  delete sheet.E3
  const detected = detectScheduleSetup([{ r: 0, c: 1 }], 5, (row, col) => String(sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v ?? ''))!
  assert.equal(detected.statusColumn, 22)
  assert.equal(detected.rowStatuses?.get(3), 'Plot')
})

test('importing sheet formatting through XFD can insert Status, preserve data and save/export normally', () => {
  const original = snapshot()
  original.previewStyles = { files: {}, sheetPaths: {}, differentialStyles: [], cellStyles: [{}, { backgroundColor: '#e3edda', fontFamily: 'Georgia', fontSize: '14pt' }] }
  const formatting = original.formattingOverrides.get('Schedule')!
  formatting.columnIndexes = [{ first: 0, last: 16383, styleId: 1 }]
  formatting.conditionalRules = [{ type: 'notContainsBlanks', operator: null, threshold: 0, priority: 1, style: { fontWeight: 'bold' }, ranges: [{ s: { r: 0, c: 0 }, e: { r: 1048575, c: 16383 } }] }]
  const upgraded = ensureScheduleStatusColumns(original)
  assert.equal(upgraded.workbook.Sheets.Schedule.W1.v, 'Status')
  assert.equal(upgraded.workbook.Sheets.Schedule.X3.v, 'Right-hand data')
  assert.equal(upgraded.cellTextOverrides.get('Schedule')?.get('X3'), 'Edited right-hand data')
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')?.get('W3')?.backgroundColor, '#e3edda')
  assert.equal(upgraded.cellStyleOverrides.get('Schedule')?.get('W3')?.fontFamily, 'Georgia')
  assert.deepEqual(upgraded.formattingOverrides.get('Schedule')?.columnIndexes, formatting.columnIndexes)
  assert.deepEqual(upgraded.formattingOverrides.get('Schedule')?.conditionalRules[0].ranges, formatting.conditionalRules[0].ranges)
  assert.equal(original.workbook.Sheets.Schedule.W3.v, 'Right-hand data')
  assert.equal(ensureScheduleStatusColumns(upgraded), upgraded)
  const restored = deserializeWorkbookState(serializeWorkbookState(upgraded), {})
  assert.equal(restored.scheduleSetups.get('Schedule')?.statusColumn, 22)
  assert.equal(restored.cellTextOverrides.get('Schedule')?.get('W4'), 'Plot')
  const exported = XLSX.read(createExcelExport(upgraded, ['Schedule']), { type: 'array', cellStyles: true })
  assert.equal(exported.Sheets.Schedule.W3.v, 'Draft')
  assert.equal(exported.Sheets.Schedule.X3.v, 'Edited right-hand data')
  assert.equal(exported.Sheets.Schedule.W3.s.fgColor.rgb, 'E3EDDA')
})
