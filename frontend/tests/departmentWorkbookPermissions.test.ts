import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canEditDepartmentWorkbook, canPlotDepartmentSchedules, schedulePlottingPhases, workbookEditablePhases } from '../src/utils/departmentWorkbookPermissions.ts'

const member = { userId: 'registrar', role: 'Registrar', status: 'accepted', department: 'CITE' }

test('Registrar can view every workbook phase but cannot edit it, even in their own department', () => {
  assert.deepEqual(workbookEditablePhases('Registrar'), [])
  for (const phase of ['Drafting', 'Plotting', 'Revision', 'Final', 'Closed', 'Ended']) {
    assert.equal(canEditDepartmentWorkbook(member, 'registrar', 'CITE', phase), false)
  }
})

test('Registrar plotting retains its own permissions independently of workbook editing', () => {
  assert.deepEqual(schedulePlottingPhases('Registrar'), ['Drafting', 'Plotting', 'Revision', 'Final'])
  for (const phase of schedulePlottingPhases('Registrar')) assert.equal(canPlotDepartmentSchedules(member, 'registrar', phase), true)
  for (const phase of ['Closed', 'Ended']) assert.equal(canPlotDepartmentSchedules(member, 'registrar', phase), false)
  assert.equal(canPlotDepartmentSchedules({ ...member, status: 'pending' }, 'registrar', 'Plotting'), false)
  assert.equal(canPlotDepartmentSchedules(member, 'other-user', 'Plotting'), false)
  assert.equal(canPlotDepartmentSchedules({ ...member, role: 'Dean' }, 'registrar', 'Plotting'), false)
})

test('Admin and department editor workbook access is preserved', () => {
  assert.equal(canEditDepartmentWorkbook({ ...member, role: 'Admin' }, 'registrar', 'OTHER', 'Final'), true)
  assert.equal(canEditDepartmentWorkbook({ ...member, role: 'Dean' }, 'registrar', 'CITE', 'Drafting'), true)
  assert.equal(canEditDepartmentWorkbook({ ...member, role: 'Program Head' }, 'registrar', 'CITE', 'Revision'), true)
  assert.equal(canEditDepartmentWorkbook({ ...member, role: 'Dean' }, 'registrar', 'OTHER', 'Drafting'), false)
})
