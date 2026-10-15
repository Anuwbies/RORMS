import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'

const host = process.env.FIRESTORE_EMULATOR_HOST
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Use a loopback demo emulator for schedule rules tests.')
const project = 'demo-rorms-schedules'
const root = `projects/${project}/databases/(default)/documents`
const base = `http://${host}/v1/${root}`
let fixtureId = 0
const runId = Date.now().toString(36)
function value(data) {
  if (data === null) return { nullValue: 'NULL_VALUE' }
  if (data instanceof Date) return { timestampValue: data.toISOString() }
  if (Array.isArray(data)) return { arrayValue: { values: data.map(value) } }
  if (data && typeof data === 'object') return { mapValue: { fields: fields(data) } }
  if (typeof data === 'number') return { integerValue: String(data) }
  if (typeof data === 'boolean') return { booleanValue: data }
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
  return { update: { name: `${root}/${path}`, fields: fields(data) }, updateTransforms: transforms.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }
}
const commit = (writes, uid = 'editor') => request(':commit', 'POST', { writes }, uid)
async function fixture({ phase = 'Drafting', member = {} } = {}) {
  const id = ++fixtureId
  const departmentId = `schedule-department-${runId}-${id}`, academicYearId = `schedule-year-${runId}-${id}`, membershipId = `schedule-member-${runId}-${id}`
  const path = `departments/${departmentId}/workbooks/2026-2027/semesters/sem1`
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const before = { schemaVersion: 3, workbookId: `workbook_${createHash('sha256').update(departmentId).digest('hex')}`, departmentId, departmentCode: 'CITE', academicYearId,
    academicYear: '2026-2027', semester: 'sem1', fileName: 'Schedule.xlsx', sheetIds: [], sheetNames: [], selectedSheet: '', selectionJson: '{}',
    sheetSlots: [], sheetRevisionIds: [], cellCounts: [], revision: 1, revisionId: 'before', savedBy: 'editor', membershipId, createdAt, updatedAt: createdAt }
  await seed(`departments/${departmentId}`, { code: 'CITE' })
  await seed(`academicYears/${academicYearId}`, { academicYear: '2026-2027', sem1: { phase } })
  await seed(`memberships/${membershipId}`, { userId: 'editor', role: 'Dean', status: 'accepted', department: 'CITE', ...member })
  await seed(path, before)
  const manifest = { ...before, revision: 2, revisionId: 'after' }
  delete manifest.updatedAt
  const row = { id: `workbook_schedule_${runId}_${id}`, schemaVersion: 2, source: 'workbook', sourceWorkbook: path, sourceSheet: 'Schedule', sourceRow: 3,
    status: 'Draft', yearLevel: 1, subjectCode: 'ITE 101', departmentId, department: 'CITE', academicYearId, academicYear: '2026-2027',
    semesterKey: 'sem1', semester: '1st Semester', membershipId, savedBy: 'editor', workbookRevision: 2, workbookRevisionId: 'after' }
  return { path, manifest, row }
}
const localTest = (name, callback) => test(name, { skip: !host }, callback)

localTest('schedule Draft rows save to plural schedules atomically with their workbook revision', async () => {
  const f = await fixture()
  const result = await commit([write(f.path, f.manifest), write(`schedules/${f.row.id}`, f.row)])
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const saved = await request(`/schedules/${f.row.id}`, 'GET', undefined, 'editor')
  assert.equal(saved.body.fields.status.stringValue, 'Draft')
  assert.equal((await request(`/schedule/${f.row.id}`, 'GET')).status, 404)
})

localTest('schedule writes require a matching new workbook commit and preserve the previous workbook on failure', async () => {
  const f = await fixture()
  assert.equal((await commit([write(`schedules/${f.row.id}`, f.row)])).status, 403)
  const result = await commit([write(f.path, f.manifest), write(`schedules/${f.row.id}`, { ...f.row, workbookRevisionId: 'mismatched' })])
  assert.equal(result.status, 403)
  const saved = await request(`/${f.path}`, 'GET')
  assert.equal(saved.body.fields.revision.integerValue, '1')
})

localTest('deleting a schedule row requires a later workbook commit', async () => {
  const f = await fixture()
  assert.equal((await commit([write(f.path, f.manifest), write(`schedules/${f.row.id}`, f.row)])).status, 200)
  assert.equal((await request(`/schedules/${f.row.id}`, 'DELETE', undefined, 'editor')).status, 403)
  const result = await commit([write(f.path, { ...f.manifest, revision: 3, revisionId: 'removed' }), { delete: `${root}/schedules/${f.row.id}` }])
  assert.equal(result.status, 200, JSON.stringify(result.body))
})

