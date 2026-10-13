import * as XLSX from 'xlsx'
import type { WorkbookEditSnapshot } from './excelWorkbookState'
import type { ScheduleDirectory, WorkbookScheduleRow } from './excelScheduleRows'
import { excelScheduleFacultyKeys, excelScheduleRoomKey, parseExcelScheduleDays, parseExcelScheduleTime } from './excelScheduleValidation.ts'

export const DEPARTMENT_TEMPLATE_KEY = '!rormsDepartmentTemplate'
export type TemplateRole = 'faculty' | 'courses' | 'rooms'
export interface DepartmentCourse {
  code: string
  title: string
  yearLevel: number
  semester: number
  type: string
  credits: number | null
  session: string
  sourceCell: string
}
export interface TemplateIssue { severity: 'error' | 'warning'; location: string; message: string }
export interface TemplateMeeting {
  day: string
  start: number
  end: number
  modality: 'F2F' | 'Remote Coaching' | 'Independent Learning' | 'Unspecified'
  room?: string
  roomSourceCell?: string
}
export interface TemplateClass {
  course: DepartmentCourse
  faculty: string
  section: string
  sourceCell: string
  sourceKey: string
  meetings: TemplateMeeting[]
}
export interface DepartmentTemplatePreview { courses: DepartmentCourse[]; classes: TemplateClass[]; issues: TemplateIssue[]; facultyCount: number }

export const templateCodeKey = (value: string) => value.toUpperCase().replace(/\s+/g, '')
export const templateClock = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
export const templateSubjectFormat = (type: string): 'Lec' | 'Lab' | 'Flexible' | 'Unspecified' => /lecture.*lab|flexible|open\s*lab/i.test(type) ? 'Flexible' : /^lab(?:oratory)?$/i.test(type.trim()) ? 'Lab' : /^lecture$/i.test(type.trim()) ? 'Lec' : 'Unspecified'
export const templateSubjectLabel = (type: string) => ({ Lec: 'Lecture', Lab: 'Laboratory', Flexible: 'Flexible / Open Lab', Unspecified: 'Unspecified' })[templateSubjectFormat(type)]

export function emptyTemplateSnapshot(): WorkbookEditSnapshot {
  return {
    workbook: { SheetNames: [], Sheets: {} }, previewStyles: null,
    sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(), columnWidthOverrides: new Map(),
    cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(), formattingOverrides: new Map(),
    scheduleSetups: new Map(), hiddenRangeToggles: new Map(), selectedSheet: '', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}

export function templateRole(sheet: XLSX.WorkSheet): TemplateRole | undefined {
  const marker: unknown = sheet[DEPARTMENT_TEMPLATE_KEY]
  if (marker && typeof marker === 'object' && 'version' in marker && marker.version === 1 && 'role' in marker
    && (marker.role === 'faculty' || marker.role === 'courses' || marker.role === 'rooms')) return marker.role
}

function reader(snapshot: WorkbookEditSnapshot, name: string) {
  const sheet = snapshot.workbook.Sheets[name]
  const texts = snapshot.cellTextOverrides.get(name)
  const merges = snapshot.mergeOverrides.get(name) ?? sheet['!merges'] ?? []
  const raw = (r: number, c: number) => {
    const address = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[address] as XLSX.CellObject | undefined
    return (texts?.get(address) ?? (cell?.w !== undefined ? String(cell.w) : cell?.v != null ? String(cell.v) : '')).trim()
  }
  const mergeAt = (r: number, c: number) => merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c)
  const value = (r: number, c: number) => { const m = mergeAt(r, c); return raw(m?.s.r ?? r, m?.s.c ?? c) }
  // Inspect actual cells/edits instead of scanning a sheet's potentially enormous formatted range.
  const positions = [...new Set([...Object.keys(sheet), ...(texts?.keys() ?? [])])].filter(a => /^[A-Z]+[1-9]\d*$/.test(a))
    .map(a => XLSX.utils.decode_cell(a)).filter(p => raw(p.r, p.c))
  return { raw, value, mergeAt, positions }
}

