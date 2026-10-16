import type { DepartmentCourse, TemplateIssue } from './departmentScheduleTemplates'
import type { DepartmentCourseSuggestion } from './departmentCourseSuggestions'
import type { ScheduleRecord } from './excelScheduleTemplate'
import type { ScheduleDirectory, WorkbookScheduleRow } from './excelScheduleRows.ts'
import type { DepartmentWorkbookTerm } from './departmentWorkbookPaths.ts'
import type { ScheduleMeetingRecord } from './scheduleMeetings.ts'
import { scheduleMatchesTerm } from './roomSchedule.ts'

export type FacultyMembershipStatus = 'valid' | 'missing' | 'tba' | 'invalid'

export function facultyMembershipStatus(name: string, departmentNames?: readonly string[]): FacultyMembershipStatus | undefined {
  const faculty = name.replace(/\s*\(NEW\)\s*$/i, '').trim()
  if (!faculty) return 'missing'
  if (/^TBA$/i.test(faculty)) return 'tba'
  if (!departmentNames) return undefined
  const keys = excelScheduleFacultyKeys(faculty)
  const matches = departmentNames.filter(member => excelScheduleFacultyKeys(member).some(key => keys.includes(key)))
  return matches.length === 1 ? 'valid' : 'invalid'
}

export function facultyMembershipIssue(name: string, status?: FacultyMembershipStatus): { message: string; tone?: 'warning' } | undefined {
  if (status === 'missing') return { message: 'Faculty is missing; assign an Instructor or Program Head from this department.' }
  if (status === 'tba') return { message: 'Faculty is TBA; an Instructor or Program Head still needs to be assigned.', tone: 'warning' }
  if (status === 'invalid') return { message: `Faculty "${name}" does not match a unique active Instructor or Program Head in this department.` }
}

export interface FacultySubjectAssignment {
  location: string
  code: string
  section: string
  durationMinutes?: number
  day?: string
  start?: number
  end?: number
  faculty?: string
  facultyStatus?: FacultyMembershipStatus
  departmentCode?: string
  instructorId?: string
  room?: string
  roomId?: string
  roomExists?: boolean
  days?: readonly string[]
  rowKey?: string
  sectionScope?: string
  subjectTitle?: string
  description?: string
  timeText?: string
  parallelGroup?: string
  meetingKind?: WorkbookScheduleRow['meetings'][number]['format']
  roomColumn?: number
  roomEntryIndex?: number
}

const subjectKey = (value: string) => value.toUpperCase().replace(/\s+/g, '')

/** Canonicalize complete subject entries without guessing a missing section. */
export function formatFacultySubject(value: string): string {
  const match = /^\s*([A-Z]{3})\s*(\d{1,3})\s*(?:-\s*([A-Z0-9]+))?\s*$/i.exec(value)
  if (!match) return value
  const section = match[3]
  return `${match[1].toUpperCase()} ${match[2].padStart(3, '0')}${section ? `-${section.toUpperCase()}` : ''}`
}

const assigned = (value: string | undefined) => Boolean(value?.trim()
  && !/^(?:TBA|TBD|TBC|N\/?A|NONE|VACANT|TO BE ASSIGNED|TO BE ANNOUNCED|[-–—]+)$/i.test(value.trim()))

export function scheduleRoomStatusIssue(room: Pick<ScheduleDirectory['rooms'][number], 'name' | 'code' | 'status'>): string | undefined {
  const status = room.status?.trim().toLowerCase()
  const name = room.name.trim() || room.code.trim()
  if (status === 'unavailable') return `Room ${name} is unavailable. Choose an available room.`
  if (status === 'maintenance') return `Room ${name} is under maintenance. Choose an available room.`
}

export function areParallelFacultyMeetings(a: FacultySubjectAssignment, b: FacultySubjectAssignment): boolean {
  if (a.parallelGroup === undefined || a.parallelGroup !== b.parallelGroup) return false
  if (a.rowKey && b.rowKey && a.rowKey === b.rowKey) return false
  const sameFaculty = a.instructorId && b.instructorId ? a.instructorId === b.instructorId
    : excelScheduleFacultyKeys((a.faculty ?? '').replace(/\s*\(NEW\)\s*$/i, '')).some(key => excelScheduleFacultyKeys((b.faculty ?? '').replace(/\s*\(NEW\)\s*$/i, '')).includes(key))
  const aDays = a.days ?? (a.day ? [a.day] : []), bDays = b.days ?? (b.day ? [b.day] : [])
  return Boolean(sameFaculty && assigned(a.faculty) && assigned(b.faculty)
    && subjectKey(a.code || a.subjectTitle || '') !== ''
    && subjectKey(a.code || a.subjectTitle || '') === subjectKey(b.code || b.subjectTitle || '')
    && (!a.section.trim() || !b.section.trim() || subjectKey(a.section) !== subjectKey(b.section))
    && a.meetingKind === b.meetingKind && a.start !== undefined && a.end !== undefined
    && a.end > a.start && a.start === b.start && a.end === b.end
    && aDays.length > 0 && aDays.length === bDays.length && aDays.every(day => bDays.includes(day)))
}

