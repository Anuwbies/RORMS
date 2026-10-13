import type { ScheduleRecord } from './excelScheduleTemplate'

export interface ExcelScheduleValidation {
  duplicateSubjectRows: ReadonlySet<number>
  overlapRows: ReadonlySet<number>
  missingValueRows: ReadonlySet<number>
  invalidRoomRows: ReadonlySet<number>
  invalidFacultyRows: ReadonlySet<number>
  messagesForRow: (row: number) => readonly string[]
  missingMessagesForRow: (row: number) => readonly string[]
  parallelGroupForRow: (row: number) => number | undefined
}

export interface ExcelScheduleRowIssues {
  row: number
  messages: readonly string[]
}

/** Use the same errors as the sheet highlights, restricted to the pending Plot rows. */
export function scheduleValidationIssuesForRows(validation: ExcelScheduleValidation, rows: readonly number[]): ExcelScheduleRowIssues[] {
  return [...new Set(rows)].sort((a, b) => a - b).flatMap(row => {
    const messages = [...new Set([...validation.messagesForRow(row), ...validation.missingMessagesForRow(row)])]
    return messages.length ? [{ row, messages }] : []
  })
}

interface ScheduleTimeRange { start: number; end: number }
interface ScheduleClock { hour: number; minute: number; period?: 'AM' | 'PM' }
interface ScheduleTimeEntry { time: ScheduleTimeRange | null; timeText: string }

export function splitScheduleMeetings(text: string): string[] {
  return text.trim().split(/\s*(?:[/;]|\r?\n)\s*/)
}

function parseScheduleTimes(text: string): ScheduleTimeEntry[] {
  return splitScheduleMeetings(text).map(timeText => ({ time: parseExcelScheduleTime(timeText), timeText }))
}

export function splitScheduleResources(text: string): string[] {
  // N/A is one placeholder; commas remain part of an instructor's name.
  return splitScheduleMeetings(text.replace(/\bN\s*\/\s*A\b/gi, 'N\u0000A')).map(value => value.replace(/N\u0000A/g, 'N/A'))
}

export interface ExcelScheduleRoom { code?: string; name?: string }
// Names must come from active, accepted Instructor/Program Head memberships in this department.
export interface ExcelScheduleFaculty { departmentCode: string; names: readonly string[] }

export function isExcelScheduleTba(value: string): boolean {
  return value.trim().toUpperCase() === 'TBA'
}

export function excelScheduleFacultyKeys(value: string): string[] {
  const key = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[\s,.'’–—-]+/g, '')
  const parts = value.split(',')
  return [key(value), ...(parts.length === 2 ? [key(`${parts[1]} ${parts[0]}`)] : [])].filter(Boolean)
}

function validateScheduleFaculty(records: readonly ScheduleRecord[], faculty?: ExcelScheduleFaculty) {
  const invalidFacultyRows = new Set<number>()
  const messages = new Map<number, string[]>()
  if (!faculty) return { invalidFacultyRows, messages }
  const known = new Set(faculty.names.flatMap(excelScheduleFacultyKeys))
  for (const record of records) {
    if (!record.year) continue
    const errors = new Set<string>()
    for (const offset of [0, 1]) for (const name of splitScheduleResources(record.values[13 + offset] ?? '')) {
      if (!name.trim() || isExcelScheduleTba(name) || excelScheduleFacultyKeys(name).some(key => known.has(key))) continue
      errors.add(`Faculty "${name}" (${offset === 0 ? 'Lec' : 'Lab'}) is not an active Instructor or Program Head in department "${faculty.departmentCode}".`)
    }
    if (errors.size) {
      invalidFacultyRows.add(record.row)
      messages.set(record.row, [...errors])
    }
  }
  return { invalidFacultyRows, messages }
}

export function excelScheduleRoomKey(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[\s,.-]+/g, '')
}

function validateScheduleRooms(records: readonly ScheduleRecord[], rooms?: readonly ExcelScheduleRoom[]) {
  const invalidRoomRows = new Set<number>()
  const messages = new Map<number, string[]>()
  // Undefined means the directory has not loaded; an empty directory is a valid result.
  if (!rooms) return { invalidRoomRows, messages }
  const known = new Set(rooms.flatMap(room => [room.code ?? '', room.name ?? '']).map(excelScheduleRoomKey).filter(Boolean))
  for (const record of records) {
    if (!record.year) continue
    const errors = new Set<string>()
    for (const offset of [0, 1]) for (const room of splitScheduleResources(record.values[19 + offset] ?? '')) {
      if (!room.trim() || isExcelScheduleTba(room) || known.has(excelScheduleRoomKey(room))) continue
      errors.add(`Room "${room}" (${offset === 0 ? 'Lec' : 'Lab'}) does not exist in the rooms collection.`)
    }
    if (errors.size) {
      invalidRoomRows.add(record.row)
      messages.set(record.row, [...errors])
    }
  }
  return { invalidRoomRows, messages }
}

