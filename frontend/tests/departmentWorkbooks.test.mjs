import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { IDBFactory } from 'fake-indexeddb'

// Run the real service with in-memory Firebase adapters; no live cloud writes.
const serviceSource = readFileSync(new URL('../src/services/departmentWorkbooks.ts', import.meta.url), 'utf8')
const pathsSource = readFileSync(new URL('../src/utils/departmentWorkbookPaths.ts', import.meta.url), 'utf8')
const deadlineSource = readFileSync(new URL('../src/utils/withDeadline.ts', import.meta.url), 'utf8')
const cacheSource = readFileSync(new URL('../src/services/departmentWorkbookCache.ts', import.meta.url), 'utf8')
const permissionsSource = readFileSync(new URL('../src/utils/departmentWorkbookPermissions.ts', import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText
const term = { departmentId: 'department1', departmentCode: 'CITE', academicYearId: 'year1', academicYear: '2026 - 2027', semester: 'sem1', membershipId: 'member1' }
const documentPath = 'departments/department1/workbooks/2026-2027/semesters/sem1'
const legacyDocumentPath = 'departments/department1/scheduleYears/year1/semesters/sem1'
const workbook = () => new File(['workbook-bytes'], 'Schedule.xlsx')
const scheduleRow = (sourceRow = 4, sourceSheet = 'UY') => ({ sourceSheet, sourceRow, yearLevel: 2, college: 'PARALLEL', subjectArea: 'IT', subjectCode: 'ITE 298', subjectTitle: 'Information Management', course: '2BSIT', classSection: String(sourceRow), units: { lec: 2, lab: 1, total: 3 }, hours: { lec: 2, lab: 3, total: 5 }, maxStudents: 50,
  faculty: { lec: ['Cruz', 'Jan'], lab: [] }, f2fTime: { lec: ['7:30-9:00', '1:30-3:00'], lab: [] }, f2fDays: { lec: ['WED', 'SAT'], lab: [] }, f2fRoom: { lec: ['PTC 201', 'PTC 305'], lab: [] }, rawValues: [], parallelSourceRow: 4, validationIssues: [], meetings: [
    { format: 'Lec', faculty: 'Cruz', time: '7:30-9:00', day: 'WED', room: 'PTC 201', startTime: '07:30', endTime: '09:00', days: ['Wed'], instructorId: 'cruz', roomId: '201', buildingId: 'ptc' },
    { format: 'Lec', faculty: 'Jan', time: '1:30-3:00', day: 'SAT', room: 'PTC 305', startTime: '13:30', endTime: '15:00', days: ['Sat'], instructorId: 'jan', roomId: '305', buildingId: 'ptc' },
  ] })

function harness({ phase = 'Drafting', role = 'Dean', membershipStatus = 'accepted', membershipDepartment = 'CITE', membershipUserId, failUpload = false, failScheduleCommit = false, failRead = false, hangRead = false, hangDownload = false, downloadErrorCode = '', user = { uid: 'dean1' } } = {}) {
  const documents = new Map([
    ['academicYears/year1', { sem1: { phase }, sem2: { phase } }],
    ['memberships/member1', { userId: membershipUserId ?? user?.uid ?? 'dean1', role, status: membershipStatus, department: membershipDepartment }],
  ])
  const objects = new Map()
  const generations = new Map()
  let generation = 0
  const downloads = []
  const metadataRequests = []
  const firebaseAuth = { currentUser: user }
  const calls = []
  const timers = new Map()
  let nextTimer = 0
  const timerApi = {
    setTimeout: (callback, milliseconds) => { const id = ++nextTimer; timers.set(id, { callback, milliseconds }); return id },
    clearTimeout: id => timers.delete(id),
  }
  const snapshot = path => ({ exists: () => documents.has(path), data: () => documents.get(path) })
  let transactions = Promise.resolve()
  const firestore = {
    collection: (_db, ...path) => path.join('/'),
    where: (field, operator, value) => ({ field, operator, value }),
    query: (path, filter) => ({ path, filter }),
    getDocs: async ({ path, filter }) => ({ docs: [...documents].filter(([key, data]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/') && data[filter.field] === filter.value).map(([key, data]) => ({ id: key.slice(path.length + 1), ref: key, data: () => data })) }),
    doc: (_db, ...path) => path.join('/'),
    getDoc: async path => { if (failRead) throw new Error('Read failed'); return snapshot(path) },
    getDocFromServer: async path => {
      if (hangRead) return new Promise(() => {})
      if (failRead) throw new Error('Read failed')
      return snapshot(path)
    },
    serverTimestamp: () => 'server-timestamp',
    setDoc: async (path, data) => { calls.push(['grant', path]); documents.set(path, data) },
    deleteDoc: async path => { documents.delete(path) },
    runTransaction: async (_db, callback) => {
      const next = transactions.then(async () => {
        const writes = []
        await callback({ get: async path => snapshot(path), set: (path, data) => writes.push([path, data]), delete: path => writes.push([path, null]) })
        if (failScheduleCommit && writes.some(([path]) => path.startsWith('schedule/'))) throw new Error('Schedule commit failed')
        for (const [path, data] of writes) {
          calls.push(['commit', path])
          if (data === null) documents.delete(path)
          else documents.set(path, data)
        }
      })
      transactions = next.catch(() => {})
      return next
    },
  }
  const storage = {
    ref: (_storage, path) => path,
    uploadBytes: async (path, blob) => {
      calls.push(['upload', path])
      if (failUpload && path.endsWith('editor.json')) throw new Error('Upload failed')
      objects.set(path, blob)
      generations.set(path, String(++generation))
      return { metadata: { generation: generations.get(path), size: blob.size } }
    },
    deleteObject: async path => { calls.push(['cleanup', path]); objects.delete(path) },
    getMetadata: async path => {
      metadataRequests.push(path)
      if (downloadErrorCode) throw Object.assign(new Error('Download failed'), { code: downloadErrorCode })
      if (!objects.has(path)) throw Object.assign(new Error('Missing object'), { code: 'storage/object-not-found' })
      return { generation: generations.get(path), size: objects.get(path).size }
    },
    getBlob: async path => { downloads.push(path); if (hangDownload) return new Promise(() => {}); if (downloadErrorCode) throw Object.assign(new Error('Download failed'), { code: downloadErrorCode }); if (!objects.has(path)) throw Object.assign(new Error('Missing object'), { code: 'storage/object-not-found' }); return objects.get(path) },
  }
  const pathModule = { exports: {} }
  vm.runInNewContext(compile(pathsSource), pathModule)
  const permissionsModule = { exports: {} }
  vm.runInNewContext(compile(permissionsSource), permissionsModule)
  const deadlineModule = { exports: {}, ...timerApi }
  vm.runInNewContext(compile(deadlineSource), deadlineModule)
  let indexedDB = new IDBFactory()
  let cacheModule
  const resetCache = (clearDisk = false) => {
    if (clearDisk) indexedDB = new IDBFactory()
    cacheModule = { exports: {}, Blob, indexedDB, ...timerApi }
    vm.runInNewContext(compile(cacheSource), cacheModule)
  }
  resetCache()
  const cacheWrites = []
  const cacheAdapter = {
    workbookFileCacheKey: (...args) => cacheModule.exports.workbookFileCacheKey(...args),
    readWorkbookFileCache: (...args) => cacheModule.exports.readWorkbookFileCache(...args),
    writeWorkbookFileCache: (...args) => { const writing = cacheModule.exports.writeWorkbookFileCache(...args); cacheWrites.push(writing); return writing },
  }
  const modules = { 'firebase/firestore': firestore, 'firebase/storage': storage, '../firebase': { app: { options: { projectId: 'test-project', storageBucket: 'test-bucket' } }, auth: firebaseAuth, db: {}, storage: {} }, '../utils/departmentWorkbookPaths': pathModule.exports, '../utils/departmentWorkbookPermissions': permissionsModule.exports, '../utils/withDeadline': deadlineModule.exports, './departmentWorkbookCache': cacheAdapter }
  const context = { exports: {}, require: name => modules[name], File, Blob, crypto, console }
  vm.runInNewContext(compile(serviceSource), context)
  return { service: context.exports, documents, objects, generations, firebaseAuth, calls, timers, downloads, metadataRequests, resetCache, flushCache: () => Promise.all(cacheWrites), expire: () => { for (const { callback } of timers.values()) callback(); timers.clear() } }
}

test('first save finishes both uploads before recording a term; reopening restores file and snapshot', async () => {
  const { service, documents, objects, calls } = harness()
  assert.equal(await service.loadDepartmentWorkbook(term), null)
  const saved = await service.saveDepartmentWorkbook(term, workbook(), 'editor snapshot', null)
  assert.equal(saved.revision, 1)
  assert.equal(documents.get(documentPath).savedBy, 'dean1')
  assert.equal(objects.size, 2)
  assert.deepEqual(calls.map(([kind]) => kind), ['grant', 'upload', 'upload', 'commit'])
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.equal(loaded.editorState, 'editor snapshot')
  assert.equal(loaded.file.name, 'Schedule.xlsx')
  assert.equal(await loaded.file.text(), 'workbook-bytes')
})

for (const [location, oldDocument, storageYear] of [['year-ID', legacyDocumentPath, 'year1'], ['named-year', 'departments/department1/scheduleYears/2026-2027/semesters/sem1', '2026-2027'], ['previous-layout', 'departments/department1/workbooks/2026-2027/sem1/sem1storage', '2026-2027']]) test(`${location} workbooks migrate on save, retaining original files, creation time and schedule row IDs`, async () => {
  const { service, documents, objects, generations } = harness()
  const originalPath = `department-workbooks/department1/${storageYear}/sem1/${location === 'previous-layout' ? 'workbooks' : 'revisions'}/legacy/original.xlsx`
  const editorPath = `department-workbooks/department1/${storageYear}/sem1/${location === 'previous-layout' ? 'workbooks' : 'revisions'}/legacy/editor.json`
  objects.set(originalPath, workbook()); objects.set(editorPath, new Blob(['legacy editor']))
  generations.set(originalPath, 'legacy-original'); generations.set(editorPath, 'legacy-editor')
  documents.set(oldDocument, { schemaVersion: 1, fileName: 'Schedule.xlsx', workbookPath: originalPath, editorStatePath: editorPath, revision: 4, createdAt: 'original-date' })
  const rowId = `workbook_${encodeURIComponent(JSON.stringify([term.departmentId, term.academicYearId, term.semester, 'UY', 4]))}`
  documents.set(`schedule/${rowId}`, { sourceWorkbook: oldDocument, createdAt: 'row-date', ...scheduleRow() })
  documents.set('schedule/removed-row', { sourceWorkbook: oldDocument, subjectCode: 'Remove' })
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.equal(loaded.revision, 4); assert.equal(loaded.editorState, 'legacy editor')
  const saved = await service.saveDepartmentWorkbook(term, loaded.file, 'migrated editor', loaded, false, [scheduleRow()])
  assert.equal(saved.revision, 5); assert.equal(saved.workbookPath, originalPath)
  assert.match(saved.editorStatePath, /department-workbooks\/department1\/2026-2027\//)
  assert.equal(documents.get(documentPath).createdAt, 'original-date')
  assert.equal(documents.get(`schedule/${rowId}`).createdAt, 'row-date')
  assert.equal(documents.get(`schedule/${rowId}`).sourceWorkbook, documentPath)
  assert.equal(documents.has('schedule/removed-row'), false)
  assert.equal(documents.get(oldDocument).revision, 4)
  assert.equal((await service.loadDepartmentWorkbook(term)).editorState, 'migrated editor')
  await assert.rejects(service.saveDepartmentWorkbook(term, loaded.file, 'stale', loaded), /newer version/)
})

test('schedule rows and workbook commit together; repeat saves update, delete, and retain other terms/legacy records', async () => {
  const { service, documents } = harness()
  documents.set('schedule/legacy', { department: 'CITE', subjectCode: 'OLD' })
  documents.set('schedule/other-term', { sourceWorkbook: 'other-semester', subjectCode: 'OTHER' })
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'first', null, false, [scheduleRow(4), scheduleRow(5)])
  const records = () => [...documents].filter(([path, data]) => path.startsWith('schedule/') && data.sourceWorkbook === documentPath)
  assert.equal(records().length, 2)
  const [id, initial] = records()[0]
  assert.equal(initial.meetings.length, 2)
  assert.equal(initial.academicYearId, 'year1')
  assert.equal(initial.semester, '1st Semester')
  assert.deepEqual(Array.from(initial.instructorIds), ['cruz', 'jan'])
  assert.deepEqual(Array.from(initial.roomIds), ['201', '305'])
  assert.equal(initial.workbookRevision, documents.get(documentPath).revision)
  const changed = { ...scheduleRow(4), subjectTitle: 'Changed' }
  const second = await service.saveDepartmentWorkbook(term, workbook(), 'second', first, false, [changed])
  assert.equal(records().length, 1)
  assert.equal(records()[0][0], id)
  assert.equal(records()[0][1].subjectTitle, 'Changed')
  assert.equal(records()[0][1].createdAt, initial.createdAt)
  assert.equal(records()[0][1].workbookRevision, second.revision)
  assert.ok(documents.has('schedule/legacy'))
  assert.ok(documents.has('schedule/other-term'))
  await service.saveDepartmentWorkbook(term, workbook(), 'third', second, false, [])
  assert.equal(records().length, 0)
  assert.ok(documents.has('schedule/legacy'))
})

test('failed schedule transaction leaves workbook and schedule untouched and cleans staging uploads', async () => {
  const { service, documents, objects } = harness({ failScheduleCommit: true })
  documents.set('schedule/prior', { sourceWorkbook: documentPath, subjectCode: 'OLD' })
  await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'state', null, false, [scheduleRow()]), /Schedule commit failed/)
  assert.equal(documents.has(documentPath), false)
  assert.equal(objects.size, 0)
  assert.equal(documents.get('schedule/prior').subjectCode, 'OLD')
  assert.equal([...documents.keys()].filter(path => path.startsWith('schedule/')).length, 1)
})

test('concurrent schedule saves cannot mix rows from different revisions', async () => {
  const { service, documents } = harness()
  const results = await Promise.allSettled([
    service.saveDepartmentWorkbook(term, workbook(), 'a', null, false, [scheduleRow(4)]),
    service.saveDepartmentWorkbook(term, workbook(), 'b', null, false, [scheduleRow(7)]),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rows = [...documents.values()].filter(data => data.sourceWorkbook === documentPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].workbookRevisionId, documents.get(documentPath).revisionId)
})

test('a stale save cannot delete or replace the latest schedule rows', async () => {
  const { service, documents } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'first', null, false, [scheduleRow(4)])
  const latest = await service.saveDepartmentWorkbook(term, workbook(), 'latest', first, false, [scheduleRow(7)])
  await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'stale', first, false, [scheduleRow(5)]), /newer version/)
  const rows = [...documents.values()].filter(data => data.sourceWorkbook === documentPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sourceRow, 7)
  assert.equal(rows[0].workbookRevision, latest.revision)
})

test('semesters have independent schedule document IDs and replacement scopes', async () => {
  const { service, documents } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'a', null, false, [scheduleRow()])
  await service.saveDepartmentWorkbook({ ...term, semester: 'sem2' }, workbook(), 'b', null, false, [scheduleRow()])
  assert.equal([...documents.keys()].filter(path => path.startsWith('schedule/')).length, 2)
  await service.saveDepartmentWorkbook(term, workbook(), 'cleared', first, false, [])
  const rows = [...documents.values()].filter(data => data.source === 'workbook')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].semester, '2nd Semester')
})

