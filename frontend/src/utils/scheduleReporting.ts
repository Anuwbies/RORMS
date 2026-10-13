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
  let rooms = 0, instructors = 0
  for (let firstIndex = 0; firstIndex < records.length; firstIndex += 1) {
    const first = records[firstIndex]
    if (reportingScheduleDuration(first) === null) continue
    for (let secondIndex = firstIndex + 1; secondIndex < records.length; secondIndex += 1) {
      const second = records[secondIndex]
      if (reportingScheduleDuration(second) === null) continue
      if (!scheduleMatchesTerm({ ...first }, { id: second.academicYearId, academicYear: second.academicYear }, second.semesterKey || second.semester || '')
        || !scheduleMatchesTerm({ ...second }, { id: first.academicYearId, academicYear: first.academicYear }, first.semesterKey || first.semester || '')) continue
      if (!reportingScheduleDays(first).some(day => reportingScheduleDays(second).includes(day))) continue
      if (minutes(first.startTime)! >= minutes(second.endTime)! || minutes(second.startTime)! >= minutes(first.endTime)!) continue
      if (first.roomId && first.roomId === second.roomId) rooms += 1
      if (first.instructorId && first.instructorId === second.instructorId) instructors += 1
    }
  }
  return { rooms, instructors }
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
