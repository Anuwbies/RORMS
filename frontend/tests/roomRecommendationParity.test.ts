import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plotParallelRoomGroupRecommendations, plotRoomRecommendations } from '../src/utils/plotRoomRecommendations.ts'
import { schedulePlotSelectionKey, type PlotRoom } from '../src/utils/schedulePlotting.ts'
import { recommendParallelRoomGroups, recommendScheduleRooms } from '../src/utils/scheduleRoomRecommendations.ts'
import { departmentExternalRoomAssignments, isDraftOrPlotScheduleMeeting, type FacultySubjectAssignment } from '../src/utils/ScheduleValidation.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const rooms: PlotRoom[] = ['A', 'B', 'C'].map(id => ({
  id, code: `${id}101`, name: `${id} 101`, buildingId: 'main', status: 'Available', type: 'Lecture',
  capacity: 40, availableDays: ['Friday'], startTime: '07:30', endTime: '18:00',
}))

const target: FacultySubjectAssignment = {
  location: 'target', rowKey: 'target', departmentCode: 'CITE', college: 'LECTURE',
  code: 'ITE 101', section: '1', faculty: 'Teacher', instructorId: 'teacher',
  meetingKind: 'Lec', roomColumn: 19, roomEntryIndex: 0, roomId: 'A', room: 'A 101',
  days: ['Fri'], start: 450, end: 540, maxStudents: 30,
}

