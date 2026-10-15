import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPasteScheduleColumn, insertScheduleCellText, planScheduleCellPaste, readScheduleCellClipboard, scheduleClipboardText } from '../src/utils/scheduleCellClipboard.ts'
import { planScheduleRowPaste, readScheduleRowClipboard, sameScheduleClipboardText, scheduleRowClipboardText } from '../src/utils/scheduleCellClipboard.ts'

const rows = Array.from({ length: 8 }, (_, index) => ({ rowNumber: index * 2 + 5, values: Array<string>(21).fill('Original') }))
const destination = { sheet: 0, column: 3, anchor: 2, end: 2 }

test('multi-cell and multi-row clipboard text still matches after Windows newline conversion', () => {
  const cells = scheduleClipboardText(['One', 'Two', 'Three'])
  assert.equal(sameScheduleClipboardText(cells, cells.replace(/\n/g, '\r\n')), true)
  const copiedRows = [Array<string>(21).fill('First'), Array<string>(21).fill('Second')]
  copiedRows[0][3] = 'Title\nwith newline'
  const text = scheduleRowClipboardText(copiedRows)
  assert.equal(sameScheduleClipboardText(text, text.replace(/\n/g, '\r\n')), true)
  assert.equal(sameScheduleClipboardText(' A \nB', 'A\r\nB'), false)
  assert.equal(sameScheduleClipboardText('One\nTwo', 'One\r\nDifferent'), false)
})

test('whole-row paste preserves columns, blanks, and row order and expands from one selected row', () => {
  const copied = { version: 1 as const, rows: [Array.from({ length: 21 }, (_, column) => `A${column}`), Array<string>(21).fill('')] }
  const changes = planScheduleRowPaste(copied, { ...destination, column: -1 }, rows)
  assert.equal(changes.length, 42)
  for (let column = 0; column < 21; column++) {
    assert.deepEqual(changes.filter(change => change.cell.column === column).map(change => [change.cell.row, change.value]), [[9, `A${column}`], [11, '']])
  }
  const filled = planScheduleRowPaste({ version: 1, rows: [copied.rows[0]] }, { ...destination, column: -1, end: 4 }, rows)
  assert.equal(filled.length, 63)
  assert.throws(() => planScheduleRowPaste(copied, destination, rows))
  assert.throws(() => planScheduleRowPaste(copied, { ...destination, column: -1, anchor: 7, end: 7 }, rows))
  assert.throws(() => planScheduleRowPaste(copied, { ...destination, column: -1, end: 4 }, rows))
})

test('row clipboard validates all 21 columns and exports tab-separated text with escaped cell content', () => {
  const values = Array<string>(21).fill('')
  values[0] = 'College'
  values[1] = 'A\tB'
  values[2] = 'Two\nlines'
  const payload = { version: 1, rows: [values] }
  assert.deepEqual(readScheduleRowClipboard(JSON.stringify(payload)), payload)
  assert.equal(readScheduleRowClipboard(JSON.stringify({ version: 1, rows: [['Partial']] })), null)
  assert.equal(readScheduleRowClipboard(JSON.stringify({ version: 1, rows: [Array(21).fill(1)] })), null)
  assert.equal(readScheduleRowClipboard('invalid'), null)
  assert.ok(scheduleRowClipboardText([values]).startsWith('College\t"A\tB"\t"Two\nlines"\t'))
})

test('same-column paste works and Lec/Lab columns can cross only within their parent header', () => {
  for (let column = 0; column < 21; column++) assert.equal(canPasteScheduleColumn(column, column), true)
  assert.equal(canPasteScheduleColumn(13, 14), true)
  assert.equal(canPasteScheduleColumn(14, 13), true)
  for (const siblings of [[5, 6, 8, 9], [13, 14], [15, 16], [17, 18], [19, 20]]) {
    for (const source of siblings) for (const target of siblings) assert.equal(canPasteScheduleColumn(source, target), true)
  }
  assert.equal(canPasteScheduleColumn(13, 15), false)
  assert.equal(canPasteScheduleColumn(16, 17), false)
  assert.equal(canPasteScheduleColumn(18, 19), false)
  assert.equal(canPasteScheduleColumn(6, 13), false)
  assert.equal(canPasteScheduleColumn(7, 5), false)
  assert.equal(canPasteScheduleColumn(7, 10), false)
  assert.equal(canPasteScheduleColumn(-1, -1), false)
})

