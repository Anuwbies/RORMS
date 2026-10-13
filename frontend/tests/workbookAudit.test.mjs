import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { serializeWorkbookState } from '../src/utils/excelWorkbookState.ts'
import { prepareSnapshotSheets } from '../src/utils/firestoreWorkbookSnapshots.ts'
import { describeWorkbookSave } from '../src/utils/workbookAudit.ts'
import { scheduleActivity } from '../src/utils/scheduleLog.ts'

function fixture(names = ['First']) {
  return {
    workbook: { SheetNames: names, Sheets: Object.fromEntries(names.map(name => [name, { '!ref': 'A1:B2', A1: { t: 's', v: name } }])) },
    previewStyles: null, sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(),
    columnWidthOverrides: new Map(), cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(),
    formattingOverrides: new Map(names.map(name => [name, { indexes: new Map(), rowIndexes: new Map(), columnIndexes: [], conditionalRules: [] }])), scheduleSetups: new Map(), hiddenRangeToggles: new Map(),
    selectedSheet: names[0] || '', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}
const sheets = async state => (await prepareSnapshotSheets(serializeWorkbookState(state))).sheets
async function describe(before, after, extra = {}) {
  return describeWorkbookSave({ before: before ? await sheets(before) : null, after: await sheets(after), fileName: 'Schedule.xlsx', previousRevision: before ? 1 : 0, ...extra })
}

test('creation records initial sheets without invented cell edits', async () => {
  const audit = await describe(null, fixture(['First', 'Second']))
  assert.equal(audit.kind, 'created')
  assert.deepEqual(audit.counts, { sheetsIncluded: 2 })
  assert.equal(audit.baselineAvailable, false)
  assert.ok(audit.samples.every(sample => sample.before === null))
  assert.match(scheduleActivity(audit.kind, audit.counts).detail, /2 sheets saved/)
})

test('cell edits preserve empty values; selection-only saves create no changes', async () => {
  const before = fixture(), after = fixture()
  after.selection.focus = { r: 20, c: 3 }
  assert.equal((await describe(before, after)).totalChanges, 0)
  after.cellTextOverrides.set('First', new Map([['A1', '']]))
  const audit = await describe(before, after)
  assert.equal(audit.counts.cellsChanged, 1)
  assert.deepEqual(audit.samples[0], { kind: 'cellsChanged', sheet: 'First', location: 'A1', field: 'Cell value', before: 'First', after: '' })
})

test('sheet insertion, removal, order, and rename respect positional sheet IDs', async () => {
  const before = fixture(['First', 'Second'])
  const added = await describe(before, fixture(['Inserted', 'First', 'Second']))
  assert.equal(added.counts.sheetsAdded, 1)
  assert.equal(added.counts.sheetsRemoved, undefined)
  assert.equal(added.counts.cellsChanged, undefined)
  const removed = await describe(before, fixture(['Second']))
  assert.equal(removed.counts.sheetsRemoved, 1)
  assert.equal(removed.counts.sheetsRenamed, undefined)
  const reordered = await describe(before, fixture(['Second', 'First']))
  assert.deepEqual(reordered.counts, { sheetOrder: 1 })
  const renamed = fixture(['Renamed', 'Second'])
  renamed.workbook.Sheets.Renamed.A1.v = 'First'
  assert.deepEqual((await describe(before, renamed)).counts, { sheetsRenamed: 1 })
})

test('layout, formatting, setup, and workbook replacement are described', async () => {
  const before = fixture(), after = fixture()
  after.rowHeightOverrides.set('First', new Map([[1, 40]]))
  after.cellStyleOverrides.set('First', new Map([['A1', { fontWeight: 'bold' }]]))
  after.scheduleSetups.set('First', { headerRow: 0, columns: [], years: new Map([[1, 1]]) })
  const audit = await describe(before, after, { imported: true, previousFileName: 'Old.xlsx' })
  assert.equal(audit.kind, 'imported')
  assert.equal(audit.counts.workbook, 1)
  assert.equal(audit.counts.layoutChanged, 1)
  assert.equal(audit.counts.formattingChanged, 1)
  assert.equal(audit.counts.setupChanged, 1)
  assert.equal((await describe(before, after, { repaired: true })).kind, 'repaired')
})

test('comments, notes, links and their removal are recorded', async () => {
  const before = fixture(), after = fixture()
  after.workbook.Sheets.First.A1.c = [{ a: 'Dean', t: 'Review this assignment' }]
  after.workbook.Sheets.First.A1.l = { Target: 'https://example.com' }
  const audit = await describe(before, after)
  assert.equal(audit.counts.cellDetailsChanged, 2)
  assert.ok(audit.samples.some(sample => sample.field === 'Comments and notes' && sample.after.includes('Review this assignment')))
  assert.ok((await describe(after, before)).samples.every(sample => sample.after === null))
})

test('large saves keep full counts and bounded descriptions with schedule fields first', async () => {
  const before = fixture(), after = fixture()
  after.cellTextOverrides.set('First', new Map(Array.from({ length: 150 }, (_, index) => [`B${index + 1}`, 'x'.repeat(500)])))
  const audit = await describe(before, after, { schedules: { added: 0, updated: 1, removed: 0, omittedSamples: 0,
    samples: [{ kind: 'schedule', sheet: 'First', location: 'Row 2', field: 'Room', before: 'PTC 201', after: 'PTC 202' }] } })
  assert.equal(audit.counts.cellsChanged, 150)
  assert.equal(audit.counts.schedulesUpdated, 1)
  assert.equal(audit.samples.length, 80)
  assert.equal(audit.omittedSamples, 71)
  assert.equal(audit.samples[0].field, 'Room')
  assert.ok(audit.samples.every(sample => sample.after.length <= 400))
})

function projectionHarness() {
  const documents = new Map()
  const firestore = {
    collection: (_db, path) => path, where: (field, _operator, value) => ({ field, value }),
    query: (path, filter) => ({ path, filter }), doc: (_db, collection, id) => `${collection}/${id}`,
    serverTimestamp: () => 'server-time', getDocs: async ({ filter }) => ({ docs: [...documents].filter(([, data]) => data[filter.field] === filter.value)
      .map(([path, data]) => ({ id: path.split('/').at(-1), ref: path, data: () => data })) }),
  }
  const plottingContext = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/utils/schedulePlotting.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, plottingContext)
  const context = { exports: {}, require: name => name === 'firebase/firestore' ? firestore : name.endsWith('/schedulePlotting') ? plottingContext.exports : { db: {} } }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/workbookScheduleWrites.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context)
  const term = { departmentId: 'dept', departmentCode: 'CITE', academicYearId: 'year', academicYear: '2026-2027', semester: 'sem1' }
  return { documents, prepare: rows => context.exports.prepareWorkbookScheduleWrites(term, rows, 'source', ['source']),
    apply: writes => writes.apply({ set: (path, data) => documents.set(path, data), delete: path => documents.delete(path) }, 1, 'rev', 'dean') }
}