localTest('schedule writes reject closed semesters and unauthorized memberships', async () => {
  for (const options of [{ phase: 'Closed' }, { member: { role: 'Instructor' } }, { member: { status: 'pending' } }, { member: { department: 'OTHER' } }]) {
    const f = await fixture(options)
    const result = await commit([write(f.path, f.manifest), write(`schedules/${f.row.id}`, f.row)])
    assert.equal(result.status, 403)
  }
})

function plotWrite(row, changes = {}) {
  const data = { meetings: [{ roomId: 'room1', room: 'PTC 201' }], roomId: 'room1', buildingId: 'ptc', roomIds: ['room1'],
    f2fRoom: { lec: ['PTC 201'], lab: [] }, status: 'Plot', registrarPlot: { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [] },
    validationIssues: [], plottedBy: 'registrar', plottedMembershipId: 'plot-actor', ...changes }
  return { update: { name: `${root}/schedules/${row.id}`, fields: fields(data) }, updateMask: { fieldPaths: Object.keys(data) },
    updateTransforms: ['updatedAt', 'plottedAt'].map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }
}

localTest('Registrar can plot and clear rooms in the new collection while subject and workbook data stay protected', async () => {
  const f = await fixture()
  const row = { ...f.row, meetings: [{ roomId: '', room: 'TBA' }] }
  assert.equal((await commit([write(f.path, f.manifest), write(`schedules/${row.id}`, row)])).status, 200)
  await seed('users/registrar', { isActive: true })
  await seed('memberships/plot-actor', { userId: 'registrar', status: 'accepted', role: 'Registrar' })
  let result = await commit([plotWrite(row)], 'registrar')
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const plotted = await request(`/schedules/${row.id}`, 'GET', undefined, 'registrar')
  assert.equal(plotted.body.fields.status.stringValue, 'Plot')
  assert.equal(plotted.body.fields.workbookRevision.integerValue, '2')
  assert.equal((await commit([plotWrite(row, { subjectCode: 'CHANGED' })], 'registrar')).status, 403)
  result = await commit([plotWrite(row, { meetings: [{ roomId: '', room: 'TBA' }], roomId: '', buildingId: '', roomIds: [],
    f2fRoom: { lec: [], lab: [] }, status: 'Draft' })], 'registrar')
  assert.equal(result.status, 200, JSON.stringify(result.body))
})

localTest('plotting rejects inactive profiles, non-Registrar roles, and closed semesters', async () => {
  const f = await fixture()
  const row = { ...f.row, meetings: [{ roomId: '', room: 'TBA' }] }
  assert.equal((await commit([write(f.path, f.manifest), write(`schedules/${row.id}`, row)])).status, 200)
  await seed('memberships/plot-actor', { userId: 'registrar', status: 'accepted', role: 'Registrar' })
  await seed('users/registrar', { isActive: false })
  assert.equal((await commit([plotWrite(row)], 'registrar')).status, 403)
  await seed('users/registrar', { isActive: true })
  await seed('memberships/plot-actor', { userId: 'registrar', status: 'accepted', role: 'Instructor' })
  assert.equal((await commit([plotWrite(row)], 'registrar')).status, 403)
  await seed('memberships/plot-actor', { userId: 'registrar', status: 'accepted', role: 'Registrar' })
  await seed(`academicYears/${row.academicYearId}`, { academicYear: '2026-2027', sem1: { phase: 'Closed' } })
  assert.equal((await commit([plotWrite(row)], 'registrar')).status, 403)
})

async function syncedFixture() {
  const f = await fixture()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  const manifest = { ...f.manifest, updatedAt: createdAt, sheetIds: ['sheet_0'], sheetNames: ['Schedule'], selectedSheet: 'Schedule',
    sheetSlots: ['a'], sheetRevisionIds: ['base1'], cellCounts: [0] }
  await seed(f.path, manifest)
  const parent = `sheets/${manifest.workbookId}_sheet_0`
  const identity = { schemaVersion: 3, workbookId: manifest.workbookId, sourceWorkbook: f.path, departmentId: f.row.departmentId,
    departmentCode: 'CITE', academicYearId: f.row.academicYearId, semester: 'sem1', sheetId: 'sheet_0', sheetIndex: 0 }
  await seed(parent, { ...identity, slots: { a: { revisionId: 'base1' } } })
  const rawValues = Array(21).fill('')
  rawValues[2] = 'ITE 101'
  const row = { ...f.row, rawValues, createdAt, updatedAt: createdAt, meetings: [{ roomId: '', room: 'TBA' }] }
  await seed(`schedules/${row.id}`, row)
  await seed('users/registrar', { isActive: true })
  await seed('memberships/plot-actor', { userId: 'registrar', role: 'Registrar', status: 'accepted' })
  return { ...f, manifest, parent, identity, row }
}