function fill(snapshot: WorkbookEditSnapshot, name: string, address: string): string | undefined {
  const custom = snapshot.cellStyleOverrides.get(name)?.get(address)?.backgroundColor
  const index = snapshot.formattingOverrides.get(name)?.indexes.get(address)
  const color = custom ?? (index !== undefined ? snapshot.previewStyles?.cellStyles[index]?.backgroundColor : undefined)
  return typeof color === 'string' ? color.toUpperCase() : undefined
}

function colorDistance(left: string, right: string): number {
  if (!/^#[A-F0-9]{6}$/.test(left) || !/^#[A-F0-9]{6}$/.test(right)) return Infinity
  return Math.max(...[1, 3, 5].map(i => Math.abs(parseInt(left.slice(i, i + 2), 16) - parseInt(right.slice(i, i + 2), 16))))
}

const COURSE_HEADERS = ['session', 'semester', 'code', 'course', 'type', 'credits']
type TemplateReader = ReturnType<typeof reader>

function findCourseHeader(source: TemplateReader) {
  return source.positions.find(p => COURSE_HEADERS.every((label, offset) => source.raw(p.r, p.c + offset).toLowerCase() === label))
}

function findFacultyBlocks(source: TemplateReader) {
  const singleDay = (value: string) => { const days = parseExcelScheduleDays(value); return days.length === 1 ? days[0] : undefined }
  const dayRows = new Map<number, Set<number>>()
  for (const p of source.positions) if (singleDay(source.raw(p.r, p.c))) {
    const columns = dayRows.get(p.r) ?? new Set<number>(); columns.add(p.c); dayRows.set(p.r, columns)
  }
  const blocks: { row: number; column: number; days: { column: number; day: string }[]; faculty: string }[] = []
  for (const [row, columns] of dayRows) for (const column of [...columns].sort((a, b) => a - b)) {
    if (columns.has(column - 1)) continue
    const days = []
    for (let c = column; columns.has(c); c++) days.push({ column: c, day: singleDay(source.raw(row, c))! })
    if (days.length < 2 || column < 1) continue
    blocks.push({ row, column: column - 1, days, faculty: source.value(row - 1, column - 1) })
  }
  return blocks.sort((a, b) => a.row - b.row || a.column - b.column)
}

function roomSlot(label: string): { day: string; start: number; end: number } | null {
  const match = /^(.*?)\s+(MON(?:DAY)?|TUE(?:SDAY)?|WED(?:NESDAY)?|THU(?:RSDAY)?|FRI(?:DAY)?|SAT(?:URDAY)?|SUN(?:DAY)?)$/i.exec(label)
  if (!match) return null
  const time = parseExcelScheduleTime(match[1])
  const days = parseExcelScheduleDays(match[2])
  return time && days.length === 1 ? { ...time, day: days[0] } : null
}

function findRoomBlocks(source: TemplateReader) {
  const byRow = new Map<number, Set<number>>()
  for (const p of source.positions) if (/^[A-Z][A-Z0-9]*\s+[A-Z0-9]+$/i.test(source.raw(p.r, p.c))) {
    const columns = byRow.get(p.r) ?? new Set<number>()
    columns.add(p.c); byRow.set(p.r, columns)
  }
  const blocks: { row: number; timeColumn: number; rooms: { column: number; name: string }[] }[] = []
  for (const [row, columns] of byRow) for (const column of [...columns].sort((a, b) => a - b)) {
    if (columns.has(column - 1) || column < 1) continue
    const rooms = []
    for (let c = column; columns.has(c); c++) rooms.push({ column: c, name: source.raw(row, c) })
    if (rooms.length >= 2 && [1, 2, 3].some(offset => roomSlot(source.raw(row + offset, column - 1)))) {
      blocks.push({ row, timeColumn: column - 1, rooms })
    }
  }
  return blocks.sort((a, b) => a.row - b.row || a.timeColumn - b.timeColumn)
}

/** Older imports/exported XLSX files lack our marker. Recognize the actual template layout instead of silently skipping them. */
export function findDepartmentTemplateSheets(snapshot: WorkbookEditSnapshot): { facultySheet: string; coursesSheet: string; roomsSheet?: string } | null {
  const names = snapshot.workbook.SheetNames
  let faculty = names.filter(name => templateRole(snapshot.workbook.Sheets[name]) === 'faculty')
  let courses = names.filter(name => templateRole(snapshot.workbook.Sheets[name]) === 'courses')
  let rooms = names.filter(name => templateRole(snapshot.workbook.Sheets[name]) === 'rooms')
  // Explicit selections remain authoritative; never substitute a different sheet for a missing marked source.
  if (!faculty.length && !courses.length) {
    for (const name of names) {
      if (snapshot.scheduleSetups.has(name)) continue
      const source = reader(snapshot, name)
      if (findCourseHeader(source)) courses.push(name)
      else if (findFacultyBlocks(source).some(block => block.faculty
        && [1, 2, 3].some(offset => parseExcelScheduleTime(source.raw(block.row + offset, block.column))))) faculty.push(name)
    }
  }
  if (!faculty.length && !courses.length) return null
  if (faculty.length !== 1 || courses.length !== 1) throw new Error('Import one Faculty Schedules sheet and one Department Courses sheet together before saving. Multiple matching sheets must be selected explicitly through Import schedule templates.')
  if (!rooms.length) rooms = names.filter(name => name !== faculty[0] && name !== courses[0] && !snapshot.scheduleSetups.has(name)
    && findRoomBlocks(reader(snapshot, name)).length > 0)
  if (rooms.length > 1) throw new Error('Multiple Rooms & Labs sheets match this workbook. Select one through Import schedule templates.')
  return { facultySheet: faculty[0], coursesSheet: courses[0], ...(rooms.length ? { roomsSheet: rooms[0] } : {}) }
}

/** Allow valid templates to clear all classes; reject populated workbooks without a recognized schedule source. */
export function assertDepartmentScheduleRows(snapshot: WorkbookEditSnapshot, rows: readonly WorkbookScheduleRow[]): void {
  if (!rows.length && !findDepartmentTemplateSheets(snapshot) && snapshot.workbook.SheetNames.some(name => reader(snapshot, name).positions.length)) {
    throw new Error('No classes were recognized in this workbook. Import both Faculty Schedules and Department Courses through Import schedule templates, or configure the schedule rows in an older workbook, before saving.')
  }
}

interface RoomEntry { code: string; section: string; day: string; start: number; end: number; room: string; location: string }

function applyRoomSheet(snapshot: WorkbookEditSnapshot, sheetName: string, classes: TemplateClass[], issue: (severity: TemplateIssue['severity'], location: string, message: string) => void) {
  const source = reader(snapshot, sheetName)
  const blocks = findRoomBlocks(source)
  if (!blocks.length) throw new Error('Rooms & Labs must use room-code column headers and time/day rows from the supplied template.')
  const entries: RoomEntry[] = []
  const lastRow = Math.max(...source.positions.map(p => p.r))
  for (const block of blocks) {
    const next = blocks.find(other => other.row > block.row && other.timeColumn === block.timeColumn)
    const endRow = next ? next.row - 1 : lastRow
    for (let row = block.row + 1; row <= endRow; row++) {
      const slot = roomSlot(source.raw(row, block.timeColumn))
      if (!slot) continue
      for (const room of block.rooms) {
        const label = source.raw(row, room.column)
        if (!label || /^X$/i.test(label)) continue
        const location = `${sheetName}!${XLSX.utils.encode_cell({ r: row, c: room.column })}`
        const subject = /^([A-Z]+\s*\d+)\s*(?:(?:-\s*|\s+G\s*)([A-Z0-9-]+))?$/i.exec(label)
        if (!subject) { issue('warning', location, `Cannot read room assignment "${label}"; no room was assigned.`); continue }
        entries.push({ code: templateCodeKey(subject[1]), section: (subject[2] ?? '').toUpperCase(), ...slot, room: room.name, location })
      }
    }
  }
  const matches = new Map<TemplateMeeting, RoomEntry[]>()
  for (const entry of entries) {
    const candidates = classes.flatMap(item => templateCodeKey(item.course.code) === entry.code && item.section.toUpperCase() === entry.section
      ? item.meetings.filter(meeting => meeting.day === entry.day &&
        (entry.start >= meeting.start && entry.end <= meeting.end || meeting.start >= entry.start && meeting.end <= entry.end))
        .map(meeting => ({ item, meeting })) : [])
    const owners = new Set(candidates.map(candidate => candidate.item.sourceKey))
    if (!owners.size) { issue('warning', entry.location, 'No faculty meeting matches this subject, section, day, and time; the room was not assigned.'); continue }
    if (owners.size > 1) { issue('warning', entry.location, 'Several faculty classes match this room entry; specify a unique section before assigning the room.'); continue }
    for (const { meeting } of candidates) matches.set(meeting, [...(matches.get(meeting) ?? []), entry])
  }
  for (const item of classes) item.meetings = item.meetings.flatMap(meeting => {
    const assigned = matches.get(meeting) ?? []
    if (!assigned.length) return [meeting]
    const covering = assigned.filter(entry => entry.start <= meeting.start && entry.end >= meeting.end)
    if (covering.length === 1 && assigned.length === 1) return [{ ...meeting, room: covering[0].room, roomSourceCell: covering[0].location }]
    const parts = [...assigned].sort((a, b) => a.start - b.start || a.end - b.end)
    if (covering.length || parts.some(entry => entry.start < meeting.start || entry.end > meeting.end)
      || parts.some((entry, index) => index > 0 && entry.start < parts[index - 1].end)) {
      issue('warning', assigned[0].location, 'Conflicting room entries cover this faculty meeting; its room remains unassigned.')
      return [meeting]
    }
    const segments: TemplateMeeting[] = []
    let cursor = meeting.start
    for (const entry of parts) {
      if (cursor < entry.start) segments.push({ ...meeting, start: cursor, end: entry.start })
      segments.push({ ...meeting, start: entry.start, end: entry.end, room: entry.room, roomSourceCell: entry.location })
      cursor = entry.end
    }
    if (cursor < meeting.end) segments.push({ ...meeting, start: cursor, end: meeting.end })
    return segments
  })
}

export function readDepartmentTemplatePreview(snapshot: WorkbookEditSnapshot, facultySheet: string, coursesSheet: string, semester: 'sem1' | 'sem2', roomsSheet?: string): DepartmentTemplatePreview {
  const issues: TemplateIssue[] = []
  const issue = (severity: TemplateIssue['severity'], location: string, message: string) => issues.push({ severity, location, message })
  if (!snapshot.workbook.Sheets[facultySheet] || !snapshot.workbook.Sheets[coursesSheet]) throw new Error('Both the Faculty Schedules and Department Courses sheets are required.')
  const courseReader = reader(snapshot, coursesSheet)
  const header = findCourseHeader(courseReader)
  if (!header) throw new Error('Department Courses must use the supplied Session, Semester, Code, Course, Type, Credits headers, in that order.')
  const courses: DepartmentCourse[] = []
  const rows = [...new Set(courseReader.positions.map(p => p.r))].filter(r => r > header.r).sort((a, b) => a - b)
  for (const row of rows) {
    const values = COURSE_HEADERS.map((_, offset) => courseReader.raw(row, header.c + offset))
    if (!values.some(Boolean)) continue
    const sourceCell = `${coursesSheet}!${XLSX.utils.encode_cell({ r: row, c: header.c + 2 })}`
    const term = /^Y([1-9]\d*)S([12])$/i.exec(values[1].replace(/\s/g, ''))
    if (!values[2] || !values[3] || !term) { issue('error', sourceCell, 'A course needs a code, title, and year/semester such as Y3S1.'); continue }
    const credits = values[5] && Number.isFinite(Number(values[5])) && Number(values[5]) >= 0 ? Number(values[5]) : null
    if (credits === null) issue('warning', sourceCell, 'Credits are missing or invalid; no credits will be inferred.')
    courses.push({ code: values[2].toUpperCase().replace(/\s+/g, ' '), title: values[3], yearLevel: Number(term[1]), semester: Number(term[2]), type: values[4], credits, session: values[0], sourceCell })
  }
  const facultyReader = reader(snapshot, facultySheet)
  const blocks = findFacultyBlocks(facultyReader)
  if (!blocks.length) throw new Error('Faculty Schedules must use the supplied faculty-name, weekday-column, and time-row blocks.')
  const legends = facultyReader.positions.flatMap(p => {
    const label = facultyReader.raw(p.r, p.c).toUpperCase()
    const modality = label === 'F2F' ? 'F2F' : label === 'REMOTE COACHING' ? 'Remote Coaching' : label === 'INDEPENDENT LEARNING' ? 'Independent Learning' : undefined
    const color = fill(snapshot, facultySheet, XLSX.utils.encode_cell(p))
    return modality && color ? [{ modality: modality as TemplateMeeting['modality'], color }] : []
  })
  const classes = new Map<string, TemplateClass>()
  const visitedAssignments = new Set<string>()
  const usedFaculty = new Set<string>()
  const lastRow = Math.max(...facultyReader.positions.map(p => p.r))
  for (const block of blocks) {
    const next = blocks.find(b => b.column === block.column && b.row > block.row)
    const endRow = next ? next.row - 2 : lastRow
    const timeRows = new Map<number, { start: number; end: number }>()
    let previousEnd = 0
    for (let r = block.row + 1; r <= endRow; r++) {
      const label = facultyReader.raw(r, block.column)
      const parsed = parseExcelScheduleTime(label)
      if (!parsed) continue
      // The last 7:00–7:30 row is evening after 6:00–7:00, despite omitted AM/PM.
      const time = { ...parsed }
      if (!/AM|PM/i.test(label) && previousEnd >= 18 * 60 && time.start >= 7 * 60 && time.start < 12 * 60 && time.start + 720 >= previousEnd && time.end + 720 < 1440) {
        time.start += 720; time.end += 720
      }
      if (time.start < previousEnd) continue
      timeRows.set(r, time)
      previousEnd = time.end
    }
    for (const { column, day } of block.days) {
      // Read only actual assignment anchors. Covered merged cells are not additional meetings.
      const cells = facultyReader.positions.filter(p => p.c === column && p.r > block.row && p.r <= endRow).sort((a, b) => a.r - b.r)
      for (const p of cells) {
        const address = XLSX.utils.encode_cell(p), location = `${facultySheet}!${address}`
        const merge = facultyReader.mergeAt(p.r, p.c)
        if (merge && (merge.s.r !== p.r || merge.s.c !== p.c)) continue
        visitedAssignments.add(address)
        const label = facultyReader.raw(p.r, p.c)
        if (!block.faculty) { issue('error', location, 'This assignment has no faculty name above its timetable.'); continue }
        const match = /^([A-Z]+\s*\d+)\s*(?:(?:-\s*|\s+G\s*)([A-Z0-9-]+))?$/i.exec(label)
        if (!match) { issue('error', location, `Cannot read subject/section "${label}". Use entries such as ITE 314-2 or ITE 083 G1.`); continue }
        let candidates = courses.filter(c => templateCodeKey(c.code) === templateCodeKey(match[1]))
        if (candidates.length > 1) candidates = candidates.filter(c => c.semester === (semester === 'sem1' ? 1 : 2))
        if (candidates.length !== 1) {
          issue(candidates.length ? 'error' : 'warning', location, candidates.length
            ? `Subject "${match[1]}" has ambiguous curriculum entries.`
            : `Subject "${match[1]}" has no matching course in Department Courses; its schedule will be removed when saved.`)
          continue
        }
        const course = candidates[0]
        const first = timeRows.get(p.r)
        const last = timeRows.get(merge?.e.r ?? p.r)
        if (!first || !last || last.end <= first.start || (merge && (merge.e.c !== p.c || merge.e.r > endRow))) {
          issue('error', location, 'The assignment must span valid time rows in one weekday column.'); continue
        }
        // A merged appointment must not jump a break or a missing/malformed time row.
        let previous = first.start, valid = true
        for (let r = p.r; r <= (merge?.e.r ?? p.r); r++) {
          const time = timeRows.get(r)
          if (!time || time.start !== previous) { valid = false; break }
          previous = time.end
        }
        if (!valid) { issue('error', location, 'This merged assignment crosses a break or inconsistent time rows.'); continue }
        const sourceKey = JSON.stringify([XLSX.utils.encode_cell({ r: block.row, c: block.column }), templateCodeKey(course.code), match[2] ?? ''])
        const item = classes.get(sourceKey) ?? { course, faculty: block.faculty, section: match[2] ?? '', sourceCell: address, sourceKey, meetings: [] }
        const color = fill(snapshot, facultySheet, address)
        const legend = color ? legends.find(l => colorDistance(color, l.color) <= 8) : undefined
        item.meetings.push({ day, start: first.start, end: last.end, modality: legend?.modality ?? 'Unspecified' })
        classes.set(sourceKey, item)
        usedFaculty.add(block.faculty)
      }
    }
  }
  for (const item of classes.values()) {
    item.meetings.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
    const location = `${facultySheet}!${item.sourceCell}`
    if (!item.section) issue('warning', location, `${item.course.code}: section/group is not specified.`)
    if (templateSubjectFormat(item.course.type) === 'Unspecified') issue('warning', location, `${item.course.code}: subject type is unspecified; review required.`)
    if (item.course.semester !== (semester === 'sem1' ? 1 : 2)) issue('warning', location, `${item.course.code}: curriculum lists semester ${item.course.semester}; the faculty assignment is retained in the selected term.`)
    if (item.meetings.some(m => m.modality === 'Unspecified')) issue('warning', location, 'Meeting modality is not identified by the template legend.')
  }
  for (const p of facultyReader.positions) {
    const address = XLSX.utils.encode_cell(p)
    if (!visitedAssignments.has(address) && /^[A-Z]+\s*\d+\s*(?:-\s*[A-Z0-9-]+|\s+G\s*\d+)?$/i.test(facultyReader.raw(p.r, p.c))) {
      issue('error', `${facultySheet}!${address}`, 'This subject assignment is outside a recognized faculty/day/time block. Check its weekday header and faculty name.')
    }
  }
  const list = [...classes.values()]
  if (roomsSheet) applyRoomSheet(snapshot, roomsSheet, list, issue)
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const left = list[i], right = list[j]
    if (left.faculty !== right.faculty) continue
    if (left.meetings.some(a => right.meetings.some(b => a.day === b.day && a.start < b.end && b.start < a.end))) {
      const message = `${left.faculty} has overlapping assignments: ${left.course.code} ${left.section} and ${right.course.code} ${right.section}.`
      issue('warning', `${facultySheet}!${left.sourceCell}`, message)
      issue('warning', `${facultySheet}!${right.sourceCell}`, message)
    }
  }
  return { courses, classes: list, issues, facultyCount: usedFaculty.size }
}

