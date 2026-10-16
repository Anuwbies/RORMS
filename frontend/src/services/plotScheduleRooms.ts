import { collection, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { canPlotDepartmentSchedules } from '../utils/departmentWorkbookPermissions'
import { semesterKey } from '../utils/departmentWorkbookPaths'
import type { WorkbookScheduleMeeting } from '../utils/excelScheduleRows'
import { scheduleMatchesTerm } from '../utils/roomSchedule'
import { scheduleMeetingRecords } from '../utils/scheduleMeetings'
import { assertPlotRoom, hasPendingRoomAllocation, plotMeetingKey, plotMeetingsOverlap, plottedScheduleFields, plotScheduleRevision, readProvidedRoomKeys, readRegistrarPlot, type PlotAssignment, type PlotRoom } from '../utils/schedulePlotting'
import { prepareScheduleRoomWorkbookSync } from './scheduleRoomWorkbookSync'
import type { ScheduleRoomWorkbookRow } from '../utils/scheduleRoomWorkbookCells'
import { plotParallelGroup, plotParallelRoomMessages } from '../utils/plotParallelRooms'

interface PlotRequest {
  membershipId: string
  departmentCode: string
  academicYearId: string
  academicYear: string
  semester: string
  instructorIds: string[]
  assignments: PlotAssignment[]
  scheduleCollection?: 'schedule' | 'schedules'
}

export function readPlotRoom(id: string, data: Record<string, unknown>): PlotRoom {
  return { id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? ''),
    status: String(data.status ?? ''), startTime: String(data.startTime ?? ''), endTime: String(data.endTime ?? ''),
    capacity: typeof data.capacity === 'number' ? data.capacity : 0,
    floor: typeof data.floor === 'number' && Number.isFinite(data.floor) ? data.floor : undefined,
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
  const scheduleCollection = request.scheduleCollection ?? 'schedule'
  // Include unassigned rows: two registrars assigning existing rows concurrently must read each other's changes.
  const candidates = await getDocs(collection(db, scheduleCollection))
  const assignments = request.assignments.map(assignment => ({ ...assignment }))
  const candidateMeetings = scheduleMeetingRecords(candidates.docs).filter(meeting => scheduleMatchesTerm(meeting,
    { id: request.academicYearId, academicYear: request.academicYear }, request.semester))
  for (const assignment of request.assignments) {
    const target = candidateMeetings.find(meeting => String(meeting.sourceScheduleId || meeting.id) === assignment.scheduleId
      && plotMeetingKey(meeting as Partial<WorkbookScheduleMeeting>) === assignment.meetingKey)
    if (!target || !target.groupId && target.type !== 'parallel') continue
    const group = plotParallelGroup(candidateMeetings, [], target)
    if (!group.length) continue
    const groupRows = new Set(group.map(meeting => String(meeting.sourceScheduleId || meeting.id)))
    const statuses = new Set(request.assignments.filter(item => groupRows.has(item.scheduleId)).map(item => item.targetStatus).filter(Boolean))
    if (statuses.size > 1) throw new Error('Choose one status for the entire parallel group before saving.')
    if (!statuses.size) throw new Error('Check the completed parallel group checkbox before clicking Plot.')
    const targetStatus = [...statuses][0]!
    for (const meeting of group) {
      const scheduleId = String(meeting.sourceScheduleId || meeting.id), meetingKey = plotMeetingKey(meeting as Partial<WorkbookScheduleMeeting>)
      const selected = assignments.find(item => item.scheduleId === scheduleId && item.meetingKey === meetingKey)
      if (selected) selected.targetStatus = targetStatus
      else assignments.push({ scheduleId, meetingKey, targetStatus, roomId: meeting.roomId ?? '', expectedRoomId: meeting.roomId ?? '', expectedRevision: plotScheduleRevision(meeting) })
    }
  }
  const ids = [...new Set([...candidates.docs.map(item => item.id), ...assignments.map(item => item.scheduleId)])]
  const roomIds = [...new Set(assignments.map(item => item.roomId).filter(Boolean))]
  const revisionId = crypto.randomUUID()
  let workbookSync: Awaited<ReturnType<typeof prepareScheduleRoomWorkbookSync>> | undefined
  if (scheduleCollection === 'schedules') {
    const selectedIds = new Set(assignments.map(assignment => assignment.scheduleId))
    const sourceRows = candidates.docs.filter(document => selectedIds.has(document.id)).map(document => {
      const data = document.data()
      if (typeof data.sourceWorkbook !== 'string' || typeof data.sourceSheet !== 'string' || !Number.isSafeInteger(data.sourceRow)
        || !Array.isArray(data.rawValues) || data.rawValues.length !== 21 || data.rawValues.some(value => typeof value !== 'string')
        || typeof data.departmentId !== 'string') throw new Error('This schedule is missing its workbook source. Open and save the workbook before plotting.')
      return { id: document.id, sourceWorkbook: data.sourceWorkbook, sourceSheet: data.sourceSheet, sourceRow: data.sourceRow as number,
        rawValues: data.rawValues as string[], meetings: workbookMeetings(data), departmentId: data.departmentId }
    })
    if (sourceRows.length !== selectedIds.size || new Set(sourceRows.map(row => row.departmentId)).size !== 1) {
      throw new Error('These schedules were removed or moved. Reopen the schedule before plotting.')
    }
    workbookSync = await prepareScheduleRoomWorkbookSync({ departmentId: sourceRows[0].departmentId, departmentCode: request.departmentCode,
      academicYearId: request.academicYearId, academicYear: request.academicYear, semester, membershipId: request.membershipId },
      sourceRows satisfies ScheduleRoomWorkbookRow[], revisionId)
  }
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the schedule before plotting.')
    const [membership, profile, year, rows, rooms, workbookUpdate] = await Promise.all([
      transaction.get(doc(db, 'memberships', request.membershipId)), transaction.get(doc(db, 'users', user.uid)),
      transaction.get(doc(db, 'academicYears', request.academicYearId)),
      Promise.all(ids.map(id => transaction.get(doc(db, scheduleCollection, id)))),
      Promise.all(roomIds.map(id => transaction.get(doc(db, 'rooms', id)))),
      workbookSync?.read(transaction),
    ])
    const member = membership.data()
    if (!profile.exists() || profile.data()?.isActive === false || !['Registrar', 'Admin'].includes(String(member?.role))
      || !canPlotDepartmentSchedules(member, user.uid, year.data()?.[semester]?.phase ?? 'Closed')) throw new Error('This semester is read only for your membership or role.')
    const current = new Map(rows.filter(row => row.exists()).map(row => [row.id, row.data()!]))
    const roomMap = new Map(rooms.filter(room => room.exists()).map(room => [room.id, readPlotRoom(room.id, room.data()!)]))
    // Read peer rooms from the fresh schedule snapshots so concurrent changes are checked too.
    const parallelRoomIds = [...new Set(scheduleMeetingRecords([...current].filter(([id, data]) =>
      !['Return', 'Returned'].includes(String(data.status))
      && scheduleMatchesTerm({ ...data, id }, { id: request.academicYearId, academicYear: request.academicYear }, request.semester))
      .map(([id, data]) => ({ id, data: () => data })))
      .filter(meeting => meeting.groupId && meeting.roomId && !roomMap.has(meeting.roomId)).map(meeting => meeting.roomId!))]
    const parallelRooms = await Promise.all(parallelRoomIds.map(id => transaction.get(doc(db, 'rooms', id))))
    for (const room of parallelRooms) if (room.exists()) roomMap.set(room.id, readPlotRoom(room.id, room.data()!))
    const changed = new Map<string, Record<string, unknown>>()
    const statusOnlyDraftIds = new Set<string>()
    for (const id of new Set(assignments.map(item => item.scheduleId))) {
      const data = current.get(id)
      if (!data || data.department !== request.departmentCode || !scheduleMatchesTerm({ ...data, id }, { id: request.academicYearId, academicYear: request.academicYear }, request.semester)) throw new Error('This schedule was removed or moved to another department or term. Reopen the schedule.')
      if (!['Draft', 'Plot'].includes(String(data.status))) throw new Error('Only Draft or Plot schedules can be assigned rooms.')
      const rowAssignments = assignments.filter(item => item.scheduleId === id)
      const keys = new Set<string>()
      const meetings = workbookMeetings(data)
      const sourceProvidedRoomKeys = readProvidedRoomKeys(data)
      const providedRoomKeys = sourceProvidedRoomKeys ?? meetings.filter(meeting => meeting.room.trim()).map(plotMeetingKey)
      const legacyProvidedRoomKeys = readRegistrarPlot(data.registrarPlot)?.providedRoomKeys
      const requestedStatuses = new Set(rowAssignments.map(assignment => assignment.targetStatus).filter(Boolean))
      if (requestedStatuses.size > 1) throw new Error('Choose one status for this schedule before saving.')
      if (scheduleCollection === 'schedules' && !requestedStatuses.size && rowAssignments.some(assignment => assignment.roomId)) {
        throw new Error('Check each schedule checkbox before clicking Plot.')
      }
      const parallel = Boolean((data.groupId || data.type === 'parallel') && candidateMeetings.some(candidate => candidate.sourceScheduleId === id
        && plotParallelGroup(candidateMeetings, [], candidate).length > 0))
      for (const assignment of rowAssignments) {
        if (keys.has(assignment.meetingKey)) throw new Error('The same meeting was selected more than once.')
        keys.add(assignment.meetingKey)
        const index = meetings.findIndex(meeting => plotMeetingKey(meeting) === assignment.meetingKey)
        const meeting = meetings[index]
        if (!meeting || !request.instructorIds.includes(meeting.instructorId) || meeting.roomId !== assignment.expectedRoomId
          || plotScheduleRevision(data) !== assignment.expectedRevision) throw new Error('This meeting changed while you were choosing rooms. Reopen the schedule and try again.')
        const provided = scheduleCollection === 'schedules' && providedRoomKeys.includes(assignment.meetingKey)
        if (provided && assignment.roomId !== meeting.roomId) {
          throw new Error('A schedule with a provided room uses a checkbox. Its room cannot be changed here.')
        }
        if (scheduleCollection === 'schedules' && sourceProvidedRoomKeys === undefined && assignment.roomId !== meeting.roomId) {
          throw new Error('Save this schedule from the department workbook first to record its provided rooms, then reopen it for plotting.')
        }
        if (assignment.targetStatus !== undefined && (!parallel && assignment.targetStatus === 'Plot' && !assignment.roomId
          || !['Draft', 'Plot'].includes(assignment.targetStatus))) throw new Error('Assign a room before changing status using a checkbox.')
        if (assignment.targetStatus === 'Draft' && assignment.roomId === meeting.roomId) continue
        if (assignment.roomId) {
          const room = roomMap.get(assignment.roomId)
          if (!room) throw new Error('A selected room was removed. Choose another room.')
          assertPlotRoom(meeting, room, typeof data.maxStudents === 'number' ? data.maxStudents : null)
          if (assignment.roomId !== meeting.roomId) meetings[index] = { ...meeting, roomId: room.id, room: room.name.trim() || room.code, buildingId: room.buildingId }
        } else meetings[index] = { ...meeting, roomId: '', room: scheduleCollection === 'schedules' ? '' : 'TBA', buildingId: '' }
      }
      const fields = { ...plottedScheduleFields(meetings), ...(requestedStatuses.has('Draft') ? { status: 'Draft' } : {}) }
      if (requestedStatuses.has('Draft') && rowAssignments.every(assignment => assignment.roomId === assignment.expectedRoomId)) statusOnlyDraftIds.add(id)
      changed.set(id, { ...data, ...fields, registrarPlot: { version: 1, revisionId, savedBy: user.uid,
        ...(legacyProvidedRoomKeys !== undefined ? { providedRoomKeys: legacyProvidedRoomKeys } : {}),
        assignments: meetings.filter(meeting => meeting.roomId).map(meeting => ({ key: plotMeetingKey(meeting), roomId: meeting.roomId, room: meeting.room, buildingId: meeting.buildingId })) },
        validationIssues: Array.isArray(data.validationIssues) ? data.validationIssues.filter(issue => issue !== 'Room allocation is pending.' || hasPendingRoomAllocation(meetings)) : [],
        ...(workbookUpdate?.updateRow(id, meetings) ?? {}),
      })
    }
    const proposed = new Map([...current, ...changed])
    const entries = scheduleMeetingRecords([...proposed].filter(([id, data]) => !['Return', 'Returned'].includes(String(data.status))
      && scheduleMatchesTerm({ ...data, id }, { id: request.academicYearId, academicYear: request.academicYear }, request.semester))
      .map(([id, data]) => ({ id, data: () => data })))
    const parallelMessages = plotParallelRoomMessages(entries, [...roomMap.values()])
    for (const entry of entries) {
      const sourceId = String(entry.sourceScheduleId ?? entry.id)
      if (!changed.has(sourceId)) continue
      if (statusOnlyDraftIds.has(sourceId)) continue
      const parallelIssue = parallelMessages.get(entry.id)?.[0]
      if (parallelIssue) throw new Error(parallelIssue)
      for (const other of entries) {
        if (entry.id === other.id) continue
        if (plotMeetingsOverlap(entry as unknown as WorkbookScheduleMeeting, other as unknown as WorkbookScheduleMeeting)) throw new Error(`${entry.subjectCode || 'Class'} overlaps ${other.subjectCode || 'another class'} in the selected room.`)
      }
    }
    workbookUpdate?.apply(user.uid)
    for (const [id, data] of changed) transaction.update(doc(db, scheduleCollection, id), {
      ...(scheduleCollection === 'schedules' ? { plottedMembershipId: request.membershipId } : {}),
      ...(workbookUpdate ? { rawValues: data.rawValues, workbookRow: data.workbookRow, workbookSheetId: data.workbookSheetId } : {}),
      meetings: data.meetings, status: data.status, roomId: data.roomId, buildingId: data.buildingId, roomIds: data.roomIds,
      f2fRoom: data.f2fRoom, registrarPlot: data.registrarPlot, validationIssues: data.validationIssues,
      plottedBy: user.uid, plottedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
}
