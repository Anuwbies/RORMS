import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/tabs/LogsPage.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('LogsPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['logText', 'logRecord', 'accountLogEntry'].includes(node.name?.text)).map(node => node.getText(ast)).join('\n')
class Timestamp {
  constructor(value) { this.value = new Date(value) }
  toDate() { return this.value }
}
const context = { module: {}, Timestamp, ROLE_CLASSES: { Admin: '', Registrar: '' } }
vm.runInNewContext(ts.transpileModule(`${helpers}\nmodule.exports = accountLogEntry`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
const entry = context.module.exports

test('inviting shows the invitation action rather than treating initial values as edits', () => {
  const changes = { department: { before: null, after: '' }, role: { before: null, after: 'Instructor' }, invitationStatus: { before: 'Not pending', after: 'Pending' } }
  const invited = entry('invite', { action: 'account.invited', memberRole: 'Instructor', department: '', changes })
  assert.equal(invited.detail, 'Invitation queued for email delivery.')
  assert.equal(invited.memberSnapshot.role, 'Instructor')
  assert.equal(invited.detail.includes('→'), false)
  assert.equal(invited.memberChanges.length, 0)
  const reinvited = entry('reinvite', { action: 'account.reinvited', changes })
  assert.equal(reinvited.detail, 'Reactivation invitation queued for email delivery.')
  assert.equal(reinvited.memberChanges.length, 0)
})

test('account history shows affected member, precise changes, source path and Philippine time', () => {
  const log = entry('event', {
    action: 'account.member_updated', actorName: 'Santos, Maria', actorRole: 'Admin', actorId: 'admin',
    memberName: 'Cruz, Juan', memberEmail: 'juan@example.com', memberRole: 'Program Head', department: 'CAS',
    targetCollection: 'memberships', targetId: 'assignment', createdAt: new Timestamp('2026-10-12T17:30:00Z'),
    changes: { role: { before: 'Instructor', after: 'Program Head' }, department: { before: 'CITE', after: 'CAS' } },
  })
  assert.equal(log.action, 'Changed role and department')
  assert.equal(log.detail, 'Role: Instructor → Program Head\nDepartment: CITE → CAS')
  assert.deepEqual(JSON.parse(JSON.stringify(log.memberChanges)), [
    { field: 'role', label: 'Role', before: 'Instructor', after: 'Program Head' },
    { field: 'department', label: 'Department', before: 'CITE', after: 'CAS' },
  ])
  assert.equal(log.target, 'Cruz, Juan')
  assert.match(log.targetDetail, /juan@example.com/)
  assert.equal(log.sourcePath, 'memberships/assignment')
  assert.equal(log.sourceId, undefined, 'member sources must never open a reservation')
  assert.equal(log.date, 'Oct 13, 2026')
  assert.equal(log.time, '01:30 AM')
})

test('access removal and department unassignment use meaningful status labels', () => {
  const deactivated = entry('event', { action: 'account.deactivated', changes: { isActive: { before: true, after: false }, pendingInvitations: { before: 2, after: 0 } } })
  assert.equal(deactivated.detail, 'Account access: Active → Deactivated\nPending invitations: 2 → 0')
  assert.equal(deactivated.memberChanges[0].before, 'Active')
  assert.equal(deactivated.memberChanges[0].after, 'Deactivated')
  assert.equal(deactivated.memberChanges[1].after, '0')
  const removed = entry('event', { action: 'account.member_updated', changes: { department: { before: 'CITE', after: '' }, membershipStatus: { before: 'accepted', after: '' } } })
  assert.equal(removed.detail, 'Department: CITE → Unassigned\nDepartment assignment: Assigned → Unassigned')
})

test('pending invitation edits and cancellation distinguish re-invitations without depending on deleted documents', () => {
  const edited = entry('edit', { action: 'account.invitation_updated', isReactivation: true, changes: { role: { before: 'Instructor', after: 'Dean' } } })
  assert.equal(edited.action, 'Edited pending re-invitation')
  const cancelled = entry('cancel', { action: 'account.reinvitation_cancelled', memberEmail: 'old@example.com', changes: { invitationStatus: { before: 'Pending', after: 'Cancelled' } } })
  assert.equal(cancelled.action, 'Cancelled re-invitation')
  assert.equal(cancelled.target, 'old@example.com')
  assert.equal(cancelled.detail, 'Invitation: Pending → Cancelled')
  assert.equal(cancelled.date, 'Date unavailable')
})
