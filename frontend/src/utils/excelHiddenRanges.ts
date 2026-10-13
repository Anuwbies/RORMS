export interface HiddenAxisRange { start: number; end: number }
export interface AxisVisibilityIndicator extends HiddenAxisRange {
  anchor: number
  direction: -1 | 1
  hidden: boolean
}
export interface SheetHiddenRanges { row: readonly HiddenAxisRange[]; column: readonly HiddenAxisRange[] }

export function shownAxisRanges(lastIndex: number, metadata: readonly ({ hidden?: boolean } | undefined)[] | undefined, remembered: readonly HiddenAxisRange[]): HiddenAxisRange[] {
  return remembered.filter(range => {
    if (range.start < 0 || range.end > lastIndex || range.end < range.start) return false
    for (let index = range.start; index <= range.end; index++) if (metadata?.[index]?.hidden) return false
    return true
  })
}

export function rememberHiddenRange(ranges: readonly HiddenAxisRange[], next: HiddenAxisRange): HiddenAxisRange[] {
  const remembered = { start: next.start, end: next.end }
  const remaining: HiddenAxisRange[] = []
  for (const range of ranges) {
    if (range.end < remembered.start || range.start > remembered.end) remaining.push(range)
    else {
      remembered.start = Math.min(remembered.start, range.start)
      remembered.end = Math.max(remembered.end, range.end)
    }
  }
  return [...remaining, remembered].sort((first, second) => first.start - second.start)
}

export function axisVisibilityIndicators(lastIndex: number, visible: readonly number[], metadata: readonly ({ hidden?: boolean } | undefined)[] | undefined, remembered: readonly HiddenAxisRange[]): Map<number, AxisVisibilityIndicator[]> {
  const indicators = new Map<number, AxisVisibilityIndicator[]>()
  const visibleSet = new Set(visible)
  const add = (range: HiddenAxisRange, hidden: boolean, edge?: 'first' | 'last') => {
    const after = visibleSet.has(range.end + 1)
    const before = visibleSet.has(range.start - 1)
    const anchor = edge === 'first' ? range.start : edge === 'last' ? range.end : after ? range.end + 1 : before ? range.start - 1 : -1
    if (!visibleSet.has(anchor)) return
    const indicator: AxisVisibilityIndicator = { ...range, anchor, direction: edge === 'first' || (!edge && after) ? -1 : 1, hidden }
    indicators.set(anchor, [...(indicators.get(anchor) ?? []), indicator])
  }
  for (let index = 0; index <= lastIndex; index++) {
    if (!metadata?.[index]?.hidden) continue
    const start = index
    while (index < lastIndex && metadata?.[index + 1]?.hidden) index++
    add({ start, end: index }, true)
  }
  for (const range of shownAxisRanges(lastIndex, metadata, remembered)) {
    add(range, false, 'first')
    if (range.start !== range.end) add(range, false, 'last')
  }
  return indicators
}
