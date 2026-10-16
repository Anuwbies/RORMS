import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { assertPlotRoom, plotMeetingsOverlap, schedulePlotSelectionKey, type PlotRoom } from './schedulePlotting.ts'
import { recommendScheduleRooms } from './scheduleRoomRecommendations.ts'
import { plotFacultyScheduleAssignments } from './plotParallelRooms.ts'

/** Use workbook recommendations for this department, with Plot's campus-wide availability checks. */
export function plotRoomRecommendations(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[],
  targets: readonly ScheduleMeetingRecord[]): ReadonlyMap<string, readonly string[]> {
  const active = meetings.filter(meeting => !['Return', 'Returned'].includes(meeting.status ?? ''))
  const roomMap = new Map(rooms.map(room => [room.id, room]))
  const assignments = plotFacultyScheduleAssignments(active, rooms)
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
