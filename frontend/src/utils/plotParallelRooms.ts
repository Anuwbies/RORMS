import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { schedulePlotSelectionKey, type PlotRoom } from './schedulePlotting.ts'
import { parallelRoomConnectionIssue, type FacultySubjectAssignment } from './ScheduleValidation.ts'

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
  selectionKeys.forEach((key, index) => { if (!firstSelectionIndex.has(key)) firstSelectionIndex.set(key, index) })
  return meetings.map((meeting, index) => ({
    location: meeting.id, rowKey: String(meeting.sourceScheduleId || meeting.id), roomColumn: 19,
    roomEntryIndex: firstSelectionIndex.get(selectionKeys[index]),
    code: meeting.subjectCode ?? '', section: meeting.classSection ?? '', subjectTitle: meeting.subjectTitle,
    faculty: text(meeting.faculty) || meeting.instructorId, instructorId: meeting.instructorId,
    parallelGroup: meeting.groupId ? JSON.stringify([meeting.department, meeting.sourceWorkbook, meeting.sourceSheet, meeting.groupId]) : undefined,
    meetingKind: ['Lec', 'Lab', 'Flexible', 'Unspecified'].includes(meeting.format ?? '') ? meeting.format as FacultySubjectAssignment['meetingKind'] : undefined,
    room: meeting.roomId ? roomMap.get(meeting.roomId)?.name || roomMap.get(meeting.roomId)?.code || text(meeting.room) : 'TBA',
    roomId: meeting.roomId, days: meeting.days, start: minutes(meeting.startTime), end: minutes(meeting.endTime),
  }))
}

export function plotParallelRoomMessages(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[]): ReadonlyMap<string, readonly string[]> {
  const active = meetings.filter(meeting => !['Return', 'Returned'].includes(meeting.status ?? ''))
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const messages = new Map<string, readonly string[]>()
  for (const assignment of assignments) {
    const issue = parallelRoomConnectionIssue(assignments, rooms, assignment)
    if (issue) messages.set(assignment.location, [issue])
  }
  return messages
}
