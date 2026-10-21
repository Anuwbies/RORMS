import type { CSSProperties } from 'react'

export const SCHEDULE_YEARS = [1, 2, 3, 4] as const
export type ScheduleYear = typeof SCHEDULE_YEARS[number]
export interface ScheduleRange { s: { r: number; c: number }; e: { r: number; c: number } }
export interface ScheduleSetup {
  header: ScheduleRange
  columns: readonly number[]
  years: ReadonlyMap<number, ScheduleYear>
  includesEmptyRows?: boolean
  rowStatuses?: ReadonlyMap<number, 'Plot'>
  statusStyles?: ReadonlyMap<number, CSSProperties>
  statusColumn?: number
}

// Default formatting and compatibility with the former display-only Status column.
export function scheduleStatusStyle(setup: ScheduleSetup, row: number, validationColor?: string): CSSProperties {
  const header = row >= setup.header.s.r && row <= setup.header.e.r
  return {
    borderTop: header ? '1px solid #000000' : '1px solid #d4d4d4',
    borderBottom: header ? '1px solid #000000' : '1px solid #d4d4d4',
    borderLeft: header ? '1px solid #000000' : '1px solid #d4d4d4',
    borderRight: header ? '1px solid #000000' : '1px solid #d4d4d4',
    fontFamily: 'Arial', fontSize: 12, fontWeight: header ? 'bold' : 'normal',
    backgroundColor: header ? '#ffff00' : '#ffffff',
    color: header ? '#000000' : setup.rowStatuses?.get(row) === 'Plot' ? '#526f34' : '#475569',
    textAlign: 'center', verticalAlign: 'middle',
    ...setup.statusStyles?.get(row),
    ...(validationColor ? { backgroundColor: validationColor } : {}),
  }
}

// The full template includes fields that may be hidden in imported workbooks.
export const SCHEDULE_HEADER_GROUPS = [
  { label: 'College', offset: 0, width: 1, children: [] },
  { label: 'Subject Area', offset: 1, width: 1, children: [] },
  { label: 'Code', offset: 2, width: 1, children: [] },
  { label: 'Descriptive Title', offset: 3, width: 1, children: [] },
  { label: 'Course', offset: 4, width: 1, children: [] },
  { label: 'Units', offset: 5, width: 3, children: ['Lec', 'Lab', 'Total'] },
  { label: 'Hours', offset: 8, width: 3, children: ['Lec', 'Lab', 'Total'] },
  { label: 'Max No. of Stud.', offset: 11, width: 1, children: [] },
  { label: 'Section', offset: 12, width: 1, children: [] },
  { label: 'Faculty', offset: 13, width: 2, children: ['Lec', 'Lab'] },
  { label: 'F2F Time', offset: 15, width: 2, children: ['Lec', 'Lab'] },
  { label: 'F2F Days', offset: 17, width: 2, children: ['Lec', 'Lab'] },
  { label: 'F2F Room', offset: 19, width: 2, children: ['Lec', 'Lab'] },
] as const

export const SCHEDULE_COLUMN_COUNT = 21
export const SCHEDULE_YEAR_LABELS: Record<ScheduleYear, string> = { 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year' }
export type ScheduleCellReader = (row: number, column: number) => string

export function scheduleHeaderAt(start: ScheduleRange['s'], columns?: readonly number[]): ScheduleRange {
  return { s: { r: start.r, c: columns?.[0] ?? start.c }, e: { r: start.r + 1, c: columns?.at(-1) ?? start.c + SCHEDULE_COLUMN_COUNT - 1 } }
}

export function scheduleHeaderValues(): string[][] {
  const values = [Array<string>(SCHEDULE_COLUMN_COUNT).fill(''), Array<string>(SCHEDULE_COLUMN_COUNT).fill('')]
  for (const group of SCHEDULE_HEADER_GROUPS) {
    values[0][group.offset] = group.label
    group.children.forEach((label, index) => { values[1][group.offset + index] = label })
  }
  return values
}

export function scheduleHeaderMerges(header: ScheduleRange, columns: readonly number[] = Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, index) => header.s.c + index)): ScheduleRange[] {
  return SCHEDULE_HEADER_GROUPS.map(group => ({
    s: { r: header.s.r, c: columns[group.offset] },
    e: { r: header.s.r + (group.width === 1 ? 1 : 0), c: columns[group.offset + group.width - 1] },
  }))
}

