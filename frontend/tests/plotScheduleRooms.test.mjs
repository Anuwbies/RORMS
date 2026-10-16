import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
function harness(scheduleCollection = 'schedule') {
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
      if (name === './scheduleRoomWorkbookSync') return { prepareScheduleRoomWorkbookSync: async () => ({ read: async () => ({
        updateRow: (_id, _meetings) => ({ rawValues: Array(21).fill(''), workbookRow: 3, workbookSheetId: 'sheet_0' }), apply: () => {},
      }) }) }
      return load(resolve(dirname(file), name.endsWith('.ts') ? name : `${name}.ts`))
    } }
    vm.runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText, context)
    modules.set(file, context.exports)
    return context.exports
  }
  const service = load(resolve(root, 'services/plotScheduleRooms.ts'))
  const plotting = load(resolve(root, 'utils/schedulePlotting.ts'))
  const meeting = (changes = {}) => ({ format: 'Flexible', modality: 'F2F', faculty: 'Teacher', time: '07:30-09:00', day: 'Mon',
    startTime: '07:30', endTime: '09:00', days: ['Mon'], instructorId: 'instructor', roomId: '', room: scheduleCollection === 'schedules' ? '' : 'TBA', buildingId: '', ...changes })
  const schedule = (changes = {}) => {
    const data = { source: 'workbook', schemaVersion: 2, department: 'CITE', departmentId: 'dept', sourceWorkbook: 'departments/dept/workbooks/2026-2027/semesters/sem1', sourceSheet: 'Schedule', sourceRow: 3, rawValues: Array(21).fill(''), academicYearId: 'year', semesterKey: 'sem1',
      subjectCode: 'ITE 314', status: 'Draft', workbookRevisionId: 'workbook-1', maxStudents: 30, meetings: [meeting()], ...changes }
    if (scheduleCollection === 'schedules') data.providedRoomKeys = data.meetings.filter(item => item.room.trim() || item.roomId).map(plotting.plotMeetingKey)
    return data
  }
  const assignment = (scheduleId = 'class1', index = 0, roomId = 'room1') => {
    const data = documents.get(`${scheduleCollection}/${scheduleId}`)
    return { scheduleId, meetingKey: plotting.plotMeetingKey(data.meetings[index]), roomId, expectedRoomId: data.meetings[index].roomId,
      expectedRevision: plotting.plotScheduleRevision(data) }
  }
  const plot = assignments => service.plotScheduleRooms({ membershipId: 'manager', departmentCode: 'CITE', academicYearId: 'year', academicYear: '2026-2027',
    semester: '1st Semester', instructorIds: ['instructor'], assignments, scheduleCollection })
  documents.set(`${scheduleCollection}/class1`, schedule())
  return { documents, meeting, schedule, assignment, plot, plotting }
}

function parallelHarness(numbers = [203, 204, 403, 404]) {
  const h = harness('schedules')
  h.documents.delete('schedules/class1')
  for (const number of [203, 204, 205, 206, 403, 404]) h.documents.set(`rooms/be${number}`, {
    code: `BE ${number}`, name: `BE ${number}`, status: 'Available', buildingId: 'be',
    availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40,
  })
  numbers.forEach((number, index) => h.documents.set(`schedules/parallel${index}`, h.schedule({
    groupId: 'parallel1', subjectCode: 'ITE 083', classSection: String(index + 5), status: 'Plot', providedRoomKeys: [],
    meetings: [h.meeting({ roomId: `be${number}`, room: `BE ${number}`, buildingId: 'be' })],
  })))
  // These rooms originated from blank source cells and stay editable after Plot.
  numbers.forEach((_, index) => { h.documents.get(`schedules/parallel${index}`).providedRoomKeys = [] })
  return h
}

