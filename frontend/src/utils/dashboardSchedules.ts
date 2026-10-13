import { scheduleMeetingRecords, type ScheduleMeetingRecord } from './scheduleMeetings.ts'
import { scheduleMatchesTerm } from './roomSchedule.ts'

interface ScheduleDocument { id: string; data: () => Record<string, unknown> }
interface ScheduleTerm { id?: string; academicYear?: string }

export interface DashboardScheduleMeeting extends ScheduleMeetingRecord {
  subjectCode: string
  startTime: string
  endTime: string
  days: string[]
  roomId: string
  buildingId: string
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const activeStatus = (row: ScheduleMeetingRecord) => ['Draft', 'Plot'].includes(row.status || 'Draft')
const timeText = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

function minutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value?.trim() || '')
  if (!match) return null
  let hours = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || (match[3] ? hours < 1 || hours > 12 : hours > 23)) return null
  if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)
  return hours * 60 + minute
}

/** Count stored rows, rather than the expanded meetings belonging to each row. */
export function dashboardScheduleRows(rows: readonly ScheduleMeetingRecord[], year: ScheduleTerm | null, semester: string): ScheduleMeetingRecord[] {
  return rows.filter(row => (row.source === 'workbook' || !row.parentId) && activeStatus(row) && scheduleMatchesTerm(row, year, semester))
}

export function dashboardScheduleStats(rows: readonly ScheduleMeetingRecord[]) {
  return {
    total: rows.length,
    plotted: rows.filter(row => row.status === 'Plot').length,
    drafted: rows.filter(row => !row.status || row.status === 'Draft').length,
    withIssues: rows.filter(row => Array.isArray(row.validationIssues) && row.validationIssues.length > 0).length,
  }
}

/** Keep all Lec/Lab meetings, but don't place incomplete saved rows on a timetable. */
export function dashboardScheduleMeetings(documents: readonly ScheduleDocument[]): DashboardScheduleMeeting[] {
  return scheduleMeetingRecords(documents).flatMap(meeting => {
    if (!activeStatus(meeting)) return []
    const start = minutes(meeting.startTime), end = minutes(meeting.endTime)
    if (start === null || end === null || end <= start) return []
    const days = [...new Set((Array.isArray(meeting.days) ? meeting.days : []).flatMap(day => {
      if (typeof day !== 'string') return []
      const index = dayNames.findIndex((name, index) => [name.toLowerCase(), fullDayNames[index].toLowerCase()].includes(day.trim().toLowerCase()))
      return index < 0 ? [] : [dayNames[index]]
    }))]
    if (!days.length) return []
    return [{
      ...meeting,
      subjectCode: meeting.subjectCode || 'CLASS',
      startTime: timeText(start),
      endTime: timeText(end),
      days,
      roomId: meeting.roomId || '',
      buildingId: meeting.buildingId || '',
    }]
  })
}

export function dashboardInstructorMeetings(meetings: readonly DashboardScheduleMeeting[], instructorIds: readonly string[]): DashboardScheduleMeeting[] {
  return meetings.filter(meeting => {
    if (meeting.instructorId && instructorIds.includes(meeting.instructorId)) return true
    // Workbook assignments belong to the individual meeting, not its row's other faculty.
    if (meeting.source === 'workbook') return false
    return [meeting.instructorId2, meeting.userId].some(id => typeof id === 'string' && instructorIds.includes(id))
  })
}

export function dashboardScheduleDays(meetings: readonly DashboardScheduleMeeting[]): Map<string, DashboardScheduleMeeting[]> {
  const map = new Map(dayNames.map(day => [day, [] as DashboardScheduleMeeting[]]))
  meetings.forEach(meeting => meeting.days.forEach(day => map.get(day)?.push(meeting)))
  map.forEach(items => items.sort((a, b) => minutes(a.startTime)! - minutes(b.startTime)!))
  return map
}
