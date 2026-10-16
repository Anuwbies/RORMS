import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completeScheduleResourceText, insertScheduleTimeTba } from '../src/utils/scheduleResourceCompletion.ts'
import type { ScheduleDirectory } from '../src/utils/excelScheduleRows.ts'

const directory: ScheduleDirectory = {
  departmentCode: 'CITE',
  rooms: [
    { id: 'a', code: 'MBA101', name: 'MBA 101', buildingId: 'MBA' },
    { id: 'b', code: 'MBA102', name: 'MBA 102', buildingId: 'MBA' },
    { id: 'c', code: 'MBA101A', name: 'MBA 101A', buildingId: 'MBA' },
  ],
  faculty: [
    { id: 'a', fullName: 'Cruz, Engelbert', department: 'CITE' },
    { id: 'b', fullName: 'Narvasa, Jan Julienne', department: 'CITE' },
    { id: 'c', fullName: 'Cruz, Jane', department: 'CITE' },
    { id: 'd', fullName: 'Outside, Instructor', department: 'CAS' },
  ],
}

test('room completion normalizes an exact code even when another room shares its prefix', () => {
  assert.equal(completeScheduleResourceText('mba101', 19, directory), 'MBA 101')
  assert.equal(completeScheduleResourceText('mba-102', 20, directory), 'MBA 102')
})

test('faculty completion uses the unique department name and recognizes surname aliases', () => {
  assert.equal(completeScheduleResourceText('engel', 13, directory), 'Cruz, Engelbert')
  assert.equal(completeScheduleResourceText('jan julienne narvasa', 14, directory), 'Narvasa, Jan Julienne')
  assert.equal(completeScheduleResourceText('outside', 13, directory), 'outside')
})

test('ambiguous, unknown, blank and placeholder entries stay unchanged', () => {
  for (const value of ['mba', 'unknown', '', ' ', 'TBA', 'N/A', '-']) {
    assert.equal(completeScheduleResourceText(value, 19, directory), value.toUpperCase())
  }
  assert.equal(completeScheduleResourceText('cruz', 13, directory), 'cruz')
})

test('completion preserves each meeting separator and surrounding whitespace', () => {
  assert.equal(completeScheduleResourceText(' mba102 /N/A; mba101\nmba101a ', 19, directory), ' MBA 102 /N/A')
  assert.equal(completeScheduleResourceText('engel / jan julienne', 13, directory), 'Cruz, Engelbert / Narvasa, Jan Julienne')
})

test('other columns retain their case and rooms and days are uppercase even without directories', () => {
  assert.equal(completeScheduleResourceText('mba101', 3, directory), 'mba101')
  assert.equal(completeScheduleResourceText('ite398', 2, directory), 'ITE398')
  assert.equal(completeScheduleResourceText('mba101', 19, null), 'MBA101')
  assert.equal(completeScheduleResourceText('mon/wed', 17, null), 'MON/WED')
  assert.equal(completeScheduleResourceText('fri', 18, directory), 'FRI')
})

test('time shorthand completes both ends and both meeting ranges when leaving the cell', () => {
  for (const [text, expected] of [
    ['730', '7:30'], ['900', '9:00'], ['1000', '10:00'], ['0730', '7:30'], ['7', '7:00'],
    ['730-900', '7:30-9:00'], ['1300-1430/1530-1700', '13:00-14:30/15:30-17:00'],
    ['730am-900am', '7:30-9:00'], ['7:30-9:00', '7:30-9:00'],
    ['1260-2500', '1260-2500'], ['1300PM', '13:00'], ['TBA', 'TBA'],
    ['tba/730-900', 'TBA/7:30-9:00'], ['730-900/tba', '7:30-9:00/TBA'],
  ]) {
    assert.equal(completeScheduleResourceText(text, 15, null), expected, text)
    assert.equal(completeScheduleResourceText(text, 16, null), expected, text)
  }
})

test('selecting the single TBA choice fills an empty time entry without replacing the existing time', () => {
  assert.equal(insertScheduleTimeTba('7:30/', 0, 5), '7:30/TBA')
  assert.equal(insertScheduleTimeTba('7:30-9:00/', 0, 10), '7:30-9:00/TBA')
  assert.equal(insertScheduleTimeTba('/7:30-9:00', 0, 10), 'TBA/7:30-9:00')
  assert.equal(insertScheduleTimeTba('TBA/'), 'TBA/TBA')
  assert.equal(insertScheduleTimeTba(''), 'TBA')
})

test('TBA selection can replace either existing time entry or the whole selected value', () => {
  const text = '7:30-9:00/13:30-15:00'
  assert.equal(insertScheduleTimeTba(text, 3), 'TBA/13:30-15:00')
  assert.equal(insertScheduleTimeTba(text), '7:30-9:00/TBA')
  assert.equal(insertScheduleTimeTba(text, 0, text.length), 'TBA')
})
