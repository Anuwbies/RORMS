import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface ExcelFacultySuggestionsProps {
  id: string
  anchor: RefObject<HTMLElement | null>
  names: readonly string[]
  recommendedNames?: readonly string[]
  loading: boolean
  error?: string
  activeIndex: number
  onSelect: (name: string) => void
  label?: string
  noun?: string
  emptyMessage?: string
  statusMessage?: string
  minWidth?: number
  matchAnchorWidth?: boolean
  expandToFit?: boolean
  portalTarget?: Element | null
}

interface PopupPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

export function ExcelFacultySuggestions({ id, anchor, names, recommendedNames = [], loading, error, activeIndex, onSelect, label = 'Department instructors', noun = 'instructors', emptyMessage, statusMessage, minWidth = 260, matchAnchorWidth = false, expandToFit = false, portalTarget }: ExcelFacultySuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopupPosition>({ left: 0, top: 0, width: minWidth, maxHeight: 220 })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const list = listRef.current
      const viewportWidth = Math.max(0, window.innerWidth - 16)
      const width = Math.min(matchAnchorWidth ? rect.width : Math.max(rect.width, minWidth), viewportWidth)
      const popupWidth = expandToFit && list ? Math.min(Math.max(width, list.getBoundingClientRect().width), viewportWidth) : width
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const height = Math.min(220, list ? list.scrollHeight + list.offsetHeight - list.clientHeight : 44)
      const useAbove = below < height && above > below
      const maxHeight = Math.max(44, Math.min(220, useAbove ? above : below))
      const next: PopupPosition = {
        left: matchAnchorWidth && !expandToFit ? rect.left : Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8)),
        ...(useAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        width,
        maxHeight,
      }
      setPosition(current => current.left === next.left && current.top === next.top && current.bottom === next.bottom && current.width === next.width && current.maxHeight === next.maxHeight ? current : next)
    }
    place()
    const observer = new ResizeObserver(place)
    if (listRef.current) observer.observe(listRef.current)
    if (anchor.current) observer.observe(anchor.current)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchor, names.length, loading, error, minWidth, matchAnchorWidth, expandToFit])
  useLayoutEffect(() => {
    const list = listRef.current
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
  }, [activeIndex, names])
  return createPortal(<div id={id} ref={listRef} role="listbox" aria-label={label} data-excel-faculty-suggestions
    onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}
    className={`fixed z-[350] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-xl custom-scrollbar ${expandToFit ? 'max-w-[calc(100vw-16px)]' : ''}`}
    style={expandToFit ? { ...position, width: 'max-content', minWidth: position.width } : position}>
    {!loading && !error && names.length > 0 && statusMessage && <p role="status" className="px-3 py-2 text-slate-500">{statusMessage}</p>}
    {loading || error || !names.length
      ? <p role="status" className="px-3 py-2 text-slate-500">{loading ? `Loading ${noun}…` : error || emptyMessage || `No matching ${noun}.`}</p>
      : names.map((name, index) => <button key={name} id={`${id}-${index}`} type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1}
        onClick={event => { event.stopPropagation(); onSelect(name) }}
        className={`block w-full rounded-lg px-3 py-2 text-left ${matchAnchorWidth ? 'break-words' : ''} ${index === activeIndex ? 'bg-[#e3edda] text-[#41572a]' : 'hover:bg-[#f3f7ee]'}`}>{name}{recommendedNames.includes(name) && <span className="block text-xs font-medium text-[#41572a]">Recommended</span>}</button>)}
  </div>, portalTarget ?? document.body)
}