export function parallelRoomPosition(room: ScheduleDirectory['rooms'][number]) {
  const match = [room.code, room.name].map(value => /^(.*?)(\d+)([A-Z]*)$/.exec(excelScheduleRoomKey(value))).find(Boolean)
  return match ? { building: room.buildingId, prefix: match[1], number: Number(match[2]), suffix: match[3],
    floor: room.floor ?? Math.floor(Number(match[2]) / 100) } : undefined
}

/** A parallel group may be left unassigned for plotting, but a partial room assignment is invalid. */
export function parallelRoomAssignmentIssue(assignments: readonly FacultySubjectAssignment[],
  rooms: ReadonlyArray<ScheduleDirectory['rooms'][number]>, target: FacultySubjectAssignment): string | undefined {
  if (target.parallelGroup === undefined) return
  const group = assignments.filter(other => other === target || areParallelFacultyMeetings(target, other))
  if (group.length < 2 || !group.some(member => assigned(member.room))) return
  const sections = new Map<string, FacultySubjectAssignment[]>()
  for (const member of group) {
    const key = member.rowKey ?? member.location
    sections.set(key, [...(sections.get(key) ?? []), member])
  }
  const resolved = (member: FacultySubjectAssignment) => {
    if (!assigned(member.room)) return false
    const matches = member.roomId ? rooms.filter(room => room.id === member.roomId)
      : rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(member.room!)))
    return matches.length === 1
  }
  const assignedSections = [...sections.values()].filter(meetings => meetings.every(resolved)).length
  if (assignedSections === sections.size) return
  return `All ${sections.size} parallel sections must have assigned rooms. ${assignedSections} of ${sections.size} rooms assigned.`
}

/** Room-number adjacency is the workbook's connection rule; use real building/floor metadata. */
export function parallelRoomConnectionIssue(assignments: readonly FacultySubjectAssignment[],
  rooms: ReadonlyArray<ScheduleDirectory['rooms'][number]>, target: FacultySubjectAssignment): string | undefined {
  if (target.parallelGroup === undefined) return
  const group = assignments.filter(other => other === target || areParallelFacultyMeetings(target, other))
  if (group.length < 2) return
  const resolved = group.flatMap(assignment => {
    if (!assigned(assignment.room)) return []
    const matches = assignment.roomId ? rooms.filter(room => room.id === assignment.roomId)
      : rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(assignment.room!)))
    return matches.length === 1 ? [matches[0]] : []
  })
  if (resolved.length < 2) return
  const positions = resolved.map(parallelRoomPosition)
  const first = positions[0]
  const sameLocation = first && first.building && positions.every(position => position && position.building === first.building
    && position.floor === first.floor && position.prefix === first.prefix && position.suffix === first.suffix)
  const numbers = positions.map(position => position?.number ?? NaN).sort((a, b) => a - b)
  if (sameLocation && numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)) return
  return `Parallel classes must use separate, consecutive rooms in the same building and floor. Assigned rooms: ${resolved.map(room => room.code || room.name).join(' / ')}.`
}

export function facultyScheduleOverlap(a: FacultySubjectAssignment, b: FacultySubjectAssignment) {
  if (a.start === undefined || a.end === undefined || b.start === undefined || b.end === undefined
    || a.end <= a.start || b.end <= b.start || a.start >= b.end || b.start >= a.end) return null
  const days = (a.days ?? (a.day ? [a.day] : [])).filter(day => (b.days ?? (b.day ? [b.day] : [])).includes(day))
  if (!days.length) return null
  const sameFaculty = a.instructorId && b.instructorId ? a.instructorId === b.instructorId
    : excelScheduleFacultyKeys((a.faculty ?? '').replace(/\s*\(NEW\)\s*$/i, '')).some(key => excelScheduleFacultyKeys((b.faculty ?? '').replace(/\s*\(NEW\)\s*$/i, '')).includes(key))
  const sameRoom = a.roomId && b.roomId ? a.roomId === b.roomId
    : excelScheduleRoomKey(a.room ?? '') === excelScheduleRoomKey(b.room ?? '')
  return areParallelFacultyMeetings(a, b) ? null : { days, sameFaculty, sameRoom }
}