test('later saves reuse the original XLSX and retain earlier snapshots', async () => {
  const { service, objects } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'first', null)
  const next = await service.saveDepartmentWorkbook(term, workbook(), 'second', first)
  assert.equal(next.workbookPath, first.workbookPath)
  assert.notEqual(next.editorStatePath, first.editorStatePath)
  assert.equal(next.revision, 2)
  assert.equal(objects.size, 3)
  assert.equal((await service.loadDepartmentWorkbook(term)).editorState, 'second')
})

test('failed uploads clean staging files and never create or replace a term record', async () => {
  const { service, documents, objects } = harness({ failUpload: true })
  await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null), /Upload failed/)
  assert.equal(documents.has(documentPath), false)
  assert.equal(objects.size, 0)
  assert.equal([...documents.keys()].some(path => path.includes('/uploads/')), false)
})

test('concurrent first saves commit only one version and remove the rejected staging files', async () => {
  const { service, documents, objects } = harness()
  const results = await Promise.allSettled([
    service.saveDepartmentWorkbook(term, workbook(), 'first', null),
    service.saveDepartmentWorkbook(term, workbook(), 'second', null),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.match(results.find(result => result.status === 'rejected').reason.message, /newer version/)
  assert.equal(documents.get(documentPath).revision, 1)
  assert.equal(objects.size, 2)
})

test('stale later saves do not overwrite the newest snapshot', async () => {
  const { service, objects } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'first', null)
  await service.saveDepartmentWorkbook(term, workbook(), 'latest', first)
  await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'stale', first), /newer version/)
  assert.equal(objects.size, 3)
  assert.equal((await service.loadDepartmentWorkbook(term)).editorState, 'latest')
})

