import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { createDepartmentScheduleWorkbookState, readDepartmentScheduleWorkbookState } from '../src/utils/departmentScheduleWorkbookState.ts'
import { serializeFirestoreWorkbookState, splitFirestoreWorkbookState, joinFirestoreWorkbookState } from '../src/utils/firestoreWorkbookState.ts'

test('Firestore serialization preserves blank rows, year labels, visibility, row IDs, and widths', () => {
  const sheet = createEmptyDepartmentScheduleSheet()
  sheet.yearSections![0].label = '1BSIT: 2023-24 CURRICULUM'
  sheet.yearSections![1].hidden = true
  sheet.rows[0].rowNumber = 100
  sheet.rows[0].values[3] = 'A course with spaces'
  const widths = Array.from({ length: 23 }, (_, index) => index === 0 ? 40 : 100)
  const saved = createDepartmentScheduleWorkbookState([sheet], 0, widths)
  const split = splitFirestoreWorkbookState(saved.editorState)
  const reopened = readDepartmentScheduleWorkbookState(joinFirestoreWorkbookState(split.manifest, split.sheets))
  assert.deepEqual(reopened.sheets, [sheet])
  assert.deepEqual(reopened.columnWidths, widths)
  assert.equal(reopened.sheets[0].rows.length, 40)
})

test('older 22-column widths gain a default read-only Status width', () => {
  const saved = createDepartmentScheduleWorkbookState([createEmptyDepartmentScheduleSheet()], 0, Array(22).fill(100))
  const reopened = readDepartmentScheduleWorkbookState(saved.editorState)
  assert.deepEqual(reopened.columnWidths, [...Array(22).fill(100), 96])
})

test('repeated saves replace owned sheets and retain unrelated worksheet data and overrides', () => {
  const first = createDepartmentScheduleWorkbookState([createEmptyDepartmentScheduleSheet()], 0, null)
  first.snapshot.workbook.SheetNames.unshift('Notes')
  first.snapshot.workbook.Sheets.Notes = XLSX.utils.aoa_to_sheet([['Keep this note']])
  first.snapshot.cellTextOverrides.set('Notes', new Map([['A1', 'Edited note']]))
  const loaded = readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(first.snapshot))
  loaded.sheets[0].rows[2].values[0] = 'CITE'
  const second = createDepartmentScheduleWorkbookState(loaded.sheets, 0, null, loaded)
  assert.deepEqual(second.snapshot.workbook.SheetNames, ['Notes', 'Schedule'])
  assert.equal(second.snapshot.workbook.Sheets.Notes.A1.v, 'Keep this note')
  assert.equal(second.snapshot.cellTextOverrides.get('Notes')?.get('A1'), 'Edited note')
  assert.equal(readDepartmentScheduleWorkbookState(second.editorState).sheets[0].rows[2].values[0], 'CITE')
})

test('reads saved cell overrides, selected worksheet, and edits after a reload', () => {
  const first = createEmptyDepartmentScheduleSheet()
  const second = { ...createEmptyDepartmentScheduleSheet(), name: 'Another semester' }
  const saved = createDepartmentScheduleWorkbookState([first, second], 1, null)
  saved.snapshot.cellTextOverrides.set(second.name, new Map([['D3', 'New title']]))
  const loaded = readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(saved.snapshot))
  assert.equal(loaded.selectedSheet, 1)
  assert.equal(loaded.sheets[1].rows[0].values[3], 'New title')
  const again = createDepartmentScheduleWorkbookState(loaded.sheets, 1, null, loaded)
  assert.equal(readDepartmentScheduleWorkbookState(again.editorState).sheets[1].rows[0].values[3], 'New title')
})

test('preserves unrelated sheets when imported sheet names collide', () => {
  const saved = createDepartmentScheduleWorkbookState([createEmptyDepartmentScheduleSheet()], 0, null)
  delete saved.snapshot.workbook.Sheets.Schedule['!rormsDepartmentScheduleImport']
  saved.snapshot.workbook.Sheets.Schedule = XLSX.utils.aoa_to_sheet([['An unrelated sheet']])
  const loaded = readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(saved.snapshot))
  assert.equal(loaded.sheets[0].name, 'Schedule (2)')
  const imported = createEmptyDepartmentScheduleSheet()
  const next = createDepartmentScheduleWorkbookState([imported], 0, null, loaded)
  assert.deepEqual(next.snapshot.workbook.SheetNames, ['Schedule', 'Schedule (2)'])
  assert.equal(next.snapshot.workbook.Sheets.Schedule.A1.v, 'An unrelated sheet')
})

test('accepts a workbook with headers only and rejects corrupt year metadata', () => {
  const sheet = { ...createEmptyDepartmentScheduleSheet(), rows: [], yearSections: [] }
  const saved = createDepartmentScheduleWorkbookState([sheet], 0, null)
  assert.deepEqual(readDepartmentScheduleWorkbookState(saved.editorState).sheets[0].rows, [])
  saved.snapshot.workbook.Sheets.Schedule['!rormsDepartmentScheduleImport'].rowNumbers = [3, 3]
  assert.throws(() => readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(saved.snapshot)), /Invalid saved schedule/)
})

test('opens an older matching worksheet and can save it with explicit year metadata', () => {
  const saved = createDepartmentScheduleWorkbookState([createEmptyDepartmentScheduleSheet()], 0, null)
  delete saved.snapshot.workbook.Sheets.Schedule['!rormsDepartmentScheduleImport']
  saved.snapshot.workbook.Sheets.Schedule.A3 = { t: 's', v: '1BSIT: 2023-24 CURRICULUM' }
  saved.snapshot.workbook.Sheets.Schedule.C4 = { t: 's', v: 'ITE 101' }
  const loaded = readDepartmentScheduleWorkbookState(serializeFirestoreWorkbookState(saved.snapshot))
  assert.equal(loaded.sheets[0].yearSections?.[0].label, '1BSIT: 2023-24 CURRICULUM')
  assert.equal(loaded.sheets[0].rows[0].values[2], 'ITE 101')
  const next = createDepartmentScheduleWorkbookState(loaded.sheets, 0, null, loaded)
  assert.deepEqual(readDepartmentScheduleWorkbookState(next.editorState).sheets, loaded.sheets)
})
