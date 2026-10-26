import type { ScheduleMeetingRecord } from './scheduleMeetings.ts'
import type { PlotRoom } from './schedulePlotting.ts'
import { excelScheduleRoomKey, isDraftOrPlotScheduleMeeting, validateFacultyScheduleAssignments, validateOtherDepartmentRoomAssignments } from './ScheduleValidation.ts'
import { plotFacultyScheduleAssignments } from './plotParallelRooms.ts'
import { scheduleSectionLabel } from './roomSchedule.ts'

/** Show the department workbook's room warnings for the current staged Plot selection. */
export function plotRoomValidationMessages(meetings: readonly ScheduleMeetingRecord[], rooms: readonly PlotRoom[], departmentCode: string) {
  const active = meetings.filter(isDraftOrPlotScheduleMeeting)
  const assignments = plotFacultyScheduleAssignments(active, rooms)
  const department = departmentCode.trim().toUpperCase()
  const own = assignments.filter(assignment => !department || assignment.departmentCode?.trim().toUpperCase() === department)
  const external = assignments.filter(assignment => department && assignment.departmentCode?.trim().toUpperCase() !== department)
  const messages = new Map<string, string[]>()
  const add = (location: string, message: string) => {
    const current = messages.get(location) ?? []
    if (!current.includes(message)) current.push(message)
    messages.set(location, current)
  }

  for (const issue of validateFacultyScheduleAssignments(own, [], rooms)) {
    if (issue.message.startsWith('Room ') || issue.message.startsWith('Parallel ')
      || /^All \d+ parallel sections/.test(issue.message)) {
      const meeting = active.find(item => item.id === issue.location)
      const isRoomOverlap = issue.message.startsWith('Room ') && issue.message.includes(' is also assigned on ')
      const currentTime = meeting?.startTime && meeting.endTime ? ` (${meeting.startTime}–${meeting.endTime})` : ''
      const currentDays = meeting?.days?.length ? ` on ${meeting.days.join('/')}` : ''
      add(issue.location, isRoomOverlap && meeting
        ? `${scheduleSectionLabel(meeting)}${currentDays}${currentTime}: ${issue.message}` : issue.message)
    }
  }
  for (const issue of validateOtherDepartmentRoomAssignments(own, external)) add(issue.location, issue.message)
  for (const assignment of own) {
    if (!assignment.room?.trim()) continue
    const key = excelScheduleRoomKey(assignment.room)
    const matches = rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value) === key))
    if (matches.length > 1) add(assignment.location, `Room ${assignment.room} could not be matched uniquely to a room.`)
  }
  return messages
}