export function facultyScheduleRoomConflict(a: FacultySubjectAssignment, b: FacultySubjectAssignment): boolean {
  return Boolean(assigned(a.room) && assigned(b.room) && facultyScheduleOverlap(a, b)?.sameRoom)
}

export function facultyScheduleInstructorConflict(a: FacultySubjectAssignment, b: FacultySubjectAssignment): boolean {
  return Boolean(assigned(a.faculty) && assigned(b.faculty) && facultyScheduleOverlap(a, b)?.sameFaculty)
}

/** Only active saved room meetings from other departments in this exact term. */
export function departmentExternalRoomAssignments(meetings: readonly ScheduleMeetingRecord[], term: DepartmentWorkbookTerm,
  rooms: ScheduleDirectory['rooms']): FacultySubjectAssignment[] {
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const time = (value: unknown): number | undefined => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text(value))
    return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : undefined
  }
  return meetings.flatMap(meeting => {
    const department = text(meeting.department)
    if (!department || department.toUpperCase() === term.departmentCode.trim().toUpperCase() || meeting.departmentId === term.departmentId
      || meeting.isActive === false || !/^(?:DRAFT(?:ED)?|PLOT(?:TED)?|REVISE[D]?)$/i.test(text(meeting.status) || 'Draft')) return []
    if (!(text(meeting.academicYearId) || text(meeting.academicYear)) || !(text(meeting.semesterKey) || text(meeting.semester))
      || !scheduleMatchesTerm(meeting, { id: term.academicYearId, academicYear: term.academicYear }, term.semester)) return []
    const start = time(meeting.startTime), end = time(meeting.endTime)
    const days = [...new Set((Array.isArray(meeting.days) ? meeting.days : []).flatMap(value => {
      const day = DAY_ORDER.find(day => day.toUpperCase() === text(value).slice(0, 3).toUpperCase())
      return day ? [day] : []
    }))]
    if (start === undefined || end === undefined || end <= start || !days.length) return []
    const roomId = text(meeting.roomId), roomText = text(meeting.room) || text(meeting.roomName)
    if (roomText && !assigned(roomText)) return []
    const matches = roomId ? rooms.filter(room => room.id === roomId)
      : rooms.filter(room => roomText && [room.name, room.code].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(roomText)))
    const room = matches.length === 1 ? matches[0] : undefined
    const label = roomText || room?.name || room?.code || ''
    if (!assigned(label)) return []
    return [{ location: meeting.id, code: '', section: '', departmentCode: department, room: label, roomId: roomId || room?.id,
      days, start, end, timeText: `${clock(start)}–${clock(end)}` }]
  })
}

export function validateOtherDepartmentRoomAssignments(assignments: readonly FacultySubjectAssignment[],
  external: readonly FacultySubjectAssignment[]): TemplateIssue[] {
  const issues = new Map<string, TemplateIssue>()
  for (const assignment of assignments) for (const other of external) {
    if (!other.departmentCode || !facultyScheduleRoomConflict(assignment, other)) continue
    const overlap = facultyScheduleOverlap(assignment, other)!
    const message = `${other.departmentCode} is also using Room ${assignment.room} on ${overlap.days.map(day => day.toUpperCase()).join('/')} (${other.timeText}).`
    issues.set(JSON.stringify([assignment.location, message]), { severity: 'warning', location: assignment.location, message })
  }
  return [...issues.values()]
}

