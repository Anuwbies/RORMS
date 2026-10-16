import * as XLSX from 'xlsx'
import type { WorkbookEditSnapshot } from './excelWorkbookState'
import { readAssignedScheduleRecords } from './excelScheduleTemplate.ts'
import { excelScheduleFacultyKeys, excelScheduleRoomKey, isExcelScheduleTba, parseExcelScheduleDays, parseExcelScheduleTime, splitScheduleMeetings, splitScheduleResources, scheduleParallelGroups, validateDepartmentFacultyScheduleRows, facultyScheduleRowKey } from './ScheduleValidation.ts'
import type { FacultySubjectAssignment } from './ScheduleValidation.ts'

export interface ScheduleDirectory {
  departmentCode: string
  faculty: { id: string; fullName: string; department: string }[]
  rooms: { id: string; code: string; name: string; buildingId: string; floor?: number; status?: string }[]
  externalRoomAssignments?: readonly FacultySubjectAssignment[]
}

export interface WorkbookScheduleMeeting {
  format: 'Lec' | 'Lab' | 'Flexible' | 'Unspecified'
  modality?: 'F2F' | 'Remote Coaching' | 'Independent Learning' | 'Unspecified'
  faculty: string
  time: string
  day: string
  room: string
  startTime: string
  endTime: string
  days: string[]
  instructorId: string
  roomId: string
  buildingId: string
}

export interface WorkbookScheduleRow {
  status: 'Draft' | 'Plot'
  sourceSheet: string
  sourceRow: number
  sourceCell?: string
  sourceKey?: string
  roomSourceSheet?: string
  subjectType?: string
  curriculumSemester?: number
  curriculumSession?: string
  yearLevel: number
  college: string
  subjectArea: string
  subjectCode: string
  subjectTitle: string
  course: string
  classSection: string
  /** Single Credits value from the department course template. */
  credits?: number | null
  /** Legacy 21-column workbooks retain their original unit breakdown. */
  units?: { lec: number | null; lab: number | null; total: number | null }
  hours: { lec: number | null; lab: number | null; total: number | null }
  maxStudents: number | null
  faculty: { lec: string[]; lab: string[]; flexible?: string[]; unspecified?: string[] }
  f2fTime: { lec: string[]; lab: string[]; flexible?: string[]; unspecified?: string[] }
  f2fDays: { lec: string[]; lab: string[]; flexible?: string[]; unspecified?: string[] }
  f2fRoom: { lec: string[]; lab: string[]; flexible?: string[]; unspecified?: string[] }
  rawValues: string[]
  meetings: WorkbookScheduleMeeting[]
  parallelSourceRow: number | null
  validationIssues: string[]
}

const clock = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
const number = (value: string): number | null => value.trim() && Number.isFinite(Number(value)) ? Number(value) : null
const entries = (value: string, resource = false) => value.trim() ? (resource ? splitScheduleResources(value) : splitScheduleMeetings(value)) : []
const at = (values: string[], index: number) => values[values.length === 1 ? 0 : index] ?? ''

