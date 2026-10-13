import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'
import { formatUserName } from '../src/utils/userName.ts'
import { scheduleMeetingRecords } from '../src/utils/scheduleMeetings.ts'
import { roomScheduleSection } from '../src/utils/roomSchedule.ts'
import * as scheduleReporting from '../src/utils/scheduleReporting.ts'

// Exercise actual page row builders, filters and download handlers without Firebase.
const asts = new Map()
function ast(path) {
  if (!asts.has(path)) asts.set(path, ts.createSourceFile(path, readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  return asts.get(path)
}
function evaluate(path, name, context) {
  const source = ast(path)
  let expression, declaration
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) expression = node.initializer
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(expression || declaration, `Missing ${path}:${name}`)
  const code = expression ? `module.exports = ${expression.getText(source)}` : `${declaration.getText(source).replace(/^export /, '')}\nmodule.exports = ${name}`
  context.module = { exports: undefined }
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
  return context.module.exports
}
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const createdAt = now.toISOString()
function fixtures() {
  const users = [
    { id: 'u1', firstName: 'José', surname: 'De la Cruz', email: 'jose@example.com', isActive: true, isVerify: true },
    { id: 'u2', firstName: 'Mia', surname: 'Santos', email: 'mia@example.com', isActive: false },
  ]
  const memberships = [
    { id: 'm1', userId: 'u1', email: users[0].email, department: 'CITE', role: 'Instructor', status: 'accepted', joinedAt: createdAt },
    { id: 'm2', userId: 'u2', email: users[1].email, department: 'CITE', role: 'Program Head', status: 'accepted', joinedAt: createdAt },
    { id: 'pending', email: 'pending@example.com', department: 'CAS', role: 'Program Head', status: 'pending', createdAt },
    { id: 'expired', email: 'expired@example.com', department: 'CITE', role: 'Instructor', status: 'pending', createdAt },
  ]
  const rooms = [
    { id: 'r1', buildingId: 'b1', name: 'Room "A", East', code: 'CMA 401', type: 'Lecture', floor: 0, capacity: 40, status: 'Available', createdAt, amenities: ['WiFi', 'AC', 'Board', 'Projector'], availableDays: ['Monday', 'Tuesday'], startTime: '07:30', endTime: '18:00' },
    { id: 'r2', buildingId: 'b1', name: 'Lab', code: 'CMA 402', type: 'Laboratory', floor: 2, capacity: 0, status: 'Maintenance', createdAt: '2000-01-01' },
    { id: 'r3', name: 'Unassigned room', createdAt },
  ]
  const reservations = [
    { id: 'saved-department', userId: 'u1', roomId: 'r1', department: 'CAS', date: today, startTime: '09:00', endTime: '09:30', duration: 30, attendees: 12, purpose: 'Team, "meeting"\nJosé', subjectCode: '', classSection: ' ', status: 'Pending', createdAt },
    { id: 'populated', userId: 'u2', roomId: 'r2', department: 'CITE', date: today, startTime: '09:00', endTime: '10:15', duration: 75, attendees: 1, purpose: 'Training', subjectCode: 'ITE 310', classSection: '2BSIT - 1', status: 'Approved', createdAt },
    { id: 'old', userId: 'u1', department: 'CAS', date: '2000-01-01', status: 'Declined', createdAt: '2000-01-01' },
    { id: 'legacy', userId: 'u1', roomId: 'r1', date: today, startTime: '10:30', endTime: '11:00', status: 'Pending', createdAt },
  ]
  const schedules = scheduleMeetingRecords([
    { id: 'workbook', data: () => ({ source: 'workbook', schemaVersion: 2, department: 'CAS', course: '2BSIT', classSection: '1', subjectCode: 'ITE 310', subjectTitle: 'Research, "methods"', academicYear: '2026 - 2027', semesterKey: 'sem1', status: 'Plot', createdAt, meetings: [
      { format: 'Lec', instructorId: 'm1', roomId: 'r1', startTime: '07:30', endTime: '09:00', days: ['Monday', 'Tue'] },
      { format: 'Lab', faculty: 'Unregistered Faculty', roomId: 'r2', room: 'Saved Lab', time: 'TBA', startTime: '', endTime: '', days: ['Wednesday'] },
    ] }) },
    { id: 'legacy-split', data: () => ({ department: 'CITE', subjectCode: 'ITE 083', academicYear: '2026 - 2027', semester: '1st Semester', status: 'Draft', createdAt, format: 'Lec', format2: 'Lab', startTime: '07:30', endTime: '09:00', startTime2: '13:00', endTime2: '14:30', roomId: 'r1', roomId2: 'r2', instructorId: 'm1', instructorId2: 'm2', days: ['Mon', 'Fri'] }) },
    { id: 'other-term', data: () => ({ department: 'CAS', source: 'workbook', schemaVersion: 2, subjectCode: 'OTHER', academicYear: '2026 - 2027', semesterKey: 'sem2', status: 'Draft', createdAt, meetings: [{ format: 'Lec', roomId: '', room: 'TBA' }] }) },
  ])
  return { users, memberships, rooms, reservations, schedules, buildings: [{ id: 'b1', name: 'College, "North"', code: 'CMA' }], invitations: [{ membershipId: 'pending', email: 'pending@example.com', status: 'pending', expiresAt: '2099-01-01' }] }
}
function browser() {
  const events = [], timers = []
  let blob, filename
  const link = { href: '', download: '', click() { events.push('click'); filename = this.download }, remove() { events.push('remove') } }
  const context = {
    Blob,
    URL: { createObjectURL(value) { blob = value; return 'blob:test' }, revokeObjectURL() { events.push('revoke') } },
    document: { createElement: () => link, body: { appendChild() { events.push('append') } } },
    setTimeout: callback => timers.push(callback),
  }
  return {
    download: evaluate('utils/reportCsv.ts', 'downloadReportCsv', context),
    async result() {
      assert.deepEqual(events, ['append', 'click', 'remove'])
      assert.equal(timers.length, 1)
      const bytes = new Uint8Array(await blob.arrayBuffer())
      assert.deepEqual(Array.from(bytes.slice(0, 3)), [239, 187, 191])
      const workbook = XLSX.read(bytes, { type: 'array', raw: true })
      const table = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: true })
      assert(table.every(row => row.length === table[0].length), 'Headers and data must have the same number of columns')
      timers[0]()
      assert.equal(events.at(-1), 'revoke')
      return { filename, headers: table[0], rows: table.slice(1), records: table.slice(1).map(row => Object.fromEntries(table[0].map((header, index) => [header, row[index]]))) }
    },
  }
}
function setup(page, kind, options = {}) {
  const path = `pages/tabs/${page}.tsx`
  const download = browser()
  const data = { ...fixtures(), ...options.data }
  const context = { Date, ...data, ...scheduleReporting, formatUserName, roomScheduleSection, useMemo: callback => callback(), downloadReportCsv: download.download, isInvitationsLoading: false, invitationsError: null, departmentFilters: [], dateRangeStart: null, dateRangeEnd: null, dateRanges: [], statusFilters: [], academicYearFilters: [], semesterFilters: [], membershipStatusFilters: [], searchQuery: '', ...options.filters }
  for (const name of ['timestampToDate', 'dateStringToDate', 'formatReportDate', 'timeToMinutes', 'formatReportTime', 'reservationDurationMinutes']) context[name] = evaluate('utils/reportingData.ts', name, context)
  for (const [name, values] of [['roomById', data.rooms], ['buildingById', data.buildings], ['userById', data.users], ['memberById', data.memberships]]) context[name] = new Map(values.map(value => [value.id, value]))
  context.memberByUserId = new Map(data.memberships.filter(member => member.userId).map(member => [member.userId, member]))
  if (page === 'AnalyticsPage') {
    context.analyticsKind = kind
    for (const name of ['formatScheduleStatus', 'formatReservationStatus']) context[name] = evaluate(path, name, context)
    for (const name of ['pendingInvitations', 'pendingMembershipIds', 'pendingEmails', 'memberRecords', 'parentSchedules', 'scheduleMeetings', 'isInDateRange', 'matchesDepartment', 'reservationDepartment', 'matchingReservations', 'matchingRooms', 'matchingSchedules', 'matchingScheduleMeetings', 'matchingMembers']) context[name] = evaluate(path, name, context)
    context.export = evaluate(path, 'exportAnalyticsCsv', context)
  } else {
    context.reportKind = kind
    for (const name of ['REPORT_COLUMNS', 'ROOM_STATUS_ORDER', 'ROOM_STATUS_OPTIONS', 'MEMBER_ROLE_ORDER', 'MEMBERSHIP_STATUS_ORDER', 'MEMBER_STATUS_ORDER']) context[name] = evaluate(path, name, context)
    for (const name of ['getRoomStatusRank', 'formatTitleCase', 'getMemberDepartmentRank', 'getMemberRoleRank', 'getMembershipStatusRank', 'getMemberStatusRank', 'formatScheduleStatus', 'getScheduleStatusRank', 'getSemesterKey', 'getSemesterRank', 'formatSemester', 'formatScheduleType', 'formatScheduleFormat', 'formatScheduleDays', 'formatScheduleTime']) context[name] = evaluate(path, name, context)
    for (const name of ['unexpiredPendingInvitations', 'unexpiredPendingInvitationMembershipIds', 'unexpiredPendingInvitationEmails', 'scheduleReportRecords', 'scheduleReportById', 'departmentsByRoomId', 'reportRows', 'filteredRows']) context[name] = evaluate(path, name, context)
    context.export = evaluate(path, 'exportCsv', context)
  }
  return { context, async run() { context.export(); return download.result() } }
}