/** Only instructor/room overlaps, duplicate subjects, department membership and room existence. */
export function validateFacultyScheduleAssignments(
  assignments: readonly FacultySubjectAssignment[], _courses: readonly DepartmentCourse[] = [],
  rooms: ReadonlyArray<ScheduleDirectory['rooms'][number]> = [],
): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  const seen = new Set<string>()
  const warn = (assignment: FacultySubjectAssignment, message: string) => {
    const key = JSON.stringify([assignment.location, message])
    if (seen.has(key)) return
    seen.add(key)
    issues.push({ severity: 'warning', location: assignment.location, message })
  }
  const bySection = new Map<string, FacultySubjectAssignment[]>()
  for (const assignment of assignments) {
    const roomAssignmentIssue = parallelRoomAssignmentIssue(assignments, rooms, assignment)
    if (roomAssignmentIssue) warn(assignment, roomAssignmentIssue)
    const roomConnectionIssue = parallelRoomConnectionIssue(assignments, rooms, assignment)
    if (roomConnectionIssue) warn(assignment, roomConnectionIssue)
    if (assigned(assignment.faculty) && assignment.facultyStatus === 'invalid') {
      warn(assignment, `${assignment.faculty} is not an active member of ${assignment.departmentCode || 'this department'}.`)
    }
    if (assigned(assignment.room) && assignment.roomExists === false) {
      warn(assignment, `Room ${assignment.room} does not exist in the rooms collection.`)
    }
    if (assigned(assignment.room)) {
      const matches = assignment.roomId ? rooms.filter(room => room.id === assignment.roomId)
        : rooms.filter(room => [room.code, room.name].some(value => excelScheduleRoomKey(value) === excelScheduleRoomKey(assignment.room!)))
      if (matches.length === 1) {
        const roomStatusIssue = scheduleRoomStatusIssue(matches[0])
        if (roomStatusIssue) warn(assignment, roomStatusIssue)
      }
    }
    for (const [field, subject] of [assignment.code, assignment.subjectTitle ?? ''].entries()) {
      if (!subject.trim() || !assignment.section.trim()) continue
      const key = JSON.stringify([assignment.sectionScope ?? '', field, subjectKey(subject), subjectKey(assignment.section)])
      const group = bySection.get(key) ?? []
      group.push(assignment)
      bySection.set(key, group)
    }
  }

  for (const group of bySection.values()) {
    // Repeated days and Lec/Lab meetings belonging to one subject row are one class.
    const rowKey = (assignment: FacultySubjectAssignment) => assignment.rowKey
      ?? JSON.stringify([subjectKey(assignment.code), assignment.sectionScope, assignment.instructorId || assignment.faculty])
    const rows = new Map(group.map(assignment => [rowKey(assignment), assignment]))
    if (rows.size < 2) continue
    for (const assignment of group) for (const [otherKey, other] of rows) {
      if (otherKey === rowKey(assignment)) continue
      const row = /(?:^|·\s*)(Row \d+)$/.exec(other.description ?? '')?.[1] ?? other.description ?? other.location
      warn(assignment, `Duplicate Subject ${assignment.code || assignment.subjectTitle} for Section ${assignment.section} · ${row}.`)
    }
  }
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
    const a = assignments[i], b = assignments[j]
    const overlap = facultyScheduleOverlap(a, b)
    if (!overlap || a.start === undefined || a.end === undefined || b.start === undefined || b.end === undefined) continue
    const { days, sameFaculty, sameRoom } = overlap
    const formatTime = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    const describe = (other: FacultySubjectAssignment, start: number, end: number) =>
      `${other.description ?? other.location} on ${days.map(day => day.slice(0, 3)).join('/')} (${other.timeText || `${formatTime(start)}-${formatTime(end)}`})`
    for (const [same, resource, value] of [[sameFaculty, 'Instructor', a.faculty], [sameRoom, 'Room', a.room]] as const) {
      if (!same || !assigned(value) || !assigned(resource === 'Room' ? b.room : b.faculty)) continue
      const prefix = resource === 'Room' ? 'Room ' : ''
      warn(a, `${prefix}${value} is also assigned on ${describe(b, b.start, b.end)}.`)
      warn(b, `${prefix}${resource === 'Room' ? b.room : b.faculty} is also assigned on ${describe(a, a.start, a.end)}.`)
    }
  }
  return issues
}

export const facultyScheduleRowKey = (sheet: string, row: number) => JSON.stringify([sheet, row])

export type DepartmentCourseIdentity = Pick<DepartmentCourseSuggestion, 'code' | 'title'>
export const SCHEDULE_COLLEGE_CHOICES = ['OPEN LAB', 'LECTURE', 'LABORATORY', 'PARALLEL'] as const

/** College controls only Faculty, Time, Day and Room Lec/Lab columns. */
export function isScheduleColumnEditable(college: string, column: number): boolean {
  if (column < 13 || column > 20) return true
  const normalized = college.trim().replace(/\s+/g, ' ').toUpperCase().replace(/^OPENLAB$/, 'OPEN LAB')
  if (normalized === 'OPEN LAB') return true
  return column % 2 === 1 ? normalized === 'LECTURE' || normalized === 'PARALLEL' : normalized === 'LABORATORY'
}

