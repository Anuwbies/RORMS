import assert from 'node:assert/strict'
import { test } from 'node:test'
import { serializeWorkbookState, deserializeWorkbookState, type WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { semesterKey, workbookTermPaths } from '../src/utils/departmentWorkbookPaths.ts'
import { createEmptyWorkbook, createEmptyWorkbookFile } from '../src/utils/emptyExcelWorkbook.ts'
import * as XLSX from 'xlsx'
import { appendImportedSheets, createImportedSourceFile, type ExcelSheetImport } from '../src/utils/excelSheetImport.ts'
import { unzipSync } from 'fflate'

function snapshot(): WorkbookEditSnapshot {
  return {
    workbook: {
      SheetNames: ['Renamed', 'Copy'],
      Sheets: {
        Renamed: {
          '!ref': 'A1:U8', '!rows': [{ hidden: true, hpt: 22 }], '!cols': [{ hidden: true, width: 15 }],
          A1: { t: 's', v: 'Original', c: [{ a: 'Author', t: 'Comment', T: true, createdAt: '2026-10-08T01:00:00Z', resolved: true, resolvedBy: { name: 'Dean', id: 'dean' }, resolvedAt: '2026-10-08T02:00:00Z' }] },
          B1: { t: 's', v: 'Rich', fontRuns: [{ text: 'Rich', fontFamily: 'Arial' }] },
          C1: { t: 'n', v: 3, f: '1+2' },
        },
        Copy: { A1: { t: 's', v: 'Duplicate sheet' } },
      },
      Props: { CreatedDate: new Date('2026-10-08T01:00:00Z') },
      Workbook: { Sheets: [{ name: 'Renamed', Hidden: 0 }, { name: 'Copy', Hidden: 1 }] },
    },
    previewStyles: { files: { 'original.xml': new Uint8Array([1, 2, 3]) }, sheetPaths: { Renamed: 'original.xml', Copy: 'original.xml' }, cellStyles: [{ backgroundColor: '#ffff00' }], differentialStyles: [{ color: '#ff0000' }] },
    sheetColors: new Map([['Renamed', '#62853e']]),
    addedRowsBySheet: new Map([['Renamed', 50]]),
    rowHeightOverrides: new Map([['Renamed', new Map([[7, 28]])]]),
    columnWidthOverrides: new Map([['Renamed', new Map([[3, 250]])]]),
    cellTextOverrides: new Map([['Renamed', new Map([['A1', 'Changed']])]]),
    cellStyleOverrides: new Map([['Renamed', new Map([['A1', { fontSize: '16px', borderTop: '1px solid #000' }]])]]),
    mergeOverrides: new Map([['Renamed', [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]]]),
    formattingOverrides: new Map([['Renamed', { indexes: new Map([['A1', 1]]), rowIndexes: new Map([[3, 1]]), columnIndexes: [{ first: 1, last: 2, styleId: 1 }], conditionalRules: [{ ranges: [{ s: { r: 2, c: 1 }, e: { r: 5, c: 1 } }], type: 'cellIs', operator: 'greaterThan', threshold: 3, style: { color: 'red' }, priority: 1 }] }]]),
    scheduleSetups: new Map([['Renamed', { header: { s: { r: 0, c: 0 }, e: { r: 1, c: 20 } }, columns: Array.from({ length: 21 }, (_, index) => index), years: new Map([[3, 1], [4, 2], [5, 3], [7, 4]]), includesEmptyRows: true }]]),
    hiddenRangeToggles: new Map([['Renamed', { row: [{ start: 2, end: 3 }], column: [{ start: 1, end: 2 }] }]]),
    selectedSheet: 'Renamed', selection: { anchor: { r: 2, c: 1 }, focus: { r: 4, c: 1 }, axis: 'column' },
  }
}

function sheetImport(): ExcelSheetImport {
  return {
    file: createEmptyWorkbookFile(), id: 'import1', sheetNames: ['Wanted'],
    workbook: { SheetNames: ['Skipped', 'Wanted'], Sheets: { Skipped: { A1: { t: 's', v: 'Skip me' } }, Wanted: { '!ref': 'A1:D4', '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }], '!rows': [{ hpt: 28 }], A1: { t: 's', v: 'Import me', c: [{ a: 'Dean', t: 'Keep this comment' }] } } }, Workbook: { Sheets: [{ name: 'Skipped' }, { name: 'Wanted', Hidden: 1 }] } },
    styles: { files: { 'xl/worksheets/sheet2.xml': new TextEncoder().encode('<worksheet/>') }, sheetPaths: { Wanted: 'xl/worksheets/sheet2.xml' }, cellStyles: [{ color: '#000000' }, { backgroundColor: '#00ff00' }], differentialStyles: [] },
    formatting: new Map([['Wanted', { indexes: new Map([['A1', 1]]), rowIndexes: new Map([[3, 1]]), columnIndexes: [{ first: 2, last: 2, styleId: 1 }], conditionalRules: [{ ranges: [{ s: { r: 0, c: 0 }, e: { r: 1, c: 1 } }], type: 'cellIs', operator: 'lessThan', threshold: 0, style: { color: '#ff0000' }, priority: 1 }] }]]),
  }
}

function defaultSnapshot(): WorkbookEditSnapshot {
  return {
    ...snapshot(), workbook: createEmptyWorkbook(), previewStyles: null,
    sheetColors: new Map(), addedRowsBySheet: new Map([['Sheet1', 25]]),
    rowHeightOverrides: new Map(), columnWidthOverrides: new Map(),
    cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(),
    formattingOverrides: new Map(), scheduleSetups: new Map(), hiddenRangeToggles: new Map(),
    selectedSheet: 'Sheet1', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}

test('zero-sheet editor snapshots round-trip and reject a stale sheet selection', () => {
  const empty = { ...defaultSnapshot(), workbook: { SheetNames: [], Sheets: {} }, selectedSheet: '' }
  assert.deepEqual(deserializeWorkbookState(serializeWorkbookState(empty), {}).workbook.SheetNames, [])
  assert.throws(() => deserializeWorkbookState(serializeWorkbookState({ ...empty, selectedSheet: 'Sheet1' }), {}), /saved sheet/)
})

test('import replaces only the untouched default sheet and its placeholder row settings', () => {
  const current = defaultSnapshot()
  const result = appendImportedSheets(current, sheetImport()).snapshot
  assert.deepEqual(result.workbook.SheetNames, ['Wanted'])
  assert.equal(result.workbook.Sheets.Sheet1, undefined)
  assert.equal(result.addedRowsBySheet.has('Sheet1'), false)
  assert.equal(result.workbook.Workbook?.Sheets?.length, 1)
  assert.deepEqual(current.workbook.SheetNames, ['Sheet1'])
  assert.equal(current.addedRowsBySheet.get('Sheet1'), 25)
  const restoredDefault = deserializeWorkbookState(serializeWorkbookState(current), {})
  assert.deepEqual(appendImportedSheets(restoredDefault, sheetImport()).snapshot.workbook.SheetNames, ['Wanted'])
})

test('an imported Sheet1 keeps its name and does not inherit default sheet settings', () => {
  const incoming = sheetImport()
  incoming.workbook = { SheetNames: ['Sheet1'], Sheets: { Sheet1: incoming.workbook.Sheets.Wanted } }
  incoming.sheetNames = ['Sheet1']
  incoming.formatting = new Map([['Sheet1', incoming.formatting.get('Wanted')!]])
  const result = appendImportedSheets(defaultSnapshot(), incoming).snapshot
  assert.deepEqual(result.workbook.SheetNames, ['Sheet1'])
  assert.equal(result.workbook.Sheets.Sheet1.A1.v, 'Import me')
  assert.equal(result.addedRowsBySheet.has('Sheet1'), false)
})

test('imports preserve the default sheet when it has content, comments, styles, or custom dimensions', () => {
  const examples = [
    (state: WorkbookEditSnapshot) => { state.cellTextOverrides.set('Sheet1', new Map([['A1', 'My schedule']])) },
    (state: WorkbookEditSnapshot) => { state.workbook.Sheets.Sheet1.A1 = { t: 's', v: '', c: [{ a: 'Dean', t: 'Comment' }] } },
    (state: WorkbookEditSnapshot) => { state.cellStyleOverrides.set('Sheet1', new Map([['A1', { backgroundColor: '#ffff00' }]])) },
    (state: WorkbookEditSnapshot) => { state.rowHeightOverrides.set('Sheet1', new Map([[0, 40]])) },
    (state: WorkbookEditSnapshot) => { state.addedRowsBySheet.set('Sheet1', 50) },
  ]
  for (const customize of examples) {
    const current = defaultSnapshot()
    customize(current)
    assert.deepEqual(appendImportedSheets(current, sheetImport()).snapshot.workbook.SheetNames, ['Sheet1', 'Wanted'])
  }
})

test('unmarked empty sheets remain and invalid imports never delete the default placeholder', () => {
  const current = defaultSnapshot()
  delete current.workbook.Sheets.Sheet1['!rormsDefaultSheet']
  assert.deepEqual(appendImportedSheets(current, sheetImport()).snapshot.workbook.SheetNames, ['Sheet1', 'Wanted'])
  const placeholder = defaultSnapshot()
  assert.throws(() => appendImportedSheets(placeholder, { ...sheetImport(), sheetNames: [] }))
  assert.deepEqual(placeholder.workbook.SheetNames, ['Sheet1'])
})

test('selected imports preserve existing edits and import only checked sheets, including hidden ones', () => {
  const current = snapshot()
  const incoming = sheetImport()
  const { snapshot: result } = appendImportedSheets(current, incoming)
  assert.deepEqual(result.workbook.SheetNames, ['Renamed', 'Copy', 'Wanted'])
  assert.equal(result.workbook.Sheets.Skipped, undefined)
  assert.equal(result.workbook.Sheets.Renamed, current.workbook.Sheets.Renamed)
  assert.equal(result.cellTextOverrides.get('Renamed')?.get('A1'), 'Changed')
  assert.deepEqual(result.workbook.Sheets.Wanted['!merges'], incoming.workbook.Sheets.Wanted['!merges'])
  assert.equal(result.workbook.Sheets.Wanted.A1.c?.[0].t, 'Keep this comment')
  assert.equal(result.workbook.Workbook?.Sheets?.[2].Hidden, 0)
  assert.equal(result.selectedSheet, 'Wanted')
  assert.deepEqual(current.workbook.SheetNames, ['Renamed', 'Copy'])
})

test('repeated sheet imports use case-insensitive unique names without overwriting existing sheets', () => {
  const incoming = sheetImport()
  const first = appendImportedSheets(snapshot(), incoming).snapshot
  const second = appendImportedSheets(first, { ...incoming, id: 'import2' }).snapshot
  assert.deepEqual(second.workbook.SheetNames, ['Renamed', 'Copy', 'Wanted', 'Wanted (2)'])
  assert.equal(second.workbook.Sheets.Wanted, first.workbook.Sheets.Wanted)
  const longName = 'A'.repeat(31)
  incoming.workbook = { SheetNames: [longName, longName.toLowerCase()], Sheets: { [longName]: {}, [longName.toLowerCase()]: {} } }
  incoming.sheetNames = incoming.workbook.SheetNames
  incoming.formatting = new Map(incoming.sheetNames.map(name => [name, incoming.formatting.get('Wanted')!]))
  const { addedNames } = appendImportedSheets(snapshot(), incoming)
  assert.equal(addedNames[1], `${'a'.repeat(27)} (2)`)
  assert.ok(addedNames.every(name => name.length <= 31))
})

test('imported style indexes stay independent across workbooks and conditional formatting is retained', () => {
  const current = snapshot()
  const incoming = sheetImport()
  const result = appendImportedSheets(current, incoming).snapshot
  const formatting = result.formattingOverrides.get('Wanted')!
  assert.equal(formatting.indexes.get('A1'), 2)
  assert.equal(formatting.rowIndexes.get(3), 2)
  assert.equal(formatting.columnIndexes[0].styleId, 2)
  assert.equal(formatting.columnIndexes[1].styleId, 1)
  assert.equal(result.previewStyles?.cellStyles[2].backgroundColor, '#00ff00')
  assert.equal(result.previewStyles?.cellStyles[0].backgroundColor, '#ffff00')
  assert.deepEqual(formatting.conditionalRules, incoming.formatting.get('Wanted')?.conditionalRules)
  assert.equal(current.formattingOverrides.has('Wanted'), false)
})

test('selected imports survive snapshot saving and XLSX reopening across multiple imports', async () => {
  const incoming = sheetImport()
  const first = appendImportedSheets(snapshot(), incoming).snapshot
  const source1 = await createImportedSourceFile(createEmptyWorkbookFile(), incoming.file, first.previewStyles!.files)
  const second = appendImportedSheets(first, { ...incoming, id: 'import2' }).snapshot
  const source2 = await createImportedSourceFile(source1, incoming.file, second.previewStyles!.files)
  const data = await source2.arrayBuffer()
  assert.ok(XLSX.read(data, { type: 'array' }).SheetNames.length > 0)
  const files = unzipSync(new Uint8Array(data))
  const restored = deserializeWorkbookState(serializeWorkbookState(second), files)
  assert.deepEqual(restored.workbook.SheetNames, ['Renamed', 'Copy', 'Wanted', 'Wanted (2)'])
  assert.equal(restored.workbook.Sheets.Skipped, undefined)
  assert.ok(restored.previewStyles?.files[restored.previewStyles.sheetPaths.Wanted])
  assert.ok(restored.previewStyles?.files[restored.previewStyles.sheetPaths['Wanted (2)']])
  assert.equal(restored.formattingOverrides.get('Wanted (2)')?.indexes.get('A1'), 4)
  assert.equal(restored.cellTextOverrides.get('Renamed')?.get('A1'), 'Changed')
})

test('an import can start without a source file and empty or unknown selections leave the workbook unchanged', async () => {
  const current = snapshot()
  const incoming = sheetImport()
  assert.throws(() => appendImportedSheets(current, { ...incoming, sheetNames: [] }), /Choose at least one/)
  assert.throws(() => appendImportedSheets(current, { ...incoming, sheetNames: ['Unknown'] }), /Choose at least one/)
  assert.deepEqual(current.workbook.SheetNames, ['Renamed', 'Copy'])
  const result = appendImportedSheets(current, incoming).snapshot
  const source = await createImportedSourceFile(null, incoming.file, result.previewStyles!.files)
  assert.equal(source.name, incoming.file.name)
  assert.ok(XLSX.read(await source.arrayBuffer(), { type: 'array' }).SheetNames.length > 0)
})

test('editor snapshots round-trip workbook edits, comments, dimensions, and schedule assignments', () => {
  const original = snapshot()
  const setup = original.scheduleSetups.get('Renamed')!
  original.scheduleSetups.set('Renamed', { ...setup, rowStatuses: new Map([[3, 'Plot'], [7, 'Plot']]), statusStyles: new Map([[3, { fontFamily: 'Georgia', fontSize: 16, backgroundColor: '#e3edda', borderBottom: '2px solid #000000' }]]) })
  original.selection = { anchor: { r: 3, c: 20 }, focus: { r: 7, c: 20 }, focusStatus: true }
  const json = serializeWorkbookState(original)
  const files = { 'original.xml': new Uint8Array([1, 2, 3]) }
  const restored = deserializeWorkbookState(json, files)
  assert.deepEqual(restored, original)
  assert.equal(restored.previewStyles?.files, files)
  assert.equal(restored.cellTextOverrides.get('Renamed')?.get('A1'), 'Changed')
  assert.equal(restored.scheduleSetups.get('Renamed')?.years.get(7), 4)
  assert.equal(restored.scheduleSetups.get('Renamed')?.rowStatuses?.get(7), 'Plot')
  assert.equal(restored.scheduleSetups.get('Renamed')?.statusStyles?.get(3)?.fontSize, 16)
  assert.equal(restored.selection.focusStatus, true)
  assert.ok(restored.workbook.Props?.CreatedDate instanceof Date)
})

test('invalid Status formatting is rejected while older snapshots remain valid', () => {
  const original = snapshot()
  assert.doesNotThrow(() => deserializeWorkbookState(serializeWorkbookState(original), {}))
  const setup = original.scheduleSetups.get('Renamed')!
  original.scheduleSetups.set('Renamed', { ...setup, statusStyles: new Map([[-1, { fontSize: 16 }]]) })
  assert.throws(() => deserializeWorkbookState(serializeWorkbookState(original), {}), /status formatting is invalid/)
})

test('importing into the empty department workbook creates only chosen sheets and a restorable editor state', () => {
  const current = defaultSnapshot()
  current.workbook = XLSX.utils.book_new()
  current.selectedSheet = ''
  current.addedRowsBySheet = new Map()
  const { snapshot: imported } = appendImportedSheets(current, sheetImport())
  assert.deepEqual(imported.workbook.SheetNames, ['Wanted'])
  assert.equal(imported.selectedSheet, 'Wanted')
  assert.equal(imported.workbook.Sheets.Sheet1, undefined)
  assert.deepEqual(current.workbook.SheetNames, [])
  const restored = deserializeWorkbookState(serializeWorkbookState(imported), imported.previewStyles!.files)
  assert.equal(restored.workbook.Sheets.Wanted.A1.v, 'Import me')
})

test('snapshot JSON omits original XML files without mutating the live state', () => {
  const original = snapshot()
  const json = serializeWorkbookState(original)
  assert.equal(json.includes('"files"'), false)
  assert.equal(original.previewStyles?.files['original.xml'].byteLength, 3)
})

test('a semester started without an import has a valid XLSX source and restores its edits', async () => {
  const source = createEmptyWorkbookFile()
  const originalWorkbook = XLSX.read(await source.arrayBuffer(), { type: 'array' })
  assert.equal(source.name, 'Untitled.xlsx')
  assert.ok(source.size > 0)
  assert.deepEqual(originalWorkbook.SheetNames, ['Sheet1'])
  assert.equal(originalWorkbook.Sheets.Sheet1.A1, undefined)

  const edited = snapshot()
  edited.workbook = createEmptyWorkbook()
  edited.previewStyles = null
  edited.selectedSheet = 'Sheet1'
  edited.addedRowsBySheet = new Map([['Sheet1', 25]])
  edited.cellTextOverrides = new Map([['Sheet1', new Map([['A1', 'ITE 298']])]])
  const restored = deserializeWorkbookState(serializeWorkbookState(edited), {})
  assert.deepEqual(restored.workbook.SheetNames, originalWorkbook.SheetNames)
  assert.equal(restored.cellTextOverrides.get('Sheet1')?.get('A1'), 'ITE 298')
  assert.equal(restored.addedRowsBySheet.get('Sheet1'), 25)
  assert.equal(restored.previewStyles, null)
})

test('corrupt versions, maps, sheets, and selections are rejected instead of opening a fresh workbook', () => {
  const json = serializeWorkbookState(snapshot())
  assert.throws(() => deserializeWorkbookState('{', {}))
  for (const mutate of [
    (data: Record<string, unknown>) => { data.version = 2 },
    (data: Record<string, unknown>) => { (data.snapshot as Record<string, unknown>).cellTextOverrides = {} },
    (data: Record<string, unknown>) => { (data.snapshot as Record<string, unknown>).selectedSheet = 'Missing' },
    (data: Record<string, unknown>) => { (data.snapshot as Record<string, unknown>).selection = { anchor: { r: -1, c: 0 }, focus: { r: 0, c: 0 } } },
  ]) {
    const data = JSON.parse(json)
    mutate(data)
    assert.throws(() => deserializeWorkbookState(JSON.stringify(data), {}))
  }
})

test('terms use named school years and are isolated by department, year, and semester', () => {
  const term = { departmentId: 'dept1', academicYearId: 'year1', academicYear: '2026 - 2027', semester: semesterKey('1st Semester') }
  const original = workbookTermPaths(term)
  assert.equal(original.document, 'departments/dept1/workbooks/2026-2027/semesters/sem1')
  assert.equal(original.namedLegacyDocument, 'departments/dept1/scheduleYears/2026-2027/semesters/sem1')
  assert.equal(original.legacyDocument, 'departments/dept1/scheduleYears/year1/semesters/sem1')
  const second = workbookTermPaths({ ...term, semester: semesterKey('2nd Semester') })
  assert.equal(second.document, 'departments/dept1/workbooks/2026-2027/semesters/sem2')
  assert.equal(workbookTermPaths({ ...term, academicYear: '2026-2027' }).document, original.document)
  for (const changed of [{ ...term, departmentId: 'dept2' }, { ...term, academicYearId: 'year2', academicYear: '2027 - 2028' }, { ...term, semester: semesterKey('2nd Semester') }]) {
    assert.notEqual(workbookTermPaths(changed).document, original.document)
    assert.notEqual(workbookTermPaths(changed).storage, original.storage)
  }
  assert.throws(() => workbookTermPaths({ ...term, departmentId: '../other' }))
  assert.throws(() => workbookTermPaths({ ...term, academicYearId: '' }))
  assert.throws(() => workbookTermPaths({ ...term, academicYear: '../other' }))
  assert.throws(() => semesterKey('Summer'))
})
