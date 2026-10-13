import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { canPlotDepartmentSchedules } from '../utils/departmentWorkbookPermissions'
import { semesterKey } from '../utils/departmentWorkbookPaths'
import type { WorkbookScheduleMeeting } from '../utils/excelScheduleRows'
import { scheduleMatchesTerm } from '../utils/roomSchedule'
import { scheduleMeetingRecords } from '../utils/scheduleMeetings'
import { assertPlotRoom, plotMeetingKey, plotMeetingsOverlap, plottedScheduleFields, plotScheduleRevision, type PlotAssignment, type PlotRoom } from '../utils/schedulePlotting'

interface PlotRequest {
  membershipId: string
  departmentCode: string
  academicYearId: string
  academicYear: string
  semester: string
  instructorIds: string[]
  assignments: PlotAssignment[]
}

export function readPlotRoom(id: string, data: Record<string, unknown>): PlotRoom {
  return { id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? ''),
    status: String(data.status ?? ''), startTime: String(data.startTime ?? ''), endTime: String(data.endTime ?? ''),
    capacity: typeof data.capacity === 'number' ? data.capacity : 0,
    availableDays: Array.isArray(data.availableDays) ? data.availableDays.filter((day): day is string => typeof day === 'string') : [] }
}

function workbookMeetings(data: Record<string, unknown>): WorkbookScheduleMeeting[] {
  if (data.source !== 'workbook' || data.schemaVersion !== 2 || !Array.isArray(data.meetings) || !data.meetings.length) throw new Error('This schedule must be saved from the department workbook before plotting.')
  return data.meetings.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('This schedule contains an invalid meeting. Save its workbook again.')
    const meeting = value as Record<string, unknown>
    if (!['Lec', 'Lab', 'Flexible', 'Unspecified'].includes(String(meeting.format))
      || !['faculty', 'time', 'day', 'room', 'startTime', 'endTime', 'instructorId', 'roomId', 'buildingId'].every(key => typeof meeting[key] === 'string')
      || !Array.isArray(meeting.days) || meeting.days.some(day => typeof day !== 'string')) throw new Error('This schedule contains an invalid meeting. Save its workbook again.')
    return { ...meeting } as unknown as WorkbookScheduleMeeting
  })
}

