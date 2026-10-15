import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyScheduleCellValues, formatScheduleTimeInput, hasExtraScheduleValues, indexScheduleRows, isScheduleCellCharacterAllowed, normalizeScheduleCellText } from '../src/utils/departmentScheduleEdits.ts'
import type { DepartmentScheduleImportSheet } from '../src/utils/departmentScheduleImport.ts'

function workbook(count = 1000): DepartmentScheduleImportSheet[] {
  return ['First', 'Second'].map(name => ({ name, headerRow: 1,
    rows: Array.from({ length: count }, (_, index) => ({ rowNumber: index * 2 + 4, values: Array<string>(21).fill(`Row ${index}`) })) }))
}

test('typing changes only its target row and preserves all other row and sheet references', () => {
  const sheets = workbook()
  const target = { sheet: 0, row: sheets[0].rows[500].rowNumber, column: 3 }
  const next = applyScheduleCellValues(sheets, indexScheduleRows(sheets), [{ cell: target, value: 'Edited' }])
  assert.notEqual(next, sheets)
  assert.notEqual(next[0], sheets[0])
  assert.equal(next[1], sheets[1])
  assert.equal(next[0].rows.filter((row, index) => row !== sheets[0].rows[index]).length, 1)
  assert.equal(next[0].rows[500].values[3], 'Edited')
  assert.equal(sheets[0].rows[500].values[3], 'Row 500')
  assert.equal(next[0].rows[499].values, sheets[0].rows[499].values)
})

test('range edits replace only selected rows, including empty values, without changing other columns', () => {
  const sheets = workbook(150)
  const changes = sheets[0].rows.slice(30, 80).map(row => ({ cell: { sheet: 0, row: row.rowNumber, column: 13 }, value: '' }))
  const next = applyScheduleCellValues(sheets, indexScheduleRows(sheets), changes)
  assert.equal(next[0].rows.filter((row, index) => row !== sheets[0].rows[index]).length, 50)
  assert.equal(next[0].rows[30].values[13], '')
  assert.equal(next[0].rows[30].values[12], sheets[0].rows[30].values[12])
  assert.equal(next[0].rows[29], sheets[0].rows[29])
  assert.equal(next[0].rows[80], sheets[0].rows[80])
})

test('no-op edits preserve the entire workbook reference and repeated edits use the last value', () => {
  const sheets = workbook(10)
  const indexes = indexScheduleRows(sheets)
  const cell = { sheet: 0, row: 4, column: 3 }
  assert.equal(applyScheduleCellValues(sheets, indexes, []), sheets)
  assert.equal(applyScheduleCellValues(sheets, indexes, [{ cell, value: 'Row 0' }]), sheets)
  assert.equal(applyScheduleCellValues(sheets, indexes, [{ cell, value: 'Temporary' }, { cell, value: 'Row 0' }]), sheets)
  assert.equal(applyScheduleCellValues(sheets, indexes, [{ cell, value: 'First' }, { cell, value: 'Last' }])[0].rows[0].values[3], 'Last')
})

test('unknown row, sheet, and column coordinates do not create or change cells', () => {
  const sheets = workbook(10)
  const next = applyScheduleCellValues(sheets, indexScheduleRows(sheets), [
    { cell: { sheet: 5, row: 4, column: 2 }, value: 'Invalid' },
    { cell: { sheet: 0, row: 999, column: 2 }, value: 'Invalid' },
    { cell: { sheet: 0, row: 4, column: 21 }, value: 'Invalid' },
  ])
  assert.equal(next, sheets)
})

test('typed and pasted code, room and day changes are uppercase while titles and faculty retain their case', () => {
  const sheets = workbook(1)
  const columns = [2, 3, 13, 14, 17, 18, 19, 20]
  const changes = columns.map(column => ({ cell: { sheet: 0, row: 4, column }, value: column === 2 ? 'ite 398' : column === 3 ? 'Capstone Project' : column < 17 ? 'Cruz, Engelbert' : column < 19 ? 'mon/wed' : 'mba 101' }))
  const [sheet] = applyScheduleCellValues(sheets, indexScheduleRows(sheets), changes)
  assert.deepEqual(columns.map(column => sheet.rows[0].values[column]), ['ITE 398', 'Capstone Project', 'Cruz, Engelbert', 'Cruz, Engelbert', 'MON/WED', 'MON/WED', 'MBA 101', 'MBA 101'])
})