/** Blank College cells that continue the same parallel subject inherit its Lec edit rule. */
export function scheduleEditableColleges(
  rows: readonly { values: readonly string[] }[],
  yearSections?: readonly { start: number; count: number }[],
  overrides?: ReadonlyMap<string, string>,
): string[] {
  const colleges: string[] = []
  let parallel: { code: string; title: string; course: string } | undefined
  let sectionEnd = rows.length
  for (let index = 0; index < rows.length; index++) {
    const section = yearSections?.find(item => item.start === index)
    if (section) { parallel = undefined; sectionEnd = section.start + section.count }
    if (index >= sectionEnd) parallel = undefined
    const value = (column: number) => (overrides?.get(`${index}:${column}`) ?? rows[index].values[column] ?? '').trim()
    const college = value(0).replace(/\s+/g, ' ').toUpperCase()
    const code = value(2).toUpperCase()
    const title = value(3).toLowerCase()
    const course = value(4).toUpperCase()
    if (college === 'PARALLEL') parallel = code || title ? { code, title, course } : undefined
    else if (college || !parallel || !(code && parallel.code && code === parallel.code || title && parallel.title && title === parallel.title)
      || course && parallel.course && course !== parallel.course) parallel = undefined
    colleges.push(college || (parallel ? 'PARALLEL' : ''))
    if (parallel && course && !parallel.course) parallel.course = course
  }
  return colleges
}

export function isValidScheduleCollege(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, ' ').toUpperCase()
  return !normalized || SCHEDULE_COLLEGE_CHOICES.some(choice => choice.toUpperCase() === normalized)
}

export const isScheduleTbaNotice = (message: string) => message.startsWith('TBA: ')

export function scheduleValidationTone(messages: readonly string[]): 'blue' | 'purple' | 'danger' {
  if (messages.some(message => !isScheduleTbaNotice(message) && !message.startsWith('Duplicate Subject '))) return 'danger'
  return messages.some(message => message.startsWith('Duplicate Subject ')) ? 'purple' : 'blue'
}

export function scheduleTbaNotices(row: WorkbookScheduleRow): string[] {
  return [13, 14, 15, 16, 17, 18, 19, 20].flatMap(column => {
    if (!splitScheduleResources(row.rawValues[column] ?? '').some(isExcelScheduleTba)) return []
    const field = ['Faculty', 'Time', 'Day', 'Room'][Math.floor((column - 13) / 2)]
    return [`TBA: ${field} (${column % 2 ? 'Lec' : 'Lab'}) is still to be assigned.`]
  })
}

/** Check subject identities against the department's published course directory. */
export function validateDepartmentScheduleCourseRows(rows: readonly WorkbookScheduleRow[],
  courses: readonly DepartmentCourseIdentity[]): ReadonlyMap<string, readonly string[]> {
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase()
  const titlesByCode = new Map<string, Set<string>>()
  const titles = new Set<string>()
  for (const course of courses) {
    const code = normalize(course.code)
    const title = normalize(course.title)
    const codeTitles = titlesByCode.get(code) ?? new Set<string>()
    codeTitles.add(title)
    titlesByCode.set(code, codeTitles)
    titles.add(title)
  }
  const messages = new Map<string, readonly string[]>()
  for (const row of rows) {
    const issues: string[] = []
    const code = normalize(row.subjectCode)
    const title = normalize(row.subjectTitle)
    const hasCode = Boolean(code) && !isExcelScheduleTba(code)
    const hasTitle = Boolean(title) && !isExcelScheduleTba(title)
    if (hasCode && !titlesByCode.has(code)) issues.push(`Code ${row.subjectCode} does not exist in the department courses.`)
    if (hasTitle && !titles.has(title)) issues.push(`Descriptive title ${row.subjectTitle} does not exist in the department courses.`)
    if (hasCode && hasTitle && titlesByCode.has(code) && titles.has(title) && !titlesByCode.get(code)!.has(title)) {
      issues.push(`Code ${row.subjectCode} and descriptive title ${row.subjectTitle} do not match the same department course.`)
    }
    if (issues.length) messages.set(facultyScheduleRowKey(row.sourceSheet, row.sourceRow), issues)
  }
  return messages
}