test('Plot rejects disconnected parallel rooms atomically using all saved peer rooms', async () => {
  const h = parallelHarness()
  const before = h.documents.get('schedules/parallel0')
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /Parallel classes must use separate, consecutive rooms/)
  assert.equal(h.documents.get('schedules/parallel0'), before)
  assert.equal(h.documents.get('schedules/parallel0').registrarPlot, undefined)
})

test('Plot accepts fixing the complete parallel chain together and reads peer floor metadata', async () => {
  const h = parallelHarness()
  await h.plot([{ ...h.assignment('parallel2', 0, 'be205'), targetStatus: 'Plot' }, { ...h.assignment('parallel3', 0, 'be206'), targetStatus: 'Plot' }])
  assert.equal(h.documents.get('schedules/parallel2').meetings[0].roomId, 'be205')
  assert.equal(h.documents.get('schedules/parallel3').meetings[0].roomId, 'be206')
  h.documents.get('rooms/be204').floor = 4
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /same building and floor/)
})

test('provided parallel rooms cannot be approved while disconnected but can return to Draft', async () => {
  const h = parallelHarness()
  const data = h.documents.get('schedules/parallel0')
  data.providedRoomKeys = data.meetings.map(h.plotting.plotMeetingKey)
  await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Draft' }])
  assert.equal(h.documents.get('schedules/parallel0').status, 'Draft')
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /Parallel classes must use/)
  assert.equal(h.documents.get('schedules/parallel0').status, 'Draft')
})

test('an unrelated disconnected parallel group does not prevent plotting an ordinary schedule', async () => {
  const h = parallelHarness()
  h.documents.set('schedules/ordinary', h.schedule({ subjectCode: 'ITE 100', meetings: [h.meeting({ days: ['Wed'], day: 'Wed' })] }))
  await h.plot([h.assignment('ordinary')])
  assert.equal(h.documents.get('schedules/ordinary').status, 'Plot')
})

test('Plot rejects assigning only one of four parallel rooms without any partial writes', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  for (let index = 0; index < 4; index++) {
    const data = h.documents.get(`schedules/parallel${index}`)
    data.status = 'Draft'
    data.meetings[0] = { ...data.meetings[0], roomId: '', room: '', buildingId: '' }
  }
  const before = h.documents.get('schedules/parallel0')
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /All 4 parallel sections.*1 of 4 rooms assigned/)
  assert.equal(h.documents.get('schedules/parallel0'), before)
  assert.equal(h.documents.get('schedules/parallel0').meetings[0].roomId, '')
  await h.plot([203, 204, 205, 206].map((number, index) => ({ ...h.assignment(`parallel${index}`, 0, `be${number}`), targetStatus: 'Plot' })))
  for (let index = 0; index < 4; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Plot')
})

test('provided parallel-room approval requires rooms for every section, including explicit TBA peers', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  for (let index = 0; index < 4; index++) {
    const data = h.documents.get(`schedules/parallel${index}`)
    data.status = 'Draft'
    if (index) data.meetings[0] = { ...data.meetings[0], roomId: '', room: 'TBA', buildingId: '' }
    data.providedRoomKeys = data.meetings.map(h.plotting.plotMeetingKey)
  }
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /All 4 parallel sections.*1 of 4 rooms assigned/)
  assert.equal(h.documents.get('schedules/parallel0').status, 'Draft')
})

test('three rooms cannot plot; the fourth connected room completes the group', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  const last = h.documents.get('schedules/parallel3')
  last.status = 'Draft'
  last.meetings[0] = { ...last.meetings[0], roomId: '', room: '', buildingId: '' }
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /3 of 4 rooms assigned/)
  await h.plot([{ ...h.assignment('parallel3', 0, 'be206'), targetStatus: 'Plot' }])
  assert.equal(h.documents.get('schedules/parallel3').meetings[0].roomId, 'be206')
})

