import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import { IDBFactory } from 'fake-indexeddb'
import * as snapshots from '../src/utils/firestoreWorkbookSnapshots.ts'
import * as state from '../src/utils/firestoreWorkbookState.ts'
import { deserializeWorkbookState } from '../src/utils/excelWorkbookState.ts'
import * as paths from '../src/utils/departmentWorkbookPaths.ts'
import * as permissions from '../src/utils/departmentWorkbookPermissions.ts'
import * as workbookAudit from '../src/utils/workbookAudit.ts'

const sources = Object.fromEntries(['departmentWorkbookCache', 'firestoreWorkbookCache', 'firestoreDepartmentWorkbooks'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText]))
const deadlineSource = ts.transpileModule(readFileSync(new URL('../src/utils/withDeadline.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const term = { departmentId: 'department1', departmentCode: 'CITE', academicYearId: 'year1', academicYear: '2026-2027', semester: 'sem1', membershipId: 'member1' }
const path = paths.workbookTermPaths(term).document

function fixture(empty = false) {
  const names = empty ? [] : ['First', 'Hidden']
  return {
    workbook: { SheetNames: names, Sheets: empty ? {} : { First: { '!ref': 'A1:B2', A1: { t: 's', v: 'Original' }, B1: { t: 'n', v: 3, f: '1+2' } }, Hidden: { '!ref': 'A1', A1: { t: 's', v: 'Hidden subject' } } },
      Workbook: { Sheets: names.map(name => ({ name, ...(name === 'Hidden' ? { Hidden: 1 } : {}) })) } },
    previewStyles: null, sheetColors: new Map([['Hidden', '#f59e0b']]), addedRowsBySheet: new Map(),
    rowHeightOverrides: new Map([['First', new Map([[1, 40]])]]), columnWidthOverrides: new Map([['First', new Map([[1, 200]])]]),
    cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(),
    formattingOverrides: new Map(names.map(name => [name, { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] }])),
    scheduleSetups: new Map(), hiddenRangeToggles: new Map(), selectedSheet: names[0] ?? '', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}

async function harness(indexedDB = new IDBFactory()) {
  const documents = new Map([
    ['academicYears/year1', { academicYear: '2026-2027', sem1: { phase: 'Drafting' } }],
    ['memberships/member1', { userId: 'dean1', role: 'Dean', department: 'CITE', status: 'accepted' }],
  ])
  const workbookId = `workbook_${await snapshots.hashSnapshot(paths.workbookTermPaths(term).legacyDocument)}`
  const prepared = await snapshots.prepareSnapshotSheets(state.serializeFirestoreWorkbookState(fixture()))
  const manifest = { ...prepared.manifest, schemaVersion: 3, workbookId, fileName: 'Schedule.xlsx', revision: 1, revisionId: 'saved', savedBy: 'dean1',
    sheetSlots: [], sheetRevisionIds: [], cellCounts: [] }
  for (const [index, sheet] of prepared.sheets.entries()) {
    const encoded = await snapshots.compressSnapshot(sheet.json)
    const parts = snapshots.compressedParts(encoded)
    const identity = { schemaVersion: 3, workbookId, sourceWorkbook: path, sheetId: sheet.id, sheetIndex: index }
    const metadata = { name: sheet.name, encoding: 'gzip-base64', jsonByteLength: sheet.byteLength, encodedLength: encoded.length, jsonHash: await snapshots.hashSnapshot(sheet.json),
      baseHash: sheet.baseHash, partCount: parts.length, partSlots: parts.map(() => 'a'), partRevisionIds: parts.map(() => 'saved'), partHashes: await Promise.all(parts.map(snapshots.hashSnapshot)), revisionId: 'saved' }
    const sheetPath = `sheets/${workbookId}_${sheet.id}`
    documents.set(sheetPath, { ...identity, slots: { a: metadata } })
    parts.forEach((data, partIndex) => documents.set(`${sheetPath}/chunks/part_${partIndex}`, { ...identity, partIndex,
      slots: { a: { encoding: 'gzip-base64', data, byteLength: data.length, revisionId: 'saved' } } }))
    manifest.sheetSlots.push('a'); manifest.sheetRevisionIds.push('saved'); manifest.cellCounts.push(0)
  }
  documents.set(path, manifest)
  const auth = { currentUser: { uid: 'dean1' } }
  const app = { options: { projectId: 'project1' }, name: '[DEFAULT]' }
  const reads = [], aggregates = []
  let denied = () => false, onRead = () => {}, onAggregate = () => {}
  const snapshot = key => {
    const data = documents.get(key)
    return { id: key.split('/').at(-1), ref: key, exists: () => data !== undefined, data: () => data }
  }
  const matching = ({ path, filter }) => [...documents].filter(([key, data]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/') && (!filter
    || (filter.field === '__name__' ? filter.value.includes(key.split('/').at(-1)) : data[filter.field] === filter.value))).map(([key]) => snapshot(key))
  const assertAccess = key => { if (denied(key)) throw Object.assign(new Error('Denied'), { code: 'permission-denied' }) }
  const firestore = {
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'), documentId: () => '__name__',
    where: (field, operator, value) => ({ field, operator, value }), query: (path, filter) => ({ path, filter }),
    getDocFromServer: async key => { assertAccess(key); reads.push(key); onRead(key); return snapshot(key) },
    getDocsFromServer: async query => { assertAccess(query.path); reads.push(query.path); return { docs: matching(query) } },
    getCountFromServer: async query => { assertAccess(query.path); aggregates.push(query); onAggregate(query.path); return { data: () => ({ count: matching(query).length }) } },
    serverTimestamp: () => 'server-timestamp',
    runTransaction: async (_db, callback) => {
      const writes = []
      const result = await callback({ get: async key => snapshot(key), set: (key, data) => writes.push([key, data]) })
      for (const [key, data] of writes) documents.set(key, data)
      return result
    },
  }
  function module(source, modules = {}) {
    const context = { exports: {}, Blob, indexedDB, TextEncoder, crypto: webcrypto, performance, setTimeout, clearTimeout, console,
      require: name => { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name] } }
    vm.runInNewContext(source, context)
    return context.exports
  }
  const runtime = () => {
    const fileCache = module(sources.departmentWorkbookCache)
    const persistent = module(sources.firestoreWorkbookCache, { '../firebase': { app }, '../utils/firestoreWorkbookSnapshots': snapshots, './departmentWorkbookCache': fileCache })
    const service = module(sources.firestoreDepartmentWorkbooks, {
      'firebase/firestore': firestore, '../firebase': { app, auth, db: {} }, '../utils/departmentWorkbookPaths': paths, '../utils/departmentWorkbookPermissions': permissions,
      '../utils/withDeadline': module(deadlineSource), '../utils/firestoreWorkbookState': state, '../utils/firestoreWorkbookSnapshots': snapshots,
      '../utils/workbookAudit': workbookAudit,
      './workbookScheduleWrites': {}, './workbookSheetCleanup': { cleanupUnusedWorkbookSheets: async () => true }, './firestoreWorkbookCache': persistent,
    })
    return { service, persistent, fileCache, load: onProgress => service.loadFirestoreDepartmentWorkbook(term, onProgress) }
  }
  return { documents, manifest, reads, aggregates, auth, app, runtime, workbookId, sheetPath: index => `sheets/${workbookId}_sheet_${index}`,
    deny: callback => { denied = callback }, beforeRead: callback => { onRead = callback }, beforeAggregate: callback => { onAggregate = callback },
    clearReads: () => { reads.length = 0; aggregates.length = 0 } }
}

test('whole workbook survives runtime reload with values, formulas, hidden sheets and dimensions intact', async () => {
  const h = await harness()
  const downloads = []
  const original = await h.runtime().load(message => downloads.push(message))
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
  assert.ok(downloads.some(message => message.startsWith('Downloading sheets from Firestore')))
  assert.equal(downloads.at(-1), 'Opening downloaded workbook…')
  h.clearReads()
  const progress = []
  const cached = await h.runtime().load(message => progress.push(message)) // New modules discard all JavaScript memory caches.
  assert.equal(cached.editorState, original.editorState)
  assert.equal(h.reads.some(path => path.includes('/chunks/part_')), false)
  assert.equal(h.aggregates.length, 2)
  assert.equal(h.reads.filter(key => key === path).length, 2, 'manifest is checked before and after cache verification')
  assert.ok(progress.some(message => message.startsWith('Checking cached sheets against Firestore')))
  assert.equal(progress.some(message => message.startsWith('Downloading')), false)
  assert.equal(progress.at(-1), 'Opening workbook from cache…')
  const restored = deserializeWorkbookState(cached.editorState, {})
  assert.deepEqual(restored.workbook.SheetNames, ['First', 'Hidden'])
  assert.equal(restored.workbook.Sheets.First.B1.f, '1+2')
  assert.equal(restored.workbook.Workbook.Sheets[1].Hidden, 1)
  assert.equal(restored.rowHeightOverrides.get('First').get(1), 40)
  assert.equal(restored.columnWidthOverrides.get('First').get(1), 200)
})

test('another account or project cannot reuse the persisted snapshot', async () => {
  const h = await harness()
  await h.runtime().load()
  h.auth.currentUser = { uid: 'another-account' }
  h.clearReads()
  await h.runtime().load()
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
  h.auth.currentUser = { uid: 'dean1' }; h.app.options.projectId = 'another-project'
  h.clearReads()
  await h.runtime().load()
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
})

test('a newer saved revision downloads current sheets and replaces the old cache', async () => {
  const h = await harness()
  await h.runtime().load()
  h.documents.set(path, { ...h.manifest, revision: 2, revisionId: 'newer' })
  h.clearReads()
  assert.equal((await h.runtime().load()).revisionId, 'newer')
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
  h.clearReads()
  await h.runtime().load()
  assert.equal(h.reads.some(path => path.includes('/chunks/part_')), false)
})

test('saving a workbook with no sheets replaces its cached snapshot', async () => {
  const h = await harness()
  const first = h.runtime()
  const saved = await first.load()
  const next = await first.service.saveFirestoreDepartmentWorkbook(term, 'Schedule.xlsx', state.serializeFirestoreWorkbookState(fixture(true)), saved)
  assert.equal(next.revision, 2)
  h.clearReads()
  const reopened = await h.runtime().load()
  assert.deepEqual(deserializeWorkbookState(reopened.editorState, {}).workbook.SheetNames, [])
  assert.equal(h.reads.some(path => path.startsWith('sheets/')), false)
})

test('deleted sheet documents are detected despite a warm persistent cache', async () => {
  const h = await harness()
  await h.runtime().load()
  const original = h.documents.get(h.sheetPath(0))
  h.documents.delete(h.sheetPath(0))
  await assert.rejects(h.runtime().load(), error => error.name === 'MissingFirestoreDepartmentWorkbookError')
  h.documents.set(h.sheetPath(0), original)
  h.clearReads()
  await h.runtime().load()
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')), 'failed verification invalidates the persistent copy')
})

test('an obsolete extra chunk cannot hide deletion of an active cached chunk', async () => {
  const h = await harness()
  await h.runtime().load()
  h.documents.delete(`${h.sheetPath(0)}/chunks/part_0`)
  h.documents.set(`${h.sheetPath(0)}/chunks/part_99`, { obsolete: true })
  await assert.rejects(h.runtime().load(), error => error.name === 'MissingFirestoreDepartmentWorkbookError')
})

function addCell(h, text) {
  const parent = h.documents.get(h.sheetPath(0))
  h.manifest.cellCounts[0] = 1
  h.documents.set(`${h.sheetPath(0)}/cells/A1`, { schemaVersion: 3, workbookId: h.workbookId, sourceWorkbook: path, sheetId: 'sheet_0', sheetIndex: 0,
    baseRevisionId: parent.slots.a.revisionId, revision: 1, text, styleJson: null })
}

test('active cell edits are cached and rechecked; deleted edits still trigger recovery', async () => {
  const h = await harness()
  addCell(h, 'Saved edit')
  await h.runtime().load()
  h.clearReads()
  const cached = await h.runtime().load()
  assert.equal(deserializeWorkbookState(cached.editorState, {}).cellTextOverrides.get('First').get('A1'), 'Saved edit')
  assert.equal(h.reads.some(path => path.includes('/chunks/part_')), false)
  h.documents.delete(`${h.sheetPath(0)}/cells/A1`)
  await assert.rejects(h.runtime().load(), error => error.name === 'MissingFirestoreDepartmentWorkbookError')
})

test('changed server cell text with the same revision reloads the base and applies current edits', async () => {
  const h = await harness()
  addCell(h, 'Old edit')
  await h.runtime().load()
  addCell(h, 'Current edit')
  h.clearReads()
  const progress = []
  const current = await h.runtime().load(message => progress.push(message))
  assert.equal(deserializeWorkbookState(current.editorState, {}).cellTextOverrides.get('First').get('A1'), 'Current edit')
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
  assert.ok(progress.some(message => message.startsWith('Downloading sheets from Firestore')))
  assert.equal(progress.at(-1), 'Opening workbook from cached and downloaded sheets…')
})

test('server permission failures never fall back to cached sheet data', async () => {
  for (const blocked of [path, 'chunks', 'cells']) {
    const h = await harness()
    await h.runtime().load()
    h.deny(key => key === blocked || key.endsWith(`/${blocked}`))
    await assert.rejects(h.runtime().load(), /Firestore denied access/)
  }
})

test('missing workbook metadata does not resurrect cached sheets', async () => {
  const h = await harness()
  await h.runtime().load()
  h.documents.delete(path)
  assert.equal(await h.runtime().load(), null)
})

test('unavailable IndexedDB falls back to Firestore after a runtime reload', async () => {
  const h = await harness({ open() { throw new Error('Storage disabled') } })
  await h.runtime().load()
  h.clearReads()
  await h.runtime().load()
  assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
})

test('malformed or corrupted persistent data falls back to a verified cloud load', async () => {
  for (const corrupt of ['invalid json', 'invalid hash']) {
    const h = await harness()
    const first = h.runtime()
    await first.load()
    const cacheKey = first.fileCache.workbookFileCacheKey(JSON.stringify(['firestore-v3', 'project1', '[DEFAULT]', 'dean1']), path, 'snapshot-v1')
    let text = 'invalid json'
    if (corrupt === 'invalid hash') {
      const value = JSON.parse(await (await first.fileCache.readWorkbookFileCache(cacheKey)).text())
      value.sheets[0].json = value.sheets[0].json.replace('Original', 'Outdated')
      text = JSON.stringify(value)
    }
    await first.fileCache.writeWorkbookFileCache(cacheKey, new Blob([text]))
    h.clearReads()
    await h.runtime().load()
    assert.ok(h.reads.some(path => path.includes('/chunks/part_')))
  }
})

test('a revision or account change during cache verification prevents returning the snapshot', async () => {
  for (const changed of ['revision', 'account']) {
    const h = await harness()
    await h.runtime().load()
    h.beforeAggregate(() => {
      if (changed === 'account') h.auth.currentUser = { uid: 'someone-else' }
      else h.documents.set(path, { ...h.manifest, revision: 2, revisionId: 'newer' })
    })
    await assert.rejects(h.runtime().load(), changed === 'account' ? /account changed/ : /workbook changed while loading/)
  }
})