function normalizedHeader(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase().replace('desciptive', 'descriptive')
}

export function validateScheduleHeader(header: ScheduleRange, read: ScheduleCellReader, columns: readonly number[] = Array.from({ length: header.e.c - header.s.c + 1 }, (_, index) => header.s.c + index)): string | null {
  if (header.e.r - header.s.r !== 1 || columns.length !== SCHEDULE_COLUMN_COUNT || columns[0] !== header.s.c || columns.at(-1) !== header.e.c || columns.some((column, index) => index > 0 && column <= columns[index - 1])) {
    return 'Select both header rows from College through F2F Room (21 template columns, including hidden columns).'
  }
  const expected = scheduleHeaderValues()
  for (let row = 0; row < 2; row++) for (let column = 0; column < SCHEDULE_COLUMN_COUNT; column++) {
    const actual = normalizedHeader(read(header.s.r + row, columns[column]))
    // Workbooks saved before the Hours heading was added have this cell blank.
    if (row === 0 && column === 8 && !actual) continue
    if (actual !== normalizedHeader(expected[row][column])) {
      return `The selected headers do not match the fixed template at column ${column + 1}, header row ${row + 1}.`
    }
  }
  return null
}

export function detectScheduleSetup(candidates: Iterable<ScheduleRange['s']>, lastRow: number, read: ScheduleCellReader): ScheduleSetup | null {
  const anchors = [...candidates].filter(position => normalizedHeader(read(position.r, position.c)) === 'college')
    .sort((first, second) => first.r - second.r || first.c - second.c)
  for (const anchor of anchors) {
    const header = scheduleHeaderAt(anchor)
    if (header.e.r > lastRow || validateScheduleHeader(header, read)) continue
    const columns = Array.from({ length: SCHEDULE_COLUMN_COUNT }, (_, index) => anchor.c + index)
    const years = new Map<number, ScheduleYear>()
    const setup: ScheduleSetup = { header, columns, years, includesEmptyRows: true,
      ...(normalizedHeader(read(header.s.r, header.e.c + 1)) === 'status' ? { statusColumn: header.e.c + 1 } : {}) }
    let activeYear: ScheduleYear | undefined
    let sectionStart = header.e.r + 1
    let lastNonEmptyRow = sectionStart - 1
    const finishSection = () => {
      if (activeYear) for (let row = sectionStart; row <= lastNonEmptyRow; row++) years.set(row, activeYear)
    }
    for (let row = header.e.r + 1; row <= lastRow; row++) {
      if (!isScheduleSubjectRow(setup, row, read)) {
        const label = read(row, columns[0]).trim()
        const heading = /^([1-9])\s*[a-z][a-z0-9]{1,}(?=\s|:|\/|$)/i.exec(label)
        if (heading) {
          finishSection()
          sectionStart = row
          lastNonEmptyRow = row - 1
          const year = Number(heading[1])
          activeYear = SCHEDULE_YEARS.find(value => value === year)
        } else if (/^(?:off[\s-]*sem(?:ester)?|summer)\b/i.test(label)) {
          finishSection()
          activeYear = undefined
        }
      }
      // Include internal blank rows, but end each section at its last populated template row.
      if (activeYear && columns.some(column => read(row, column).trim())) lastNonEmptyRow = row
    }
    finishSection()
    if (setup.statusColumn !== undefined) {
      const rowStatuses = new Map<number, 'Plot'>()
      for (const row of years.keys()) if (read(row, setup.statusColumn).trim().toLowerCase() === 'plot') rowStatuses.set(row, 'Plot')
      if (rowStatuses.size) setup.rowStatuses = rowStatuses
    }
    return setup
  }
  return null
}

