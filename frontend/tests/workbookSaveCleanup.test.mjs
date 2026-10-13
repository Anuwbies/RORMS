import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import * as workbookAudit from '../src/utils/workbookAudit.ts'

const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const term = { departmentId: 'department1', departmentCode: 'CITE', academicYearId: 'year1', academicYear: '2026-2027', semester: 'sem1', membershipId: 'member1' }
const path = 'departments/department1/workbooks/2026-2027/semesters/sem1'

function harness({ failCommit = false, cleanup = async () => true } = {}) {
  const events = [], stages = [], warnings = []
  const documents = new Map([
    ['academicYears/year1', { sem1: { phase: 'Drafting' } }],
    ['memberships/member1', { userId: 'dean1', role: 'Dean', department: 'CITE', status: 'accepted' }],
  ])
  const firestore = {
    doc: (_db, ...parts) => parts.join('/'),
    serverTimestamp: () => 'server-time',
    runTransaction: async (_db, callback) => {
      const writes = []
      await callback({
        get: async key => ({ exists: () => documents.has(key), data: () => documents.get(key) }),
        set: (key, value) => writes.push([key, value]),
      })
      if (failCommit) throw new Error('Commit failed')
      for (const [key, value] of writes) documents.set(key, value)
      events.push('commit')
    },
  }
  function localModule(source) {
    const context = { exports: {}, setTimeout, clearTimeout }
    vm.runInNewContext(compile(source), context)
    return context.exports
  }
  const modules = {
    'firebase/firestore': firestore,
    '../firebase': { db: {}, auth: { currentUser: { uid: 'dean1' } } },
    '../utils/departmentWorkbookPaths': localModule(read('../src/utils/departmentWorkbookPaths.ts')),
    '../utils/departmentWorkbookPermissions': localModule(read('../src/utils/departmentWorkbookPermissions.ts')),
    '../utils/withDeadline': localModule(read('../src/utils/withDeadline.ts')),
    '../utils/firestoreWorkbookState': {},
    '../utils/workbookAudit': workbookAudit,
    '../utils/firestoreWorkbookSnapshots': { prepareSnapshotSheets: async () => ({ sheets: [], manifest: { sheetIds: [], sheetNames: [], selectedSheet: '', selectionJson: '{}' } }) },
    './workbookScheduleWrites': {},
    './firestoreWorkbookCache': {
      firestoreManifestCacheKey: data => data.revisionId,
      writeFirestoreWorkbookCache: async () => {},
    },
    './workbookSheetCleanup': { cleanupUnusedWorkbookSheets: async scope => {
      assert.equal(documents.get(path)?.revisionId, scope.revisionId, 'cleanup must follow a committed manifest')
      assert.equal(documents.get(path).sheetIds.length, 0)
      events.push('cleanup')
      return cleanup(scope)
    } },
  }
  const context = { exports: {}, crypto: webcrypto, TextEncoder, performance, console: { warn: (...args) => warnings.push(args) }, require: name => {
    if (!Object.hasOwn(modules, name)) throw new Error(`Unexpected import ${name}`)
    return modules[name]
  } }
  vm.runInNewContext(compile(read('../src/services/firestoreDepartmentWorkbooks.ts')), context)
  return { events, stages, warnings, documents, save: () => context.exports.saveFirestoreDepartmentWorkbook(term, 'Schedule.xlsx', 'empty-workbook', null, { onProgress: progress => stages.push(progress.stage) }) }
}

test('workbook save commits before cleaning unused sheets', async () => {
  const h = harness()
  const saved = await h.save()
  assert.deepEqual(h.events, ['commit', 'cleanup'])
  assert.equal(saved.revision, 1)
  assert.equal(saved.cleanupWarning, undefined)
  assert.equal(h.documents.get(path).audit.revisionId, saved.revisionId)
  assert.equal(h.documents.get(path).audit.previousRevision, 0)
  assert.equal(h.documents.get(path).audit.kind, 'created')
  assert.equal(h.stages.at(-1), 'cleaning')
})

test('a failed manifest save never cleans sheet data', async () => {
  const h = harness({ failCommit: true })
  await assert.rejects(h.save(), /Commit failed/)
  assert.deepEqual(h.events, [])
  assert.equal(h.documents.has(path), false)
})

test('cleanup failure preserves successful revision and reports rule deployment guidance', async () => {
  const h = harness({ cleanup: async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }) } })
  const saved = await h.save()
  assert.equal(saved.revision, 1)
  assert.equal(h.documents.get(path).revisionId, saved.revisionId)
  assert.match(saved.cleanupWarning, /Workbook saved.*Deploy the updated Firestore rules/)
  assert.equal(h.warnings.length, 1)
})

test('deferred cleanup preserves successful revision and allows a later retry', async () => {
  const h = harness({ cleanup: async () => false })
  const saved = await h.save()
  assert.equal(saved.revision, 1)
  assert.match(saved.cleanupWarning, /Workbook saved.*save again to retry/)
})