export function parseExcelScheduleTime(text: string): ScheduleTimeRange | null {
  const parts = text.trim().replace(/\./g, '').toUpperCase().split(/\s*(?:[-–—]|\bTO\b)\s*/)
  if (parts.length !== 2) return null
  const clock = (value: string): ScheduleClock | null => {
    const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/.exec(value.trim())
    if (!match) return null
    const hour = Number(match[1]), minute = Number(match[2] ?? 0)
    const period = match[3] as ScheduleClock['period']
    return minute < 60 && hour < 24 && (!period || hour >= 1 && hour <= 12) ? { hour, minute, period } : null
  }
  const first = clock(parts[0]), last = clock(parts[1])
  if (!first || !last) return null
  const explicit = (value: ScheduleClock) => (value.period ? value.hour % 12 + (value.period === 'PM' ? 12 : 0) : value.hour) * 60 + value.minute
  const candidates = (value: ScheduleClock) => value.hour >= 1 && value.hour <= 12
    ? [value.hour % 12 * 60 + value.minute, (value.hour % 12 + 12) * 60 + value.minute] : [explicit(value)]
  let start: number, end: number
  if (first.period || last.period) {
    start = explicit(first)
    end = explicit(last)
    if (!first.period) start = candidates(first).filter(value => value < end).at(-1) ?? -1
    if (!last.period) end = candidates(last).find(value => value > start) ?? -1
  } else if (first.hour === 0 || last.hour === 0 || first.hour > 12 || last.hour > 12) {
    start = explicit(first)
    end = explicit(last)
  } else {
    // Imported daytime schedules omit AM/PM: 1–6 are afternoon, 7–11 morning, 12 noon.
    const daytime = (value: ScheduleClock) => (value.hour < 7 ? value.hour + 12 : value.hour) * 60 + value.minute
    start = daytime(first)
    end = daytime(last)
    if (end < start && last.hour < 12) end += 12 * 60
  }
  return start >= 0 && end > start && end < 24 * 60 ? { start, end } : null
}

const DAY_TOKENS = [
  ['MONDAY', 'Mon'], ['MON', 'Mon'], ['M', 'Mon'],
  ['TUESDAY', 'Tue'], ['TUES', 'Tue'], ['TUE', 'Tue'], ['TU', 'Tue'],
  ['WEDNESDAY', 'Wed'], ['WED', 'Wed'], ['W', 'Wed'],
  ['THURSDAY', 'Thu'], ['THURS', 'Thu'], ['THUR', 'Thu'], ['THU', 'Thu'], ['TH', 'Thu'], ['T', 'Tue'],
  ['FRIDAY', 'Fri'], ['FRI', 'Fri'], ['F', 'Fri'],
  ['SATURDAY', 'Sat'], ['SAT', 'Sat'], ['SA', 'Sat'],
  ['SUNDAY', 'Sun'], ['SUN', 'Sun'], ['SU', 'Sun'], ['S', 'Sat'],
] as const
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function parseExcelScheduleDays(text: string): string[] {
  let remaining = text.toUpperCase().replace(/\bAND\b/g, '').replace(/[\s/,;|&+.\-–—()]+/g, '')
  const days = new Set<string>()
  while (remaining) {
    const token = DAY_TOKENS.find(([value]) => remaining.startsWith(value))
    if (!token) return []
    days.add(token[1])
    remaining = remaining.slice(token[0].length)
  }
  return DAY_ORDER.filter(day => days.has(day))
}

interface ScheduleSession {
  row: number
  kind: 'Lec' | 'Lab'
  faculty: string
  facultyKey: string
  room: string
  roomKey: string
  days: string[]
  time: ScheduleTimeRange
  timeText: string
  sectionKey: string
  parallelGroup?: number
}

function resourceKey(text: string, room = false): string {
  const value = text.trim().toUpperCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',')
  if (/^(?:TBA|TBD|TBC|N\/?A|NONE|VACANT|TO BE ASSIGNED|TO BE ANNOUNCED|[-–—]+)$/.test(value)) return ''
  if (room && /^(?:ONLINE|VIRTUAL|ZOOM|GOOGLE MEET)$/.test(value)) return ''
  return room ? value.replace(/\s/g, '') : value
}

