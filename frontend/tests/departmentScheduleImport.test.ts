import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { createEmptyDepartmentScheduleSheet, detectDepartmentScheduleYearSections, readDepartmentScheduleImport } from '../src/utils/departmentScheduleImport.ts'
import { createDepartmentScheduleExport } from '../src/utils/departmentScheduleExport.ts'
import { scheduleHeaderValues, scheduleHeaderMerges, scheduleHeaderAt } from '../src/utils/excelScheduleTemplate.ts'

function scheduleSheet() {
  const sheet = XLSX.utils.aoa_to_sheet([])
  XLSX.utils.sheet_add_aoa(sheet, scheduleHeaderValues(), { origin: 'C5' })
  sheet['!merges'] = scheduleHeaderMerges(scheduleHeaderAt({ r: 4, c: 2 }))
  // The screenshot merges Units across both three-column sets.
  sheet['!merges'] = sheet['!merges'].filter(merge => merge.s.c !== 10)
  sheet['!merges'].find(merge => merge.s.c === 7)!.e.c = 12
  XLSX.utils.sheet_add_aoa(sheet, [['CITE', 'Professional', 'ITE 101', 'Computing', 'BSIT', 2, 1, 3, 2, 3, 5, 40, '1', 'Faculty', '', '08:00', '', 'MON', '', 'A101', '']], { origin: 'C8' })
  return sheet
}

test('detects an offset, merged two-row header after an XLSX round trip and retains all 21 columns', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, scheduleSheet(), 'Schedule')
  const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const matches = readDepartmentScheduleImport(reopened)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].headerRow, 5)
  assert.equal(matches[0].rows[0].rowNumber, 8)
  assert.equal(matches[0].rows[0].values.length, 21)
  assert.deepEqual(matches[0].rows[0].values.slice(2, 8), ['ITE 101', 'Computing', 'BSIT', '2', '1', '3'])
})

test('the downloadable schedule template uses Class Type and can be imported', () => {
  const workbook = XLSX.read(readFileSync(new URL('../public/department-schedule-template.xlsx', import.meta.url)), { type: 'buffer' })
  assert.equal(workbook.Sheets.Schedule.B2?.v, 'Class Type')
  assert.equal(readDepartmentScheduleImport(workbook).length, 1)
})

test('an exported schedule uses Class Type and can be imported again', () => {
  const bytes = createDepartmentScheduleExport([createEmptyDepartmentScheduleSheet()], null, () => '')
  const workbook = XLSX.read(bytes, { type: 'array' })
  assert.equal(workbook.Sheets.Schedule.B2?.v, 'Class Type')
  assert.equal(readDepartmentScheduleImport(workbook).length, 1)
})

test('checks every sheet, tolerates case and whitespace, and accepts headers without data', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Instructions']]), 'Notes')
  const sheet = scheduleSheet()
  sheet.C5 = { t: 's', v: '  COLLEGE  ' }
  sheet.F5 = { t: 's', v: 'Descriptive\nTitle' }
  XLSX.utils.book_append_sheet(workbook, sheet, 'First')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(scheduleHeaderValues()), 'Empty')
  const matches = readDepartmentScheduleImport(workbook)
  assert.deepEqual(matches.map(match => match.name), ['First', 'Empty'])
  assert.equal(matches[1].rows.length, 40)
  assert.ok(matches[1].rows.every(row => row.values.every(value => value === '')))
})

test('rejects missing, swapped, or incorrect subheaders even when top-level labels match', () => {
  for (const value of ['', 'Lec', 'Room']) {
    const workbook = XLSX.utils.book_new()
    const sheet = scheduleSheet()
    sheet.W6 = { t: 's', v: value }
    XLSX.utils.book_append_sheet(workbook, sheet, 'Invalid')
    assert.equal(readDepartmentScheduleImport(workbook).length, 0)
  }
})

test('ignores formatted empty tails and moves section headings out of data while retaining source row numbers', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = scheduleSheet()
  sheet.C7 = { t: 's', v: '1BSIT: CURRICULUM' }
  sheet['!ref'] = 'C5:W1048576'
  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule')
  const [match] = readDepartmentScheduleImport(workbook)
  assert.equal(match.rows[0].rowNumber, 8)
  assert.equal(match.rows.length, 10)
  assert.equal(match.yearSections?.[0].label, '1BSIT: CURRICULUM')
  assert.equal(match.rows[0].values[2], 'ITE 101')
})

