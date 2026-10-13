import { scheduleMeetingRecords, type ScheduleMeetingRecord } from './scheduleMeetings.ts'

interface ScheduleDocument { id: string; data: () => Record<string, unknown> }
interface ScheduleTerm { id?: string; academicYear?: string }

function minutes(value?: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function roomScheduleMeetings(documents: readonly ScheduleDocument[], roomId: string): ScheduleMeetingRecord[] {
  return scheduleMeetingRecords(documents).filter(meeting => {
    if (meeting.roomId !== roomId || !Array.isArray(meeting.days) || !meeting.days.length || meeting.days.some(day => typeof day !== 'string')) return false
    const start = minutes(meeting.startTime), end = minutes(meeting.endTime)
    return start !== null && end !== null && end > start
  }).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
}

const yearKey = (value: string) => value.replace(/\s/g, '').replace(/[–—]/g, '-').toUpperCase()
const semesterKey = (value: string) => {
  const text = value.trim().toLowerCase()
  return /^(?:sem1|1st semester)$/.test(text) ? 'sem1' : /^(?:sem2|2nd semester)$/.test(text) ? 'sem2' : text
}

export function scheduleMatchesTerm(meeting: ScheduleMeetingRecord, year: ScheduleTerm | null, semester: string): boolean {
  if (year?.id && typeof meeting.academicYearId === 'string' && meeting.academicYearId) {
    if (meeting.academicYearId !== year.id) return false
  } else if (year?.academicYear && meeting.academicYear && yearKey(meeting.academicYear) !== yearKey(year.academicYear)) return false
  const term = typeof meeting.semesterKey === 'string' && meeting.semesterKey ? meeting.semesterKey : meeting.semester
  return !semester || !term || semesterKey(term) === semesterKey(semester)
}

export function roomScheduleSection(meeting: { classSection?: string; course?: unknown }): string {
  const section = meeting.classSection?.trim().replace(/\s*·\s*/g, ' - ') || 'TBA'
  const course = typeof meeting.course === 'string' ? meeting.course.trim() : ''
  return course ? `${course} - ${section}` : section
}

export function roomScheduleLabel(meeting: { format?: string; subjectType?: unknown; type?: unknown }): string {
  const label = (value: unknown) => {
    const type = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_-]+/g, '') : ''
    if (type === 'lec' || type === 'lecture') return 'Lec'
    if (type === 'lab' || type === 'laboratory') return 'Lab'
    if (type === 'flexible' || type === 'openlab' || /lecture.*lab/.test(type)) return 'Openlab'
  }
  return label(meeting.format) ?? label(meeting.subjectType) ?? label(meeting.type) ?? 'Unspecified'
}

export function roomScheduleInstructor(meeting: Pick<ScheduleMeetingRecord, 'instructorId'> & { faculty?: unknown }, names: ReadonlyMap<string, string>): string {
  const saved = typeof meeting.faculty === 'string' ? meeting.faculty.trim() : ''
  return (meeting.instructorId ? names.get(meeting.instructorId) : '') || saved || 'TBA'
}

export function roomScheduleRoom(meeting: Pick<ScheduleMeetingRecord, 'roomId'> & { room?: unknown }, names: ReadonlyMap<string, string>): string {
  const saved = typeof meeting.room === 'string' ? meeting.room.trim() : ''
  return (meeting.roomId ? names.get(meeting.roomId) : '') || saved || 'TBA'
}
