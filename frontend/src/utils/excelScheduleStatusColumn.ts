import * as XLSX from 'xlsx'
import type { CSSProperties } from 'react'
import { moveCellMap, moveIndexMap, moveRange, moveSheet, moveFormatting } from './excelGridEdits.ts'
import { readSheetPreviewFormatting } from './excelPreviewStyles.ts'
import { scheduleStatusStyle, type ScheduleSetup } from './excelScheduleTemplate.ts'
import type { WorkbookEditSnapshot } from './excelWorkbookState'

export function rangeIncludesScheduleStatus(range: XLSX.Range, column?: number): boolean {
  return column !== undefined && range.s.c <= column && range.e.c >= column
}

/** Highlight the schedule row while keeping Status as the actual editing selection. */
export function scheduleStatusSelectionHighlight(setup: ScheduleSetup | undefined, range: XLSX.Range): XLSX.Range {
  if (setup?.statusColumn === undefined || range.s.c !== setup.statusColumn || range.e.c !== setup.statusColumn || range.s.r <= setup.header.e.r) return range
  return {
    s: { r: range.s.r, c: Math.min(setup.header.s.c, setup.statusColumn) },
    e: { r: range.e.r, c: Math.max(setup.header.e.c, setup.statusColumn) },
  }
}

export function scheduleStatusText(setup: ScheduleSetup, row: number, read: (row: number, column: number) => string): string {
  if (row >= setup.header.s.r && row <= setup.header.e.r) return row === setup.header.s.r ? 'Status' : ''
  return row > setup.header.e.r && setup.years.has(row) && setup.columns.slice(1).some(column => read(row, column).trim()) ? setup.rowStatuses?.get(row) ?? 'Draft' : ''
}

export function selectionHasScheduleStatusText(setup: ScheduleSetup | undefined, range: XLSX.Range, read: (row: number, column: number) => string): boolean {
  if (!setup || !rangeIncludesScheduleStatus(range, setup.statusColumn)) return false
  if (range.s.r <= setup.header.s.r && range.e.r >= setup.header.s.r) return true
  for (const row of setup.years.keys()) {
    if (row >= range.s.r && row <= range.e.r && scheduleStatusText(setup, row, read)) return true
  }
  return false
}

