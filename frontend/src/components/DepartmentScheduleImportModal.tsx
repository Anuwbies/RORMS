import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent as ReactClipboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { SCHEDULE_HEADER_GROUPS } from '../utils/excelScheduleTemplate'
import { createEmptyDepartmentScheduleSheet, readDepartmentScheduleImport, type DepartmentScheduleImportRow, type DepartmentScheduleImportSheet } from '../utils/departmentScheduleImport'
import { defaultRowCounterWidth, headerResizeScrollStep, headerTextMinimumWidth, resizeHeaderColumns, rowNumberMinimumWidth, type HeaderWidthConstraint } from '../utils/headerColumnWidths'
import { CELL_UNDO_COOLDOWN_MS, CellTextHistory, sameEditCell, type CellEditLocation, type CellHistoryCheckpoint } from '../utils/cellTextHistory'
import { clampColumnSelectionToYear, isColumnCellSelected, scheduleSelectionYearBounds, type ColumnCellSelection } from '../utils/columnCellSelection'
import { applyScheduleCellValues, completeScheduleTimeText, filterScheduleEditableChanges, indexScheduleRows, linkScheduleCourseChanges, normalizeScheduleCellText, type ScheduleCellValueChange } from '../utils/departmentScheduleEdits'
import { DepartmentScheduleImportTableBody, type ScheduleCellActions } from './DepartmentScheduleImportTableBody'
import { SCHEDULE_CELL_CLIPBOARD_TYPE, planScheduleCellPaste, readScheduleCellClipboard, readScheduleCourseClipboard, scheduleClipboardText, type ScheduleCellClipboard } from '../utils/scheduleCellClipboard'
import { UploadIcon } from './Icons'
import { SCHEDULE_ROW_CLIPBOARD_TYPE, planScheduleRowPaste, readScheduleRowClipboard, sameScheduleClipboardText, scheduleRowClipboardText, type ScheduleRowClipboard } from '../utils/scheduleCellClipboard'
import { SCHEDULE_COLUMN_COUNT } from '../utils/excelScheduleTemplate'
import { changeDepartmentScheduleRows, toggleDepartmentScheduleYearVisibility } from '../utils/departmentScheduleRowActions'
import { ScheduleRowCountModal } from './ScheduleRowCountModal'
import { Button } from './Button'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { loadFirestoreDepartmentWorkbook, saveFirestoreDepartmentWorkbook, type LoadedFirestoreDepartmentWorkbook, type SavedFirestoreDepartmentWorkbook } from '../services/firestoreDepartmentWorkbooks'
import { createDepartmentScheduleWorkbookState, readDepartmentScheduleWorkbookState, type DepartmentScheduleWorkbookState } from '../utils/departmentScheduleWorkbookState'
import { loadDepartmentScheduleDirectory, subscribeDepartmentRoomSchedules } from '../services/departmentScheduleRows'
import type { ScheduleDirectory } from '../utils/excelScheduleRows'
import { parseDepartmentScheduleImportRows, extractDepartmentScheduleImportRows } from '../utils/departmentScheduleImportRows'
import { departmentFacultyScheduleAssignments, facultyScheduleRowKey, type FacultySubjectAssignment } from '../utils/ScheduleValidation'
import { useExcelValidationTooltip } from './ExcelValidationTooltip'
import { loadDepartmentCourseSuggestions } from '../services/firestoreDepartmentCourses'
import type { DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'
import { hasDepartmentScheduleChanges, type DepartmentScheduleSaveBaseline } from '../utils/departmentScheduleSaveStatus'
import { useLiveDepartmentWorkbook } from '../hooks/useLiveDepartmentWorkbook'
import { mergeDepartmentSchedule } from '../utils/mergeDepartmentSchedule'
import { recommendScheduleRooms } from '../utils/scheduleRoomRecommendations'
import { recommendInstructorScheduleOptions } from '../utils/instructorScheduleRecommendations'

interface DepartmentScheduleImportModalProps {
  onClose: () => void
  term?: DepartmentWorkbookTerm
  readOnly?: boolean
}

// The reference groups both Lec/Lab/Total sets beneath one Units heading.
const DISPLAY_HEADER_GROUPS = SCHEDULE_HEADER_GROUPS.filter(group => group.offset !== 8)
  .map(group => group.offset === 5
    ? { ...group, width: 6, children: ['Lec', 'Lab', 'Total', 'Lec', 'Lab', 'Total'] }
    : group)

const DATA_COLUMN_LABELS = DISPLAY_HEADER_GROUPS.flatMap(group => group.children.length
  ? group.children.map((label, index) => `${group.label} ${label} ${index + 1}`)
  : [group.label])
const EMPTY_ROWS: DepartmentScheduleImportRow[] = []

export function DepartmentScheduleImportModal({ onClose, term, readOnly = false }: DepartmentScheduleImportModalProps) {
  const titleId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [initialWorkbook] = useState(() => {
    const sheets = [createEmptyDepartmentScheduleSheet()]
    return { sheets, indexes: indexScheduleRows(sheets) }
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const historyRef = useRef(new CellTextHistory())
  const historyTimerRef = useRef<number | null>(null)
  const copiedCellsRef = useRef<{ cells: ScheduleCellClipboard; text: string } | null>(null)
  const copiedRowsRef = useRef<{ rows: ScheduleRowClipboard; text: string } | null>(null)
  const editSessionRef = useRef<{ cell: CellEditLocation; originals: { cell: CellEditLocation; value: string }[]; pairedOriginals: { cell: CellEditLocation; value: string }[]; checkpoint: CellHistoryCheckpoint; hasTyped: boolean } | null>(null)
  const selectionDragRef = useRef<ColumnCellSelection | null>(null)
  const selectionRef = useRef<ColumnCellSelection | null>(null)
  const selectionFrameRef = useRef<number | null>(null)
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null)
  const sheetsRef = useRef<DepartmentScheduleImportSheet[]>(initialWorkbook.sheets)
  const rowIndexesRef = useRef<ReadonlyMap<number, number>[]>(initialWorkbook.indexes)
  const headerConstraintsRef = useRef<HeaderWidthConstraint[]>([])
  const resizeRef = useRef<{ x: number; pointerX: number; scrollLeft: number; lastDelta: number; start: number; count: number; widths: number[] } | null>(null)
  const [columnWidths, setColumnWidths] = useState<number[] | null>(null)
  const [sheets, setSheets] = useState<DepartmentScheduleImportSheet[]>(initialWorkbook.sheets)
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [selection, setSelection] = useState<ColumnCellSelection | null>(null)
  const [loading, setLoading] = useState(Boolean(term))
  const [saving, setSaving] = useState(false)
  const [cellEditing, setCellEditing] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [mergeBlocked, setMergeBlocked] = useState(false)
  const liveResolutionRef = useRef<'remote' | 'merge' | 'local'>('remote')
  const [saveDuration, setSaveDuration] = useState<number | null>(null)
  const [saveBaseline, setSaveBaseline] = useState<DepartmentScheduleSaveBaseline>({
    sheets: initialWorkbook.sheets, columnWidths: null, file: null, persisted: false,
  })
  const hasUnsavedChanges = useMemo(() => hasDepartmentScheduleChanges(saveBaseline, sheets, columnWidths, file),
    [saveBaseline, sheets, columnWidths, file])
  const hasLocalEdits = useMemo(() => hasDepartmentScheduleChanges({ ...saveBaseline, persisted: true }, sheets, columnWidths, file),
    [saveBaseline, sheets, columnWidths, file])
  const savingRef = useRef(false)
  const savedRef = useRef<SavedFirestoreDepartmentWorkbook | null>(null)
  const storedStateRef = useRef<Pick<DepartmentScheduleWorkbookState, 'snapshot' | 'ownedNames'> | undefined>(undefined)
  const [storageReady, setStorageReady] = useState(!term)
  const [storedFileName, setStoredFileName] = useState('')
  const [storageStatus, setStorageStatus] = useState('')
  const [storageError, setStorageError] = useState('')
  const [error, setError] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: HTMLTableCellElement; yearStart?: number } | null>(null)
  const [yearRenameRequest, setYearRenameRequest] = useState<{ sheet: number; start: number; id: number }>()
  const [rowCountModal, setRowCountModal] = useState<{ sheet: number; start: number; label: string; target: HTMLTableCellElement } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [contextPasteText, setContextPasteText] = useState<string | null>(null)
  const [validationDirectory, setValidationDirectory] = useState<ScheduleDirectory | null>(null)
  const [validationError, setValidationError] = useState('')
  const [validationMessages, setValidationMessages] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const roomAssignmentsRef = useRef<readonly FacultySubjectAssignment[]>([])
  const roomAssignmentsSheetsRef = useRef<readonly DepartmentScheduleImportSheet[] | null>(null)
  const [courseSuggestions, setCourseSuggestions] = useState<readonly DepartmentCourseSuggestion[] | null>(null)
  const [courseSuggestionError, setCourseSuggestionError] = useState('')

  useEffect(() => {
    let cancelled = false
    setCourseSuggestionError('')
    setCourseSuggestions(null)
    if (!term?.departmentId) { setCourseSuggestions([]); return }
    void loadDepartmentCourseSuggestions(term).then(courses => {
      if (!cancelled) setCourseSuggestions(courses)
    }).catch(() => {
      if (!cancelled) setCourseSuggestionError('Department courses could not load. Reopen the workbook to retry.')
    })
    return () => { cancelled = true }
  }, [term?.departmentId, term?.departmentCode])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    setValidationDirectory(null)
    roomAssignmentsRef.current = []
    setValidationMessages(new Map())
    setValidationError('')
    void loadDepartmentScheduleDirectory(term?.departmentCode ?? '', term).then(directory => {
      if (cancelled) return
      setValidationDirectory(directory)
      if (term) unsubscribe = subscribeDepartmentRoomSchedules(term, directory.rooms, externalRoomAssignments => {
        if (!cancelled) {
          setValidationDirectory(previous => previous ? { ...previous, externalRoomAssignments } : previous)
          setValidationError('')
        }
      }, () => {
        if (!cancelled) setValidationError('Validation could not load other departments’ room schedules. Reopen the workbook to retry.')
      })
    }).catch(() => {
      if (!cancelled) setValidationError('Validation could not load the instructor directory, rooms, or other departments’ schedules. Reopen the workbook to retry.')
    })
    return () => { cancelled = true; unsubscribe?.() }
  }, [term?.departmentId, term?.departmentCode, term?.membershipId, term?.academicYearId, term?.academicYear, term?.semester])

  useEffect(() => {
    if (!validationDirectory) return
    const timer = window.setTimeout(() => {
      const rows = parseDepartmentScheduleImportRows(sheets, validationDirectory, term?.departmentId ? courseSuggestions ?? undefined : undefined)
      roomAssignmentsRef.current = departmentFacultyScheduleAssignments(rows, validationDirectory)
      roomAssignmentsSheetsRef.current = sheets
      const next = new Map(rows.filter(row => row.validationIssues.length)
        .map(row => [facultyScheduleRowKey(row.sourceSheet, row.sourceRow), row.validationIssues] as const))
      setValidationMessages(previous => new Map([...next].map(([key, messages]) => {
        const before = previous.get(key)
        return [key, before?.length === messages.length && before.every((message, index) => message === messages[index]) ? before : messages]
      })))
    }, 150)
    return () => window.clearTimeout(timer)
  }, [sheets, validationDirectory, courseSuggestions, term?.departmentId])

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !contextMenuRef.current?.contains(event.target)) setContextMenu(null)
    }
    const dismissOnResize = () => setContextMenu(null)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', dismissOnResize)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', dismissOnResize)
    }
  }, [contextMenu])

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
      if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
      resizeRef.current = null
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
      dialog?.close()
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (!term) return
    let cancelled = false
    setLoading(true)
    setStorageReady(false)
    setStorageError('')
    setStorageStatus('Opening saved workbook…')
    savedRef.current = null
    roomAssignmentsRef.current = []
    storedStateRef.current = undefined
    setStoredFileName('')
    setFile(null)
    setSaveDuration(null)
    setMergeBlocked(false)
    setSaveBaseline({ sheets: initialWorkbook.sheets, columnWidths: null, file: null, persisted: false })
    sheetsRef.current = initialWorkbook.sheets
    rowIndexesRef.current = initialWorkbook.indexes
    setSheets(initialWorkbook.sheets)
    setSelectedSheet(0)
    setColumnWidths(null)
    historyRef.current.reset()
    editSessionRef.current = null
    setCellEditing(false)
    selectionRef.current = null
    setSelection(null)
    void loadFirestoreDepartmentWorkbook(term, message => {
      if (!cancelled) setStorageStatus(message)
    }).then(saved => {
      if (cancelled) return
      if (saved) {
        const loaded = readDepartmentScheduleWorkbookState(saved.editorState)
        savedRef.current = saved
        storedStateRef.current = loaded
        setStoredFileName(saved.fileName)
        sheetsRef.current = loaded.sheets
        rowIndexesRef.current = indexScheduleRows(loaded.sheets)
        setSheets(loaded.sheets)
        setSelectedSheet(loaded.selectedSheet)
        setColumnWidths(loaded.columnWidths)
        setSaveBaseline({ sheets: loaded.sheets, columnWidths: loaded.columnWidths, file: null, persisted: true })
      }
      setStorageReady(true)
      setStorageStatus('')
    }).catch(caught => {
      if (!cancelled) {
        setStorageStatus('')
        setStorageError(caught instanceof Error ? caught.message : 'The saved workbook could not be opened. Reopen it before saving.')
      }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [term?.departmentId, term?.departmentCode, term?.academicYearId, term?.academicYear, term?.semester, term?.membershipId])

  useEffect(() => {
    if (!file) return
    roomAssignmentsRef.current = []
    let cancelled = false
    setLoading(true)
    setError('')
    setStorageStatus('')
    setSheets([])
    sheetsRef.current = []
    rowIndexesRef.current = []
    setSelectedSheet(0)
    setColumnWidths(null)
    resizeRef.current = null
    headerConstraintsRef.current = []
    historyRef.current.reset()
    if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = null
    editSessionRef.current = null
    setCellEditing(false)
    setSelection(null)
    selectionRef.current = null
    selectionDragRef.current = null
    selectionPointerRef.current = null
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    selectionFrameRef.current = null
    const load = async () => {
      try {
        if (!/\.xlsx$/i.test(file.name)) throw new Error('Please choose an .xlsx file.')
        const data = await file.arrayBuffer()
        if (cancelled) return
        const workbook = XLSX.read(data, { type: 'array' })
        const matchingSheets = readDepartmentScheduleImport(workbook)
        if (!matchingSheets.length) {
          throw new Error('No worksheet matches the required two-row headers. Include all 21 columns from College through F2F Room, with the Lec, Lab, and Total subheaders in the order shown below.')
        }
        if (!cancelled) {
          sheetsRef.current = matchingSheets
          rowIndexesRef.current = indexScheduleRows(matchingSheets)
          setSheets(matchingSheets)
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'This workbook could not be read. Choose a valid .xlsx file.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [file])

  const sheet = sheets[selectedSheet]
  const visibleRows = sheet?.rows ?? EMPTY_ROWS
  const rowIssues = useMemo(() => new Map(visibleRows.flatMap(row => {
    const messages = validationMessages.get(facultyScheduleRowKey(sheet?.name ?? '', row.rowNumber))
    return messages ? [[row.rowNumber, messages] as const] : []
  })), [visibleRows, sheet?.name, validationMessages])
  const { showValidationTooltip, hideValidationTooltip, validationTooltip } = useExcelValidationTooltip(
    range => rowIssues.get(visibleRows[range.s.r]?.rowNumber) ?? [],
    range => rowIssues.get(visibleRows[range.s.r]?.rowNumber)?.every(message => message.startsWith('Duplicate Subject ')) ? 'purple' : 'danger', dialogRef.current)

  useEffect(() => { hideValidationTooltip() }, [selectedSheet, loading, contextMenu, rowCountModal, hideValidationTooltip])

  const showRowValidationTooltip = (target: EventTarget | null) => {
    if (!(target instanceof Element) || selectionDragRef.current || contextMenu || rowCountModal) return
    const cell = target.closest<HTMLTableCellElement>('td[data-edit-cell], th[data-row-counter]')
    if (!cell) { hideValidationTooltip(); return }
    const row = Number(cell.closest<HTMLTableRowElement>('tr[data-row-index]')?.dataset.rowIndex)
    showValidationTooltip({ s: { r: row, c: 0 }, e: { r: row, c: 20 } }, cell)
  }

  const changeSelection = useCallback((next: ColumnCellSelection | null) => {
    const previous = selectionRef.current
    if (previous === next || previous && next && previous.sheet === next.sheet && previous.column === next.column
      && previous.anchor === next.anchor && previous.end === next.end) return
    selectionRef.current = next
    setSelection(next)
  }, [])

  const startSelection = useCallback((event: ReactPointerEvent<HTMLTableCellElement>, sheetIndex: number, column: number, rowIndex: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    const selection = selectionRef.current
    const extend = event.shiftKey && selection?.sheet === sheetIndex && selection.column === column
    const sheet = sheetsRef.current[sheetIndex]
    const next = clampColumnSelectionToYear({ sheet: sheetIndex, column, anchor: extend ? selection.anchor : rowIndex, end: rowIndex }, sheet?.yearSections, sheet?.rows.length ?? 0)
    selectionDragRef.current = next
    if (extend || !isColumnCellSelected(selection, sheetIndex, column, rowIndex)) changeSelection(next)
    if (next.end === rowIndex) event.currentTarget.focus({ preventScroll: true })
    else {
      const rowNumber = sheet.rows[next.end].rowNumber
      const selector = column === -1 ? `th[data-row-counter][data-source-row="${rowNumber}"]` : `td[data-edit-cell="${sheetIndex}:${rowNumber}:${column}"]`
      tableRef.current?.querySelector<HTMLTableCellElement>(selector)?.focus({ preventScroll: true })
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [changeSelection])

  const updateSelection = useCallback(() => {
    selectionFrameRef.current = null
    const drag = selectionDragRef.current
    const pointer = selectionPointerRef.current
    selectionPointerRef.current = null
    if (!drag || !pointer) return
    const row = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLTableRowElement>('tr[data-row-index]')
    if (!row || !tableRef.current?.contains(row)) return
    const rowIndex = Number(row.dataset.rowIndex)
    const sheet = sheetsRef.current[drag.sheet]
    const next = clampColumnSelectionToYear({ ...drag, end: rowIndex }, sheet?.yearSections, sheet?.rows.length ?? 0)
    if (next.end === drag.end) return
    selectionDragRef.current = next
    changeSelection(next)
  }, [changeSelection])

  const moveSelection = useCallback((event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (!selectionDragRef.current) return
    selectionPointerRef.current = { x: event.clientX, y: event.clientY }
    if (selectionFrameRef.current === null) selectionFrameRef.current = requestAnimationFrame(updateSelection)
  }, [updateSelection])

  const endSelection = useCallback(() => {
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    updateSelection()
    selectionDragRef.current = null
  }, [updateSelection])

  const focusCell = useCallback((sheetIndex: number, column: number, rowIndex: number) => {
    if (!selectionDragRef.current && !isColumnCellSelected(selectionRef.current, sheetIndex, column, rowIndex)) {
      changeSelection({ sheet: sheetIndex, column, anchor: rowIndex, end: rowIndex })
    }
  }, [changeSelection])

  const readCellValue = useCallback((cell: CellEditLocation): string => {
    const rowIndex = rowIndexesRef.current[cell.sheet]?.get(cell.row)
    return rowIndex === undefined ? '' : sheetsRef.current[cell.sheet]?.rows[rowIndex]?.values[cell.column] ?? ''
  }, [])

  const selectedCellValues = useCallback((cell: CellEditLocation): ScheduleCellValueChange[] => {
    const rows = sheetsRef.current[cell.sheet]?.rows ?? EMPTY_ROWS
    const values = [{ cell, value: readCellValue(cell) }]
    const selection = selectionRef.current
    if (selection?.sheet !== cell.sheet || selection.column !== cell.column) return values
    const first = Math.max(0, Math.min(selection.anchor, selection.end))
    const last = Math.min(rows.length - 1, Math.max(selection.anchor, selection.end))
    for (let index = first; index <= last; index++) {
      const row = rows[index]
      if (row.rowNumber !== cell.row) values.push({ cell: { ...cell, row: row.rowNumber }, value: row.values[cell.column] })
    }
    return filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current, values)
  }, [readCellValue])

  const applyCellValues = useCallback((changes: readonly ScheduleCellValueChange[]) => {
    const current = sheetsRef.current
    const next = applyScheduleCellValues(current, rowIndexesRef.current, changes)
    if (next === current) return
    sheetsRef.current = next
    setSheets(next)
  }, [])

  const updateCell = useCallback((cell: CellEditLocation, after: string) => {
    after = normalizeScheduleCellText(cell.column, after)
    const session = editSessionRef.current
    const targets = filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current,
      session && sameEditCell(cell, session.cell) ? session.originals : [{ cell, value: readCellValue(cell) }])
    const changes = targets.map(target => ({
      cell: target.cell,
      before: readCellValue(target.cell),
    }))
    if (changes.every(change => change.before === after) && !((cell.column === 2 || cell.column === 3) && !after.trim())) return
    if (session) session.hasTyped = true
    if ((cell.column === 2 || cell.column === 3) && !after.trim()) {
      const linked = linkScheduleCourseChanges(sheetsRef.current, rowIndexesRef.current,
        changes.map(change => ({ cell: change.cell, value: after })), [], false)
      historyRef.current.recordChanges(linked.map(change => ({ cell: change.cell, before: readCellValue(change.cell), after: change.value })))
      applyCellValues(linked)
      return
    }
    historyRef.current.recordTyping(changes, after)
    if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = window.setTimeout(() => {
      historyRef.current.flushPending()
      historyTimerRef.current = null
    }, CELL_UNDO_COOLDOWN_MS)
    applyCellValues(changes.map(change => ({ cell: change.cell, value: after })))
  }, [applyCellValues, readCellValue])

  const flushTypingGroup = useCallback(() => {
    if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
    historyTimerRef.current = null
    historyRef.current.flushPending()
  }, [])

  const beginCellEditing = useCallback((cell: CellEditLocation) => {
    flushTypingGroup()
    const originals = selectedCellValues(cell)
    const pairedOriginals = cell.column === 2 || cell.column === 3 ? originals.map(original => {
      const paired = { ...original.cell, column: cell.column === 2 ? 3 : 2 }
      return { cell: paired, value: readCellValue(paired) }
    }) : []
    editSessionRef.current = { cell, originals, pairedOriginals, checkpoint: historyRef.current.checkpoint(), hasTyped: false }
    setCellEditing(true)
  }, [flushTypingGroup, selectedCellValues, readCellValue])

  const finishCellEditing = useCallback((cell: CellEditLocation, save: boolean) => {
    const session = editSessionRef.current
    if (!session || !sameEditCell(cell, session.cell)) return
    if (!save) {
      if (historyTimerRef.current !== null) window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
      historyRef.current.restore(session.checkpoint)
      applyCellValues([...session.originals, ...session.pairedOriginals])
    } else {
      flushTypingGroup()
      const isTime = cell.column === 15 || cell.column === 16
      const value = isTime ? completeScheduleTimeText(readCellValue(cell)) : readCellValue(cell)
      const changes = session.originals.map(original => ({ cell: original.cell,
        before: readCellValue(original.cell) }))
      if ((!session.hasTyped || isTime) && changes.some(change => change.before !== value)) {
        historyRef.current.recordMany(changes, value)
        applyCellValues(changes.map(change => ({ cell: change.cell, value })))
      }
    }
    editSessionRef.current = null
    setCellEditing(false)
  }, [applyCellValues, flushTypingGroup, readCellValue])

  const applyLiveWorkbook = useCallback((saved: LoadedFirestoreDepartmentWorkbook) => {
    const resolution = liveResolutionRef.current
    liveResolutionRef.current = 'remote'
    // Parse first so an invalid remote workbook never removes the local draft.
    let loaded: DepartmentScheduleWorkbookState
    try {
      loaded = readDepartmentScheduleWorkbookState(saved.editorState)
    } catch (caught) {
      setStorageError(caught instanceof Error ? caught.message : 'The updated workbook could not be opened. Your edits have been kept.')
      return
    }
    if (resolution !== 'remote' && editSessionRef.current) finishCellEditing(editSessionRef.current.cell, true)
    let nextSheets = loaded.sheets, nextWidths = loaded.columnWidths, conflicts = 0
    if (resolution === 'merge') {
      const merged = mergeDepartmentSchedule({ sheets: [...saveBaseline.sheets], columnWidths: saveBaseline.columnWidths ? [...saveBaseline.columnWidths] : null },
        { sheets: sheetsRef.current, columnWidths }, loaded)
      if (merged.structuralConflict || file !== saveBaseline.file) {
        setMergeBlocked(true)
        setStorageError('The workbook layout or imported file changed. Keep my workbook retains your entire draft; saving it replaces the other version.')
        return
      }
      nextSheets = merged.sheets
      nextWidths = merged.columnWidths
      conflicts = merged.conflicts
    } else if (resolution === 'local') {
      nextSheets = sheetsRef.current
      nextWidths = columnWidths
    }
    const viewedName = sheetsRef.current[selectedSheet]?.name
    const viewedIndex = nextSheets.findIndex(item => item.name === viewedName)
    flushTypingGroup()
    historyRef.current.reset()
    editSessionRef.current = null
    setCellEditing(false)
    selectionRef.current = null
    selectionDragRef.current = null
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    selectionFrameRef.current = null
    setSelection(null)
    setContextMenu(null)
    setYearRenameRequest(undefined)
    setRowCountModal(null)
    savedRef.current = saved
    storedStateRef.current = loaded
    roomAssignmentsRef.current = []
    sheetsRef.current = nextSheets
    rowIndexesRef.current = indexScheduleRows(nextSheets)
    setFile(resolution === 'local' ? file : null)
    setStoredFileName(saved.fileName)
    setSheets(nextSheets)
    setSelectedSheet(viewedIndex >= 0 ? viewedIndex : Math.min(loaded.selectedSheet, nextSheets.length - 1))
    setColumnWidths(nextWidths)
    setSaveBaseline({ sheets: loaded.sheets, columnWidths: loaded.columnWidths, file: null, persisted: true })
    setSaveDuration(null)
    setError('')
    setStorageError('')
    setMergeBlocked(false)
    setStorageStatus(resolution === 'local' ? 'Kept your workbook. Save to replace the latest saved version.'
      : resolution === 'merge' ? `Merged the latest workbook and kept your edits.${conflicts ? ` Your values were kept for ${conflicts} conflict${conflicts === 1 ? '' : 's'}.` : ''}`
        : 'Updated with the latest saved workbook.')
  }, [selectedSheet, flushTypingGroup, finishCellEditing, saveBaseline, columnWidths, file])

  const liveWorkbook = useLiveDepartmentWorkbook(term, loading || saving || !storageReady,
    () => term ? loadFirestoreDepartmentWorkbook(term) : Promise.resolve(null),
    () => savedRef.current?.revision ?? 0, applyLiveWorkbook)
  const pendingLiveUpdate = liveWorkbook.update?.isCurrent?.() ? liveWorkbook.update : undefined
  const resolveLiveUpdate = (resolution: 'remote' | 'merge' | 'local') => {
    if (!pendingLiveUpdate?.isCurrent?.()) return
    liveResolutionRef.current = resolution
    pendingLiveUpdate.onApplied()
  }

  useEffect(() => {
    if (!pendingLiveUpdate || loading || saving || !storageReady || hasLocalEdits || cellEditing || resizing || contextMenu || rowCountModal || yearRenameRequest) return
    // Check synchronous edit/save refs too, in case an input event preceded this effect.
    if (editSessionRef.current || savingRef.current || resizeRef.current || sheetsRef.current !== sheets) return
    pendingLiveUpdate.onApplied()
  }, [pendingLiveUpdate, loading, saving, storageReady, hasLocalEdits, cellEditing, resizing, contextMenu, rowCountModal, yearRenameRequest, sheets])

  const saveWorkbook = async () => {
    if (!term || readOnly || loading || savingRef.current || !storageReady || !sheetsRef.current.length || pendingLiveUpdate) return
    const editing = editSessionRef.current
    if (editing) finishCellEditing(editing.cell, true)
    flushTypingGroup()
    setContextMenu(null)
    savingRef.current = true
    setSaving(true)
    setStorageError('')
    setStorageStatus('Preparing workbook…')
    const startedAt = performance.now()
    const savingSheets = sheetsRef.current
    try {
      const state = createDepartmentScheduleWorkbookState(savingSheets, selectedSheet, columnWidths, storedStateRef.current)
      const [directory, courses] = await Promise.all([
        loadDepartmentScheduleDirectory(term.departmentCode, term), loadDepartmentCourseSuggestions(term),
      ])
      setValidationDirectory(directory)
      setValidationError('')
      setCourseSuggestions(courses)
      setCourseSuggestionError('')
      const scheduleRows = extractDepartmentScheduleImportRows(state.snapshot, state.ownedNames, savingSheets, directory, courses)
      const saved = await saveFirestoreDepartmentWorkbook(term, file?.name ?? (storedFileName || 'Department Schedule.xlsx'),
        state.editorState, savedRef.current, { scheduleRows, scheduleCollection: 'schedules', scheduleStatus: 'Draft', onProgress: progress => {
          setStorageStatus(progress.stage === 'preparing' ? 'Preparing workbook…'
            : progress.stage === 'cleaning' ? 'Finishing save…' : 'Saving workbook…')
        } })
      savedRef.current = saved
      storedStateRef.current = state
      setStoredFileName(saved.fileName)
      setSaveDuration(performance.now() - startedAt)
      setSaveBaseline({ sheets: savingSheets, columnWidths, file, persisted: true })
      setStorageStatus(saved.cleanupWarning ? `Workbook saved. ${saved.cleanupWarning}` : 'Workbook saved.')
    } catch (caught) {
      setStorageStatus('')
      setStorageError(caught instanceof Error ? caught.message : 'The workbook could not be saved. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const renameYear = useCallback((sheetIndex: number, start: number, value: string) => {
    setYearRenameRequest(undefined)
    const before = sheetsRef.current[sheetIndex]
    const section = before?.yearSections?.find(item => item.start === start)
    const label = value.trim()
    if (!section || !label || section.label === label) return
    flushTypingGroup()
    const after = { ...before, yearSections: before.yearSections?.map(item => item === section ? { ...item, label } : item) }
    historyRef.current.recordStructure({ sheet: sheetIndex, row: before.rows[start].rowNumber, column: 0 }, before, after)
    const next = [...sheetsRef.current]
    next[sheetIndex] = after
    sheetsRef.current = next
    setSheets(next)
  }, [flushTypingGroup])

  const chooseCourse = useCallback((cell: CellEditLocation, course: Pick<DepartmentCourseSuggestion, 'code' | 'title'>) => {
    const session = editSessionRef.current
    const targets = session && sameEditCell(cell, session.cell) ? session.originals : selectedCellValues(cell)
    const changes = targets.flatMap(target => [
      { cell: { ...target.cell, column: 2 }, before: readCellValue({ ...target.cell, column: 2 }), after: normalizeScheduleCellText(2, course.code) },
      { cell: { ...target.cell, column: 3 }, before: readCellValue({ ...target.cell, column: 3 }), after: course.title },
    ]).filter(change => change.before !== change.after)
    if (!changes.length) return
    flushTypingGroup()
    historyRef.current.recordChanges(changes)
    applyCellValues(changes.map(change => ({ cell: change.cell, value: change.after })))
    if (session) session.hasTyped = true
  }, [selectedCellValues, readCellValue, flushTypingGroup, applyCellValues])

  const currentScheduleAssignments = useCallback(() => {
    if (!validationDirectory) return []
    if (!roomAssignmentsRef.current.length || roomAssignmentsSheetsRef.current !== sheetsRef.current) {
      const rows = parseDepartmentScheduleImportRows(sheetsRef.current, validationDirectory)
      roomAssignmentsRef.current = departmentFacultyScheduleAssignments(rows, validationDirectory)
      roomAssignmentsSheetsRef.current = sheetsRef.current
    }
    return roomAssignmentsRef.current
  }, [validationDirectory])

  const recommendRooms = useCallback((cell: CellEditLocation, entryIndex: number) => {
    const name = sheetsRef.current[cell.sheet]?.name
    return name && validationDirectory ? recommendScheduleRooms(currentScheduleAssignments(), validationDirectory.rooms,
      facultyScheduleRowKey(name, cell.row), cell.column, entryIndex) : []
  }, [currentScheduleAssignments, validationDirectory])

  const recommendMeetingSlots = useCallback((cell: CellEditLocation) => {
    const name = sheetsRef.current[cell.sheet]?.name, value = readCellValue(cell)
    if (!name) return null
    return recommendInstructorScheduleOptions(currentScheduleAssignments(), facultyScheduleRowKey(name, cell.row), cell.column, value)
  }, [currentScheduleAssignments, readCellValue])

  const cellActions = useMemo<ScheduleCellActions>(() => ({
    startSelection, moveSelection, endSelection, focusCell,
    beginEditing: beginCellEditing, updateCell, finishEditing: finishCellEditing, renameYear, chooseCourse, recommendRooms, recommendMeetingSlots,
  }), [startSelection, moveSelection, endSelection, focusCell, beginCellEditing, updateCell, finishCellEditing, renameYear, chooseCourse, recommendRooms, recommendMeetingSlots])

  const copySelectionToClipboard = useCallback((clipboard: Pick<DataTransfer, 'setData'>) => {
    const selection = selectionRef.current
    if (!selection) return
    const rows = sheetsRef.current[selection.sheet]?.rows ?? EMPTY_ROWS
    const first = Math.min(selection.anchor, selection.end)
    const last = Math.max(selection.anchor, selection.end)
    if (selection.column === -1) {
      const copied: ScheduleRowClipboard = { version: 1, rows: rows.slice(first, last + 1).map(row => [...row.values]) }
      if (!copied.rows.length) return
      const text = scheduleRowClipboardText(copied.rows)
      clipboard.setData('text/plain', text)
      try { clipboard.setData(SCHEDULE_ROW_CLIPBOARD_TYPE, JSON.stringify(copied)) } catch { /* Plain text fallback is remembered locally. */ }
      copiedRowsRef.current = { rows: copied, text }
      copiedCellsRef.current = null
      return
    }
    const values = rows.slice(first, last + 1).map(row => row.values[selection.column])
    if (!values.length) return
    const cells: ScheduleCellClipboard = { version: 1, column: selection.column, values }
    const text = scheduleClipboardText(values)
    clipboard.setData('text/plain', text)
    // Plain text remains available when copying into other applications.
    try { clipboard.setData(SCHEDULE_CELL_CLIPBOARD_TYPE, JSON.stringify(cells)) } catch { /* Some browsers retain only standard clipboard types. */ }
    copiedCellsRef.current = { cells, text }
    copiedRowsRef.current = null
  }, [])

  const pasteRowsForSelection = useCallback((selection: ColumnCellSelection) => {
    const sheet = sheetsRef.current[selection.sheet]
    const rows = sheet?.rows ?? EMPTY_ROWS
    const bounds = scheduleSelectionYearBounds(selection.anchor, sheet?.yearSections, rows.length)
    return bounds.last === rows.length - 1 ? rows : rows.slice(0, bounds.last + 1)
  }, [])

  const pasteSelectionFromClipboard = useCallback((clipboard: Pick<DataTransfer, 'getData'>) => {
    const selection = selectionRef.current
    if (!selection) return
    const text = clipboard.getData('text/plain')
    if (selection.column === -1) {
      const rememberedRows = copiedRowsRef.current
      const sourceRows = readScheduleRowClipboard(clipboard.getData(SCHEDULE_ROW_CLIPBOARD_TYPE))
        ?? (rememberedRows && sameScheduleClipboardText(rememberedRows.text, text) ? rememberedRows.rows : null)
      if (!sourceRows) return
      try {
        const changes = planScheduleRowPaste(sourceRows, selection, pasteRowsForSelection(selection))
        const linked = filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current,
          linkScheduleCourseChanges(sheetsRef.current, rowIndexesRef.current, changes, courseSuggestions ?? []))
        flushTypingGroup()
        historyRef.current.recordChanges(linked.map(change => ({ cell: change.cell, before: readCellValue(change.cell), after: change.value })))
        applyCellValues(linked)
        const first = Math.min(selection.anchor, selection.end)
        changeSelection({ ...selection, anchor: first, end: first + changes.length / SCHEDULE_COLUMN_COUNT - 1 })
      } catch { /* Ignore invalid row pastes without displaying a table message. */ }
      return
    }
    const remembered = copiedCellsRef.current
    const source = readScheduleCellClipboard(clipboard.getData(SCHEDULE_CELL_CLIPBOARD_TYPE))
      ?? (remembered && sameScheduleClipboardText(remembered.text, text) ? remembered.cells : null)
      ?? readScheduleCourseClipboard(text, selection.column)
    if (!source) return
    try {
      const changes = planScheduleCellPaste(source, selection, pasteRowsForSelection(selection))
      const linked = filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current,
        linkScheduleCourseChanges(sheetsRef.current, rowIndexesRef.current, changes, courseSuggestions ?? []))
      flushTypingGroup()
      historyRef.current.recordChanges(linked.map(change => ({ cell: change.cell, before: readCellValue(change.cell), after: change.value })))
      applyCellValues(linked)
      const first = Math.min(selection.anchor, selection.end)
      changeSelection({ ...selection, anchor: first, end: first + changes.length - 1 })
    } catch { /* Ignore invalid pastes without displaying a table message. */ }
  }, [applyCellValues, changeSelection, flushTypingGroup, readCellValue, pasteRowsForSelection, courseSuggestions])

  const copySelectedCells = (event: ReactClipboardEvent<HTMLDialogElement>) => {
    if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement
      || !event.target.closest('td[data-edit-cell], th[data-row-counter]')) return
    event.preventDefault()
    event.stopPropagation()
    copySelectionToClipboard(event.clipboardData)
  }

  const pasteSelectedCells = (event: ReactClipboardEvent<HTMLDialogElement>) => {
    if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement
      || !event.target.closest('td[data-edit-cell], th[data-row-counter]')) return
    event.preventDefault()
    event.stopPropagation()
    pasteSelectionFromClipboard(event.clipboardData)
  }

  const canPasteSelection = useCallback((text: string): boolean => {
    const selection = selectionRef.current
    if (!selection) return false
    const rows = pasteRowsForSelection(selection)
    try {
      if (selection.column === -1) {
        const copied = copiedRowsRef.current
        return Boolean(copied && sameScheduleClipboardText(copied.text, text)
          && filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current, planScheduleRowPaste(copied.rows, selection, rows)).length)
      }
      const copied = copiedCellsRef.current
      const source = copied && sameScheduleClipboardText(copied.text, text) ? copied.cells : readScheduleCourseClipboard(text, selection.column)
      return Boolean(source && filterScheduleEditableChanges(sheetsRef.current, rowIndexesRef.current, planScheduleCellPaste(source, selection, rows)).length)
    } catch { return false }
  }, [pasteRowsForSelection])

  useEffect(() => {
    if (!contextMenu || contextMenu.yearStart !== undefined) return
    let cancelled = false
    const checkClipboard = async () => {
      let text = copiedRowsRef.current?.text ?? copiedCellsRef.current?.text ?? ''
      try { text = await navigator.clipboard.readText() } catch { /* Validate the internal clipboard when browser access is unavailable. */ }
      if (!cancelled) setContextPasteText(text)
    }
    void checkClipboard()
    return () => { cancelled = true }
  }, [contextMenu])

  const contextPasteAllowed = contextMenu !== null && contextPasteText !== null && canPasteSelection(contextPasteText)

  const runContextMenuAction = async (action: 'copy' | 'paste') => {
    const target = contextMenu?.target
    const selectionAtStart = selectionRef.current
    if (action === 'copy') {
      const data = new Map<string, string>()
      copySelectionToClipboard({ setData: (type, value) => { data.set(type, value) } })
      try { await navigator.clipboard.writeText(data.get('text/plain') ?? '') } catch { /* Internal clipboard remains available. */ }
    } else {
      let text = copiedRowsRef.current?.text ?? copiedCellsRef.current?.text ?? ''
      try { text = await navigator.clipboard.readText() } catch { /* Use the internal clipboard when browser access is unavailable. */ }
      if (!contextMenuRef.current || selectionRef.current !== selectionAtStart || !target?.isConnected) return
      if (!canPasteSelection(text)) { setContextPasteText(text); return }
      pasteSelectionFromClipboard({ getData: type => type === 'text/plain' ? text : '' })
    }
    if (!contextMenuRef.current) return
    setContextMenu(null)
    target?.focus({ preventScroll: true })
  }

  const runRowAction = (action: 'add' | 'delete') => {
    const selection = selectionRef.current
    if (!selection) return
    const before = sheetsRef.current[selection.sheet]
    if (!before) return
    flushTypingGroup()
    const result = changeDepartmentScheduleRows(before, selection, action)
    const column = Math.max(0, selection.column)
    historyRef.current.recordStructure({ sheet: selection.sheet, row: result.sheet.rows[result.rowIndex].rowNumber, column }, before, result.sheet)
    const next = [...sheetsRef.current]
    next[selection.sheet] = result.sheet
    sheetsRef.current = next
    rowIndexesRef.current = indexScheduleRows(next)
    setSheets(next)
    changeSelection({ ...selection, anchor: result.rowIndex, end: result.rowIndex })
    setContextMenu(null)
    requestAnimationFrame(() => {
      const row = result.sheet.rows[result.rowIndex]
      const selector = selection.column === -1 ? `th[data-row-counter][data-source-row="${row.rowNumber}"]`
        : `td[data-edit-cell="${selection.sheet}:${row.rowNumber}:${column}"]`
      tableRef.current?.querySelector<HTMLTableCellElement>(selector)?.focus({ preventScroll: true })
    })
  }

  const closeRowCountModal = () => {
    const target = rowCountModal?.target
    setRowCountModal(null)
    requestAnimationFrame(() => target?.focus({ preventScroll: true }))
  }

  const toggleYearVisibility = () => {
    if (contextMenu?.yearStart === undefined) return
    const start = contextMenu.yearStart
    const before = sheetsRef.current[selectedSheet]
    const after = toggleDepartmentScheduleYearVisibility(before, start)
    if (after === before) return
    flushTypingGroup()
    historyRef.current.recordStructure({ sheet: selectedSheet, row: before.rows[start].rowNumber, column: 0 }, before, after)
    const next = [...sheetsRef.current]
    next[selectedSheet] = after
    sheetsRef.current = next
    setSheets(next)
    const current = selectionRef.current
    const section = after.yearSections?.find(item => item.start === start)
    if (current?.sheet === selectedSheet && section?.hidden && current.anchor >= start && current.anchor < start + section.count) changeSelection(null)
    setContextMenu(null)
    requestAnimationFrame(() => tableRef.current?.querySelector<HTMLTableCellElement>(`tr[data-row-index="${start}"] th[data-year-header]`)?.focus({ preventScroll: true }))
  }

  const addYearRows = (count: number) => {
    if (!rowCountModal) return
    const before = sheetsRef.current[rowCountModal.sheet]
    const section = before?.yearSections?.find(item => item.start === rowCountModal.start)
    if (!section) return
    const last = section.start + section.count - 1
    const result = changeDepartmentScheduleRows(before, { sheet: rowCountModal.sheet, column: -1, anchor: last, end: last }, 'add', count)
    flushTypingGroup()
    historyRef.current.recordStructure({ sheet: rowCountModal.sheet, row: result.sheet.rows[result.rowIndex].rowNumber, column: 0 }, before, result.sheet)
    const next = [...sheetsRef.current]
    next[rowCountModal.sheet] = result.sheet
    sheetsRef.current = next
    rowIndexesRef.current = indexScheduleRows(next)
    setSheets(next)
    changeSelection(null)
    closeRowCountModal()
  }

  const changeHistory = (redo: boolean) => {
    flushTypingGroup()
    const session = editSessionRef.current
    const edit = redo ? historyRef.current.redo(session?.cell)
      : historyRef.current.undo(session?.checkpoint.past.length ?? 0, session?.cell)
    if (!edit) return
    let focusRowNumber = edit.cell.row
    if (edit.structure) {
      const next = [...sheetsRef.current]
      const restored = redo ? edit.structure.after : edit.structure.before
      next[edit.cell.sheet] = restored
      sheetsRef.current = next
      rowIndexesRef.current = indexScheduleRows(next)
      setSheets(next)
      const current = selectionRef.current
      if (current?.sheet === edit.cell.sheet) {
        const rowIndex = Math.min(current.anchor, restored.rows.length - 1)
        changeSelection({ ...current, anchor: rowIndex, end: rowIndex })
        focusRowNumber = restored.rows[rowIndex].rowNumber
      }
    } else applyCellValues([edit, ...(edit.related ?? [])].map(change => ({ cell: change.cell, value: redo ? change.after : change.before })))
    if (!session) setSelectedSheet(edit.cell.sheet)
    requestAnimationFrame(() => {
      let cell = selectionRef.current?.column === -1 && selectionRef.current.sheet === edit.cell.sheet
        ? tableRef.current?.querySelector<HTMLTableCellElement>(`th[data-row-counter][data-source-row="${focusRowNumber}"]`)
        : tableRef.current?.querySelector<HTMLTableCellElement>(`td[data-edit-cell="${edit.cell.sheet}:${focusRowNumber}:${edit.cell.column}"]`)
      if (!cell) {
        const rowIndex = rowIndexesRef.current[edit.cell.sheet]?.get(focusRowNumber)
        const section = sheetsRef.current[edit.cell.sheet]?.yearSections?.find(item => rowIndex !== undefined && rowIndex >= item.start && rowIndex < item.start + item.count)
        if (section) cell = tableRef.current?.querySelector<HTMLTableCellElement>(`tr[data-row-index="${section.start}"] th[data-year-header]`)
      }
      const input = cell?.querySelector('input')
      if (input) {
        const caret = redo ? edit.afterCaret : edit.beforeCaret
        input.setSelectionRange(caret, caret)
      } else cell?.focus({ preventScroll: true })
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }

  const measuredWidths = (): number[] => {
    const context = document.createElement('canvas').getContext('2d')
    const constraints: HeaderWidthConstraint[] = []
    tableRef.current?.querySelectorAll<HTMLTableCellElement>('thead th[data-column-start]').forEach(cell => {
      const isNumberColumn = cell.dataset.columnStart === '0'
      const measuringCell = isNumberColumn ? tableRef.current?.querySelector<HTMLTableCellElement>('tbody th[scope="row"]') ?? cell : cell
      const style = getComputedStyle(measuringCell)
      if (context) context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const measure = (text: string) => context?.measureText(text).width ?? text.length * parseFloat(style.fontSize)
      const spacing = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const textMinimum = isNumberColumn ? rowNumberMinimumWidth(Math.max(0, ...(sheet?.yearSections?.map(section => section.count) ?? [visibleRows.length])), measure)
        : headerTextMinimumWidth(cell.textContent ?? '', measure)
      constraints.push({ start: Number(cell.dataset.columnStart), count: cell.colSpan,
        minimum: Math.ceil(textMinimum + spacing + 1) })
    })
    headerConstraintsRef.current = constraints
    if (columnWidths) return columnWidths
    const widths = Array<number>(22).fill(0)
    tableRef.current?.querySelectorAll<HTMLTableCellElement>('thead th[data-column-index]').forEach(cell => {
      widths[Number(cell.dataset.columnIndex)] = cell.getBoundingClientRect().width
    })
    return widths
  }

  const resizedWidths = (widths: number[], start: number, count: number, delta: number): number[] =>
    resizeHeaderColumns(widths, headerConstraintsRef.current, start, count, delta)

  useLayoutEffect(() => {
    if (loading || !tableRef.current) return
    const widths = measuredWidths()
    if (!columnWidths) {
      const minimum = headerConstraintsRef.current.find(constraint => constraint.start === 0 && constraint.count === 1)?.minimum
      if (minimum !== undefined) {
        const defaults = defaultRowCounterWidth(widths, minimum)
        setColumnWidths(defaults)
        setSaveBaseline(previous => previous.columnWidths === null && previous.sheets === sheetsRef.current
          ? { ...previous, columnWidths: defaults } : previous)
      }
      return
    }
    // A different sheet may need more digits without resetting the other column widths.
    setColumnWidths(resizedWidths(widths, 0, 1, 0))
  }, [selectedSheet, visibleRows.length, loading])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    const header = tableRef.current?.tHead
    if (loading || !scroll || !header) return
    const measureLabelViewport = () => {
      const headerHeight = header.getBoundingClientRect().height
      scroll.style.setProperty('--schedule-header-height', `${headerHeight}px`)
      const yearHeader = header.rows[0]?.cells[0]
      if (yearHeader) scroll.style.setProperty('--schedule-year-width', `${yearHeader.getBoundingClientRect().width}px`)
      const rowHeader = header.rows[0]?.cells[1]
      if (yearHeader && rowHeader) scroll.style.setProperty('--schedule-pinned-width', `${yearHeader.getBoundingClientRect().width + rowHeader.getBoundingClientRect().width}px`)
      scroll.style.setProperty('--schedule-label-height', `${Math.max(0, scroll.clientHeight - headerHeight)}px`)
    }
    measureLabelViewport()
    const observer = new ResizeObserver(measureLabelViewport)
    observer.observe(scroll)
    observer.observe(header)
    if (header.rows[0]?.cells[0]) observer.observe(header.rows[0].cells[0])
    if (header.rows[0]?.cells[1]) observer.observe(header.rows[0].cells[1])
    return () => observer.disconnect()
  }, [loading])

  const stopResize = () => {
    setResizing(false)
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
    setColumnWidths(resizedWidths(resize.widths, resize.start, resize.count, delta))
  }

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, start: number, count: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    stopResize()
    const widths = measuredWidths()
    setResizing(true)
    resizeRef.current = { x: event.clientX, pointerX: event.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0, lastDelta: 0, start, count, widths }
    setColumnWidths(widths)
    event.currentTarget.setPointerCapture(event.pointerId)
    let lastFrame = performance.now()
    const scrollWhileResizing = (now: number) => {
      const resize = resizeRef.current
      const scroll = scrollRef.current
      if (!resize || !scroll) { resizeFrameRef.current = null; return }
      const bounds = scroll.getBoundingClientRect()
      const step = headerResizeScrollStep(resize.pointerX, bounds.left, bounds.left + scroll.clientWidth)
      scroll.scrollLeft += step * Math.min(2, (now - lastFrame) / (1000 / 60))
      lastFrame = now
      updateResize()
      resizeFrameRef.current = requestAnimationFrame(scrollWhileResizing)
    }
    resizeFrameRef.current = requestAnimationFrame(scrollWhileResizing)
  }

  const resizeHandle = (start: number, count: number, label: string) => (
    <span
      role="separator"
      aria-label={`Resize ${label}`}
      aria-orientation="vertical"
      aria-valuemin={headerConstraintsRef.current.find(constraint => constraint.start === start && constraint.count === count)?.minimum}
      aria-valuenow={columnWidths ? Math.round(columnWidths.slice(start, start + count).reduce((sum, width) => sum + width, 0)) : undefined}
      tabIndex={0}
      title={`Drag to resize ${label}; use Left/Right arrow keys when focused`}
      className={`absolute inset-y-0 z-20 w-2 ${start + count === 22 ? 'right-0' : 'right-[-0.5px] translate-x-1/2'} cursor-col-resize touch-none select-none hover:bg-black/20 focus-visible:bg-black/20 focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]`}
      onPointerDown={event => startResize(event, start, count)}
      onPointerMove={event => {
        const resize = resizeRef.current
        if (resize) resize.pointerX = event.clientX
      }}
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
        setColumnWidths(resizedWidths(measuredWidths(), start, count, delta))
      }}
    />
  )

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); if (contextMenu) setContextMenu(null); else if (!savingRef.current) onClose() }}
      onScrollCapture={() => { if (contextMenu) setContextMenu(null) }}
      onContextMenu={event => {
        if (readOnly) { event.preventDefault(); return }
        if (!(event.target instanceof Element) || event.target instanceof HTMLInputElement) return
        const yearHeader = event.target.closest<HTMLTableCellElement>('th[data-year-header]')
        if (yearHeader) {
          event.preventDefault()
          const start = Number(yearHeader.closest<HTMLTableRowElement>('tr[data-row-index]')?.dataset.rowIndex)
          setContextPasteText(null)
          setContextMenu({ x: Math.max(0, Math.min(event.clientX, window.innerWidth - 180)), y: Math.max(0, Math.min(event.clientY, window.innerHeight - 112)), target: yearHeader, yearStart: start })
          return
        }
        const cell = event.target.closest<HTMLTableCellElement>('td[data-edit-cell], th[data-row-counter]')
        if (!cell) return
        event.preventDefault()
        const rowIndex = Number(cell.closest<HTMLTableRowElement>('tr[data-row-index]')?.dataset.rowIndex)
        const column = cell.hasAttribute('data-row-counter') ? -1 : Number(cell.dataset.editCell?.split(':')[2])
        const current = selectionRef.current
        const inside = current?.sheet === selectedSheet && rowIndex >= Math.min(current.anchor, current.end)
          && rowIndex <= Math.max(current.anchor, current.end) && (current.column === column || current.column === -1 && column !== -1)
        if (!inside) changeSelection({ sheet: selectedSheet, column, anchor: rowIndex, end: rowIndex })
        const target = inside && current?.column === -1
          ? cell.closest('tr')?.querySelector<HTMLTableCellElement>('th[data-row-counter]') ?? cell : cell
        setContextPasteText(null)
        setContextMenu({ x: Math.max(0, Math.min(event.clientX, window.innerWidth - 180)), y: Math.max(0, Math.min(event.clientY, window.innerHeight - 144)), target })
      }}
      onCopy={copySelectedCells}
      onPaste={event => { if (!savingRef.current && !readOnly && storageReady && !loading) pasteSelectedCells(event) }}
      onKeyDown={event => {
        if (savingRef.current || readOnly || !storageReady || loading) return
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return
        const key = event.key.toLowerCase()
        if (key !== 'z' && key !== 'y') return
        event.preventDefault()
        event.stopPropagation()
        changeHistory(key === 'y' || event.shiftKey)
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden rounded-none border-0 bg-white p-0 text-slate-900 backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold tracking-tight text-white">Department Schedule Workbook</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-white/80" title={file?.name ?? (storedFileName || 'New workbook')}>{file?.name ?? (storedFileName || 'New workbook')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
            {sheets.length > 1 && (
              <select aria-label="Worksheet" disabled={loading || saving} value={selectedSheet} onChange={event => { setSelectedSheet(Number(event.target.value)); changeSelection(null) }} className="min-w-0 max-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                {sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
              </select>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label="Import department schedule XLSX"
              className="hidden"
              onChange={event => {
                const selected = event.target.files?.[0]
                event.target.value = ''
                if (selected) setFile(selected)
              }}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {loading && (
            <div role="status" aria-live="polite" className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
              <div className="space-y-1 text-center">
                <p className="text-[18px] leading-[26px] font-semibold text-slate-800">{file ? 'Importing workbook…' : 'Opening workbook…'}</p>
                <p className="text-[14px] leading-[20px] text-slate-500">{file ? 'Reading your XLSX file and checking the schedule headers.' : 'Loading your saved department schedule.'}</p>
              </div>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {!loading && (
            <div ref={scrollRef} inert={saving || !storageReady} className="schedule-import-scrollbar min-h-0 flex-1 overflow-auto">
              <table
                ref={tableRef}
                onPointerOver={event => showRowValidationTooltip(event.target)}
                onPointerLeave={hideValidationTooltip}
                onPointerDownCapture={event => {
                  hideValidationTooltip()
                  if (readOnly) { event.preventDefault(); event.stopPropagation() }
                }}
                onDoubleClickCapture={event => { if (readOnly) { event.preventDefault(); event.stopPropagation() } }}
                onKeyDownCapture={event => {
                  if (readOnly && (event.key === 'Enter' || event.key === 'F2' || event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) {
                    event.preventDefault()
                    event.stopPropagation()
                  }
                }}
                onFocusCapture={event => showRowValidationTooltip(event.target)}
                onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) hideValidationTooltip() }}
                className={`${columnWidths ? 'table-fixed' : 'w-full min-w-[1800px]'} border-separate border-spacing-0 text-center text-sm [&_th]:text-center [&_th]:align-middle [&_td]:text-center [&_td]:align-middle [&_thead_th]:relative [&_th]:break-words [&_tr>:first-child]:border-l-0 [&_tr>:last-child]:border-r-0`}
                style={columnWidths ? { width: 48 + columnWidths.reduce((sum, width) => sum + width, 0) } : undefined}
              >
                <caption className="sr-only">{sheet ? `Imported schedule from ${sheet.name}` : 'Required department schedule headers'}</caption>
                <colgroup>
                  <col className="w-12" />
                  {Array.from({ length: 22 }, (_, index) => <col key={index} style={columnWidths ? { width: columnWidths[index] } : undefined} />)}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#ffff00] text-black">
                  <tr>
                    <th scope="col" rowSpan={2} aria-label="Year level" className="sticky! top-0 left-0 z-20 border-t border-r border-b border-black bg-[#ffff00] p-0">Yr</th>
                    <th scope="col" rowSpan={2} data-column-start={0} data-column-index={0} className="sticky! top-0 left-[var(--schedule-year-width,3rem)] z-20 border-t border-r border-b border-black bg-[#ffff00] px-3 py-2 font-bold">#{resizeHandle(0, 1, 'row number')}</th>
                    {DISPLAY_HEADER_GROUPS.map(group => (
                      <th key={group.offset} scope="colgroup" colSpan={group.width} rowSpan={group.children.length ? 1 : 2} data-column-start={group.offset + 1} data-column-index={group.width === 1 ? group.offset + 1 : undefined} className="border-t border-r border-b border-black bg-[#ffff00] px-3 py-2 font-bold">
                        {group.label}
                        {resizeHandle(group.offset + 1, group.width, group.label)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {DISPLAY_HEADER_GROUPS.flatMap(group => group.children.map((label, index) => (
                      <th key={`${group.offset}:${index}`} scope="col" data-column-start={group.offset + index + 1} data-column-index={group.offset + index + 1} className="border-r border-b border-black bg-[#ffff00] px-3 py-1 font-bold">{label}{resizeHandle(group.offset + index + 1, 1, `${group.label} ${label} ${index + 1}`)}</th>
                    )))}
                  </tr>
                </thead>
                <DepartmentScheduleImportTableBody
                  key={sheet?.name}
                  rows={visibleRows}
                  yearSections={sheet?.yearSections}
                  yearRenameRequest={yearRenameRequest}
                  sheetIndex={selectedSheet}
                  selection={selection}
                  columnLabels={DATA_COLUMN_LABELS}
                  actions={cellActions}
                  hasSheet={Boolean(sheet)}
                  rowIssues={rowIssues}
                  suggestionDirectory={validationDirectory}
                  suggestionError={validationDirectory ? undefined : validationError}
                  courseSuggestions={courseSuggestions}
                  courseSuggestionError={courseSuggestionError}
                />
              </table>
            </div>
          )}
        </div>
        <footer className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
          <Button type="button" variant="outline" disabled={loading || saving || readOnly || !storageReady} icon={<UploadIcon className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>Import XLSX</Button>
          <div className="min-w-0 flex-1 text-sm">
            {(storageError || validationError || courseSuggestionError) && <p role="alert" className="text-rose-700">{storageError || validationError || courseSuggestionError}</p>}
            {pendingLiveUpdate ? <p role="status" aria-live="polite" className="text-amber-700">
                {hasLocalEdits ? 'Another user saved a newer workbook. Your unsaved edits are kept.' : 'A newer saved workbook is ready.'}{' '}
                {hasLocalEdits && <><button type="button" disabled={loading || saving || resizing} className="font-medium underline" onClick={() => resolveLiveUpdate('merge')}>Merge and keep my edits</button>{' · '}</>}
                {hasLocalEdits && mergeBlocked && <><button type="button" disabled={loading || saving || resizing} className="font-medium underline" onClick={() => resolveLiveUpdate('local')}>Keep my workbook</button>{' · '}</>}
                <button type="button" disabled={loading || saving || resizing} className="font-medium underline" onClick={() => resolveLiveUpdate('remote')}>{hasLocalEdits ? 'Discard edits and load latest' : 'Load latest'}</button>
              </p>
                : liveWorkbook.error ? <p role="alert" className="text-rose-700">{liveWorkbook.error}{' '}<button type="button" className="font-medium underline" onClick={liveWorkbook.retry}>Retry live updates</button></p>
                  : !(storageError || validationError || courseSuggestionError) && <p role="status" aria-live="polite" className="text-slate-500">{storageStatus || (readOnly ? 'This semester is read-only.' : !term ? 'Open a department and semester from My Department to save this workbook.' : '')}</p>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {!loading && storageReady && <p role="status" aria-live="polite" className={`text-sm ${hasUnsavedChanges && !saving ? 'text-amber-700' : 'text-slate-500'}`}>
              {saving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : saveDuration === null ? 'Saved' : `Saved in ${(saveDuration / 1000).toFixed(1)}s`}
            </p>}
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Close</Button>
            <Button type="button" variant="brand" disabled={!term || readOnly || loading || saving || !storageReady || !sheets.length || Boolean(pendingLiveUpdate)} onClick={() => { void saveWorkbook() }}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </footer>
      </div>
      {!loading && !saving && !contextMenu && !rowCountModal && validationTooltip}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          aria-label={contextMenu.yearStart === undefined ? 'Cell actions' : 'Year level actions'}
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
          {contextMenu.yearStart !== undefined ? <>
            <button autoFocus type="button" role="menuitem" onClick={() => {
              setRowCountModal({ sheet: selectedSheet, start: contextMenu.yearStart!, label: contextMenu.target.title, target: contextMenu.target })
              setContextMenu(null)
            }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Add Rows</button>
            <button type="button" role="menuitem" onClick={() => {
              setYearRenameRequest(previous => ({ sheet: selectedSheet, start: contextMenu.yearStart!, id: (previous?.id ?? 0) + 1 }))
              setContextMenu(null)
            }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Rename</button>
            <button type="button" role="menuitem" onClick={toggleYearVisibility} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">{sheet?.yearSections?.find(section => section.start === contextMenu.yearStart)?.hidden ? 'Show' : 'Hide'}</button>
          </> : <>
          <button autoFocus type="button" role="menuitem" onClick={() => { void runContextMenuAction('copy') }} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Copy</button>
          <button type="button" role="menuitem" disabled={!contextPasteAllowed} onClick={() => { void runContextMenuAction('paste') }} className="block w-full rounded px-2 py-1 text-left text-sm enabled:hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] disabled:cursor-not-allowed disabled:text-slate-400">Paste</button>
          <button type="button" role="menuitem" onClick={() => runRowAction('add')} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Add row</button>
          <button type="button" role="menuitem" onClick={() => runRowAction('delete')} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)]">Delete row</button>
          </>}
        </div>
      )}
      {rowCountModal && <ScheduleRowCountModal yearLabel={rowCountModal.label} onClose={closeRowCountModal} onAdd={addYearRows} />}
    </dialog>, document.body,
  )
}