const meeting = (id: string, department: string, roomId: string, overrides: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord => ({
  id, sourceScheduleId: id, department, college: 'LECTURE', subjectCode: 'ITE 101', classSection: id,
  faculty: 'Teacher', instructorId: 'teacher', format: 'Lec', roomId, room: rooms.find(room => room.id === roomId)?.name ?? '',
  startTime: '07:30', endTime: '09:00', days: ['Fri'], maxStudents: 30, status: 'Draft',
  academicYearId: '2026-2027', semester: 'sem1', ...overrides,
})

test('Draft and Plot schedules with rooms block the same recommendations in both modals', () => {
  const external: FacultySubjectAssignment = { location: 'other', code: '', section: '', departmentCode: 'CBA',
    roomId: 'A', room: 'A 101', days: ['Fri'], start: 450, end: 540 }
  const workbook = recommendScheduleRooms([target], rooms, 'target', 19, 0, { externalRoomAssignments: [external] })
  const plotTarget = meeting('target', 'CITE', 'A')
  for (const status of ['Draft', 'Plot']) {
    const plotMeetings = [plotTarget, meeting('other', 'CBA', 'A', { status }),
      meeting('legacy', 'CBA', 'B', { status: 'Returned' }),
      meeting('other-term', 'CBA', 'B', { academicYearId: '2025-2026' }),
      meeting('unknown-term', 'CBA', 'B', { academicYearId: '', semester: '' })]
    const plotIds = plotRoomRecommendations(plotMeetings, rooms, [plotTarget]).get(schedulePlotSelectionKey(plotTarget)) ?? []
    assert.deepEqual(plotIds.map(id => rooms.find(room => room.id === id)!.name), workbook)
  }
})

test('external room assignments accept only the current Draft and Plot statuses', () => {
  const term = { departmentId: 'cite', departmentCode: 'CITE', academicYearId: '2026-2027',
    academicYear: '2026-2027', semester: 'sem1' as const, membershipId: 'member' }
  const candidates = ['Draft', 'Plot', 'Drafted', 'Plotted', 'Revise', 'Revised', 'Return', 'Returned', '']
    .map(status => meeting(status || 'blank', 'CBA', 'A', { status }))
  assert.deepEqual(candidates.filter(isDraftOrPlotScheduleMeeting).map(item => item.status), ['Draft', 'Plot'])
  assert.deepEqual(departmentExternalRoomAssignments(candidates, term, rooms).map(item => item.location), ['Draft', 'Plot'])
})

test('a shared room cell checks every meeting interval in both modals', () => {
  const shared = Array(21).fill('') as string[]
  shared[19] = 'TBA'
  const first = { ...target, location: 'row:first', rowKey: 'row', roomId: '', room: 'TBA' }
  const second = { ...first, location: 'row:second', start: 540, end: 630 }
  const usage = { ...target, location: 'usage', rowKey: 'usage', start: 720, end: 810 }
  const external: FacultySubjectAssignment = { location: 'other', code: '', section: '', departmentCode: 'CBA',
    roomId: 'B', room: 'B 101', days: ['Fri'], start: 540, end: 630 }
  const workbook = recommendScheduleRooms([first, second, usage], rooms, 'row', 19, 0,
    { externalRoomAssignments: [external] })
  const plotFirst = meeting('row', 'CITE', '', { room: 'TBA', rawValues: shared })
  const plotSecond = meeting('row:meeting:1', 'CITE', '', { sourceScheduleId: 'row', room: 'TBA', rawValues: shared,
    startTime: '09:00', endTime: '10:30' })
  const plotUsage = meeting('usage', 'CITE', 'A', { startTime: '12:00', endTime: '13:30' })
  const plotExternal = meeting('other', 'CBA', 'B', { startTime: '09:00', endTime: '10:30' })
  const plotIds = plotRoomRecommendations([plotFirst, plotSecond, plotUsage, plotExternal], rooms, [plotFirst])
    .get(schedulePlotSelectionKey(plotFirst)) ?? []
  assert.deepEqual(plotIds.map(id => rooms.find(room => room.id === id)!.name), workbook)
})

test('parallel group recommendations use the same connected rooms in both modals', () => {
  const parallelRooms: PlotRoom[] = [300, 301, 302].map(number => ({
    id: `PTC${number}`, code: `PTC ${number}`, name: `PTC Room ${number}`, buildingId: 'PTC', floor: 3,
    status: 'Available', type: 'Lecture', capacity: 40, availableDays: ['Friday'], startTime: '07:30', endTime: '18:00',
  }))
  const workbook: FacultySubjectAssignment[] = [0, 1].map(index => ({ ...target,
    location: `class${index}`, rowKey: `class${index}`, parallelGroup: 'parallel', section: String(index + 1),
    roomId: index === 0 ? 'PTC300' : '', room: index === 0 ? 'PTC Room 300' : '',
  }))
  const workbookOptions = recommendParallelRoomGroups(workbook, parallelRooms, 'class0', 19, 0)
  const plot = [0, 1].map(index => meeting(`class${index}`, 'CITE', index === 0 ? 'PTC300' : '', {
    source: 'workbook', schemaVersion: 2, sourceWorkbook: 'workbook', sourceSheet: 'Schedule', groupId: 'parallel',
    subjectCode: 'ITE 101', classSection: String(index + 1), providedRoomKeys: [],
    room: index === 0 ? 'PTC Room 300' : '',
  }))
  const plotOptions = plotParallelRoomGroupRecommendations(plot, parallelRooms, plot)
    .get(schedulePlotSelectionKey(plot[0])) ?? []
  const roomCodes = (ids: readonly string[]) => ids.map(id => parallelRooms.find(room => room.id === id)!.code)
  assert.deepEqual(plotOptions.map(option => option.assignments.map(item => item.roomId).map(roomId =>
    parallelRooms.find(room => room.id === roomId)!.code)), workbookOptions.map(option => option.rooms.map(room => room.room)))
  assert.ok(plotOptions.every(option => roomCodes(option.assignments.map(item => item.roomId)).length === 2))
})

test('parallel groups recommend every valid chain in used buildings without a count limit', () => {
  const chainRooms: PlotRoom[] = ['PTC', 'ITS', 'BE'].flatMap(buildingId => Array.from({ length: 8 }, (_, index) => ({
    id: `${buildingId}${300 + index}`, code: `${buildingId} ${300 + index}`, name: `${buildingId} Room ${300 + index}`,
    buildingId, floor: 3, status: 'Available', type: 'Lecture', capacity: 40,
    availableDays: ['Friday'], startTime: '07:30', endTime: '18:00',
  })))
  const workbook: FacultySubjectAssignment[] = [0, 1].map(index => ({ ...target,
    location: `class${index}`, rowKey: `class${index}`, parallelGroup: 'parallel', section: String(index + 1),
    roomId: index === 0 ? 'PTC300' : '', room: index === 0 ? 'PTC Room 300' : '',
  }))
  workbook.push({ ...target, location: 'usage', rowKey: 'usage', roomId: 'ITS300', room: 'ITS Room 300',
    start: 720, end: 810 })
  const workbookOptions = recommendParallelRoomGroups(workbook, chainRooms, 'class0', 19, 0)
  const plot = [0, 1].map(index => meeting(`class${index}`, 'CITE', index === 0 ? 'PTC300' : '', {
    source: 'workbook', schemaVersion: 2, sourceWorkbook: 'workbook', sourceSheet: 'Schedule', groupId: 'parallel',
    subjectCode: 'ITE 101', classSection: String(index + 1), providedRoomKeys: [],
    room: index === 0 ? 'PTC Room 300' : '',
  }))
  const plotUsage = meeting('usage', 'CITE', 'ITS300', { room: 'ITS Room 300', startTime: '12:00', endTime: '13:30' })
  const plotOptions = plotParallelRoomGroupRecommendations([...plot, plotUsage], chainRooms, plot)
    .get(schedulePlotSelectionKey(plot[0])) ?? []
  const plotCodes = plotOptions.map(option => option.assignments.map(item => chainRooms.find(room => room.id === item.roomId)!.code))
  assert.ok(workbookOptions.length > 5)
  assert.deepEqual(plotCodes, workbookOptions.map(option => option.rooms.map(room => room.room)))
  assert.ok(plotCodes.some(codes => codes.every(code => code.startsWith('ITS'))))
  assert.ok(plotCodes.every(codes => codes.every(code => !code.startsWith('BE'))))
})

test('ambiguous room names are not recommended by either modal', () => {
  const ambiguousRooms = [...rooms, { ...rooms[1], id: 'B2', code: 'B102' }]
  const external: FacultySubjectAssignment = { location: 'other', code: '', section: '', departmentCode: 'CBA',
    roomId: 'A', room: 'A 101', days: ['Fri'], start: 450, end: 540 }
  const workbook = recommendScheduleRooms([target], ambiguousRooms, 'target', 19, 0,
    { externalRoomAssignments: [external] })
  const plotTarget = meeting('target', 'CITE', 'A')
  const plotIds = plotRoomRecommendations([plotTarget, meeting('other', 'CBA', 'A')], ambiguousRooms, [plotTarget])
    .get(schedulePlotSelectionKey(plotTarget)) ?? []
  assert.deepEqual(plotIds.map(id => ambiguousRooms.find(room => room.id === id)!.name), workbook)
})

test('room type and capacity produce the same alternatives in both modals', () => {
  const constrainedRooms = rooms.map(room => room.id === 'A' ? { ...room, type: 'Laboratory' }
    : room.id === 'B' ? { ...room, capacity: 20 } : room)
  const workbook = recommendScheduleRooms([target], constrainedRooms, 'target', 19, 0)
  const plotTarget = meeting('target', 'CITE', 'A')
  const plotIds = plotRoomRecommendations([plotTarget], constrainedRooms, [plotTarget])
    .get(schedulePlotSelectionKey(plotTarget)) ?? []
  assert.deepEqual(plotIds.map(id => constrainedRooms.find(room => room.id === id)!.name), workbook)
})

test('separate room entries affect only their matching meeting in both modals', () => {
  const separate = Array(21).fill('') as string[]
  separate[19] = 'TBA/TBA'
  const first = { ...target, location: 'row:first', rowKey: 'row', roomId: '', room: 'TBA' }
  const second = { ...first, location: 'row:second', roomEntryIndex: 1, start: 540, end: 630 }
  const usage = { ...target, location: 'usage', rowKey: 'usage', start: 720, end: 810 }
  const external: FacultySubjectAssignment = { location: 'other', code: '', section: '', departmentCode: 'CBA',
    roomId: 'B', room: 'B 101', days: ['Fri'], start: 540, end: 630 }
  const workbook = recommendScheduleRooms([first, second, usage], rooms, 'row', 19, 0,
    { externalRoomAssignments: [external] })
  const plotFirst = meeting('row', 'CITE', '', { room: 'TBA', rawValues: separate })
  const plotSecond = meeting('row:meeting:1', 'CITE', '', { sourceScheduleId: 'row', room: 'TBA', rawValues: separate,
    startTime: '09:00', endTime: '10:30' })
  const plotUsage = meeting('usage', 'CITE', 'A', { startTime: '12:00', endTime: '13:30' })
  const plotExternal = meeting('other', 'CBA', 'B', { startTime: '09:00', endTime: '10:30' })
  const plotIds = plotRoomRecommendations([plotFirst, plotSecond, plotUsage, plotExternal], rooms, [plotFirst])
    .get(schedulePlotSelectionKey(plotFirst)) ?? []
  assert.deepEqual(plotIds.map(id => rooms.find(room => room.id === id)!.name), workbook)
})

test('laboratory meetings use the Lab room column in both modals', () => {
  const labRooms = rooms.map(room => ({ ...room, type: 'Laboratory' }))
  const rawValues = Array(21).fill('') as string[]
  rawValues[20] = 'A 101'
  const labAssignment: FacultySubjectAssignment = { ...target, college: 'LABORATORY', meetingKind: 'Lab', roomColumn: 20 }
  const external: FacultySubjectAssignment = { location: 'other', code: '', section: '', departmentCode: 'CBA',
    roomId: 'A', room: 'A 101', days: ['Fri'], start: 450, end: 540 }
  const workbook = recommendScheduleRooms([labAssignment], labRooms, 'target', 20, 0,
    { externalRoomAssignments: [external] })
  const plotTarget = meeting('target', 'CITE', 'A', { college: 'LABORATORY', format: 'Lab', rawValues })
  const plotIds = plotRoomRecommendations([plotTarget, meeting('other', 'CBA', 'A')], labRooms, [plotTarget])
    .get(schedulePlotSelectionKey(plotTarget)) ?? []
  assert.deepEqual(plotIds.map(id => labRooms.find(room => room.id === id)!.name), workbook)
})
