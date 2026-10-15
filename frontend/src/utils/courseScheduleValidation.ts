import * as XLSX from 'xlsx'
import type { TemplateIssue } from './departmentScheduleTemplates'

export const COURSE_TEMPLATE_HEADERS = ['Session', 'Semester', 'Code', 'Course', 'Type', 'Credits'] as const
export interface CourseTemplateRow { row: number; values: readonly string[] }

/** Check populated course rows; completely empty rows are separators. */
export function validateCourseScheduleRows(sheetName: string, firstColumn: number, rows: readonly CourseTemplateRow[]): TemplateIssue[] {
  const issues: TemplateIssue[] = []
  const location = (row: number, offset: number) => `${sheetName}!${XLSX.utils.encode_cell({ r: row, c: firstColumn + offset })}`
  const duplicateCodes = new Map<string, CourseTemplateRow[]>()
  const duplicateCourses = new Map<string, CourseTemplateRow[]>()
  for (const entry of rows) {
    const values = entry.values.map(value => value.trim())
    if (!values.some(Boolean)) continue
    const subject = values[2] || values[3] || 'Unnamed course'
    const context = subject
    COURSE_TEMPLATE_HEADERS.forEach((name, offset) => {
      if (!values[offset]) issues.push({ severity: [1, 2, 3].includes(offset) ? 'error' : 'warning',
        location: location(entry.row, offset), message: `${name} is missing for ${context}.` })
    })
    const semester = values[1].toUpperCase().replace(/\s/g, '')
    if (semester && !/^Y([1-9]\d*)S([12])$/.test(semester)) issues.push({ severity: 'error',
      location: location(entry.row, 1), message: `Semester "${values[1]}" is invalid for ${context}. Use a year and semester such as Y3S1.` })
    if (values[5] && (!Number.isFinite(Number(values[5])) || Number(values[5]) < 0)) issues.push({ severity: 'warning',
      location: location(entry.row, 5), message: `Credits "${values[5]}" is invalid for ${context}. Enter a nonnegative number.` })
    if (values[2]) {
      const key = values[2].toUpperCase().replace(/\s/g, '')
      duplicateCodes.set(key, [...(duplicateCodes.get(key) ?? []), entry])
    }
    if (values[3]) {
      const key = values[3].toUpperCase().replace(/\s+/g, ' ')
      duplicateCourses.set(key, [...(duplicateCourses.get(key) ?? []), entry])
    }
  }
  for (const [offset, groups] of [[2, duplicateCodes], [3, duplicateCourses]] as const) {
    for (const group of groups.values()) {
      if (group.length < 2) continue
      for (const entry of group) issues.push({ severity: 'warning', location: location(entry.row, offset),
        message: `Duplicate ${offset === 2 ? 'code' : 'course'} "${entry.values[offset].trim()}".` })
    }
  }
  return issues
}
