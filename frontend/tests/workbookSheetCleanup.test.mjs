import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const path = 'departments/department1/workbooks/2026-2027/semesters/sem1'
const workbookId = `workbook_${'a'.repeat(64)}`
const sheetPath = index => `sheets/${workbookId}_sheet_${index}`
const manifest = count => ({ schemaVersion: 3, workbookId, sheetIds: Array.from({ length: count }, (_, index) => `sheet_${index}`), revisionId: 'saved-revision', savedBy: 'dean1' })
const source = readFileSync(new URL('../src/services/workbookSheetCleanup.ts', import.meta.url), 'utf8')
const deadlineSource = readFileSync(new URL('../src/utils/withDeadline.ts', import.meta.url), 'utf8')
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText

function harness(count = 0) {
  const documents = new Map([[path, manifest(count)]])
  const commits = []
  const auth = { currentUser: { uid: 'dean1' } }
  let beforeTransaction = () => {}
  let transactionCount = 0
  let failCommit = 0
  const reference = path => ({ path, id: path.split('/').at(-1) })
  const snapshot = path => ({ ref: reference(path), id: path.split('/').at(-1), data: () => documents.get(path) })
  const firestore = {
    doc: (_db, ...parts) => reference(parts.join('/')),
    collection: (_db, ...parts) => parts.join('/'),
    where: (field, operator, value) => ({ field, operator, value }),
    limit: maximum => ({ maximum }),
    query: (path, ...clauses) => ({ path, clauses }),
    getDocsFromServer: async ({ path, clauses }) => {
      const filter = clauses.find(clause => clause.field)
      const maximum = clauses.find(clause => clause.maximum)?.maximum ?? Infinity
      return { docs: [...documents]
        .filter(([key, data]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')
          && (!filter || data[filter.field] === filter.value))
        .slice(0, maximum).map(([key]) => snapshot(key)) }
    },
    runTransaction: async (_db, callback) => {
      await beforeTransaction(++transactionCount)
      const deleted = []
      let writing = false
      const result = await callback({
        get: async ref => { assert.equal(writing, false, 'reads precede writes'); return snapshot(ref.path) },
        delete: ref => { writing = true; deleted.push(ref.path) },
      })
      if (transactionCount === failCommit) throw Object.assign(new Error('Simulated commit failure'), { code: 'permission-denied' })
      for (const key of deleted) documents.delete(key)
      commits.push(deleted)
      return result
    },
  }
  const deadline = { exports: {}, setTimeout, clearTimeout }
  vm.runInNewContext(compile(deadlineSource), deadline)
  const context = { exports: {}, Date, require: name => {
    if (name === '../firebase') return { auth, db: {} }
    if (name === '../utils/withDeadline') return deadline.exports
    if (name === 'firebase/firestore') return firestore
    throw new Error(`Unexpected import ${name}`)
  } }
  vm.runInNewContext(compile(source), context)
  return {
    documents, commits, auth,
    run: () => context.exports.cleanupUnusedWorkbookSheets({ path, workbookId, revisionId: 'saved-revision', userId: 'dean1', sheetIds: manifest(count).sheetIds }),
    before: callback => { beforeTransaction = callback },
    fail: number => { failCommit = number },
    addSheet: (index, chunks = 0, cells = 0, extra = {}) => {
      documents.set(sheetPath(index), { workbookId, sheetId: `sheet_${index}`, sheetIndex: index, ...extra })
      for (let part = 0; part < chunks; part++) documents.set(`${sheetPath(index)}/chunks/part_${part}`, { saved: true })
      for (let cell = 0; cell < cells; cell++) documents.set(`${sheetPath(index)}/cells/A${cell + 1}`, { saved: true })
    },
  }
}

test('empty save removes all sheet trees in bounded batches and retains metadata and unrelated data', async () => {
  const h = harness()
  h.addSheet(0, 9, 37)
  h.addSheet(1, 1, 1)
  h.documents.set('sheets/another_workbook_sheet_0', { workbookId: 'another_workbook' })
  h.documents.set('schedule/unrelated', { subjectCode: 'KEEP' })
  assert.equal(await h.run(), true)
  assert.deepEqual(h.documents.get(path), manifest(0))
  assert.equal(h.documents.size, 3)
  assert.ok(h.commits.every(batch => batch.length <= 20))
  assert.deepEqual(h.commits.at(-1), [sheetPath(1)], 'parent is deleted last')
})

test('partial deletion preserves active sheets and collects older orphans', async () => {
  const h = harness(1)
  h.addSheet(0, 1, 1)
  h.addSheet(1, 1, 1)
  h.addSheet(5, 1, 1)
  assert.equal(await h.run(), true)
  assert.ok(h.documents.has(`${sheetPath(0)}/chunks/part_0`))
  assert.ok(h.documents.has(`${sheetPath(0)}/cells/A1`))
  assert.equal(h.documents.size, 4)
})

test('cleanup is idempotent and a later Save resumes a failed batch', async () => {
  const h = harness()
  h.addSheet(0, 9, 37)
  h.fail(2)
  await assert.rejects(h.run(), /Simulated commit failure/)
  assert.ok(h.documents.has(sheetPath(0)))
  h.fail(0)
  assert.equal(await h.run(), true)
  assert.equal(h.documents.size, 1)
  assert.equal(await h.run(), true)
})

test('a newer manifest stops deletion even if the sheet is still unreferenced', async () => {
  const h = harness()
  h.addSheet(0, 1, 1)
  h.before(() => h.documents.set(path, { ...manifest(0), revisionId: 'newer' }))
  assert.equal(await h.run(), false)
  assert.equal(h.documents.size, 4)
})

test('every batch rechecks references when a sheet becomes active during cleanup', async () => {
  const h = harness()
  h.addSheet(0, 9, 37)
  h.before(batch => {
    if (batch === 2) {
      h.documents.set(path, manifest(1))
      h.documents.set(`${sheetPath(0)}/chunks/part_0`, { saved: 'new generation' })
    }
  })
  assert.equal(await h.run(), true)
  assert.ok(h.documents.has(sheetPath(0)))
  assert.deepEqual(h.documents.get(`${sheetPath(0)}/chunks/part_0`), { saved: 'new generation' })
  assert.ok(h.documents.has(`${sheetPath(0)}/chunks/part_8`))
})

test('staged saves defer cleanup until their lease is released', async () => {
  const h = harness()
  h.addSheet(0, 1, 1)
  h.documents.set(`${path}/saveLocks/current`, { status: 'saving', createdAt: { toMillis: () => Date.now() } })
  assert.equal(await h.run(), false)
  assert.ok(h.documents.has(`${sheetPath(0)}/chunks/part_0`))
  h.documents.set(`${path}/saveLocks/current`, { status: 'idle' })
  assert.equal(await h.run(), true)
  assert.equal(h.documents.size, 2)
})

test('a staged save between batches protects newly staged content', async () => {
  const h = harness()
  h.addSheet(0, 9, 37)
  h.before(batch => {
    if (batch === 2) {
      h.documents.set(`${path}/saveLocks/current`, { status: 'saving', createdAt: { toMillis: () => Date.now() } })
      h.documents.set(`${sheetPath(0)}/chunks/part_0`, { saved: 'staged generation' })
    }
  })
  assert.equal(await h.run(), false)
  assert.deepEqual(h.documents.get(`${sheetPath(0)}/chunks/part_0`), { saved: 'staged generation' })
  assert.ok(h.documents.has(sheetPath(0)))
})

test('expired leases allow cleanup, while malformed leases defer it', async () => {
  for (const [createdAt, complete] of [[{ toMillis: () => Date.now() - 11 * 60 * 1000 }, true], [undefined, false]]) {
    const h = harness()
    h.addSheet(0, 1, 1)
    h.documents.set(`${path}/saveLocks/current`, { status: 'saving', createdAt })
    assert.equal(await h.run(), complete)
  }
})

test('missing or invalid manifests and malformed sheet identity never authorize cleanup', async () => {
  for (const data of [undefined, { schemaVersion: 1 }, { ...manifest(0), sheetIds: null }, { ...manifest(0), workbookId: 'invalid' }]) {
    const h = harness()
    h.addSheet(0, 1, 1)
    if (data) h.documents.set(path, data)
    else h.documents.delete(path)
    assert.equal(await h.run(), false)
    assert.ok(h.documents.has(sheetPath(0)))
  }
  const h = harness()
  h.addSheet(0, 1, 1, { sheetIndex: 1 })
  assert.equal(await h.run(), false)
  assert.ok(h.documents.has(sheetPath(0)))
})

test('account changes stop further deletion', async () => {
  const h = harness()
  h.addSheet(0, 1, 1)
  h.before(() => { h.auth.currentUser = { uid: 'someone-else' } })
  await assert.rejects(h.run(), /account changed/)
  assert.ok(h.documents.has(sheetPath(0)))
})

test('another saver cannot continue cleanup under the previous account', async () => {
  const h = harness()
  h.addSheet(0, 1, 1)
  h.before(() => h.documents.set(path, { ...manifest(0), savedBy: 'someone-else' }))
  assert.equal(await h.run(), false)
  assert.ok(h.documents.has(sheetPath(0)))
})
