import type { DepartmentCourse } from './departmentScheduleTemplates'

export interface DepartmentCourseSuggestion extends DepartmentCourse {
  matchesRoomSlot?: boolean
  schedules?: readonly string[]
}

export function subjectFragment(text: string, caret: number): { start: number; end: number; query: string } {
  const suffix = /\s*-\s*[A-Z0-9]*$/i.exec(text)
  const start = text.length - text.trimStart().length
  const end = suffix ? suffix.index : text.length
  return { start, end, query: text.slice(start, Math.max(start, Math.min(caret, end))).trim() }
}

export function filterDepartmentCourses(courses: readonly DepartmentCourseSuggestion[], query: string): DepartmentCourseSuggestion[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const compactQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!words.length) return [...courses]
  return courses.filter(course => {
    const code = course.code.toLowerCase().replace(/[^a-z0-9]/g, '')
    const searchable = `${course.code} ${course.title} ${course.schedules?.join(' ') ?? ''}`.toLowerCase()
    return code.includes(compactQuery) || words.every(word => searchable.includes(word))
  })
}

export function rankScheduleCourses(courses: readonly DepartmentCourseSuggestion[], query: string, yearLevel: number): DepartmentCourseSuggestion[] {
  const sorted = filterDepartmentCourses(courses, query).sort((left, right) =>
    Number(right.yearLevel === yearLevel) - Number(left.yearLevel === yearLevel)
    || left.code.localeCompare(right.code, undefined, { numeric: true }) || left.title.localeCompare(right.title))
  const seen = new Set<string>()
  return sorted.filter(course => {
    const key = JSON.stringify([course.code.trim().toUpperCase(), course.title.trim().toUpperCase()])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function resolveScheduleCourse(courses: readonly DepartmentCourseSuggestion[], value: string, column: number, yearLevel: number): DepartmentCourseSuggestion | undefined {
  if (!value.trim()) return undefined
  const key = (text: string) => text.toUpperCase().replace(/[^\p{L}\p{N}]/gu, '')
  const exact = rankScheduleCourses(courses, '', yearLevel).filter(course => key(column === 2 ? course.code : course.title) === key(value))
  const matches = exact.length ? exact : rankScheduleCourses(courses, value, yearLevel)
  const sameYear = matches.filter(course => course.yearLevel === yearLevel)
  return sameYear.length === 1 ? sameYear[0] : matches.length === 1 ? matches[0] : undefined
}

export function scheduleCourseYear(label: string, sourceLabel: string | undefined, sectionIndex: number): number {
  const match = /^\s*([1-4])(?:st|nd|rd|th|\s*[a-z])/i.exec(label)
    ?? /^\s*([1-4])(?:st|nd|rd|th|\s*[a-z])/i.exec(sourceLabel ?? '')
  return Number(match?.[1] ?? Math.min(sectionIndex + 1, 4))
}
