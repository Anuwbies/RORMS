import * as XLSX from 'xlsx'
import type { CSSProperties } from 'react'
import type { SheetPreviewFormatting } from './excelPreviewStyles'
import type { ScheduleSetup } from './excelScheduleTemplate'
import type { WorkbookEditSnapshot } from './excelWorkbookState'

export interface AxisMove {
  axis: 'row' | 'column'
  start: number
  count: number
  /** Insertion boundary in the original grid, before removing the source. */
  before: number
}

export function axisMoveIndex(index: number, move: AxisMove): number {
  const end = move.start + move.count
  if (move.before >= move.start && move.before <= end) return index
  if (index >= move.start && index < end) {
    return (move.before < move.start ? move.before : move.before - move.count) + index - move.start
  }
  if (move.before < move.start && index >= move.before && index < move.start) return index + move.count
  if (move.before > end && index >= end && index < move.before) return index - move.count
  return index
}

/** Split metadata ranges at permutation boundaries; never enumerate an entire Excel axis. */
export function axisMoveRanges(start: number, end: number, move: AxisMove): { start: number; end: number }[] {
  const boundaries = [...new Set([start, end + 1, move.start, move.start + move.count, move.before])]
    .filter(index => index >= start && index <= end + 1).sort((a, b) => a - b)
  const pieces = boundaries.slice(0, -1).map((index, offset) => ({
    start: axisMoveIndex(index, move), end: axisMoveIndex(boundaries[offset + 1] - 1, move),
  })).sort((a, b) => a.start - b.start)
  const result: { start: number; end: number }[] = []
  for (const piece of pieces) {
    const previous = result.at(-1)
    if (previous && piece.start <= previous.end + 1) previous.end = Math.max(previous.end, piece.end)
    else result.push(piece)
  }
  return result
}

export function validateAxisMove(move: AxisMove, merges: readonly XLSX.Range[]): void {
  const limit = move.axis === 'row' ? 1048576 : 16384
  if (![move.start, move.count, move.before].every(Number.isSafeInteger)
    || move.start < 0 || move.count < 1 || move.start + move.count > limit || move.before < 0 || move.before > limit) {
    throw new Error('The move is outside Excel’s row or column limits.')
  }
  const coordinate = move.axis === 'row' ? 'r' : 'c'
  const label = move.axis === 'row' ? 'rows' : 'columns'
  for (const merge of merges) {
    const start = merge.s[coordinate], end = merge.e[coordinate]
    if (start < move.start + move.count && end >= move.start && (start < move.start || end >= move.start + move.count)) {
      throw new Error(`Select all ${label} of the merged cell ${XLSX.utils.encode_range(merge)} before dragging, or unmerge it first.`)
    }
    if ((move.before < move.start || move.before > move.start + move.count) && start < move.before && end >= move.before) {
      throw new Error(`This drop would split merged cell ${XLSX.utils.encode_range(merge)}. Drop before or after all of its ${label}.`)
    }
  }
}

function movePosition(position: XLSX.CellAddress, move: AxisMove): XLSX.CellAddress {
  const coordinate = move.axis === 'row' ? 'r' : 'c'
  return { ...position, [coordinate]: axisMoveIndex(position[coordinate], move) }
}

function cellMap<T>(source: ReadonlyMap<string, T>, move: AxisMove): Map<string, T> {
  return new Map([...source].map(([address, value]) => [XLSX.utils.encode_cell(movePosition(XLSX.utils.decode_cell(address), move)), value]))
}

function indexMap<T>(source: ReadonlyMap<number, T>, move: AxisMove): Map<number, T> {
  return new Map([...source].map(([index, value]) => [axisMoveIndex(index, move), value]))
}

function rangePieces(range: XLSX.Range, move: AxisMove): XLSX.Range[] {
  const coordinate = move.axis === 'row' ? 'r' : 'c'
  return axisMoveRanges(range.s[coordinate], range.e[coordinate], move).map(piece => ({
    s: { ...range.s, [coordinate]: piece.start }, e: { ...range.e, [coordinate]: piece.end },
  }))
}

function reorderFormatting(source: SheetPreviewFormatting, move: AxisMove): SheetPreviewFormatting {
  return {
    indexes: cellMap(source.indexes, move),
    rowIndexes: move.axis === 'row' ? indexMap(source.rowIndexes, move) : source.rowIndexes,
    columnIndexes: move.axis === 'column' ? source.columnIndexes.flatMap(column =>
      axisMoveRanges(column.first, column.last, move).map(piece => ({ first: piece.start, last: piece.end, styleId: column.styleId }))) : source.columnIndexes,
    conditionalRules: source.conditionalRules.map(rule => ({ ...rule, ranges: rule.ranges.flatMap(range => rangePieces(range, move)) })),
  }
}