/** Regenerate from current grid values on every Save, including edited cells and merges. */
export function extractDepartmentTemplateRows(snapshot: WorkbookEditSnapshot, directory: ScheduleDirectory, semester: 'sem1' | 'sem2'): WorkbookScheduleRow[] {
  const sheets = findDepartmentTemplateSheets(snapshot)
  if (!sheets) return []
  const sourceSheet = sheets.facultySheet
  const preview = readDepartmentTemplatePreview(snapshot, sourceSheet, sheets.coursesSheet, semester, sheets.roomsSheet)
  const errors = preview.issues.filter(i => i.severity === 'error')
  if (errors.length) throw new Error(`${errors[0].location}: ${errors[0].message}${errors.length > 1 ? ` (${errors.length} template errors)` : ''}`)
  return preview.classes.map(item => {
    const faculty = item.faculty.replace(/\s*\(NEW\)\s*$/i, '').trim()
    const keys = excelScheduleFacultyKeys(faculty)
    const matches = directory.faculty.filter(f => f.department === directory.departmentCode && excelScheduleFacultyKeys(f.fullName).some(key => keys.includes(key)))
    const resolved = matches.length === 1 ? matches[0] : undefined
    const format = templateSubjectFormat(item.course.type)
    const position = XLSX.utils.decode_cell(item.sourceCell)
    const meetings = item.meetings.map(m => {
      const room = m.room ?? 'TBA'
      const matches = m.room ? directory.rooms.filter(candidate => excelScheduleRoomKey(candidate.code) === excelScheduleRoomKey(room)
        || excelScheduleRoomKey(candidate.name) === excelScheduleRoomKey(room)) : []
      const assigned = matches.length === 1 ? matches[0] : undefined
      return { format, faculty: resolved?.fullName ?? faculty, time: `${templateClock(m.start)}-${templateClock(m.end)}`, day: m.day,
        room, startTime: templateClock(m.start), endTime: templateClock(m.end), days: [m.day], instructorId: resolved?.id ?? '',
        roomId: assigned?.id ?? '', buildingId: assigned?.buildingId ?? '', modality: m.modality }
    })
    const validationIssues = preview.issues.filter(i => i.location === `${sourceSheet}!${item.sourceCell}`).map(i => i.message)
    if (!resolved) validationIssues.push(`Faculty "${faculty}" could not be matched uniquely to an active department Instructor or Program Head.`)
    for (const meeting of meetings) if (meeting.room !== 'TBA' && !meeting.roomId) {
      validationIssues.push(`Room "${meeting.room}" could not be matched uniquely to an existing room.`)
    }
    if (meetings.some(m => !m.roomId)) validationIssues.push('Room allocation is pending.')
    const f2f = meetings.filter(m => m.modality === 'F2F')
    const pair = (values: string[]) => ({ lec: format === 'Lec' ? values : [], lab: format === 'Lab' ? values : [],
      ...(format === 'Flexible' ? { flexible: values } : format === 'Unspecified' ? { unspecified: values } : {}) })
    return {
      status: 'Draft', sourceSheet, sourceRow: position.r + 1, sourceCell: item.sourceCell, sourceKey: item.sourceKey,
      ...(sheets.roomsSheet ? { roomSourceSheet: sheets.roomsSheet } : {}),
      yearLevel: item.course.yearLevel, college: directory.departmentCode, subjectArea: '', subjectCode: item.course.code, subjectTitle: item.course.title,
      subjectType: item.course.type, curriculumSemester: item.course.semester, curriculumSession: item.course.session,
      course: '', classSection: item.section, credits: item.course.credits,
      hours: { lec: null, lab: null, total: null }, maxStudents: null,
      faculty: pair([resolved?.fullName ?? faculty]), f2fTime: pair(f2f.map(m => m.time)), f2fDays: pair(f2f.map(m => m.day)), f2fRoom: pair(f2f.map(m => m.room)),
      rawValues: [item.course.code, item.course.title, item.section, item.faculty, item.course.type, ...meetings.map(m => `${m.day} ${m.time}`)],
      meetings, parallelSourceRow: null, validationIssues,
    }
  })
}
