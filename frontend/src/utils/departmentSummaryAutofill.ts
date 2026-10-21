import { excelScheduleFacultyKeys } from './ScheduleValidation.ts'

export interface SummaryFacultyLoad {
  faculty: string
  department: string
  lec: number | null
  lab: number | null
  total: number | null
}

interface ScheduleForSummary {
  department?: unknown
  faculty?: unknown
  hours?: unknown
  meetings?: unknown
  rawValues?: unknown
  groupId?: unknown
}

interface LoadAccumulator {
  faculty: string
  department: string
  lec: number
  lab: number
  hasLec: boolean
  hasLab: boolean
  unclassified: boolean
}

const facultyKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleUpperCase()
const usableName = (name: string) => Boolean(name && !/^(?:TBA|N\/A|NONE|UNASSIGNED)$/i.test(name))

function facultyNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names = new Map<string, string>()
  for (const valueName of value) {
    if (typeof valueName !== 'string') continue
    const name = valueName.trim()
    if (usableName(name) && !names.has(facultyKey(name))) names.set(facultyKey(name), name)
  }
  return [...names.values()]
}

function hoursValue(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function summarizeScheduleFacultyLoads(schedules: readonly ScheduleForSummary[], fallbackDepartment: string,
  departmentFaculty: readonly string[]): SummaryFacultyLoad[] {
  const directory = departmentFaculty.map(name => ({ name, keys: excelScheduleFacultyKeys(name) }))
  const resolveFaculty = (name: string) => {
    const keys = excelScheduleFacultyKeys(name.replace(/\s*\(NEW\)\s*$/i, ''))
    const matches = directory.filter(member => member.keys.some(key => keys.includes(key)))
    return matches.length === 1 ? matches[0].name : null
  }
  const loads = new Map<string, LoadAccumulator>()
  const parallelHours = new Map<string, { facultyKey: string; format: 'Lec' | 'Lab'; hours: number }>()
  for (const schedule of schedules) {
    const faculty = schedule.faculty && typeof schedule.faculty === 'object' ? schedule.faculty as Record<string, unknown> : {}
    const hours = schedule.hours && typeof schedule.hours === 'object' ? schedule.hours as Record<string, unknown> : {}
    const meetings = Array.isArray(schedule.meetings) ? schedule.meetings : []
    const rawValues = Array.isArray(schedule.rawValues) ? schedule.rawValues : []
    const meetingNames = (format: string) => facultyNames(meetings.filter(meeting => meeting && typeof meeting === 'object'
      && (meeting as Record<string, unknown>).format === format).map(meeting => (meeting as Record<string, unknown>).faculty))
    const department = typeof schedule.department === 'string' && schedule.department.trim()
      ? schedule.department.trim() : fallbackDepartment
    const lecNames = facultyNames(faculty.lec), labNames = facultyNames(faculty.lab)
    const lecFaculty = lecNames.length ? lecNames : meetingNames('Lec')
    const labFaculty = labNames.length ? labNames : meetingNames('Lab')
    const byFormat = [
      { format: 'Lec', names: lecFaculty.length ? lecFaculty : labFaculty, hours: hoursValue(hours.lec ?? rawValues[8]) },
      { format: 'Lab', names: labFaculty.length ? labFaculty : lecFaculty, hours: hoursValue(hours.lab ?? rawValues[9]) },
      { format: 'Flexible', names: facultyNames(faculty.flexible), hours: 0 },
      { format: 'Unspecified', names: facultyNames(faculty.unspecified), hours: 0 },
    ] as const
    for (const item of byFormat) {
      const names = item.names.length ? item.names : meetingNames(item.format)
      for (const sourceName of names) {
        const name = resolveFaculty(sourceName)
        if (!name) continue
        const key = facultyKey(name)
        const load = loads.get(key) ?? { faculty: name, department, lec: 0, lab: 0, hasLec: false, hasLab: false,
          unclassified: false }
        if (item.format === 'Lec') {
          if (typeof schedule.groupId === 'string' && schedule.groupId) {
            const groupKey = JSON.stringify([key, schedule.groupId, item.format])
            const previous = parallelHours.get(groupKey)
            parallelHours.set(groupKey, { facultyKey: key, format: item.format, hours: Math.max(previous?.hours ?? 0, item.hours) })
          } else load.lec += item.hours
          load.hasLec = true
        } else if (item.format === 'Lab') {
          if (typeof schedule.groupId === 'string' && schedule.groupId) {
            const groupKey = JSON.stringify([key, schedule.groupId, item.format])
            const previous = parallelHours.get(groupKey)
            parallelHours.set(groupKey, { facultyKey: key, format: item.format, hours: Math.max(previous?.hours ?? 0, item.hours) })
          } else load.lab += item.hours
          load.hasLab = true
        } else load.unclassified = true
        loads.set(key, load)
      }
    }
  }
  for (const assignment of parallelHours.values()) {
    const load = loads.get(assignment.facultyKey)!
    if (assignment.format === 'Lec') load.lec += assignment.hours
    else load.lab += assignment.hours
  }
  return [...loads.values()].sort((first, second) => first.faculty.localeCompare(second.faculty)).map(load => ({
    faculty: load.faculty,
    department: load.department,
    lec: load.lec,
    lab: load.lab,
    total: !load.unclassified && (load.hasLec || load.hasLab)
      ? load.lec + load.lab : null,
  }))
}

export function fillSummaryFacultyRows(rows: readonly (readonly string[])[], loads: readonly SummaryFacultyLoad[]): string[][] {
  const next = rows.map(row => [...row])
  const claimed = new Set<number>()
  const text = (value: number | null) => value === null ? '' : String(Number(value.toFixed(4)))
  for (const load of loads) {
    let index = next.findIndex((row, rowIndex) => rowIndex < next.length - 1 && !claimed.has(rowIndex)
      && facultyKey(row[0] ?? '') === facultyKey(load.faculty))
    if (index < 0) index = next.findIndex((row, rowIndex) => rowIndex < next.length - 1 && !claimed.has(rowIndex)
      && row.every(cell => !cell.trim()))
    if (index < 0) {
      if (next.length >= 1000) throw new Error('Summary has reached its 1,000-row limit. Remove unused rows before auto-filling.')
      index = next.length - 1
      next.splice(index, 0, Array.from({ length: next[0].length }, () => ''))
    }
    claimed.add(index)
    next[index][0] = load.faculty
    next[index][1] = load.department
    next[index][4] = text(load.lec)
    next[index][5] = text(load.lab)
    next[index][6] = load.total === null ? '' : load.total.toFixed(2)
  }
  const dataRows = next.slice(0, -1)
  const populatedRows = dataRows.filter(row => row.some(cell => cell.trim()))
  const emptyRows = dataRows.filter(row => row.every(cell => !cell.trim()))
  return [...populatedRows, ...emptyRows, next[next.length - 1]]
}

