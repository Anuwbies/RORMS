import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyDepartmentScheduleSheet } from '../src/utils/departmentScheduleImport.ts'
import { mergeDepartmentSchedule } from '../src/utils/mergeDepartmentSchedule.ts'
import { hasDepartmentScheduleChanges } from '../src/utils/departmentScheduleSaveStatus.ts'

function workbook() {
  return { sheets: [createEmptyDepartmentScheduleSheet()], columnWidths: [50, 60, 100] as number[] | null }
}

test('merging keeps local edits and remote edits in other cells and sheets without mutating either workbook', () => {
  const base = workbook()
  const second = createEmptyDepartmentScheduleSheet(); second.name = 'Second'; base.sheets.push(second)
  const local = structuredClone(base), remote = structuredClone(base)
  local.sheets[0].rows[0].values[13] = 'My instructor'
  remote.sheets[0].rows[0].values[19] = 'MBA 101'
  remote.sheets[1].rows[1].values[12] = '2'
  const result = mergeDepartmentSchedule(base, local, remote)
  assert.equal(result.structuralConflict, false)
  assert.equal(result.conflicts, 0)
  assert.equal(result.sheets[0].rows[0].values[13], 'My instructor')
  assert.equal(result.sheets[0].rows[0].values[19], 'MBA 101')
  assert.equal(result.sheets[1].rows[1].values[12], '2')
  assert.equal(local.sheets[0].rows[0].values[19], '')
  assert.equal(remote.sheets[0].rows[0].values[13], '')
  assert.equal(base.sheets[1].rows[1].values[12], '')
  assert.equal(hasDepartmentScheduleChanges({ ...remote, persisted: true, file: null }, result.sheets, result.columnWidths, null), true)
})

test('same-cell conflicts keep local values including deletion, and identical concurrent changes are clean', () => {
  const base = workbook(); base.sheets[0].rows[0].values[19] = 'MBA 101'
  const local = structuredClone(base), remote = structuredClone(base)
  local.sheets[0].rows[0].values[19] = ''
  remote.sheets[0].rows[0].values[19] = 'ITS 201'
  const result = mergeDepartmentSchedule(base, local, remote)
  assert.equal(result.sheets[0].rows[0].values[19], '')
  assert.equal(result.conflicts, 1)
  assert.equal(result.structuralConflict, false)
  const identical = mergeDepartmentSchedule(base, remote, structuredClone(remote))
  assert.equal(identical.conflicts, 0)
  assert.equal(hasDepartmentScheduleChanges({ ...remote, persisted: true, file: null }, identical.sheets, identical.columnWidths, null), false)
})

test('remote deletions are retained when that local cell was not edited', () => {
  const base = workbook(); base.sheets[0].rows[0].values[19] = 'MBA 101'
  const local = structuredClone(base), remote = structuredClone(base)
  local.sheets[0].rows[1].values[12] = '3'
  remote.sheets[0].rows[0].values[19] = ''
  const result = mergeDepartmentSchedule(base, local, remote)
  assert.equal(result.sheets[0].rows[0].values[19], '')
  assert.equal(result.sheets[0].rows[1].values[12], '3')
})

test('year labels, visibility and independent column widths merge without replacing other settings', () => {
  const base = workbook(), local = structuredClone(base), remote = structuredClone(base)
  local.sheets[0].yearSections![0].label = 'My year'
  local.columnWidths![0] = 55
  remote.sheets[0].yearSections![0].hidden = true
  remote.columnWidths![1] = 75
  const result = mergeDepartmentSchedule(base, local, remote)
  assert.equal(result.sheets[0].yearSections![0].label, 'My year')
  assert.equal(result.sheets[0].yearSections![0].hidden, true)
  assert.deepEqual(result.columnWidths, [55, 75, 100])
  assert.equal(result.conflicts, 0)
  remote.columnWidths![0] = 65
  assert.deepEqual(mergeDepartmentSchedule(base, local, remote).columnWidths, [55, 75, 100])
  assert.equal(mergeDepartmentSchedule(base, local, remote).conflicts, 1)
})

test('row insertion, row movement and sheet changes cannot silently merge into incorrect coordinates', () => {
  const base = workbook(), local = structuredClone(base)
  local.sheets[0].rows[0].values[13] = 'Keep mine'
  for (const modify of [
    (remote: typeof base) => { remote.sheets[0].rows.push({ rowNumber: 9999, values: Array(21).fill('') }) },
    (remote: typeof base) => { remote.sheets[0].rows.reverse() },
    (remote: typeof base) => { remote.sheets[0].name = 'Renamed' },
    (remote: typeof base) => { remote.sheets[0].yearSections![0].count++ },
  ]) {
    const remote = structuredClone(base); modify(remote)
    const result = mergeDepartmentSchedule(base, local, remote)
    assert.equal(result.structuralConflict, true)
    assert.equal(result.sheets, local.sheets)
    assert.equal(result.sheets[0].rows[0].values[13], 'Keep mine')
  }
})

test('a layout change is safe if only one side changed, including an unchanged remote revision save', () => {
  const base = workbook(), changed = structuredClone(base)
  changed.sheets[0].rows.pop()
  assert.equal(mergeDepartmentSchedule(base, base, changed).sheets, changed.sheets)
  assert.equal(mergeDepartmentSchedule(base, changed, base).sheets, changed.sheets)
  assert.equal(mergeDepartmentSchedule(base, changed, base).structuralConflict, false)
})

test('column widths can be initialized remotely while local cell changes remain unsaved', () => {
  const base = workbook(); base.columnWidths = null
  const local = structuredClone(base), remote = structuredClone(base)
  local.sheets[0].rows[0].values[12] = '2'
  remote.columnWidths = [55, 65, 110]
  const result = mergeDepartmentSchedule(base, local, remote)
  assert.deepEqual(result.columnWidths, [55, 65, 110])
  assert.equal(result.sheets[0].rows[0].values[12], '2')
  assert.equal(result.structuralConflict, false)
})
