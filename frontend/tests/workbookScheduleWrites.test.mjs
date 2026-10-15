import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const term = { departmentId: 'dept', departmentCode: 'CITE', academicYearId: 'year', academicYear: '2026-2027', semester: 'sem1', membershipId: 'member' }
const sourceWorkbook = 'departments/dept/workbooks/2026-2027/semesters/sem1'
const id = `workbook_${encodeURIComponent(JSON.stringify(['dept', 'year', 'sem1', 'Schedule', 3]))}`

function harness(previous) {
  const modules = new Map()
  const firestore = {
    collection: (_db, name) => name, query: (collection) => collection, where: () => null,
    doc: (_db, collection, id) => `${collection}/${id}`, serverTimestamp: () => 'now',
    getDocs: async collection => ({ docs: (Array.isArray(previous) ? previous : previous ? [previous] : []).map(data => ({ id: data.id ?? id, ref: `${collection}/${data.id ?? id}`, data: () => data })) }),
  }
  const load = file => {
    if (modules.has(file)) return modules.get(file)
    const context = { exports: {}, require: name => {
      if (name === 'firebase/firestore') return firestore
      if (name === '../firebase') return { db: {} }
      return load(resolve(dirname(file), name.endsWith('.ts') ? name : `${name}.ts`))
    } }
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText, context)
    modules.set(file, context.exports)
    return context.exports
  }
  return { service: load(resolve(root, 'services/workbookScheduleWrites.ts')), plotting: load(resolve(root, 'utils/schedulePlotting.ts')) }
}

const meeting = { format: 'Lec', faculty: 'Teacher', time: '07:30-09:00', day: 'Mon', room: 'PTC 201', startTime: '07:30', endTime: '09:00', days: ['Mon'], instructorId: 'teacher', roomId: 'room1', buildingId: 'ptc' }
const row = { status: 'Draft', sourceSheet: 'Schedule', sourceRow: 3, yearLevel: 1, college: 'CITE', subjectArea: '', subjectCode: 'ITE 101', subjectTitle: 'Computing', course: 'BSIT', classSection: '1',
  units: { lec: 2, lab: 0, total: 2 }, hours: { lec: 2, lab: 0, total: 2 }, maxStudents: 40,
  faculty: { lec: ['Teacher'], lab: [] }, f2fTime: { lec: ['07:30-09:00'], lab: [] }, f2fDays: { lec: ['Mon'], lab: [] }, f2fRoom: { lec: ['PTC 201'], lab: [] },
  rawValues: ['CITE', '', 'ITE 101', 'Computing', 'BSIT', '2', '0', '2', '2', '0', '2', '40', '1', 'Teacher', '', '07:30-09:00', '', 'Mon', '', 'PTC 201', ''], meetings: [meeting], parallelSourceRow: null, validationIssues: [] }