/** Validate parsed 21-column workbook rows, including multiple meetings in each Lec/Lab cell. */
export function validateDepartmentFacultyScheduleRows(rows: readonly WorkbookScheduleRow[], directory: ScheduleDirectory,
  rowDescriptions: ReadonlyMap<string, string> = new Map(), courses?: readonly DepartmentCourseIdentity[]): ReadonlyMap<string, readonly string[]> {
  const assignments = departmentFacultyScheduleAssignments(rows, directory, rowDescriptions)
  const courseIssues = courses === undefined ? new Map<string, readonly string[]>() : validateDepartmentScheduleCourseRows(rows, courses)
  const messages = new Map<string, string[]>()
  for (const issue of validateFacultyScheduleAssignments(assignments, [], directory.rooms)) messages.set(issue.location, [...(messages.get(issue.location) ?? []), issue.message])
  for (const issue of validateOtherDepartmentRoomAssignments(assignments, directory.externalRoomAssignments ?? [])) {
    messages.set(issue.location, [...(messages.get(issue.location) ?? []), issue.message])
  }
  for (const row of rows) {
    const location = facultyScheduleRowKey(row.sourceSheet, row.sourceRow)
    const issues = new Set(messages.get(location) ?? [])
    if (!isValidScheduleCollege(row.college)) {
      issues.add(`${row.college} is not a valid College. Choose OPEN LAB, LECTURE, LABORATORY, or PARALLEL.`)
    }
    for (const meeting of row.meetings) {
      if (meeting.time.trim() && !isExcelScheduleTba(meeting.time) && !parseExcelScheduleTime(meeting.time)) {
        issues.add(`${meeting.time} is not a valid time. Use a range such as 7:30-9:00 or select TBA.`)
      }
      if (meeting.day.trim() && !isValidExcelScheduleDays(meeting.day)) {
        issues.add(`${meeting.day} is not a valid day. Use MON, TUE, WED, THU, FRI, SAT, SUN, or TBA.`)
      }
    }
    for (const issue of courseIssues.get(location) ?? []) issues.add(issue)
    for (const notice of scheduleTbaNotices(row)) issues.add(notice)
    if (issues.size) messages.set(location, [...issues])
  }
  return messages
}

export function departmentFacultyScheduleAssignments(rows: readonly WorkbookScheduleRow[], directory: ScheduleDirectory,
  rowDescriptions: ReadonlyMap<string, string> = new Map()): FacultySubjectAssignment[] {
  const names = directory.faculty.filter(member => member.department === directory.departmentCode).map(member => member.fullName)
  return rows.flatMap(row => {
    const location = facultyScheduleRowKey(row.sourceSheet, row.sourceRow)
    const base = { location, rowKey: location, departmentCode: directory.departmentCode,
      parallelGroup: row.parallelSourceRow === null ? undefined : facultyScheduleRowKey(row.sourceSheet, row.parallelSourceRow),
      description: rowDescriptions.get(location) ?? `Year ${row.yearLevel} · Row ${row.sourceRow}`, code: row.subjectCode, subjectTitle: row.subjectTitle,
      section: row.classSection, sectionScope: JSON.stringify([row.yearLevel, subjectKey(row.course)]) }
    if (!row.meetings.length) return [base]
    const indexes = new Map<string, number>()
    return row.meetings.map(meeting => {
      const index = indexes.get(meeting.format) ?? 0
      indexes.set(meeting.format, index + 1)
      const roomColumn = meeting.format === 'Lec' ? 19 : 20
      return { ...base, faculty: meeting.faculty, timeText: meeting.time, meetingKind: meeting.format,
      roomColumn, roomEntryIndex: splitScheduleResources(row.rawValues[roomColumn] ?? '').length <= 1 ? 0 : index,
      facultyStatus: !directory.departmentCode ? undefined : names.some(name => excelScheduleFacultyKeys(name).some(key => excelScheduleFacultyKeys(meeting.faculty.replace(/\s*\(NEW\)\s*$/i, '')).includes(key)))
        ? 'valid' as const : facultyMembershipStatus(meeting.faculty, names),
      instructorId: meeting.instructorId, room: meeting.room, roomId: meeting.roomId,
      roomExists: directory.rooms.some(room => [room.code, room.name].some(name => excelScheduleRoomKey(name) === excelScheduleRoomKey(meeting.room))),
      days: meeting.days,
      start: /^\d{2}:\d{2}$/.test(meeting.startTime) ? Number(meeting.startTime.slice(0, 2)) * 60 + Number(meeting.startTime.slice(3)) : undefined,
      end: /^\d{2}:\d{2}$/.test(meeting.endTime) ? Number(meeting.endTime.slice(0, 2)) * 60 + Number(meeting.endTime.slice(3)) : undefined }
    })
  })
}

