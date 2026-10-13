import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SCHEDULE_YEARS, SCHEDULE_YEAR_LABELS, type ScheduleRecord, type ScheduleSetup, type ScheduleYear } from '../utils/excelScheduleTemplate'
import { ExcelScheduleRowsPreview, type SchedulePreviewAppearance } from './ExcelScheduleRowsPreview'

interface ExcelScheduleSetupPanelProps {
  anchor: HTMLElement | null
  sheetName: string
  selectedAddress: string
  headerAddress?: string
  setup?: ScheduleSetup
  headerError: string | null
  currentHeaderError: string | null
  insertError: string | null
  records: ScheduleRecord[]
  configuredRecords: ScheduleRecord[]
  previewAppearance: SchedulePreviewAppearance
  hasSelectedYears: boolean
  yearCounts: Record<ScheduleYear, number>
  notice: string
  onRegister: () => void
  onInsert: () => void
  onAssignYear: (year: ScheduleYear | null) => void
  onClear: () => void
  onClose: () => void
}

const menuItemClass = 'flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-[#e3edda] focus-visible:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent'

function ScheduleHeaderIcon({ insert = false }: { insert?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]">
    <path d="M3 4h18v16H3zM3 9h18M9 9v11M15 9v11" />
    <path d="M3 4h18v5H3z" fill="currentColor" fillOpacity=".15" />
    {insert && <path d="M12 12v6M9 15h6" strokeWidth="2" />}
  </svg>
}

function ScheduleYearIcon({ year }: { year: ScheduleYear }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]">
    <path d="M4 4h16v17H4zM4 9h16M8 2v4M16 2v4" strokeLinejoin="round" />
    <text x="12" y="18" textAnchor="middle" fontSize="10" fontWeight="600" fill="currentColor" stroke="none">{year}</text>
  </svg>
}

