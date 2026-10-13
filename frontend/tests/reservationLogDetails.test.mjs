import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/pages/tabs/LogsPage.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('LogsPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['logText', 'logRecord', 'reservationDateLabel', 'reservationLogEntry'].includes(node.name?.text)).map(node => node.getText(ast)).join('\n')
let viewer
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'viewSource') viewer = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)

class Timestamp {
  constructor(value) { this.value = new Date(value) }
  toDate() { return this.value }
}

function harness(read) {
  const state = { log: null, source: null, error: '', loading: '' }
  const context = {
    module: {}, Timestamp, ROLE_CLASSES: { Admin: '' }, db: {}, sourceRequest: { current: 0 },
    doc: (_db, collection, id) => `${collection}/${id}`, getDoc: read,
    formatUserName: user => user?.fullName || '',
    setReservationLog: value => { state.log = value },
    setReservationSource: value => { state.source = value },
    setSourceError: value => { state.error = value },
    setLoadingSourceId: value => { state.loading = value },
    setScheduleLog() {}, setFacilityLog() {}, setMemberLog() {},
  }
  vm.runInNewContext(ts.transpileModule(`${helpers}\nmodule.exports = { entry: reservationLogEntry, view: ${viewer} }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
  const row = context.module.exports.entry('event', {
    targetId: 'reservation', actorName: 'Santos, Maria', actorRole: 'Admin',
    changes: { status: { before: 'Pending', after: 'Approved' } },
    department: 'CITE', reservationDate: '2026-10-15', createdAt: new Timestamp('2026-10-12T17:30:00Z'),
  })
  return { state, row, context, view: context.module.exports.view }
}

test('reservation details retain the historical actor, Philippine event time and exact status change', () => {
  const { row } = harness()
  assert.equal(row.actor, 'Santos, Maria')
  assert.equal(row.date, 'Oct 13, 2026')
  assert.equal(row.time, '01:30 AM')
  assert.deepEqual(JSON.parse(JSON.stringify(row.reservationSnapshot)), { date: '2026-10-15', department: 'CITE', beforeStatus: 'Pending', afterStatus: 'Approved' })
})

test('the current reservation is separate from the recorded event and preserves the request date', async () => {
  const createdAt = new Timestamp('2026-10-10T00:00:00Z')
  const state = harness(async path => ({ id: 'reservation', exists: () => true, data: () => path.startsWith('reservations/')
    ? { status: 'Completed', date: '2026-10-16', createdAt, roomId: 'room', userId: 'requester' }
    : path.startsWith('rooms/') ? { name: 'PTC 201', type: 'Laboratory' } : { fullName: 'Cruz, Juan' } }))
  await state.view(state.row)
  assert.equal(state.state.log.reservationSnapshot.afterStatus, 'Approved')
  assert.equal(state.state.log.reservationSnapshot.date, '2026-10-15')
  assert.equal(state.state.source.reservation.status, 'Completed')
  assert.equal(state.state.source.reservation.createdAt.toISOString(), '2026-10-10T00:00:00.000Z')
  assert.equal(state.state.source.roomName, 'PTC 201')
  assert.equal(state.state.loading, '')
})

test('deleted or unreadable source documents never prevent opening the audit event', async () => {
  for (const read of [async () => ({ exists: () => false }), async () => { throw new Error('permission denied') }]) {
    const state = harness(read)
    await state.view(state.row)
    assert.equal(state.state.log.id, 'event')
    assert.equal(state.state.log.reservationSnapshot.beforeStatus, 'Pending')
    assert.equal(state.state.source, null)
    assert.ok(state.state.error)
    assert.equal(state.state.loading, '')
  }
})

test('closing a log while its source is loading ignores the late result', async () => {
  let release
  const state = harness(() => new Promise(resolve => { release = resolve }))
  const loading = state.view(state.row)
  assert.equal(state.state.log.id, 'event', 'the event opens before its source finishes loading')
  ++state.context.sourceRequest.current
  state.state.log = null
  release({ id: 'reservation', exists: () => true, data: () => ({ status: 'Approved' }) })
  await loading
  assert.equal(state.state.log, null)
  assert.equal(state.state.source, null)
})