export interface RoomScheduleEntry {
  code: string
  section: string
  day: string
  start: number
  end: number
  room: string
  location: string
  invalidSlot?: boolean
}

export const formatRoomSubject = (value: string): string => formatFacultySubject(value)
export type RoomScheduleSlot = Pick<RoomScheduleEntry, 'day' | 'start' | 'end'>
const classKey = (code: string, section: string) => formatRoomSubject(`${code}${section ? `-${section}` : ''}`).toUpperCase().replace(/\s/g, '')
const clock = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
const label = (entry: { code: string; section: string }) => formatRoomSubject(`${entry.code}${entry.section ? `-${entry.section}` : ''}`)
const compatible = (entry: RoomScheduleSlot, meeting: FacultySubjectAssignment) => meeting.start !== undefined && meeting.end !== undefined
  && (entry.start >= meeting.start && entry.end <= meeting.end || meeting.start >= entry.start && meeting.end <= entry.end)

export function validateRoomScheduleEntries(entries: readonly RoomScheduleEntry[], faculty: readonly FacultySubjectAssignment[]): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  const warn = (entry: RoomScheduleEntry, message: string) => issues.push({ severity: 'warning', location: entry.location, message })
  for (const entry of entries) {
    const meetings = faculty.filter(meeting => classKey(meeting.code, meeting.section) === classKey(entry.code, entry.section))
    if (!meetings.length) {
      warn(entry, `${label(entry)} is not in Faculty Schedules; no room was assigned.`)
      continue
    }
    if (entry.invalidSlot) continue
    const days = meetings.filter(meeting => meeting.day === entry.day)
    for (const meeting of days.filter(meeting => compatible(entry, meeting))) {
      const facultyIssue = facultyMembershipIssue(meeting.faculty ?? '', meeting.facultyStatus)
      if (facultyIssue) issues.push({ severity: 'warning', location: entry.location, ...facultyIssue })
    }
    const expected = meetings.filter(meeting => meeting.day && meeting.start !== undefined && meeting.end !== undefined)
      .map(meeting => `${meeting.day} ${clock(meeting.start!)}–${clock(meeting.end!)}`)
    if (!days.length) warn(entry, `${label(entry)} is on the wrong day (${entry.day}). Faculty Schedules: ${[...new Set(expected)].join(', ')}.`)
    else if (!days.some(meeting => compatible(entry, meeting))) warn(entry,
      `${label(entry)} is at the wrong time (${entry.day} ${clock(entry.start)}–${clock(entry.end)}). Faculty Schedules: ${[...new Set(expected)].join(', ')}.`)
  }
  for (const entry of entries) {
    const duplicates = entries.filter(other => !entry.invalidSlot && !other.invalidSlot && other !== entry && classKey(other.code, other.section) === classKey(entry.code, entry.section)
      && other.day === entry.day && other.start < entry.end && entry.start < other.end)
    if (duplicates.length) warn(entry, `Duplicate class ${label(entry)} on ${entry.day} ${clock(entry.start)}–${clock(entry.end)} in ${[...new Set([entry.room, ...duplicates.map(other => other.room)])].join(', ')}.`)
  }
  return issues
}

