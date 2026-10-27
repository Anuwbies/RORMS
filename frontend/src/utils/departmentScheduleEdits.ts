import type { CellEditLocation } from './cellTextHistory'
import type { DepartmentScheduleImportSheet } from './departmentScheduleImport'
import { resolveScheduleCourse, scheduleCourseYear, type DepartmentCourseSuggestion } from './departmentCourseSuggestions.ts'
import { titleCaseName } from './userName.ts'
import { isScheduleColumnEditable, scheduleEditableColleges } from './ScheduleValidation.ts'

export interface ScheduleCellValueChange {
  cell: CellEditLocation
  value: string
}

export function isScheduleCellCharacterAllowed(column: number, character: string): boolean {
  if (column === 12) return /^[0-9]$/.test(character)
  if (column === 15 || column === 16) return /^[0-9:/;\-–—]$/.test(character)
  if (column === 17 || column === 18) return /^[A-Z/]$/i.test(character)
  return true
}

function scheduleValueLimit(column: number, value: string): number {
  if (column < 13 || column > 20) return value.length
  const placeholders = column < 15 || column > 18 ? [...value.matchAll(/\bN\s*\/\s*A\b/gi)] : []
  let separators = 0
  for (const match of value.matchAll(/\r\n|[/;\r\n,]/g)) {
    if (match[0] === ',' && column !== 17 && column !== 18) continue
    if (placeholders.some(placeholder => match.index >= placeholder.index && match.index < placeholder.index + placeholder[0].length)) continue
    if (++separators === 2) return match.index
  }
  return value.length
}

export function hasExtraScheduleValues(column: number, value: string): boolean {
  return scheduleValueLimit(column, value) < value.length
}

export function normalizeScheduleCellText(column: number, value: string, allowTimeTba = true): string {
  if (column === 12) return value.replace(/[^0-9]/g, '')
  // Stored/selected TBA must survive completion and history; direct time input still rejects letters.
  if (column === 15 || column === 16) value = value.split(/(\r\n|[/;\r\n])/).map(part =>
    allowTimeTba && /^TBA$/i.test(part.trim()) ? 'TBA' : [...part]
      .filter(character => character === '\r' || character === '\n' || isScheduleCellCharacterAllowed(column, character)).join('')).join('')
  else if (column === 17 || column === 18) value = [...value].filter(character => character === '\r' || character === '\n' || isScheduleCellCharacterAllowed(column, character)).join('')
  value = value.slice(0, scheduleValueLimit(column, value))
  if (column === 13 || column === 14) return titleCaseName(value).replace(/\bTba\b/g, 'TBA')
  if (column === 0) return value.toUpperCase().replace(/\bOPENLAB\b/g, 'OPEN LAB')
  return column === 2 || column >= 17 && column <= 20 ? value.toUpperCase() : value
}

/** Complete whole clock entries after editing so a four-digit time can be typed freely. */
export function completeScheduleTimeText(value: string): string {
  return value.split(/([-–—/;\r\n])/).map(part => {
    const match = /^(\d{1,4})$/.exec(part)
    if (!match) return part
    const digits = match[1]
    const hour = Number(digits.length > 2 ? digits.slice(0, -2) : digits)
    const minute = digits.length > 2 ? Number(digits.slice(-2)) : 0
    if (hour > 23 || minute > 59) return part
    return `${hour}:${String(minute).padStart(2, '0')}`
  }).join('')
}

