import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyScheduleCellValues, indexScheduleRows, linkScheduleCourseChanges } from '../src/utils/departmentScheduleEdits.ts'
import { planScheduleCellPaste, readScheduleCourseClipboard } from '../src/utils/scheduleCellClipboard.ts'
import { CellTextHistory } from '../src/utils/cellTextHistory.ts'
import type { DepartmentScheduleImportSheet } from '../src/utils/departmentScheduleImport.ts'
import type { DepartmentCourseSuggestion } from '../src/utils/departmentCourseSuggestions.ts'

const courses: DepartmentCourseSuggestion[] = [
  { code: 'ITE 398', title: 'Capstone Project', yearLevel: 4, semester: 1, type: 'Lecture', credits: 3, session: '', sourceCell: 'a' },
  { code: 'GEN 001', title: 'Understanding the Self', yearLevel: 1, semester: 1, type: 'Lecture', credits: 3, session: '', sourceCell: 'b' },
]
function workbook(): DepartmentScheduleImportSheet[] {
  return [{ name: 'Schedule', headerRow: 1, yearSections: [{ label: '4th Year', start: 0, count: 2 }],
    rows: [3, 4].map(rowNumber => ({ rowNumber, values: Array.from({ length: 21 }, (_, column) => column === 2 ? 'OLD 001' : column === 3 ? 'Old title' : '') })) }]
}

test('clearing either course field clears the pair even before course suggestions load', () => {
  for (const column of [2, 3]) {
    const sheets = workbook(), indexes = indexScheduleRows(sheets)
    const changes = linkScheduleCourseChanges(sheets, indexes, [{ cell: { sheet: 0, row: 3, column }, value: '' }], [], false)
    const next = applyScheduleCellValues(sheets, indexes, changes)
    assert.deepEqual(next[0].rows[0].values.slice(2, 4), ['', ''])
    assert.deepEqual(sheets[0].rows[0].values.slice(2, 4), ['OLD 001', 'Old title'])
  }
})

test('pasted code or title columns fill both course fields for every pasted row', () => {
  for (const [column, text] of [[2, 'ite398\r\ngen001\r\n'], [3, 'Capstone Project\nUnderstanding the Self\n']] as const) {
    const sheets = workbook(), indexes = indexScheduleRows(sheets)
    const clipboard = readScheduleCourseClipboard(text, column)!
    const pasted = planScheduleCellPaste(clipboard, { sheet: 0, column, anchor: 0, end: 0 }, sheets[0].rows)
    const linked = linkScheduleCourseChanges(sheets, indexes, pasted, courses)
    const next = applyScheduleCellValues(sheets, indexes, linked)
    assert.deepEqual(next[0].rows.map(row => row.values.slice(2, 4)), [['ITE 398', 'Capstone Project'], ['GEN 001', 'Understanding the Self']])
    assert.equal(pasted.length, 2)
  }
})

test('a pasted full row with a missing counterpart fills it from the nonempty course field', () => {
  const sheets = workbook(), indexes = indexScheduleRows(sheets)
  const linked = linkScheduleCourseChanges(sheets, indexes, [
    { cell: { sheet: 0, row: 3, column: 2 }, value: 'ite398' },
    { cell: { sheet: 0, row: 3, column: 3 }, value: '' },
  ], courses)
  assert.deepEqual(applyScheduleCellValues(sheets, indexes, linked)[0].rows[0].values.slice(2, 4), ['ITE 398', 'Capstone Project'])
})

test('linked paste and deletion undo and redo both fields together without resolving old values', () => {
  for (const value of ['ite398', '']) {
    const sheets = workbook(), indexes = indexScheduleRows(sheets)
    const linked = linkScheduleCourseChanges(sheets, indexes, [{ cell: { sheet: 0, row: 3, column: 2 }, value }], courses)
    const history = new CellTextHistory()
    history.recordChanges(linked.map(change => ({ cell: change.cell, before: sheets[0].rows[0].values[change.cell.column], after: change.value })))
    const next = applyScheduleCellValues(sheets, indexes, linked)
    const undo = history.undo()!
    const restored = applyScheduleCellValues(next, indexes, [undo, ...(undo.related ?? [])].map(change => ({ cell: change.cell, value: change.before })))
    assert.deepEqual(restored[0].rows[0].values.slice(2, 4), ['OLD 001', 'Old title'])
    assert.equal(history.undo(), null)
    const redo = history.redo()!
    const reapplied = applyScheduleCellValues(restored, indexes, [redo, ...(redo.related ?? [])].map(change => ({ cell: change.cell, value: change.after })))
    assert.deepEqual(reapplied[0].rows[0].values, next[0].rows[0].values)
  }
})

test('plain course-column clipboard supports quoted titles and rejects unrelated columns or multiple columns', () => {
  assert.deepEqual(readScheduleCourseClipboard('"Title with ""quotes"""\r\n', 3)?.values, ['Title with "quotes"'])
  assert.equal(readScheduleCourseClipboard('ITE 398\tTitle', 2), null)
  assert.equal(readScheduleCourseClipboard('ITE 398', 13), null)
})

test('pasted time values complete clock shorthand before being recorded and applied', () => {
  const sheets = workbook(), indexes = indexScheduleRows(sheets)
  const linked = linkScheduleCourseChanges(sheets, indexes, [
    { cell: { sheet: 0, row: 3, column: 15 }, value: '730-900' },
    { cell: { sheet: 0, row: 4, column: 16 }, value: '1000-1130/1300-1430' },
  ], [])
  const next = applyScheduleCellValues(sheets, indexes, linked)
  assert.equal(next[0].rows[0].values[15], '7:30-9:00')
  assert.equal(next[0].rows[1].values[16], '10:00-11:30/13:00-14:30')
})
