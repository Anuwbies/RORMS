import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
function harness() {
  const documents = new Map([
    ['users/registrar', { isActive: true }],
    ['memberships/manager', { userId: 'registrar', status: 'accepted', role: 'Registrar' }],
    ['academicYears/year', { academicYear: '2026-2027', sem1: { phase: 'Plotting' } }],
    ['rooms/room1', { code: 'PTC 201', name: 'Room 201', status: 'Available', buildingId: 'ptc',
      availableDays: ['Monday', 'Wednesday'], startTime: '07:30', endTime: '19:30', capacity: 40 }],
    ['rooms/room2', { code: 'PTC 202', name: 'Room 202', status: 'Available', buildingId: 'ptc',
      availableDays: ['Monday', 'Wednesday'], startTime: '07:30', endTime: '19:30', capacity: 40 }],
  ])
  const snapshot = path => ({ id: path.split('/').at(-1), exists: () => documents.has(path), data: () => documents.get(path) })
  const modules = new Map()
  const firestore = {
    collection: (_db, path) => path, doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => 'now',
    getDocs: async path => ({ docs: [...documents.keys()].filter(key => key.startsWith(`${path}/`)).map(snapshot) }),
    runTransaction: async (_db, callback) => {
      const updates = []
      await callback({ get: async path => snapshot(path), update: (path, data) => updates.push([path, data]) })
      for (const [path, data] of updates) documents.set(path, { ...documents.get(path), ...data })
    },
  }
  const load = file => {
    if (modules.has(file)) return modules.get(file)
    const context = { exports: {}, crypto: { randomUUID: () => 'plot-revision' }, require: name => {
      if (name === 'firebase/firestore') return firestore
      if (name === '../firebase') return { db: {}, auth: { currentUser: { uid: 'registrar' } } }
      return load(resolve(dirname(file), name.endsWith('.ts') ? name : `${name}.ts`))
    } }
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText, context)
    modules.set(file, context.exports)
    return context.exports
  }
  const service = load(resolve(root, 'services/plotScheduleRooms.ts'))
  const plotting = load(resolve(root, 'utils/schedulePlotting.ts'))
  const meeting = (changes = {}) => ({ format: 'Flexible', modality: 'F2F', faculty: 'Teacher', time: '07:30-09:00', day: 'Mon',
    startTime: '07:30', endTime: '09:00', days: ['Mon'], instructorId: 'instructor', roomId: '', room: 'TBA', buildingId: '', ...changes })
  const schedule = (changes = {}) => ({ source: 'workbook', schemaVersion: 2, department: 'CITE', academicYearId: 'year', semesterKey: 'sem1',
    subjectCode: 'ITE 314', status: 'Draft', workbookRevisionId: 'workbook-1', maxStudents: 30, meetings: [meeting()], ...changes })
  const assignment = (scheduleId = 'class1', index = 0, roomId = 'room1') => {
    const data = documents.get(`schedule/${scheduleId}`)
    return { scheduleId, meetingKey: plotting.plotMeetingKey(data.meetings[index]), roomId, expectedRoomId: data.meetings[index].roomId,
      expectedRevision: plotting.plotScheduleRevision(data) }
  }
  const plot = assignments => service.plotScheduleRooms({ membershipId: 'manager', departmentCode: 'CITE', academicYearId: 'year', academicYear: '2026-2027',
    semester: '1st Semester', instructorIds: ['instructor'], assignments })
  documents.set('schedule/class1', schedule())
  return { documents, meeting, schedule, assignment, plot, plotting }
}

test('Plot saves meeting rooms, summary fields and status; clearing returns the class to Draft', async () => {
  const h = harness()
  await h.plot([h.assignment()])
  let saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Plot')
  assert.equal(saved.roomId, 'room1')
  assert.equal(saved.roomIds.join(','), 'room1')
  assert.equal(saved.meetings[0].room, 'PTC 201')
  assert.equal(saved.f2fRoom.flexible[0], 'PTC 201')
  assert.equal(saved.registrarPlot.assignments[0].key, h.plotting.plotMeetingKey(saved.meetings[0]))
  await h.plot([h.assignment('class1', 0, '')])
  saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Draft')
  assert.equal(saved.meetings[0].room, 'TBA')
  assert.equal(saved.roomIds.length, 0)
})