function reorderSetup(setup: ScheduleSetup, move: AxisMove): ScheduleSetup | null {
  const header = rangePieces(setup.header, move)
  if (header.length !== 1) return null
  const columns = move.axis === 'column' ? setup.columns.map(column => axisMoveIndex(column, move)) : setup.columns
  // The schedule template has a fixed field order. Keep its registration only when that order survives.
  if (columns.some((column, index) => index > 0 && column <= columns[index - 1])) return null
  const years = move.axis === 'row' ? indexMap(setup.years, move) : setup.years
  if (move.axis === 'row' && [...years.keys()].some(row => row <= header[0].e.r)) {
    throw new Error('Keep assigned schedule rows below their registered header. Move the header and its rows together, or clear Schedule Setup first.')
  }
  return {
    ...setup, header: header[0], columns, years,
    ...(setup.rowStatuses && move.axis === 'row' ? { rowStatuses: indexMap(setup.rowStatuses, move) } : {}),
    ...(setup.statusStyles && move.axis === 'row' ? { statusStyles: indexMap(setup.statusStyles, move) } : {}),
    ...(setup.statusColumn !== undefined && move.axis === 'column' ? { statusColumn: axisMoveIndex(setup.statusColumn, move) } : {}),
  }
}

/** Preserve shared edges inside a border group without moving copies on its empty outside neighbors. */
function prepareAxisMoveBorders(snapshot: WorkbookEditSnapshot, move: AxisMove, formatting: SheetPreviewFormatting, merges: readonly XLSX.Range[]): Map<string, CSSProperties> {
  const name = snapshot.selectedSheet, sheet = snapshot.workbook.Sheets[name]
  const edits = snapshot.cellStyleOverrides.get(name) ?? new Map<string, CSSProperties>()
  const result = new Map(edits)
  const texts = snapshot.cellTextOverrides.get(name)
  const sides = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const
  type Side = typeof sides[number]
  const customLine = (value: CSSProperties[Side]): string | undefined => typeof value === 'string'
    && Number.parseFloat(value) > 0 && !/\b(none|hidden)\b/i.test(value) && value.toLowerCase() !== '1px solid #d4d4d4' ? value : undefined
  const styleAt = (position: XLSX.CellAddress): CSSProperties => {
    const address = XLSX.utils.encode_cell(position)
    const id = formatting.indexes.get(address) ?? formatting.rowIndexes.get(position.r)
      ?? formatting.columnIndexes.find(column => position.c >= column.first && position.c <= column.last)?.styleId ?? 0
    return { ...snapshot.previewStyles?.cellStyles[id], ...edits.get(address) }
  }
  const hasBody = (position: XLSX.CellAddress, style: CSSProperties, sharedSide: Side): boolean => {
    const address = XLSX.utils.encode_cell(position), cell = sheet[address] as XLSX.CellObject | undefined
    if ((texts?.get(address) ?? String(cell?.v ?? '')).trim() || cell?.f || cell?.c?.length || cell?.l) return true
    if (merges.some(merge => position.r >= merge.s.r && position.r <= merge.e.r && position.c >= merge.s.c && position.c <= merge.e.c)) return true
    const fill = String(style.backgroundColor ?? '').toLowerCase().replace(/\s/g, '')
    if (fill && !['transparent', '#ffffff', '#fff', 'white', 'rgb(255,255,255)', 'rgba(0,0,0,0)'].includes(fill)) return true
    return sides.some(side => side !== sharedSide && customLine(style[side]))
  }
  const coordinate = move.axis === 'row' ? 'r' : 'c'
  const candidates = new Set([...Object.keys(sheet).filter(address => !address.startsWith('!')), ...formatting.indexes.keys(), ...edits.keys()])
  for (const address of candidates) {
    const position = XLSX.utils.decode_cell(address), index = position[coordinate]
    if (index !== move.start && index !== move.start + move.count - 1) continue
    const style = styleAt(position)
    for (const direction of [-1, 1] as const) {
      if (direction === -1 ? index !== move.start : index !== move.start + move.count - 1) continue
      const neighbor = { ...position, [coordinate]: index + direction }
      if (neighbor[coordinate] < 0 || neighbor[coordinate] >= (move.axis === 'row' ? 1048576 : 16384)) continue
      const side: Side = move.axis === 'row' ? direction === -1 ? 'borderTop' : 'borderBottom' : direction === -1 ? 'borderLeft' : 'borderRight'
      const opposite: Side = move.axis === 'row' ? direction === -1 ? 'borderBottom' : 'borderTop' : direction === -1 ? 'borderRight' : 'borderLeft'
      const line = customLine(style[side]), neighborStyle = styleAt(neighbor), neighborLine = customLine(neighborStyle[opposite])
      const sharedLine = !line || Number.parseFloat(neighborLine ?? '') > Number.parseFloat(line) ? neighborLine : line
      if (!sharedLine) continue
      const ownsBorder = hasBody(position, style, side), neighborOwnsBorder = hasBody(neighbor, neighborStyle, opposite)
      if (ownsBorder && neighborOwnsBorder) {
        // Either cell may store the visible edge. Both sections need it after separation.
        result.set(address, { ...result.get(address), [side]: sharedLine })
        const neighborAddress = XLSX.utils.encode_cell(neighbor)
        result.set(neighborAddress, { ...result.get(neighborAddress), [opposite]: sharedLine })
      } else if (line !== neighborLine) continue
      else if (!ownsBorder && neighborOwnsBorder) {
        result.set(address, { ...result.get(address), [side]: 'none' })
      } else if (ownsBorder && !neighborOwnsBorder) {
        const neighborAddress = XLSX.utils.encode_cell(neighbor)
        result.set(neighborAddress, { ...result.get(neighborAddress), [opposite]: 'none' })
      }
    }
  }
  return result
}