/** Commit room changes together; reread permissions, meetings, rooms and competing schedules. */
export async function plotScheduleRooms(request: PlotRequest): Promise<void> {
  const user = auth.currentUser
  if (!user || !request.membershipId) throw new Error('Sign in with an accepted Registrar or Admin membership to plot rooms.')
  if (!request.assignments.length) return
  const semester = semesterKey(request.semester)
  // Include unassigned rows: two registrars assigning existing rows concurrently must read each other's changes.
  const candidates = await getDocs(collection(db, 'schedule'))
  const ids = [...new Set([...candidates.docs.map(item => item.id), ...request.assignments.map(item => item.scheduleId)])]
  const roomIds = [...new Set(request.assignments.map(item => item.roomId).filter(Boolean))]
  const revisionId = crypto.randomUUID()
  await runTransaction(db, async transaction => {
    const [membership, profile, year, rows, rooms] = await Promise.all([
      transaction.get(doc(db, 'memberships', request.membershipId)), transaction.get(doc(db, 'users', user.uid)),
      transaction.get(doc(db, 'academicYears', request.academicYearId)),
      Promise.all(ids.map(id => transaction.get(doc(db, 'schedule', id)))),
      Promise.all(roomIds.map(id => transaction.get(doc(db, 'rooms', id)))),
    ])
    const member = membership.data()
    if (!profile.exists() || profile.data()?.isActive === false || !['Registrar', 'Admin'].includes(String(member?.role))
      || !canPlotDepartmentSchedules(member, user.uid, year.data()?.[semester]?.phase ?? 'Closed')) throw new Error('This semester is read only for your membership or role.')
    const current = new Map(rows.filter(row => row.exists()).map(row => [row.id, row.data()!]))
    const roomMap = new Map(rooms.filter(room => room.exists()).map(room => [room.id, readPlotRoom(room.id, room.data()!)]))
    const changed = new Map<string, Record<string, unknown>>()
    for (const id of new Set(request.assignments.map(item => item.scheduleId))) {
      const data = current.get(id)
      if (!data || data.department !== request.departmentCode || !scheduleMatchesTerm({ ...data, id }, { id: request.academicYearId, academicYear: request.academicYear }, request.semester)) throw new Error('This schedule was removed or moved to another department or term. Reopen the schedule.')
      if (!['Draft', 'Plot'].includes(String(data.status))) throw new Error('Only Draft or Plot schedules can be assigned rooms.')
      const assignments = request.assignments.filter(item => item.scheduleId === id)
      const keys = new Set<string>()
      const meetings = workbookMeetings(data)
      for (const assignment of assignments) {
        if (keys.has(assignment.meetingKey)) throw new Error('The same meeting was selected more than once.')
        keys.add(assignment.meetingKey)
        const index = meetings.findIndex(meeting => plotMeetingKey(meeting) === assignment.meetingKey)
        const meeting = meetings[index]
        if (!meeting || !request.instructorIds.includes(meeting.instructorId) || meeting.roomId !== assignment.expectedRoomId
          || plotScheduleRevision(data) !== assignment.expectedRevision) throw new Error('This meeting changed while you were choosing rooms. Reopen the schedule and try again.')
        if (assignment.roomId) {
          const room = roomMap.get(assignment.roomId)
          if (!room) throw new Error('A selected room was removed. Choose another room.')
          assertPlotRoom(meeting, room, typeof data.maxStudents === 'number' ? data.maxStudents : null)
          meetings[index] = { ...meeting, roomId: room.id, room: room.code || room.name, buildingId: room.buildingId }
        } else meetings[index] = { ...meeting, roomId: '', room: 'TBA', buildingId: '' }
      }
      const fields = plottedScheduleFields(meetings)
      changed.set(id, { ...data, ...fields, registrarPlot: { version: 1, revisionId, savedBy: user.uid,
        assignments: meetings.filter(meeting => meeting.roomId).map(meeting => ({ key: plotMeetingKey(meeting), roomId: meeting.roomId, room: meeting.room, buildingId: meeting.buildingId })) },
        validationIssues: Array.isArray(data.validationIssues) ? data.validationIssues.filter(issue => issue !== 'Room allocation is pending.' || fields.status !== 'Plot') : [],
      })
    }
    const proposed = new Map([...current, ...changed])
    const entries = scheduleMeetingRecords([...proposed].filter(([id, data]) => !['Return', 'Returned'].includes(String(data.status))
      && scheduleMatchesTerm({ ...data, id }, { id: request.academicYearId, academicYear: request.academicYear }, request.semester))
      .map(([id, data]) => ({ id, data: () => data })))
    for (const entry of entries) {
      const sourceId = String(entry.sourceScheduleId ?? entry.id)
      if (!changed.has(sourceId)) continue
      for (const other of entries) {
        if (entry.id === other.id) continue
        if (plotMeetingsOverlap(entry as unknown as WorkbookScheduleMeeting, other as unknown as WorkbookScheduleMeeting)) throw new Error(`${entry.subjectCode || 'Class'} overlaps ${other.subjectCode || 'another class'} in the selected room.`)
      }
    }
    for (const [id, data] of changed) transaction.update(doc(db, 'schedule', id), {
      meetings: data.meetings, status: data.status, roomId: data.roomId, buildingId: data.buildingId, roomIds: data.roomIds,
      f2fRoom: data.f2fRoom, registrarPlot: data.registrarPlot, validationIssues: data.validationIssues,
      plottedBy: user.uid, plottedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
}
