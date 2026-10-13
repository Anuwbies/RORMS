import type { Range } from 'xlsx'

type BorderSide = 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft'

export interface BorderedCell {
  range: Range
  borders: Partial<Record<BorderSide, string | number>>
}

// Connected explicit border segments describe a block even when its interior is blank.
export function findBorderedRegion(selection: Range, cells: Iterable<BorderedCell>): Range | null {
  const vertices = new Map<string, Set<string>>()
  const key = (row: number, column: number) => `${row}:${column}`
  const addEdge = (first: string, second: string) => {
    if (!vertices.has(first)) vertices.set(first, new Set())
    if (!vertices.has(second)) vertices.set(second, new Set())
    vertices.get(first)!.add(second)
    vertices.get(second)!.add(first)
  }
  const hasBorder = (border: string | number | undefined) => border !== undefined
    && Number.parseFloat(String(border)) > 0 && !/\b(none|hidden)\b/i.test(String(border))

  for (const { range, borders } of cells) {
    for (let column = range.s.c; column <= range.e.c; column++) {
      if (hasBorder(borders.borderTop)) addEdge(key(range.s.r, column), key(range.s.r, column + 1))
      if (hasBorder(borders.borderBottom)) addEdge(key(range.e.r + 1, column), key(range.e.r + 1, column + 1))
    }
    for (let row = range.s.r; row <= range.e.r; row++) {
      if (hasBorder(borders.borderLeft)) addEdge(key(row, range.s.c), key(row + 1, range.s.c))
      if (hasBorder(borders.borderRight)) addEdge(key(row, range.e.c + 1), key(row + 1, range.e.c + 1))
    }
  }

  const visited = new Set<string>()
  let result: Range | null = null
  let smallestArea = Number.POSITIVE_INFINITY
  const hasEdge = (r1: number, c1: number, r2: number, c2: number) => vertices.get(key(r1, c1))?.has(key(r2, c2))
  for (const start of vertices.keys()) {
    if (visited.has(start)) continue
    const pending = [start]
    visited.add(start)
    let top = Number.POSITIVE_INFINITY
    let left = Number.POSITIVE_INFINITY
    let bottom = -1
    let right = -1
    while (pending.length) {
      const vertex = pending.pop()!
      const [row, column] = vertex.split(':').map(Number)
      top = Math.min(top, row)
      bottom = Math.max(bottom, row)
      left = Math.min(left, column)
      right = Math.max(right, column)
      for (const neighbor of vertices.get(vertex)!) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        pending.push(neighbor)
      }
    }
    const area = (bottom - top) * (right - left)
    if (!area || area >= smallestArea || top > selection.s.r || left > selection.s.c || bottom <= selection.e.r || right <= selection.e.c) continue
    let closed = true
    for (let column = left; column < right && closed; column++) {
      closed = Boolean(hasEdge(top, column, top, column + 1) && hasEdge(bottom, column, bottom, column + 1))
    }
    for (let row = top; row < bottom && closed; row++) {
      closed = Boolean(hasEdge(row, left, row + 1, left) && hasEdge(row, right, row + 1, right))
    }
    if (closed) {
      result = { s: { r: top, c: left }, e: { r: bottom - 1, c: right - 1 } }
      smallestArea = area
    }
  }
  return result
}

export function expandSelectionForMerges(selection: Range, merges: readonly Range[]): Range {
  const expanded = { s: { ...selection.s }, e: { ...selection.e } }
  let changed: boolean
  do {
    changed = false
    for (const merge of merges) {
      if (merge.s.r > expanded.e.r || merge.e.r < expanded.s.r || merge.s.c > expanded.e.c || merge.e.c < expanded.s.c) continue
      const firstRow = Math.min(expanded.s.r, merge.s.r)
      const firstColumn = Math.min(expanded.s.c, merge.s.c)
      const lastRow = Math.max(expanded.e.r, merge.e.r)
      const lastColumn = Math.max(expanded.e.c, merge.e.c)
      if (firstRow === expanded.s.r && firstColumn === expanded.s.c && lastRow === expanded.e.r && lastColumn === expanded.e.c) continue
      expanded.s = { r: firstRow, c: firstColumn }
      expanded.e = { r: lastRow, c: lastColumn }
      changed = true
    }
  } while (changed)
  return expanded
}
