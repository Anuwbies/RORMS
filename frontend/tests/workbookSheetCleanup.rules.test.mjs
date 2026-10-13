import assert from 'node:assert/strict'
import { test } from 'node:test'

// Run against a local demo emulator only; never access the production project.
const host = process.env.FIRESTORE_EMULATOR_HOST
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Use a loopback Firestore emulator for cleanup rule tests.')
const project = 'demo-rorms-cleanup'
const root = `projects/${project}/databases/(default)/documents`
const base = `http://${host}/v1/${root}`
const workbookId = `workbook_${'a'.repeat(64)}`
let fixtureId = 0

function value(data) {
  if (data instanceof Date) return { timestampValue: data.toISOString() }
  if (Array.isArray(data)) return { arrayValue: { values: data.map(value) } }
  if (data && typeof data === 'object') return { mapValue: { fields: fields(data) } }
  if (typeof data === 'number') return { integerValue: String(data) }
  if (typeof data === 'boolean') return { booleanValue: data }
  return { stringValue: data }
}
function fields(data) { return Object.fromEntries(Object.entries(data).map(([key, data]) => [key, value(data)])) }
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
async function fixture({ active = false, phase = 'Drafting', member = {}, lease, savedBy = 'dean1' } = {}) {
  const departmentId = `cleanup${++fixtureId}`
  const yearId = `year${fixtureId}`
  const membershipId = `member${fixtureId}`
  const path = `departments/${departmentId}/workbooks/2026-2027/semesters/sem1`
  const sheet = `sheets/${workbookId}_sheet_0`
  const identity = { schemaVersion: 3, workbookId, sourceWorkbook: path, departmentId, departmentCode: 'CITE', academicYearId: yearId, semester: 'sem1', sheetId: 'sheet_0', sheetIndex: 0 }
  const manifest = { schemaVersion: 3, workbookId, departmentId, departmentCode: 'CITE', academicYearId: yearId, academicYear: '2026-2027', semester: 'sem1', fileName: 'Schedule.xlsx',
    sheetIds: active ? ['sheet_0'] : [], sheetNames: active ? ['First'] : [], selectedSheet: active ? 'First' : '', selectionJson: '{}',
    sheetSlots: active ? ['a'] : [], sheetRevisionIds: active ? ['saved'] : [], cellCounts: active ? [0] : [],
    revision: 2, revisionId: 'saved', membershipId, savedBy, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') }
  await seed(`departments/${departmentId}`, { code: 'CITE' })
  await seed(`academicYears/${yearId}`, { academicYear: '2026-2027', sem1: { phase } })
  await seed(`memberships/${membershipId}`, { userId: savedBy, role: 'Dean', status: 'accepted', department: 'CITE', ...member })
  await seed(path, manifest)
  // Each fixture overwrites the dedicated demo sheet and its sample children.
  await seed(sheet, identity)
  await seed(`${sheet}/chunks/part_0`, { ...identity, partIndex: 0 })
  await seed(`${sheet}/cells/A1`, identity)
  if (lease) await seed(`${path}/saveLocks/current`, lease)
  return { path, sheet, identity, manifest }
}
const localTest = (name, callback) => test(name, { skip: !host }, callback)
const remove = (path, uid = 'dean1') => request(`/${path}`, 'DELETE', undefined, uid)

localTest('latest authorized saver can delete unreferenced parents and children', async () => {
  const f = await fixture()
  for (const path of [`${f.sheet}/chunks/part_0`, `${f.sheet}/cells/A1`, f.sheet]) {
    const result = await remove(path)
    assert.equal(result.status, 200, JSON.stringify(result.body))
  }
  assert.equal((await request(`/${f.path}`, 'GET')).status, 200)
})

localTest('active sheets, chunks and cells cannot be deleted', async () => {
  const f = await fixture({ active: true })
  for (const path of [f.sheet, `${f.sheet}/chunks/part_0`, `${f.sheet}/cells/A1`]) assert.equal((await remove(path)).status, 403)
})

localTest('cleanup rejects another user, instructors, wrong departments and inactive memberships', async () => {
  const own = await fixture()
  assert.equal((await remove(own.sheet, 'someone-else')).status, 403)
  for (const member of [{ role: 'Instructor' }, { department: 'OTHER' }, { status: 'declined' }]) {
    const f = await fixture({ member })
    assert.equal((await remove(f.sheet)).status, 403)
  }
})

localTest('closed terms and fresh staging leases prevent deletion', async () => {
  const closed = await fixture({ phase: 'Closed' })
  assert.equal((await remove(closed.sheet)).status, 403)
  const staged = await fixture({ lease: { status: 'saving', createdAt: new Date() } })
  assert.equal((await remove(`${staged.sheet}/chunks/part_0`)).status, 403)
  assert.equal((await remove(staged.sheet)).status, 403)
})

localTest('expired staging leases allow deletion', async () => {
  const f = await fixture({ lease: { status: 'saving', createdAt: new Date(Date.now() - 11 * 60 * 1000) } })
  const result = await remove(f.sheet)
  assert.equal(result.status, 200, JSON.stringify(result.body))
})

localTest('bounded child batches stay within the rules document-access budget', async () => {
  const f = await fixture()
  const children = []
  for (let index = 0; index < 4; index++) {
    const path = `${f.sheet}/chunks/part_${index}`
    await seed(path, { ...f.identity, partIndex: index })
    children.push(path)
  }
  for (let index = 1; index <= 16; index++) {
    const path = `${f.sheet}/cells/A${index}`
    await seed(path, f.identity)
    children.push(path)
  }
  const result = await request(':commit', 'POST', { writes: children.map(path => ({ delete: `${root}/${path}` })) }, 'dean1')
  assert.equal(result.status, 200, JSON.stringify(result.body))
})

localTest('clearing references and deleting a sheet in one commit is denied', async () => {
  const f = await fixture({ active: true })
  const updated = { ...f.manifest, revision: 3, revisionId: 'next', sheetIds: [], sheetNames: [], selectedSheet: '', sheetSlots: [], sheetRevisionIds: [], cellCounts: [] }
  delete updated.updatedAt
  const result = await request(':commit', 'POST', { writes: [
    { update: { name: `${root}/${f.path}`, fields: fields(updated) }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
    { delete: `${root}/${f.sheet}` },
  ] }, 'dean1')
  assert.equal(result.status, 403, JSON.stringify(result.body))
})

localTest('workbook metadata and malformed sheet identities remain protected', async () => {
  const f = await fixture()
  assert.equal((await remove(f.path)).status, 403)
  await seed(f.sheet, { ...f.identity, sheetIndex: 1 })
  assert.equal((await remove(f.sheet)).status, 403)
})