test('parallel checkbox approval and return to Draft update all four rows atomically', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  for (let index = 0; index < 4; index++) {
    const data = h.documents.get(`schedules/parallel${index}`)
    data.status = 'Draft'
    data.providedRoomKeys = data.meetings.map(h.plotting.plotMeetingKey)
  }
  await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }])
  for (let index = 0; index < 4; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Plot')
  await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Draft' }])
  for (let index = 0; index < 4; index++) {
    const data = h.documents.get(`schedules/parallel${index}`)
    assert.equal(data.status, 'Draft')
    assert.equal(data.meetings[0].roomId, `be${203 + index}`)
  }
})

test('one-, two- and three-schedule parallel groups approve and return to Draft without requiring four', async () => {
  for (const count of [1, 2, 3]) {
    const h = parallelHarness([203, 204, 205].slice(0, count))
    for (let index = 0; index < count; index++) h.documents.get(`schedules/parallel${index}`).status = 'Draft'
    await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }])
    for (let index = 0; index < count; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Plot')
    await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Draft' }])
    for (let index = 0; index < count; index++) {
      assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Draft')
      assert.equal(h.documents.get(`schedules/parallel${index}`).meetings[0].roomId, `be${203 + index}`)
    }
  }
})

test('assigning the final room requires manual approval before Plot can save any parallel section', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  for (let index = 0; index < 4; index++) h.documents.get(`schedules/parallel${index}`).status = 'Draft'
  const last = h.documents.get('schedules/parallel3')
  last.meetings[0] = { ...last.meetings[0], roomId: '', room: '', buildingId: '' }
  await assert.rejects(h.plot([h.assignment('parallel3', 0, 'be206')]), /Check the completed parallel group checkbox/)
  for (let index = 0; index < 4; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Draft')
  assert.equal(h.documents.get('schedules/parallel3').meetings[0].roomId, '')
  await h.plot([{ ...h.assignment('parallel3', 0, 'be206'), targetStatus: 'Plot' }])
  for (let index = 0; index < 4; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Plot')
})

test('a conflict in any peer rejects the whole parallel checkbox approval', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  for (let index = 0; index < 4; index++) {
    const data = h.documents.get(`schedules/parallel${index}`)
    data.status = 'Draft'
    data.providedRoomKeys = data.meetings.map(h.plotting.plotMeetingKey)
  }
  h.documents.set('schedules/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'be206', room: 'BE 206' })] }))
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /overlaps/)
  for (let index = 0; index < 4; index++) assert.equal(h.documents.get(`schedules/parallel${index}`).status, 'Draft')
})

test('room removal cannot save an incomplete parallel group, but provided rooms can return to Draft', async () => {
  const h = parallelHarness([203, 204, 205, 206])
  await assert.rejects(h.plot([{ ...h.assignment('parallel3', 0, ''), targetStatus: 'Plot' }]), /3 of 4 rooms assigned/)
  assert.equal(h.documents.get('schedules/parallel3').meetings[0].roomId, 'be206')
  h.documents.delete('rooms/be206')
  await assert.rejects(h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Plot' }]), /selected room was removed/)
  const first = h.documents.get('schedules/parallel0')
  first.providedRoomKeys = first.meetings.map(h.plotting.plotMeetingKey)
  await h.plot([{ ...h.assignment('parallel0', 0, 'be203'), targetStatus: 'Draft' }])
  assert.equal(h.documents.get('schedules/parallel0').status, 'Draft')
  assert.equal(h.documents.get('schedules/parallel0').meetings[0].roomId, 'be203')
})

test('plots the new schedules collection and keeps a same-ID legacy record unchanged', async () => {
  const h = harness('schedules')
  const legacy = h.schedule({ subjectCode: 'LEGACY' })
  h.documents.set('schedule/class1', legacy)
  await h.plot([h.assignment()])
  const saved = h.documents.get('schedules/class1')
  assert.equal(saved.status, 'Plot')
  assert.equal(saved.meetings[0].roomId, 'room1')
  assert.equal(saved.meetings[0].room, 'Room 201')
  assert.equal(saved.registrarPlot.assignments[0].room, 'Room 201')
  assert.equal(saved.plottedMembershipId, 'manager')
  assert.equal(h.documents.get('schedule/class1'), legacy)
  await h.plot([h.assignment('class1', 0, '')])
  assert.equal(h.documents.get('schedules/class1').status, 'Draft')
})

test('approving an existing Draft room leaves it unchanged until Plot and then persists Plot status', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ meetings: [h.meeting({ roomId: 'room1', room: 'Room 201', buildingId: 'ptc' })] }))
  const saved = h.documents.get('schedules/class1')
  const staged = h.plotting.toggleAssignedSchedulePlot(new Map(), { ...saved, ...saved.meetings[0], id: 'class1', sourceScheduleId: 'class1' })
  assert.equal(saved.status, 'Draft')
  assert.equal(staged.size, 1)
  await h.plot([...staged.values()])
  const plotted = h.documents.get('schedules/class1')
  assert.equal(plotted.status, 'Plot')
  assert.equal(plotted.meetings[0].roomId, 'room1')
  assert.equal(plotted.meetings[0].room, 'Room 201')
  assert.equal(plotted.plottedMembershipId, 'manager')
})