test('signed-out users and closed semesters fail before uploading', async () => {
  for (const options of [{ user: null }, { phase: 'Final' }, { phase: 'Closed' }]) {
    const { service, calls } = harness(options)
    await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null))
    assert.equal(calls.length, 0)
  }
})

test('accepted Admins save across departments during all four management phases', async () => {
  for (const role of ['Admin']) {
    for (const phase of ['Drafting', 'Plotting', 'Revision', 'Final']) {
      const { service, documents } = harness({ role, phase, membershipDepartment: 'Administrative Office' })
      const saved = await service.saveDepartmentWorkbook(term, workbook(), `${role} ${phase}`, null)
      assert.equal(saved.revision, 1)
      assert.equal(documents.get(documentPath).membershipId, 'member1')
      assert.equal((await service.loadDepartmentWorkbook(term)).editorState, `${role} ${phase}`)
    }
  }
})

test('Registrar workbook saves are rejected in every phase before any upload or write', async () => {
  for (const phase of ['Drafting', 'Plotting', 'Revision', 'Final', 'Closed', 'Ended']) {
    const { service, calls } = harness({ role: 'Registrar', phase, membershipDepartment: 'Administrative Office' })
    await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null), /read only/)
    assert.equal(calls.length, 0)
  }
})

test('workbook saves reject unaccepted memberships, other users, invalid roles and unauthorized phases before uploading', async () => {
  for (const options of [
    { role: 'Admin', membershipStatus: 'pending' },
    { role: 'Registrar', membershipStatus: 'declined' },
    { role: 'Admin', membershipUserId: 'someone-else' },
    { role: 'Instructor' },
    { role: 'Dean', membershipDepartment: 'OTHER' },
    { role: 'Program Head', phase: 'Plotting' },
    { role: 'Admin', phase: 'Closed' },
    { role: 'Registrar', phase: 'Ended' },
  ]) {
    const { service, calls } = harness(options)
    await assert.rejects(service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null))
    assert.equal(calls.length, 0)
  }
})

