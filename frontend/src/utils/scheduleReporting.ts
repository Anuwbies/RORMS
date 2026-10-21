import type { ScheduleReportRecord } from './reportingData.ts'
import { scheduleMatchesTerm } from './roomSchedule.ts'

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const fullDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function isWorkbookSchedule(record: ScheduleReportRecord): boolean {
  return record.source === 'workbook' && record.schemaVersion === 2
}

export function scheduleReportRowId(record: ScheduleReportRecord): string {
  return record.sourceScheduleId || record.parentId || record.id
}

/** Reporting receives workbook meetings already expanded by scheduleMeetingRecords. */
export function reportingScheduleMeetings(records: readonly ScheduleReportRecord[]): ScheduleReportRecord[] {
  return records.flatMap(record => {
    if (isWorkbookSchedule(record) || !record.startTime2) return [record]
    const splitDays = record.days?.length === 2
    return [
      { ...record, days: splitDays ? record.days?.slice(0, 1) : record.days },
      {
        ...record, id: `${record.id}:second`, sourceScheduleId: scheduleReportRowId(record),
        format: record.format2 || record.format,
        startTime: record.startTime2, endTime: record.endTime2 || record.endTime,
        instructorId: record.instructorId2 || record.instructorId,
        roomId: record.roomId2 || record.roomId, buildingId: record.buildingId2 || record.buildingId,
        days: splitDays ? record.days?.slice(1) : record.days,
      },
    ]
  })
}

export function reportingScheduleDays(record: Pick<ScheduleReportRecord, 'days'>): string[] {
  return [...new Set((record.days || []).flatMap(day => {
    if (typeof day !== 'string') return []
    const normalized = day.trim().toLowerCase()
    const index = days.findIndex((name, index) => [name.toLowerCase(), fullDays[index].toLowerCase()].includes(normalized))
    return index < 0 ? [] : [days[index]]
  }))]
}

function minutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(value?.trim() || '')
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) return null
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)
  return hour * 60 + minute
}

export function reportingScheduleDuration(record: Pick<ScheduleReportRecord, 'startTime' | 'endTime'>): number | null {
  const start = minutes(record.startTime), end = minutes(record.endTime)
  return start !== null && end !== null && end > start ? end - start : null
}

export function reportingScheduleWeeklyMinutes(record: ScheduleReportRecord): number {
  return (reportingScheduleDuration(record) || 0) * reportingScheduleDays(record).length
}

export function reportingScheduleConflicts(records: readonly ScheduleReportRecord[]) {
  const meetings = records.flatMap(record => {
    if (reportingScheduleDuration(record) === null) return []
    return [{ record, days: reportingScheduleDays(record), start: minutes(record.startTime)!, end: minutes(record.endTime)! }]
  })
  const countFor = (resource: 'roomId' | 'instructorId') => {
    const groups = new Map<string, typeof meetings>()
    meetings.forEach(meeting => {
      const id = meeting.record[resource]
      if (!id) return
      const group = groups.get(id) || []
      group.push(meeting)
      groups.set(id, group)
    })
    let conflicts = 0
    groups.forEach(group => {
      for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
        const first = group[firstIndex]
        for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
          const second = group[secondIndex]
          if (!scheduleMatchesTerm({ ...first.record }, { id: second.record.academicYearId, academicYear: second.record.academicYear }, second.record.semesterKey || second.record.semester || '')
            || !scheduleMatchesTerm({ ...second.record }, { id: first.record.academicYearId, academicYear: first.record.academicYear }, first.record.semesterKey || first.record.semester || '')) continue
          if (!first.days.some(day => second.days.includes(day))) continue
          if (first.start >= second.end || second.start >= first.end) continue
          conflicts += 1
        }
      }
    })
    return conflicts
  }
  return { rooms: countFor('roomId'), instructors: countFor('instructorId') }
}

export function reportingScheduleResource(registeredName: string | undefined, saved: unknown): string {
  return registeredName?.trim() || (typeof saved === 'string' ? saved.trim() : '') || '----'
}

export function reportingScheduleDayText(record: ScheduleReportRecord): string {
  return reportingScheduleDays(record).join(' / ') || record.day?.trim() || '----'
}

export function reportingScheduleTimeText(record: ScheduleReportRecord): string {
  return reportingScheduleDuration(record) !== null
    ? `${record.startTime} - ${record.endTime}`
    : record.time?.trim() || (record.startTime ? `${record.startTime} - ${record.endTime || '----'}` : '----')
}