test('provided rooms cannot be changed or cleared before or after Plot approval', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ meetings: [h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' })] }))
  for (const room of ['room2', '']) {
    await assert.rejects(h.plot([h.assignment('class1', 0, room)]), /room cannot be changed/)
    assert.equal(h.documents.get('schedules/class1').status, 'Draft')
    assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, 'room1')
  }
  await h.plot([h.assignment()])
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
  for (const room of ['room2', '']) await assert.rejects(h.plot([h.assignment('class1', 0, room)]), /room cannot be changed/)
  assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, 'room1')
  assert.equal(h.documents.get('schedules/class1').meetings[0].room, 'PTC 201')
})

test('provided-room checkbox can return Plot to Draft and approve it again without changing room fields', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ meetings: [h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' })] }))
  await h.plot([h.assignment()])
  const plotted = h.documents.get('schedules/class1')
  assert.ok(plotted.providedRoomKeys.includes(h.plotting.plotMeetingKey(plotted.meetings[0])))
  assert.equal(plotted.registrarPlot.providedRoomKeys, undefined)
  const staged = h.plotting.toggleAssignedSchedulePlot(new Map(), { ...plotted, ...plotted.meetings[0], id: 'class1', sourceScheduleId: 'class1' })
  assert.equal(plotted.status, 'Plot')
  await h.plot([...staged.values()])
  const draft = h.documents.get('schedules/class1')
  assert.equal(draft.status, 'Draft')
  assert.equal(JSON.stringify(draft.meetings), JSON.stringify(plotted.meetings))
  assert.equal(JSON.stringify(draft.f2fRoom), JSON.stringify(plotted.f2fRoom))
  assert.equal(JSON.stringify(draft.roomIds), JSON.stringify(plotted.roomIds))
  assert.equal(draft.roomId, 'room1')
  assert.equal(draft.registrarPlot.assignments[0].room, 'PTC 201')
  await h.plot([{ ...h.assignment(), targetStatus: 'Plot' }])
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
})

test('returning to Draft is allowed with existing conflicts or an unavailable room; approving again rechecks them', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ status: 'Plot', meetings: [h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' })] }))
  h.documents.set('schedules/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'room1', startTime: '08:00' })] }))
  h.documents.get('rooms/room1').status = 'Maintenance'
  await h.plot([{ ...h.assignment(), targetStatus: 'Draft' }])
  assert.equal(h.documents.get('schedules/class1').status, 'Draft')
  assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, 'room1')
  await assert.rejects(h.plot([{ ...h.assignment(), targetStatus: 'Plot' }]), /not available/)
  h.documents.get('rooms/room1').status = 'Available'
  await assert.rejects(h.plot([{ ...h.assignment(), targetStatus: 'Plot' }]), /overlaps/)
})

