import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fillSummaryFacultyRows, summarizeScheduleFacultyLoads } from '../src/utils/departmentSummaryAutofill.ts'

test('one listed instructor receives both saved Lec and Lab hours, including zero for blank Hours cells', () => {
  const schedules = [
    { faculty: { lec: ['Cruz, Engelbert'], lab: [] }, hours: { lec: 2.5, lab: 3 }, groupId: '' },
    { faculty: { lec: ['Cruz, Engelbert'], lab: [] }, hours: { lec: 1, lab: null }, groupId: '' },
    { faculty: { lec: ['Not a member'], lab: [] }, hours: { lec: 8, lab: 8 }, groupId: '' },
  ]
  const [load] = summarizeScheduleFacultyLoads(schedules, 'CITE', ['Cruz, Engelbert'])
  assert.deepEqual(load, { faculty: 'Cruz, Engelbert', department: 'CITE', lec: 3.5, lab: 3, total: 6.5 })
  const rows = [Array<string>(12).fill(''), Array<string>(12).fill('')]
  const filled = fillSummaryFacultyRows(rows, [load])
  assert.deepEqual(filled[0].slice(4, 7), ['3.5', '3', '6.50'])
  assert.equal(filled[0].length, 12)
  const withInsertedRow = fillSummaryFacultyRows(rows, [load, { ...load, faculty: 'Vidal, Angelica' }])
  assert.equal(withInsertedRow[1].length, 12)
})

test('different Lec and Lab instructors receive only their respective hours', () => {
  const loads = summarizeScheduleFacultyLoads([{ faculty: { lec: ['Cruz, Engelbert'], lab: ['Vidal, Angelica'] },
    hours: { lec: 2, lab: 3 } }], 'CITE', ['Cruz, Engelbert', 'Vidal, Angelica'])
  assert.deepEqual(loads.map(load => [load.faculty, load.lec, load.lab, load.total]), [
    ['Cruz, Engelbert', 2, 0, 2], ['Vidal, Angelica', 0, 3, 3],
  ])
})

test('parallel sections with one shared instructor count as one teaching load', () => {
  const classRow = { faculty: { lec: ['Cruz, Engelbert'], lab: [] }, hours: { lec: 2, lab: 3 }, groupId: 'parallel-1' }
  const loads = summarizeScheduleFacultyLoads([classRow, classRow, classRow], 'CITE', ['Cruz, Engelbert'])
  assert.deepEqual(loads.map(load => [load.lec, load.lab, load.total]), [[2, 3, 5]])
})

test('saved raw Hours values remain available when a legacy schedule lacks its parsed hours', () => {
  const rawValues = Array<string>(21).fill('')
  rawValues[8] = '2.5'
  rawValues[9] = '0'
  const loads = summarizeScheduleFacultyLoads([{ faculty: { lec: ['Cruz, Engelbert'] }, rawValues }],
    'CITE', ['Cruz, Engelbert'])
  assert.deepEqual(loads.map(load => [load.lec, load.lab, load.total]), [[2.5, 0, 2.5]])
})
