import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { assignedSchedulePlotStatus, plotMeetingKey, plotScheduleCollege, plotScheduleRevision, schedulePlotSelectionKey, type PlotAssignment, type PlotRoom } from './schedulePlotting.ts'
import { areParallelFacultyMeetings, excelScheduleRoomKey, isDraftOrPlotScheduleMeeting, parallelRoomAssignmentIssue, parallelRoomConnectionIssue, splitScheduleResources, type FacultySubjectAssignment } from './ScheduleValidation.ts'

const text = (value: unknown) => typeof value === 'string' ? value : ''
const minutes = (value: string | undefined) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : undefined
}

/** Share the workbook's meeting and parallel-group semantics with Plot validation and recommendations. */
export function plotFacultyScheduleAssignments(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[]): FacultySubjectAssignment[] {
  const roomMap = new Map(rooms.map(room => [room.id, room]))
  const selectionKeys = meetings.map(schedulePlotSelectionKey)
  const firstSelectionIndex = new Map<string, number>()
  const entryCounts = new Map<string, number>()
  selectionKeys.forEach((key, index) => {
    if (firstSelectionIndex.has(key)) return
    const meeting = meetings[index]
    const roomColumn = meeting.format === 'Lab' ? 20 : 19
    const group = JSON.stringify([meeting.sourceScheduleId || meeting.id, roomColumn])
    const entryIndex = entryCounts.get(group) ?? 0
    entryCounts.set(group, entryIndex + 1)
    const rawValues = Array.isArray(meeting.rawValues) ? meeting.rawValues : undefined
    const roomCell = rawValues && typeof rawValues[roomColumn] === 'string' ? rawValues[roomColumn] : undefined
    firstSelectionIndex.set(key, roomCell !== undefined && splitScheduleResources(roomCell).length <= 1 ? 0 : entryIndex)
  })
  return meetings.map((meeting, index) => {
    const matched = roomMap.get(meeting.roomId ?? '')
    const room = matched?.name || matched?.code || text(meeting.room) || text(meeting.roomId)
    const roomExists = Boolean(matched || !meeting.roomId && rooms.some(item => [item.name, item.code]
      .some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(room))))
    const savedYearLevel = text(meeting.yearLevelLabel).split(':', 1)[0].trim()
    const yearLevel = savedYearLevel || (typeof meeting.yearLevel === 'number' && Number.isInteger(meeting.yearLevel)
      ? `Year ${meeting.yearLevel}` : 'Year level unknown')
    const roomColumn = meeting.format === 'Lab' ? 20 : 19
    return {
      location: meeting.id, rowKey: String(meeting.sourceScheduleId || meeting.id), roomColumn,
      roomEntryIndex: firstSelectionIndex.get(selectionKeys[index]),
      code: meeting.subjectCode ?? '', section: meeting.classSection ?? '', subjectTitle: meeting.subjectTitle,
      faculty: text(meeting.faculty) || meeting.instructorId, instructorId: meeting.instructorId,
      parallelGroup: meeting.groupId || meeting.type === 'parallel'
        ? JSON.stringify([meeting.department, meeting.sourceWorkbook, meeting.sourceSheet, meeting.groupId || meeting.sourceScheduleId || meeting.id]) : undefined,
      meetingKind: ['Lec', 'Lab', 'Flexible', 'Unspecified'].includes(meeting.format ?? '') ? meeting.format as FacultySubjectAssignment['meetingKind'] : undefined,
      departmentCode: meeting.department, college: plotScheduleCollege(meeting), room, roomExists,
      maxStudents: typeof meeting.maxStudents === 'number' && Number.isFinite(meeting.maxStudents) ? meeting.maxStudents : null,
      description: yearLevel,
      timeText: meeting.startTime && meeting.endTime ? `${meeting.startTime}–${meeting.endTime}` : '',
      roomId: meeting.roomId, days: meeting.days, start: minutes(meeting.startTime), end: minutes(meeting.endTime),
    }
  })
}

export function plotParallelRoomMessages(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[]): ReadonlyMap<string, readonly string[]> {
  const active = meetings.filter(isDraftOrPlotScheduleMeeting)
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const messages = new Map<string, readonly string[]>()
  for (const assignment of assignments) {
    if (assignment.parallelGroup === undefined) continue
    const issues: string[] = []
    const roomAssignmentIssue = parallelRoomAssignmentIssue(assignments, rooms, assignment)
    if (roomAssignmentIssue) issues.push(roomAssignmentIssue)
    const issue = parallelRoomConnectionIssue(assignments, rooms, assignment)
    if (issue) issues.push(issue)
    if (issues.length) messages.set(assignment.location, issues)
  }
  return messages
}

export function plotParallelGroup(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[], target: ScheduleMeetingRecord): ScheduleMeetingRecord[] {
  const active = meetings.filter(isDraftOrPlotScheduleMeeting)
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const index = active.findIndex(meeting => meeting.id === target.id)
  if (index < 0 || !assignments[index].parallelGroup) return []
  return active.filter((_, i) => i === index || areParallelFacultyMeetings(assignments[index], assignments[i]))
}