test('schedule projection logs additions, status, room, faculty, times, and removals; skips unchanged rows', async () => {
  const h = projectionHarness()
  const row = { status: 'Draft', sourceSheet: 'First', sourceRow: 2, yearLevel: 1, college: 'CITE', subjectArea: 'IT', subjectCode: 'IT101',
    subjectTitle: 'Introduction', course: 'BSIT', classSection: '1A', units: {}, hours: {}, maxStudents: 40, faculty: {}, f2fRoom: {},
    f2fTime: {}, f2fDays: {}, rawValues: [], meetings: [], parallelSourceRow: null, validationIssues: [] }
  const created = await h.prepare([row])
  assert.equal(created.audit.added, 1)
  h.apply(created)
  const unchanged = await h.prepare([row])
  assert.equal(unchanged.count, 0)
  assert.equal(unchanged.audit.updated, 0)
  const edited = await h.prepare([{ ...row, status: 'Plot', faculty: { lec: ['Teacher'] }, f2fRoom: { lec: ['PTC 201'] }, f2fTime: { lec: ['07:30-09:00'] } }])
  assert.equal(edited.audit.updated, 1)
  for (const label of ['Status', 'Faculty', 'Rooms', 'Meeting times']) assert.ok(edited.audit.samples.some(sample => sample.field.endsWith(label)))
  h.apply(edited)
  const removed = await h.prepare([])
  assert.equal(removed.audit.removed, 1)
  h.apply(removed)
  assert.equal(h.documents.size, 0)
})

function projectedRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    status: 'Draft', sourceSheet: 'First', sourceRow: index + 2, yearLevel: 1,
    college: 'CITE', subjectArea: 'IT', subjectCode: `IT${index + 101}`, subjectTitle: 'Introduction', course: 'BSIT', classSection: '1A',
    units: { lec: 3, lab: null, total: 3 }, hours: { lec: 3, lab: null, total: 3 }, maxStudents: 40,
    faculty: { lec: ['Cruz, Juan'], lab: [] }, f2fRoom: { lec: ['PTC 201'], lab: [] },
    f2fTime: { lec: ['15:00-18:00'], lab: [] }, f2fDays: { lec: ['WED'], lab: [] },
    rawValues: ['IT', 'PTC 201'], parallelSourceRow: null,
    meetings: [{ format: 'Lec', faculty: 'Cruz, Juan', room: 'PTC 201', time: '15:00-18:00', day: 'WED',
      startTime: '15:00', endTime: '18:00', days: ['Wed'], instructorId: '', roomId: 'room-201', buildingId: 'building' }],
    validationIssues: ['Faculty could not be matched uniquely to a membership.'],
  }))
}

test('template saves replace old unit breakdowns with credits and audit credit edits', async () => {
  const h = projectionHarness()
  const oldRow = { ...projectedRows(1)[0], sourceKey: 'faculty-block:IT101:1A' }
  h.apply(await h.prepare([oldRow]))
  const { units, ...fields } = oldRow
  const row = { ...fields, credits: units.total }
  const migrated = await h.prepare([row])
  assert.equal(migrated.count, 1)
  assert.ok(migrated.audit.samples.some(sample => sample.field.endsWith('Credits') && sample.after === '3'))
  h.apply(migrated)
  const saved = [...h.documents.values()][0]
  assert.equal(saved.credits, 3)
  assert.ok(!Object.hasOwn(saved, 'units'))
  assert.equal((await h.prepare([row])).count, 0)

  const edited = await h.prepare([{ ...row, credits: 4 }])
  assert.equal(edited.audit.updated, 1)
  assert.ok(edited.audit.samples.some(sample => sample.field.endsWith('Credits') && sample.before === '3' && sample.after === '4'))

  // A previous mixed-schema document must shed obsolete units even if credits already match.
  saved.units = units
  assert.equal((await h.prepare([row])).count, 1)
})

test('workbook Save preserves Registrar rooms over TBA and clears assignments for changed meetings', async () => {
  const h = projectionHarness()
  const original = { ...projectedRows(1)[0], sourceKey: 'faculty-block:IT101:1A', status: 'Draft',
    f2fRoom: { lec: ['TBA'], lab: [] }, meetings: projectedRows(1)[0].meetings.map(m => ({ ...m, roomId: '', room: 'TBA', buildingId: '' })) }
  h.apply(await h.prepare([original]))
  const saved = [...h.documents.values()][0]
  const meeting = saved.meetings[0]
  const key = JSON.stringify([meeting.instructorId || meeting.faculty, meeting.startTime, meeting.endTime, [...meeting.days].sort(), meeting.format, meeting.modality || ''])
  Object.assign(saved, { status: 'Plot', roomId: 'room-201', roomIds: ['room-201'], buildingId: 'building',
    meetings: [{ ...meeting, roomId: 'room-201', room: 'PTC 201', buildingId: 'building' }],
    f2fRoom: { lec: ['PTC 201'], lab: [] }, registrarPlot: { version: 1, revisionId: 'plot-1', savedBy: 'registrar',
      assignments: [{ key, roomId: 'room-201', room: 'PTC 201', buildingId: 'building' }] } })
  const unchanged = await h.prepare([original])
  assert.equal(unchanged.count, 0, 'default TBA must not reset a plotted room')
  const edited = { ...original, subjectTitle: 'Updated title' }
  h.apply(await h.prepare([edited]))
  assert.equal([...h.documents.values()][0].meetings[0].roomId, 'room-201')
  assert.equal([...h.documents.values()][0].status, 'Plot')
  const moved = { ...edited, sourceKey: 'moved-faculty-block:IT101:1A', sourceRow: 30 }
  h.apply(await h.prepare([moved]))
  assert.equal(h.documents.size, 1)
  assert.equal([...h.documents.values()][0].meetings[0].roomId, 'room-201', 'moving the source block must not erase the plotted room')
  const changedTime = { ...moved, meetings: [{ ...original.meetings[0], startTime: '16:30' }] }
  h.apply(await h.prepare([changedTime]))
  assert.equal([...h.documents.values()][0].meetings[0].roomId, '')
  assert.equal([...h.documents.values()][0].status, 'Draft')
  assert.equal([...h.documents.values()][0].registrarPlot.assignments.length, 0)
})

test('Save refuses to overwrite room assignments plotted after projection preparation', async () => {
  const h = projectionHarness()
  const row = projectedRows(1)[0]
  h.apply(await h.prepare([row]))
  const writes = await h.prepare([{ ...row, subjectTitle: 'Changed' }])
  await assert.rejects(writes.validate({ get: async path => ({ id: path.split('/').at(-1), data: () => ({
    ...h.documents.get(path), registrarPlot: { version: 1, revisionId: 'concurrent-plot', savedBy: 'registrar', assignments: [] },
  }) }) }), /Room assignments changed/)
})

