import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { assertPlotRoom, isProvidedScheduleRoom, plotMeetingsOverlap, schedulePlotSelectionKey, type PlotRoom } from './schedulePlotting.ts'
import { recommendParallelRoomGroups, recommendScheduleRooms } from './scheduleRoomRecommendations.ts'
import { plotFacultyScheduleAssignments } from './plotParallelRooms.ts'
import { areParallelFacultyMeetings } from './ScheduleValidation.ts'

export interface PlotParallelRoomGroupOption {
  id: string
  label: string
  assignments: readonly { meeting: ScheduleMeetingRecord; roomId: string }[]
}

/** Offer a complete room chain sized to the actual parallel meeting group. */
export function plotParallelRoomGroupRecommendations(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[],
  targets: readonly ScheduleMeetingRecord[]): ReadonlyMap<string, readonly PlotParallelRoomGroupOption[]> {
  const active = meetings.filter(meeting => !['Return', 'Returned'].includes(meeting.status ?? ''))
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const targetByKey = new Map(targets.map(meeting => [schedulePlotSelectionKey(meeting), meeting]))
  const result = new Map<string, readonly PlotParallelRoomGroupOption[]>()
  const roomById = new Map(rooms.map(room => [room.id, room]))
  const roomByName = new Map<string, PlotRoom[]>()
  for (const room of rooms) {
    const name = room.code.trim() || room.name.trim()
    roomByName.set(name, [...(roomByName.get(name) ?? []), room])
  }

  for (const target of targets) {
    const targetIndex = active.findIndex(meeting => meeting.id === target.id)
    if (targetIndex < 0 || !assignments[targetIndex].parallelGroup) continue
    const targetKey = schedulePlotSelectionKey(active[targetIndex])
    if (result.has(targetKey)) continue
    const memberIndices = assignments.flatMap((assignment, index) =>
      assignment === assignments[targetIndex] || areParallelFacultyMeetings(assignments[targetIndex], assignment) ? [index] : [])
    const representatives = new Map<string, number>()
    for (const index of memberIndices) {
      const key = schedulePlotSelectionKey(active[index])
      if (!representatives.has(key)) representatives.set(key, index)
    }
    if (!representatives.size || new Set([...representatives.values()].map(index => assignments[index].rowKey)).size !== representatives.size
      || [...representatives].some(([key, index]) => !targetByKey.has(key) || active[index].source !== 'workbook'
        || active[index].schemaVersion !== 2 || isProvidedScheduleRoom(targetByKey.get(key)!))) continue

    const memberKeys = new Set(representatives.keys())
    const representativeSet = new Set(representatives.values())
    // Duplicate calendar copies represent one editable meeting, so keep only one per selection key.
    const normalized = assignments.flatMap((assignment, index) => memberKeys.has(schedulePlotSelectionKey(active[index]))
      ? representativeSet.has(index) ? [{ ...assignment, roomEntryIndex: 0 }] : [] : [assignment])
    const members = [...representatives].map(([key, index]) => ({ key, meeting: active[index] }))
    const eligibleRooms = rooms.filter(room => members.every(member => active
      .filter(item => schedulePlotSelectionKey(item) === member.key).every(item => {
        try {
          assertPlotRoom({ startTime: item.startTime ?? '', endTime: item.endTime ?? '', days: item.days ?? [] }, room,
            typeof item.maxStudents === 'number' ? item.maxStudents : null)
          return true
        } catch { return false }
      })))
    const candidateGroups = recommendParallelRoomGroups(normalized, eligibleRooms, assignments[targetIndex].rowKey!, 19, 0, [], [...rooms])
    const options = candidateGroups.flatMap((candidate, index): PlotParallelRoomGroupOption[] => {
      const changes = candidate.rooms.flatMap(entry => {
        const member = members.find(item => String(item.meeting.sourceScheduleId || item.meeting.id) === entry.rowKey)
        const matches = roomByName.get(entry.room) ?? []
        return member && matches.length === 1 ? [{ meeting: member.meeting, roomId: matches[0].id }] : []
      })
      if (changes.length !== representatives.size) return []
      const valid = changes.every(({ meeting, roomId }) => {
        const room = rooms.find(item => item.id === roomId)
        if (!room) return false
        const affected = active.filter(item => schedulePlotSelectionKey(item) === schedulePlotSelectionKey(meeting))
        return affected.every(item => {
          try {
            assertPlotRoom({ startTime: item.startTime ?? '', endTime: item.endTime ?? '', days: item.days ?? [] }, room,
              typeof item.maxStudents === 'number' ? item.maxStudents : null)
          } catch { return false }
          return active.every(other => memberKeys.has(schedulePlotSelectionKey(other))
            || !plotMeetingsOverlap({ ...item, roomId }, other))
        })
      })
      const label = changes.map(({ roomId }) => {
        const room = roomById.get(roomId)
        return room?.name.trim() || room?.code.trim() || ''
      }).join(' / ')
      return valid ? [{ id: `parallel-room-group:${targetKey}:${index}`, label, assignments: changes }] : []
    })
    for (const member of members) result.set(member.key, options)
  }
  return result
}

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