export function isScheduleSubjectRow(setup: ScheduleSetup, row: number, read: ScheduleCellReader): boolean {
  return row > setup.header.e.r && Boolean(read(row, setup.columns[2]).trim() && read(row, setup.columns[3]).trim())
}

export function assignScheduleYear(setup: ScheduleSetup, range: ScheduleRange, year: ScheduleYear | null, read: ScheduleCellReader): { setup: ScheduleSetup; count: number } {
  const years = new Map(readAssignedScheduleRecords(setup, read).map(record => [record.row, record.year!]))
  const rowStatuses = new Map(setup.rowStatuses)
  let count = 0
  for (let row = Math.max(range.s.r, setup.header.e.r + 1); row <= range.e.r; row++) {
    if (year !== null || years.has(row)) {
      if (year === null) { years.delete(row); rowStatuses.delete(row) }
      else years.set(row, year)
      count++
    }
  }
  return { setup: { ...setup, years, includesEmptyRows: true, ...(setup.rowStatuses ? { rowStatuses } : {}) }, count }
}

export function selectedScheduleRows(setup: ScheduleSetup, range: ScheduleRange, read: ScheduleCellReader): number[] {
  const firstColumn = Math.min(setup.header.s.c, setup.statusColumn ?? setup.header.s.c)
  const lastColumn = Math.max(setup.header.e.c, setup.statusColumn ?? setup.header.e.c)
  if (range.s.c < firstColumn || range.e.c > lastColumn) return []
  return [...setup.years.keys()].filter(row => row > setup.header.e.r && row >= range.s.r && row <= range.e.r
    && setup.columns.slice(1).some(column => read(row, column).trim()))
}

export function plotScheduleRows(setup: ScheduleSetup, range: ScheduleRange, read: ScheduleCellReader, status: 'Plot' | 'Draft' = 'Plot'): ScheduleSetup {
  const rows = selectedScheduleRows(setup, range, read)
  if (!rows.some(row => status === 'Plot' ? setup.rowStatuses?.get(row) !== 'Plot' : setup.rowStatuses?.get(row) === 'Plot')) return setup
  const rowStatuses = new Map(setup.rowStatuses)
  rows.forEach(row => { if (status === 'Plot') rowStatuses.set(row, 'Plot'); else rowStatuses.delete(row) })
  return { ...setup, rowStatuses }
}

export interface ScheduleRecord {
  row: number
  year: ScheduleYear | undefined
  values: string[]
}

export function readScheduleRecords(setup: ScheduleSetup, range: ScheduleRange, read: ScheduleCellReader): ScheduleRecord[] {
  const records: ScheduleRecord[] = []
  for (let row = Math.max(range.s.r, setup.header.e.r + 1); row <= range.e.r; row++) {
    records.push({
      row, year: setup.years.get(row),
      values: setup.columns.map(column => read(row, column)),
    })
  }
  return records
}

export function readAssignedScheduleRecords(setup: ScheduleSetup, read: ScheduleCellReader): ScheduleRecord[] {
  const years = new Map(setup.years)
  // Older in-memory assignments recorded only subject rows. Retain their blank separators too.
  if (!setup.includesEmptyRows) for (const year of SCHEDULE_YEARS) {
    const assigned = [...years].filter(([row, value]) => row > setup.header.e.r && value === year).map(([row]) => row)
    if (!assigned.length) continue
    const first = assigned.reduce((minimum, row) => Math.min(minimum, row), assigned[0])
    const last = assigned.reduce((maximum, row) => Math.max(maximum, row), assigned[0])
    for (let row = first; row <= last; row++) {
      if (!years.has(row) && setup.columns.every(column => !read(row, column).trim())) years.set(row, year)
    }
  }
  return [...years].sort(([first], [second]) => first - second)
    .filter(([row]) => row > setup.header.e.r)
    .map(([row, year]) => ({ row, year, values: setup.columns.map(column => read(row, column)) }))
}

