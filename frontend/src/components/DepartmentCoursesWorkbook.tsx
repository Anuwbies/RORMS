import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { createEmptyDepartmentCourseSheet, DEPARTMENT_COURSE_HEADERS, readDepartmentCourses, type DepartmentCourseRow, type DepartmentCourseSheet } from '../utils/departmentCourseImport'
import { defaultRowCounterWidth, headerResizeScrollStep, headerTextMinimumWidth, resizeHeaderColumns, rowNumberMinimumWidth, type HeaderWidthConstraint } from '../utils/headerColumnWidths'
import { Button } from './Button'
import { DownloadIcon, UploadIcon } from './Icons'
import { DepartmentCoursesTableBody } from './DepartmentCoursesTableBody'
import { WorkbookSlot } from './WorkbookSlot'
import { useCoursesWorkbook } from './useCoursesWorkbook'
import type { DepartmentCoursesContext, DepartmentCoursesWorkbookState } from '../utils/departmentCoursesWorkbookState'
import { loadDepartmentCoursesWorkbook, saveDepartmentCoursesWorkbook, type SavedDepartmentCoursesWorkbook } from '../services/firestoreDepartmentCourses'
import type { WorkbookSaveHandle, WorkbookSaveState } from './workbookSaveTypes'

interface DepartmentCoursesWorkbookProps {
  onClose: () => void
  onSaveStateChange?: (state: WorkbookSaveState) => void
  embedded?: boolean
  active?: boolean
  headerHost?: HTMLElement | null
  footerHost?: HTMLElement | null
  menuHost?: HTMLElement | null
  onActivate?: () => void
  headerTitle?: string
  headerSubtitle?: string
  initialSheets?: DepartmentCourseSheet[]
  sourceName?: string
  department?: DepartmentCoursesContext
  readOnly?: boolean
}

const COURSE_TABLE_HEADERS = ['#', ...DEPARTMENT_COURSE_HEADERS]
const COURSE_COLUMN_CLASSES = ['w-14', 'w-44', 'w-28', 'w-32', '', 'w-52', 'w-24']
const EMPTY_COURSE_ROWS: DepartmentCourseRow[] = []

interface CoursesSaveBaseline extends DepartmentCoursesWorkbookState {
  fileName: string
  widthsReady: boolean
}

function hasDepartmentCoursesChanges(baseline: CoursesSaveBaseline, state: DepartmentCoursesWorkbookState, fileName: string): boolean {
  if (baseline.fileName !== fileName || baseline.sheets.length !== state.sheets.length) return true
  if (baseline.widthsReady && (baseline.columnWidths?.length !== state.columnWidths?.length
    || baseline.columnWidths?.some((width, index) => width !== state.columnWidths?.[index]))) return true
  return state.sheets.some((sheet, index) => {
    const saved = baseline.sheets[index]
    if (sheet === saved) return false
    return sheet.name !== saved.name || sheet.headerRow !== saved.headerRow || sheet.rows.length !== saved.rows.length
      || sheet.rows.some((row, rowIndex) => {
        const before = saved.rows[rowIndex]
        return row !== before && (row.rowNumber !== before.rowNumber || row.values.length !== before.values.length
          || row.values.some((value, column) => value !== before.values[column]))
      })
  })
}