test('groups imported rows by curriculum headings instead of fixed ten-row sections', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(scheduleHeaderValues())
  XLSX.utils.sheet_add_aoa(sheet, [
    ['Notes before the first section'],
    ['1BSIT: 2023-24 CURRICULUM'],
    ['', '', 'ITE 101'],
    [],
    [' 2BSIT: 2023-24 curriculum '],
    ['', '', 'ITE 201'],
    ['3BSIT: 2023-24 CURRICULUM', '', 'This is course data, not a heading'],
    ['4BSIT: 2022-23 CURRICULUM'],
    ['', '', 'ITE 401'],
  ], { origin: 'A3' })
  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule')
  const [match] = readDepartmentScheduleImport(workbook)
  assert.deepEqual(match.yearSections, [
    { label: '1BSIT: 2023-24 CURRICULUM', sourceLabel: '1BSIT: 2023-24 CURRICULUM', start: 0, count: 10 },
    { label: '2BSIT: 2023-24 curriculum', sourceLabel: '2BSIT: 2023-24 curriculum', start: 10, count: 10 },
    { label: '4BSIT: 2022-23 CURRICULUM', sourceLabel: '4BSIT: 2022-23 CURRICULUM', start: 20, count: 10 },
  ])
  assert.equal(match.rows[0].values[2], 'ITE 101')
  assert.deepEqual(match.rows.filter(row => row.values.some(Boolean)).map(row => row.rowNumber), [5, 8, 9, 11])
  assert.equal(new Set(match.rows.map(row => row.rowNumber)).size, match.rows.length)
})

test('imports without year headings default to year labels while blank workbooks retain four ten-row years', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, scheduleSheet(), 'Schedule')
  assert.deepEqual(readDepartmentScheduleImport(workbook)[0].yearSections, [{ label: '1st Year', start: 0, count: 10 }])
  const blank = createEmptyDepartmentScheduleSheet()
  assert.equal(blank.rows.length, 40)
  assert.deepEqual(blank.yearSections?.map(section => [section.label, section.start, section.count]), [
    ['1st Year', 0, 10], ['2nd Year', 10, 10], ['3rd Year', 20, 10], ['4th Year', 30, 10],
  ])
  const rows = Array.from({ length: 45 }, (_, index) => ({ rowNumber: index + 3, values: Array<string>(21).fill('') }))
  assert.deepEqual(detectDepartmentScheduleYearSections(rows).map(section => [section.start, section.count]), [[0, 10], [10, 10], [20, 10], [30, 15]])
  assert.deepEqual(detectDepartmentScheduleYearSections(rows.slice(0, 12)).map(section => [section.start, section.count]), [[0, 10], [10, 2]])
  assert.deepEqual(detectDepartmentScheduleYearSections([]), [])
})

test('empty detected years keep ten editable blank rows and the full heading only in the side header', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(scheduleHeaderValues())
  XLSX.utils.sheet_add_aoa(sheet, [['1BSIT: 2023-24 CURRICULUM'], [], ['2BSIT: 2023-24 CURRICULUM'], ['', '', 'ITE 201']], { origin: 'A3' })
  XLSX.utils.book_append_sheet(workbook, sheet, 'Schedule')
  const [match] = readDepartmentScheduleImport(workbook)
  assert.deepEqual(match.yearSections?.map(section => [section.label, section.start, section.count]), [
    ['1BSIT: 2023-24 CURRICULUM', 0, 10], ['2BSIT: 2023-24 CURRICULUM', 10, 10],
  ])
  assert.ok(match.rows.slice(0, 10).every(row => row.values.every(value => value === '')))
  assert.equal(match.rows[10].values[2], 'ITE 201')
  assert.equal(new Set(match.rows.map(row => row.rowNumber)).size, 20)
  assert.ok(match.rows.every(row => !row.values[0].includes('CURRICULUM')))
})