for (const page of ['AnalyticsPage', 'ReportsPage']) for (const kind of ['reservations', 'rooms', 'schedules', 'members']) {
  test(`${page} ${kind}: actual CSV download retains complete data and correct headers`, async () => {
    const state = setup(page, kind)
    const csv = await state.run()
    assert.match(csv.filename, new RegExp(kind + '.*\\.csv$'))
    const expected = page === 'ReportsPage' ? state.context.filteredRows.length : state.context[{ reservations: 'matchingReservations', rooms: 'matchingRooms', schedules: 'matchingScheduleMeetings', members: 'matchingMembers' }[kind]].length
    assert.equal(csv.rows.length, expected)
    if (kind === 'reservations') {
      const saved = csv.records.find(row => row.Reference === 'saved-department')
      assert(saved)
      assert.equal(saved.Department, 'CAS')
      assert.equal(saved.Purpose, 'Team, "meeting"\nJosé')
      assert.equal(saved['Subject code'], 'N/A')
      assert.equal(saved.Section, 'N/A')
      assert.equal(saved['Duration (minutes)'], '30')
      assert.equal(csv.records.find(row => row.Reference === 'populated')['Duration (minutes)'], '75')
      assert.equal(csv.records.find(row => row.Reference === 'legacy').Department, 'CITE')
    } else if (kind === 'rooms') {
      const room = csv.records.find(row => row.Code === 'CMA 401')
      assert.equal(room.Amenities, 'WiFi, AC, Board, Projector')
      assert.equal(room.Building, 'College, "North"')
      assert.equal(room['Available days'], 'Monday, Tuesday')
      assert.equal(csv.records.find(row => row.Code === 'CMA 402').Capacity, page === 'ReportsPage' ? '0 people' : '0')
    } else if (kind === 'schedules') {
      const meetings = csv.records.filter(row => row.Code === 'ITE 310')
      assert.equal(meetings.length, 2)
      assert.deepEqual(meetings.map(row => row.Format), ['Lec', 'Lab'])
      assert(meetings.every(row => row.Status === 'Plot'))
      assert.equal(meetings[0].Section, '2BSIT - 1')
      assert.equal(meetings[0].Instructor, 'De la Cruz, José')
      assert.equal(meetings[1].Instructor, 'Unregistered Faculty')
      assert.equal(meetings[1].Time, 'TBA')
      assert.equal(meetings[1].Days, 'Wed')
      assert.equal(csv.records.filter(row => row.Code === 'ITE 083').length, page === 'ReportsPage' ? 1 : 2)
    } else {
      assert.equal(csv.rows.length, 3)
      assert(csv.records.some(row => row.Member === 'De la Cruz, José'))
      assert(csv.records.some(row => row.Email === 'pending@example.com' && row.Status === 'Pending'))
      assert(csv.records.some(row => row.Email === 'mia@example.com' && row.Status === (page === 'ReportsPage' ? 'Deactivated — Email not verified' : 'Deactivated')))
      assert(!csv.records.some(row => row.Email === 'expired@example.com'))
    }
  })
  test(`${page} ${kind}: an empty selection exports headers without stale rows`, async () => {
    const state = setup(page, kind, { data: { reservations: [], rooms: [], schedules: [], memberships: [], users: [], invitations: [] } })
    const csv = await state.run()
    assert(csv.headers.length > 0)
    assert.equal(csv.rows.length, 0)
  })
}