/** Upgrade the old display-only column once, preserving all cells and edits to its right. */
export function ensureScheduleStatusColumns(snapshot: WorkbookEditSnapshot): WorkbookEditSnapshot {
  let result = snapshot
  for (const [name, setup] of snapshot.scheduleSetups) {
    if (setup.statusColumn !== undefined || !snapshot.workbook.Sheets[name]) continue
    const column = setup.header.e.c + 1
    if (column >= 16384) throw new Error('There is no remaining Excel column for Status.')
    const edit = { axis: 'column' as const, start: column, count: 1, remove: false }
    const source = result.workbook.Sheets[name]
    const sourceMerges = result.mergeOverrides.get(name) ?? source['!merges'] ?? []
    const formatting = result.formattingOverrides.get(name) ?? readSheetPreviewFormatting(result.previewStyles, name)
    const sourceStyles = result.cellStyleOverrides.get(name)
    const styleAt = (row: number, col: number): CSSProperties => {
      const address = XLSX.utils.encode_cell({ r: row, c: col })
      const styleId = formatting.indexes.get(address) ?? formatting.rowIndexes.get(row)
        ?? formatting.columnIndexes.find(value => col >= value.first && col <= value.last)?.styleId ?? 0
      const style: CSSProperties = { ...result.previewStyles?.cellStyles[styleId] }
      const cell = source[address] as XLSX.CellObject | undefined
      const editedText = result.cellTextOverrides.get(name)?.get(address)
      const text = editedText ?? String(cell?.w ?? cell?.v ?? '')
      for (const rule of formatting.conditionalRules) {
        if (!rule.ranges.some(range => row >= range.s.r && row <= range.e.r && col >= range.s.c && col <= range.e.c)) continue
        const matches = rule.type === 'notContainsBlanks' ? text.trim() !== ''
          : rule.type === 'cellIs' && rule.operator === 'lessThan' && text.trim() !== '' && Number.isFinite(Number(editedText ?? cell?.v)) && Number(editedText ?? cell?.v) < rule.threshold
        if (matches) Object.assign(style, rule.style)
      }
      return { ...style, ...sourceStyles?.get(address) }
    }
    const copiedStyle = (row: number): CSSProperties => {
      const left = column - 1
      const merge = sourceMerges.find(value => row >= value.s.r && row <= value.e.r && left >= value.s.c && left <= value.e.c)
      const anchor = merge?.s ?? { r: row, c: left }
      const style = styleAt(anchor.r, anchor.c)
      const range = merge ?? { s: anchor, e: anchor }
      return {
        backgroundColor: style.backgroundColor ?? '#ffffff',
        fontFamily: style.fontFamily ?? 'Arial', fontSize: style.fontSize ?? '11pt',
        fontWeight: style.fontWeight ?? 'normal', fontStyle: style.fontStyle ?? 'normal',
        textDecoration: style.textDecoration ?? 'none', color: style.color ?? '#000000',
        borderTop: styleAt(range.s.r, left).borderTop ?? style.borderTop ?? '1px solid #d4d4d4',
        borderBottom: styleAt(range.e.r, left).borderBottom ?? style.borderBottom ?? '1px solid #d4d4d4',
        borderLeft: styleAt(row, range.s.c).borderLeft ?? style.borderLeft ?? '1px solid #d4d4d4',
        borderRight: styleAt(row, range.e.c).borderRight ?? style.borderRight ?? '1px solid #d4d4d4',
      }
    }
    const merges = sourceMerges.flatMap(merge => {
      // Status has its own cell, even when an imported merge extends past the schedule.
      if (merge.s.c < column && merge.e.c >= column) return [
        { s: { ...merge.s }, e: { ...merge.e, c: column - 1 } },
        { s: { ...merge.s, c: column + 1 }, e: { ...merge.e, c: merge.e.c + 1 } },
      ].filter(value => value.s.r !== value.e.r || value.s.c !== value.e.c)
      const moved = moveRange(merge, edit)
      return moved ? [moved] : []
    })
    merges.push({ s: { r: setup.header.s.r, c: column }, e: { r: setup.header.e.r, c: column } })
    const sheet = moveSheet(source, edit, merges)
    sheet[XLSX.utils.encode_cell({ r: setup.header.s.r, c: column })] = { t: 's', v: 'Status' }
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
    range.e.c = Math.max(range.e.c, column)
    range.e.r = Math.max(range.e.r, setup.header.e.r)
    sheet['!ref'] = XLSX.utils.encode_range(range)
    sheet['!cols'] = [...(sheet['!cols'] ?? [])]
    sheet['!cols'][column] = { wpx: 96, width: 13 }
    const texts = moveCellMap(result.cellTextOverrides.get(name) ?? new Map(), edit)
    const styles = moveCellMap(result.cellStyleOverrides.get(name) ?? new Map(), edit)
    const nextSetup = { ...setup, statusColumn: column }
    delete nextSetup.statusStyles
    for (let row = 0; row <= range.e.r + (result.addedRowsBySheet.get(name) ?? 0) + 5; row++) {
      styles.set(XLSX.utils.encode_cell({ r: row, c: column }), { ...scheduleStatusStyle(setup, row), ...copiedStyle(row), ...setup.statusStyles?.get(row) })
    }
    for (const [row, style] of setup.statusStyles ?? []) styles.set(XLSX.utils.encode_cell({ r: row, c: column }), { ...scheduleStatusStyle(setup, row), ...copiedStyle(row), ...style })
    const widths = moveIndexMap(result.columnWidthOverrides.get(name) ?? new Map(), edit)
    widths.set(column, 96)
    const hidden = result.hiddenRangeToggles.get(name)
    const hiddenRangeToggles = new Map(result.hiddenRangeToggles)
    if (hidden) hiddenRangeToggles.set(name, { ...hidden, column: hidden.column.map(value => ({ start: value.start >= column ? value.start + 1 : value.start, end: value.end >= column ? value.end + 1 : value.end })) })
    let selection = result.selection
    if (result.selectedSheet === name) selection = {
      anchor: { ...selection.anchor, c: selection.anchorStatus ? column : selection.anchor.c >= column ? selection.anchor.c + 1 : selection.anchor.c },
      focus: { ...selection.focus, c: selection.focusStatus ? column : selection.focus.c >= column ? selection.focus.c + 1 : selection.focus.c },
      ...(selection.axis ? { axis: selection.axis } : {}),
    }
    result = { ...result, workbook: { ...result.workbook, Sheets: { ...result.workbook.Sheets, [name]: sheet } },
      cellTextOverrides: new Map(result.cellTextOverrides).set(name, texts), cellStyleOverrides: new Map(result.cellStyleOverrides).set(name, styles),
      columnWidthOverrides: new Map(result.columnWidthOverrides).set(name, widths), mergeOverrides: new Map(result.mergeOverrides).set(name, merges),
      formattingOverrides: new Map(result.formattingOverrides).set(name, moveFormatting(formatting, edit)),
      scheduleSetups: new Map(result.scheduleSetups).set(name, nextSetup), hiddenRangeToggles, selection }
  }
  return result
}

/** Save/export the computed text as real XLSX cell values, without changing the live editor. */
export function materializeScheduleStatuses(snapshot: WorkbookEditSnapshot): WorkbookEditSnapshot {
  let overrides = snapshot.cellTextOverrides
  for (const [name, setup] of snapshot.scheduleSetups) {
    if (setup.statusColumn === undefined) continue
    const sheet = snapshot.workbook.Sheets[name]
    if (!sheet) continue
    const texts = new Map(overrides.get(name))
    const read = (row: number, column: number) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const cell = sheet[address] as XLSX.CellObject | undefined
      return texts.get(address) ?? (cell ? String(cell.w ?? (cell.v !== undefined ? XLSX.utils.format_cell(cell) : cell.f ? `=${cell.f}` : '')) : '')
    }
    let lastRow = Math.max(setup.header.e.r, XLSX.utils.decode_range(sheet['!ref'] ?? 'A1').e.r)
    for (const row of setup.years.keys()) lastRow = Math.max(lastRow, row)
    for (const address of texts.keys()) lastRow = Math.max(lastRow, XLSX.utils.decode_cell(address).r)
    for (let row = setup.header.s.r; row <= lastRow; row++) texts.set(XLSX.utils.encode_cell({ r: row, c: setup.statusColumn }), scheduleStatusText(setup, row, read))
    overrides = new Map(overrides).set(name, texts)
  }
  return overrides === snapshot.cellTextOverrides ? snapshot : { ...snapshot, cellTextOverrides: overrides }
}
