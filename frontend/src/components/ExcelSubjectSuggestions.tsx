import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'

interface ExcelSubjectSuggestionsProps {
  id: string
  anchor: RefObject<HTMLElement | null>
  courses: readonly DepartmentCourseSuggestion[]
  activeIndex: number
  onSelect: (code: string) => void
  label?: string
}

interface PopupPosition {
  left: number
  top?: number
  bottom?: number
  width: number
  maxHeight: number
}

export function ExcelSubjectSuggestions({ id, anchor, courses, activeIndex, onSelect, label = 'Department courses' }: ExcelSubjectSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopupPosition>({ left: 0, top: 0, width: 260, maxHeight: 220 })
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16)
      const below = window.innerHeight - rect.bottom - 12
      const above = rect.top - 12
      const list = listRef.current
      const height = Math.min(220, list ? list.scrollHeight + list.offsetHeight - list.clientHeight : 44)
      const useAbove = below < height && above > below
      const maxHeight = Math.max(44, Math.min(220, useAbove ? above : below))
      const next: PopupPosition = {
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        ...(useAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        width, maxHeight,
      }
      setPosition(current => current.left === next.left && current.top === next.top && current.bottom === next.bottom
        && current.width === next.width && current.maxHeight === next.maxHeight ? current : next)
    }
    place()
    const observer = new ResizeObserver(place)
    if (listRef.current) observer.observe(listRef.current)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchor, courses.length])
  useLayoutEffect(() => {
    const list = listRef.current
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
  }, [activeIndex, courses])
  return createPortal(<div id={id} ref={listRef} role="listbox" aria-label={label} data-excel-subject-suggestions
    onPointerDown={event => { event.preventDefault(); event.stopPropagation() }} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}
    className="fixed z-[350] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-xl custom-scrollbar" style={position}>
    {!courses.length
      ? <p role="status" className="px-3 py-2 text-slate-500">No matching subjects.</p>
      : courses.map((course, index) => <button key={course.sourceCell} id={`${id}-${index}`} type="button" role="option" aria-selected={index === activeIndex} tabIndex={-1}
        onClick={event => { event.stopPropagation(); onSelect(course.code) }}
        className={`block w-full rounded-lg px-2 py-1 text-left ${course.matchesRoomSlot
          ? index === activeIndex ? 'bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-500' : 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-300 hover:bg-emerald-100'
          : index === activeIndex ? label === 'Faculty schedules' ? 'bg-slate-100 text-slate-900' : 'bg-[#e3edda] text-[#41572a]' : 'hover:bg-[#f3f7ee]'}`}>
        <span className="block truncate font-semibold" title={`${course.code}: ${course.title}`}>{course.code}: {course.title}</span>
        {course.schedules?.map(schedule => <span key={schedule} className="block truncate text-xs text-slate-500" title={schedule}>{schedule}</span>)}
      </button>)}
  </div>, document.body)
}
