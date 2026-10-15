import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { createEmptyDepartmentCourseSheet, DEPARTMENT_COURSE_HEADERS, readDepartmentCourses, type DepartmentCourseRow, type DepartmentCourseSheet } from '../utils/departmentCourseImport'
import { defaultRowCounterWidth, headerResizeScrollStep, headerTextMinimumWidth, resizeHeaderColumns, rowNumberMinimumWidth, type HeaderWidthConstraint } from '../utils/headerColumnWidths'
import { Button } from './Button'
import { UploadIcon } from './Icons'
import { DepartmentCoursesTableBody } from './DepartmentCoursesTableBody'
import { useCoursesWorkbook } from './useCoursesWorkbook'
import type { DepartmentCoursesContext } from '../utils/departmentCoursesWorkbookState'
import { loadDepartmentCoursesWorkbook, saveDepartmentCoursesWorkbook, type SavedDepartmentCoursesWorkbook } from '../services/firestoreDepartmentCourses'

interface DepartmentCoursesImportModalProps {
  onClose: () => void
  initialSheets?: DepartmentCourseSheet[]
  sourceName?: string
  department?: DepartmentCoursesContext
  readOnly?: boolean
}

const COURSE_TABLE_HEADERS = ['#', ...DEPARTMENT_COURSE_HEADERS]
const COURSE_COLUMN_CLASSES = ['w-14', 'w-44', 'w-28', 'w-32', '', 'w-52', 'w-24']
const EMPTY_COURSE_ROWS: DepartmentCourseRow[] = []

export function DepartmentCoursesImportModal({ onClose, initialSheets, sourceName = 'Courses workbook', department, readOnly = false }: DepartmentCoursesImportModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [loading, setLoading] = useState(Boolean(department))
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const savedRef = useRef<SavedDepartmentCoursesWorkbook | null>(null)
  const [storageReady, setStorageReady] = useState(!department)
  const [storageStatus, setStorageStatus] = useState('')
  const [storageError, setStorageError] = useState('')
  const [error, setError] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: HTMLTableCellElement } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [clipboardText, setClipboardText] = useState<string | null>(null)

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

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      resizeRef.current = null
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

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
    replaceSheets(initialSheets ?? [createEmptyDepartmentCourseSheet()])
    setColumnWidths(null)
    void loadDepartmentCoursesWorkbook(department).then(loaded => {
      if (cancelled) return
      if (loaded) {
        savedRef.current = loaded.saved
        replaceSheets(loaded.state.sheets)
        changeSheet(loaded.state.selectedSheet)
        setColumnWidths(loaded.state.columnWidths)
        setLoadedName(loaded.saved.fileName)
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

  const saveWorkbook = async () => {
    if (!department || readOnly || loading || savingRef.current || !storageReady) return
    const currentSheets = workbook.finishCurrentEditing()
    savingRef.current = true
    setSaving(true)
    setContextMenu(null)
    setStorageError('')
    setStorageStatus('Saving courses workbook…')
    try {
      const fileName = file?.name ?? (/\.xlsx$/i.test(loadedName) ? loadedName : 'Department Courses.xlsx')
      const saved = await saveDepartmentCoursesWorkbook(department, fileName,
        { sheets: currentSheets, selectedSheet, columnWidths }, savedRef.current)
      savedRef.current = saved
      setLoadedName(saved.fileName)
      setStorageStatus(saved.cleanupWarning ? `Courses workbook saved. ${saved.cleanupWarning}` : 'Courses workbook saved.')
    } catch (caught) {
      setStorageStatus('')
      setStorageError(caught instanceof Error ? caught.message : 'The courses workbook could not be saved. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const measureWidths = () => {
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
    return columnWidths ?? cells.map(cell => cell.getBoundingClientRect().width)
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
    setColumnWidths(resizeHeaderColumns(resize.widths, constraintsRef.current, resize.column, 1, delta))
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, column: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    stopResize()
    const widths = measureWidths()
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
      setColumnWidths(resizeHeaderColumns(measureWidths(), constraintsRef.current, column, 1, delta))
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

  return createPortal(
    <dialog
      ref={dialogRef}
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
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900 backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">Department Courses</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80" title={loadedName}>{loadedName}</p>
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
        {loading ? <div role="status" aria-live="polite" className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
          <div className="space-y-1 text-center">
            <p className="text-lg font-semibold text-slate-800">{file ? 'Importing courses…' : 'Opening courses…'}</p>
            <p className="text-sm text-slate-500">{file ? 'Reading your XLSX file and checking the course headers.' : 'Loading your saved department courses.'}</p>
          </div>
        </div> : <>
          {error && <p role="alert" className="bg-rose-50 px-6 py-4 text-sm text-rose-700">{error}</p>}
          <div ref={scrollRef} inert={saving || readOnly || !storageReady} className="schedule-import-scrollbar min-h-0 flex-1 overflow-auto">
            <table ref={tableRef} className={`${columnWidths ? '' : 'w-full min-w-[1100px]'} table-fixed border-separate border-spacing-0 text-center text-sm [&_th]:align-middle [&_td]:align-middle [&_tr>:last-child]:border-r-0`} style={columnWidths ? { width: columnWidths.reduce((sum, width) => sum + width, 0) } : undefined}>
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
        <footer className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <Button type="button" variant="outline" icon={<UploadIcon className="h-4 w-4" />} disabled={loading || saving || readOnly || !storageReady} onClick={() => fileInputRef.current?.click()} className="h-10! rounded-lg!">Import XLSX</Button>
          <div className="min-w-0 flex-1 text-sm">
            {storageError ? <p role="alert" className="text-rose-700">{storageError}</p>
              : <p role="status" aria-live="polite" className="text-slate-500">{storageStatus || (readOnly ? 'This courses workbook is read-only.' : !department ? 'Open Manage Courses from My Department to save this workbook.' : '')}</p>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose} className="h-10! rounded-lg!">Close</Button>
            <Button type="button" variant="brand" disabled={!department || readOnly || loading || saving || !storageReady || !sheets.length} onClick={() => { void saveWorkbook() }} className="h-10! rounded-lg!">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </footer>
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
    </dialog>, document.body,
  )
}
