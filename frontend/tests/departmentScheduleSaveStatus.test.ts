import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { hasDepartmentScheduleChanges, type DepartmentScheduleSaveBaseline } from '../src/utils/departmentScheduleSaveStatus.ts'

function baseline(): DepartmentScheduleSaveBaseline {
  return { sheets: [createEmptyDepartmentScheduleSheet()], columnWidths: [50, 60], file: null, persisted: true }
}

test('saved content stays clean across selection and equivalent restored workbook values', () => {
  const saved = baseline()
  assert.equal(hasDepartmentScheduleChanges(saved, saved.sheets, saved.columnWidths, null), false)
  assert.equal(hasDepartmentScheduleChanges(saved, structuredClone(saved.sheets), [50, 60], null), false)
  assert.equal(hasDepartmentScheduleChanges({ ...saved, persisted: false }, saved.sheets, saved.columnWidths, null), true)
})

test('cell changes become clean again after undo without relying on object identity', () => {
  const saved = baseline()
  const sheets = structuredClone(saved.sheets)
  sheets[0].rows[0].values[2] = 'ITE 398'
  assert.equal(hasDepartmentScheduleChanges(saved, sheets, saved.columnWidths, null), true)
  sheets[0].rows[0].values[2] = saved.sheets[0].rows[0].values[2]
  assert.equal(hasDepartmentScheduleChanges(saved, sheets, saved.columnWidths, null), false)
})

test('row structure, year settings, imports and column widths are unsaved changes', () => {
  const saved = baseline()
  for (const modify of [
    (sheets: typeof saved.sheets) => { sheets[0].rows.pop() },
    (sheets: typeof saved.sheets) => { sheets[0].name = 'Renamed' },
    (sheets: typeof saved.sheets) => { sheets[0].yearSections![0].hidden = true },
  ]) {
    const sheets = structuredClone(saved.sheets)
    modify(sheets)
    assert.equal(hasDepartmentScheduleChanges(saved, sheets, saved.columnWidths, null), true)
  }
  assert.equal(hasDepartmentScheduleChanges(saved, saved.sheets, [51, 60], null), true)
  assert.equal(hasDepartmentScheduleChanges(saved, saved.sheets, null, null), true)
  assert.equal(hasDepartmentScheduleChanges(saved, saved.sheets, saved.columnWidths, new File([], 'Schedule.xlsx')), true)
})
