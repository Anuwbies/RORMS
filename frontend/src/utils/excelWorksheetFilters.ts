import type { Range } from 'xlsx'

export interface WorksheetFilter {
  header: Range
  lastRow: number
  values: ReadonlyMap<number, ReadonlySet<string>>
}

export type WorksheetFilterReader = (row: number, column: number) => string

// Merged body cells have one value shared by all of their displayed rows.
export function worksheetFilterReader(read: WorksheetFilterReader, merges: readonly Range[]): WorksheetFilterReader {
  return (row, column) => {
    const merge = merges.find(range => row >= range.s.r && row <= range.e.r && column >= range.s.c && column <= range.e.c)
    return read(merge?.s.r ?? row, merge?.s.c ?? column).trim()
  }
}

export function filterWorksheetRows(rows: readonly number[], filter: WorksheetFilter | undefined, read: WorksheetFilterReader): number[] {
  if (!filter?.values.size) return [...rows]
  return rows.filter(row => row <= filter.header.e.r || row > filter.lastRow
    || [...filter.values].every(([column, selected]) => selected.has(read(row, column))))
}

export function worksheetFilterOptions(rows: readonly number[], filter: WorksheetFilter, column: number, read: WorksheetFilterReader): string[] {
  return [...new Set(rows.filter(row => row > filter.header.e.r && row <= filter.lastRow).map(row => read(row, column)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

export function worksheetFilterLabel(filter: WorksheetFilter, column: number, read: WorksheetFilterReader, fallback: string): string {
  const parts = new Set<string>()
  for (let row = filter.header.s.r; row <= filter.header.e.r; row++) {
    const text = read(row, column)
    if (text) parts.add(text)
  }
  return [...parts].join(' · ') || fallback
}