export function formatScheduleTimeInput(value: string, caret = value.length, previousValue = ''): { value: string; caret: number } {
  const selectedTbaCount = previousValue.split(/\r\n|[/;\r\n]/).filter(part => /^TBA$/i.test(part.trim())).length
  const sanitize = (text: string) => {
    let remainingTba = selectedTbaCount
    return text.split(/(\r\n|[/;\r\n])/).map(part => {
      if (/^TBA$/i.test(part.trim()) && remainingTba > 0) { remainingTba--; return 'TBA' }
      return normalizeScheduleCellText(15, part, false)
    }).join('')
  }
  const text = normalizeScheduleCellText(15, sanitize(value))
  const cursor = normalizeScheduleCellText(15, sanitize(value.slice(0, caret))).length
  const parts = text.split(/([-–—/;\r\n])/)
  let formatted = '', offset = 0, nextCaret = cursor
  parts.forEach((part, index) => {
    let replacement = part
    const compact = /^(\d{1,4})$/.exec(part)
    const overflow = /^(\d):([0-9]{3})$/.exec(part)
    const completedPart = index < parts.length - 1
    if (compact && (compact[1].length >= 3 || completedPart)) replacement = completeScheduleTimeText(part)
    else if (overflow) {
      const candidate = completeScheduleTimeText(`${overflow[1]}${overflow[2]}`)
      if (candidate.includes(':')) replacement = candidate
    }
    if (cursor >= offset + part.length) nextCaret = formatted.length + replacement.length
    else if (cursor >= offset) nextCaret = formatted.length + Math.max(0, Math.min(replacement.length, cursor - offset + replacement.length - part.length))
    formatted += replacement
    offset += part.length
  })
  return { value: formatted, caret: nextCaret }
}

export function indexScheduleRows(sheets: readonly DepartmentScheduleImportSheet[]): ReadonlyMap<number, number>[] {
  return sheets.map(sheet => new Map(sheet.rows.map((row, index) => [row.rowNumber, index])))
}

export function scheduleCollegeForCourseType(type: string): string {
  const normalized = type.trim().replace(/\s+/g, ' ').toUpperCase()
  if (normalized === 'LECTURE') return 'LECTURE'
  if (normalized === 'LABORATORY') return 'LABORATORY'
  if (normalized === 'LECTURE AND LABORATORY' || normalized === 'LABORATORY AND LECTURE') return 'OPEN LAB'
  return ''
}

/** Check user edits before recording history; row pastes use their incoming Class Type. */
export function filterScheduleEditableChanges(sheets: readonly DepartmentScheduleImportSheet[], indexes: readonly ReadonlyMap<number, number>[],
  changes: readonly ScheduleCellValueChange[]): ScheduleCellValueChange[] {
  const overrides = new Map<number, Map<string, string>>()
  for (const { cell, value } of changes) {
    if (cell.column !== 0 && cell.column !== 2 && cell.column !== 3 && cell.column !== 4) continue
    const index = indexes[cell.sheet]?.get(cell.row)
    if (index === undefined) continue
    const sheetOverrides = overrides.get(cell.sheet) ?? new Map<string, string>()
    sheetOverrides.set(`${index}:${cell.column}`, value)
    overrides.set(cell.sheet, sheetOverrides)
  }
  const colleges = sheets.map((sheet, sheetIndex) => scheduleEditableColleges(sheet.rows, sheet.yearSections, overrides.get(sheetIndex)))
  return changes.filter(({ cell }) => {
    if (cell.column < 0 || cell.column > 20) return false
    const index = indexes[cell.sheet]?.get(cell.row)
    const row = index === undefined ? undefined : sheets[cell.sheet]?.rows[index]
    return index !== undefined && row !== undefined && isScheduleColumnEditable(colleges[cell.sheet][index], cell.column)
  })
}

