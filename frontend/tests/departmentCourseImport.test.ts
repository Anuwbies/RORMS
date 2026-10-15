import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { DEPARTMENT_COURSE_HEADERS, readDepartmentCourses } from '../src/utils/departmentCourseImport.ts'

test('finds offset course headers after an XLSX round trip and preserves all six displayed values', () => {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([])
  XLSX.utils.sheet_add_aoa(sheet, [
    [...DEPARTMENT_COURSE_HEADERS],
    ['SY 23-24 SEM I', 'Y1S1', 'GEN 001', 'Purposive Communication', 'Lecture', 3],
    [],
    ['-', 'Y4S2', 'ITE 311', 'IT Practicum', '-', 6],
  ], { origin: 'B2' })
  XLSX.utils.book_append_sheet(workbook, sheet, 'CITE')
  const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  const [match] = readDepartmentCourses(reopened)
  assert.equal(match.name, 'CITE')
  assert.equal(match.headerRow, 2)
  assert.deepEqual(match.rows.map(row => row.rowNumber), [3, 5])
  assert.deepEqual(match.rows[0].values, ['SY 23-24 SEM I', 'Y1S1', 'GEN 001', 'Purposive Communication', 'Lecture', '3'])
  assert.equal(match.rows[1].values[5], '6')
})

test('checks every worksheet, tolerates header casing and whitespace, and ignores formatting-only tails', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Other content']]), 'Notes')
  const sheet = XLSX.utils.aoa_to_sheet([
    [' SESSION ', 'semester', 'Code', ' Course ', 'TYPE', 'Credits'],
    ['', '', 'ITE 101', 'Computing', 'Lecture', 0],
  ])
  sheet['!ref'] = 'A1:F1048576'
  XLSX.utils.book_append_sheet(workbook, sheet, 'Courses')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[...DEPARTMENT_COURSE_HEADERS]]), 'Empty')
  const matches = readDepartmentCourses(workbook)
  assert.deepEqual(matches.map(sheet => sheet.name), ['Courses', 'Empty'])
  assert.equal(matches[0].rows.length, 1)
  assert.equal(matches[0].rows[0].values[5], '0')
  assert.equal(matches[1].rows.length, 0)
})

test('rejects missing and swapped required course headers', () => {
  for (const headers of [
    ['Session', 'Semester', 'Code', 'Course', 'Type'],
    ['Session', 'Semester', 'Course', 'Code', 'Type', 'Credits'],
  ]) {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), 'Invalid')
    assert.equal(readDepartmentCourses(workbook).length, 0)
  }
})