test('one copied cell fills a selected range, including blank text and whitespace', () => {
  const changes = planScheduleCellPaste({ version: 1, column: 3, values: [' A  B '] }, { ...destination, end: 5 }, rows)
  assert.equal(changes.length, 4)
  assert.ok(changes.every(change => change.value === ' A  B ' && change.cell.column === 3))
  assert.deepEqual(changes.map(change => change.cell.row), [9, 11, 13, 15])
  assert.equal(planScheduleCellPaste({ version: 1, column: 3, values: [''] }, destination, rows)[0].value, '')
})

test('multiple copied rows expand from one destination cell in order', () => {
  const changes = planScheduleCellPaste({ version: 1, column: 3, values: ['One', 'Two', 'Three'] }, destination, rows)
  assert.deepEqual(changes.map(change => change.value), ['One', 'Two', 'Three'])
  assert.deepEqual(changes.map(change => change.cell.row), [9, 11, 13])
})

test('reverse selections paste from top to bottom and repeated ranges use the copied pattern', () => {
  const changes = planScheduleCellPaste({ version: 1, column: 3, values: ['A', 'B'] }, { ...destination, anchor: 5, end: 2 }, rows)
  assert.deepEqual(changes.map(change => change.value), ['A', 'B', 'A', 'B'])
  assert.deepEqual(changes.map(change => change.cell.row), [9, 11, 13, 15])
})

test('incompatible columns, mismatched selections, and insufficient rows reject the paste', () => {
  assert.throws(() => planScheduleCellPaste({ version: 1, column: 4, values: ['X'] }, destination, rows), /same column/)
  assert.throws(() => planScheduleCellPaste({ version: 1, column: 3, values: ['A', 'B', 'C'] }, { ...destination, end: 3 }, rows), /same number/)
  assert.throws(() => planScheduleCellPaste({ version: 1, column: 3, values: ['A', 'B', 'C'] }, { ...destination, anchor: 7, end: 7 }, rows), /enough rows/)
})

test('clipboard metadata retains column identity and rejects malformed payloads', () => {
  const source = { version: 1, column: 13, values: ['Faculty One', 'Faculty Two'] }
  assert.deepEqual(readScheduleCellClipboard(JSON.stringify(source)), source)
  for (const payload of ['', '{}', '{"version":1,"column":50,"values":["X"]}', '{"version":1,"column":13,"values":[5]}']) {
    assert.equal(readScheduleCellClipboard(payload), null)
  }
  assert.equal(scheduleClipboardText(['A', 'B']), 'A\nB')
  assert.equal(scheduleClipboardText(['A\nB', 'A"B']), '"A\nB"\n"A""B"')
})

test('space insertion preserves leading, trailing, repeated spaces, caret position, and selected text replacement', () => {
  assert.deepEqual(insertScheduleCellText('FacultyName', ' ', 7), { value: 'Faculty Name', caret: 8 })
  assert.deepEqual(insertScheduleCellText('Faculty Name', ' ', 8), { value: 'Faculty  Name', caret: 9 })
  assert.deepEqual(insertScheduleCellText('Name', ' ', 0), { value: ' Name', caret: 1 })
  assert.deepEqual(insertScheduleCellText('Name', ' ', 4), { value: 'Name ', caret: 5 })
  assert.deepEqual(insertScheduleCellText('FirstMiddleLast', ' ', 5, 11), { value: 'First Last', caret: 6 })
})