for (const page of ['AnalyticsPage', 'ReportsPage']) test(`${page} reservations: department/date filters use the booking's saved department`, async () => {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const state = setup(page, 'reservations', { filters: { departmentFilters: ['CAS'], dateRanges: ['7'], dateRangeStart: cutoff, dateRangeEnd: tomorrow } })
  const csv = await state.run()
  assert.deepEqual(csv.records.map(row => row.Reference), ['saved-department'])
})

for (const page of ['AnalyticsPage', 'ReportsPage']) test(`${page} rooms: department filter includes secondary lecture/lab assignments`, async () => {
  const csv = await setup(page, 'rooms', { filters: { departmentFilters: ['CAS'] } }).run()
  assert.deepEqual(csv.records.map(row => row.Code).sort(), ['CMA 401', 'CMA 402'])
})

test('Reports schedules: status, academic year, semester key and search filters keep both workbook meetings', async () => {
  const csv = await setup('ReportsPage', 'schedules', { filters: { departmentFilters: ['CAS'], academicYearFilters: ['2026 - 2027'], semesterFilters: ['first'], statusFilters: ['Plot'], searchQuery: 'ITE 310' } }).run()
  assert.equal(csv.rows.length, 2)
  assert(csv.records.every(row => row.Code === 'ITE 310' && row.Semester === '1st Sem' && row.Status === 'Plot'))
})

test('Reports members: membership, account status, department and search filters match exported records', async () => {
  const csv = await setup('ReportsPage', 'members', { filters: { departmentFilters: ['CITE'], membershipStatusFilters: ['Accepted'], statusFilters: ['Deactivated'], searchQuery: 'Santos' } }).run()
  assert.equal(csv.rows.length, 1)
  assert.equal(csv.records[0].Email, 'mia@example.com')
})

for (const page of ['AnalyticsPage', 'ReportsPage']) test(`${page} rooms: date filters exclude old inventory without changing floor or capacity zeroes`, async () => {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const csv = await setup(page, 'rooms', { filters: { dateRanges: ['7'], dateRangeStart: cutoff, dateRangeEnd: tomorrow } }).run()
  assert.equal(csv.rows.length, 2)
  assert(!csv.records.some(row => row.Code === 'CMA 402'))
  assert.equal(csv.records.find(row => row.Code === 'CMA 401').Floor, page === 'ReportsPage' ? 'Floor 0' : '0')
})