test('unchanged plotted row preserves its status, room and Registrar metadata on workbook Save', async () => {
  const initial = harness()
  const previous = { ...row, id, status: 'Plot', createdAt: 'original',
    registrarPlot: { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [{ key: initial.plotting.plotMeetingKey(meeting), roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' }] } }
  const { service } = harness(previous)
  const source = row
  const prepared = await service.prepareWorkbookScheduleWrites(term, [source], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const writes = []
  prepared.apply({ set: (path, data) => writes.push({ path, data }), delete: () => assert.fail('Should retain the schedule row') }, 2, 'workbook2', 'dean')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].path, `schedules/${id}`)
  assert.equal(writes[0].data.status, 'Plot')
  assert.equal(writes[0].data.meetings[0].roomId, 'room1')
  assert.equal(writes[0].data.registrarPlot.revisionId, 'plot1')
  assert.equal(writes[0].data.createdAt, 'original')
})

test('compact workbook room clears remove existing assignments, including Registrar-plotted rooms', async () => {
  const initial = harness()
  const plot = { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [{ key: initial.plotting.plotMeetingKey(meeting), roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' }] }
  for (const registrarPlot of [undefined, plot]) {
    const previous = { ...row, id, status: 'Plot', createdAt: 'original', ...(registrarPlot ? { registrarPlot } : {}) }
    const { service } = harness(previous)
    const source = { ...row, rawValues: row.rawValues.map((value, column) => column === 19 ? '' : value), f2fRoom: { lec: ['TBA'], lab: [] },
      meetings: [{ ...meeting, roomId: '', room: 'TBA', buildingId: '' }], validationIssues: ['Room allocation is pending.'] }
    const prepared = await service.prepareWorkbookScheduleWrites(term, [source], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
    const writes = []
    prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 2, 'workbook2', 'dean')
    assert.equal(writes.length, 1)
    const saved = writes[0]
    assert.equal(saved.status, 'Draft')
    assert.equal(saved.roomId, '')
    assert.equal(saved.buildingId, '')
    assert.equal(saved.roomIds.length, 0)
    assert.equal(saved.meetings[0].roomId, '')
    assert.equal(saved.meetings[0].room, 'TBA')
    assert.equal(saved.f2fRoom.lec[0], 'TBA')
    assert.ok(saved.validationIssues.includes('Room allocation is pending.'))
    assert.equal(saved.registrarPlot?.assignments.length ?? 0, 0)
  }
})

test('clearing one compact workbook room keeps the other meeting and its Registrar assignment', async () => {
  const initial = harness()
  const lab = { ...meeting, format: 'Lab', roomId: 'room2', room: 'PTC 202' }
  const previous = { ...row, meetings: [meeting, lab], registrarPlot: { version: 1, revisionId: 'plot1', savedBy: 'registrar',
    assignments: [meeting, lab].map(m => ({ key: initial.plotting.plotMeetingKey(m), roomId: m.roomId, room: m.room, buildingId: m.buildingId })) } }
  const { service } = harness(previous)
  const source = { ...row, rawValues: row.rawValues.map((value, column) => column === 19 ? '' : value), meetings: [{ ...meeting, roomId: '', room: 'TBA', buildingId: '' }, lab] }
  const prepared = await service.prepareWorkbookScheduleWrites(term, [source], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const writes = []
  prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 2, 'workbook2', 'dean')
  assert.equal(writes[0].meetings[0].roomId, '')
  assert.equal(writes[0].meetings[1].roomId, 'room2')
  assert.deepEqual(Array.from(writes[0].roomIds), ['room2'])
  assert.equal(writes[0].registrarPlot.assignments.length, 1)
  assert.equal(writes[0].registrarPlot.assignments[0].roomId, 'room2')
})

test('Draft override saves a new row with an assigned room without removing its room ID', async () => {
  const { service } = harness()
  const prepared = await service.prepareWorkbookScheduleWrites(term, [row], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const writes = []
  prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 1, 'workbook1', 'dean')
  assert.equal(writes[0].status, 'Draft')
  assert.equal(writes[0].meetings[0].roomId, 'room1')
})

test('other workbook callers retain their existing Plot behavior when no override is provided', async () => {
  const { service } = harness()
  const prepared = await service.prepareWorkbookScheduleWrites(term, [{ ...row, status: 'Plot' }], sourceWorkbook, [sourceWorkbook])
  const writes = []
  prepared.apply({ set: (path, data) => writes.push({ path, data }), delete: () => assert.fail() }, 1, 'workbook1', 'dean')
  assert.equal(writes[0].path, `schedule/${id}`)
  assert.equal(writes[0].data.status, 'Plot')
})

test('editing any schedule cell, effective course or year resets its Plot approval to Draft', async () => {
  const { service } = harness({ ...row, id, status: 'Plot' })
  const edited = row.rawValues.map((_, column) => ({ ...row, rawValues: row.rawValues.map((value, index) => index === column ? `${value} edited` : value) }))
  edited.push({ ...row, yearLevel: 2 }, { ...row, course: 'BITE' })
  for (const source of edited) {
    const prepared = await service.prepareWorkbookScheduleWrites(term, [source], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
    const writes = []
    prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 2, 'workbook2', 'dean')
    assert.equal(writes[0].status, 'Draft')
  }
})

test('saving an edited Plot row leaves other Plot and Draft rows unchanged; copied rows start Draft', async () => {
  const rows = [row, { ...row, sourceRow: 4 }, { ...row, sourceRow: 5 }]
  const initial = await harness().service.prepareWorkbookScheduleWrites(term, rows, sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const baseline = []
  initial.apply({ set: (path, data) => baseline.push(data), delete: () => assert.fail() }, 1, 'workbook1', 'dean')
  baseline[0].status = 'Plot'
  baseline[1].status = 'Plot'
  const { service } = harness(baseline)
  const source = [{ ...rows[0], subjectTitle: 'Edited title', rawValues: row.rawValues.map((value, column) => column === 3 ? 'Edited title' : value) }, rows[1], rows[2], { ...row, sourceRow: 6 }]
  const prepared = await service.prepareWorkbookScheduleWrites(term, source, sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const writes = []
  prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 2, 'workbook2', 'dean')
  assert.equal(writes.length, 2)
  assert.equal(writes.find(data => data.sourceRow === 3).status, 'Draft')
  assert.equal(writes.find(data => data.sourceRow === 6).status, 'Draft')
  assert.equal(baseline[1].status, 'Plot')
  assert.equal(baseline[2].status, 'Draft')
})

test('presentation and recalculated directory changes do not reset Plot approval', async () => {
  const { service } = harness({ ...row, id, status: 'Plot', orderIndex: 9 })
  const source = { ...row, meetings: [{ ...meeting, instructorId: 'resolved-teacher' }], validationIssues: ['Updated directory warning'] }
  const prepared = await service.prepareWorkbookScheduleWrites(term, [source], sourceWorkbook, [sourceWorkbook], 'schedules', 'Draft')
  const writes = []
  prepared.apply({ set: (path, data) => writes.push(data), delete: () => assert.fail() }, 2, 'workbook2', 'dean')
  assert.equal(writes[0].status, 'Plot')
})