export function ExcelScheduleSetupPanel({ anchor, sheetName, selectedAddress, headerAddress, setup, headerError, currentHeaderError, insertError, records, configuredRecords, previewAppearance, hasSelectedYears, yearCounts, notice, onRegister, onInsert, onAssignYear, onClear, onClose }: ExcelScheduleSetupPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewGroup, setPreviewGroup] = useState<ScheduleYear>(1)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    const previousFocus = document.activeElement
    return () => {
      const target = anchor?.isConnected ? anchor : previousFocus
      if (target instanceof HTMLElement && target.isConnected) target.focus()
    }
  }, [anchor])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    if (isPreviewOpen) return
    const place = () => {
      const rect = anchor?.getBoundingClientRect()
      const bounds = panel.getBoundingClientRect()
      if (!rect) return
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8)),
        top: rect.bottom + 4 + bounds.height <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - bounds.height - 4),
      })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [anchor, isPreviewOpen])

  useEffect(() => {
    if (isPreviewOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node) || anchor?.contains(event.target as Node)) return
      onClose()
    }
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [anchor, isPreviewOpen, onClose])

  const canPreview = Boolean(setup && !currentHeaderError)
  const canAssign = canPreview && records.length > 0
  const groupRecords = useMemo(() => configuredRecords.filter(record => record.year === previewGroup), [configuredRecords, previewGroup])
  const previewGroups = SCHEDULE_YEARS
  const status = notice || (currentHeaderError ? 'Restore or register the fixed header template first.' : !setup && headerError && insertError ? headerError : setup && !records.length ? 'Select rows below the header to assign a year. The eye icon shows all configured groups.' : '')

  if (isPreviewOpen) return createPortal(
    <div className="fixed inset-0 z-[270] flex items-center justify-center bg-black/30 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panelRef} data-schedule-setup-dialog role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-[90dvh] max-h-[calc(100dvh-2rem)] w-[95vw] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); onClose(); return }
        if (event.key !== 'Tab') return
        event.stopPropagation()
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? []).filter(element => element.tabIndex >= 0)
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }}>
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h3 id={titleId} className="sr-only">Configured schedule rows</h3>
          <div role="tablist" aria-label="Configured row groups" className="flex min-w-0 flex-wrap gap-2">
            {previewGroups.map(group => <button key={group} type="button" role="tab" id={`${titleId}-tab-${group}`} aria-controls={`${titleId}-rows`} aria-selected={previewGroup === group} tabIndex={previewGroup === group ? 0 : -1} onClick={() => setPreviewGroup(group)} onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              event.stopPropagation()
              const index = previewGroups.indexOf(group)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? previewGroups.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + previewGroups.length) % previewGroups.length
              setPreviewGroup(previewGroups[next])
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
            }} className={`rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#62853e] ${previewGroup === group ? 'bg-[#e3edda] text-[#41572a]' : 'text-slate-600 hover:bg-slate-50'}`}>
              {`${SCHEDULE_YEAR_LABELS[group]} · ${yearCounts[group]} rows`}
            </button>)}
          </div>
          <button type="button" onClick={onClose} aria-label="Close configured schedule rows" className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#62853e]">Close</button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div id={`${titleId}-rows`} role="tabpanel" aria-labelledby={`${titleId}-tab-${previewGroup}`} className="flex min-h-0 flex-1 flex-col">
            {canPreview && setup ? <>
              <ExcelScheduleRowsPreview setup={setup} records={groupRecords} appearance={previewAppearance} />
              {!groupRecords.length && <p role="status" className="mt-2 text-sm text-slate-600">No rows assigned to {SCHEDULE_YEAR_LABELS[previewGroup]} yet.</p>}
            </> : <p role="status" className="text-sm text-slate-600">Register a valid schedule header to view configured rows.</p>}
          </div>
        </div>
      </div>
    </div>, document.body,
  )

  return createPortal(
    <div ref={panelRef} data-schedule-setup-dialog role="menu" aria-label="Schedule setup" tabIndex={-1} className="fixed z-[260] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-xl" style={position} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault()
        event.stopPropagation()
        onClose()
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>
      <span className="sr-only">{sheetName}, selected {selectedAddress}{headerAddress ? `, header ${headerAddress}` : ''}</span>
      <div className="flex">
        <div role="group" aria-label="Header and year assignments" className="grid flex-1 grid-cols-4 gap-1">
          <button type="button" role="menuitem" aria-label="Set selected headers" title={headerError || 'Set selected headers'} disabled={Boolean(headerError)} onClick={onRegister} className={menuItemClass}><ScheduleHeaderIcon /></button>
          <button type="button" role="menuitem" aria-label="Insert header template at selection" title={insertError || 'Insert header template at selection'} disabled={Boolean(insertError)} onClick={onInsert} className={menuItemClass}><ScheduleHeaderIcon insert /></button>
          <button type="button" role="menuitem" aria-label="Clear selected year assignments" title="Clear selected year assignments" disabled={!setup || !hasSelectedYears} onClick={() => onAssignYear(null)} className={menuItemClass}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]"><path d="m4 15 9-11 8 7-9 10H9l-5-6ZM8 10l8 7M12 21h9" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" role="menuitem" aria-label="Clear sheet setup" title="Clear sheet setup" disabled={!setup} onClick={onClear} className={menuItemClass}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]"><path d="M4 10a8 8 0 1 1 0 5M4 4v6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {SCHEDULE_YEARS.map(year => <button key={year} type="button" role="menuitem" aria-label={`Assign selected rows to ${SCHEDULE_YEAR_LABELS[year]}`} title={SCHEDULE_YEAR_LABELS[year]} disabled={!canAssign} onClick={() => onAssignYear(year)} className={`${menuItemClass} ${records.length && records.every(record => record.year === year) ? 'bg-[#e3edda] text-[#41572a]' : ''}`}><ScheduleYearIcon year={year} /></button>)}
        </div>
        <div className="ml-2 flex shrink-0 flex-col border-l border-slate-200 pl-2">
          <button type="button" role="menuitem" aria-label="View configured rows" title="View year-level rows" disabled={!canPreview} onClick={() => setIsPreviewOpen(true)} className={menuItemClass}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
        </div>
      </div>
      {status && <p role="status" className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">{status}</p>}
    </div>, document.body,
  )
}