function validateScheduleOverlaps(records: readonly ScheduleRecord[]) {
  const sessions: ScheduleSession[] = []
  const parallelGroups = new Map<number, number>()
  let parallel: { id: number; year: ScheduleRecord['year']; subject: string; course: string; times: readonly (readonly ScheduleTimeEntry[])[] } | undefined
  let previousRow = -1
  for (const record of [...records].sort((a, b) => a.row - b.row)) {
    const code = (record.values[2] ?? '').trim().toUpperCase()
    const title = (record.values[3] ?? '').trim().toLowerCase()
    const subject = code ? `code:${code}` : title ? `title:${title}` : ''
    const course = (record.values[4] ?? '').trim().toUpperCase()
    const college = (record.values[0] ?? '').trim().toUpperCase()
    const times = [15, 16].map(field => parseScheduleTimes(record.values[field] ?? ''))
    const groupTimes = parallel?.times
    const sameTimes = groupTimes && times.every((entries, offset) => entries.length === groupTimes[offset].length
      && entries.every(({ time }, index) => time?.start === groupTimes[offset][index].time?.start && time?.end === groupTimes[offset][index].time?.end))
    // A changed Lec or Lab time ends inheritance, even if a later row returns to the original time.
    if (!record.year || !subject || record.row !== previousRow + 1 || parallel?.year !== record.year || parallel?.subject !== subject || course && parallel?.course && course !== parallel.course || !sameTimes) parallel = undefined
    previousRow = record.row
    if (!record.year) continue
    if (college === 'PARALLEL' && subject) {
      parallel ??= { id: record.row, year: record.year, subject, course, times }
    } else if (college) parallel = undefined
    if (parallel && course && !parallel.course) parallel = { ...parallel, course }
    if (parallel) parallelGroups.set(record.row, parallel.id)
    const sectionKey = (record.values[12] ?? '').trim().toUpperCase()
    for (const offset of [0, 1]) {
      const dayText = record.values[17 + offset] ?? ''
      const dayParts = splitScheduleMeetings(dayText)
      const facultyParts = splitScheduleResources(record.values[13 + offset] ?? '')
      const roomParts = splitScheduleResources(record.values[19 + offset] ?? '')
      const meetingCount = Math.max(times[offset].length, facultyParts.length, roomParts.length)
      // Match entries by position and share single values across all meetings.
      const pairedDays = meetingCount > 1 && dayParts.length === meetingCount
      const sharedDays = parseExcelScheduleDays(dayText)
      for (let index = 0; index < meetingCount; index++) {
        const entry = times[offset][times[offset].length === 1 ? 0 : index]
        if (!entry?.time) continue
        const { time, timeText } = entry
        const days = pairedDays ? parseExcelScheduleDays(dayParts[index]) : sharedDays
        if (!days.length) continue
        const faculty = facultyParts[facultyParts.length === 1 ? 0 : index] ?? ''
        const room = roomParts[roomParts.length === 1 ? 0 : index] ?? ''
        const facultyKey = resourceKey(faculty), roomKey = resourceKey(room, true)
        if (!facultyKey && !roomKey) continue
        sessions.push({ row: record.row, kind: offset === 0 ? 'Lec' : 'Lab', faculty, facultyKey, room, roomKey, days, time, timeText, sectionKey, parallelGroup: parallel?.id })
      }
    }
  }
  const overlapRows = new Set<number>()
  const messages = new Map<number, Set<string>>()
  const add = (row: number, message: string) => {
    overlapRows.add(row)
    const lines = messages.get(row) ?? new Set<string>()
    lines.add(message)
    messages.set(row, lines)
  }
  for (let first = 0; first < sessions.length; first++) for (let last = first + 1; last < sessions.length; last++) {
    const a = sessions[first], b = sessions[last]
    // Lec/Lab entries on one subject row may describe the same meeting through merged cells.
    if (a.row === b.row || a.time.start >= b.time.end || b.time.start >= a.time.end) continue
    const days = a.days.filter(day => b.days.includes(day))
    if (!days.length) continue
    const describe = (other: ScheduleSession) => `Row #${other.row + 1} (${other.kind}) on ${days.join('/')} (${other.timeText})`
    const isParallelMeeting = a.parallelGroup !== undefined && a.parallelGroup === b.parallelGroup
      && a.sectionKey && b.sectionKey && a.sectionKey !== b.sectionKey && a.kind === b.kind
      && a.time.start === b.time.start && a.time.end === b.time.end
      && a.days.length === b.days.length && a.days.every(day => b.days.includes(day))
    if (a.facultyKey && a.facultyKey === b.facultyKey && !isParallelMeeting) {
      add(a.row, `Faculty "${a.faculty}" (${a.kind}) is also assigned on ${describe(b)}.`)
      add(b.row, `Faculty "${b.faculty}" (${b.kind}) is also assigned on ${describe(a)}.`)
    }
    if (a.roomKey && a.roomKey === b.roomKey) {
      add(a.row, `Room "${a.room}" (${a.kind}) is also booked on ${describe(b)}.`)
      add(b.row, `Room "${b.room}" (${b.kind}) is also booked on ${describe(a)}.`)
    }
  }
  return { overlapRows, messages, parallelGroups }
}

