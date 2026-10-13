import { utils, type Range } from 'xlsx'
import type { WorkbookSelection } from './excelWorkbookState'

export const SCHEDULE_STATUS_COLUMN_WIDTH = 96

// A half-step represents the virtual column between two physical XLSX columns.
export function worksheetSelectionColumns(selection: WorkbookSelection, statusAfter?: number) {
  const anchor = selection.anchorStatus && statusAfter !== undefined ? statusAfter + 0.5 : selection.anchor.c
  const focus = selection.focusStatus && statusAfter !== undefined ? statusAfter + 0.5 : selection.focus.c
  const first = Math.min(anchor, focus)
  const last = Math.max(anchor, focus)
  return {
    first: Math.ceil(first), last: Math.floor(last),
    includesStatus: statusAfter !== undefined && first <= statusAfter + 0.5 && last >= statusAfter + 0.5,
  }
}

// Null is a display-only column; worksheet coordinates remain unchanged.
export function worksheetDisplayColumns(columns: readonly number[], statusAfter?: number): (number | null)[] {
  if (statusAfter === undefined) return [...columns]
  const firstRight = columns.findIndex(column => column > statusAfter)
  const index = firstRight === -1 ? columns.length : firstRight
  return [...columns.slice(0, index), null, ...columns.slice(index)]
}

export interface DisplayMerge {
  anchor: string
  firstRow: number
  firstColumn: number
  rowSpan: number
  columnSpan: number
  source: Range
  continuation: boolean
}

// Render a crossing merge on either side of Status without changing its saved range.
export function worksheetDisplayMerges(rows: readonly number[], columns: readonly number[], merges: readonly Range[], statusAfter?: number): Map<string, DisplayMerge> {
  const cells = new Map<string, DisplayMerge>()
  for (const source of merges) {
    const mergedRows = rows.filter(row => row >= source.s.r && row <= source.e.r)
    const mergedColumns = columns.filter(column => column >= source.s.c && column <= source.e.c)
    if (!mergedRows.length || !mergedColumns.length) continue
    const groups = statusAfter === undefined ? [mergedColumns]
      : [mergedColumns.filter(column => column <= statusAfter), mergedColumns.filter(column => column > statusAfter)].filter(group => group.length)
    groups.forEach((group, index) => {
      const merge: DisplayMerge = {
        anchor: utils.encode_cell(source.s), firstRow: mergedRows[0], firstColumn: group[0],
        rowSpan: mergedRows.length, columnSpan: group.length, source, continuation: index > 0,
      }
      for (const row of mergedRows) for (const column of group) cells.set(utils.encode_cell({ r: row, c: column }), merge)
    })
  }
  return cells
}
