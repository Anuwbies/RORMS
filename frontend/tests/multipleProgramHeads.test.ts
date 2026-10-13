import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the pages' actual handlers with in-memory Firestore/callable substitutes.
// Invitation tests never contact Firebase or send email.
function compileHandler(page: string, name: string) {
  const source = readFileSync(new URL(`../src/pages/tabs/${page}.tsx`, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression: ts.Expression | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) expression = node.initializer
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert(expression, `Missing ${page}.${name}`)
  return ts.transpileModule(`module.exports = ${expression.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText
}

const existingHead = { id: 'head', membershipId: 'head-membership', name: 'Existing Head', email: 'head@example.com', role: 'Program Head', department: 'CITE', status: 'Active' }
const target = { id: 'target', membershipId: 'target-membership', name: 'New Head', email: 'new@example.com', role: 'Instructor', department: 'CITE', status: 'Active' }
const department = { id: 'cite', code: 'CITE', dean: 'dean', programHead: existingHead.id }
const event = { preventDefault() {} }

function harness(page: string, handler: string, overrides: Record<string, unknown> = {}) {
  const writes: Array<{ path: string, data: Record<string, unknown> }> = []
  const notifications: Array<{ message: string, kind: string }> = []
  const actions: Array<Record<string, unknown>> = []
  let commits = 0
  const record = (path: string, data: Record<string, unknown>) => { writes.push({ path, data }) }
  const context: Record<string, unknown> = {
    module: { exports: undefined }, db: {},
    members: [existingHead, target], departments: [department], departmentInfo: department,
    editingMember: target, editRole: 'Program Head', editDept: 'CITE',
    areMemberActionsDisabled: false, memberToRemove: existingHead, memberToReinvite: { ...existingHead, status: 'Deactivated' },
    rawMemberships: [], users: [existingHead, target],
    currentUserMembership: { id: existingHead.membershipId }, currentUserRole: 'Program Head',
    currentUserData: { fullName: existingHead.name },
    inviteRole: 'Program Head', inviteDepartment: 'CITE', inviteEmail: 'first@example.com; second@example.com',
    auth: { currentUser: { uid: 'admin' } }, window: { location: { origin: 'https://example.com' } },
    collection: (_db: unknown, name: string) => name,
    doc: (_db: unknown, collection?: string, id?: string) => collection ? `${collection}/${id}` : { id: `token-${actions.length}` },
    manageMember: async (action: Record<string, unknown>) => { actions.push(action); return { outcome: 'changed', logId: 'log' } },
    memberActionError: (_error: unknown, fallback: string) => fallback,
    where: (...args: unknown[]) => args, query: (...args: unknown[]) => args,
    getDocs: async () => ({ empty: true, docs: [] }),
    addDoc: async (collection: string, data: Record<string, unknown>) => {
      const id = `new-${writes.length}`
      record(`${collection}/${id}`, data)
      return { id }
    },
    updateDoc: async (path: string, data: Record<string, unknown>) => record(path, data),
    writeBatch: () => ({ update: record, set: record, commit: async () => { commits++ } }),
    serverTimestamp: () => 'server-time', Timestamp: { fromDate: (date: Date) => date },
    userNameFields: (member: typeof target) => ({ fullName: member.name }),
    formatUserName: (user: { fullName: string }) => user.fullName,
    buildInvitationEmail: () => 'mock invitation',
    showNotification: (message: string, kind: string) => notifications.push({ message, kind }),
    console: { error: (error: unknown) => { throw new Error(String(error)) } },
  }
  for (const setter of ['setIsSavingEdit', 'setEditingMember', 'setEditError', 'setIsInviting', 'setHasEmailError', 'setIsInviteModalOpen', 'setInviteEmail', 'setInviteRole', 'setInviteDepartment', 'setIsAcceptingInvite', 'setIsDecliningInvite', 'setIsRemoving', 'setRemoveError', 'setIsRemoveModalOpen', 'setMemberToRemove', 'setIsRemovingMember', 'setRemoveConfirmText', 'setIsReinvitingMember', 'setMemberToReinvite']) context[setter] = () => {}
  Object.assign(context, overrides)
  vm.runInNewContext(compileHandler(page, handler), context)
  const run = (context.module as { exports: (formEvent: typeof event) => Promise<void> }).exports
  return { run: () => run(event), writes, actions, notifications, commits: () => commits }
}

test('Members can invite multiple Program Heads to a department with an existing head', async () => {
  const state = harness('MembersPage', 'handleInvite')
  await state.run()
  assert.equal(state.actions.length, 2)
  assert.deepEqual(state.actions.map(action => action.email), ['first@example.com', 'second@example.com'])
  assert(state.actions.every(action => action.action === 'invite' && action.role === 'Program Head' && action.department === 'CITE'))
  assert.equal(state.writes.length, 0)
  assert.equal(state.notifications.at(-1)?.kind, 'success')
})

for (const member of [target, { ...target, status: 'Pending' }]) test(`Members can assign another Program Head to a membership with ${member.status} status`, async () => {
  const state = harness('MembersPage', 'handleEditSubmit', { editingMember: member })
  await state.run()
  assert.equal(state.actions.length, 1)
  assert.equal(state.actions[0].action, 'edit')
  assert.equal(state.actions[0].membershipId, 'target-membership')
  assert.equal(state.actions[0].role, 'Program Head')
  assert.equal(state.actions[0].targetType, member.status === 'Pending' ? 'invitation' : 'user')
  assert.equal(state.writes.length, 0)
  assert.equal(state.notifications.at(-1)?.kind, 'success')
})

for (const [editRole, editDept] of [['Instructor', 'CITE'], ['Program Head', 'CAS']]) test(`Members can change a head to ${editRole} in ${editDept} without modifying other assignments`, async () => {
  const state = harness('MembersPage', 'handleEditSubmit', { editingMember: existingHead, editRole, editDept })
  await state.run()
  assert.equal(state.actions.length, 1)
  assert.equal(state.actions[0].membershipId, 'head-membership')
  assert.equal(state.actions[0].department, editDept)
  assert.equal(state.writes.length, 0)
})

for (const editRole of ['Program Head', 'Instructor']) test(`My Department changes only the selected membership when assigning ${editRole}`, async () => {
  const state = harness('MyDepartmentPage', 'handleEditSubmit', { editingMember: editRole === 'Instructor' ? existingHead : target, editRole })
  await state.run()
  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].path, editRole === 'Instructor' ? 'memberships/head-membership' : 'memberships/target-membership')
  assert.equal(state.writes[0].data.role, editRole)
})

for (const [handler, field, value] of [
  ['handleAcceptInvitation', 'status', 'accepted'],
  ['handleDeclineInvitation', 'status', 'declined'],
  ['confirmRemoveMember', 'department', ''],
]) test(`My Department ${handler} leaves other heads and department metadata unchanged`, async () => {
  const state = harness('MyDepartmentPage', handler)
  await state.run()
  assert.equal(state.writes.length, 1)
  assert.equal(state.writes[0].path, 'memberships/head-membership')
  assert.equal(state.writes[0].data[field], value)
})

test('Members still prevents assigning a second Dean', async () => {
  const state = harness('MembersPage', 'handleEditSubmit', { editRole: 'Dean', members: [{ ...existingHead, role: 'Dean' }, target] })
  await state.run()
  assert.equal(state.writes.length, 0)
  assert.equal(state.actions.length, 0)
  assert.equal(state.commits(), 0)
  assert.match(state.notifications[0].message, /Dean already exists/)
})

for (const inviteEmail of ['first@example.com; second@example.com', 'first@example.com']) test(`Members still prevents conflicting Dean invitations for ${inviteEmail}`, async () => {
  const state = harness('MembersPage', 'handleInvite', { inviteRole: 'Dean', inviteEmail, members: [{ ...existingHead, role: 'Dean' }] })
  await state.run()
  assert.equal(state.writes.length, 0)
  assert.equal(state.actions.length, 0)
  assert.equal(state.notifications[0].kind, 'error')
})

test('Program Heads still cannot edit department members', async () => {
  const state = harness('MyDepartmentPage', 'handleEditSubmit', { areMemberActionsDisabled: true })
  await state.run()
  assert.equal(state.writes.length, 0)
})

for (const status of ['Active', 'Pending']) test(`Members sends ${status === 'Pending' ? 'invitation cancellation' : 'deactivation'} through the audited callable`, async () => {
  const state = harness('MembersPage', 'handleRemoveSubmit', { memberToRemove: { ...existingHead, status } })
  await state.run()
  assert.equal(state.actions.length, 1)
  assert.equal(state.actions[0].action, status === 'Pending' ? 'cancel_invitation' : 'deactivate')
  assert.equal(state.actions[0].targetId, existingHead.id)
  assert.equal(state.writes.length, 0)
})

test('Members re-invitation uses the audited callable and retains the selected assignment', async () => {
  const state = harness('MembersPage', 'handleReinviteSubmit')
  await state.run()
  assert.equal(state.actions.length, 1)
  assert.equal(state.actions[0].action, 'reinvite')
  assert.equal(state.actions[0].targetId, existingHead.id)
  assert.equal(state.actions[0].membershipId, existingHead.membershipId)
  assert.equal(state.notifications.at(-1)?.kind, 'success')
  assert.equal(state.writes.length, 0)
})