test('Registrar-selected rooms stay editable and their checkbox can return them to Draft', async () => {
  const h = harness('schedules')
  await h.plot([h.assignment()])
  assert.equal(h.documents.get('schedules/class1').providedRoomKeys.length, 0)
  assert.equal(h.documents.get('schedules/class1').registrarPlot.providedRoomKeys, undefined)
  await h.plot([h.assignment('class1', 0, 'room2')])
  assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, 'room2')
  await h.plot([{ ...h.assignment('class1', 0, 'room2'), targetStatus: 'Draft' }])
  assert.equal(h.documents.get('schedules/class1').status, 'Draft')
  assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, 'room2')
  await h.plot([{ ...h.assignment('class1', 0, 'room2'), targetStatus: 'Plot' }])
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
  assert.equal(h.documents.get('schedules/class1').providedRoomKeys.length, 0)
})

test('newly selected rooms support checkbox approval and clearing saves a blank room', async () => {
  const h = harness('schedules')
  await assert.rejects(h.plot([{ ...h.assignment('class1', 0, ''), targetStatus: 'Plot' }]), /Assign a room/)
  await h.plot([{ ...h.assignment(), targetStatus: 'Plot' }])
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
  await h.plot([h.assignment('class1', 0, '')])
  const saved = h.documents.get('schedules/class1')
  assert.equal(saved.status, 'Draft')
  assert.equal(saved.meetings[0].room, '')
  assert.equal(saved.meetings[0].roomId, '')
  assert.equal(saved.f2fRoom.flexible[0], '')
  assert.equal(saved.providedRoomKeys.length, 0)
})

test('Draft status toggles still reject stale revisions and unauthorized actors', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ status: 'Plot', meetings: [h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' })] }))
  const selection = { ...h.assignment(), targetStatus: 'Draft' }
  h.documents.get('schedules/class1').workbookRevisionId = 'newer'
  await assert.rejects(h.plot([selection]), /meeting changed/)
  h.documents.get('memberships/manager').role = 'Instructor'
  await assert.rejects(h.plot([{ ...h.assignment(), targetStatus: 'Draft' }]), /read only/)
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
})

test('combining an uncheck with a room change cannot bypass overlap validation', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ status: 'Plot', meetings: [
    h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' }),
    h.meeting({ days: ['Wed'], day: 'Wed' }),
  ] }))
  h.documents.set('schedules/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'room2', days: ['Wed'], day: 'Wed' })] }))
  await assert.rejects(h.plot([{ ...h.assignment(), targetStatus: 'Draft' }, h.assignment('class1', 1, 'room2')]), /overlaps/)
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
  assert.equal(h.documents.get('schedules/class1').meetings[1].roomId, '')
})

test('explicit workbook TBA is provided and cannot receive a room through Plot', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ meetings: [h.meeting({ room: 'TBA' })] }))
  const before = h.documents.get('schedules/class1')
  assert.ok(before.providedRoomKeys.includes(h.plotting.plotMeetingKey(before.meetings[0])))
  assert.equal(h.plotting.isProvidedScheduleRoom({ ...before, ...before.meetings[0], id: 'class1' }), true)
  await assert.rejects(h.plot([h.assignment()]), /room cannot be changed/)
  assert.equal(h.documents.get('schedules/class1'), before)
})

test('legacy Plot metadata that omitted TBA cannot permit assigning it a room', async () => {
  const h = harness('schedules')
  const data = h.schedule({ meetings: [h.meeting({ room: 'TBA' })], registrarPlot: {
    version: 1, revisionId: 'old', savedBy: 'registrar', assignments: [], providedRoomKeys: [],
  } })
  delete data.providedRoomKeys
  h.documents.set('schedules/class1', data)
  await assert.rejects(h.plot([h.assignment()]), /room cannot be changed/)
  assert.equal(h.documents.get('schedules/class1'), data)
})

