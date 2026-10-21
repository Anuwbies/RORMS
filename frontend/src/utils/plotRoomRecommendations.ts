import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { assertPlotRoom, isProvidedScheduleRoom, plotMeetingsOverlap, plotScheduleCollege, schedulePlotSelectionKey, type PlotRoom } from './schedulePlotting.ts'
import { scheduleMatchesTerm } from './roomSchedule.ts'
import { recommendParallelRoomGroups, recommendScheduleRooms } from './scheduleRoomRecommendations.ts'
import { plotFacultyScheduleAssignments } from './plotParallelRooms.ts'
import { plotRoomValidationMessages } from './plotRoomValidation.ts'
import { areParallelFacultyMeetings, isDraftOrPlotScheduleMeeting } from './ScheduleValidation.ts'

const sameDepartment = (left: ScheduleMeetingRecord, right: ScheduleMeetingRecord) =>
  left.department?.trim().toUpperCase() === right.department?.trim().toUpperCase()

const availableInTargetTerm = (meeting: ScheduleMeetingRecord, target: ScheduleMeetingRecord) => {
  if (sameDepartment(meeting, target)) return true
  const value = (entry: unknown) => typeof entry === 'string' ? entry.trim() : ''
  const yearId = value(target.academicYearId), year = value(target.academicYear)
  const semester = value(target.semesterKey) || value(target.semester)
  if (!(yearId || year) || !semester) return true
  return Boolean((value(meeting.academicYearId) || value(meeting.academicYear))
    && (value(meeting.semesterKey) || value(meeting.semester))
    && scheduleMatchesTerm(meeting, { id: yearId, academicYear: year }, semester))
}

export interface PlotParallelRoomGroupOption {
  id: string
  label: string
  assignments: readonly { meeting: ScheduleMeetingRecord; roomId: string }[]
}

/** Offer a complete room chain sized to the actual parallel meeting group. */
export function plotParallelRoomGroupRecommendations(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[],
  targets: readonly ScheduleMeetingRecord[], validationMessages?: ReadonlyMap<string, readonly string[]>,
  previousMeetings: readonly ScheduleMeetingRecord[] = []): ReadonlyMap<string, readonly PlotParallelRoomGroupOption[]> {
  const active = meetings.filter(meeting => isDraftOrPlotScheduleMeeting(meeting) && (!targets[0] || availableInTargetTerm(meeting, targets[0])))
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const targetByKey = new Map(targets.map(meeting => [schedulePlotSelectionKey(meeting), meeting]))
  const result = new Map<string, readonly PlotParallelRoomGroupOption[]>()
  const roomById = new Map(rooms.map(room => [room.id, room]))
  const issues = validationMessages ?? plotRoomValidationMessages(active, rooms, targets[0]?.department ?? '')
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
    if (![...representatives.values()].some(index => !active[index].roomId || issues.has(active[index].id))) continue

    const memberKeys = new Set(representatives.keys())
    const representativeSet = new Set(representatives.values())
    // Duplicate calendar copies represent one editable meeting, so keep only one per selection key.
    const normalized = assignments.flatMap((assignment, index) => memberKeys.has(schedulePlotSelectionKey(active[index]))
      ? representativeSet.has(index) ? [assignment] : [] : [assignment])
    const members = [...representatives].map(([key, index]) => ({ key, meeting: active[index] }))
    const eligibleRooms = rooms.filter(room => members.every(member => active
      .filter(item => schedulePlotSelectionKey(item) === member.key).every(item => {
        try {
          assertPlotRoom({ startTime: item.startTime ?? '', endTime: item.endTime ?? '', days: item.days ?? [] }, room,
            typeof item.maxStudents === 'number' ? item.maxStudents : null, plotScheduleCollege(item))
          return true
        } catch { return false }
      })))
    const previousAssignments = plotFacultyScheduleAssignments(previousMeetings.filter(meeting => meeting.department === target.department), rooms)
    const candidateGroups = recommendParallelRoomGroups(normalized, eligibleRooms, assignments[targetIndex].rowKey!,
      assignments[targetIndex].roomColumn!, assignments[targetIndex].roomEntryIndex!,
      [], [...rooms], previousAssignments)
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
              typeof item.maxStudents === 'number' ? item.maxStudents : null, plotScheduleCollege(item))
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
  targets: readonly ScheduleMeetingRecord[], previousMeetings: readonly ScheduleMeetingRecord[] = []): ReadonlyMap<string, readonly string[]> {
  const active = meetings.filter(isDraftOrPlotScheduleMeeting)
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const result = new Map<string, readonly string[]>()
  for (const target of targets) {
    const index = active.findIndex(meeting => meeting.id === target.id)
    if (index < 0) continue
    const meeting = active[index], assignment = assignments[index]
    const key = schedulePlotSelectionKey(meeting)
    if (result.has(key)) continue
    const scoped = assignments.flatMap((entry, i) => availableInTargetTerm(active[i], meeting) ? [{ entry, meeting: active[i] }] : [])
    const local = scoped.filter(item => sameDepartment(item.meeting, meeting)).map(item => item.entry)
    const external = scoped.filter(item => !sameDepartment(item.meeting, meeting)).map(item => item.entry)
    const previousAssignments = plotFacultyScheduleAssignments(previousMeetings.filter(item => sameDepartment(item, meeting)), rooms)
    const names = recommendScheduleRooms(local, [...rooms], assignment.rowKey!, assignment.roomColumn!, assignment.roomEntryIndex!, {
      previousTermAssignments: previousAssignments,
      externalRoomAssignments: external,
    })
    // Names are the workbook API; resolve only unique names back to room IDs.
    result.set(key, names.flatMap(name => {
      const matches = new Map(rooms.filter(room => (room.name.trim() || room.code.trim()) === name).map(room => [room.id, room]))
      return matches.size === 1 ? [[...matches.keys()][0]] : []
    }))
  }
  return result
}