test('time and day cells reject spaces while retaining meeting separators and spaces in other fields', () => {
  assert.equal(normalizeScheduleCellText(15, '7:30 AM - 9:00 AM / 1:00 PM - 2:00 PM'), '7:30-9:00/1:00-2:00')
  assert.equal(normalizeScheduleCellText(16, ' 7:30 - 9:00\n 13:00 - 14:00 '), '7:30-9:00\n13:00-14:00')
  assert.equal(normalizeScheduleCellText(17, ' mon / wed '), 'MON/WED')
  assert.equal(normalizeScheduleCellText(18, ' thu / fri '), 'THU/FRI')
  assert.equal(normalizeScheduleCellText(13, 'Cruz, Engelbert'), 'Cruz, Engelbert')
})

test('day cells accept letters and day separators but reject digits and other symbols', () => {
  for (const column of [17, 18]) {
    for (const character of 'MONtue/') assert.equal(isScheduleCellCharacterAllowed(column, character), true, character)
    for (const character of '123:- @!,;') assert.equal(isScheduleCellCharacterAllowed(column, character), false, character)
    assert.equal(normalizeScheduleCellText(column, 'mon123 / wed!'), 'MON/WED')
    assert.equal(normalizeScheduleCellText(column, 'BAT'), 'BAT')
  }
})

test('time cells accept time characters and meeting separators but reject unrelated letters', () => {
  for (const column of [15, 16]) {
    for (const character of '0123456789:/;-–—') assert.equal(isScheduleCellCharacterAllowed(column, character), true, character)
    for (const character of 'APMapmbCxyz @!') assert.equal(isScheduleCellCharacterAllowed(column, character), false, character)
    assert.equal(normalizeScheduleCellText(column, '7x:30 AM - 9:00 AM!'), '7:30-9:00')
    assert.equal(normalizeScheduleCellText(column, '7:30-9:00/13:00-14:00'), '7:30-9:00/13:00-14:00')
  }
  assert.equal(isScheduleCellCharacterAllowed(3, '9'), true)
  assert.equal(isScheduleCellCharacterAllowed(13, ' '), true)
})

test('Faculty, F2F Time, Days and Room entries are limited to two values', () => {
  for (const [column, text, expected] of [
    [13, 'Cruz, Engelbert/Narvasa, Jan/Other Faculty', 'Cruz, Engelbert/Narvasa, Jan'],
    [14, 'First/Second/Third', 'First/Second'],
    [15, '7:30-9:00/9:00-10:30/13:00-14:00', '7:30-9:00/9:00-10:30'],
    [16, '7:30-9:00;9:00-10:30;13:00-14:00', '7:30-9:00;9:00-10:30'],
    [17, 'MON/SAT/SUN', 'MON/SAT'], [18, 'MON/SAT/SUN', 'MON/SAT'],
    [19, 'MBA 101/ITS 201/PTC 301', 'MBA 101/ITS 201'], [20, 'MBA 101\nITS 201\nPTC 301', 'MBA 101\nITS 201'],
  ] as const) {
    assert.equal(hasExtraScheduleValues(column, text), true)
    assert.equal(normalizeScheduleCellText(column, text), expected)
    assert.equal(hasExtraScheduleValues(column, expected), false)
  }
  assert.equal(normalizeScheduleCellText(17, 'MONWEDSUN'), 'MONWEDSUN')
  assert.equal(normalizeScheduleCellText(19, 'N/A/MBA 101'), 'N/A/MBA 101')
  assert.equal(hasExtraScheduleValues(19, 'N/A/MBA 101'), false)
  assert.equal(normalizeScheduleCellText(3, 'Title/with/three/parts'), 'Title/with/three/parts')
})

test('time shorthand formats on each keystroke while preserving four-digit hour entry', () => {
  for (const [typed, expected] of [
    ['730', '7:30'], ['900', '9:00'], ['1000', '10:00'], ['1230', '12:30'], ['0730', '7:30'],
    ['1300', '13:00'], ['2300', '23:00'], ['730-900/1300-1430', '7:30-9:00/13:00-14:30'],
    ['7-9', '7:00-9'], ['7AM', '7'], ['730pm-900pm', '7:30-9:00'],
  ]) {
    let value = ''
    for (const character of typed) {
      const next = formatScheduleTimeInput(value + character)
      value = next.value
      assert.equal(next.caret, value.length)
    }
    assert.equal(value, expected, typed)
  }
})

test('live time formatting preserves partial edits, invalid values and caret position within ranges', () => {
  assert.deepEqual(formatScheduleTimeInput('12'), { value: '12', caret: 2 })
  assert.deepEqual(formatScheduleTimeInput('7:3'), { value: '7:3', caret: 3 })
  assert.deepEqual(formatScheduleTimeInput('1260'), { value: '1260', caret: 4 })
  assert.deepEqual(formatScheduleTimeInput('730-900', 3), { value: '7:30-9:00', caret: 4 })
  assert.deepEqual(formatScheduleTimeInput('1:230'), { value: '12:30', caret: 5 })
})
