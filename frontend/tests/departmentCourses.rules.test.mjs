import assert from 'node:assert/strict'
import { test } from 'node:test'

const host = process.env.FIRESTORE_EMULATOR_HOST
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Use a loopback demo emulator for course rules tests.')
const project = 'demo-rorms-courses'
const root = `projects/${project}/databases/(default)/documents`
const base = `http://${host}/v1/${root}`
let fixtureId = 0
function value(data) {
  if (data instanceof Date) return { timestampValue: data.toISOString() }
  if (typeof data === 'number') return { integerValue: String(data) }
  return { stringValue: data }
}
const fields = data => Object.fromEntries(Object.entries(data).map(([key, item]) => [key, value(item)]))
function token(uid) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, user_id: uid, iat: now, exp: now + 3600, firebase: { sign_in_provider: 'custom' } })}.`
}
async function request(path, method, data, uid = 'owner') {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${uid === 'owner' ? 'owner' : token(uid)}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined })
  return { status: response.status, body: await response.json() }
}
async function seed(path, data) {
  const result = await request(`/${path}`, 'PATCH', { fields: fields(data) })
  assert.equal(result.status, 200, JSON.stringify(result.body))
}
function write(path, data) {
  const transforms = ['updatedAt', ...('createdAt' in data ? [] : ['createdAt'])]
  return { update: { name: `${root}/${path}`, fields: fields(data) },
    updateTransforms: transforms.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }
}
const commit = (writes, uid = 'editor') => request(':commit', 'POST', { writes }, uid)
async function fixture(member = {}) {
  const departmentId = `courses-rules-${++fixtureId}`
  const membershipId = `courses-member-${fixtureId}`
  const path = `departments/${departmentId}/courseWorkbooks/current`
  await seed(`departments/${departmentId}`, { code: 'CITE' })
  await seed(`memberships/${membershipId}`, { userId: 'editor', role: 'Dean', status: 'accepted', department: 'CITE', ...member })
  const manifest = { schemaVersion: 1, encoding: 'gzip-base64', data: 'AAAA', jsonByteLength: 1,
    departmentId, departmentCode: 'CITE', membershipId, savedBy: 'editor', fileName: 'Courses.xlsx',
    revision: 1, generation: `courses-generation-${fixtureId}`, courseCount: 1 }
  const row = { departmentId, departmentCode: 'CITE', sourceWorkbook: path, membershipId, savedBy: 'editor',
    generation: manifest.generation, revision: 1, sheetName: 'Courses', rowNumber: 2,
    session: '1', semester: '1st', code: 'ITE 101', course: 'Computing', type: 'Lecture', credits: '3.00' }
  return { path, manifest, row }
}
const localTest = (name, callback) => test(name, { skip: !host }, callback)

localTest('accepted department editors and Admins can create courses workbooks and rows', async () => {
  for (const role of ['Dean', 'Program Head', 'Admin']) {
    const f = await fixture({ role, department: role === 'Admin' ? 'OTHER' : 'CITE' })
    assert.equal((await commit([write(`courses/${f.row.generation}_0`, f.row)])).status, 200)
    const result = await commit([write(f.path, f.manifest)])
    assert.equal(result.status, 200, JSON.stringify(result.body))
  }
})

localTest('instructors, inactive memberships, other users, and wrong departments cannot save', async () => {
  for (const member of [{ role: 'Instructor' }, { status: 'pending' }, { userId: 'someone-else' }, { department: 'OTHER' }]) {
    const f = await fixture(member)
    assert.equal((await commit([write(f.path, f.manifest)])).status, 403)
    assert.equal((await commit([write(`courses/${f.row.generation}_0`, f.row)])).status, 403)
  }
})

localTest('course staging batches stay within access budgets and active rows cannot be changed or deleted', async () => {
  const f = await fixture()
  const staged = Array.from({ length: 100 }, (_, index) => write(`courses/${f.row.generation}_${index}`, { ...f.row, rowNumber: index + 2 }))
  let result = await commit(staged)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  result = await commit([write(f.path, { ...f.manifest, courseCount: 100 })])
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal((await request(`/courses/${f.row.generation}_0`, 'DELETE', undefined, 'editor')).status, 403)
  assert.equal((await commit([write(`courses/${f.row.generation}_0`, { ...f.row, code: 'MODIFIED' })])).status, 403)
})

localTest('new revisions allow previous row cleanup, reject stale saves, and allow clearing all courses', async () => {
  const f = await fixture()
  assert.equal((await commit([write(`courses/${f.row.generation}_0`, f.row), write(f.path, f.manifest)])).status, 200)
  const loaded = await request(`/${f.path}`, 'GET')
  const createdAt = new Date(loaded.body.fields.createdAt.timestampValue)
  const next = { ...f.manifest, revision: 2, generation: `${f.manifest.generation}-next`, courseCount: 0, createdAt }
  let result = await commit([write(f.path, next)])
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal((await request(`/courses/${f.row.generation}_0`, 'DELETE', undefined, 'editor')).status, 200)
  result = await commit([write(f.path, { ...next, generation: `${next.generation}-stale` })])
  assert.equal(result.status, 403)
})

localTest('current saver can clean up a previous editor’s rows but cannot remove the workbook', async () => {
  const f = await fixture()
  assert.equal((await commit([write(`courses/${f.row.generation}_0`, f.row), write(f.path, f.manifest)])).status, 200)
  const loaded = await request(`/${f.path}`, 'GET')
  const memberId = `${f.row.membershipId}-other`
  await seed(`memberships/${memberId}`, { userId: 'other-editor', role: 'Program Head', status: 'accepted', department: 'CITE' })
  const result = await commit([write(f.path, { ...f.manifest, revision: 2, generation: `${f.manifest.generation}-other`, courseCount: 0,
    createdAt: new Date(loaded.body.fields.createdAt.timestampValue), membershipId: memberId, savedBy: 'other-editor' })], 'other-editor')
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal((await request(`/courses/${f.row.generation}_0`, 'DELETE', undefined, 'other-editor')).status, 200)
  assert.equal((await request(`/${f.path}`, 'DELETE', undefined, 'other-editor')).status, 403)
})