export interface SchedulePreviewMerge {
  source: ScheduleRange
  firstRow: number
  firstColumn: number
  rowSpan: number
  columnSpan: number
}

export function projectScheduleMerges(rows: readonly number[], columns: readonly number[], merges: readonly ScheduleRange[]): Map<string, SchedulePreviewMerge> {
  const cells = new Map<string, SchedulePreviewMerge>()
  for (const source of merges) {
    const mergedRows = rows.filter(row => row >= source.s.r && row <= source.e.r)
    const mergedColumns = columns.filter(column => column >= source.s.c && column <= source.e.c)
    if (!mergedRows.length || !mergedColumns.length) continue
    const merge = { source, firstRow: mergedRows[0], firstColumn: mergedColumns[0], rowSpan: mergedRows.length, columnSpan: mergedColumns.length }
    for (const row of mergedRows) for (const column of mergedColumns) cells.set(`${row}:${column}`, merge)
  }
  return cells
}

interface ScheduleGridEdit { axis: 'row' | 'column'; start: number; count: number; remove: boolean; band?: { start: number; end: number } }

// Edits through the template invalidate it. Entire rows/columns before it move its anchor.
export function moveScheduleSetup(setup: ScheduleSetup, edit: ScheduleGridEdit): ScheduleSetup | null {
  const header = { s: { ...setup.header.s }, e: { ...setup.header.e } }
  const axis = edit.axis === 'row' ? 'r' : 'c'
  const end = edit.start + edit.count - 1
  if (edit.band) {
    const intersectsColumns = edit.axis === 'row'
      ? edit.band.start <= header.e.c && edit.band.end >= header.s.c
      : edit.start <= header.e.c
    const intersectsRows = edit.axis === 'row' || edit.band.end >= header.s.r
    return intersectsColumns && intersectsRows ? null : setup
  }
  if (edit.remove ? edit.start <= header.e[axis] && end >= header.s[axis] : edit.start > header.s[axis] && edit.start <= header.e[axis]) return null
  const delta = edit.remove ? -edit.count : edit.count
  if (edit.start <= header.s[axis]) {
    header.s[axis] += delta
    header.e[axis] += delta
  }
  const years = new Map<number, ScheduleYear>()
  for (const [row, year] of setup.years) {
    if (edit.axis !== 'row' || row < edit.start) years.set(row, year)
    else if (!edit.remove || row > end) years.set(row + delta, year)
  }
  const columns = edit.axis === 'column' && edit.start <= setup.header.s.c ? setup.columns.map(column => column + delta) : [...setup.columns]
  const rowStatuses = new Map<number, 'Plot'>()
  for (const [row, status] of setup.rowStatuses ?? []) {
    if (edit.axis !== 'row' || row < edit.start) rowStatuses.set(row, status)
    else if (!edit.remove || row > end) rowStatuses.set(row + delta, status)
  }
  const statusStyles = new Map<number, CSSProperties>()
  for (const [row, style] of setup.statusStyles ?? []) {
    if (edit.axis !== 'row' || row < edit.start) statusStyles.set(row, style)
    else if (!edit.remove || row > end) statusStyles.set(row + delta, style)
  }
  let statusColumn = setup.statusColumn
  if (statusColumn !== undefined && edit.axis === 'column' && edit.start <= statusColumn) {
    statusColumn = edit.remove && end >= statusColumn ? undefined : statusColumn + delta
  }
  return { ...setup, header, columns, years, ...(setup.rowStatuses ? { rowStatuses } : {}), ...(setup.statusStyles ? { statusStyles } : {}), ...(setup.statusColumn !== undefined ? { statusColumn } : {}) }
}
