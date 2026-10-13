import type { AxisMove } from './excelAxisMoves'

export interface AxisDragPoint { x: number; y: number }
export interface AxisHeaderPosition { index: number; start: number; end: number }

export function axisDragOffset(axis: AxisMove['axis'], start: AxisDragPoint, current: AxisDragPoint): AxisDragPoint {
  return axis === 'row' ? { x: 0, y: current.y - start.y } : { x: current.x - start.x, y: 0 }
}

export function axisDragTarget(headers: readonly AxisHeaderPosition[], position: number): { index: number; after: boolean } | null {
  let first = 0, last = headers.length - 1
  while (first <= last) {
    const middle = Math.floor((first + last) / 2), header = headers[middle]
    if (position < header.start) last = middle - 1
    else if (position > header.end) first = middle + 1
    else return { index: header.index, after: position >= (header.start + header.end) / 2 }
  }
  return null
}

export function axisDragScrollSpeed(position: number, start: number, end: number): number {
  const edge = Math.min(32, (end - start) / 4)
  if (position < start + edge) return -Math.min(16, Math.max(0, Math.ceil((start + edge - position) / 2)))
  if (position > end - edge) return Math.min(16, Math.max(0, Math.ceil((position - end + edge) / 2)))
  return 0
}

/** A translucent selection-sized block that never participates in sheet layout or scrolling. */
export function createAxisDragPreview(axis: AxisMove['axis'], scroller: HTMLElement, worksheet: HTMLElement, selectedHeaders: readonly HTMLElement[], scale: AxisDragPoint): {
  layer: HTMLDivElement; move: (offset: AxisDragPoint) => void
  highlightTarget: (target: { start: number; end: number; after: boolean; error: boolean } | null) => void
} {
  const viewport = scroller.getBoundingClientRect()
  const first = selectedHeaders[0].getBoundingClientRect(), last = selectedHeaders.at(-1)!.getBoundingClientRect()
  const layer = document.createElement('div')
  layer.className = 'pointer-events-none fixed z-[210] overflow-hidden'
  layer.setAttribute('aria-hidden', 'true')
  layer.inert = true
  Object.assign(layer.style, { left: `${viewport.left}px`, top: `${viewport.top}px`, width: `${scroller.clientWidth * scale.x}px` })
  // The add-rows controls share the scroller but sit below the worksheet.
  const syncClip = () => {
    const bottom = worksheet.getBoundingClientRect().bottom
    const top = scroller.getBoundingClientRect().top
    layer.style.height = `${Math.max(0, Math.min(scroller.clientHeight * scale.y, bottom - top))}px`
  }
  syncClip()
  const preview = document.createElement('div')
  preview.className = 'absolute overflow-hidden bg-[#62853e]/20 shadow-lg'
  const left = axis === 'row' ? 0 : first.left - viewport.left
  const top = axis === 'row' ? first.top - viewport.top : 0
  Object.assign(preview.style, {
    left: `${left}px`, top: `${top}px`,
    width: `${axis === 'row' ? scroller.clientWidth * scale.x : last.right - first.left}px`,
    height: `${axis === 'row' ? last.bottom - first.top : scroller.clientHeight * scale.y}px`,
  })
  layer.append(preview)
  const destination = document.createElement('div')
  destination.style.display = 'none'
  layer.append(destination)
  document.body.append(layer)
  return {
    layer,
    move: offset => { syncClip(); preview.style.translate = `${offset.x}px ${offset.y}px` },
    highlightTarget: target => {
      syncClip()
      destination.style.display = target ? 'block' : 'none'
      if (!target) return
      const edge = axis === 'row' ? target.after ? 'border-b-2' : 'border-t-2' : target.after ? 'border-r-2' : 'border-l-2'
      destination.className = `absolute ${edge} ${target.error ? 'border-rose-500' : 'border-[#62853e]'}`
      Object.assign(destination.style, {
        left: `${axis === 'row' ? 0 : target.start}px`, top: `${axis === 'row' ? target.start : 0}px`,
        width: `${axis === 'row' ? scroller.clientWidth * scale.x : target.end - target.start}px`,
        height: `${axis === 'row' ? target.end - target.start : scroller.clientHeight * scale.y}px`,
      })
    },
  }
}