export const DepartmentCoursesWorkbook = forwardRef<WorkbookSaveHandle, DepartmentCoursesWorkbookProps>(function DepartmentCoursesWorkbook({ onClose, onSaveStateChange, embedded = false, active = true, headerHost, footerHost, menuHost, onActivate, headerTitle, headerSubtitle, initialSheets, sourceName = 'Courses workbook', department, readOnly = false }, ref) {
  const dialogRef = useRef<HTMLElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const fileMenuId = useId()
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const constraintsRef = useRef<HeaderWidthConstraint[]>([])
  const resizeRef = useRef<{ column: number; x: number; pointerX: number; scrollLeft: number; lastDelta: number; widths: number[] } | null>(null)
  const titleId = useId()
  const workbook = useCoursesWorkbook(initialSheets, tableRef)
  const { sheets, selectedSheet, selection, actions, replaceSheets, changeSheet } = workbook
  const [columnWidths, setColumnWidths] = useState<number[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loadedName, setLoadedName] = useState(sourceName)
  const [saveBaseline, setSaveBaseline] = useState<CoursesSaveBaseline>(() => ({
    sheets: workbook.sheets, selectedSheet: workbook.selectedSheet, columnWidths: null, fileName: sourceName, widthsReady: false,
  }))
  const [loading, setLoading] = useState(Boolean(department))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const savedRef = useRef<SavedDepartmentCoursesWorkbook | null>(null)
  const [storageReady, setStorageReady] = useState(!department)
  const [storageStatus, setStorageStatus] = useState('')
  const [storageError, setStorageError] = useState('')
  const [error, setError] = useState('')
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: HTMLTableCellElement } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [clipboardText, setClipboardText] = useState<string | null>(null)
  const hasUnsavedChanges = useMemo(() => hasDepartmentCoursesChanges(saveBaseline,
    { sheets, selectedSheet, columnWidths }, loadedName), [saveBaseline, sheets, selectedSheet, columnWidths, loadedName])

  useEffect(() => {
    if (!contextMenu) return
    let cancelled = false
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }
    const dismissOnResize = () => setContextMenu(null)
    const readClipboard = async () => {
      let text = workbook.rememberedText()
      try { text = await navigator.clipboard.readText() } catch { /* Keep the internal clipboard fallback. */ }
      if (!cancelled) setClipboardText(text)
    }
    void readClipboard()
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', dismissOnResize)
    return () => {
      cancelled = true
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', dismissOnResize)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!fileMenuOpen) return
    fileMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !fileMenuRef.current?.contains(event.target)) setFileMenuOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [fileMenuOpen])

  useEffect(() => {
    if (loading || saving || !storageReady || embedded && !active) setFileMenuOpen(false)
  }, [loading, saving, storageReady, embedded, active])

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (embedded) return
    const previousOverflow = document.body.style.overflow
    ;(dialog as HTMLDialogElement | null)?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      resizeRef.current = null
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
      ;(dialog as HTMLDialogElement | null)?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [embedded])

  useEffect(() => {
    if (!department) return
    let cancelled = false
    setLoading(true)
    setStorageReady(false)
    setStorageStatus('Opening saved courses…')
    setStorageError('')
    setLoadedName(sourceName)
    setFile(null)
    savedRef.current = null
    const emptySheets = initialSheets ?? [createEmptyDepartmentCourseSheet()]
    replaceSheets(emptySheets)
    setSaveBaseline({ sheets: emptySheets, selectedSheet: 0, columnWidths: null, fileName: sourceName, widthsReady: false })
    setColumnWidths(null)
    void loadDepartmentCoursesWorkbook(department).then(loaded => {
      if (cancelled) return
      if (loaded) {
        savedRef.current = loaded.saved
        replaceSheets(loaded.state.sheets)
        changeSheet(loaded.state.selectedSheet)
        setColumnWidths(loaded.state.columnWidths)
        setLoadedName(loaded.saved.fileName)
        setSaveBaseline({ ...loaded.state, fileName: loaded.saved.fileName, widthsReady: loaded.state.columnWidths !== null })
      }
      setStorageReady(true)
      setStorageStatus('')
    }).catch(caught => {
      if (!cancelled) {
        setStorageStatus('')
        setStorageError(caught instanceof Error ? caught.message : 'The saved courses could not be opened. Reopen the workbook before saving.')
      }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [department?.departmentId, department?.departmentCode, department?.membershipId, replaceSheets, changeSheet])

  useEffect(() => {
    if (!loading && storageReady && columnWidths && !saveBaseline.widthsReady) {
      setSaveBaseline(previous => ({ ...previous, columnWidths, widthsReady: true }))
    }
  }, [loading, storageReady, columnWidths, saveBaseline.widthsReady])

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setLoading(true)
    setError('')
    setStorageStatus('')
    const load = async () => {
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('Please choose an .xlsx file.')
        const data = await file.arrayBuffer()
        if (cancelled) return
        const imported = readDepartmentCourses(XLSX.read(data, { type: 'array' }))
        if (!imported.length) throw new Error('No worksheet has the required course headers: Session, Semester, Code, Course, Type, and Credits.')
        if (cancelled) return
        replaceSheets(imported)
        setLoadedName(file.name)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'This courses workbook could not be read.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [file, replaceSheets])

  const sheet = sheets[selectedSheet]

  const saveWorkbook = async (): Promise<boolean> => {
    if (!department || readOnly || loading || savingRef.current || !storageReady || !sheets.length) return false
    const currentSheets = workbook.finishCurrentEditing()
    const currentState = { sheets: currentSheets, selectedSheet, columnWidths }
    if (!hasDepartmentCoursesChanges(saveBaseline, currentState, loadedName)) return true
    savingRef.current = true
    setSaving(true)
    setContextMenu(null)
    setStorageError('')
    setStorageStatus('Saving courses workbook…')
    try {
      const fileName = file?.name ?? (/\.xlsx$/i.test(loadedName) ? loadedName : 'Department Courses.xlsx')
      const saved = await saveDepartmentCoursesWorkbook(department, fileName, currentState, savedRef.current)
      savedRef.current = saved
      setLoadedName(saved.fileName)
      setSaveBaseline({ ...currentState, fileName: saved.fileName, widthsReady: true })
      setStorageStatus(saved.cleanupWarning ? `Courses workbook saved. ${saved.cleanupWarning}` : 'Courses workbook saved.')
      return true
    } catch (caught) {
      setStorageStatus('')
      setStorageError(caught instanceof Error ? caught.message : 'The courses workbook could not be saved. Please try again.')
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  useImperativeHandle(ref, () => ({ saveIfChanged: saveWorkbook }))

  useEffect(() => {
    onSaveStateChange?.({ dirty: hasUnsavedChanges, canSave: Boolean(department && !readOnly && !loading && !saving && storageReady && sheets.length), saving })
  }, [onSaveStateChange, hasUnsavedChanges, department, readOnly, loading, saving, storageReady, sheets.length])

  const downloadCoursesWorkbook = (templateOnly: boolean) => {
    setFileMenuOpen(false)
    setError('')
    try {
      const output = XLSX.utils.book_new()
      const sourceSheets = templateOnly
        ? [{ name: 'Courses', headerRow: 1, rows: [] as DepartmentCourseRow[] }]
        : workbook.finishCurrentEditing()
      for (const source of sourceSheets) {
        const worksheet = XLSX.utils.aoa_to_sheet([])
        XLSX.utils.sheet_add_aoa(worksheet, [[...DEPARTMENT_COURSE_HEADERS]], { origin: `A${source.headerRow}` })
        source.rows.forEach(row => {
          XLSX.utils.sheet_add_aoa(worksheet, [row.values], { origin: `A${row.rowNumber}` })
        })
        if (!templateOnly && columnWidths) worksheet['!cols'] = columnWidths.slice(1).map(width => ({ wpx: width }))
        XLSX.utils.book_append_sheet(output, worksheet, source.name)
      }
      const bytes: ArrayBuffer = XLSX.write(output, { type: 'array', bookType: 'xlsx' })
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = templateOnly ? 'Department Courses Template.xlsx' : `${loadedName.replace(/\.xlsx$/i, '') || 'Department Courses'}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The courses workbook could not be downloaded. Please try again.')
    }
  }

  const measureWidths = (rendered = false) => {
    const context = document.createElement('canvas').getContext('2d')
    const cells = Array.from(tableRef.current?.querySelectorAll<HTMLTableCellElement>('thead th') ?? [])
    constraintsRef.current = cells.map((cell, column) => {
      const measuringCell = column === 0 ? tableRef.current?.querySelector<HTMLTableCellElement>('tbody th') ?? cell : cell
      const style = getComputedStyle(measuringCell)
      if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const measure = (text: string) => context?.measureText(text).width ?? text.length * parseFloat(style.fontSize)
      const textWidth = column === 0 ? rowNumberMinimumWidth(sheet?.rows.length ?? 0, measure) : headerTextMinimumWidth(COURSE_TABLE_HEADERS[column], measure)
      return { start: column, count: 1, minimum: Math.ceil(textWidth + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth) + 1) }
    })
    return columnWidths && !rendered ? columnWidths : cells.map(cell => cell.getBoundingClientRect().width)
  }

  const resizeCourseColumns = (widths: number[], column: number, delta: number) => {
    const resized = resizeHeaderColumns(widths, constraintsRef.current, column, 1, delta)
    const shrink = widths[column] - resized[column]
    if (shrink <= 0) return resized
    const availableShrink = Math.max(0, widths.reduce((sum, width) => sum + width, 0) - (scrollRef.current?.clientWidth ?? 0))
    const transfer = Math.max(0, shrink - availableShrink)
    if (transfer > 0) resized[column < widths.length - 1 ? column + 1 : column - 1] += transfer
    return resized
  }

  useLayoutEffect(() => {
    if (loading || !tableRef.current) return
    const widths = measureWidths()
    if (!columnWidths) setColumnWidths(defaultRowCounterWidth(widths, constraintsRef.current[0].minimum))
    else setColumnWidths(resizeHeaderColumns(widths, constraintsRef.current, 0, 1, 0))
  }, [sheet?.rows.length, selectedSheet, loading])

  const stopResize = () => {
    resizeRef.current = null
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
    resizeFrameRef.current = null
  }

  const updateResize = () => {
    const resize = resizeRef.current
    if (!resize) return
    const delta = resize.pointerX - resize.x + (scrollRef.current?.scrollLeft ?? 0) - resize.scrollLeft
    if (delta === resize.lastDelta) return
    resize.lastDelta = delta
    setColumnWidths(resizeCourseColumns(resize.widths, resize.column, delta))
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, column: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    stopResize()
    const widths = measureWidths(true)
    resizeRef.current = { column, x: event.clientX, pointerX: event.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0, lastDelta: 0, widths }
    event.currentTarget.setPointerCapture(event.pointerId)
    let lastFrame = performance.now()
    const frame = (now: number) => {
      const resize = resizeRef.current
      const scroll = scrollRef.current
      if (!resize || !scroll) { resizeFrameRef.current = null; return }
      const bounds = scroll.getBoundingClientRect()
      scroll.scrollLeft += headerResizeScrollStep(resize.pointerX, bounds.left, bounds.left + scroll.clientWidth) * Math.min(2, (now - lastFrame) / (1000 / 60))
      lastFrame = now
      updateResize()
      resizeFrameRef.current = requestAnimationFrame(frame)
    }
    resizeFrameRef.current = requestAnimationFrame(frame)
  }

  const resizeHandle = (column: number, header: string) => <span
    role="separator"
    aria-label={`Resize ${header}`}
    aria-orientation="vertical"
    aria-valuemin={constraintsRef.current[column]?.minimum}
    aria-valuenow={columnWidths ? Math.round(columnWidths[column]) : undefined}
    tabIndex={0}
    title={`Drag to resize ${header}; use Left/Right arrow keys when focused`}
    className={`absolute inset-y-0 z-20 w-2 ${column === COURSE_TABLE_HEADERS.length - 1 ? 'right-0' : 'right-[-0.5px] translate-x-1/2'} cursor-col-resize touch-none select-none hover:bg-black/20 focus-visible:bg-black/20 focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]`}
    onPointerDown={event => startResize(event, column)}
    onPointerMove={event => { if (resizeRef.current) resizeRef.current.pointerX = event.clientX }}
    onPointerUp={event => {
      if (resizeRef.current) { resizeRef.current.pointerX = event.clientX; updateResize() }
      stopResize()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={stopResize}
    onLostPointerCapture={stopResize}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10)
      setColumnWidths(resizeCourseColumns(measureWidths(true), column, delta))
    }}
  />

  const runClipboardAction = async (action: 'copy' | 'paste') => {
    const target = contextMenu?.target
    const selectionAtStart = workbook.selectionRef.current
    if (action === 'copy') {
      const data = new Map<string, string>()
      workbook.copyToClipboard({ setData: (type, value) => { data.set(type, value) } })
      try { await navigator.clipboard.writeText(data.get('text/plain') ?? '') } catch { /* The internal copy remains available. */ }
    } else {
      let text = workbook.rememberedText()
      try { text = await navigator.clipboard.readText() } catch { /* Use the internal clipboard when access is unavailable. */ }
      if (!contextMenuRef.current || workbook.selectionRef.current !== selectionAtStart || !target?.isConnected) return
      if (!workbook.canPasteText(text)) { setClipboardText(text); return }
      workbook.pasteFromClipboard({ getData: type => type === 'text/plain' ? text : '' })
    }
    if (!contextMenuRef.current) return
    setContextMenu(null)
    target?.focus({ preventScroll: true })
  }

  const fileMenuControl = <div ref={fileMenuRef} className="relative flex" onKeyDown={event => {
    if (!fileMenuOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setFileMenuOpen(false)
      fileMenuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus()
    } else if (event.key === 'Tab') setFileMenuOpen(false)
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
      items[next]?.focus()
    }
  }}>
    <button type="button" aria-label="Courses file actions" disabled={loading || saving || !storageReady}
      aria-haspopup="menu" aria-expanded={fileMenuOpen} aria-controls={fileMenuId}
      onClick={() => { onActivate?.(); setFileMenuOpen(open => !open) }}
      className="flex w-8 items-center justify-center text-sm hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#0b57d0] disabled:opacity-50">
      <span aria-hidden="true">▾</span>
    </button>
    {fileMenuOpen && <div id={fileMenuId} role="menu" aria-label="Courses file actions" className="absolute bottom-full right-0 z-50 mb-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
      <button type="button" role="menuitem" disabled={readOnly} onClick={() => { setFileMenuOpen(false); fileInputRef.current?.click() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 enabled:hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)] disabled:text-slate-400"><UploadIcon className="h-4 w-4" />Import XLSX</button>
      <button type="button" role="menuitem" disabled={!sheets.length} onClick={() => downloadCoursesWorkbook(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 enabled:hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)] disabled:text-slate-400"><DownloadIcon className="h-4 w-4" />Export XLSX</button>
      <button type="button" role="menuitem" onClick={() => downloadCoursesWorkbook(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 enabled:hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]"><DownloadIcon className="h-4 w-4" />DL Template</button>
    </div>}
  </div>

  const Root = embedded ? 'section' : 'dialog'
  const Footer = embedded ? 'div' : 'footer'
  const content = (
    <Root
      ref={element => { dialogRef.current = element }}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (contextMenu) setContextMenu(null); else if (!savingRef.current) onClose() }}
      onScrollCapture={() => { if (contextMenu) setContextMenu(null) }}
      onContextMenu={event => {
        if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement) return
        const cell = event.target.closest<HTMLTableCellElement>('td[data-edit-cell], th[data-row-counter]')
        if (!cell) return
        event.preventDefault()
        const rowIndex = Number(cell.closest<HTMLTableRowElement>('tr[data-row-index]')?.dataset.rowIndex)
        const column = cell.hasAttribute('data-row-counter') ? -1 : Number(cell.dataset.editCell?.split(':')[2])
        const selectedColumn = workbook.selectForContextMenu(selectedSheet, column, rowIndex)
        const target = selectedColumn === -1 ? cell.closest('tr')?.querySelector<HTMLTableCellElement>('th[data-row-counter]') ?? cell : cell
        setClipboardText(null)
        setContextMenu({ x: Math.max(0, Math.min(event.clientX, window.innerWidth - 180)), y: Math.max(0, Math.min(event.clientY, window.innerHeight - 144)), target })
      }}
      onCopy={event => {
        if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement || !event.target.closest('td[data-edit-cell], th[data-row-counter]')) return
        event.preventDefault()
        event.stopPropagation()
        workbook.copyToClipboard(event.clipboardData)
      }}
      onPaste={event => {
        if (savingRef.current || readOnly || !storageReady || loading) return
        if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement || !event.target.closest('td[data-edit-cell], th[data-row-counter]')) return
        event.preventDefault()
        event.stopPropagation()
        workbook.pasteFromClipboard(event.clipboardData)
      }}
      onKeyDown={event => {
        if (savingRef.current || readOnly || !storageReady || loading) return
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return
        const key = event.key.toLowerCase()
        if (key !== 'z' && key !== 'y') return
        event.preventDefault()
        event.stopPropagation()
        workbook.changeHistory(key === 'y' || event.shiftKey)
      }}
      className={embedded
        ? 'relative m-0 h-full max-h-none w-full max-w-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900'
        : 'fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900 backdrop:bg-black/50'}
    >
      <div className="flex h-full flex-col">
        <WorkbookSlot host={embedded ? headerHost : null} active={!embedded || active}>
        <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">{headerTitle || 'Department Courses'}</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80" title={headerSubtitle || loadedName}>{headerSubtitle || loadedName}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {sheets.length > 1 && <select aria-label="Courses worksheet" disabled={loading || saving} value={selectedSheet} onChange={event => changeSheet(Number(event.target.value))} className="min-w-0 max-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              {sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
            </select>}
            <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Import department courses XLSX" className="hidden" onChange={event => {
              const selected = event.target.files?.[0]
              event.target.value = ''
              if (selected) setFile(selected)
            }} />
          </div>
        </div>
        </WorkbookSlot>
        {loading ? <div role="status" aria-live="polite" className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
          <div className="space-y-1 text-center">
            <p className="text-lg font-semibold text-slate-800">{file ? 'Importing courses…' : 'Opening courses…'}</p>
            <p className="text-sm text-slate-500">{file ? 'Reading your XLSX file and checking the course headers.' : 'Loading your saved department courses.'}</p>
          </div>
        </div> : <>
          {error && <p role="alert" className="bg-rose-50 px-6 py-4 text-sm text-rose-700">{error}</p>}
          <div ref={scrollRef} inert={saving || readOnly || !storageReady} className="schedule-import-scrollbar min-h-0 flex-1 overflow-auto">
            <table ref={tableRef} className={`${columnWidths ? 'min-w-full' : 'w-full min-w-[1100px]'} table-fixed border-separate border-spacing-0 text-center text-sm [&_th]:align-middle [&_td]:align-middle [&_tr>:last-child]:border-r-0`} style={columnWidths ? { width: columnWidths.reduce((sum, width) => sum + width, 0) } : undefined}>
              <caption className="sr-only">{sheet ? `Department courses from ${sheet.name}` : 'Department courses'}</caption>
              <colgroup>
                {COURSE_TABLE_HEADERS.map((header, column) => <col key={header} className={columnWidths ? undefined : COURSE_COLUMN_CLASSES[column]} style={columnWidths ? { width: columnWidths[column] } : undefined} />)}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[#ffff00] text-black">
                <tr>
                  {COURSE_TABLE_HEADERS.map((header, column) => <th key={header} scope="col" className="relative border-t border-r border-b border-black bg-[#ffff00] px-3 py-2 font-bold">{header}{resizeHandle(column, header)}</th>)}
                </tr>
              </thead>
              <DepartmentCoursesTableBody key={selectedSheet} rows={sheet?.rows ?? EMPTY_COURSE_ROWS} sheetIndex={selectedSheet} selection={selection} actions={actions} />
            </table>
          </div>
        </>}
        <WorkbookSlot host={embedded ? footerHost : null} active={!embedded || active}>
        <Footer className={embedded
          ? 'flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3'
          : 'relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4'}>
          {!embedded && <Button type="button" variant="outline" icon={<UploadIcon className="h-4 w-4" />} disabled={loading || saving || readOnly || !storageReady} onClick={() => fileInputRef.current?.click()} className="h-10! rounded-lg!">Import XLSX</Button>}
          <div className="min-w-0 flex-1 text-sm">
            {storageError ? <p role="alert" className="text-rose-700">{storageError}</p>
              : !embedded && <p role="status" aria-live="polite" className="text-slate-500">{storageStatus || (hasUnsavedChanges ? 'Unsaved changes' : readOnly ? 'This courses workbook is read-only.' : !department ? 'Open Manage Courses from My Department to save this workbook.' : 'No changes')}</p>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {!embedded && <Button type="button" variant="outline" disabled={saving} onClick={onClose} className="h-10! rounded-lg!">Close</Button>}
            {!embedded && <Button type="button" variant="brand" disabled={!hasUnsavedChanges || !department || readOnly || loading || saving || !storageReady || !sheets.length} onClick={() => { void saveWorkbook() }} className="h-10! rounded-lg!">{saving ? 'Saving…' : 'Save'}</Button>}
          </div>
        </Footer>
        </WorkbookSlot>
        {embedded && menuHost && createPortal(fileMenuControl, menuHost)}
      </div>
      {contextMenu && <div
        ref={contextMenuRef}
        role="menu"
        aria-label="Course cell actions"
        className="fixed z-50 flex w-44 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onContextMenu={event => event.preventDefault()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setContextMenu(null)
            contextMenu.target.focus({ preventScroll: true })
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
          } else if (event.key === 'Tab') setContextMenu(null)
        }}
      >
        <button autoFocus type="button" role="menuitem" onClick={() => { void runClipboardAction('copy') }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Copy</button>
        <button type="button" role="menuitem" disabled={clipboardText === null || !workbook.canPasteText(clipboardText)} onClick={() => { void runClipboardAction('paste') }} className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] disabled:cursor-not-allowed disabled:text-slate-400">Paste</button>
        <button type="button" role="menuitem" onClick={() => { workbook.rowAction('add'); setContextMenu(null) }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Add row</button>
        <button type="button" role="menuitem" onClick={() => { workbook.rowAction('delete'); setContextMenu(null) }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Delete row</button>
      </div>}
    </Root>
  )
  return embedded ? content : createPortal(content, document.body)
})