test('partial plotting stays Draft and duplicate cards target the meeting rather than its display slot', async () => {
  const h = harness()
  h.documents.set('schedule/class1', h.schedule({ meetings: [h.meeting(), h.meeting({ days: ['Wed'], day: 'Wed' })] }))
  await h.plot([h.assignment('class1', 1)])
  const saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Draft')
  assert.equal(saved.meetings[0].roomId, '')
  assert.equal(saved.meetings[1].roomId, 'room1')
})

test('adjacent meetings of one class can be plotted into different rooms', async () => {
  const h = harness()
  h.documents.set('schedule/class1', h.schedule({ meetings: [
    h.meeting(),
    h.meeting({ time: '09:00-10:30', startTime: '09:00', endTime: '10:30' }),
  ] }))
  assert.notEqual(h.assignment('class1', 0).meetingKey, h.assignment('class1', 1).meetingKey)
  await h.plot([h.assignment('class1', 0, 'room1'), h.assignment('class1', 1, 'room2')])
  const saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Plot')
  assert.equal(saved.meetings[0].roomId, 'room1')
  assert.equal(saved.meetings[1].roomId, 'room2')
  assert.equal(saved.roomIds.join(','), 'room1,room2')
})

test('Plot rejects cross-department overlaps but permits adjacent classes and another term', async () => {
  const h = harness()
  h.documents.set('schedule/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'room1', startTime: '08:00' })] }))
  await assert.rejects(h.plot([h.assignment()]), /overlaps/)
  assert.equal(h.documents.get('schedule/class1').meetings[0].roomId, '')
  h.documents.set('schedule/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'room1', startTime: '09:00', endTime: '10:30' })] }))
  await h.plot([h.assignment()])
  h.documents.set('schedule/class1', h.schedule())
  h.documents.set('schedule/other', h.schedule({ semesterKey: 'sem2', meetings: [h.meeting({ roomId: 'room1' })] }))
  await h.plot([h.assignment()])
})

test('Plot validates rooms, stale selections and current role/phase before any write', async () => {
  for (const [path, changes, error] of [
    ['rooms/room1', { status: 'Maintenance' }, /not available/],
    ['rooms/room1', { availableDays: ['Friday'] }, /days or hours/],
    ['rooms/room1', { endTime: '08:00' }, /days or hours/],
    ['rooms/room1', { capacity: 20 }, /capacity/],
    ['memberships/manager', { role: 'Instructor' }, /read only/],
    ['academicYears/year', { sem1: { phase: 'Ended' } }, /read only/],
    ['users/registrar', { isActive: false }, /read only/],
  ]) {
    const h = harness()
    h.documents.set(path, { ...h.documents.get(path), ...changes })
    await assert.rejects(h.plot([h.assignment()]), error)
    assert.equal(h.documents.get('schedule/class1').meetings[0].roomId, '')
  }
  const h = harness()
  const selection = h.assignment()
  h.documents.get('schedule/class1').workbookRevisionId = 'changed'
  await assert.rejects(h.plot([selection]), /meeting changed/)
  h.documents.delete('schedule/class1')
  await assert.rejects(h.plot([selection]), /removed/)
})

test('one conflicting selection rejects the entire Plot operation', async () => {
  const h = harness()
  h.documents.set('schedule/class2', h.schedule({ subjectCode: 'ITE 083' }))
  await assert.rejects(h.plot([h.assignment(), h.assignment('class2')]), /overlaps/)
  assert.equal(h.documents.get('schedule/class1').meetings[0].roomId, '')
  assert.equal(h.documents.get('schedule/class2').meetings[0].roomId, '')
})
