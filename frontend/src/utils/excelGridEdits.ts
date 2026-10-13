import * as XLSX from 'xlsx'
import type { SheetPreviewFormatting } from './excelPreviewStyles'

export interface GridEdit {
  axis: 'row' | 'column'
  start: number
  count: number
  remove: boolean
  band?: { start: number; end: number }
}

export function clearRangeText(sheet: XLSX.WorkSheet, overrides: Map<string, string>, range: XLSX.Range, merges: readonly XLSX.Range[], protectedColumn?: number): Map<string, string> {
  const intersects = (other: XLSX.Range) => other.s.r <= range.e.r && other.e.r >= range.s.r
    && other.s.c <= range.e.c && other.e.c >= range.s.c
  const mergedAnchors = new Set(merges.filter(intersects).map(merge => XLSX.utils.encode_cell(merge.s)))
  const protectedAnchors = new Set(merges.filter(merge => protectedColumn !== undefined && merge.s.c <= protectedColumn && merge.e.c >= protectedColumn).map(merge => XLSX.utils.encode_cell(merge.s)))
  let next = overrides
  // Visit stored cells rather than filling large selections with empty overrides.
  for (const address of new Set([...Object.keys(sheet), ...overrides.keys()])) {
    if (address.startsWith('!')) continue
    const position = XLSX.utils.decode_cell(address)
    if (position.c === protectedColumn || protectedAnchors.has(address)) continue
    if (!mergedAnchors.has(address) && !intersects({ s: position, e: position })) continue
    const cell = sheet[address] as XLSX.CellObject | undefined
    const value = overrides.get(address) ?? cell?.w ?? cell?.v ?? cell?.f ?? ''
    if (String(value) === '') continue
    if (next === overrides) next = new Map(overrides)
    next.set(address, '')
  }
  return next
}

export function setSheetAxisHidden(sheet: XLSX.WorkSheet, axis: 'row' | 'column', indexes: readonly number[], hidden: boolean): XLSX.WorkSheet {
  const key = axis === 'row' ? '!rows' : '!cols'
  const metadata = [...(sheet[key] ?? [])]
  let changed = false
  for (const index of indexes) {
    if (Boolean(metadata[index]?.hidden) === hidden) continue
    metadata[index] = { ...metadata[index], hidden }
    changed = true
  }
  return changed ? { ...sheet, [key]: metadata } : sheet
}

export function moveCell(position: XLSX.CellAddress, edit: GridEdit): XLSX.CellAddress | null {
  const axis = edit.axis === 'row' ? 'r' : 'c'
  const other = axis === 'r' ? 'c' : 'r'
  if (edit.band && (position[other] < edit.band.start || position[other] > edit.band.end)) return { ...position }
  if (position[axis] < edit.start) return { ...position }
  if (edit.remove && position[axis] < edit.start + edit.count) return null
  const moved = { ...position, [axis]: position[axis] + (edit.remove ? -edit.count : edit.count) }
  if (moved.r >= 1048576 || moved.c >= 16384) throw new Error('This change would exceed Excel’s row or column limit.')
  return moved
}

export function moveRange(range: XLSX.Range, edit: GridEdit, overflow: 'throw' | 'clip' = 'throw'): XLSX.Range | null {
  const axis = edit.axis === 'row' ? 'r' : 'c'
  const other = axis === 'r' ? 'c' : 'r'
  if (edit.band && (range.e[other] < edit.band.start || range.s[other] > edit.band.end)) return { s: { ...range.s }, e: { ...range.e } }
  if (edit.band && (range.s[other] < edit.band.start || range.e[other] > edit.band.end)) {
    if (range.e[axis] >= edit.start) throw new Error('This change would split a merged cell. Unmerge it first.')
    return { s: { ...range.s }, e: { ...range.e } }
  }
  if (edit.remove && range.s[axis] >= edit.start && range.e[axis] < edit.start + edit.count) return null
  const next = { s: { ...range.s }, e: { ...range.e } }
  if (edit.remove) {
    next.s[axis] = range.s[axis] < edit.start ? range.s[axis] : Math.max(edit.start, range.s[axis] - edit.count)
    next.e[axis] = range.e[axis] < edit.start ? range.e[axis] : Math.max(edit.start - 1, range.e[axis] - edit.count)
  } else {
    if (range.s[axis] >= edit.start) next.s[axis] += edit.count
    if (range.e[axis] >= edit.start) next.e[axis] += edit.count
  }
  // Inherited formatting often reaches XFD or row 1048576 even on a small sheet.
  // Clip that metadata after shifting; cells and merges keep the strict default.
  if (overflow === 'clip') {
    next.e.r = Math.min(next.e.r, 1048575)
    next.e.c = Math.min(next.e.c, 16383)
  } else if (next.e.r >= 1048576 || next.e.c >= 16384) throw new Error('This change would exceed Excel’s row or column limit.')
  return next.s[axis] <= next.e[axis] ? next : null
}