export function parallelPlotCheckboxState(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[], pending: ReadonlyMap<string, PlotAssignment>) {
  const proposed = meetings.map(meeting => ({ ...meeting, roomId: pending.get(schedulePlotSelectionKey(meeting))?.roomId ?? meeting.roomId }))
  const complete = meetings.length > 0 && proposed.every(meeting => meeting.roomId && rooms.some(room => room.id === meeting.roomId))
  const valid = complete && plotParallelRoomMessages(proposed, rooms).size === 0
  const checked = valid && meetings.every(meeting => {
    const assignment = pending.get(schedulePlotSelectionKey(meeting))
    return assignment?.targetStatus ? assignment.targetStatus === 'Plot'
      : assignment ? false : assignedSchedulePlotStatus(pending, meeting) === 'Plot'
  })
  return { complete, valid, checked }
}

export function parallelPlotSelectionGroupKey(meeting: ScheduleMeetingRecord): string | undefined {
  if (!meeting.groupId && meeting.type !== 'parallel') return
  return JSON.stringify([meeting.department, meeting.sourceWorkbook, meeting.sourceSheet, meeting.groupId || meeting.sourceScheduleId || meeting.id,
    (meeting.subjectCode || meeting.subjectTitle || '').toUpperCase().replace(/\s+/g, ''), meeting.instructorId || meeting.faculty,
    meeting.startTime, meeting.endTime, [...(meeting.days ?? [])].sort(), meeting.format])
}

/** Changing rooms invalidates approval for that group and preserves the other staged choices. */
export function stagePlotRoomSelections(pending: ReadonlyMap<string, PlotAssignment>, selections: readonly { meeting: ScheduleMeetingRecord; roomId: string }[]): Map<string, PlotAssignment> {
  const next = new Map(pending)
  const changedGroups = new Set(selections.filter(({ meeting, roomId }) => (pending.get(schedulePlotSelectionKey(meeting))?.roomId ?? meeting.roomId ?? '') !== roomId)
    .map(({ meeting }) => parallelPlotSelectionGroupKey(meeting)).filter((key): key is string => Boolean(key)))
  const changedKeys = new Set(selections.filter(({ meeting, roomId }) => !parallelPlotSelectionGroupKey(meeting)
    && (pending.get(schedulePlotSelectionKey(meeting))?.roomId ?? meeting.roomId ?? '') !== roomId)
    .map(({ meeting }) => schedulePlotSelectionKey(meeting)))
  for (const [key, assignment] of next) if (assignment.parallelGroupKey && changedGroups.has(assignment.parallelGroupKey)
    || changedKeys.has(key)) {
    if (assignment.roomId === assignment.expectedRoomId) next.delete(key)
    else {
      const { targetStatus: _status, ...roomChoice } = assignment
      next.set(key, roomChoice)
    }
  }
  for (const { meeting, roomId } of selections) {
    const key = schedulePlotSelectionKey(meeting)
    const existing = next.get(key)
    const expectedRoomId = existing?.expectedRoomId ?? meeting.roomId ?? ''
    const groupKey = parallelPlotSelectionGroupKey(meeting)
    const targetStatus = !roomId && existing?.targetStatus === 'Plot' ? undefined : existing?.targetStatus
    if (roomId === expectedRoomId && !targetStatus) next.delete(key)
    else next.set(key, { scheduleId: String(meeting.sourceScheduleId || meeting.id), meetingKey: plotMeetingKey(meeting as Parameters<typeof plotMeetingKey>[0]),
      roomId, expectedRoomId, expectedRevision: existing?.expectedRevision ?? plotScheduleRevision(meeting),
      ...(groupKey ? { parallelGroupKey: groupKey } : {}),
      ...(targetStatus ? { targetStatus } : {}) })
  }
  return next
}

/** One checkbox stages every row together; undo/redo records this map as one edit. */
export function toggleParallelSchedulePlot(pending: ReadonlyMap<string, PlotAssignment>, meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[]): Map<string, PlotAssignment> {
  const state = parallelPlotCheckboxState(meetings, rooms, pending)
  if (!state.valid) return new Map(pending)
  const targetStatus = state.checked ? 'Draft' : 'Plot'
  const next = new Map(pending)
  const rows = new Set(meetings.map(meeting => String(meeting.sourceScheduleId || meeting.id)))
  for (const [key, assignment] of next) if (rows.has(assignment.scheduleId) && assignment.targetStatus) {
    if (assignment.roomId === assignment.expectedRoomId) next.delete(key)
    else next.set(key, { ...assignment, targetStatus: undefined })
  }
  if (targetStatus === 'Draft' && meetings.every(meeting => (meeting.status || 'Draft') === 'Draft')) return next
  for (const meeting of meetings) {
    if (!['Draft', 'Plot'].includes(meeting.status || 'Draft')) return new Map(pending)
    const key = schedulePlotSelectionKey(meeting)
    const existing = next.get(key)
    if (targetStatus === (meeting.status || 'Draft') && !existing) continue
    next.set(key, { scheduleId: String(meeting.sourceScheduleId || meeting.id), targetStatus,
      parallelGroupKey: parallelPlotSelectionGroupKey(meeting),
      meetingKey: plotMeetingKey(meeting as Parameters<typeof plotMeetingKey>[0]), roomId: existing?.roomId ?? meeting.roomId ?? '',
      expectedRoomId: existing?.expectedRoomId ?? meeting.roomId ?? '', expectedRevision: existing?.expectedRevision ?? plotScheduleRevision(meeting) })
  }
  return next
}
