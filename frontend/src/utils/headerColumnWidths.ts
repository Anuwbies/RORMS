export interface HeaderWidthConstraint {
  start: number
  count: number
  minimum: number
}

export function headerResizeScrollStep(pointerX: number, left: number, right: number): number {
  const edge = Math.min(40, (right - left) / 2)
  if (pointerX < left + edge) return -12 * Math.min(1, (left + edge - pointerX) / edge)
  if (pointerX > right - edge) return 12 * Math.min(1, (pointerX - right + edge) / edge)
  return 0
}

/** Smallest width that fits whole words within at most two lines. */
export function headerTextMinimumWidth(text: string, measure: (value: string) => number): number {
  const words = text.trim().split(/\s+/)
  if (words.length === 1) return Math.ceil(measure(words[0]))
  let minimum = Infinity
  for (let split = 1; split < words.length; split++) {
    minimum = Math.min(minimum, Math.max(measure(words.slice(0, split).join(' ')), measure(words.slice(split).join(' '))))
  }
  return Math.ceil(minimum)
}

export function rowNumberMinimumWidth(rowCount: number, measure: (value: string) => number): number {
  let minimum = measure('1')
  for (let row = 2; row <= rowCount; row++) minimum = Math.max(minimum, measure(String(row)))
  return Math.ceil(minimum)
}

export function defaultRowCounterWidth(widths: readonly number[], minimum: number): number[] {
  const next = [...widths]
  const freed = Math.max(0, (next[0] ?? minimum) - minimum)
  const otherTotal = next.slice(1).reduce((sum, width) => sum + width, 0)
  next[0] = minimum
  // Let the other default columns fill the space instead of leaving a right-side gap.
  if (freed && otherTotal) for (let index = 1; index < next.length; index++) {
    next[index] += freed * next[index] / otherTotal
  }
  return next
}

export function resizeHeaderColumns(widths: readonly number[], constraints: readonly HeaderWidthConstraint[], start: number, count: number, delta: number): number[] {
  const next = widths.map((width, index) => index >= start && index < start + count ? Math.max(0, width + delta / count) : width)
  // Apply leaf limits first, then keep grouped headers within two lines as well.
  for (const constraint of [...constraints].sort((a, b) => a.count - b.count)) {
    const first = Math.max(start, constraint.start)
    const last = Math.min(start + count, constraint.start + constraint.count)
    if (first >= last) continue
    const total = next.slice(constraint.start, constraint.start + constraint.count).reduce((sum, width) => sum + width, 0)
    if (total >= constraint.minimum) continue
    const extra = (constraint.minimum - total) / (last - first)
    for (let index = first; index < last; index++) next[index] += extra
  }
  return next
}
