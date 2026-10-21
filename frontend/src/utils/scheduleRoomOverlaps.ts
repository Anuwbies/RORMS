import type { ScheduleMeetingRecord } from './scheduleMeetings'
import { plotMeetingsOverlap } from './schedulePlotting.ts'
import { isDraftOrPlotScheduleMeeting } from './ScheduleValidation.ts'

/** Call with the selected term and staged rooms, just as the Plot transaction does. */
export function scheduleRoomOverlapMessages(meetings: readonly ScheduleMeetingRecord[], roomLabel: (meeting: ScheduleMeetingRecord) => string) {
  const messages = new Map<string, string[]>()
  const byRoom = new Map<string, ScheduleMeetingRecord[]>()
  for (const meeting of meetings) {
    if (!meeting.roomId || !isDraftOrPlotScheduleMeeting(meeting)) continue
    const others = byRoom.get(meeting.roomId) ?? []
    for (const other of others) {
      if (meeting.id === other.id || !plotMeetingsOverlap(meeting, other)) continue
      const days = (meeting.days ?? []).filter(day => other.days?.includes(day)).join(', ')
      for (const [current, conflict] of [[meeting, other], [other, meeting]]) {
        const currentSection = current.classSection ? ` (${current.classSection})` : ''
        const section = conflict.classSection ? ` (${conflict.classSection})` : ''
        const department = conflict.department ? ` · ${conflict.department}` : ''
        const message = `Room overlap: ${current.subjectCode || 'Class'}${currentSection} overlaps ${conflict.subjectCode || 'another class'}${section}${department} in ${roomLabel(current)} on ${days}. Conflicting time: ${conflict.startTime}–${conflict.endTime}.`
        const existing = messages.get(current.id) ?? []
        if (!existing.includes(message)) existing.push(message)
        messages.set(current.id, existing)
      }
    }
    others.push(meeting)
    byRoom.set(meeting.roomId, others)
  }
  return messages
}
