import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { assertPlotRoom, plotMeetingsOverlap, schedulePlotSelectionKey, type PlotRoom } from './schedulePlotting.ts'
import { recommendScheduleRooms } from './scheduleRoomRecommendations.ts'
import type { FacultySubjectAssignment } from './ScheduleValidation'

const text = (value: unknown) => typeof value === 'string' ? value : ''
const minutes = (value: string | undefined) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : undefined
}

/** Use workbook recommendations for this department, with Plot's campus-wide availability checks. */
export function plotRoomRecommendations(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[],
  targets: readonly ScheduleMeetingRecord[]): ReadonlyMap<string, readonly string[]> {
  const active = meetings.filter(meeting => !['Return', 'Returned'].includes(meeting.status ?? ''))
  const roomMap = new Map(rooms.map(room => [room.id, room]))
  const selectionKeys = active.map(schedulePlotSelectionKey)
  const firstSelectionIndex = new Map<string, number>()
  selectionKeys.forEach((key, index) => { if (!firstSelectionIndex.has(key)) firstSelectionIndex.set(key, index) })
  const assignments = active.map((meeting, index): FacultySubjectAssignment => ({
    location: meeting.id, rowKey: String(meeting.sourceScheduleId || meeting.id), roomColumn: 19,
    roomEntryIndex: firstSelectionIndex.get(selectionKeys[index]),
    code: meeting.subjectCode ?? '', section: meeting.classSection ?? '', subjectTitle: meeting.subjectTitle,
    faculty: text(meeting.faculty) || meeting.instructorId, instructorId: meeting.instructorId,
    parallelGroup: meeting.groupId ? JSON.stringify([meeting.department, meeting.sourceWorkbook, meeting.sourceSheet, meeting.groupId]) : undefined,
    meetingKind: ['Lec', 'Lab', 'Flexible', 'Unspecified'].includes(meeting.format ?? '') ? meeting.format as FacultySubjectAssignment['meetingKind'] : undefined,
    room: meeting.roomId ? roomMap.get(meeting.roomId)?.name || roomMap.get(meeting.roomId)?.code || text(meeting.room) : 'TBA',
    roomId: meeting.roomId, days: meeting.days, start: minutes(meeting.startTime), end: minutes(meeting.endTime),
  }))
  const result = new Map<string, readonly string[]>()
  for (const target of targets) {
    const index = active.findIndex(meeting => meeting.id === target.id)
    if (index < 0) continue
    const meeting = active[index], assignment = assignments[index]
    const key = schedulePlotSelectionKey(meeting)
    if (result.has(key)) continue
    // A calendar selection can represent multiple identical meeting keys in the same row.
    const affected = active.filter(item => schedulePlotSelectionKey(item) === key)
    const affectedIds = new Set(affected.map(item => item.id))
    const local = assignments.filter((_, i) => active[i].department === meeting.department)
    const names = recommendScheduleRooms(local, [...rooms], assignment.rowKey!, 19, assignment.roomEntryIndex!, {
      hasConflict: () => affected.some(item => active.some(other => item.id !== other.id && plotMeetingsOverlap(item, other))),
      isRoomAvailable: room => {
        const candidate = roomMap.get(room.id)
        if (!candidate) return false
        return affected.every(item => {
          try {
            assertPlotRoom({ startTime: item.startTime ?? '', endTime: item.endTime ?? '', days: item.days ?? [] }, candidate,
              typeof item.maxStudents === 'number' ? item.maxStudents : null)
          } catch { return false }
          return active.every(other => other.id === item.id || !plotMeetingsOverlap({ ...item, roomId: candidate.id },
            affectedIds.has(other.id) ? { ...other, roomId: candidate.id } : other))
        })
      },
    })
    // Names are the workbook API; resolve only unique names back to room IDs.
    result.set(key, names.flatMap(name => {
      const matches = rooms.filter(room => (room.name.trim() || room.code.trim()) === name)
      return matches.length === 1 ? [matches[0].id] : []
    }))
  }
  return result
}