interface DuplicateSubjectGroup {
  section: string
  subject: string
  field: 'code' | 'descriptive title'
  rows: Set<number>
}

const REQUIRED_SCHEDULE_VALUES = [
  [2, 'Code'], [3, 'Descriptive Title'], [12, 'Section'],
] as const
const REQUIRED_SCHEDULE_PAIRS = [[13, 'Faculty'], [15, 'F2F Time'], [17, 'F2F Days'], [19, 'F2F Room']] as const

function validateMissingScheduleValues(records: readonly ScheduleRecord[]) {
  const missingValueRows = new Set<number>()
  const messages = new Map<number, string[]>()
  for (const record of records) {
    // Year labels and empty separators are not subject rows. Core values remain unmerged.
    if (!record.year || !record.values.slice(2, 13).some(value => value.trim())) continue
    const empty = (field: number) => !(record.values[field] ?? '').trim()
    const rowMessages: string[] = []
    for (const [field, label] of REQUIRED_SCHEDULE_VALUES) if (empty(field)) rowMessages.push(`Missing ${label}.`)
    for (const [field, label] of REQUIRED_SCHEDULE_PAIRS) if (empty(field) && empty(field + 1)) rowMessages.push(`Missing ${label} (both Lec and Lab are empty).`)
    if (rowMessages.length) {
      missingValueRows.add(record.row)
      messages.set(record.row, rowMessages)
    }
  }
  return { missingValueRows, messages }
}

// Match DepartmentEditScheduleModal: a section cannot repeat either a code or a title.
// Each year is checked independently; blank fields never match one another.
export function validateExcelSchedule(records: readonly ScheduleRecord[], rooms?: readonly ExcelScheduleRoom[], faculty?: ExcelScheduleFaculty): ExcelScheduleValidation {
  const overlaps = validateScheduleOverlaps(records)
  const missing = validateMissingScheduleValues(records)
  const roomValidation = validateScheduleRooms(records, rooms)
  const facultyValidation = validateScheduleFaculty(records, faculty)
  const subjects = new Map<string, DuplicateSubjectGroup>()
  for (const record of records) {
    if (!record.year) continue
    const section = (record.values[12] ?? '').trim().toUpperCase()
    if (!section) continue
    for (const field of [2, 3]) {
      const subject = (record.values[field] ?? '').trim()
      const value = field === 2 ? subject.toUpperCase() : subject.toLowerCase()
      if (!value) continue
      const key = JSON.stringify([record.year, section, field, value])
      const group = subjects.get(key) ?? { section, subject: field === 2 ? value : subject, field: field === 2 ? 'code' : 'descriptive title', rows: new Set<number>() }
      group.rows.add(record.row)
      subjects.set(key, group)
    }
  }
  const duplicateSubjectRows = new Set<number>()
  const groupsByRow = new Map<number, DuplicateSubjectGroup[]>()
  for (const group of subjects.values()) if (group.rows.size > 1) {
    for (const row of group.rows) {
      duplicateSubjectRows.add(row)
      groupsByRow.set(row, [...(groupsByRow.get(row) ?? []), group])
    }
  }
  return {
    duplicateSubjectRows,
    overlapRows: overlaps.overlapRows,
    missingValueRows: missing.missingValueRows,
    invalidRoomRows: roomValidation.invalidRoomRows,
    invalidFacultyRows: facultyValidation.invalidFacultyRows,
    missingMessagesForRow: row => missing.messages.get(row) ?? [],
    parallelGroupForRow: row => overlaps.parallelGroups.get(row),
    messagesForRow: row => {
      const groups = groupsByRow.get(row) ?? []
      const codeGroups = groups.filter(group => group.field === 'code')
      const duplicateMessages = (codeGroups.length ? codeGroups : groups).map(group => {
        const others = [...group.rows].filter(other => other !== row).sort((a, b) => a - b).map(other => `#${other + 1}`)
        return `Section "${group.section}" already has ${group.field} "${group.subject}" on ${others.length === 1 ? 'Row' : 'Rows'} ${others.join(', ')}.`
      })
      return [...(overlaps.messages.get(row) ?? []), ...duplicateMessages, ...(roomValidation.messages.get(row) ?? []), ...(facultyValidation.messages.get(row) ?? [])]
    },
  }
}