test('load errors and invalid paths are not treated as an empty semester', async () => {
  await assert.rejects(harness({ failRead: true }).service.loadDepartmentWorkbook(term), /Read failed/)
  const { service, documents } = harness()
  documents.set(documentPath, { schemaVersion: 1, fileName: 'Bad.xlsx', revision: 1, workbookPath: 'department-workbooks/OTHER/year1/sem1/revisions/uuid/original.xlsx', editorStatePath: 'invalid' })
  await assert.rejects(service.loadDepartmentWorkbook(term), /invalid/)
})

test('1st and 2nd semester save independently', async () => {
  const { service, documents } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'first semester', null)
  const secondTerm = { ...term, semester: 'sem2' }
  await service.saveDepartmentWorkbook(secondTerm, workbook(), 'second semester', null)
  assert.equal((await service.loadDepartmentWorkbook(term)).editorState, 'first semester')
  assert.equal((await service.loadDepartmentWorkbook(secondTerm)).editorState, 'second semester')
  assert.equal(documents.get(documentPath).revision, 1)
  assert.equal(documents.get(documentPath.replaceAll('sem1', 'sem2')).revision, 1)
})

test('a stuck Firestore lookup expires with a retryable error, never an empty term', async () => {
  const { service, timers, expire } = harness({ hangRead: true })
  const stages = []
  const pending = service.loadDepartmentWorkbook(term, stage => stages.push(stage))
  const rejected = assert.rejects(pending, /took too long.*try loading again/)
  assert.equal([...timers.values()][0].milliseconds, 30000)
  expire()
  await rejected
  assert.deepEqual(stages, ['checking'])
})