test('Plot preserves source flags verbatim while blank room cells remain assignable', async () => {
  const h = harness('schedules')
  const keys = h.documents.get('schedules/class1').providedRoomKeys
  assert.equal(keys.length, 0)
  await h.plot([h.assignment()])
  const saved = h.documents.get('schedules/class1')
  assert.equal(saved.providedRoomKeys, keys)
  assert.equal(saved.registrarPlot.providedRoomKeys, undefined)
  assert.equal(h.plotting.isProvidedScheduleRoom({ ...saved, ...saved.meetings[0], id: 'class1' }), false)
})

test('older blank-room records need a workbook save to establish source provenance before assigning', async () => {
  const h = harness('schedules')
  delete h.documents.get('schedules/class1').providedRoomKeys
  await assert.rejects(h.plot([h.assignment()]), /Save this schedule from the department workbook first/)
  assert.equal(h.documents.get('schedules/class1').meetings[0].roomId, '')
  h.documents.get('schedules/class1').providedRoomKeys = []
  await h.plot([h.assignment()])
  assert.equal(h.documents.get('schedules/class1').status, 'Plot')
})

test('approving an existing room still rejects conflicts and stale revisions before changing status', async () => {
  const h = harness('schedules')
  h.documents.set('schedules/class1', h.schedule({ meetings: [h.meeting({ roomId: 'room1', room: 'PTC 201', buildingId: 'ptc' })] }))
  h.documents.set('schedules/other', h.schedule({ department: 'CAS', meetings: [h.meeting({ roomId: 'room1', startTime: '08:00' })] }))
  await assert.rejects(h.plot([h.assignment()]), /overlaps/)
  assert.equal(h.documents.get('schedules/class1').status, 'Draft')
  h.documents.delete('schedules/other')
  const selection = h.assignment()
  h.documents.get('schedules/class1').workbookRevisionId = 'newer'
  await assert.rejects(h.plot([selection]), /meeting changed/)
  assert.equal(h.documents.get('schedules/class1').status, 'Draft')
})

test('Plot saves meeting rooms, summary fields and status; clearing returns the class to Draft', async () => {
  const h = harness()
  await h.plot([h.assignment()])
  let saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Plot')
  assert.equal(saved.roomId, 'room1')
  assert.equal(saved.roomIds.join(','), 'room1')
  assert.equal(saved.meetings[0].room, 'Room 201')
  assert.equal(saved.f2fRoom.flexible[0], 'Room 201')
  assert.equal(saved.registrarPlot.assignments[0].key, h.plotting.plotMeetingKey(saved.meetings[0]))
  await h.plot([h.assignment('class1', 0, '')])
  saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Draft')
  assert.equal(saved.meetings[0].room, 'TBA')
  assert.equal(saved.roomIds.length, 0)
})

test('saving one meeting room changes the schedule to Plot; clearing its last assigned room returns it to Draft', async () => {
  const h = harness()
  h.documents.set('schedule/class1', h.schedule({ meetings: [h.meeting(), h.meeting({ days: ['Wed'], day: 'Wed' })], validationIssues: ['Room allocation is pending.'] }))
  await h.plot([h.assignment('class1', 1)])
  const saved = h.documents.get('schedule/class1')
  assert.equal(saved.status, 'Plot')
  assert.equal(saved.meetings[0].roomId, '')
  assert.equal(saved.meetings[1].roomId, 'room1')
  assert.ok(saved.validationIssues.includes('Room allocation is pending.'))
  const retained = h.plotting.retainRegistrarRooms(h.schedule({ meetings: [h.meeting(), h.meeting({ days: ['Wed'], day: 'Wed' })], validationIssues: ['Room allocation is pending.'] }), saved)
  assert.equal(retained.status, 'Plot')
  assert.equal(retained.meetings[1].roomId, 'room1')
  await h.plot([h.assignment('class1', 1, '')])
  assert.equal(h.documents.get('schedule/class1').status, 'Draft')
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