export function moveCellMap<T>(source: Map<string, T>, edit: GridEdit): Map<string, T> {
  const next = new Map<string, T>()
  for (const [address, value] of source) {
    const position = moveCell(XLSX.utils.decode_cell(address), edit)
    if (position) next.set(XLSX.utils.encode_cell(position), value)
  }
  return next
}

export function moveIndexMap<T>(source: Map<number, T>, edit: GridEdit): Map<number, T> {
  if (edit.band) return source
  const next = new Map<number, T>()
  for (const [index, value] of source) {
    const position = moveCell(edit.axis === 'row' ? { r: index, c: 0 } : { r: 0, c: index }, edit)
    if (position) next.set(edit.axis === 'row' ? position.r : position.c, value)
  }
  return next
}

export function moveSheet(sheet: XLSX.WorkSheet, edit: GridEdit, merges: XLSX.Range[]): XLSX.WorkSheet {
  const next: XLSX.WorkSheet = {}
  for (const [address, value] of Object.entries(sheet)) {
    if (address.startsWith('!')) next[address] = value
    else {
      const position = moveCell(XLSX.utils.decode_cell(address), edit)
      if (position) next[XLSX.utils.encode_cell(position)] = value
    }
  }
  next['!merges'] = merges
  if (!edit.band) {
    const key = edit.axis === 'row' ? '!rows' : '!cols'
    if (sheet[key]) {
      const entries = moveIndexMap(new Map(sheet[key].flatMap((value, index) => value ? [[index, value] as const] : [])), edit)
      const metadata: NonNullable<typeof sheet[typeof key]> = []
      for (const [index, value] of entries) metadata[index] = value
      next[key] = metadata
    }
  }
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 25 } }
  if (!edit.band) {
    const moved = moveRange(range, edit)
    next['!ref'] = XLSX.utils.encode_range(moved ?? { s: { r: 0, c: 0 }, e: { r: 0, c: 25 } })
  } else {
    for (const address of Object.keys(next)) {
      if (address.startsWith('!')) continue
      const position = XLSX.utils.decode_cell(address)
      range.e.r = Math.max(range.e.r, position.r)
      range.e.c = Math.max(range.e.c, position.c)
    }
    next['!ref'] = XLSX.utils.encode_range(range)
  }
  return next
}

export function moveFormatting(formatting: SheetPreviewFormatting, edit: GridEdit): SheetPreviewFormatting {
  // Conditional formatting can cover an area wider than a cell-shift band.
  // Split those areas so formatting on unaffected cells stays in place.
  const moveFormattingRange = (range: XLSX.Range): XLSX.Range[] => {
    if (!edit.band) return [moveRange(range, edit, 'clip')].filter((value): value is XLSX.Range => value !== null)
    const other = edit.axis === 'row' ? 'c' : 'r'
    const first = Math.max(range.s[other], edit.band.start)
    const last = Math.min(range.e[other], edit.band.end)
    if (first > last) return [range]
    const pieces: XLSX.Range[] = []
    if (range.s[other] < first) pieces.push({ s: { ...range.s }, e: { ...range.e, [other]: first - 1 } })
    const middle = moveRange({ s: { ...range.s, [other]: first }, e: { ...range.e, [other]: last } }, edit, 'clip')
    if (middle) pieces.push(middle)
    if (range.e[other] > last) pieces.push({ s: { ...range.s, [other]: last + 1 }, e: { ...range.e } })
    return pieces
  }
  return {
    indexes: moveCellMap(formatting.indexes, edit),
    rowIndexes: edit.axis === 'row' ? moveIndexMap(formatting.rowIndexes, edit) : formatting.rowIndexes,
    columnIndexes: edit.axis === 'column' && !edit.band ? formatting.columnIndexes.flatMap(column => {
      const range = moveRange({ s: { r: 0, c: column.first }, e: { r: 0, c: column.last } }, edit, 'clip')
      return range ? [{ ...column, first: range.s.c, last: range.e.c }] : []
    }) : formatting.columnIndexes,
    conditionalRules: formatting.conditionalRules.map(rule => ({ ...rule, ranges: rule.ranges.flatMap(moveFormattingRange) })),
  }
}

export function formatClipboardRows(rows: readonly (readonly string[])[]): string {
  return rows.map(row => row.map(value => /[\t\r\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join('\t')).join('\n')
}

export function parseClipboardRows(text: string): string[][] {
  const rows: string[][] = [[]]
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"' && (quoted || value === '')) {
      if (quoted && text[index + 1] === '"') { value += '"'; index++ }
      else quoted = !quoted
    } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
      rows[rows.length - 1].push(value)
      value = ''
      if (char !== '\t') {
        if (char === '\r' && text[index + 1] === '\n') index++
        rows.push([])
      }
    } else value += char
  }
  rows[rows.length - 1].push(value)
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '' && /[\r\n]$/.test(text)) rows.pop()
  return rows
}