/** Offer only unassigned meeting intervals; mismatched entries stay excluded until corrected. */
export function roomScheduleSuggestions(faculty: readonly FacultySubjectAssignment[], entries: readonly RoomScheduleEntry[],
  courses: readonly DepartmentCourse[], editingLocation?: string, editingSlot?: RoomScheduleSlot): DepartmentCourseSuggestion[] {
  const entered = entries.filter(entry => entry.location !== editingLocation)
  const groups = new Map<string, FacultySubjectAssignment[]>()
  for (const meeting of faculty) {
    if (meeting.facultyStatus && meeting.facultyStatus !== 'valid') continue
    if (!meeting.section || meeting.start === undefined || meeting.end === undefined || !meeting.day) continue
    const key = classKey(meeting.code, meeting.section)
    groups.set(key, [...(groups.get(key) ?? []), meeting])
  }
  for (const [key, meetings] of groups) {
    const assignments = entered.filter(entry => classKey(entry.code, entry.section) === key)
    // Preserve the exclusion of incorrectly placed classes requested by the editor flow.
    if (assignments.some(entry => entry.invalidSlot || !meetings.some(meeting => meeting.day === entry.day && compatible(entry, meeting)))) {
      groups.delete(key)
      continue
    }
    const unassigned = meetings.flatMap(meeting => {
      let intervals = [{ start: meeting.start!, end: meeting.end! }]
      for (const entry of assignments) {
        if (entry.day !== meeting.day || !compatible(entry, meeting)) continue
        intervals = intervals.flatMap(interval => {
          if (entry.end <= interval.start || entry.start >= interval.end) return [interval]
          return [
            ...(interval.start < entry.start ? [{ start: interval.start, end: entry.start }] : []),
            ...(interval.end > entry.end ? [{ start: entry.end, end: interval.end }] : []),
          ]
        })
      }
      return intervals.map(interval => ({ ...meeting, ...interval, durationMinutes: interval.end - interval.start }))
    })
    if (unassigned.length) groups.set(key, unassigned)
    else groups.delete(key)
  }
  const priority = (meetings: readonly FacultySubjectAssignment[]) => {
    if (!editingSlot) return 2
    if (meetings.some(meeting => meeting.day === editingSlot.day && meeting.start === editingSlot.start && meeting.end === editingSlot.end)) return 0
    return meetings.some(meeting => meeting.day === editingSlot.day && compatible(editingSlot, meeting)) ? 1 : 2
  }
  return [...groups.entries()].sort((left, right) => priority(left[1]) - priority(right[1])).map(([key, meetings]) => {
    const first = meetings[0]
    const course = courses.find(item => classKey(item.code, '') === classKey(first.code, ''))
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const schedules = [...new Set([...meetings].sort((left, right) => weekdays.indexOf(left.day!) - weekdays.indexOf(right.day!)
      || left.start! - right.start!).map(meeting => `${meeting.faculty ?? ''} · ${meeting.day} ${clock(meeting.start!)}–${clock(meeting.end!)}`))]
    return { ...(course ?? { yearLevel: 0, semester: 0, type: '', credits: null, session: '' }),
      code: label(first), title: course?.title ?? 'Course not found in Department Courses', schedules, sourceCell: key, matchesRoomSlot: priority(meetings) < 2 }
  })
}

export interface ExcelScheduleRowIssues {
  row: number
  messages: readonly string[]
}

interface ScheduleTimeRange { start: number; end: number }
interface ScheduleClock { hour: number; minute: number }
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

export function isExcelScheduleTba(value: string): boolean {
  return value.trim().toUpperCase() === 'TBA'
}

export function excelScheduleFacultyKeys(value: string): string[] {
  const key = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[\s,.'’–—-]+/g, '')
  const parts = value.split(',')
  return [key(value), ...(parts.length === 2 ? [key(`${parts[1]} ${parts[0]}`)] : [])].filter(Boolean)
}

export function excelScheduleRoomKey(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[\s,.-]+/g, '')
}

export function parseExcelScheduleTime(text: string): ScheduleTimeRange | null {
  const parts = text.trim().replace(/\./g, '').toUpperCase().split(/\s*(?:[-–—]|\bTO\b)\s*/)
  if (parts.length !== 2) return null
  const clock = (value: string): ScheduleClock | null => {
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(value.trim())
    if (!match) return null
    const hour = Number(match[1]), minute = Number(match[2] ?? 0)
    return minute < 60 && hour < 24 ? { hour, minute } : null
  }
  const first = clock(parts[0]), last = clock(parts[1])
  if (!first || !last) return null
  const explicit = (value: ScheduleClock) => value.hour * 60 + value.minute
  let start: number, end: number
  if (first.hour === 0 || last.hour === 0 || first.hour > 12 || last.hour > 12) {
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

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function isValidExcelScheduleDays(text: string): boolean {
  const parts = text.trim().split('/')
  return parts.length <= 2 && parts.every(isExcelScheduleTba) || parseExcelScheduleDays(text).length > 0
}

export function parseExcelScheduleDays(text: string): string[] {
  const parts = text.trim().toUpperCase().split('/')
  if (parts.length > 2) return []
  const days = parts.filter(part => !isExcelScheduleTba(part)).map(part => DAY_ORDER.find(day => day.toUpperCase() === part.trim()))
  if (days.some(day => !day) || new Set(days).size !== days.length) return []
  return DAY_ORDER.filter(day => days.includes(day))
}

export function scheduleParallelGroups(records: readonly ScheduleRecord[]): ReadonlyMap<number, number> {
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
      parallel = { id: record.row, year: record.year, subject, course, times }
    } else if (college) parallel = undefined
    if (parallel && course && !parallel.course) parallel = { ...parallel, course }
    if (parallel) parallelGroups.set(record.row, parallel.id)
  }
  return parallelGroups
}