test('TBA preserves rooms assigned before Registrar metadata existed and an explicit clear stays cleared', async () => {
  const h = projectionHarness()
  const assigned = { ...projectedRows(1)[0], sourceKey: 'template-class', status: 'Plot' }
  h.apply(await h.prepare([assigned]))
  const tba = { ...assigned, status: 'Draft', f2fRoom: { lec: ['TBA'], lab: [] },
    meetings: assigned.meetings.map(meeting => ({ ...meeting, roomId: '', room: 'TBA', buildingId: '' })) }
  h.apply(await h.prepare([tba]))
  const saved = [...h.documents.values()][0]
  assert.equal(saved.meetings[0].roomId, 'room-201')
  assert.equal(saved.status, 'Plot')
  saved.registrarPlot = { version: 1, revisionId: 'cleared', savedBy: 'registrar', assignments: [] }
  saved.meetings = tba.meetings
  h.apply(await h.prepare([tba]))
  assert.equal([...h.documents.values()][0].meetings[0].roomId, '')
  assert.equal([...h.documents.values()][0].status, 'Draft')
})

test('removing a Rooms & Labs assignment clears its workbook room on the next Save', async () => {
  const h = projectionHarness()
  const assigned = { ...projectedRows(1)[0], sourceKey: 'template-class', roomSourceSheet: 'Rooms & Labs', status: 'Draft' }
  h.apply(await h.prepare([assigned]))
  const cleared = { ...assigned, f2fRoom: { lec: ['TBA'], lab: [] },
    meetings: assigned.meetings.map(meeting => ({ ...meeting, roomId: '', room: 'TBA', buildingId: '' })) }
  h.apply(await h.prepare([cleared]))
  const saved = [...h.documents.values()][0]
  assert.equal(saved.meetings[0].roomId, '')
  assert.equal(saved.meetings[0].room, 'TBA')
})

test('refreshing links and validation for 26 rows updates the projection without inventing schedule edits', async () => {
  const h = projectionHarness()
  const original = projectedRows(26)
  h.apply(await h.prepare(original))
  const resolved = original.map(row => ({ ...row, parallelSourceRow: 2, validationIssues: [],
    meetings: row.meetings.map(meeting => ({ ...meeting, instructorId: 'accepted-instructor', roomId: 'resolved-room-id' })),
  }))
  const writes = await h.prepare(resolved)
  assert.equal(writes.count, 26, 'resolved references must still be saved')
  assert.equal(writes.audit.updated, 0)
  assert.equal(writes.audit.samples.length, 0)
  assert.equal(writes.audit.omittedSamples, 0)
  h.apply(writes)
  assert.equal([...h.documents.values()][0].meetings[0].instructorId, 'accepted-instructor')
  assert.equal((await h.prepare(resolved)).count, 0)
})

test('one room edit amid directory recalculations counts one schedule and one field change', async () => {
  const h = projectionHarness()
  const original = projectedRows(26)
  h.apply(await h.prepare(original))
  const edited = original.map((row, index) => ({ ...row,
    f2fRoom: index === 7 ? { lec: ['PTC 403'], lab: [] } : row.f2fRoom,
    rawValues: index === 7 ? ['IT', 'PTC 403'] : row.rawValues,
    validationIssues: [], meetings: row.meetings.map(meeting => ({ ...meeting, instructorId: 'accepted-instructor',
      ...(index === 7 ? { room: 'PTC 403', roomId: 'room-403' } : {}),
    })),
  }))
  const writes = await h.prepare(edited)
  assert.equal(writes.count, 26)
  assert.equal(writes.audit.updated, 1)
  assert.equal(writes.audit.samples.length, 1)
  assert.equal(writes.audit.samples[0].location, 'Row 9')
  assert.match(writes.audit.samples[0].field, /Rooms$/)
  assert.match(writes.audit.samples[0].before, /PTC 201/)
  assert.match(writes.audit.samples[0].after, /PTC 403/)
  const before = fixture(), after = fixture()
  after.workbook.Sheets.First.A1.v = 'PTC 403'
  const audit = await describe(before, after, { schedules: writes.audit })
  assert.equal(audit.counts.cellsChanged, 1)
  assert.equal(audit.counts.schedulesUpdated, 1)
  assert.equal(audit.samples.filter(sample => sample.kind === 'schedule').length, 1)
})