/** Expand user changes before recording history; undo/redo still applies raw saved changes. */
export function linkScheduleCourseChanges(sheets: readonly DepartmentScheduleImportSheet[], indexes: readonly ReadonlyMap<number, number>[],
  changes: readonly ScheduleCellValueChange[], courses: readonly DepartmentCourseSuggestion[], complete = true): ScheduleCellValueChange[] {
  const cellKey = (cell: CellEditLocation) => JSON.stringify([cell.sheet, cell.row, cell.column])
  const result = new Map(changes.map(change => {
    const value = normalizeScheduleCellText(change.cell.column, change.value)
    return [cellKey(change.cell), { ...change, value: complete && (change.cell.column === 15 || change.cell.column === 16) ? completeScheduleTimeText(value) : value }]
  }))
  const rows = new Map<string, { cell: CellEditLocation; values: Map<number, string> }>()
  for (const change of changes) {
    if (change.cell.column !== 2 && change.cell.column !== 3) continue
    const key = JSON.stringify([change.cell.sheet, change.cell.row])
    const row = rows.get(key) ?? { cell: change.cell, values: new Map<number, string>() }
    row.values.set(change.cell.column, change.value)
    rows.set(key, row)
  }
  for (const { cell, values } of rows.values()) {
    const rowIndex = indexes[cell.sheet]?.get(cell.row)
    const sheet = sheets[cell.sheet]
    if (rowIndex === undefined || !sheet?.rows[rowIndex]) continue
    const entries = [...values].filter(([, value]) => value.trim())
    const set = (column: number, value: string) => {
      const target = { ...cell, column }
      result.set(cellKey(target), { cell: target, value: normalizeScheduleCellText(column, value) })
    }
    const valueAt = (index: number, column: number) => {
      const target = { sheet: cell.sheet, row: sheet.rows[index].rowNumber, column }
      return result.get(cellKey(target))?.value ?? sheet.rows[index].values[column] ?? ''
    }
    const sameCourse = (index: number, code: string, title: string) => {
      const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase()
      const previousCode = normalize(valueAt(index, 2)), previousTitle = normalize(valueAt(index, 3))
      return code && previousCode ? code === previousCode : Boolean(title && previousTitle && title === previousTitle)
    }
    const belowParallel = (code: string, title: string) => {
      if (valueAt(rowIndex, 0).trim().toUpperCase() === 'PARALLEL') return true
      const sectionStart = sheet.yearSections?.find(section => rowIndex >= section.start && rowIndex < section.start + section.count)?.start ?? 0
      for (let index = rowIndex - 1; index >= Math.max(sectionStart, rowIndex - 3); index--) {
        if (!sameCourse(index, code, title)) break
        const college = valueAt(index, 0).trim().toUpperCase()
        if (college === 'PARALLEL') return true
        if (college) break
      }
      return false
    }
    if (!entries.length) {
      set(0, '')
      set(2, ''); set(3, '')
      continue
    }
    if (!complete) continue
    const sectionIndex = Math.max(0, sheet.yearSections?.findIndex(section => rowIndex >= section.start && rowIndex < section.start + section.count) ?? 0)
    const section = sheet.yearSections?.[sectionIndex]
    const year = scheduleCourseYear(section?.label ?? '', section?.sourceLabel, sectionIndex)
    const course = entries.map(([column, value]) => resolveScheduleCourse(courses, value, column, year)).find(Boolean)
    if (course?.code && course.title) {
      if (!belowParallel(course.code.trim().replace(/\s+/g, ' ').toUpperCase(), course.title.trim().replace(/\s+/g, ' ').toUpperCase())) {
        set(0, scheduleCollegeForCourseType(course.type))
      }
      set(2, course.code); set(3, course.title)
    }
  }
  return [...result.values()]
}

/** Copy only changed sheets, rows, and value arrays so React can reuse everything else. */
export function applyScheduleCellValues(sheets: DepartmentScheduleImportSheet[], indexes: readonly ReadonlyMap<number, number>[], changes: readonly ScheduleCellValueChange[]): DepartmentScheduleImportSheet[] {
  const edits = new Map<number, Map<number, Map<number, string>>>()
  for (const { cell, value } of changes) {
    const rowIndex = indexes[cell.sheet]?.get(cell.row)
    const row = rowIndex === undefined ? undefined : sheets[cell.sheet]?.rows[rowIndex]
    if (!row || cell.column < 0 || cell.column >= row.values.length) continue
    let sheetEdits = edits.get(cell.sheet)
    if (!sheetEdits) { sheetEdits = new Map(); edits.set(cell.sheet, sheetEdits) }
    let rowEdits = sheetEdits.get(rowIndex!)
    if (!rowEdits) { rowEdits = new Map(); sheetEdits.set(rowIndex!, rowEdits) }
    rowEdits.set(cell.column, normalizeScheduleCellText(cell.column, value))
  }
  let next = sheets
  for (const [sheetIndex, sheetEdits] of edits) {
    const sheet = sheets[sheetIndex]
    let rows = sheet.rows
    for (const [rowIndex, rowEdits] of sheetEdits) {
      const row = sheet.rows[rowIndex]
      if ([...rowEdits].every(([column, value]) => row.values[column] === value)) continue
      if (rows === sheet.rows) rows = [...rows]
      const values = [...row.values]
      for (const [column, value] of rowEdits) values[column] = value
      rows[rowIndex] = { ...row, values }
    }
    if (rows === sheet.rows) continue
    if (next === sheets) next = [...sheets]
    next[sheetIndex] = { ...sheet, rows }
  }
  return next
}