function syncedWrites(f, { cellId = 'T3', text = 'PTC 201', room = 'PTC 201', styleJson = null } = {}) {
  const rawValues = [...f.row.rawValues]
  rawValues[19] = room
  const workbook = { ...f.manifest, revision: f.manifest.revision + 1, revisionId: 'synced', cellCounts: [1],
    savedBy: 'registrar', membershipId: 'plot-actor', roomPlot: { version: 1, revisionId: 'synced', scheduleIds: [f.row.id] } }
  delete workbook.updatedAt
  return [write(f.path, workbook), plotWrite(f.row, { meetings: [{ roomId: 'room1', room }], rawValues, workbookRow: 3, workbookSheetId: 'sheet_0' }),
    { update: { name: `${root}/${f.parent}/cells/${cellId}`, fields: fields({ ...f.identity, baseRevisionId: 'base1',
      revision: f.manifest.revision + 1, revisionId: 'synced', text, styleJson, savedBy: 'registrar', membershipId: 'plot-actor', plotScheduleId: f.row.id }) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }]
}

localTest('Plot atomically updates schedules and workbook room-cell patches; later room changes reuse the patch', async () => {
  const f = await syncedFixture()
  let result = await commit(syncedWrites(f), 'registrar')
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const storedCell = await request(`/${f.parent}/cells/T3`, 'GET', undefined, 'registrar')
  assert.equal(storedCell.body.fields.text.stringValue, 'PTC 201')
  const storedRow = await request(`/schedules/${f.row.id}`, 'GET', undefined, 'registrar')
  assert.equal(storedRow.body.fields.rawValues.arrayValue.values[19].stringValue, 'PTC 201')
  assert.equal(storedRow.body.fields.status.stringValue, 'Plot')
  f.manifest.revision++
  f.row.rawValues[19] = 'PTC 201'
  result = await commit(syncedWrites(f, { text: 'PTC 202', room: 'PTC 202' }), 'registrar')
  assert.equal(result.status, 200, JSON.stringify(result.body))
  const manifest = await request(`/${f.path}`, 'GET', undefined, 'registrar')
  assert.equal(manifest.body.fields.cellCounts.arrayValue.values[0].integerValue, '1')
})

localTest('Plot room sync cannot modify subject cells, formatting, another row, or mismatched room text', async () => {
  for (const options of [{ cellId: 'C3' }, { cellId: 'T4' }, { text: 'Different from schedule' }, { styleJson: '{"color":"red"}' }]) {
    const f = await syncedFixture()
    const result = await commit(syncedWrites(f, options), 'registrar')
    assert.equal(result.status, 403, JSON.stringify(result.body))
    const manifest = await request(`/${f.path}`, 'GET')
    assert.equal(manifest.body.fields.revision.integerValue, '2')
  }
})

localTest('Plot workbook sync rejects stale revisions and live workbook-save leases', async () => {
  const f = await syncedFixture()
  await seed(`${f.path}/saveLocks/current`, { status: 'saving', saveId: 'another-save', savedBy: 'dean', membershipId: f.row.membershipId, createdAt: new Date() })
  assert.equal((await commit(syncedWrites(f), 'registrar')).status, 403)
})

localTest('nine rows with both Lec and Lab room patches fit the synchronization rules access budget', async () => {
  const f = await syncedFixture()
  const ids = Array.from({ length: 9 }, (_, index) => `${f.row.id}_${index}`)
  const writes = []
  for (let index = 0; index < ids.length; index++) {
    const row = { ...f.row, id: ids[index], sourceRow: index + 3 }
    await seed(`schedules/${row.id}`, row)
    const current = { ...f, row }
    const rowWrites = syncedWrites(current)
    rowWrites[1] = plotWrite(row, { rawValues: [...row.rawValues.slice(0, 19), 'PTC 201', 'PTC 202'], workbookRow: index + 3, workbookSheetId: 'sheet_0' })
    rowWrites[2].update.name = `${root}/${f.parent}/cells/T${index + 3}`
    writes.push(rowWrites[1], rowWrites[2])
    writes.push({ ...rowWrites[2], update: { name: `${root}/${f.parent}/cells/U${index + 3}`, fields: { ...rowWrites[2].update.fields, text: { stringValue: 'PTC 202' } } } })
  }
  const workbook = { ...f.manifest, revision: 3, revisionId: 'synced', cellCounts: [18], savedBy: 'registrar', membershipId: 'plot-actor',
    roomPlot: { version: 1, revisionId: 'synced', scheduleIds: ids } }
  delete workbook.updatedAt
  writes.unshift(write(f.path, workbook))
  const result = await commit(writes, 'registrar')
  assert.equal(result.status, 200, JSON.stringify(result.body))
})