test('a stalled Storage download expires and does not discard the saved term', async () => {
  const { service, documents, resetCache, expire } = harness({ hangDownload: true })
  await service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null)
  resetCache(true)
  const stages = []
  let reportDownloading
  const downloadStarted = new Promise(resolve => { reportDownloading = resolve })
  const pending = service.loadDepartmentWorkbook(term, stage => {
    stages.push(stage)
    if (stage === 'downloading') reportDownloading()
  })
  const rejected = assert.rejects(pending, /took too long/)
  await downloadStarted
  assert.ok(stages.includes('downloading'))
  expire()
  await rejected
  assert.equal(documents.get(documentPath).revision, 1)
})

test('successful cached loads clear the deadline and report using the cache', async () => {
  const { service, timers } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'snapshot', null)
  const stages = []
  await service.loadDepartmentWorkbook(term, stage => stages.push(stage))
  assert.deepEqual(stages, ['checking', 'cached'])
  assert.equal([...timers.values()].some(timer => timer.milliseconds === 30000), false)
})

test('deleted original, snapshot, or both retain the term revision for a replacement import', async () => {
  for (const missing of ['workbookPath', 'editorStatePath', 'both']) {
    const { service, objects } = harness()
    const saved = await service.saveDepartmentWorkbook(term, workbook(), 'old', null)
    if (missing !== 'editorStatePath') objects.delete(saved.workbookPath)
    if (missing !== 'workbookPath') objects.delete(saved.editorStatePath)
    await assert.rejects(service.loadDepartmentWorkbook(term), error => {
      assert.ok(error instanceof service.MissingDepartmentWorkbookError)
      assert.equal(error.previous.revision, saved.revision)
      assert.equal(error.previous.workbookPath, saved.workbookPath)
      return true
    })
  }
})

