import { createPortal } from 'react-dom'
import { Fragment, forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import * as XLSX from 'xlsx'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { loadDepartmentSummary, loadSummaryFacultyDirectory, loadSummaryFacultyLoads, saveDepartmentSummary, type DepartmentSummaryState } from '../services/firestoreDepartmentSummary'
import { fillSummaryFacultyRows } from '../utils/departmentSummaryAutofill'
import { filterFacultyNames, type ExcelFacultyDirectory } from '../utils/excelFacultySuggestions'
import { titleCaseName } from '../utils/userName'
import { CELL_UNDO_COOLDOWN_MS } from '../utils/cellTextHistory'
import { headerResizeScrollStep } from '../utils/headerColumnWidths'
import { WorkbookSlot } from './WorkbookSlot'
import { DownloadIcon, UploadIcon } from './Icons'
import { ExcelFacultySuggestions } from './ExcelFacultySuggestions'
import type { WorkbookSaveHandle, WorkbookSaveState } from './workbookSaveTypes'

interface DepartmentSummaryWorkbookProps {
  term: DepartmentWorkbookTerm
  headerTitle: string
  headerSubtitle: string
  headerHost: HTMLElement | null
  footerHost: HTMLElement | null
  menuHost: HTMLElement | null
  active: boolean
  readOnly: boolean
  onActivate: () => void
  onSaveStateChange: (state: WorkbookSaveState) => void
}

const COLUMNS = [
  { letter: 'B', label: 'Faculty', width: 260 },
  { letter: 'C', label: 'DEPT', width: 100 },
  { letter: 'D', label: 'Reg/Prob/Cont', width: 170 },
  { letter: 'E', label: 'FT/PT', width: 80 },
  { letter: 'F', label: 'Lec', width: 90 },
  { letter: 'G', label: 'Lab', width: 90 },
  { letter: 'H', label: 'Total', width: 90 },
  { letter: 'J', label: 'From Other Dept.', width: 155 },
  { letter: 'K', label: 'NSTP', width: 85 },
  { letter: 'L', label: 'Big Class', width: 105 },
  { letter: 'M', label: 'Module', width: 90 },
  { letter: 'N', label: 'Overall Total', width: 130 },
] as const

const REGULARITY_CHOICES = ['Regular', 'Probationary', 'Contractual'] as const
const EMPLOYMENT_CHOICES = ['FT', 'PT'] as const

const EMPTY_ROWS = Array.from({ length: 23 }, () => Array.from({ length: COLUMNS.length }, () => ''))
const DEFAULT_WIDTHS = [52, ...COLUMNS.slice(0, 7).map(column => column.width), 24, ...COLUMNS.slice(7).map(column => column.width)]
const MIN_WIDTHS = [40, 90, 55, 90, 50, 50, 50, 55, 24, 85, 50, 70, 60, 80]
const widthIndex = (column: number) => column < 7 ? column + 1 : column + 2
const TEMPLATE_URL = `${import.meta.env.BASE_URL}department-summary-template.xlsx`

const formatFacultyName = (value: string) => value.trim().toUpperCase() === 'TBA' ? 'TBA' : titleCaseName(value)

interface SummaryHistoryEntry {
  before: string[][]
  after: string[][]
  cell: { row: number; column: number } | null
  typedAt: number
}

class SummaryHistory {
  private past: SummaryHistoryEntry[] = []
  private future: SummaryHistoryEntry[] = []
  private typingOpen = false

  reset() { this.past = []; this.future = []; this.typingOpen = false }
  checkpoint() { return { past: [...this.past], future: [...this.future] } }
  restore(checkpoint: ReturnType<SummaryHistory['checkpoint']>) {
    this.past = [...checkpoint.past]
    this.future = [...checkpoint.future]
    this.typingOpen = false
  }
  flushPending() { this.typingOpen = false }
  recordTyping(before: string[][], after: string[][], cell: { row: number; column: number }) {
    const now = Date.now()
    const last = this.past.at(-1)
    if (this.typingOpen && last?.cell?.row === cell.row && last.cell.column === cell.column
      && now - last.typedAt < CELL_UNDO_COOLDOWN_MS) {
      last.after = after
      last.typedAt = now
    } else this.past.push({ before, after, cell, typedAt: now })
    this.future = []
    this.typingOpen = true
  }
  recordAction(before: string[][], after: string[][]) {
    this.flushPending()
    this.past.push({ before, after, cell: null, typedAt: 0 })
    this.future = []
  }
  undo(minimumPast = 0, cell?: { row: number; column: number }) {
    this.flushPending()
    const last = this.past.at(-1)
    if (this.past.length <= minimumPast || cell && (last?.cell?.row !== cell.row || last.cell.column !== cell.column)) return null
    const entry = this.past.pop()!
    this.future.push(entry)
    return entry.before
  }
  redo(cell?: { row: number; column: number }) {
    this.flushPending()
    const last = this.future.at(-1)
    if (cell && (last?.cell?.row !== cell.row || last.cell.column !== cell.column)) return null
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(entry)
    return entry.after
  }
}

function cellText(cell: XLSX.CellObject | undefined) {
  if (!cell || cell.v === undefined || cell.v === null) return ''
  return cell.t === 'e' ? String(cell.w ?? cell.v) : String(cell.v)
}

function parseSummary(file: XLSX.WorkBook): string[][] {
  const sheet = file.Sheets[file.SheetNames[0]]
  if (!sheet || cellText(sheet.B2).trim().toLowerCase() !== 'faculty'
    || cellText(sheet.C2).trim().toLowerCase() !== 'dept'
    || cellText(sheet.F3).trim().toLowerCase() !== 'lec'
    || cellText(sheet.G3).trim().toLowerCase() !== 'lab') {
    throw new Error('Choose a Summary XLSX with the Faculty, DEPT, Hours Lec, and Hours Lab headings.')
  }
  let totalRow = 26
  for (let row = 4; row <= 1003; row++) {
    if (cellText(sheet[`B${row}`]).trim().toLowerCase() === 'total assigned load') { totalRow = row; break }
  }
  return Array.from({ length: totalRow - 3 }, (_, rowIndex) => COLUMNS.map((column, columnIndex) =>
    columnIndex >= 7 || rowIndex === totalRow - 4 && columnIndex < 4
      ? '' : columnIndex === 0 ? formatFacultyName(cellText(sheet[`${column.letter}${rowIndex + 4}`]))
        : cellText(sheet[`${column.letter}${rowIndex + 4}`])))
}

function calculateSummaryTotals(rows: readonly (readonly string[])[], selection: { column: number; anchor: number; end: number }) {
  const next = rows.map(row => [...row])
  const first = Math.max(0, Math.min(selection.anchor, selection.end))
  const last = Math.min(next.length - 1, Math.max(selection.anchor, selection.end))
  const missingHour = (value: string) => !value.trim() || /^#?N\/A$/i.test(value.trim())

  if (selection.column === 6 || selection.column === -1) {
    for (let index = first; index <= Math.min(last, next.length - 2); index++) {
      const row = next[index]
      const lecMissing = missingHour(row[4]), labMissing = missingHour(row[5])
      if (!row[0].trim() && lecMissing && labMissing) continue
      if (row[0].trim()) {
        if (lecMissing) row[4] = 'N/A'
        if (labMissing) row[5] = 'N/A'
      }
      const lec = lecMissing ? 0 : Number(row[4]), lab = labMissing ? 0 : Number(row[5])
      row[6] = (lecMissing && labMissing) || !Number.isFinite(lec) || !Number.isFinite(lab)
        ? 'N/A' : (lec + lab).toFixed(2)
    }
  }

  if (last === next.length - 1) {
    const columns = selection.column === -1 ? [4, 5, 6] : [selection.column]
    for (const column of columns) {
      if (column < 4 || column > 6) continue
      let sum = 0, hasValue = false
      for (let index = 0; index < next.length - 1; index++) {
        const value = next[index][column]
        if (!value.trim()) continue
        const number = Number(value)
        if (!Number.isFinite(number)) continue
        sum += number
        hasValue = true
      }
      next[next.length - 1][column] = hasValue ? sum.toFixed(2) : ''
    }
  }
  return next
}

function shiftSummaryRows(sheet: XLSX.WorkSheet, firstRow: number, offset: number) {
  if (!offset) return
  const entries = Object.entries(sheet).filter(([address]) => /^[A-Z]+\d+$/.test(address)
    && XLSX.utils.decode_cell(address).r >= firstRow - 1)
    .sort(([first], [second]) => offset > 0
      ? XLSX.utils.decode_cell(second).r - XLSX.utils.decode_cell(first).r
      : XLSX.utils.decode_cell(first).r - XLSX.utils.decode_cell(second).r)
  entries.forEach(([address, cell]) => {
    const location = XLSX.utils.decode_cell(address)
    sheet[XLSX.utils.encode_cell({ r: location.r + offset, c: location.c })] = cell
    delete sheet[address]
  })
  sheet['!merges'] = sheet['!merges']?.map(merge => {
    if (merge.s.r < firstRow - 1) return merge
    return { s: { ...merge.s, r: merge.s.r + offset }, e: { ...merge.e, r: merge.e.r + offset } }
  })
  if (sheet['!rows']) {
    const rowEntries = sheet['!rows'].map((value, index) => ({ value, index })).filter(entry => entry.value)
    const nextRows: typeof sheet['!rows'] = []
    rowEntries.forEach(({ value, index }) => { nextRows[index >= firstRow - 1 ? index + offset : index] = value })
    sheet['!rows'] = nextRows
  }
  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref'])
    range.e.r += offset
    sheet['!ref'] = XLSX.utils.encode_range(range)
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

function base64ToBytes(data: string) {
  return Uint8Array.from(atob(data), character => character.charCodeAt(0))
}

export const DepartmentSummaryWorkbook = forwardRef<WorkbookSaveHandle, DepartmentSummaryWorkbookProps>(function DepartmentSummaryWorkbook({
  term, headerTitle, headerSubtitle, headerHost, footerHost, menuHost, active, readOnly, onActivate, onSaveStateChange,
}, ref) {
  const [rows, setRows] = useState<string[][]>(EMPTY_ROWS)
  const [fileName, setFileName] = useState('Department Summary.xlsx')
  const [sourceData, setSourceData] = useState('')
  const [columnWidths, setColumnWidths] = useState<number[]>(DEFAULT_WIDTHS)
  const [selectedCell, setSelectedCell] = useState<{ row: number; column: number } | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ column: number; anchor: number; end: number } | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [editingCell, setEditingCell] = useState<{ row: number; column: number } | null>(null)
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; row: number; column: number; target: HTMLTableCellElement } | null>(null)
  const [baseline, setBaseline] = useState<DepartmentSummaryState | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [storageReady, setStorageReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)
  const [facultyDirectory, setFacultyDirectory] = useState<ExcelFacultyDirectory>({ names: [], loading: true })
  const [facultyQuery, setFacultyQuery] = useState('')
  const [facultyOption, setFacultyOption] = useState(-1)
  const [choiceDraft, setChoiceDraft] = useState('')
  const [choiceQuery, setChoiceQuery] = useState('')
  const [choiceOption, setChoiceOption] = useState(-1)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const facultyInputRef = useRef<HTMLInputElement>(null)
  const facultyCellRef = useRef<HTMLTableCellElement>(null)
  const choiceInputRef = useRef<HTMLInputElement>(null)
  const choiceCellRef = useRef<HTMLTableCellElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const rowMenuRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const rowsRef = useRef(rows)
  const historyRef = useRef(new SummaryHistory())
  const typingTimerRef = useRef<number | null>(null)
  const editSessionRef = useRef<{ row: number; column: number; targets: number[]; beforeRows: string[][]; checkpoint: ReturnType<SummaryHistory['checkpoint']> } | null>(null)
  const resizeRef = useRef<{ column: number; x: number; pointerX: number; scrollLeft: number; lastDelta: number; widths: number[] } | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const rangeRef = useRef<{ column: number; anchor: number; end: number } | null>(null)
  const dragRef = useRef<{ column: number; anchor: number; end: number } | null>(null)
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null)
  const dragFrameRef = useRef<number | null>(null)
  const copiedTextRef = useRef<string | null>(null)
  const autoFillRequestRef = useRef(0)
  const menuId = useId()
  const facultySuggestionsId = useId()
  const choiceSuggestionsId = useId()
  const current: DepartmentSummaryState = { rows, fileName, sourceData, columnWidths }
  const calculationSelection = selectedRange ?? (selectedCell
    ? { column: selectedCell.column, anchor: selectedCell.row, end: selectedCell.row }
    : selectedRow !== null ? { column: -1, anchor: selectedRow, end: selectedRow } : null)
  const canCalculateSelection = calculationSelection !== null && (calculationSelection.column === -1
    || calculationSelection.column === 6
    || (calculationSelection.column === 4 || calculationSelection.column === 5)
      && Math.max(calculationSelection.anchor, calculationSelection.end) === rows.length - 1)
  const facultyMatches = filterFacultyNames(['TBA', ...facultyDirectory.names], facultyQuery)
  const activeChoices = editingCell?.column === 2 ? REGULARITY_CHOICES : editingCell?.column === 3 ? EMPLOYMENT_CHOICES : []
  const choiceMatches = filterFacultyNames(activeChoices, choiceQuery)
  const dirty = !loading && storageReady && baseline !== null
    && (rows.length !== baseline.rows.length || rows.some((row, index) =>
      row.length !== baseline.rows[index]?.length || row.some((value, column) => value !== baseline.rows[index][column]))
      || fileName !== baseline.fileName || sourceData !== baseline.sourceData
      || columnWidths.length !== baseline.columnWidths?.length
      || columnWidths.some((width, index) => width !== baseline.columnWidths?.[index]))

  useEffect(() => {
    let cancelled = false
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = null
    setLoading(true)
    setStorageReady(false)
    setAutoFilling(false)
    autoFillRequestRef.current++
    setBaseline(null)
    setError('')
    void loadDepartmentSummary(term).then(loaded => {
      if (cancelled) return
      const next = loaded?.state
        ? { ...loaded.state, rows: loaded.state.rows.map(row => row.map((value, column) =>
          column === 0 ? formatFacultyName(value) : value)), columnWidths: loaded.state.columnWidths ?? DEFAULT_WIDTHS }
        : { rows: EMPTY_ROWS, fileName: 'Department Summary.xlsx', sourceData: '', columnWidths: DEFAULT_WIDTHS }
      setRows(next.rows)
      rowsRef.current = next.rows
      setFileName(next.fileName)
      setSourceData(next.sourceData)
      setColumnWidths(next.columnWidths)
      setSelectedCell(null)
      setSelectedRange(null)
      rangeRef.current = null
      setSelectedRow(null)
      setEditingCell(null)
      setRowMenu(null)
      editSessionRef.current = null
      historyRef.current.reset()
      setRevision(loaded?.revision ?? 0)
      setBaseline(next)
      setStorageReady(true)
    }).catch(caught => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'Summary could not be loaded.')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; autoFillRequestRef.current++ }
  }, [term.departmentId, term.academicYearId, term.semester, term.membershipId])

  useEffect(() => {
    let cancelled = false
    setFacultyDirectory({ names: [], loading: true })
    void loadSummaryFacultyDirectory(term.departmentCode).then(names => {
      if (!cancelled) setFacultyDirectory({ names, loading: false })
    }).catch(caught => {
      if (!cancelled) setFacultyDirectory({ names: [], loading: false,
        error: caught instanceof Error ? caught.message : 'Department instructors could not be loaded.' })
    })
    return () => { cancelled = true }
  }, [term.departmentCode])

  useEffect(() => {
    onSaveStateChange({ dirty, canSave: !readOnly && !loading && !saving && !autoFilling && storageReady, saving })
  }, [dirty, readOnly, loading, saving, autoFilling, storageReady, onSaveStateChange])

  useEffect(() => {
    if (!readOnly) return
    setSelectedCell(null)
    setSelectedRange(null)
    rangeRef.current = null
    setSelectedRow(null)
    dragRef.current = null
    dragPointerRef.current = null
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    dragFrameRef.current = null
  }, [readOnly])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  useEffect(() => {
    if (!rowMenu) return
    const close = (event: PointerEvent) => { if (!rowMenuRef.current?.contains(event.target as Node)) setRowMenu(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [rowMenu])

  useEffect(() => () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
  }, [])

  const changeRange = (next: { column: number; anchor: number; end: number } | null) => {
    rangeRef.current = next
    setSelectedRange(next)
  }

  const updateDragSelection = () => {
    dragFrameRef.current = null
    const drag = dragRef.current, pointer = dragPointerRef.current
    if (!drag || !pointer) return
    if (drag.column === -1) {
      const row = [...(tableRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-summary-row]') ?? [])]
        .find(candidate => {
          const bounds = candidate.getBoundingClientRect()
          return pointer.y >= bounds.top && pointer.y < bounds.bottom
        })
      const rowIndex = Number(row?.dataset.summaryRow)
      if (!row || rowIndex === drag.end) return
      const next = { ...drag, end: rowIndex }
      dragRef.current = next
      changeRange(next)
      return
    }
    const target = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-summary-cell]')
    const location = target?.dataset.summaryCell?.split(':').map(Number)
    if (!location || location[1] !== drag.column || location[0] === drag.end) return
    const next = { ...drag, end: location[0] }
    dragRef.current = next
    changeRange(next)
  }

  const startCellSelection = (event: ReactPointerEvent<HTMLTableCellElement>, row: number, column: number) => {
    if (readOnly || event.button !== 0 || editingCell && column !== -1) return
    if (editingCell) finishEditing(true, false)
    event.preventDefault()
    const current = rangeRef.current
    const inside = current?.column === column && row >= Math.min(current.anchor, current.end) && row <= Math.max(current.anchor, current.end)
    const next = { column, anchor: event.shiftKey && current?.column === column ? current.anchor : row, end: row }
    dragRef.current = next
    dragPointerRef.current = { x: event.clientX, y: event.clientY }
    if (event.shiftKey || !inside) changeRange(next)
    setSelectedCell(column === -1 ? null : { row, column })
    setSelectedRow(column === -1 ? row : null)
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveCellSelection = (event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (!dragRef.current) return
    dragPointerRef.current = { x: event.clientX, y: event.clientY }
    if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(updateDragSelection)
  }

  const endCellSelection = () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current)
    updateDragSelection()
    dragRef.current = null
    dragPointerRef.current = null
  }

  const flushTyping = () => {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = null
    historyRef.current.flushPending()
  }

  const updateCell = (row: number, column: number, value: string) => {
    if (column === 0) value = formatFacultyName(value)
    const before = rowsRef.current
    const session = editSessionRef.current
    const targets = session?.row === row && session.column === column ? session.targets : [row]
    if (targets.every(index => before[index][column] === value)) return
    const next = before.map((item, index) => targets.includes(index)
      ? item.map((cell, cellIndex) => cellIndex === column ? value : cell) : item)
    historyRef.current.recordTyping(before, next, { row, column })
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
    typingTimerRef.current = window.setTimeout(() => { historyRef.current.flushPending(); typingTimerRef.current = null }, CELL_UNDO_COOLDOWN_MS)
    rowsRef.current = next
    setRows(next)
    setError('')
  }

  const focusCell = (row: number, column: number) => {
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLElement>(`[data-summary-cell="${row}:${column}"]`)?.focus({ preventScroll: true }))
  }

  const beginEditing = (row: number, column: number, initialValue?: string) => {
    if (readOnly || saving || row === rowsRef.current.length - 1 && column < 4) return
    flushTyping()
    const range = rangeRef.current
    const targets = range?.column === column && row >= Math.min(range.anchor, range.end) && row <= Math.max(range.anchor, range.end)
      ? Array.from({ length: Math.abs(range.end - range.anchor) + 1 }, (_, index) => Math.min(range.anchor, range.end) + index)
        .filter(index => !(index === rowsRef.current.length - 1 && column < 4)) : [row]
    editSessionRef.current = { row, column, targets, beforeRows: rowsRef.current, checkpoint: historyRef.current.checkpoint() }
    setSelectedRow(null)
    setSelectedCell({ row, column })
    if (column === 0) {
      setFacultyQuery(initialValue ?? '')
      setFacultyOption(initialValue === undefined ? -1 : 0)
    }
    if (column === 2 || column === 3) {
      setChoiceDraft(initialValue === undefined ? rowsRef.current[row][column] : initialValue)
      setChoiceQuery(initialValue ?? '')
      setChoiceOption(initialValue === undefined ? -1 : 0)
    }
    if (initialValue !== undefined && (column !== 2 && column !== 3 || initialValue === '')) updateCell(row, column, initialValue)
    setEditingCell({ row, column })
  }

  const finishEditing = (save: boolean, restoreFocus: boolean) => {
    const session = editSessionRef.current
    if (!session) return
    editSessionRef.current = null
    if (save) flushTyping()
    else {
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current)
      typingTimerRef.current = null
      historyRef.current.restore(session.checkpoint)
      rowsRef.current = session.beforeRows
      setRows(session.beforeRows)
    }
    setEditingCell(null)
    setFacultyQuery('')
    setChoiceQuery('')
    if (restoreFocus) focusCell(session.row, session.column)
  }

  const finishChoice = (row: number, column: number, choices: readonly string[], restoreFocus: boolean, selected?: string) => {
    if (!editSessionRef.current) return
    const value = selected ?? choices.find(choice => choice.toLowerCase() === choiceDraft.trim().toLowerCase())
    if (value !== undefined || !choiceDraft.trim()) updateCell(row, column, value ?? '')
    finishEditing(true, restoreFocus)
  }

  const changeHistory = (redo: boolean) => {
    flushTyping()
    const session = editSessionRef.current
    const cell = session ? { row: session.row, column: session.column } : undefined
    const next = redo ? historyRef.current.redo(cell) : historyRef.current.undo(session?.checkpoint.past.length ?? 0, cell)
    if (!next) return
    rowsRef.current = next
    setRows(next)
    setSelectedRow(previous => previous === null ? null : Math.min(previous, next.length - 1))
    setSelectedCell(previous => previous && previous.row < next.length ? previous : null)
    const range = rangeRef.current
    changeRange(range && range.anchor < next.length ? { ...range, end: Math.min(range.end, next.length - 1) } : null)
    setError('')
    if (session) requestAnimationFrame(() => {
      const input = tableRef.current?.querySelector<HTMLInputElement>(`[data-summary-cell="${session.row}:${session.column}"] input`)
      input?.setSelectionRange(input.value.length, input.value.length)
    })
  }

  const pasteSelection = (text: string) => {
    if (!selectedCell || readOnly || saving || !text) return
    flushTyping()
    const matrix = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'))
    const before = rowsRef.current
    const next = before.map(item => [...item])
    const range = rangeRef.current
    if (range?.column === selectedCell.column && matrix.length === 1 && matrix[0].length === 1) {
      for (let row = Math.min(range.anchor, range.end); row <= Math.max(range.anchor, range.end); row++) {
        if (row === next.length - 1 && range.column < 4) continue
        next[row][range.column] = range.column === 0 ? formatFacultyName(matrix[0][0]) : matrix[0][0]
      }
    } else {
    const firstRow = range?.column === selectedCell.column ? Math.min(range.anchor, range.end) : selectedCell.row
    matrix.forEach((line, rowOffset) => line.forEach((value, columnOffset) => {
      const row = firstRow + rowOffset, column = selectedCell.column + columnOffset
      if (row >= next.length || column >= COLUMNS.length || row === next.length - 1 && column < 4) return
      next[row][column] = column === 0 ? formatFacultyName(value) : value
    }))
    }
    if (JSON.stringify(next) === JSON.stringify(before)) return
    historyRef.current.recordAction(before, next)
    rowsRef.current = next
    setRows(next)
    setError('')
  }

  const pasteRows = (text: string) => {
    if (selectedRow === null || readOnly || saving || !text) return
    flushTyping()
    const before = rowsRef.current
    const next = before.map(row => [...row])
    const firstRow = selectedRange?.column === -1 ? Math.min(selectedRange.anchor, selectedRange.end) : selectedRow
    text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').forEach((line, rowOffset) => {
      const row = firstRow + rowOffset
      if (row >= next.length - 1) return
      line.split('\t').slice(0, COLUMNS.length).forEach((value, column) => {
        next[row][column] = column === 0 ? formatFacultyName(value) : value
      })
    })
    if (JSON.stringify(next) === JSON.stringify(before)) return
    historyRef.current.recordAction(before, next)
    rowsRef.current = next
    setRows(next)
    setError('')
  }

  const changeRow = (action: 'add' | 'delete') => {
    const range = rangeRef.current
    const first = range ? Math.min(range.anchor, range.end) : rowMenu?.row ?? selectedRow
    const last = range ? Math.max(range.anchor, range.end) : rowMenu?.row ?? selectedRow
    if (first === null || first === undefined || last === null || last === undefined || readOnly || saving) return
    const before = rowsRef.current
    if (action === 'add' && (before.length >= 1000 || last >= before.length - 1)
      || action === 'delete' && (last >= before.length - 1 || before.length - (last - first + 1) < 2)) return
    flushTyping()
    const next = before.map(row => [...row])
    if (action === 'add') next.splice(last + 1, 0, Array.from({ length: COLUMNS.length }, () => ''))
    else next.splice(first, last - first + 1)
    historyRef.current.recordAction(before, next)
    rowsRef.current = next
    setRows(next)
    const row = action === 'add' ? last + 1 : Math.min(first, next.length - 2)
    const column = range?.column ?? rowMenu?.column ?? -1
    changeRange({ column, anchor: row, end: row })
    setSelectedCell(column === -1 ? null : { row, column })
    setSelectedRow(column === -1 ? row : null)
    setError('')
    setRowMenu(null)
    requestAnimationFrame(() => {
      const selector = column === -1 ? `tr[data-summary-row="${row}"] > th` : `[data-summary-cell="${row}:${column}"]`
      tableRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
    })
  }

  const selectionText = () => {
    const range = rangeRef.current
    if (range?.column === -1) return rowsRef.current.slice(Math.min(range.anchor, range.end), Math.max(range.anchor, range.end) + 1)
      .map(row => row.join('\t')).join('\n')
    if (range) return rowsRef.current.slice(Math.min(range.anchor, range.end), Math.max(range.anchor, range.end) + 1)
      .map(row => row[range.column]).join('\n')
    if (selectedRow !== null) return rowsRef.current[selectedRow]?.join('\t') ?? ''
    return selectedCell ? rowsRef.current[selectedCell.row]?.[selectedCell.column] ?? '' : ''
  }

  const copySelection = async () => {
    const text = selectionText()
    copiedTextRef.current = text
    try {
      await navigator.clipboard.writeText(text)
    } catch { /* Keep the copied cells available to this workbook. */ }
    rowMenu?.target.focus({ preventScroll: true })
    setRowMenu(null)
  }

  const pasteFromClipboard = async () => {
    const selectionAtStart = rangeRef.current
    let text = copiedTextRef.current ?? ''
    try {
      text = await navigator.clipboard.readText()
    } catch { /* Use cells copied in this workbook when clipboard access is unavailable. */ }
    if (!rowMenuRef.current || rangeRef.current !== selectionAtStart || !rowMenu?.target.isConnected) return
    if (!text) { setError('Clipboard is empty. Copy cells before pasting.'); return }
    if (rangeRef.current?.column === -1 || selectedRow !== null) pasteRows(text)
    else pasteSelection(text)
    rowMenu.target.focus({ preventScroll: true })
    setRowMenu(null)
  }

  const resizeWidths = (widths: number[], column: number, delta: number) => {
    const next = [...widths]
    next[column] = Math.max(MIN_WIDTHS[column], widths[column] + delta)
    const shrink = widths[column] - next[column]
    if (shrink > 0) {
      const overflow = Math.max(0, widths.reduce((sum, width) => sum + width, 0) - (scrollRef.current?.clientWidth ?? 0))
      const neighbor = column === widths.length - 1 ? column - 1 : column === 7 ? 9 : column + 1
      next[neighbor] += Math.max(0, shrink - overflow)
    }
    return next
  }

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
    setColumnWidths(resizeWidths(resize.widths, resize.column, delta))
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, column: number) => {
    if (event.button !== 0 || readOnly) return
    event.preventDefault()
    event.stopPropagation()
    stopResize()
    const measured = Array.from(tableRef.current?.querySelectorAll('col') ?? []).map(cell => cell.getBoundingClientRect().width)
    const widths = measured.length === DEFAULT_WIDTHS.length ? measured : columnWidths
    resizeRef.current = { column, x: event.clientX, pointerX: event.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0, lastDelta: 0, widths }
    setColumnWidths(widths)
    event.currentTarget.setPointerCapture(event.pointerId)
    let lastFrame = performance.now()
    const frame = (now: number) => {
      const resize = resizeRef.current, scroll = scrollRef.current
      if (!resize || !scroll) { resizeFrameRef.current = null; return }
      const bounds = scroll.getBoundingClientRect()
      scroll.scrollLeft += headerResizeScrollStep(resize.pointerX, bounds.left, bounds.left + scroll.clientWidth) * Math.min(2, (now - lastFrame) / (1000 / 60))
      lastFrame = now
      updateResize()
      resizeFrameRef.current = requestAnimationFrame(frame)
    }
    resizeFrameRef.current = requestAnimationFrame(frame)
  }

  const resizeHandle = (column: number, label: string) => readOnly ? null : <span role="separator" aria-label={`Resize ${label}`} aria-orientation="vertical"
    aria-valuemin={MIN_WIDTHS[column]} aria-valuenow={Math.round(columnWidths[column])} tabIndex={0}
    title={`Drag to resize ${label}; use Left/Right arrow keys when focused`}
    className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1/2 cursor-col-resize touch-none select-none hover:bg-black/20 focus-visible:bg-black/20 focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]"
    onPointerDown={event => startResize(event, column)}
    onPointerMove={event => { if (resizeRef.current) resizeRef.current.pointerX = event.clientX }}
    onPointerUp={event => {
      if (resizeRef.current) { resizeRef.current.pointerX = event.clientX; updateResize() }
      stopResize()
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={stopResize} onLostPointerCapture={stopResize}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      event.stopPropagation()
      const measured = Array.from(tableRef.current?.querySelectorAll('col') ?? []).map(cell => cell.getBoundingClientRect().width)
      setColumnWidths(resizeWidths(measured.length === DEFAULT_WIDTHS.length ? measured : columnWidths, column,
        (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 50 : 10)))
    }} />

  const saveIfChanged = async () => {
    if (!dirty) return true
    if (readOnly || loading || saving || autoFilling || !storageReady) return false
    setSaving(true)
    try {
      const nextRevision = await saveDepartmentSummary(term, current, revision)
      setRevision(nextRevision)
      setBaseline(current)
      setError('')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Summary could not be saved.')
      return false
    } finally {
      setSaving(false)
    }
  }
  useImperativeHandle(ref, () => ({ saveIfChanged }))

  const importFile = async (file: File) => {
    finishEditing(true, false)
    flushTyping()
    setError('')
    setLoading(true)
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx file.')
      if (file.size > 600000) throw new Error('The Summary XLSX exceeds the 600 KB import limit.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const imported = parseSummary(XLSX.read(bytes, { type: 'array' }))
      setRows(imported)
      rowsRef.current = imported
      setFileName(file.name)
      setSourceData(bytesToBase64(bytes))
      setSelectedCell(null)
      setSelectedRow(null)
      setEditingCell(null)
      setRowMenu(null)
      editSessionRef.current = null
      historyRef.current.reset()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Summary could not be imported.')
    } finally {
      setLoading(false)
    }
  }

  const autoFillSummary = async () => {
    if (readOnly || loading || saving || autoFilling || !storageReady) return
    finishEditing(true, false)
    flushTyping()
    setError('')
    setAutoFilling(true)
    const request = ++autoFillRequestRef.current
    try {
      const loads = await loadSummaryFacultyLoads(term)
      if (request !== autoFillRequestRef.current) return
      if (!loads.length) throw new Error('No saved schedules with valid department instructors were found for this term.')
      const before = rowsRef.current
      const next = fillSummaryFacultyRows(before, loads).map(row => row.map((value, column) =>
        column === 0 ? formatFacultyName(value) : value))
      if (JSON.stringify(before) !== JSON.stringify(next)) {
        historyRef.current.recordAction(before, next)
        rowsRef.current = next
        setRows(next)
      }
    } catch (caught) {
      if (request === autoFillRequestRef.current) setError(caught instanceof Error ? caught.message : 'Summary could not be auto-filled.')
    } finally {
      if (request === autoFillRequestRef.current) setAutoFilling(false)
    }
  }

  const calculateTotals = () => {
    if (readOnly || loading || saving || autoFilling || !storageReady || !calculationSelection || !canCalculateSelection) return
    finishEditing(true, false)
    flushTyping()
    const before = rowsRef.current
    const next = calculateSummaryTotals(before, calculationSelection)
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      historyRef.current.recordAction(before, next)
      rowsRef.current = next
      setRows(next)
    }
    setError('')
  }

  const exportSummary = async () => {
    setMenuOpen(false)
    setError('')
    try {
      let bytes: Uint8Array
      if (sourceData) bytes = base64ToBytes(sourceData)
      else {
        const response = await fetch(TEMPLATE_URL)
        if (!response.ok) throw new Error('Summary format could not be opened.')
        bytes = new Uint8Array(await response.arrayBuffer())
      }
      const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const originalRows = sourceData ? parseSummary(workbook) : EMPTY_ROWS
      const rowOffset = rows.length - originalRows.length
      const widthsChanged = columnWidths.some((width, index) => Math.abs(width - DEFAULT_WIDTHS[index]) > 0.5)
      const facultyNamesChanged = rows.slice(0, -1).some((row, index) => row[0] !== cellText(sheet[`B${index + 4}`]))
      if (sourceData && !widthsChanged && !rowOffset && !facultyNamesChanged
        && JSON.stringify(rows) === JSON.stringify(originalRows)) {
        const original = new ArrayBuffer(bytes.length)
        new Uint8Array(original).set(bytes)
        downloadBlob(new Blob([original], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
        return
      }
      if (rowOffset) {
        shiftSummaryRows(sheet, originalRows.length + 3, rowOffset)
        for (let row = 4; row < Math.max(rows.length + 3, originalRows.length + 3); row++) for (const column of COLUMNS) {
          if (row >= rows.length + 3 && rowOffset > 0) continue
          const address = `${column.letter}${row}`
          const cell = sheet[address]
          if (!cell) continue
          if (cell.s) sheet[address] = { t: 'z', s: cell.s }
          else delete sheet[address]
        }
      }
      rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
        if (rowIndex === rows.length - 1 && columnIndex < 4
          || !rowOffset && value === originalRows[rowIndex]?.[columnIndex]
            && (columnIndex !== 0 || value === cellText(sheet[`B${rowIndex + 4}`]))) return
        const address = `${COLUMNS[columnIndex].letter}${rowIndex + 4}`
        const previous = sheet[address] ?? {}
        if (!value) {
          if (previous.s) sheet[address] = { t: 'z', s: previous.s }
          else delete sheet[address]
          return
        }
        const number = Number(value)
        const numeric = columnIndex >= 4 && Number.isFinite(number) && /^[-+]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())
        sheet[address] = { ...previous, t: numeric ? 'n' : 's', v: numeric ? number : value, f: undefined, w: undefined }
      }))
      if (rowOffset) sheet[`B${rows.length + 3}`] = { ...sheet[`B${rows.length + 3}`], t: 's', v: 'Total Assigned Load' }
      if (widthsChanged) {
        const excelWidths = [...(sheet['!cols'] ?? [])]
        COLUMNS.forEach((column, index) => {
          const excelColumn = XLSX.utils.decode_col(column.letter)
          excelWidths[excelColumn] = { ...excelWidths[excelColumn], wpx: columnWidths[widthIndex(index)] }
        })
        excelWidths[8] = { ...excelWidths[8], wpx: columnWidths[8] }
        sheet['!cols'] = excelWidths
      }
      const output: ArrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true })
      downloadBlob(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Summary could not be exported.')
    }
  }

  const downloadTemplate = () => {
    setMenuOpen(false)
    const anchor = document.createElement('a')
    anchor.href = TEMPLATE_URL
    anchor.download = 'Department Summary Template.xlsx'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }

  const menu = <div ref={menuRef} className="relative flex h-full">
    <button type="button" aria-label="Summary file actions" aria-haspopup="menu" aria-controls={menuId} aria-expanded={menuOpen}
      disabled={loading || saving} onClick={() => { onActivate(); setMenuOpen(open => !open) }}
      className="flex w-8 items-center justify-center text-sm hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#0b57d0] disabled:opacity-50">▾</button>
    {menuOpen && <div id={menuId} role="menu" aria-label="Summary file actions" className="absolute bottom-full right-0 z-50 mb-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
      <button type="button" role="menuitem" disabled={readOnly} onClick={() => { setMenuOpen(false); inputRef.current?.click() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 enabled:hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)] disabled:text-slate-400"><UploadIcon className="h-4 w-4" />Import XLSX</button>
      <button type="button" role="menuitem" onClick={() => { void exportSummary() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 enabled:hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]"><DownloadIcon className="h-4 w-4" />Export XLSX</button>
      <button type="button" role="menuitem" onClick={downloadTemplate} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]"><DownloadIcon className="h-4 w-4" />DL Template</button>
    </div>}
  </div>

  return <section className="relative flex h-full min-h-0 flex-col bg-white" onScrollCapture={() => { if (rowMenu) setRowMenu(null) }} onContextMenu={event => {
    if (readOnly) { event.preventDefault(); return }
    if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement) return
    const target = event.target.closest<HTMLTableCellElement>('td[data-summary-cell], th[data-summary-row-counter]')
    if (!target) return
    event.preventDefault()
    finishEditing(true, false)
    const row = Number(target.closest<HTMLTableRowElement>('tr[data-summary-row]')?.dataset.summaryRow)
    const column = target.hasAttribute('data-summary-row-counter') ? -1 : Number(target.dataset.summaryCell?.split(':')[1])
    const range = rangeRef.current
    const inside = range && row >= Math.min(range.anchor, range.end) && row <= Math.max(range.anchor, range.end)
      && (range.column === column || range.column === -1 && column !== -1)
    if (!inside) {
      changeRange({ column, anchor: row, end: row })
      setSelectedCell(column === -1 ? null : { row, column })
      setSelectedRow(column === -1 ? row : null)
    }
    const menuTarget = inside && range?.column === -1
      ? target.closest('tr')?.querySelector<HTMLTableCellElement>('th[data-summary-row-counter]') ?? target : target
    setRowMenu({ x: Math.max(0, Math.min(event.clientX, window.innerWidth - 180)), y: Math.max(0, Math.min(event.clientY, window.innerHeight - 144)), row, column: inside ? range!.column : column, target: menuTarget })
  }} onKeyDownCapture={event => {
    if (readOnly || !(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return
    const key = event.key.toLowerCase()
    if (key !== 'z' && key !== 'y') return
    event.preventDefault()
    event.stopPropagation()
    changeHistory(key === 'y' || event.shiftKey)
  }} onCopy={event => {
    if (editingCell || selectedCell === null && selectedRow === null) return
    event.preventDefault()
    const text = selectionText()
    copiedTextRef.current = text
    event.clipboardData.setData('text/plain', text)
  }} onPaste={event => {
    if (selectedCell === null && selectedRow === null || editingCell || readOnly) return
    event.preventDefault()
    event.stopPropagation()
    const text = event.clipboardData.getData('text/plain')
    if (rangeRef.current?.column === -1 || selectedRow !== null) pasteRows(text)
    else pasteSelection(text)
  }}>
    <WorkbookSlot host={headerHost} active={active}>
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
        <div className="min-w-0"><h2 className="text-xl font-bold tracking-tight">{headerTitle}</h2><p className="mt-0.5 truncate text-xs font-medium text-white/80">{headerSubtitle}</p></div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={readOnly || loading || saving || autoFilling || !storageReady}
            title="Fill faculty and teaching hours from saved schedules for this term"
            onClick={() => { void autoFillSummary() }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#41572a] shadow-sm transition-colors hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60">
            {autoFilling ? 'Filling…' : 'Auto Fill'}
          </button>
          <button type="button" disabled={readOnly || loading || saving || autoFilling || !storageReady || !canCalculateSelection}
            title="Calculate selected Total cells from Lec and Lab, or sum a selected Total Assigned Load cell"
            onClick={calculateTotals}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#41572a] shadow-sm transition-colors hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60">
            Calculate Totals
          </button>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Import Summary XLSX" className="hidden" onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importFile(file)
        }} />
      </div>
    </WorkbookSlot>
    {loading ? <div role="status" className="flex min-h-0 flex-1 items-center justify-center text-slate-600">Opening Summary…</div> : <>
      <div ref={scrollRef} className="schedule-import-scrollbar min-h-0 flex-1 overflow-auto">
        <table ref={tableRef} className="min-w-full table-fixed border-separate border-spacing-0 text-center text-sm" style={{ width: columnWidths.reduce((sum, width) => sum + width, 0) }}>
          <caption className="sr-only">Department faculty load summary</caption>
          <colgroup><col style={{ width: columnWidths[0] }} />{COLUMNS.map((column, index) => <Fragment key={column.letter}>
            <col style={{ width: columnWidths[widthIndex(index)] }} />
            {index === 6 && <col style={{ width: columnWidths[8] }} />}
          </Fragment>)}</colgroup>
          <thead className="sticky top-0 z-10 bg-[#ffff00] text-black">
            <tr><th scope="col" rowSpan={2} className="relative border-t border-r border-b border-black bg-[#ffff00] px-2 py-2 font-bold">#{resizeHandle(0, 'row number')}</th>
              {COLUMNS.map((column, index) => <Fragment key={column.letter}>{index === 4
              ? <th colSpan={2} className="border-t border-r border-b border-black bg-[#ffff00] px-2 py-2 font-bold">Hours</th>
              : index === 5 ? null
                : <th scope="col" rowSpan={2} className={`relative border-t border-r border-b border-black bg-[#ffff00] px-2 py-2 font-bold ${index === 7 ? 'border-l' : ''}`}>{column.label}{resizeHandle(widthIndex(index), column.label)}</th>}
              {index === 6 && <th rowSpan={2} aria-label="Separator" className="border-t border-black bg-white" />}
              </Fragment>)}</tr>
            <tr><th scope="col" className="relative border-r border-b border-black bg-[#ffff00] px-2 py-1">Lec{resizeHandle(widthIndex(4), 'Lec')}</th>
              <th scope="col" className="relative border-r border-b border-black bg-[#ffff00] px-2 py-1">Lab{resizeHandle(widthIndex(5), 'Lab')}</th></tr>
          </thead>
          <tbody>{rows.map((row, rowIndex) => {
            const rowSelected = !readOnly && (selectedRange?.column === -1
              ? rowIndex >= Math.min(selectedRange.anchor, selectedRange.end) && rowIndex <= Math.max(selectedRange.anchor, selectedRange.end)
              : selectedRow === rowIndex)
            const rangeTop = selectedRange && rowIndex === Math.min(selectedRange.anchor, selectedRange.end)
            const rangeBottom = selectedRange && rowIndex === Math.max(selectedRange.anchor, selectedRange.end)
            return <tr key={rowIndex} data-summary-row={rowIndex} className={rowIndex === rows.length - 1 ? 'bg-[#e3edda] font-semibold' : rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}>
            <th scope="row" tabIndex={readOnly ? -1 : 0} data-summary-row-counter aria-label={`${readOnly ? 'Row' : 'Select row'} ${rowIndex + 1}`} aria-selected={rowSelected}
              className={`relative border-r border-b border-slate-300 px-2 py-2 font-normal text-slate-500 select-none ${rowSelected
                ? `bg-[#62853e]/15 outline-none after:pointer-events-none after:absolute after:left-0 after:-right-px after:top-0 after:-bottom-px after:z-[1] after:border-l-2 after:border-[var(--brand-color)] ${rangeTop || !selectedRange ? 'after:border-t-2' : ''} ${rangeBottom || !selectedRange ? 'after:border-b-2' : ''}`
                : readOnly ? '' : 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-color)]'}`}
              onPointerDown={event => startCellSelection(event, rowIndex, -1)}
              onPointerMove={moveCellSelection}
              onPointerUp={endCellSelection}
              onPointerCancel={endCellSelection}
              onLostPointerCapture={endCellSelection}
              onKeyDown={event => { if (!readOnly && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedCell(null); changeRange(null); setSelectedRow(rowIndex) } }}
            >{rowIndex === rows.length - 1 ? '' : rowIndex + 1}</th>
            {row.map((value, columnIndex) => {
              if (rowIndex === rows.length - 1 && columnIndex > 0 && columnIndex < 4) return null
              const choices = columnIndex === 2 ? REGULARITY_CHOICES : columnIndex === 3 ? EMPLOYMENT_CHOICES : null
              const selected = !readOnly && selectedRange?.column === columnIndex
                && rowIndex >= Math.min(selectedRange.anchor, selectedRange.end)
                && rowIndex <= Math.max(selectedRange.anchor, selectedRange.end)
              const editing = editingCell?.row === rowIndex && editingCell.column === columnIndex
              return <Fragment key={COLUMNS[columnIndex].letter}><td ref={editing && columnIndex === 0 ? facultyCellRef : editing && choices ? choiceCellRef : undefined} data-summary-cell={`${rowIndex}:${columnIndex}`}
                aria-label={`${COLUMNS[columnIndex].label}, row ${rowIndex + 1}`} aria-selected={selected || rowSelected} tabIndex={readOnly || editing ? -1 : 0}
                colSpan={rowIndex === rows.length - 1 && columnIndex === 0 ? 4 : undefined}
                className={`relative h-10 max-w-0 border-r border-b border-slate-300 px-2 py-2 outline-none ${columnIndex === 7 ? 'border-l' : ''} ${selected || rowSelected
                  ? `bg-[#62853e]/15 after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-bottom-px after:border-[var(--brand-color)] ${rowSelected ? `after:-right-px after:z-[1] ${columnIndex === 6 || columnIndex === COLUMNS.length - 1 ? 'after:border-r-2' : ''} ${columnIndex === 7 ? 'after:border-l-2' : ''}` : 'after:border-x-2'} ${rangeTop || !selectedRange ? 'after:border-t-2' : ''} ${rangeBottom || !selectedRange ? 'after:border-b-2' : ''}`
                  : readOnly ? '' : 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-color)]'}`}
                onPointerDown={event => startCellSelection(event, rowIndex, columnIndex)}
                onPointerMove={moveCellSelection}
                onPointerUp={endCellSelection}
                onPointerCancel={endCellSelection}
                onLostPointerCapture={endCellSelection}
                onFocus={() => {
                  if (readOnly || dragRef.current || editingCell) return
                  if (!selectedRange || selectedRange.column !== columnIndex || rowIndex < Math.min(selectedRange.anchor, selectedRange.end) || rowIndex > Math.max(selectedRange.anchor, selectedRange.end)) {
                    changeRange({ column: columnIndex, anchor: rowIndex, end: rowIndex })
                  }
                  setSelectedRow(null)
                  setSelectedCell({ row: rowIndex, column: columnIndex })
                }}
                onDoubleClick={() => beginEditing(rowIndex, columnIndex)}
                onKeyDown={event => {
                  if (editing || readOnly || saving || event.ctrlKey || event.metaKey || event.altKey) return
                  if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); beginEditing(rowIndex, columnIndex) }
                  else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); beginEditing(rowIndex, columnIndex, '') }
                  else if (event.key.length === 1) { event.preventDefault(); beginEditing(rowIndex, columnIndex, event.key) }
                }}>
                {rowIndex === rows.length - 1 && columnIndex === 0 ? 'Total Assigned Load' : editing && choices ? <><input autoFocus ref={choiceInputRef}
                  role="combobox" aria-label={`${COLUMNS[columnIndex].label}, row ${rowIndex + 1}`}
                  aria-autocomplete="list" aria-expanded={true} aria-controls={choiceSuggestionsId}
                  aria-activedescendant={choiceOption >= 0 && choiceMatches[choiceOption] ? `${choiceSuggestionsId}-${choiceOption}` : undefined}
                  value={choiceDraft} onChange={event => {
                    setChoiceDraft(event.target.value)
                    setChoiceQuery(event.target.value)
                    setChoiceOption(0)
                  }}
                  onBlur={() => finishChoice(rowIndex, columnIndex, choices, false)}
                  onKeyDown={event => {
                    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && choiceMatches.length) {
                      event.preventDefault()
                      event.stopPropagation()
                      setChoiceOption(index => event.key === 'ArrowDown'
                        ? (index + 1) % choiceMatches.length : (index + choiceMatches.length) % choiceMatches.length)
                      return
                    }
                    if (event.key !== 'Enter' && event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    if (event.key === 'Escape') finishEditing(false, true)
                    else finishChoice(rowIndex, columnIndex, choices, true, choiceMatches[choiceOption])
                  }}
                  className="block w-full min-w-0 border-0 bg-transparent p-0 text-center text-sm text-slate-900 outline-none" />
                  <ExcelFacultySuggestions id={choiceSuggestionsId} anchor={choiceCellRef} names={choiceMatches}
                    loading={false} activeIndex={choiceOption} label={`${COLUMNS[columnIndex].label} choices`} noun="choices"
                    matchAnchorWidth expandToFit portalTarget={tableRef.current?.closest('dialog')}
                    onSelect={choice => finishChoice(rowIndex, columnIndex, choices, true, choice)} /></>
                  : editing ? <><input autoFocus ref={columnIndex === 0 ? facultyInputRef : undefined}
                  aria-label={`${COLUMNS[columnIndex].label}, row ${rowIndex + 1}`}
                  role={columnIndex === 0 ? 'combobox' : undefined} aria-autocomplete={columnIndex === 0 ? 'list' : undefined}
                  aria-expanded={columnIndex === 0 ? true : undefined}
                  aria-controls={columnIndex === 0 ? facultySuggestionsId : undefined}
                  aria-activedescendant={columnIndex === 0 && facultyOption >= 0 ? `${facultySuggestionsId}-${facultyOption}` : undefined}
                  value={value} onChange={event => {
                    updateCell(rowIndex, columnIndex, event.target.value)
                    if (columnIndex === 0) {
                      setFacultyQuery(event.target.value)
                      setFacultyOption(0)
                    }
                  }}
                  onBlur={() => finishEditing(true, false)}
                  onKeyDown={event => {
                    if (columnIndex === 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && facultyMatches.length) {
                      event.preventDefault()
                      event.stopPropagation()
                      setFacultyOption(index => event.key === 'ArrowDown'
                        ? (index + 1) % facultyMatches.length : (index + facultyMatches.length) % facultyMatches.length)
                      return
                    }
                    if (event.key !== 'Enter' && event.key !== 'Escape') return
                    event.preventDefault()
                    event.stopPropagation()
                    if (event.key === 'Enter' && columnIndex === 0 && facultyOption >= 0 && facultyMatches[facultyOption]) {
                      updateCell(rowIndex, columnIndex, facultyMatches[facultyOption])
                    }
                    finishEditing(event.key === 'Enter', true)
                  }}
                  className="block w-full min-w-0 border-0 bg-transparent p-0 text-center text-sm text-slate-900 outline-none" />
                  {columnIndex === 0 && <ExcelFacultySuggestions id={facultySuggestionsId} anchor={facultyCellRef}
                    names={facultyMatches} loading={false}
                    statusMessage={facultyDirectory.loading ? 'Loading department instructors…' : facultyDirectory.error}
                    matchAnchorWidth expandToFit portalTarget={tableRef.current?.closest('dialog')}
                    activeIndex={facultyOption} onSelect={name => {
                      updateCell(rowIndex, columnIndex, name)
                      finishEditing(true, true)
                    }} />}</>
                  : <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{columnIndex === 6 && value.trim() && Number.isFinite(Number(value))
                    ? Number(value).toFixed(2) : value}</span>}
              </td>{columnIndex === 6 && <td aria-hidden="true" className="border-0 bg-white" />}</Fragment>
            })}</tr>})}</tbody>
        </table>
      </div>
    </>}
    <WorkbookSlot host={footerHost} active={active}><div className="min-w-0 flex-1 text-sm text-rose-700">{error}</div></WorkbookSlot>
    {menuHost && createPortal(menu, menuHost)}
    {rowMenu && <div ref={rowMenuRef} role="menu" aria-label="Cell actions" onContextMenu={event => event.preventDefault()}
      className="fixed z-50 flex w-44 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
      style={{ left: rowMenu.x, top: rowMenu.y }} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setRowMenu(null); rowMenu.target.focus({ preventScroll: true }) }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
        }
        else if (event.key === 'Tab') setRowMenu(null)
      }}>
      <button autoFocus type="button" role="menuitem" onClick={() => { void copySelection() }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Copy</button>
      <button type="button" role="menuitem" disabled={readOnly || saving} onClick={() => { void pasteFromClipboard() }} className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] disabled:cursor-not-allowed disabled:text-slate-400">Paste</button>
      <button type="button" role="menuitem" disabled={readOnly || saving || rows.length >= 1000 || Math.max(selectedRange?.anchor ?? rowMenu.row, selectedRange?.end ?? rowMenu.row) >= rows.length - 1} onClick={() => changeRow('add')} className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] disabled:cursor-not-allowed disabled:text-slate-400">Add row</button>
      <button type="button" role="menuitem" disabled={readOnly || saving || Math.max(selectedRange?.anchor ?? rowMenu.row, selectedRange?.end ?? rowMenu.row) >= rows.length - 1 || rows.length - (Math.abs((selectedRange?.end ?? rowMenu.row) - (selectedRange?.anchor ?? rowMenu.row)) + 1) < 2} onClick={() => changeRow('delete')} className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] disabled:cursor-not-allowed disabled:text-slate-400">Delete row</button>
    </div>}
  </section>
})