/** One immutable snapshot makes a header move atomic for undo, save, and export. */
export function reorderWorkbookAxis(snapshot: WorkbookEditSnapshot, move: AxisMove, formatting: SheetPreviewFormatting): WorkbookEditSnapshot {
  const name = snapshot.selectedSheet
  const source = snapshot.workbook.Sheets[name]
  if (!source) throw new Error('The selected sheet is no longer available.')
  const merges = snapshot.mergeOverrides.get(name) ?? source['!merges'] ?? []
  validateAxisMove(move, merges)
  if (move.before >= move.start && move.before <= move.start + move.count) return snapshot
  const reorderedMerges = merges.map(merge => ({ s: movePosition(merge.s, move), e: movePosition(merge.e, move) }))
  const setup = snapshot.scheduleSetups.get(name)
  const nextSetup = setup ? reorderSetup(setup, move) : undefined
  const sheet: XLSX.WorkSheet = {}
  for (const [address, value] of Object.entries(source)) {
    sheet[address.startsWith('!') ? address : XLSX.utils.encode_cell(movePosition(XLSX.utils.decode_cell(address), move))] = value
  }
  sheet['!merges'] = reorderedMerges
  const metadataKey = move.axis === 'row' ? '!rows' : '!cols'
  if (source[metadataKey]) {
    const metadata: NonNullable<typeof source[typeof metadataKey]> = []
    source[metadataKey].forEach((value, index) => { if (value) metadata[axisMoveIndex(index, move)] = value })
    sheet[metadataKey] = metadata
  }
  const ranges = rangePieces(XLSX.utils.decode_range(source['!ref'] || 'A1'), move)
  const reference = {
    s: { r: Math.min(...ranges.map(range => range.s.r)), c: Math.min(...ranges.map(range => range.s.c)) },
    e: { r: Math.max(...ranges.map(range => range.e.r)), c: Math.max(...ranges.map(range => range.e.c)) },
  }
  const cellTextOverrides = new Map(snapshot.cellTextOverrides).set(name, cellMap(snapshot.cellTextOverrides.get(name) ?? new Map(), move))
  // Edited cells may live beyond the original worksheet reference.
  for (const address of [...Object.keys(sheet), ...cellTextOverrides.get(name)!.keys()]) {
    if (address.startsWith('!')) continue
    const position = XLSX.utils.decode_cell(address)
    reference.s.r = Math.min(reference.s.r, position.r)
    reference.e.r = Math.max(reference.e.r, position.r)
    reference.s.c = Math.min(reference.s.c, position.c)
    reference.e.c = Math.max(reference.e.c, position.c)
  }
  sheet['!ref'] = XLSX.utils.encode_range(reference)
  const hidden = snapshot.hiddenRangeToggles.get(name)
  const hiddenRangeToggles = new Map(snapshot.hiddenRangeToggles)
  if (hidden) hiddenRangeToggles.set(name, { ...hidden, [move.axis]: hidden[move.axis].flatMap(range => axisMoveRanges(range.start, range.end, move)) })
  const scheduleSetups = new Map(snapshot.scheduleSetups)
  if (nextSetup) scheduleSetups.set(name, nextSetup)
  else if (setup) scheduleSetups.delete(name)
  return {
    ...snapshot,
    workbook: { ...snapshot.workbook, Sheets: { ...snapshot.workbook.Sheets, [name]: sheet } },
    cellTextOverrides,
    cellStyleOverrides: new Map(snapshot.cellStyleOverrides).set(name, cellMap(prepareAxisMoveBorders(snapshot, move, formatting, merges), move)),
    mergeOverrides: new Map(snapshot.mergeOverrides).set(name, reorderedMerges),
    formattingOverrides: new Map(snapshot.formattingOverrides).set(name, reorderFormatting(formatting, move)),
    rowHeightOverrides: move.axis === 'row' ? new Map(snapshot.rowHeightOverrides).set(name, indexMap(snapshot.rowHeightOverrides.get(name) ?? new Map(), move)) : snapshot.rowHeightOverrides,
    columnWidthOverrides: move.axis === 'column' ? new Map(snapshot.columnWidthOverrides).set(name, indexMap(snapshot.columnWidthOverrides.get(name) ?? new Map(), move)) : snapshot.columnWidthOverrides,
    hiddenRangeToggles, scheduleSetups,
    selection: { anchor: movePosition(snapshot.selection.anchor, move), focus: movePosition(snapshot.selection.focus, move), axis: move.axis },
  }
}