test('saving a replacement repairs the existing record and subsequent saves reuse the new original', async () => {
  const { service, documents, objects } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'old', null)
  const createdAt = documents.get(documentPath).createdAt
  objects.clear()
  const replacement = new File(['replacement-bytes'], 'Replacement.xlsx')
  const saved = await service.saveDepartmentWorkbook(term, replacement, 'new state', first, true)
  assert.equal(saved.revision, 2)
  assert.notEqual(saved.workbookPath, first.workbookPath)
  assert.equal(documents.get(documentPath).createdAt, createdAt)
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.equal(loaded.file.name, 'Replacement.xlsx')
  assert.equal(await loaded.file.text(), 'replacement-bytes')
  assert.equal(loaded.editorState, 'new state')
  const next = await service.saveDepartmentWorkbook(term, replacement, 'edited again', saved)
  assert.equal(next.workbookPath, saved.workbookPath)
  assert.equal(next.revision, 3)
})

test('concurrent replacement saves cannot overwrite each other', async () => {
  const { service, documents, objects } = harness()
  const first = await service.saveDepartmentWorkbook(term, workbook(), 'old', null)
  objects.clear()
  const results = await Promise.allSettled([
    service.saveDepartmentWorkbook(term, workbook(), 'replacement one', first, true),
    service.saveDepartmentWorkbook(term, workbook(), 'replacement two', first, true),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(documents.get(documentPath).revision, 2)
  assert.equal(objects.size, 2)
})

test('download permission and network errors do not enable a replacement import', async () => {
  for (const code of ['storage/unauthorized', 'storage/retry-limit-exceeded']) {
    const { service } = harness({ downloadErrorCode: code })
    await service.saveDepartmentWorkbook(term, workbook(), 'saved', null)
    await assert.rejects(service.loadDepartmentWorkbook(term), error => {
      assert.equal(error instanceof service.MissingDepartmentWorkbookError, false)
      assert.equal(error.code, code)
      return true
    })
  }
})

test('unchanged workbooks reopen from memory and IndexedDB without downloading file contents', async () => {
  const { service, downloads, metadataRequests, resetCache, flushCache } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'cached state', null)
  await service.loadDepartmentWorkbook(term)
  await service.loadDepartmentWorkbook(term)
  assert.equal(downloads.length, 0)
  assert.equal(metadataRequests.length, 4)
  await flushCache()
  resetCache()
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.equal(loaded.editorState, 'cached state')
  assert.equal(await loaded.file.text(), 'workbook-bytes')
  assert.equal(downloads.length, 0)
})

test('a cold cache downloads each file once, then reuses both', async () => {
  const { service, downloads, resetCache } = harness()
  const saved = await service.saveDepartmentWorkbook(term, workbook(), 'state', null)
  resetCache(true)
  await service.loadDepartmentWorkbook(term)
  assert.deepEqual(downloads.sort(), [saved.workbookPath, saved.editorStatePath].sort())
  await service.loadDepartmentWorkbook(term)
  assert.equal(downloads.length, 2)
})

test('a newer remote snapshot downloads only the changed editor file', async () => {
  const { service, documents, objects, generations, downloads } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'old state', null)
  const editorStatePath = 'department-workbooks/department1/year1/sem1/revisions/remote/editor.json'
  objects.set(editorStatePath, new Blob(['remote state']))
  generations.set(editorStatePath, 'remote-generation')
  documents.set(documentPath, { ...documents.get(documentPath), revision: 2, editorStatePath })
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.deepEqual(downloads, [editorStatePath])
  assert.equal(loaded.revision, 2)
  assert.equal(loaded.editorState, 'remote state')
})