// Use saved assignments, edited values, and merges; sheet/row visibility never discards data.
export function extractWorkbookScheduleRows(snapshot: WorkbookEditSnapshot, directory: ScheduleDirectory, options: { includeCollegeOnlyRows?: boolean } = {}): WorkbookScheduleRow[] {
  const result: WorkbookScheduleRow[] = []
  for (const name of snapshot.workbook.SheetNames) {
    const setup = snapshot.scheduleSetups.get(name)
    if (!setup) continue
    const sheet = snapshot.workbook.Sheets[name]
    const overrides = snapshot.cellTextOverrides.get(name)
    const merges = snapshot.mergeOverrides.get(name) ?? sheet['!merges'] ?? []
    const read = (r: number, c: number) => {
      const address = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[address]
      return overrides?.get(address) ?? (cell?.w !== undefined ? String(cell.w)
        : cell?.v !== undefined && cell.v !== null ? XLSX.utils.format_cell(cell) : cell?.f ? `=${cell.f}` : '')
    }
    const records = readAssignedScheduleRecords(setup, read).map(record => ({ ...record, values: record.values.map((value, field) => {
      if (field < 13) return value
      const column = setup.columns[field]
      const merge = merges.find(range => record.row >= range.s.r && record.row <= range.e.r && column >= range.s.c && column <= range.e.c)
      return merge ? read(merge.s.r, merge.s.c) : value
    }) }))
    const parallelGroups = scheduleParallelGroups(records)
    let course = '', previousYear: number | undefined
    for (const record of records) {
      const v = record.values.map(value => value.trim())
      if (record.year !== previousYear) course = ''
      previousYear = record.year
      // Curriculum headings and separator rows are display labels, not allocations.
      const own = setup.columns.map(column => read(record.row, column).trim())
      const curriculum = /^([1-4]\s*[a-z][a-z0-9]*)\s*(?=:|\s|$)/i.exec(own[0])
      if (curriculum && !own.slice(1).some(Boolean)) course = curriculum[1].replace(/\s/g, '').toUpperCase()
      if (!record.year || !own.some(Boolean) || !options.includeCollegeOnlyRows && !own.slice(1).some(Boolean)) continue
      if (v[4]) course = v[4]
      const issues: string[] = []
      const meetings: WorkbookScheduleMeeting[] = []
      for (const offset of [0, 1]) {
        const faculty = entries(v[13 + offset], true), times = entries(v[15 + offset])
        const days = entries(v[17 + offset]), rooms = entries(v[19 + offset], true)
        if (![faculty, times, days, rooms].some(values => values.length)) continue
        const count = Math.max(faculty.length, times.length, rooms.length, 1)
        for (const [label, values] of [['Faculty', faculty], ['F2F Time', times], ['F2F Room', rooms]] as const) {
          if (values.length > 1 && values.length !== count) issues.push(`${offset === 0 ? 'Lec' : 'Lab'} ${label} has ${values.length} entries for ${count} meetings.`)
        }
        for (let index = 0; index < count; index++) {
          const facultyName = at(faculty, index), time = at(times, index), room = at(rooms, index)
          const day = count > 1 && days.length === count ? days[index] : v[17 + offset]
          const parsedTime = parseExcelScheduleTime(time), parsedDays = parseExcelScheduleDays(day)
          const candidates = isExcelScheduleTba(facultyName) ? [] : directory.faculty.filter(member => member.department === directory.departmentCode && excelScheduleFacultyKeys(facultyName).some(alias => excelScheduleFacultyKeys(member.fullName).includes(alias)))
          const instructorId = facultyName && candidates.length === 1 ? candidates[0].id : ''
          const roomMatches = isExcelScheduleTba(room) ? [] : directory.rooms.filter(item => room && (excelScheduleRoomKey(item.code) === excelScheduleRoomKey(room) || excelScheduleRoomKey(item.name) === excelScheduleRoomKey(room)))
          const resolvedRoom = roomMatches.length === 1 ? roomMatches[0] : undefined
          if (facultyName && !isExcelScheduleTba(facultyName) && !instructorId) issues.push(`Faculty "${facultyName}" could not be matched uniquely to a membership.`)
          if (room && roomMatches.length > 1) issues.push(`Room ${room} could not be matched uniquely to a room.`)
          meetings.push({ format: offset === 0 ? 'Lec' : 'Lab', faculty: facultyName, time, day, room,
            startTime: parsedTime ? clock(parsedTime.start) : '', endTime: parsedTime ? clock(parsedTime.end) : '', days: parsedDays,
            instructorId, roomId: resolvedRoom?.id ?? '', buildingId: resolvedRoom?.buildingId ?? '' })
        }
      }
      result.push({ status: setup.rowStatuses?.get(record.row) === 'Plot' ? 'Plot' : 'Draft', sourceSheet: name, sourceRow: record.row + 1, yearLevel: record.year,
        college: v[0], subjectArea: v[1], subjectCode: v[2], subjectTitle: v[3], course, classSection: v[12],
        units: { lec: number(v[5]), lab: number(v[6]), total: number(v[7]) },
        hours: { lec: number(v[8]), lab: number(v[9]), total: number(v[10]) }, maxStudents: number(v[11]),
        faculty: { lec: entries(v[13], true), lab: entries(v[14], true) },
        f2fTime: { lec: entries(v[15]), lab: entries(v[16]) }, f2fDays: { lec: entries(v[17]), lab: entries(v[18]) },
        f2fRoom: { lec: entries(v[19], true), lab: entries(v[20], true) }, rawValues: own, meetings,
        parallelSourceRow: parallelGroups.has(record.row) ? parallelGroups.get(record.row)! + 1 : null,
        validationIssues: [...new Set(issues)] })
    }
  }
  const validation = validateDepartmentFacultyScheduleRows(result, directory)
  return result.map(row => ({ ...row, validationIssues: [...new Set([...row.validationIssues, ...(validation.get(facultyScheduleRowKey(row.sourceSheet, row.sourceRow)) ?? [])])] }))
}