test('changes at the same Storage path invalidate the cached generation', async () => {
  const { service, objects, generations, downloads } = harness()
  const saved = await service.saveDepartmentWorkbook(term, workbook(), 'state', null)
  objects.set(saved.workbookPath, new Blob(['changed original']))
  generations.set(saved.workbookPath, 'new-generation')
  const loaded = await service.loadDepartmentWorkbook(term)
  assert.deepEqual(downloads, [saved.workbookPath])
  assert.equal(await loaded.file.text(), 'changed original')
})

test('cached workbooks are isolated between signed-in accounts', async () => {
  const { service, firebaseAuth, downloads } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'state', null)
  firebaseAuth.currentUser = { uid: 'another-user' }
  await service.loadDepartmentWorkbook(term)
  assert.equal(downloads.length, 2)
  firebaseAuth.currentUser = { uid: 'dean1' }
  await service.loadDepartmentWorkbook(term)
  assert.equal(downloads.length, 2)
})

test('deleting the term record does not reopen an old cached workbook', async () => {
  const { service, documents, downloads } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'state', null)
  documents.delete(documentPath)
  assert.equal(await service.loadDepartmentWorkbook(term), null)
  assert.equal(downloads.length, 0)
})

test('concurrent cold opens share file downloads', async () => {
  const { service, downloads, resetCache } = harness()
  await service.saveDepartmentWorkbook(term, workbook(), 'state', null)
  resetCache(true)
  await Promise.all([service.loadDepartmentWorkbook(term), service.loadDepartmentWorkbook(term)])
  assert.equal(downloads.length, 2)
})
