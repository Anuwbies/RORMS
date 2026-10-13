import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { formatUserName } from '../utils/userName'
import { createPortal, flushSync } from 'react-dom'
import { serializeWorkbookState, deserializeWorkbookState, type WorkbookEditSnapshot } from '../utils/excelWorkbookState'
import { serializeFirestoreWorkbookState } from '../utils/firestoreWorkbookState'
import { mergeWorkbookSnapshots, sameSavedWorkbookContent } from '../utils/mergeWorkbookSnapshots'
import type { LiveWorkbookUpdate } from '../hooks/useLiveDepartmentWorkbook'
import { appendImportedSheets, createImportedSourceFile, type ExcelSheetImport } from '../utils/excelSheetImport'
import * as XLSX from 'xlsx'
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from './Icons'
import { ExcelCellToolbar, type BorderPreset, type BorderLineStyle, type MergePreset } from './ExcelCellToolbar'
import { ExcelRotatedCellText } from './ExcelRotatedCellText'
import { ExcelCellFontText } from './ExcelCellFontText'
import { type ExcelCellTextDraft, type ExcelCellTextEditorHandle } from './ExcelCellTextEditor'
import { fontRunsForCell, type ExcelFontCell } from '../utils/excelFontRuns'
import { parseExcelPreviewStyles, readSheetPreviewFormatting, type ExcelPreviewStyles, type SheetPreviewFormatting } from '../utils/excelPreviewStyles'
import { EditHistory } from '../utils/editHistory'
import { expandSelectionForMerges, findBorderedRegion, type BorderedCell } from '../utils/excelSelection'
import { clearRangeText, formatClipboardRows, parseClipboardRows, moveCellMap, moveIndexMap, moveRange, moveSheet as editWorksheet, moveFormatting, setSheetAxisHidden, type GridEdit } from '../utils/excelGridEdits'
import { reorderWorkbookAxis, validateAxisMove, type AxisMove } from '../utils/excelAxisMoves'
import { axisDragOffset, axisDragTarget, axisDragScrollSpeed, createAxisDragPreview, type AxisDragPoint, type AxisHeaderPosition } from '../utils/excelAxisDrag'
import { ExcelCellContextMenu, type CellMenuAction, type CellDetailKind } from './ExcelCellContextMenu'
import { ExcelHeaderContextMenu } from './ExcelHeaderContextMenu'
import { ExcelHiddenRangeIndicator } from './ExcelHiddenRangeIndicator'
import { ExcelFileMenu } from './ExcelFileMenu'
import { ExcelImportSheetsModal } from './ExcelImportSheetsModal'
import { ExcelScheduleStatusConfirmModal } from './ExcelScheduleStatusConfirmModal'
import { axisVisibilityIndicators, rememberHiddenRange, shownAxisRanges, type AxisVisibilityIndicator, type SheetHiddenRanges } from '../utils/excelHiddenRanges'
import { ExcelCellAnnotations } from './ExcelCellAnnotations'
import { ExcelSheetComments } from './ExcelSheetComments'
import { ExcelScheduleSetupPanel } from './ExcelScheduleSetupPanel'
import { assignScheduleYear, detectScheduleSetup, moveScheduleSetup, plotScheduleRows, selectedScheduleRows, readAssignedScheduleRecords, readScheduleRecords, scheduleHeaderAt, scheduleHeaderMerges, scheduleHeaderValues, validateScheduleHeader, SCHEDULE_COLUMN_COUNT, SCHEDULE_YEAR_LABELS, type ScheduleSetup, type ScheduleYear } from '../utils/excelScheduleTemplate'
import type { SchedulePreviewAppearance } from './ExcelScheduleRowsPreview'
import { scheduleValidationIssuesForRows, validateExcelSchedule, type ExcelScheduleRoom } from '../utils/excelScheduleValidation'
import { useExcelValidationTooltip } from './ExcelValidationTooltip'
import { ExcelPreviewRow, type ExcelPreviewCellData, type ExcelPreviewCellEvents } from './ExcelPreviewRow'
import { useLatestEvent } from '../hooks/useLatestEvent'
import { worksheetDisplayMerges } from '../utils/excelDisplayColumns'
import { ensureScheduleStatusColumns, scheduleStatusText, rangeIncludesScheduleStatus, selectionHasScheduleStatusText, scheduleStatusSelectionHighlight } from '../utils/excelScheduleStatusColumn'
import { updateCellAnnotation, applyCommentAction, isVisibleAnnotation, type CommentAuthor, type CommentAction } from '../utils/excelAnnotations'
import { auth, db } from '../firebase'
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import type { ExcelFacultyDirectory } from '../utils/excelFacultySuggestions'
import { canonicalizeWorkbookFaculty } from '../utils/excelFacultyNormalization'
import { filterWorksheetRows, worksheetFilterReader, worksheetFilterOptions, worksheetFilterLabel, type WorksheetFilter } from '../utils/excelWorksheetFilters'
import { ExcelColumnFilterMenu } from './ExcelColumnFilterMenu'

const TRAILING_EMPTY_ROWS = 5
const DEFAULT_ROWS_TO_ADD = '50'
const MAX_ROWS_TO_ADD = 10000
const DEFAULT_GRIDLINE = '1px solid #d4d4d4'
const DEFAULT_LAST_COLUMN = 25
const EMPTY_MERGES: XLSX.Range[] = []
const EMPTY_FACULTY_NAMES: readonly string[] = []
const BORDER_SIDES = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const
type BorderSide = typeof BORDER_SIDES[number]
const BORDER_NEIGHBORS: Record<BorderSide, { row: number; column: number; side: BorderSide }> = {
  borderTop: { row: -1, column: 0, side: 'borderBottom' },
  borderRight: { row: 0, column: 1, side: 'borderLeft' },
  borderBottom: { row: 1, column: 0, side: 'borderTop' },
  borderLeft: { row: 0, column: -1, side: 'borderRight' },
}

function strongerBorder(current: string | undefined, candidate: string | undefined): string | undefined {
  if (!candidate) return current
  if (!current) return candidate
  const currentWidth = Number.parseFloat(current) || 0
  const candidateWidth = Number.parseFloat(candidate) || 0
  return candidateWidth > currentWidth ? candidate : current
}

interface SheetBounds {
  firstRow: number
  lastRow: number
  firstColumn: number
  lastColumn: number
}

type ResizeAxis = 'row' | 'column'
type SizeOverrides = Map<string, Map<number, number>>
type CellOverrides<T> = Map<string, Map<string, T>>
type SheetMenuTarget = { type: 'list' } | { type: 'sheet'; name: string; listPosition?: { left: number; bottom: number } }
type SheetMenuView = 'main' | 'color' | 'copy'

function nextSheetName(names: string[], base: string): string {
  const taken = new Set(names.map(name => name.toLowerCase()))
  let candidate = base.slice(0, 31)
  for (let number = 2; taken.has(candidate.toLowerCase()); number++) {
    const suffix = ` (${number})`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
  }
  return candidate
}

function moveMapKey<T>(current: Map<string, T>, from: string, to: string): Map<string, T> {
  if (!current.has(from)) return current
  const updated = new Map(current)
  updated.set(to, updated.get(from) as T)
  updated.delete(from)
  return updated
}

function removeMapKey<T>(current: Map<string, T>, name: string): Map<string, T> {
  if (!current.has(name)) return current
  const updated = new Map(current)
  updated.delete(name)
  return updated
}

function copyMapEntry<T>(current: Map<string, T>, from: string, to: string, copy: (value: T) => T): Map<string, T> {
  const value = current.get(from)
  return value === undefined ? current : new Map(current).set(to, copy(value))
}

interface CellSelection {
  anchor: XLSX.CellAddress
  focus: XLSX.CellAddress
  axis?: ResizeAxis
  anchorStatus?: boolean
  focusStatus?: boolean
}

function sameWorkbookContent(previous: WorkbookEditSnapshot, next: WorkbookEditSnapshot): boolean {
  return previous.workbook === next.workbook
    && previous.previewStyles === next.previewStyles
    && previous.sheetColors === next.sheetColors
    && previous.addedRowsBySheet === next.addedRowsBySheet
    && previous.rowHeightOverrides === next.rowHeightOverrides
    && previous.columnWidthOverrides === next.columnWidthOverrides
    && previous.cellTextOverrides === next.cellTextOverrides
    && previous.cellStyleOverrides === next.cellStyleOverrides
    && previous.mergeOverrides === next.mergeOverrides
    && previous.formattingOverrides === next.formattingOverrides
    && previous.scheduleSetups === next.scheduleSetups
    && previous.hiddenRangeToggles === next.hiddenRangeToggles
}

interface ClipboardCell {
  text: string
  style: CSSProperties
  cell?: XLSX.CellObject
}

interface CellClipboard {
  text: string
  cells: ClipboardCell[][]
  merges: XLSX.Range[]
  cut?: { sheet: string; range: XLSX.Range; workbook: XLSX.WorkBook; texts: CellOverrides<string>; styles: CellOverrides<CSSProperties> }
}

const EMPTY_CELL_STYLE: CSSProperties = {
  fontFamily: 'Arial', fontSize: '11pt', fontWeight: 'normal', fontStyle: 'normal',
  textDecoration: 'none', color: '#000000', backgroundColor: '#ffffff',
  textAlign: 'left', verticalAlign: 'bottom', whiteSpace: 'pre', rotate: '0deg',
  writingMode: 'horizontal-tb', textOrientation: 'mixed',
  borderTop: 'none', borderRight: 'none', borderBottom: 'none', borderLeft: 'none',
}

function selectionRange(selection: CellSelection): XLSX.Range {
  return {
    s: { r: Math.min(selection.anchor.r, selection.focus.r), c: Math.min(selection.anchor.c, selection.focus.c) },
    e: { r: Math.max(selection.anchor.r, selection.focus.r), c: Math.max(selection.anchor.c, selection.focus.c) },
  }
}

function rangesOverlap(a: XLSX.Range, b: XLSX.Range): boolean {
  return a.s.r <= b.e.r && b.s.r <= a.e.r && a.s.c <= b.e.c && b.s.c <= a.e.c
}

function rangeContains(outer: XLSX.Range, inner: XLSX.Range): boolean {
  return outer.s.r <= inner.s.r && outer.e.r >= inner.e.r && outer.s.c <= inner.s.c && outer.e.c >= inner.e.c
}

interface ResizeDrag {
  axis: ResizeAxis
  sheetName: string
  index: number
  pointerId: number
  startPosition: number
  startSize: number
  currentSize: number
  baseSheetWidth: number
  headerElement: HTMLDivElement
  sheetElement: HTMLTableColElement | HTMLTableRowElement
}

function getCellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return ''
  if (cell.w !== undefined) return String(cell.w)
  if (cell.v !== undefined && cell.v !== null) return XLSX.utils.format_cell(cell)
  return cell.f ? `=${cell.f}` : ''
}

function getSheetBounds(sheet: XLSX.WorkSheet, textOverrides?: Map<string, string>): SheetBounds {
  let lastRow = -1
  let lastColumn = Math.max(DEFAULT_LAST_COLUMN, sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).e.c : 0)

  for (const address of Object.keys(sheet)) {
    if (address.startsWith('!') || (textOverrides?.get(address) ?? getCellText(sheet[address])).trim() === '') continue
    const { r, c } = XLSX.utils.decode_cell(address)
    lastRow = Math.max(lastRow, r)
    lastColumn = Math.max(lastColumn, c)
  }

  for (const [address, value] of textOverrides || []) {
    if (sheet[address] || value.trim() === '') continue
    const { r, c } = XLSX.utils.decode_cell(address)
    lastRow = Math.max(lastRow, r)
    lastColumn = Math.max(lastColumn, c)
  }

  return { firstRow: 0, lastRow, firstColumn: 0, lastColumn }
}

interface HeaderMoveDrag {
  sheetName: string
  move: AxisMove
  pointerId: number
  element: HTMLDivElement
  start: AxisDragPoint
  current: AxisDragPoint
  headers: AxisHeaderPosition[]
  active: boolean
  preview?: ReturnType<typeof createAxisDragPreview>
  target: { index: number; after: boolean; error: string } | null
  scroll: { left: number; top: number }
}

function getColumnWidth(sheet: XLSX.WorkSheet | null, column: number): number {
  const width = sheet?.['!cols']?.[column]?.width
  return Math.max(20, Math.round((width ?? 8.43) * 7 + 5))
}

function getRowHeight(sheet: XLSX.WorkSheet | null, row: number): number {
  const height = sheet?.['!rows']?.[row]?.hpt
  return Math.max(12, Math.round((height ?? 15) * 4 / 3))
}

export interface ExcelPreviewModalProps {
  file?: File | null
  onClose: () => void
  title?: string
  subtitle?: string
  readOnly?: boolean
  showFilters?: boolean
  showPlotTool?: boolean
  allowSheetCreationAndRemoval?: boolean
  allowImportExport?: boolean
  allowHeaderMoves?: boolean
  initialEditorState?: string
  liveWorkbook?: LiveWorkbookUpdate
  liveError?: string
  onRetryLive?: () => void
  persistenceMode?: 'storage' | 'firestore'
  emptyWorkbookBehavior?: 'sheet' | 'message'
  onSave?: (editorState: string, importedSource?: File | null) => Promise<void>
  savingMessage?: string
  savedMessage?: string
  loading?: boolean
  loadingMessage?: string
  loadError?: string
  onRetryLoad?: () => void
  onImport?: (editorState: string) => void
  importLabel?: string
  importing?: boolean
  sheetImport?: ExcelSheetImport
  onImportComplete?: (error?: string) => void
  facultySuggestions?: ExcelFacultyDirectory
  facultyDepartmentCode?: string
}

export function ExcelPreviewModal({ file, onClose, title = 'Excel Preview', subtitle, readOnly = false, showFilters = true, showPlotTool = false, allowSheetCreationAndRemoval = true, allowImportExport = true, allowHeaderMoves = false, initialEditorState, liveWorkbook, liveError, onRetryLive, persistenceMode = 'storage', emptyWorkbookBehavior = 'sheet', onSave, savingMessage, savedMessage = 'Saved', loading = false, loadingMessage, loadError, onRetryLoad, onImport, importLabel, importing = false, sheetImport, onImportComplete, facultySuggestions, facultyDepartmentCode }: ExcelPreviewModalProps) {
  const loadBlocked = Boolean(onRetryLoad)
  const workbookSnapshotRef = useRef<WorkbookEditSnapshot | null>(null)
  const savedSnapshotRef = useRef<WorkbookEditSnapshot | null>(null)
  const savingRef = useRef(false)
  const importedSourceRef = useRef<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(!initialEditorState)
  const [hasCellDraftChanges, setHasCellDraftChanges] = useState(false)
  const [sheetFilters, setSheetFilters] = useState<Map<string, WorksheetFilter>>(() => new Map())
  const [filterMenu, setFilterMenu] = useState<{ column: number; anchor: HTMLButtonElement } | null>(null)
  const closeFilterMenu = useLatestEvent(() => setFilterMenu(null))
  useEffect(() => { setSheetFilters(new Map()); setFilterMenu(null) }, [file, initialEditorState])
  const seenLiveWorkbookRef = useRef<LiveWorkbookUpdate | undefined>(undefined)
  const liveOriginalFileRef = useRef<File | null | undefined>(file)
  const [liveConflict, setLiveConflict] = useState<{ update: LiveWorkbookUpdate; conflicts: string[] }>()
  const [liveNotice, setLiveNotice] = useState('')
  useEffect(() => {
    if (!liveNotice) return
    const timer = window.setTimeout(() => setLiveNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [liveNotice, liveWorkbook])
  const cellTextEditorRef = useRef<ExcelCellTextEditorHandle>(null)
  const normalizedFacultySourceRef = useRef<{
    workbook: XLSX.WorkBook
    texts: WorkbookEditSnapshot['cellTextOverrides']
    setups: WorkbookEditSnapshot['scheduleSetups']
    names: readonly string[]
  } | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const sheetScrollRef = useRef<HTMLDivElement>(null)
  const sheetTabsRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const columnTrackRef = useRef<HTMLDivElement>(null)
  const rowHeaderContainerRef = useRef<HTMLDivElement>(null)
  const sheetCanvasRef = useRef<HTMLDivElement>(null)
  const sheetTableRef = useRef<HTMLTableElement>(null)
  const selectionOutlineRef = useRef<HTMLDivElement>(null)
  const resizeDragRef = useRef<ResizeDrag | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const selectionDragRef = useRef(false)
  const rowSelectionDragRef = useRef<number | null>(null)
  const columnSelectionDragRef = useRef<number | null>(null)
  const axisMoveDragRef = useRef<HeaderMoveDrag | null>(null)
  const axisDragFrameRef = useRef<number | null>(null)
  const [isAxisDragging, setIsAxisDragging] = useState(false)
  const [axisDropTarget, setAxisDropTarget] = useState<{ axis: ResizeAxis; index: number; after: boolean; error: string } | null>(null)
  const [axisMoveNotice, setAxisMoveNotice] = useState<{ message: string; error: boolean } | null>(null)
  const selectionFrameRef = useRef<number | null>(null)
  const pendingSelectionFocusRef = useRef<XLSX.CellAddress | null>(null)
  const sheetRenameInputRef = useRef<HTMLInputElement>(null)
  const sheetTabButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const skipRenameBlurRef = useRef(false)
  const editHistoryRef = useRef(new EditHistory<WorkbookEditSnapshot>(sameWorkbookContent))
  const historyFileRef = useRef(file)
  const cellClipboardRef = useRef<CellClipboard | null>(null)
  const [cellMenuPosition, setCellMenuPosition] = useState<{ left: number; top: number } | null>(null)
  const [headerMenu, setHeaderMenu] = useState<({ axis: ResizeAxis; index: number; indexes: number[] } | { axis: 'all' }) & { position: { left: number; top: number } } | null>(null)
  const annotationCloseTimerRef = useRef<number | null>(null)
  const [cellAnnotationHover, setCellAnnotationHover] = useState<{ address: string; anchor: { left: number; right: number; top: number } } | null>(null)
  const [commentAuthor, setCommentAuthor] = useState<CommentAuthor>(() => ({ name: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'You', id: auth.currentUser?.uid, avatarUrl: auth.currentUser?.photoURL || undefined }))
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [previewStyles, setPreviewStyles] = useState<ExcelPreviewStyles | null>(null)
  const [selectedSheet, setSelectedSheet] = useState('')
  useEffect(() => { setFilterMenu(null) }, [selectedSheet])
  const [isCommentsOpen, setIsCommentsOpen] = useState(false)
  const [scheduleSetups, setScheduleSetups] = useState<Map<string, ScheduleSetup>>(() => new Map())
  const [validationRooms, setValidationRooms] = useState<readonly ExcelScheduleRoom[]>()
  const [roomValidationError, setRoomValidationError] = useState('')
  const hasScheduleSetup = scheduleSetups.size > 0
  useEffect(() => {
    setValidationRooms(undefined)
    setRoomValidationError('')
    if (!hasScheduleSetup) return
    let unsubscribeRooms: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeRooms?.()
      setValidationRooms(undefined)
      setRoomValidationError('')
      if (!user) return
      unsubscribeRooms = onSnapshot(collection(db, 'rooms'), snapshot => {
        setValidationRooms(snapshot.docs.map(item => {
          const data = item.data()
          return { code: typeof data.code === 'string' ? data.code : '', name: typeof data.name === 'string' ? data.name : '' }
        }))
        setRoomValidationError('')
      }, () => {
        setValidationRooms(undefined)
        setRoomValidationError('Unable to check whether rooms exist. Reopen the workbook to retry room validation.')
      })
    })
    return () => { unsubscribeAuth(); unsubscribeRooms?.() }
  }, [hasScheduleSetup])
  const [hiddenRangeToggles, setHiddenRangeToggles] = useState<Map<string, SheetHiddenRanges>>(() => new Map())
  const [isScheduleSetupOpen, setIsScheduleSetupOpen] = useState(false)
  const scheduleSetupAnchorRef = useRef<HTMLButtonElement | null>(null)
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [hoveredSheetComment, setHoveredSheetComment] = useState<{ sheet: string; address: string } | null>(null)
  const [canScrollSheetsLeft, setCanScrollSheetsLeft] = useState(false)
  const [canScrollSheetsRight, setCanScrollSheetsRight] = useState(false)
  const [sheetMenu, setSheetMenu] = useState<SheetMenuTarget | null>(null)
  const [sheetMenuView, setSheetMenuView] = useState<SheetMenuView>('main')
  const [sheetMenuPosition, setSheetMenuPosition] = useState({ left: 0, bottom: 0 })
  const sheetMenuRef = useRef<HTMLDivElement>(null)
  const allSheetsMenuRef = useRef<HTMLDivElement>(null)
  const sheetListContextAnchorRef = useRef<HTMLButtonElement | null>(null)
  const sheetMenuContextPointRef = useRef<{ x: number; y: number; listLeft: number; listRight: number } | null>(null)
  const [renamingSheet, setRenamingSheet] = useState<string | null>(null)
  const [renameTabStyle, setRenameTabStyle] = useState({ width: 0, letterSpacing: 'normal' })
  const [sheetNameDraft, setSheetNameDraft] = useState('')
  const [sheetNameError, setSheetNameError] = useState('')
  const [sheetColors, setSheetColors] = useState<Map<string, string>>(() => new Map())
  const [rowsToAdd, setRowsToAdd] = useState(DEFAULT_ROWS_TO_ADD)
  const [addedRowsBySheet, setAddedRowsBySheet] = useState<Map<string, number>>(() => new Map())
  const [sheetViewportWidth, setSheetViewportWidth] = useState(0)
  const [isReading, setIsReading] = useState(true)
  const [isExportPickerOpen, setIsExportPickerOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [error, setError] = useState('')
  const isOpeningWorkbook = loading || (!loadBlocked && !error && (isReading || !workbook))
  const [renderedRowHeights, setRenderedRowHeights] = useState<number[]>([])
  const [rowHeightOverrides, setRowHeightOverrides] = useState<SizeOverrides>(() => new Map())
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<SizeOverrides>(() => new Map())
  const [cellTextOverrides, setCellTextOverrides] = useState<CellOverrides<string>>(() => new Map())
  const [cellStyleOverrides, setCellStyleOverrides] = useState<CellOverrides<CSSProperties>>(() => new Map())
  const [mergeOverrides, setMergeOverrides] = useState<Map<string, XLSX.Range[]>>(() => new Map())
  const [formattingOverrides, setFormattingOverrides] = useState<Map<string, SheetPreviewFormatting>>(() => new Map())
  const [selection, setSelection] = useState<CellSelection>({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } })
  const [editingAddress, setEditingAddress] = useState<string | null>(null)
  const [pendingScheduleStatus, setPendingScheduleStatus] = useState<{ status: 'Plot' | 'Draft'; sheetName: string; range: XLSX.Range; rows: number[]; setup: ScheduleSetup } | null>(null)
  const [editorFont, setEditorFont] = useState<string | null>(null)
  useEffect(() => setEditorFont(null), [editingAddress, selectedSheet])
  useEffect(() => {
    if (!readOnly) return
    setEditingAddress(null)
    setRenamingSheet(null)
    setCellMenuPosition(null)
    setHeaderMenu(null)
    setSheetMenu(null)
    setIsScheduleSetupOpen(false)
    setPendingScheduleStatus(null)
  }, [readOnly])
  const [editNotice, setEditNotice] = useState('')

  useEffect(() => {
    if (!axisMoveNotice) return
    const timer = window.setTimeout(() => setAxisMoveNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [axisMoveNotice])

  const keepCellAnnotations = () => {
    if (annotationCloseTimerRef.current !== null) window.clearTimeout(annotationCloseTimerRef.current)
    annotationCloseTimerRef.current = null
  }
  const hideCellAnnotations = () => {
    keepCellAnnotations()
    setCellAnnotationHover(null)
  }
  const scheduleHideCellAnnotations = () => {
    keepCellAnnotations()
    annotationCloseTimerRef.current = window.setTimeout(() => {
      setCellAnnotationHover(null)
      annotationCloseTimerRef.current = null
    }, 180)
  }

  useEffect(() => {
    const user = auth.currentUser
    let cancelled = false
    if (user) {
      void getDoc(doc(db, 'users', user.uid)).then(snapshot => {
        if (cancelled) return
        const profile = snapshot.data()
        setCommentAuthor({ name: formatUserName(profile) || user.displayName || user.email?.split('@')[0] || 'You', id: user.uid, avatarUrl: typeof profile?.profilePicture === 'string' && profile.profilePicture ? profile.profilePicture : user.photoURL || undefined })
      }).catch(() => { /* Use the signed-in auth profile when the profile document is unavailable. */ })
    }
    return () => {
      cancelled = true
      if (annotationCloseTimerRef.current !== null) window.clearTimeout(annotationCloseTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    if (!workbook || isReading || historyFileRef.current !== file) {
      workbookSnapshotRef.current = null
      editHistoryRef.current.reset()
      historyFileRef.current = file
      return
    }
    // A committed render groups all state updates from one editing action.
    const snapshot = {
      workbook, previewStyles, sheetColors, addedRowsBySheet,
      rowHeightOverrides, columnWidthOverrides, cellTextOverrides,
      cellStyleOverrides, mergeOverrides, formattingOverrides, scheduleSetups, hiddenRangeToggles, selectedSheet, selection,
    }
    const normalized = ensureScheduleStatusColumns(snapshot)
    if (normalized !== snapshot) { restoreEdit(normalized); return }
    if (!readOnly && !editingAddress && facultySuggestions) {
      const names = !facultySuggestions.loading && !facultySuggestions.error ? facultySuggestions.names : EMPTY_FACULTY_NAMES
      const previous = normalizedFacultySourceRef.current
      if (!previous || previous.workbook !== workbook || previous.texts !== cellTextOverrides || previous.setups !== scheduleSetups || previous.names !== names) {
        const facultyNormalized = canonicalizeWorkbookFaculty(normalized, names)
        normalizedFacultySourceRef.current = { workbook: facultyNormalized.workbook, texts: facultyNormalized.cellTextOverrides, setups: scheduleSetups, names }
        if (facultyNormalized !== normalized) {
          editHistoryRef.current.transform(previous => canonicalizeWorkbookFaculty(previous, names))
          setWorkbook(facultyNormalized.workbook)
          setCellTextOverrides(facultyNormalized.cellTextOverrides)
          return
        }
      }
    }
    workbookSnapshotRef.current = snapshot
    setHasUnsavedChanges(!savedSnapshotRef.current || !sameWorkbookContent(savedSnapshotRef.current, snapshot))
    editHistoryRef.current.record(snapshot)
  }, [file, isReading, workbook, previewStyles, sheetColors, addedRowsBySheet, rowHeightOverrides, columnWidthOverrides, cellTextOverrides, cellStyleOverrides, mergeOverrides, formattingOverrides, scheduleSetups, hiddenRangeToggles, selectedSheet, selection, readOnly, editingAddress, facultySuggestions])

  // Whole-axis selections end at the sheet edge; restoring them must not scroll to that cell.
  const restoreEdit = (snapshot: WorkbookEditSnapshot, preserveScroll = Boolean(snapshot.selection.axis)) => {
    setSheetFilters(new Map())
    setFilterMenu(null)
    const scroller = sheetScrollRef.current
    const scroll = preserveScroll && scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null
    hideCellAnnotations()
    setAxisMoveNotice(null)
    setWorkbook(snapshot.workbook)
    setPreviewStyles(snapshot.previewStyles)
    setSheetColors(snapshot.sheetColors)
    setAddedRowsBySheet(snapshot.addedRowsBySheet)
    setRowHeightOverrides(snapshot.rowHeightOverrides)
    setColumnWidthOverrides(snapshot.columnWidthOverrides)
    setCellTextOverrides(snapshot.cellTextOverrides)
    setCellStyleOverrides(snapshot.cellStyleOverrides)
    setMergeOverrides(snapshot.mergeOverrides)
    setFormattingOverrides(snapshot.formattingOverrides)
    setScheduleSetups(snapshot.scheduleSetups)
    setHiddenRangeToggles(snapshot.hiddenRangeToggles)
    setScheduleNotice('')
    setSelectedSheet(snapshot.selectedSheet)
    setSelection(snapshot.selection)
    setEditingAddress(null)
    setRenamingSheet(null)
    setSheetMenu(null)
    setCellMenuPosition(null)
    setHeaderMenu(null)
    setSheetNameError('')
    setEditNotice('')
    setRenderedRowHeights([])
    requestAnimationFrame(() => {
      if (scroll && scroller) scroller.scrollTo(scroll.left, scroll.top)
      const setupDialog = document.querySelector<HTMLButtonElement>('[data-schedule-setup-dialog] button:not([disabled])')
      if (setupDialog) { setupDialog.focus({ preventScroll: Boolean(scroll) }); return }
      const axis = snapshot.selection.axis
      const header = scroll && axis ? gridRef.current?.querySelector<HTMLElement>(`[data-grid-axis="${axis}"][data-grid-index="${snapshot.selection.focus[axis === 'row' ? 'r' : 'c']}"]`) : null
      const address = XLSX.utils.encode_cell(snapshot.selection.focus)
      const focusTarget = header || sheetTableRef.current?.querySelector<HTMLElement>(`[data-cell="${address}"]`)
      focusTarget?.focus({ preventScroll: Boolean(scroll) })
      if (scroll && scroller) scroller.scrollTo(scroll.left, scroll.top)
    })
  }

  const applyLiveWorkbook = useLatestEvent((choice?: 'local' | 'remote') => {
    const update = liveWorkbook
    if (!update) return true
    // A queued update can become obsolete while the editor is loading or saving.
    if (update.isCurrent?.() === false) {
      if (liveConflict?.update === update) {
        setLiveConflict(undefined)
        setSaveError('')
      }
      return true
    }
    if (seenLiveWorkbookRef.current === update && !choice) return !liveConflict
    const local = workbookSnapshotRef.current
    if (!local || savingRef.current || isReading || loading || importing || editingAddress || isAxisDragging || isScheduleSetupOpen || pendingScheduleStatus || renamingSheet) return false
    const remote = ensureScheduleStatusColumns(update.snapshot)
    const baseline = savedSnapshotRef.current
    let snapshot = remote
    let conflicts: string[] = []
    let hasLocalChanges = false
    if (baseline) {
      const merged = mergeWorkbookSnapshots(baseline, local, remote, choice)
      snapshot = merged.snapshot
      conflicts = merged.conflicts
      hasLocalChanges = merged.hasLocalChanges
    } else if (!readOnly && !choice) {
      conflicts = ['Your unsaved workbook']
    } else if (!baseline && choice === 'local') {
      snapshot = local
      hasLocalChanges = true
    }
    seenLiveWorkbookRef.current = update
    if (conflicts.length && !choice) {
      setLiveConflict({ update, conflicts })
      setLiveNotice('')
      return false
    }
    const normalized = ensureScheduleStatusColumns(snapshot)
    if (!hasLocalChanges) importedSourceRef.current = null
    // Keeping an older source workbook must keep its XML archive too; the next
    // Storage save replaces the newer original instead of mixing both files.
    if (choice === 'local' && conflicts.includes('Workbook layout or source sheets') && persistenceMode === 'storage') {
      importedSourceRef.current ??= liveOriginalFileRef.current ?? null
    }
    liveOriginalFileRef.current = update.originalFile ?? liveOriginalFileRef.current
    // Remote saves form the new undo baseline. Undo cannot erase another user's
    // save, while any merged local edits remain undoable as one editing action.
    editHistoryRef.current.reset()
    editHistoryRef.current.record(remote)
    savedSnapshotRef.current = remote
    workbookSnapshotRef.current = normalized
    restoreEdit(normalized, true)
    setHasUnsavedChanges(hasLocalChanges || !sameSavedWorkbookContent(remote, normalized))
    setLiveConflict(undefined)
    setLiveNotice(hasLocalChanges ? 'Saved changes received. Your unsaved edits were kept.' : 'Saved changes received.')
    setSaveError('')
    update.onApplied()
    return true
  })

  useEffect(() => {
    applyLiveWorkbook()
  }, [liveWorkbook, isReading, loading, importing, isSaving, editingAddress, isAxisDragging, isScheduleSetupOpen, pendingScheduleStatus, renamingSheet, applyLiveWorkbook])

  const resolveLiveConflict = (choice: 'local' | 'remote') => {
    flushSync(() => cellTextEditorRef.current?.commit())
    applyLiveWorkbook(choice)
  }

  const saveWorkbook = useLatestEvent(async () => {
    if (!onSave || readOnly || isReading || loading || loadBlocked || importing || savingRef.current) return
    flushSync(() => { cellTextEditorRef.current?.commit() })
    if (!applyLiveWorkbook()) { setSaveError('Resolve the incoming saved changes before saving your workbook.'); return }
    const snapshot = workbookSnapshotRef.current
    if (!snapshot) return
    savingRef.current = true
    setIsSaving(true)
    setSaveError('')
    try {
      await onSave(persistenceMode === 'firestore' ? serializeFirestoreWorkbookState(snapshot) : serializeWorkbookState(snapshot), importedSourceRef.current)
      savedSnapshotRef.current = snapshot
      liveOriginalFileRef.current = importedSourceRef.current ?? liveOriginalFileRef.current
      importedSourceRef.current = null
      setLiveNotice('')
      setHasUnsavedChanges(Boolean(workbookSnapshotRef.current && !sameWorkbookContent(snapshot, workbookSnapshotRef.current)))
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'The workbook could not be saved. Try again.')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  })

  const openExportPicker = () => {
    if (!allowImportExport) return
    flushSync(() => { cellTextEditorRef.current?.commit() })
    setSheetMenu(null)
    setCellMenuPosition(null)
    setHeaderMenu(null)
    setExportError('')
    setIsExportPickerOpen(true)
  }
  const exportSheets = async (names: string[]) => {
    if (!allowImportExport || isExporting) return
    setIsExporting(true)
    setExportError('')
    try {
      const { createExcelExport } = await import('../utils/excelWorkbookExport')
      const snapshot = workbookSnapshotRef.current
      if (!snapshot) throw new Error('The workbook is not ready to export.')
      const bytes = createExcelExport(snapshot, names)
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const download = document.createElement('a')
      download.href = url
      download.download = `${(subtitle || file?.name.replace(/\.xlsx$/i, '') || 'Workbook').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'Workbook'}.xlsx`
      document.body.append(download)
      download.click()
      download.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setIsExportPickerOpen(false)
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : 'The workbook could not be exported. Try again.')
    } finally {
      setIsExporting(false)
    }
  }

  useEffect(() => {
    if (!onSave && !readOnly) return
    const handleSave = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        if (readOnly) return
        void saveWorkbook()
      }
    }
    document.addEventListener('keydown', handleSave, true)
    return () => document.removeEventListener('keydown', handleSave, true)
  }, [onSave, readOnly, saveWorkbook])

  useEffect(() => {
    const handleHistoryKeys = (event: KeyboardEvent) => {
      if (readOnly) return
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('textarea, input:not([type="checkbox"]):not([type="radio"])'))) return
      event.preventDefault()
      if (resizeDragRef.current || axisMoveDragRef.current) return
      const snapshot = key === 'y' || event.shiftKey ? editHistoryRef.current.redo() : editHistoryRef.current.undo()
      if (snapshot) restoreEdit(snapshot)
    }
    document.addEventListener('keydown', handleHistoryKeys)
    return () => document.removeEventListener('keydown', handleHistoryKeys)
  }, [file, readOnly])

  const sheetNames = useMemo(() => {
    if (!workbook) return []
    const visibleNames = workbook.SheetNames.filter((_, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden)
    return visibleNames.length ? visibleNames : workbook.SheetNames
  }, [workbook])
  const sheet = workbook && selectedSheet ? workbook.Sheets[selectedSheet] : null
  useEffect(() => setHeaderMenu(null), [file, selectedSheet])
  const highlightedCommentCell = useMemo(() => isCommentsOpen && hoveredSheetComment?.sheet === selectedSheet ? XLSX.utils.decode_cell(hoveredSheetComment.address) : null, [isCommentsOpen, hoveredSheetComment, selectedSheet])
  useEffect(() => setHoveredSheetComment(null), [selectedSheet, isCommentsOpen, sheet])
  const hoveredCell = cellAnnotationHover ? sheet?.[cellAnnotationHover.address] as XLSX.CellObject | undefined : undefined
  useEffect(() => {
    const scroller = sheetScrollRef.current
    scroller?.addEventListener('scroll', hideCellAnnotations, { passive: true })
    window.addEventListener('resize', hideCellAnnotations)
    return () => {
      scroller?.removeEventListener('scroll', hideCellAnnotations)
      window.removeEventListener('resize', hideCellAnnotations)
    }
  }, [sheet])
  const sheetMerges = mergeOverrides.get(selectedSheet) ?? sheet?.['!merges'] ?? EMPTY_MERGES
  const rawTextForCell = (address: string) => cellTextOverrides.get(selectedSheet)?.get(address) ?? getCellText(sheet?.[address])
  const isCellTextProtected = (address: string) => {
    const position = XLSX.utils.decode_cell(address)
    const merge = sheetMerges.find(range => rangeContains(range, { s: position, e: position }))
    return rangeIncludesScheduleStatus(merge ?? { s: position, e: position }, scheduleSetups.get(selectedSheet)?.statusColumn)
  }
  const textForCell = (address: string) => {
    const setup = scheduleSetups.get(selectedSheet)
    const position = XLSX.utils.decode_cell(address)
    return position.c === setup?.statusColumn ? scheduleStatusText(setup, position.r, (row, column) => rawTextForCell(XLSX.utils.encode_cell({ r: row, c: column }))) : rawTextForCell(address)
  }
  const editStyleForCell = (address: string): CSSProperties => cellStyleOverrides.get(selectedSheet)?.get(address) ?? {}
  const displayedRowHeight = (row: number) => rowHeightOverrides.get(selectedSheet)?.get(row) ?? getRowHeight(sheet, row)
  const displayedColumnWidth = (column: number) => columnWidthOverrides.get(selectedSheet)?.get(column) ?? getColumnWidth(sheet, column)
  const getGridHeaderWidth = () => {
    const header = rowHeaderContainerRef.current
    return header ? Number.parseFloat(getComputedStyle(header).width) : 0
  }
  const sheetFormatting = useMemo(() => formattingOverrides.get(selectedSheet) ?? readSheetPreviewFormatting(previewStyles, selectedSheet), [previewStyles, selectedSheet, formattingOverrides])
  const workbookStyleCache = useMemo(() => new Map<string, CSSProperties>(), [sheetFormatting, previewStyles])
  const styleForCell = (address: string): CSSProperties => {
    const cached = workbookStyleCache.get(address)
    if (cached) return cached
    const cell = XLSX.utils.decode_cell(address)
    const styleId = sheetFormatting.indexes.get(address)
      ?? sheetFormatting.rowIndexes.get(cell.r)
      ?? sheetFormatting.columnIndexes.find(column => cell.c >= column.first && cell.c <= column.last)?.styleId
      ?? 0
    const style = previewStyles?.cellStyles[styleId] || {}
    workbookStyleCache.set(address, style)
    return style
  }
  const resolvedBordersFor = (range: XLSX.Range, explicitOnly = false): CSSProperties => {
    const borders: Partial<Record<BorderSide, string>> = {
    }
    const includeBorder = (row: number, column: number, side: BorderSide, edge: BorderSide) => {
      if (row < 0 || column < 0) return
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      // An override belongs to this cell's edge, not to the neighboring cell's edge.
      const border = editStyleForCell(address)[side] ?? styleForCell(address)[side]
      if (typeof border === 'string') borders[edge] = strongerBorder(borders[edge], border)
    }
    for (let column = range.s.c; column <= range.e.c; column++) {
      includeBorder(range.s.r, column, 'borderTop', 'borderTop')
      includeBorder(range.s.r - 1, column, 'borderBottom', 'borderTop')
      includeBorder(range.e.r, column, 'borderBottom', 'borderBottom')
      includeBorder(range.e.r + 1, column, 'borderTop', 'borderBottom')
    }
    for (let row = range.s.r; row <= range.e.r; row++) {
      includeBorder(row, range.s.c, 'borderLeft', 'borderLeft')
      includeBorder(row, range.s.c - 1, 'borderRight', 'borderLeft')
      includeBorder(row, range.e.c, 'borderRight', 'borderRight')
      includeBorder(row, range.e.c + 1, 'borderLeft', 'borderRight')
    }
    const resolveBorder = (side: BorderSide, outerEdge: boolean) => {
      const border = borders[side]
      if (explicitOnly) return border ?? 'none'
      if (outerEdge) return 'none'
      return border && border !== 'none' ? border : DEFAULT_GRIDLINE
    }
    return {
      borderTop: resolveBorder('borderTop', range.s.r <= rowStart),
      borderRight: resolveBorder('borderRight', range.e.c >= columnEnd),
      borderBottom: resolveBorder('borderBottom', range.e.r >= rowEnd),
      borderLeft: resolveBorder('borderLeft', range.s.c <= columnStart),
    }
  }
  const conditionalStyleForCell = (address: string): CSSProperties => {
    const position = XLSX.utils.decode_cell(address)
    const cell = sheet?.[address]
    const result: CSSProperties = {}
    for (const rule of sheetFormatting.conditionalRules) {
      const matchesRange = rule.ranges.some(range => position.r >= range.s.r && position.r <= range.e.r && position.c >= range.s.c && position.c <= range.e.c)
      if (!matchesRange) continue
      const editedText = cellTextOverrides.get(selectedSheet)?.get(address)
      const matchesRule = rule.type === 'notContainsBlanks'
        ? textForCell(address).trim() !== ''
        : rule.type === 'cellIs' && rule.operator === 'lessThan' && textForCell(address).trim() !== '' && Number.isFinite(Number(editedText ?? cell?.v)) && Number(editedText ?? cell?.v) < rule.threshold
      if (matchesRule) Object.assign(result, rule.style)
    }
    return result
  }
  const bounds = useMemo(() => {
    if (!sheet) return null
    const contentBounds = getSheetBounds(sheet, cellTextOverrides.get(selectedSheet))
    const rememberedRanges = hiddenRangeToggles.get(selectedSheet)
    let lastColumn = rememberedRanges?.column.reduce((last, range) => Math.max(last, range.end), contentBounds.lastColumn) ?? contentBounds.lastColumn
    let columnWidth = 0
    for (let column = 0; column <= lastColumn; column++) {
      if (!sheet['!cols']?.[column]?.hidden) columnWidth += displayedColumnWidth(column)
    }
    while (columnWidth < sheetViewportWidth) {
      lastColumn++
      if (!sheet['!cols']?.[lastColumn]?.hidden) columnWidth += displayedColumnWidth(lastColumn)
    }
    const lastRow = contentBounds.lastRow + TRAILING_EMPTY_ROWS + (addedRowsBySheet.get(selectedSheet) ?? 0)
    return { ...contentBounds, lastColumn, lastRow: rememberedRanges?.row.reduce((last, range) => Math.max(last, range.end), lastRow) ?? lastRow }
  }, [sheet, selectedSheet, cellTextOverrides, addedRowsBySheet, columnWidthOverrides, sheetViewportWidth, hiddenRangeToggles])
  useLayoutEffect(() => {
    const scroller = sheetScrollRef.current
    if (!scroller) return
    const updateWidth = () => setSheetViewportWidth(scroller.clientWidth - getGridHeaderWidth())
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(scroller)
    if (rowHeaderContainerRef.current) observer.observe(rowHeaderContainerRef.current)
    return () => observer.disconnect()
  }, [sheet])
  const visibleRows = useMemo(() => bounds
    ? Array.from({ length: bounds.lastRow + 1 }, (_, row) => row).filter(row => !sheet?.['!rows']?.[row]?.hidden)
    : [], [bounds, sheet])
  const visibleColumns = useMemo(() => bounds
    ? Array.from({ length: bounds.lastColumn + 1 }, (_, column) => column).filter(column => !sheet?.['!cols']?.[column]?.hidden)
    : [], [bounds, sheet])
  const sheetFilter = showFilters ? sheetFilters.get(selectedSheet) : undefined
  const readFilterCell = useMemo(() => worksheetFilterReader((row, column) => textForCell(XLSX.utils.encode_cell({ r: row, c: column })), sheetMerges), [sheet, selectedSheet, cellTextOverrides, scheduleSetups, sheetMerges])
  const rows = useMemo(() => filterWorksheetRows(visibleRows, sheetFilter, readFilterCell), [visibleRows, sheetFilter, readFilterCell])
  const rowsToAddCount = Number(rowsToAdd)
  const canAddRows = Number.isSafeInteger(rowsToAddCount) && rowsToAddCount > 0 && rowsToAddCount <= MAX_ROWS_TO_ADD
  const addRows = () => {
    if (readOnly) return
    if (!sheet || !bounds || !canAddRows) return
    setAddedRowsBySheet(current => new Map(current).set(selectedSheet, (current.get(selectedSheet) ?? 0) + rowsToAddCount))
    requestAnimationFrame(() => sheetScrollRef.current?.scrollTo({ top: sheetScrollRef.current.scrollHeight }))
  }
  const columns = visibleColumns
  const rowStart = rows[0] ?? 0
  const rowEnd = rows[rows.length - 1] ?? -1
  const columnStart = columns[0] ?? 0
  const columnEnd = columns[columns.length - 1] ?? -1
  const rowIndicators = useMemo(() => axisVisibilityIndicators(bounds?.lastRow ?? -1, visibleRows, sheet?.['!rows'], hiddenRangeToggles.get(selectedSheet)?.row ?? []), [bounds, visibleRows, sheet, hiddenRangeToggles, selectedSheet])
  const columnIndicators = useMemo(() => axisVisibilityIndicators(bounds?.lastColumn ?? -1, columns, sheet?.['!cols'], hiddenRangeToggles.get(selectedSheet)?.column ?? []), [bounds, columns, sheet, hiddenRangeToggles, selectedSheet])
  const shownRowRanges = useMemo(() => shownAxisRanges(bounds?.lastRow ?? -1, sheet?.['!rows'], hiddenRangeToggles.get(selectedSheet)?.row ?? []), [bounds, sheet, hiddenRangeToggles, selectedSheet])
  const shownColumnRanges = useMemo(() => shownAxisRanges(bounds?.lastColumn ?? -1, sheet?.['!cols'], hiddenRangeToggles.get(selectedSheet)?.column ?? []), [bounds, sheet, hiddenRangeToggles, selectedSheet])
  const rowResizeSize = (row: number, index: number) => rowHeightOverrides.get(selectedSheet)?.get(row) ?? renderedRowHeights[index] ?? getRowHeight(sheet, row)
  const menuSheetName = sheetMenu?.type === 'sheet' ? sheetMenu.name : null
  const menuSheetHidden = Boolean(menuSheetName && workbook?.Workbook?.Sheets?.[workbook.SheetNames.indexOf(menuSheetName)]?.Hidden)
  const menuFromAllSheets = sheetMenu?.type === 'sheet' && Boolean(sheetMenu.listPosition)
  const menuSheetOrder = menuFromAllSheets || menuSheetHidden ? workbook?.SheetNames || [] : sheetNames
  const allSheetsMenuPosition = sheetMenu?.type === 'list' ? sheetMenuPosition : sheetMenu?.listPosition
  const menuItemClass = 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a] disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent'

  useLayoutEffect(() => {
    const tabs = sheetTabsRef.current
    if (!tabs) return
    const updateArrows = () => {
      setCanScrollSheetsLeft(tabs.scrollLeft > 1)
      setCanScrollSheetsRight(tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1)
    }
    updateArrows()
    tabs.addEventListener('scroll', updateArrows, { passive: true })
    const scrollWithWheel = (event: WheelEvent) => {
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      const multiplier = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? tabs.clientWidth : 1
      tabs.scrollLeft += event.deltaY * multiplier
    }
    tabs.addEventListener('wheel', scrollWithWheel, { passive: false })
    const observer = new ResizeObserver(updateArrows)
    observer.observe(tabs)
    return () => {
      tabs.removeEventListener('scroll', updateArrows)
      tabs.removeEventListener('wheel', scrollWithWheel)
      observer.disconnect()
    }
  }, [sheetNames, renamingSheet])

  const scrollSheets = (direction: -1 | 1) => {
    const tabs = sheetTabsRef.current
    if (tabs) tabs.scrollBy({ left: direction * Math.max(160, tabs.clientWidth * 0.7), behavior: 'smooth' })
  }

  const selectSheet = (name: string) => {
    setIsScheduleSetupOpen(false)
    setScheduleNotice('')
    hideCellAnnotations()
    setCellMenuPosition(null)
    setSelectedSheet(name)
    setSelection({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } })
    setEditingAddress(null)
    setEditNotice('')
    setSheetMenu(null)
    sheetScrollRef.current?.scrollTo(0, 0)
    requestAnimationFrame(() => sheetTabButtonRefs.current.get(name)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }))
  }

  const viewSheetComments = (name: string) => {
    const index = workbook?.SheetNames.indexOf(name) ?? -1
    if (index >= 0 && workbook?.Workbook?.Sheets?.[index]?.Hidden) setSheetHidden(name, false, true)
    else if (selectedSheet !== name) selectSheet(name)
    hideCellAnnotations()
    setCellMenuPosition(null)
    setSheetMenu(null)
    setIsCommentsOpen(true)
  }

  const openMenu = (target: SheetMenuTarget, element: HTMLElement) => {
    sheetMenuContextPointRef.current = null
    hideCellAnnotations()
    const anchor = target.type === 'sheet' ? element.closest<HTMLElement>('[data-sheet-tab]') || element : element
    const rect = anchor.getBoundingClientRect()
    const menuWidth = Math.min(target.type === 'list' ? 384 : 224, window.innerWidth - 16)
    setSheetMenuPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)), bottom: window.innerHeight - rect.top + 4 })
    setSheetMenuView('main')
    setSheetMenu(current => current?.type === target.type && (current.type !== 'sheet' || target.type !== 'sheet' || current.name === target.name) ? null : target)
  }

  useLayoutEffect(() => {
    const point = sheetMenuContextPointRef.current
    const menu = sheetMenuRef.current
    if (!sheetMenu || !point || !menu) return
    const { width, height } = menu.getBoundingClientRect()
    const besideList = point.listRight + width + 4 <= window.innerWidth - 8 ? point.listRight + 4 : point.listLeft - width - 4
    const left = Math.max(8, Math.min(besideList, window.innerWidth - width - 8))
    const top = Math.max(8, Math.min(point.y, window.innerHeight - height - 8))
    setSheetMenuPosition({ left, bottom: window.innerHeight - top - height })
    menu.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [sheetMenu, sheetMenuView])

  useEffect(() => {
    if (!sheetMenu) return
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (sheetMenuRef.current?.contains(target) || allSheetsMenuRef.current?.contains(target)) return
      // Let the tab/arrow click toggle the current menu without dismissing it first.
      if (target instanceof Element && target.closest('[data-sheet-tab], [data-all-sheets-trigger]')) return
      setSheetMenu(null)
    }
    document.addEventListener('pointerdown', dismissOutside, true)
    return () => document.removeEventListener('pointerdown', dismissOutside, true)
  }, [sheetMenu])

  const trapSheetMenuFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
    if (!controls.length) return
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus() }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus() }
    event.stopPropagation()
  }

  const addSheet = () => {
    if (readOnly || !allowSheetCreationAndRemoval) return
    if (!workbook) return
    let number = 1
    while (workbook.SheetNames.some(name => name.toLowerCase() === `sheet${number}`.toLowerCase())) number++
    const name = `Sheet${number}`
    const newSheet = XLSX.utils.aoa_to_sheet([])
    newSheet['!ref'] = 'A1:Z1'
    setWorkbook({
      ...workbook,
      SheetNames: [...workbook.SheetNames, name],
      Sheets: { ...workbook.Sheets, [name]: newSheet },
      Workbook: { ...workbook.Workbook, Sheets: [...workbook.SheetNames.map((sheetName, index) => ({ ...workbook.Workbook?.Sheets?.[index], name: sheetName })), { name, Hidden: 0 }] },
    })
    setAddedRowsBySheet(current => new Map(current).set(name, 50 - TRAILING_EMPTY_ROWS))
    selectSheet(name)
  }

  const startRenamingSheet = (name: string, tabButton = sheetTabButtonRefs.current.get(name)) => {
    if (readOnly || !workbook?.Sheets[name]) return
    const index = workbook.SheetNames.indexOf(name)
    if (workbook.Workbook?.Sheets?.[index]?.Hidden) setSheetHidden(name, false)
    skipRenameBlurRef.current = false
    setRenameTabStyle({ width: tabButton?.offsetWidth ?? 120, letterSpacing: tabButton ? getComputedStyle(tabButton).letterSpacing : 'normal' })
    setSheetNameDraft(name)
    setSheetNameError('')
    setRenamingSheet(name)
    setSheetMenu(null)
  }

  useLayoutEffect(() => {
    if (!renamingSheet) return
    const input = sheetRenameInputRef.current
    if (!input) return
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    input.focus({ preventScroll: true })
    input.select()
  }, [renamingSheet])

  const duplicateSheet = (name: string) => {
    if (readOnly || !allowSheetCreationAndRemoval) return
    if (!workbook) return
    const copyName = nextSheetName(workbook.SheetNames, `${name} copy`)
    const index = workbook.SheetNames.indexOf(name)
    const names = [...workbook.SheetNames]
    names.splice(index + 1, 0, copyName)
    const properties = workbook.SheetNames.map((sheetName, position) => ({ ...workbook.Workbook?.Sheets?.[position], name: sheetName }))
    properties.splice(index + 1, 0, { ...properties[index], name: copyName, Hidden: 0 })
    setWorkbook({ ...workbook, SheetNames: names, Sheets: { ...workbook.Sheets, [copyName]: workbook.Sheets[name] }, Workbook: { ...workbook.Workbook, Sheets: properties } })
    setPreviewStyles(current => current ? { ...current, sheetPaths: { ...current.sheetPaths, [copyName]: current.sheetPaths[name] } } : current)
    setAddedRowsBySheet(current => copyMapEntry(current, name, copyName, value => value))
    setRowHeightOverrides(current => copyMapEntry(current, name, copyName, value => new Map(value)))
    setColumnWidthOverrides(current => copyMapEntry(current, name, copyName, value => new Map(value)))
    setCellTextOverrides(current => copyMapEntry(current, name, copyName, value => new Map(value)))
    setCellStyleOverrides(current => copyMapEntry(current, name, copyName, value => new Map(value)))
    setMergeOverrides(current => copyMapEntry(current, name, copyName, value => value.map(merge => ({ s: { ...merge.s }, e: { ...merge.e } }))))
    setFormattingOverrides(current => copyMapEntry(current, name, copyName, value => value))
    setScheduleSetups(current => copyMapEntry(current, name, copyName, value => ({ ...value, header: { s: { ...value.header.s }, e: { ...value.header.e } }, columns: [...value.columns], years: new Map(value.years), ...(value.rowStatuses ? { rowStatuses: new Map(value.rowStatuses) } : {}), ...(value.statusStyles ? { statusStyles: new Map(value.statusStyles) } : {}) })))
    setHiddenRangeToggles(current => copyMapEntry(current, name, copyName, value => ({ row: [...value.row], column: [...value.column] })))
    setSheetColors(current => copyMapEntry(current, name, copyName, value => value))
    selectSheet(copyName)
  }

  const renameSheet = (name: string) => {
    if (readOnly) return
    if (!workbook) return
    const nextName = sheetNameDraft.trim()
    if (!nextName || nextName.length > 31 || /[:\\/?*\[\]]/.test(nextName)) {
      setSheetNameError('Use 1–31 characters without : \\ / ? * [ or ].')
      requestAnimationFrame(() => sheetRenameInputRef.current?.focus())
      return
    }
    if (workbook.SheetNames.some(existing => existing !== name && existing.toLowerCase() === nextName.toLowerCase())) {
      setSheetNameError('A sheet with this name already exists.')
      requestAnimationFrame(() => sheetRenameInputRef.current?.focus())
      return
    }
    if (nextName === name) {
      setRenamingSheet(null)
      setSheetNameError('')
      return
    }
    const sheets = { ...workbook.Sheets, [nextName]: workbook.Sheets[name] }
    delete sheets[name]
    setWorkbook({
      ...workbook,
      SheetNames: workbook.SheetNames.map(existing => existing === name ? nextName : existing),
      Sheets: sheets,
      Workbook: { ...workbook.Workbook, Sheets: workbook.SheetNames.map((existing, index) => ({ ...workbook.Workbook?.Sheets?.[index], name: existing === name ? nextName : existing })) },
    })
    setPreviewStyles(current => {
      if (!current?.sheetPaths[name]) return current
      const sheetPaths = { ...current.sheetPaths, [nextName]: current.sheetPaths[name] }
      delete sheetPaths[name]
      return { ...current, sheetPaths }
    })
    setAddedRowsBySheet(current => moveMapKey(current, name, nextName))
    setRowHeightOverrides(current => moveMapKey(current, name, nextName))
    setColumnWidthOverrides(current => moveMapKey(current, name, nextName))
    setCellTextOverrides(current => moveMapKey(current, name, nextName))
    setCellStyleOverrides(current => moveMapKey(current, name, nextName))
    setMergeOverrides(current => moveMapKey(current, name, nextName))
    setFormattingOverrides(current => moveMapKey(current, name, nextName))
    setScheduleSetups(current => moveMapKey(current, name, nextName))
    setHiddenRangeToggles(current => moveMapKey(current, name, nextName))
    setSheetColors(current => moveMapKey(current, name, nextName))
    setSheetFilters(current => moveMapKey(current, name, nextName))
    if (selectedSheet === name) setSelectedSheet(nextName)
    setRenamingSheet(null)
    setSheetNameError('')
  }

  const deleteSheet = (name: string) => {
    if (readOnly || !allowSheetCreationAndRemoval) return
    if (!workbook || !workbook.SheetNames.includes(name)) return
    setSheetFilters(current => removeMapKey(current, name))
    setFilterMenu(null)
    const index = workbook.SheetNames.indexOf(name)
    const remainingNames = workbook.SheetNames.filter(existing => existing !== name)
    const nextSheet = selectedSheet === name ? sheetNames.find(existing => existing !== name) ?? remainingNames[0] ?? '' : selectedSheet
    const listPosition = allSheetsMenuPosition
    const sheets = { ...workbook.Sheets }
    delete sheets[name]
    setWorkbook({
      ...workbook,
      SheetNames: remainingNames,
      Sheets: sheets,
      Workbook: { ...workbook.Workbook, Sheets: workbook.SheetNames.flatMap((existing, position) => existing === name ? [] : [{ ...workbook.Workbook?.Sheets?.[position], name: existing, ...(existing === nextSheet ? { Hidden: 0 as const } : {}) }]) },
    })
    setPreviewStyles(current => {
      if (!current?.sheetPaths[name]) return current
      const sheetPaths = { ...current.sheetPaths }
      delete sheetPaths[name]
      return { ...current, sheetPaths }
    })
    setAddedRowsBySheet(current => removeMapKey(current, name))
    setRowHeightOverrides(current => removeMapKey(current, name))
    setColumnWidthOverrides(current => removeMapKey(current, name))
    setCellTextOverrides(current => removeMapKey(current, name))
    setCellStyleOverrides(current => removeMapKey(current, name))
    setMergeOverrides(current => removeMapKey(current, name))
    setFormattingOverrides(current => removeMapKey(current, name))
    setScheduleSetups(current => removeMapKey(current, name))
    setHiddenRangeToggles(current => removeMapKey(current, name))
    setSheetColors(current => removeMapKey(current, name))
    if (selectedSheet === name) selectSheet(nextSheet)
    if (listPosition && remainingNames.length) {
      sheetMenuContextPointRef.current = null
      setSheetMenuPosition(listPosition)
      setSheetMenu({ type: 'list' })
      requestAnimationFrame(() => {
        const buttons = allSheetsMenuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        buttons?.item(Math.min(index, buttons.length - 1))?.focus({ preventScroll: true })
      })
    } else setSheetMenu(null)
  }

  const setSheetHidden = (name: string, hidden: boolean, forViewing = false) => {
    if (readOnly && !(forViewing && !hidden)) return
    if (!workbook || (hidden && sheetNames.length <= 1)) return
    const listPosition = forViewing ? undefined : allSheetsMenuPosition
    const index = workbook.SheetNames.indexOf(name)
    setWorkbook({
      ...workbook,
      Workbook: { ...workbook.Workbook, Sheets: workbook.SheetNames.map((existing, position) => ({ ...workbook.Workbook?.Sheets?.[position], name: existing, Hidden: position === index ? hidden ? 1 as const : 0 as const : workbook.Workbook?.Sheets?.[position]?.Hidden })) },
    })
    if (hidden && selectedSheet === name) selectSheet(sheetNames.find(existing => existing !== name) ?? name)
    if (!hidden && forViewing) selectSheet(name)
    if (listPosition) {
      sheetMenuContextPointRef.current = null
      setSheetMenuPosition(listPosition)
      setSheetMenu({ type: 'list' })
      requestAnimationFrame(() => sheetListContextAnchorRef.current?.focus({ preventScroll: true }))
    } else setSheetMenu(null)
  }

  const moveSheet = (name: string, direction: -1 | 1) => {
    if (readOnly) return
    if (!workbook) return
    const listPosition = allSheetsMenuPosition
    const orderedNames = listPosition || !sheetNames.includes(name) ? workbook.SheetNames : sheetNames
    const adjacentName = orderedNames[orderedNames.indexOf(name) + direction]
    if (!adjacentName) return
    const index = workbook.SheetNames.indexOf(name)
    const nextIndex = workbook.SheetNames.indexOf(adjacentName)
    const names = [...workbook.SheetNames]
    const properties = workbook.SheetNames.map((existing, position) => ({ ...workbook.Workbook?.Sheets?.[position], name: existing }))
    ;[names[index], names[nextIndex]] = [names[nextIndex], names[index]]
    ;[properties[index], properties[nextIndex]] = [properties[nextIndex], properties[index]]
    setWorkbook({ ...workbook, SheetNames: names, Workbook: { ...workbook.Workbook, Sheets: properties } })
    if (listPosition) {
      sheetMenuContextPointRef.current = null
      setSheetMenuPosition(listPosition)
      setSheetMenu({ type: 'list' })
      requestAnimationFrame(() => sheetListContextAnchorRef.current?.focus({ preventScroll: true }))
    } else setSheetMenu(null)
  }
  const scheduleSetup = scheduleSetups.get(selectedSheet)
  const readScheduleCell = (row: number, column: number) => textForCell(XLSX.utils.encode_cell({ r: row, c: column }))
  const currentScheduleHeaderError = useMemo(() => scheduleSetup ? validateScheduleHeader(scheduleSetup.header, readScheduleCell, scheduleSetup.columns) : null, [scheduleSetup, sheet, selectedSheet, cellTextOverrides])
  const sheetWidth = columns.reduce((width, column) => width + displayedColumnWidth(column), 0)
  const visibleMerges = useMemo(() => worksheetDisplayMerges(rows, columns, sheetMerges), [sheetMerges, rows, columns])
  const rawSelectedRange = useMemo(() => selectionRange(selection), [selection])
  const selectedRange = useMemo(() => selection.axis ? rawSelectedRange : expandSelectionForMerges(rawSelectedRange, sheetMerges), [rawSelectedRange, sheetMerges, selection.axis])
  const selectionHighlightRange = useMemo(() => currentScheduleHeaderError || selection.axis ? selectedRange : scheduleStatusSelectionHighlight(scheduleSetup, selectedRange), [currentScheduleHeaderError, selection.axis, selectedRange, scheduleSetup])
  const formattingStatus = scheduleSetup?.statusColumn !== undefined && selectedRange.s.c <= scheduleSetup.statusColumn && selectedRange.e.c >= scheduleSetup.statusColumn
  const selectedStatusText = useMemo(() => selectionHasScheduleStatusText(scheduleSetup, selectedRange, readScheduleCell), [scheduleSetup, selectedRange, sheet, selectedSheet, cellTextOverrides])
  const selectedAddress = XLSX.utils.encode_cell(selectedRange.s)
  const toggleFilters = () => {
    flushSync(() => cellTextEditorRef.current?.commit())
    setFilterMenu(null)
    if (sheetFilter) { setSheetFilters(current => removeMapKey(current, selectedSheet)); return }
    if (!sheet) return
    const content = getSheetBounds(sheet, cellTextOverrides.get(selectedSheet))
    const header = scheduleSetup ? { s: { ...scheduleSetup.header.s }, e: { ...scheduleSetup.header.e, c: scheduleSetup.statusColumn ?? scheduleSetup.header.e.c } }
      : { s: { r: selectedRange.s.r, c: selectedRange.s.c === selectedRange.e.c ? content.firstColumn : selectedRange.s.c },
        e: { r: selectedRange.s.r, c: selectedRange.s.c === selectedRange.e.c ? content.lastColumn : selectedRange.e.c } }
    for (const merge of sheetMerges) {
      if (merge.s.r <= header.e.r && merge.e.r >= header.s.r && merge.s.c <= header.e.c && merge.e.c >= header.s.c) header.e.r = Math.max(header.e.r, merge.e.r)
    }
    setSheetFilters(current => new Map(current).set(selectedSheet, { header, lastRow: Math.max(header.e.r, content.lastRow), values: new Map() }))
  }
  const applyColumnFilter = (selected: ReadonlySet<string> | undefined) => {
    if (!sheetFilter || !filterMenu) return
    const values = new Map(sheetFilter.values)
    if (selected) values.set(filterMenu.column, selected); else values.delete(filterMenu.column)
    setSheetFilters(current => new Map(current).set(selectedSheet, { ...sheetFilter, values }))
  }
  const selectedMerge = sheetMerges.find(merge => rangeContains(merge, selectedRange) && rangeContains(selectedRange, merge))
  const selectedStyle = useMemo<CSSProperties>(() => {
    const style: CSSProperties = {
      ...styleForCell(selectedAddress),
      ...conditionalStyleForCell(selectedAddress),
      ...editStyleForCell(selectedAddress),
    }
    if (!style.textAlign && sheet?.[selectedAddress]?.t === 'n') style.textAlign = 'right'
    if (!style.verticalAlign) style.verticalAlign = 'bottom'
    const selectedFontCell = sheet?.[selectedAddress] as ExcelFontCell | undefined
    if (selectedFontCell?.previewTypingFont) style.fontFamily = selectedFontCell.previewTypingFont
    if (editingAddress && editorFont) style.fontFamily = editorFont
    return style
  }, [selectedAddress, selectedSheet, sheet, sheetFormatting, previewStyles, cellTextOverrides, cellStyleOverrides, editingAddress, editorFont, scheduleSetup])

  const selectedScheduleColumns = useMemo(() => Array.from({ length: selectedRange.e.c - selectedRange.s.c + 1 }, (_, index) => selectedRange.s.c + index), [selectedRange])
  const selectedPlottableRows = useMemo(() => scheduleSetup && !currentScheduleHeaderError
    ? selectedScheduleRows(scheduleSetup, selectedRange, readScheduleCell) : [], [scheduleSetup, currentScheduleHeaderError, selectedRange, sheet, selectedSheet, cellTextOverrides])
  const selectedRowsPlotted = selectedPlottableRows.length > 0 && selectedPlottableRows.every(row => scheduleSetup?.rowStatuses?.get(row) === 'Plot')
  const canUnplotScheduleRows = selectedPlottableRows.some(row => scheduleSetup?.rowStatuses?.get(row) === 'Plot')
  const editingFacultySuggestions = useMemo(() => {
    if (readOnly || !facultySuggestions || !editingAddress || !scheduleSetup || currentScheduleHeaderError) return undefined
    const position = XLSX.utils.decode_cell(editingAddress)
    return position.r > scheduleSetup.header.e.r && [scheduleSetup.columns[13], scheduleSetup.columns[14]].includes(position.c) ? facultySuggestions : undefined
  }, [readOnly, facultySuggestions, editingAddress, scheduleSetup, currentScheduleHeaderError])
  const scheduleValidation = useMemo(() => {
    if (!scheduleSetup || currentScheduleHeaderError) return validateExcelSchedule([])
    const readValidationCell = (row: number, column: number) => {
      if (column < scheduleSetup.columns[13] || column > scheduleSetup.columns[20]) return readScheduleCell(row, column)
      const merge = sheetMerges.find(range => row >= range.s.r && row <= range.e.r && column >= range.s.c && column <= range.e.c)
      return readScheduleCell(merge?.s.r ?? row, merge?.s.c ?? column)
    }
    const faculty = facultyDepartmentCode && facultySuggestions && !facultySuggestions.loading && !facultySuggestions.error ? { departmentCode: facultyDepartmentCode, names: facultySuggestions.names } : undefined
    return validateExcelSchedule(readAssignedScheduleRecords(scheduleSetup, readValidationCell), validationRooms, faculty)
  }, [scheduleSetup, currentScheduleHeaderError, sheet, selectedSheet, cellTextOverrides, sheetMerges, validationRooms, facultyDepartmentCode, facultySuggestions])
  const pendingScheduleIssues = useMemo(() => pendingScheduleStatus?.status === 'Plot' && pendingScheduleStatus.sheetName === selectedSheet
    ? scheduleValidationIssuesForRows(scheduleValidation, pendingScheduleStatus.rows) : [], [pendingScheduleStatus, selectedSheet, scheduleValidation])
  const validationKindForRange = (range: XLSX.Range) => {
    if (!scheduleSetup || range.s.c < scheduleSetup.header.s.c || range.e.c > (scheduleSetup.statusColumn ?? scheduleSetup.header.e.c)) return null
    let duplicate = false
    let missing = false
    for (let row = range.s.r; row <= range.e.r; row++) {
      if (scheduleValidation.overlapRows.has(row)) return 'overlap'
      if (scheduleValidation.invalidRoomRows.has(row)) return 'room'
      if (scheduleValidation.invalidFacultyRows.has(row)) return 'faculty'
      if (scheduleValidation.duplicateSubjectRows.has(row)) duplicate = true
      if (scheduleValidation.missingValueRows.has(row)) missing = true
    }
    return duplicate ? 'duplicate' : missing ? 'missing' : null
  }
  const validationMessagesForRange = (range: XLSX.Range) => {
    if (!validationKindForRange(range)) return []
    const messages = new Set<string>()
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (const message of scheduleValidation.messagesForRow(row)) messages.add(message)
      for (const message of scheduleValidation.missingMessagesForRow(row)) messages.add(message)
    }
    return [...messages]
  }
  const validationToneForRange = (range: XLSX.Range) => {
    const kind = validationKindForRange(range)
    return kind === 'overlap' || kind === 'room' || kind === 'faculty' ? 'danger' as const : kind === 'missing' ? 'warning' as const : 'purple' as const
  }
  const { showValidationTooltip, hideValidationTooltip, validationTooltip } = useExcelValidationTooltip(validationMessagesForRange, validationToneForRange)
  // Cell content changes with the worksheet, not with selection, menus or hover state.
  const previewRows = useMemo(() => rows.map(row => ({ row, cells: columns.flatMap(column => {
    const address = XLSX.utils.encode_cell({ r: row, c: column })
    const merge = visibleMerges.get(address)
    if (merge && (row !== merge.firstRow || column !== merge.firstColumn)) return []
    const sourceAddress = merge?.anchor || address
    const sourceCell = sheet?.[sourceAddress] as ExcelFontCell | undefined
    const range = merge?.source || { s: { r: row, c: column }, e: { r: row, c: column } }
    const style: CSSProperties = { ...styleForCell(sourceAddress), ...conditionalStyleForCell(sourceAddress), ...editStyleForCell(sourceAddress), ...resolvedBordersFor(range) }
    const kind = validationKindForRange(range)
    if (kind) style.backgroundColor = kind === 'overlap' || kind === 'room' || kind === 'faculty' ? '#fca5a5' : kind === 'duplicate' ? '#c4b5fd' : '#fde047'
    if (!style.textAlign && sourceCell?.t === 'n') style.textAlign = 'right'
    if (!style.verticalAlign) style.verticalAlign = 'bottom'
    if (!style.fontFamily) style.fontFamily = 'Arial'
    const text = merge?.continuation ? '' : textForCell(sourceAddress)
    const runs = fontRunsForCell(sourceCell, text, String(style.fontFamily))
    const rotation = Number.parseFloat(String(style.rotate || '0')) || 0
    const rotatedStyle = { ...style }
    const transformed = rotation !== 0 || ['vertical-rl', 'vertical-lr', 'sideways-rl', 'sideways-lr'].includes(String(style.writingMode))
    delete style.rotate
    if (transformed) { delete style.writingMode; delete style.textOrientation }
    const cell: ExcelPreviewCellData = {
      row, column, address, sourceAddress, range, rowSpan: merge?.rowSpan, columnSpan: merge?.columnSpan,
      style, rotatedStyle, text, runs, typingFont: sourceCell?.previewTypingFont || String(style.fontFamily), rotation, transformed,
      link: !merge?.continuation && sourceCell?.l && /^(https?:|mailto:)/i.test(sourceCell.l.Target) ? sourceCell.l.Target : null,
      annotation: !merge?.continuation && sourceCell?.c?.some(isVisibleAnnotation) ? sourceCell.c.some(comment => comment.T && isVisibleAnnotation(comment)) ? 'comment' : 'note' : null,
      revealed: shownRowRanges.some(shown => range.s.r <= shown.end && range.e.r >= shown.start) || shownColumnRanges.some(shown => range.s.c <= shown.end && range.e.c >= shown.start),
      mergedContinuation: merge?.continuation,
      textReadOnly: rangeIncludesScheduleStatus(range, scheduleSetup?.statusColumn),
      filters: sheetFilter && range.s.r >= sheetFilter.header.s.r && range.e.r === sheetFilter.header.e.r
        ? columns.filter(column => column >= range.s.c && column <= range.e.c && column >= sheetFilter.header.s.c && column <= sheetFilter.header.e.c)
          .map(column => ({ column, label: worksheetFilterLabel(sheetFilter, column, readFilterCell, XLSX.utils.encode_col(column)), active: sheetFilter.values.has(column) })) : undefined,
    }
    return [cell]
  }) })), [rows, columns, visibleMerges, sheet, selectedSheet, previewStyles, sheetFormatting, cellTextOverrides, cellStyleOverrides, rowStart, rowEnd, columnStart, columnEnd, scheduleSetup, currentScheduleHeaderError, scheduleValidation, shownRowRanges, shownColumnRanges, sheetFilter, readFilterCell])
  useEffect(hideValidationTooltip, [file, selectedSheet, editingAddress, cellMenuPosition, headerMenu, isScheduleSetupOpen, hideValidationTooltip])
  const selectedScheduleHeaderError = isScheduleSetupOpen ? validateScheduleHeader(selectedRange, readScheduleCell, selectedScheduleColumns) : null
  const selectedScheduleRecords = useMemo(() => isScheduleSetupOpen && scheduleSetup && !currentScheduleHeaderError
    ? readScheduleRecords(scheduleSetup, selectedRange, readScheduleCell) : [], [isScheduleSetupOpen, scheduleSetup, currentScheduleHeaderError, selectedRange, sheet, selectedSheet, cellTextOverrides])
  const configuredScheduleRecords = useMemo(() => isScheduleSetupOpen && scheduleSetup && !currentScheduleHeaderError
    ? readAssignedScheduleRecords(scheduleSetup, readScheduleCell).filter(record => !sheet?.['!rows']?.[record.row]?.hidden) : [], [isScheduleSetupOpen, scheduleSetup, currentScheduleHeaderError, sheet, selectedSheet, cellTextOverrides])
  const scheduleYearCounts: Record<ScheduleYear, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const record of configuredScheduleRecords) if (record.year) scheduleYearCounts[record.year]++
  const schedulePreviewAppearance = useMemo<SchedulePreviewAppearance>(() => ({
    merges: sheetMerges,
    columns: scheduleSetup?.columns.filter(column => !sheet?.['!cols']?.[column]?.hidden) ?? [],
    columnWidth: displayedColumnWidth,
    rowHeight: displayedRowHeight,
    cellStyle: range => {
      const address = XLSX.utils.encode_cell(range.s)
      const style: CSSProperties = { ...styleForCell(address), ...conditionalStyleForCell(address), ...editStyleForCell(address), ...resolvedBordersFor(range) }
      const validationKind = validationKindForRange(range)
      if (validationKind) style.backgroundColor = validationKind === 'overlap' || validationKind === 'room' || validationKind === 'faculty' ? '#fca5a5' : validationKind === 'duplicate' ? '#c4b5fd' : '#fde047'
      if (!style.textAlign && sheet?.[address]?.t === 'n') style.textAlign = 'right'
      if (!style.verticalAlign) style.verticalAlign = 'bottom'
      if (!style.fontFamily) style.fontFamily = 'Arial'
      return style
    },
    validationMessages: validationMessagesForRange,
    validationTone: validationToneForRange,
    cellContent: (row, column, style) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const cell = sheet?.[address] as ExcelFontCell | undefined
      const text = textForCell(address)
      const runs = fontRunsForCell(cell, text, String(style.fontFamily))
      const rotation = Number.parseFloat(String(style.rotate || '0')) || 0
      if (rotation || ['vertical-rl', 'vertical-lr', 'sideways-rl', 'sideways-lr'].includes(String(style.writingMode))) return <ExcelRotatedCellText text={text} angle={rotation} cellStyle={style} runs={runs} />
      if (cell?.l && /^(https?:|mailto:)/i.test(cell.l.Target)) return <a href={cell.l.Target} target="_blank" rel="noopener noreferrer" className="inline-block text-blue-700 underline"><ExcelCellFontText runs={runs} /></a>
      return <span className="inline-block"><ExcelCellFontText runs={runs} /></span>
    },
  }), [sheetMerges, scheduleSetup, sheet, selectedSheet, rowHeightOverrides, columnWidthOverrides, previewStyles, sheetFormatting, cellStyleOverrides, cellTextOverrides, scheduleValidation, rowStart, rowEnd, columnStart, columnEnd])
  const insertScheduleColumns = Array.from({ length: Math.min(SCHEDULE_COLUMN_COUNT, 16384 - selectedRange.s.c) }, (_, index) => selectedRange.s.c + index)
  const insertScheduleHeader = scheduleHeaderAt(selectedRange.s, insertScheduleColumns)
  const scheduleInsertError = (() => {
    if (!isScheduleSetupOpen) return null
    if (insertScheduleHeader.e.r >= 1048576 || insertScheduleColumns.length < SCHEDULE_COLUMN_COUNT) return 'The header would exceed Excel’s row or column limit.'
    if (sheetMerges.some(merge => rangesOverlap(merge, insertScheduleHeader) && !rangeContains(insertScheduleHeader, merge))) return 'The header would split an existing merged cell.'
    for (let row = insertScheduleHeader.s.r; row <= insertScheduleHeader.e.r; row++) for (let column = insertScheduleHeader.s.c; column <= insertScheduleHeader.e.c; column++) {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const cell = sheet?.[address] as XLSX.CellObject | undefined
      if (textForCell(address).trim() || cell?.f || cell?.c?.length || cell?.l) return 'Choose an empty area for the header template.'
    }
    return null
  })()
  const registerScheduleHeader = () => {
    if (readOnly || !sheet) return
    const error = validateScheduleHeader(selectedRange, readScheduleCell, selectedScheduleColumns)
    if (error) { setScheduleNotice(error); return }
    const sameHeader = scheduleSetup && XLSX.utils.encode_range(scheduleSetup.header) === XLSX.utils.encode_range(selectedRange)
    setScheduleSetups(current => new Map(current).set(selectedSheet, { header: { s: { ...selectedRange.s }, e: { ...selectedRange.e } }, columns: selectedScheduleColumns, years: sameHeader ? scheduleSetup.years : new Map(), includesEmptyRows: sameHeader ? scheduleSetup.includesEmptyRows : true, ...(sameHeader && scheduleSetup.statusColumn !== undefined ? { statusColumn: scheduleSetup.statusColumn } : {}), ...(sameHeader && scheduleSetup.rowStatuses ? { rowStatuses: scheduleSetup.rowStatuses } : {}), ...(sameHeader && scheduleSetup.statusStyles ? { statusStyles: scheduleSetup.statusStyles } : {}) }))
    setScheduleNotice(`Header basis set to ${XLSX.utils.encode_range(selectedRange)}.`)
  }
  const insertScheduleTemplate = () => {
    if (readOnly || !sheet || !workbook || scheduleInsertError) return
    const nextSheet = { ...sheet }
    const texts = new Map(cellTextOverrides.get(selectedSheet))
    const styles = new Map(cellStyleOverrides.get(selectedSheet))
    const values = scheduleHeaderValues()
    for (let row = 0; row < 2; row++) for (let column = 0; column < values[row].length; column++) {
      const address = XLSX.utils.encode_cell({ r: insertScheduleHeader.s.r + row, c: insertScheduleColumns[column] })
      const cell: ExcelFontCell = { ...nextSheet[address], t: 's', v: values[row][column] }
      delete cell.f
      delete cell.w
      delete cell.r
      delete cell.h
      delete cell.previewFontRuns
      nextSheet[address] = cell
      texts.delete(address)
      styles.set(address, { ...styles.get(address), backgroundColor: '#ffff00', color: '#000000', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontWeight: 'bold', borderTop: '1px solid #000000', borderRight: '1px solid #000000', borderBottom: '1px solid #000000', borderLeft: '1px solid #000000' })
    }
    const existingRange = XLSX.utils.decode_range(sheet['!ref'] ?? XLSX.utils.encode_range(insertScheduleHeader))
    nextSheet['!ref'] = XLSX.utils.encode_range({ s: { r: Math.min(existingRange.s.r, insertScheduleHeader.s.r), c: Math.min(existingRange.s.c, insertScheduleHeader.s.c) }, e: { r: Math.max(existingRange.e.r, insertScheduleHeader.e.r), c: Math.max(existingRange.e.c, insertScheduleHeader.e.c) } })
    const merges = [...sheetMerges.filter(merge => !rangesOverlap(merge, insertScheduleHeader)), ...scheduleHeaderMerges(insertScheduleHeader, insertScheduleColumns)]
    nextSheet['!merges'] = merges
    setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: nextSheet } })
    setCellTextOverrides(current => new Map(current).set(selectedSheet, texts))
    setCellStyleOverrides(current => new Map(current).set(selectedSheet, styles))
    setMergeOverrides(current => new Map(current).set(selectedSheet, merges))
    setScheduleSetups(current => new Map(current).set(selectedSheet, { header: insertScheduleHeader, columns: insertScheduleColumns, years: new Map(), includesEmptyRows: true }))
    const content = getSheetBounds(nextSheet, texts)
    setAddedRowsBySheet(current => new Map(current).set(selectedSheet, Math.max(0, (bounds?.lastRow ?? 0) - content.lastRow - TRAILING_EMPTY_ROWS)))
    setSelection({ anchor: insertScheduleHeader.s, focus: insertScheduleHeader.e })
    setScheduleNotice('Header template inserted and registered.')
  }
  const assignSelectedScheduleYear = (year: ScheduleYear | null) => {
    if (readOnly || !scheduleSetup) return
    if (year !== null && currentScheduleHeaderError) { setScheduleNotice('Restore or register the fixed header template first.'); return }
    const result = assignScheduleYear(scheduleSetup, selectedRange, year, readScheduleCell)
    if (!result.count) { setScheduleNotice('Select rows below the header, including any empty rows to keep in this year.'); return }
    setScheduleSetups(current => new Map(current).set(selectedSheet, result.setup))
    setScheduleNotice(year === null ? `Cleared year assignments for ${result.count} rows.` : `Assigned ${result.count} rows to ${SCHEDULE_YEAR_LABELS[year]}, including empty rows.`)
  }
  const clearScheduleSetup = () => {
    if (readOnly) return
    setScheduleSetups(current => removeMapKey(current, selectedSheet))
    setScheduleNotice('Sheet setup cleared. Worksheet values are unchanged.')
  }

  const closeCellMenu = () => {
    setCellMenuPosition(null)
    requestAnimationFrame(() => sheetTableRef.current?.querySelector<HTMLElement>(`[data-cell="${selectedAddress}"]`)?.focus())
  }

  const openHeaderMenu = (axis: ResizeAxis, index: number, position: { left: number; top: number }) => {
    if (readOnly) return
    hideCellAnnotations()
    selectionDragRef.current = false
    rowSelectionDragRef.current = null
    columnSelectionDragRef.current = null
    setCellMenuPosition(null)
    setSheetMenu(null)
    setIsScheduleSetupOpen(false)
    const range = selectionRange(selection)
    const coordinate = axis === 'row' ? 'r' : 'c'
    const fullRows = range.s.c === columnStart && range.e.c === columnEnd
    const fullColumns = range.s.r === rowStart && range.e.r === rowEnd
    const preserveSelection = axis === 'row' ? fullRows || !fullColumns : fullColumns || !fullRows
    const indexes = preserveSelection && index >= range.s[coordinate] && index <= range.e[coordinate]
      ? Array.from({ length: range.e[coordinate] - range.s[coordinate] + 1 }, (_, offset) => range.s[coordinate] + offset)
      : [index]
    if (axis === 'row') selectRows(indexes.at(-1)!, indexes[0])
    else selectColumns(indexes.at(-1)!, indexes[0])
    setHeaderMenu({ axis, index, indexes, position })
  }
  const openCornerMenu = (position: { left: number; top: number }) => {
    if (readOnly) return
    hideCellAnnotations()
    hideValidationTooltip()
    selectionDragRef.current = false
    rowSelectionDragRef.current = null
    columnSelectionDragRef.current = null
    setCellMenuPosition(null)
    setSheetMenu(null)
    setIsScheduleSetupOpen(false)
    setHeaderMenu({ axis: 'all', position })
  }
  const headerMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>, axis: ResizeAxis, index: number) => {
    if (readOnly || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    openHeaderMenu(axis, index, { left: rect.left, top: rect.bottom })
  }
  const closeHeaderMenu = () => {
    const scroller = sheetScrollRef.current
    const scroll = scroller ? { left: scroller.scrollLeft, top: scroller.scrollTop } : null
    setHeaderMenu(null)
    if (!headerMenu) return
    requestAnimationFrame(() => {
      const headers = headerMenu.axis === 'all' ? [] : Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(`[data-grid-axis="${headerMenu.axis}"]`) ?? [])
      const header = headerMenu.axis === 'all' ? dialogRef.current?.querySelector<HTMLElement>('[data-grid-axis="all"]')
        : headers.find(element => Number(element.dataset.gridIndex) === headerMenu.index)
        ?? headers.find(element => Number(element.dataset.gridIndex) > headerMenu.index)
        ?? headers.at(-1)
        ?? dialogRef.current?.querySelector<HTMLElement>('[data-grid-axis="all"]')
      header?.focus({ preventScroll: true })
      if (scroll && scroller) scroller.scrollTo(scroll.left, scroll.top)
    })
  }
  const axisHeaderMenu = headerMenu?.axis !== 'all' ? headerMenu : null
  const headerMetadata = axisHeaderMenu ? sheet?.[axisHeaderMenu.axis === 'row' ? '!rows' : '!cols'] : undefined
  const selectedHiddenHeaderCount = axisHeaderMenu?.indexes.filter(index => headerMetadata?.[index]?.hidden).length ?? 0
  const headerIsHidden = Boolean(axisHeaderMenu && selectedHiddenHeaderCount === axisHeaderMenu.indexes.length)
  const headerMenuLabel = axisHeaderMenu ? axisHeaderMenu.axis === 'column' ? axisHeaderMenu.indexes.length > 1
    ? `${XLSX.utils.encode_col(axisHeaderMenu.indexes[0])}–${XLSX.utils.encode_col(axisHeaderMenu.indexes.at(-1)!)}` : XLSX.utils.encode_col(axisHeaderMenu.index)
    : axisHeaderMenu.indexes.length > 1 ? `${axisHeaderMenu.indexes[0] + 1}–${axisHeaderMenu.indexes.at(-1)! + 1}` : String(axisHeaderMenu.index + 1) : ''
  const hiddenHeaderIndexes = headerMetadata?.flatMap((item, index) => item?.hidden ? [index] : []) ?? []
  const hiddenRowIndexes = sheet?.['!rows']?.flatMap((item, index) => item?.hidden ? [index] : []) ?? []
  const hiddenColumnIndexes = sheet?.['!cols']?.flatMap((item, index) => item?.hidden ? [index] : []) ?? []
  const headerIndicatorRanges = axisHeaderMenu ? (axisHeaderMenu.axis === 'row' ? shownRowRanges : shownColumnRanges)
    .filter(range => axisHeaderMenu.indexes.some(index => index >= range.start && index <= range.end)) : []
  const removeHeaderIndicator = () => {
    if (readOnly || !axisHeaderMenu || !headerIndicatorRanges.length) return
    setHiddenRangeToggles(current => {
      const ranges = current.get(selectedSheet)
      if (!ranges) return current
      const remaining = ranges[axisHeaderMenu.axis].filter(range => !headerIndicatorRanges.some(removed => removed.start === range.start && removed.end === range.end))
      return new Map(current).set(selectedSheet, { ...ranges, [axisHeaderMenu.axis]: remaining })
    })
    closeHeaderMenu()
  }
  const changeHeaderVisibility = (hidden: boolean) => {
    if (readOnly || !workbook || !sheet || !headerMenu) return
    if (headerMenu.axis === 'all') {
      const nextSheet = setSheetAxisHidden(setSheetAxisHidden(sheet, 'row', hiddenRowIndexes, false), 'column', hiddenColumnIndexes, false)
      if (nextSheet !== sheet) {
        setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: nextSheet } })
        setRenderedRowHeights([])
      }
      closeHeaderMenu()
      return
    }
    const indexes = hidden || selectedHiddenHeaderCount > 0 ? headerMenu.indexes : hiddenHeaderIndexes
    const nextSheet = setSheetAxisHidden(sheet, headerMenu.axis, indexes, hidden)
    if (nextSheet !== sheet) {
      setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: nextSheet } })
      setRenderedRowHeights([])
    }
    closeHeaderMenu()
  }

  const toggleIndicatorRange = (axis: ResizeAxis, indicator: AxisVisibilityIndicator) => {
    if (readOnly || !workbook || !sheet || !bounds) return
    const indexes = Array.from({ length: indicator.end - indicator.start + 1 }, (_, offset) => indicator.start + offset)
    const nextSheet = setSheetAxisHidden(sheet, axis, indexes, !indicator.hidden)
    if (nextSheet === sheet) return
    if (indicator.hidden) setHiddenRangeToggles(current => {
      const ranges = current.get(selectedSheet) ?? { row: [], column: [] }
      return new Map(current).set(selectedSheet, { ...ranges, [axis]: rememberHiddenRange(ranges[axis], indicator) })
    })
    selectionDragRef.current = false
    rowSelectionDragRef.current = null
    columnSelectionDragRef.current = null
    setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: nextSheet } })
    setRenderedRowHeights([])
    requestAnimationFrame(() => {
      const header = dialogRef.current?.querySelector<HTMLElement>(`[data-grid-axis="${axis}"][data-grid-index="${indicator.anchor}"]`)
        ?? dialogRef.current?.querySelector<HTMLElement>(`[data-grid-axis="${axis}"]`)
      header?.focus({ preventScroll: true })
    })
  }

  const renderVisibilityIndicator = (axis: ResizeAxis, indicator: AxisVisibilityIndicator, position: number) => {
    const first = axis === 'row' ? String(indicator.start + 1) : XLSX.utils.encode_col(indicator.start)
    const last = axis === 'row' ? String(indicator.end + 1) : XLSX.utils.encode_col(indicator.end)
    const label = `${indicator.hidden ? 'Show' : 'Hide'} ${axis === 'row' ? 'rows' : 'columns'} ${first}${first === last ? '' : `–${last}`}`
    const placement = indicator.hidden
      ? axis === 'row'
        ? indicator.direction === -1 ? `left-1.5 top-0 ${position > 0 ? '-translate-y-1/2' : ''}` : 'bottom-0 left-1.5'
        : indicator.direction === -1 ? `left-0 top-1/2 -translate-y-1/2 ${position > 0 ? '-translate-x-1/2' : ''}` : 'right-0 top-1/2 -translate-y-1/2'
      : axis === 'row'
        ? indicator.direction === -1 ? 'left-1.5 top-0.5 -translate-y-1/2' : 'bottom-0.5 left-1.5 translate-y-1/2'
        : indicator.direction === -1 ? 'left-0.5 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'right-0.5 top-1/2 translate-x-1/2 -translate-y-1/2'
    const arrow = indicator.hidden ? undefined : axis === 'row'
      ? indicator.direction === -1 ? 'down' : 'up'
      : indicator.direction === -1 ? 'right' : 'left'
    return <ExcelHiddenRangeIndicator key={`${axis}:${indicator.start}:${indicator.end}:${indicator.anchor}:${indicator.direction}`} axis={axis} label={label} disabled={readOnly} arrow={arrow} className={placement} onToggle={() => toggleIndicatorRange(axis, indicator)} />
  }

  const copyCells = (cut: boolean): CellClipboard | null => {
    cut = cut && !readOnly && !formattingStatus
    if (!sheet || !workbook) return null
    const cells: ClipboardCell[][] = []
    for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) {
      const values: ClipboardCell[] = []
      for (let column = selectedRange.s.c; column <= selectedRange.e.c; column++) {
        const address = XLSX.utils.encode_cell({ r: row, c: column })
        values.push({ text: textForCell(address), cell: sheet[address], style: { ...EMPTY_CELL_STYLE, textAlign: sheet[address]?.t === 'n' ? 'right' : 'left', ...styleForCell(address), ...conditionalStyleForCell(address), ...editStyleForCell(address) } })
      }
      cells.push(values)
    }
    const payload: CellClipboard = {
      text: formatClipboardRows(cells.map(row => row.map(cell => cell.text))),
      cells,
      merges: sheetMerges.filter(merge => rangeContains(selectedRange, merge)).map(merge => ({
        s: { r: merge.s.r - selectedRange.s.r, c: merge.s.c - selectedRange.s.c },
        e: { r: merge.e.r - selectedRange.s.r, c: merge.e.c - selectedRange.s.c },
      })),
      cut: cut ? { sheet: selectedSheet, range: selectedRange, workbook, texts: cellTextOverrides, styles: cellStyleOverrides } : undefined,
    }
    cellClipboardRef.current = payload
    setEditNotice(cut ? 'Cells cut. Paste to move them.' : '')
    setCellMenuPosition(null)
    return payload
  }

  const pasteCells = (text: string) => {
    if (readOnly) return
    if (!workbook || !sheet || historyFileRef.current !== file) return
    const clipboard = cellClipboardRef.current?.text === text ? cellClipboardRef.current : null
    const values = clipboard?.cells ?? parseClipboardRows(text).map(row => row.map(value => ({ text: value, style: undefined, cell: undefined })))
    const width = Math.max(...values.map(row => row.length))
    const target: XLSX.Range = { s: { ...selectedRange.s }, e: { r: selectedRange.s.r + values.length - 1, c: selectedRange.s.c + width - 1 } }
    if (target.e.r >= 1048576 || target.e.c >= 16384) { setEditNotice('The pasted cells exceed Excel’s row or column limit.'); return }
    const singleMergedValue = values.length === 1 && width === 1 && selectedMerge
    const pasteRange = singleMergedValue ? selectedRange : target
    if (scheduleSetup?.statusColumn !== undefined && pasteRange.s.c <= scheduleSetup.statusColumn && pasteRange.e.c >= scheduleSetup.statusColumn) {
      setEditNotice('Status text is managed by the schedule. Paste into the other columns instead.')
      return
    }
    if (sheetMerges.some(merge => rangesOverlap(merge, pasteRange) && !rangeContains(pasteRange, merge))) {
      setEditNotice('The pasted area would split a merged cell. Unmerge it first.')
      return
    }
    const sheets = { ...workbook.Sheets }
    const texts = new Map(cellTextOverrides)
    const styles = new Map(cellStyleOverrides)
    const merges = new Map(mergeOverrides)
    const cut = clipboard?.cut
    if (cut && cut.workbook === workbook && cut.texts === cellTextOverrides && cut.styles === cellStyleOverrides) {
      const source = { ...sheets[cut.sheet] }
      const sourceTexts = new Map(texts.get(cut.sheet))
      const sourceStyles = new Map(styles.get(cut.sheet))
      for (let row = cut.range.s.r; row <= cut.range.e.r; row++) {
        for (let column = cut.range.s.c; column <= cut.range.e.c; column++) {
          const address = XLSX.utils.encode_cell({ r: row, c: column })
          delete source[address]
          sourceTexts.set(address, '')
          sourceStyles.set(address, { ...EMPTY_CELL_STYLE })
        }
      }
      sheets[cut.sheet] = source
      texts.set(cut.sheet, sourceTexts)
      styles.set(cut.sheet, sourceStyles)
      merges.set(cut.sheet, (merges.get(cut.sheet) ?? source['!merges'] ?? []).filter(merge => !rangesOverlap(merge, cut.range)))
    }
    const destination = { ...sheets[selectedSheet] }
    const destinationTexts = new Map(texts.get(selectedSheet))
    const destinationStyles = new Map(styles.get(selectedSheet))
    values.forEach((row, rowIndex) => {
      for (let columnIndex = 0; columnIndex < width; columnIndex++) {
        const value = row[columnIndex]
        const address = XLSX.utils.encode_cell({ r: target.s.r + rowIndex, c: target.s.c + columnIndex })
        const cell: XLSX.CellObject = { ...value?.cell, t: 's', v: value?.text ?? '' }
        delete cell.f
        delete cell.w
        delete cell.h
        delete cell.r
        destination[address] = cell
        destinationTexts.set(address, value?.text ?? '')
        if (value?.style) destinationStyles.set(address, { ...value.style })
      }
    })
    const reference = destination['!ref'] ? XLSX.utils.decode_range(destination['!ref']) : target
    destination['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(reference.e.r, target.e.r), c: Math.max(reference.e.c, target.e.c) } })
    sheets[selectedSheet] = destination
    texts.set(selectedSheet, destinationTexts)
    styles.set(selectedSheet, destinationStyles)
    if (!singleMergedValue) {
      const retained = (merges.get(selectedSheet) ?? sheetMerges).filter(merge => !rangesOverlap(merge, target))
      merges.set(selectedSheet, [...retained, ...(clipboard?.merges ?? []).map(merge => ({ s: { r: target.s.r + merge.s.r, c: target.s.c + merge.s.c }, e: { r: target.s.r + merge.e.r, c: target.s.c + merge.e.c } }))])
    }
    if (clipboard) clipboard.cut = undefined
    setWorkbook({ ...workbook, Sheets: sheets })
    setCellTextOverrides(texts)
    setCellStyleOverrides(styles)
    setMergeOverrides(merges)
    const content = getSheetBounds(destination, destinationTexts)
    setAddedRowsBySheet(current => new Map(current).set(selectedSheet, Math.max(0, Math.max((bounds?.lastRow ?? -1) + 1, target.e.r + 1) - (content.lastRow + TRAILING_EMPTY_ROWS + 1))))
    setSelection({ anchor: pasteRange.s, focus: pasteRange.e })
    setCellMenuPosition(null)
    setEditNotice('')
  }

  const applyGridEdit = (edit: GridEdit) => {
    setSheetFilters(new Map())
    setFilterMenu(null)
    if (readOnly) return
    if (!workbook || !sheet || !bounds) return
    if (edit.band && scheduleSetup?.statusColumn !== undefined && (edit.axis === 'column' ? edit.start <= scheduleSetup.statusColumn : edit.band.start <= scheduleSetup.statusColumn && edit.band.end >= scheduleSetup.statusColumn)) {
      setEditNotice('Use whole rows or columns when shifting cells across Status.')
      return
    }
    try {
      const merges = sheetMerges.map(merge => moveRange(merge, edit)).filter((merge): merge is XLSX.Range => merge !== null)
      const nextSheet = editWorksheet(sheet, edit, merges)
      const texts = moveCellMap(cellTextOverrides.get(selectedSheet) ?? new Map(), edit)
      let sourceStyles = cellStyleOverrides.get(selectedSheet) ?? new Map<string, CSSProperties>()
      if (edit.band) {
        sourceStyles = new Map(sourceStyles)
        const firstRow = edit.axis === 'row' ? edit.start : edit.band.start
        const lastRow = edit.axis === 'row' ? bounds.lastRow : edit.band.end
        const firstColumn = edit.axis === 'column' ? edit.start : edit.band.start
        const lastColumn = edit.axis === 'column' ? bounds.lastColumn : edit.band.end
        for (let row = firstRow; row <= lastRow; row++) for (let column = firstColumn; column <= lastColumn; column++) {
          const address = XLSX.utils.encode_cell({ r: row, c: column })
          sourceStyles.set(address, { ...EMPTY_CELL_STYLE, textAlign: sheet[address]?.t === 'n' ? 'right' : 'left', ...styleForCell(address), ...editStyleForCell(address) })
        }
      }
      const styles = moveCellMap(sourceStyles, edit)
      const formatting = moveFormatting(sheetFormatting, edit)
      const heights = !edit.band && edit.axis === 'row' ? moveIndexMap(rowHeightOverrides.get(selectedSheet) ?? new Map(), edit) : null
      const widths = !edit.band && edit.axis === 'column' ? moveIndexMap(columnWidthOverrides.get(selectedSheet) ?? new Map(), edit) : null
      const desiredRows = bounds.lastRow + 1 + (edit.axis === 'row' && !edit.band ? (edit.remove ? -edit.count : edit.count) : 0)
      const content = getSheetBounds(nextSheet, texts)
      const next = { r: Math.min(selectedRange.s.r, Math.max(0, desiredRows - 1)), c: Math.min(selectedRange.s.c, content.lastColumn) }
      const nextScheduleSetup = scheduleSetup ? moveScheduleSetup(scheduleSetup, edit) : null
      if (!edit.band) setHiddenRangeToggles(current => {
        const ranges = current.get(selectedSheet)
        if (!ranges) return current
        const coordinate = edit.axis === 'row' ? 'r' : 'c'
        const moved = ranges[edit.axis].flatMap(range => {
          const nextRange = moveRange({ s: { r: 0, c: 0, [coordinate]: range.start }, e: { r: 0, c: 0, [coordinate]: range.end } }, edit)
          return nextRange ? [{ start: nextRange.s[coordinate], end: nextRange.e[coordinate] }] : []
        })
        return new Map(current).set(selectedSheet, { ...ranges, [edit.axis]: moved })
      })
      if (scheduleSetup) setScheduleSetups(current => nextScheduleSetup ? new Map(current).set(selectedSheet, nextScheduleSetup) : removeMapKey(current, selectedSheet))
      setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: nextSheet } })
      setCellTextOverrides(current => new Map(current).set(selectedSheet, texts))
      setCellStyleOverrides(current => new Map(current).set(selectedSheet, styles))
      setMergeOverrides(current => new Map(current).set(selectedSheet, merges))
      setFormattingOverrides(current => new Map(current).set(selectedSheet, formatting))
      if (heights) setRowHeightOverrides(current => new Map(current).set(selectedSheet, heights))
      if (widths) setColumnWidthOverrides(current => new Map(current).set(selectedSheet, widths))
      setAddedRowsBySheet(current => new Map(current).set(selectedSheet, Math.max(0, desiredRows - (content.lastRow + TRAILING_EMPTY_ROWS + 1))))
      setSelection({ anchor: next, focus: next })
      setRenderedRowHeights([])
      setEditNotice(scheduleSetup && !nextScheduleSetup ? 'Schedule setup cleared because cells within the template were shifted. Register the header and year levels again, or undo this edit.' : '')
    } catch (error) {
      setEditNotice(error instanceof Error ? error.message : 'The cells could not be moved.')
    }
    setCellMenuPosition(null)
  }

  const endAxisDrag = useLatestEvent((updateUI = true) => {
    const drag = axisMoveDragRef.current
    axisMoveDragRef.current = null
    if (axisDragFrameRef.current !== null) cancelAnimationFrame(axisDragFrameRef.current)
    axisDragFrameRef.current = null
    drag?.preview?.layer.remove()
    if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    if (updateUI) { setAxisDropTarget(null); setIsAxisDragging(false) }
  })

  const startAxisDrag = (event: ReactPointerEvent<HTMLDivElement>, axis: ResizeAxis) => {
    if (!allowHeaderMoves || readOnly || selection.axis !== axis || !workbook || !sheet || resizeDragRef.current
      || event.button !== 0 || event.shiftKey || (event.target as HTMLElement).closest('[role="separator"], button')) return
    const coordinate = axis === 'row' ? 'r' : 'c'
    const index = Number(event.currentTarget.dataset.gridIndex)
    if (index < rawSelectedRange.s[coordinate] || index > rawSelectedRange.e[coordinate]) return
    const scroller = sheetScrollRef.current
    const container = axis === 'row' ? rowHeaderContainerRef.current : columnTrackRef.current
    if (!scroller || !container || !sheetTableRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const move: AxisMove = { axis, start: rawSelectedRange.s[coordinate], count: rawSelectedRange.e[coordinate] - rawSelectedRange.s[coordinate] + 1, before: rawSelectedRange.s[coordinate] }
    try {
      validateAxisMove(move, sheetMerges)
      flushSync(() => { cellTextEditorRef.current?.commit() })
      const viewport = scroller.getBoundingClientRect(), scale = previewScale()
      const headers = Array.from(container.children, child => {
        const element = child as HTMLElement, rect = element.getBoundingClientRect()
        return { index: Number(element.dataset.gridIndex),
          start: axis === 'row' ? (rect.top - viewport.top) / scale.y + scroller.scrollTop : (rect.left - viewport.left) / scale.x + scroller.scrollLeft,
          end: axis === 'row' ? (rect.bottom - viewport.top) / scale.y + scroller.scrollTop : (rect.right - viewport.left) / scale.x + scroller.scrollLeft }
      })
      const start = { x: event.clientX, y: event.clientY }
      axisMoveDragRef.current = { sheetName: selectedSheet, move, pointerId: event.pointerId, element: event.currentTarget,
        start, current: start, headers, active: false, target: null, scroll: { left: scroller.scrollLeft, top: scroller.scrollTop } }
      event.currentTarget.setPointerCapture(event.pointerId)
      selectionDragRef.current = false
      rowSelectionDragRef.current = null
      columnSelectionDragRef.current = null
      hideCellAnnotations()
      hideValidationTooltip()
      setCellMenuPosition(null)
      setHeaderMenu(null)
      setIsScheduleSetupOpen(false)
      setEditNotice('')
      setAxisMoveNotice(null)
    } catch (error) {
      event.preventDefault()
      endAxisDrag()
      setAxisMoveNotice({ message: error instanceof Error ? error.message : 'These headers could not be moved.', error: true })
    }
  }

  const updateAxisDrag = useLatestEvent((autoScroll: boolean) => {
    const drag = axisMoveDragRef.current
    const scroller = sheetScrollRef.current, table = sheetTableRef.current, grid = gridRef.current
    if (!drag || !scroller || !table || !grid || !allowHeaderMoves || readOnly || drag.sheetName !== selectedSheet) return
    const axis = drag.move.axis, offset = axisDragOffset(axis, drag.start, drag.current)
    if (!drag.active && Math.abs(axis === 'row' ? offset.y : offset.x) < 4) return
    if (!drag.active) {
      const container = axis === 'row' ? rowHeaderContainerRef.current : columnTrackRef.current
      const selectedHeaders = Array.from(container?.children ?? []).filter(child => {
        const index = Number((child as HTMLElement).dataset.gridIndex)
        return index >= drag.move.start && index < drag.move.start + drag.move.count
      }) as HTMLElement[]
      if (!selectedHeaders.length) return
      drag.preview = createAxisDragPreview(axis, scroller, grid, selectedHeaders, previewScale())
      drag.active = true
      setIsAxisDragging(true)
    }
    drag.preview?.move(offset)
    const viewport = scroller.getBoundingClientRect(), scale = previewScale()
    const start = axis === 'row' ? Math.max(viewport.top, columnTrackRef.current?.getBoundingClientRect().bottom ?? viewport.top)
      : viewport.left + getGridHeaderWidth() * scale.x
    const end = axis === 'row' ? viewport.top + scroller.clientHeight * scale.y : viewport.left + scroller.clientWidth * scale.x
    const point = axis === 'row' ? drag.current.y : drag.current.x
    if (autoScroll) {
      const speed = axisDragScrollSpeed(point, start, end)
      if (axis === 'row') { scroller.scrollTop += speed / scale.y; scroller.scrollLeft = drag.scroll.left }
      else { scroller.scrollLeft += speed / scale.x; scroller.scrollTop = drag.scroll.top }
    }
    const clamped = Math.max(start, Math.min(end - 1, point))
    const position = axis === 'row' ? (clamped - viewport.top) / scale.y + scroller.scrollTop : (clamped - viewport.left) / scale.x + scroller.scrollLeft
    const target = axisDragTarget(drag.headers, position)
    let error = ''
    if (target) try { validateAxisMove({ ...drag.move, before: target.index + (target.after ? 1 : 0) }, sheetMerges) } catch (caught) { error = caught instanceof Error ? caught.message : 'This drop is unavailable.' }
    const targetHeader = target ? drag.headers.find(header => header.index === target.index) : null
    const scrollOffset = axis === 'row' ? scroller.scrollTop : scroller.scrollLeft
    const axisScale = axis === 'row' ? scale.y : scale.x
    drag.preview?.highlightTarget(target && targetHeader ? {
      start: (targetHeader.start - scrollOffset) * axisScale,
      end: (targetHeader.end - scrollOffset) * axisScale,
      after: target.after, error: Boolean(error),
    } : null)
    drag.target = target ? { ...target, error } : null
    setAxisDropTarget(current => !target ? null : current?.axis === axis && current.index === target.index && current.after === target.after && current.error === error
      ? current : { axis, ...target, error })
  })

  const axisDragFrame = () => {
    axisDragFrameRef.current = null
    if (!axisMoveDragRef.current) return
    updateAxisDrag(true)
    if (axisMoveDragRef.current?.active) axisDragFrameRef.current = requestAnimationFrame(axisDragFrame)
  }

  const moveAxisHeaders = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = axisMoveDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    drag.current = { x: event.clientX, y: event.clientY }
    if (axisDragFrameRef.current === null) axisDragFrameRef.current = requestAnimationFrame(axisDragFrame)
  }

  const dropAxisHeaders = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = axisMoveDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    drag.current = { x: event.clientX, y: event.clientY }
    updateAxisDrag(false)
    const target = drag.active && drag.target ? { move: { ...drag.move, before: drag.target.index + (drag.target.after ? 1 : 0) } } : null
    endAxisDrag()
    if (!target) return
    const snapshot = workbookSnapshotRef.current
    if (!snapshot || snapshot.selectedSheet !== selectedSheet || !bounds) return
    try {
      const next = reorderWorkbookAxis(snapshot, target.move, sheetFormatting)
      if (next === snapshot) return
      const content = getSheetBounds(next.workbook.Sheets[selectedSheet], next.cellTextOverrides.get(selectedSheet))
      restoreEdit({ ...next, addedRowsBySheet: new Map(next.addedRowsBySheet).set(selectedSheet, Math.max(0, bounds.lastRow - content.lastRow - TRAILING_EMPTY_ROWS)) }, true)
      const setupCleared = Boolean(scheduleSetup && !next.scheduleSetups.has(selectedSheet))
      setAxisMoveNotice({ message: setupCleared
        ? 'Headers moved. Schedule Setup was cleared because the template field order changed. Restore the template order and register it again, or undo this move.'
        : `Moved ${target.move.count} ${target.move.axis === 'row' ? 'row' : 'column'}${target.move.count === 1 ? '' : 's'}.`, error: setupCleared })
    } catch (error) {
      setAxisMoveNotice({ message: error instanceof Error ? error.message : 'The headers could not be moved.', error: true })
    }
  }

  useEffect(() => {
    endAxisDrag()
    setAxisMoveNotice(null)
    const cancel = () => endAxisDrag()
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
    return () => { endAxisDrag(false); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel) }
  }, [selectedSheet, file, readOnly, allowHeaderMoves, endAxisDrag])

  const detailCell = sheet?.[selectedAddress] as XLSX.CellObject | undefined
  const cellDetails: Record<CellDetailKind, string> = {
    link: detailCell?.l?.Target ?? '',
    comment: detailCell?.c?.filter(comment => comment.T && isVisibleAnnotation(comment)).map(comment => comment.t).join('\n') ?? '',
    note: detailCell?.c?.filter(comment => !comment.T).map(comment => comment.t).join('\n') ?? '',
  }
  const saveCellDetail = (kind: CellDetailKind, value: string) => {
    if (readOnly) return
    if (!sheet || !workbook) return
    const cell: XLSX.CellObject = { ...sheet[selectedAddress], t: sheet[selectedAddress]?.t ?? 'z' }
    if (kind === 'link') {
      if (value) {
        try {
          const url = new URL(value)
          if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error()
          cell.l = { Target: url.href }
        } catch { setEditNotice('Enter an http, https, or mailto link.'); return }
      } else delete cell.l
    } else {
      cell.c = updateCellAnnotation(cell.c ?? [], kind, value, commentAuthor, new Date().toISOString())
      if (!cell.c.length) delete cell.c
    }
    setWorkbook({ ...workbook, Sheets: { ...workbook.Sheets, [selectedSheet]: { ...sheet, [selectedAddress]: cell } } })
    setEditNotice('')
    closeCellMenu()
  }

  const handleSheetCommentAction = (address: string, index: number, action: CommentAction) => {
    if (readOnly) return
    hideCellAnnotations()
    setHoveredSheetComment(null)
    const resolution = { author: commentAuthor, createdAt: new Date().toISOString() }
    setWorkbook(current => {
      const currentSheet = current?.Sheets[selectedSheet]
      const currentCell = currentSheet?.[address] as XLSX.CellObject | undefined
      if (!current || !currentSheet || !currentCell?.c) return current
      const comments = applyCommentAction(currentCell.c, index, action, resolution)
      if (comments === currentCell.c) return current
      const cell: XLSX.CellObject = { ...currentCell, c: comments }
      if (!comments.length) delete cell.c
      return { ...current, Sheets: { ...current.Sheets, [selectedSheet]: { ...currentSheet, [address]: cell } } }
    })
  }

  const handleCellMenuAction = async (action: CellMenuAction) => {
    if (readOnly && action !== 'copy') return
    hideCellAnnotations()
    if (action === 'copy' || action === 'cut') {
      const payload = copyCells(action === 'cut')
      if (payload) {
        try { await navigator.clipboard.writeText(payload.text) }
        catch { setEditNotice('Copied within this workbook. Use Ctrl+C or Ctrl+X to copy to the system clipboard.') }
      }
      return
    }
    if (action === 'paste') {
      try { pasteCells(await navigator.clipboard.readText()) }
      catch {
        if (cellClipboardRef.current) pasteCells(cellClipboardRef.current.text)
        else setEditNotice('Press Ctrl+V to paste from the system clipboard.')
      }
      setCellMenuPosition(null)
      return
    }
    const axis = ['insertRow', 'insertDown', 'deleteRow', 'deleteUp'].includes(action) ? 'row' : 'column'
    const full = ['insertRow', 'insertColumn', 'deleteRow', 'deleteColumn'].includes(action)
    applyGridEdit({ axis, start: axis === 'row' ? selectedRange.s.r : selectedRange.s.c, count: axis === 'row' ? selectedRange.e.r - selectedRange.s.r + 1 : selectedRange.e.c - selectedRange.s.c + 1, remove: action.startsWith('delete'), band: full ? undefined : axis === 'row' ? { start: selectedRange.s.c, end: selectedRange.e.c } : { start: selectedRange.s.r, end: selectedRange.e.r } })
  }

  const isEditingClipboardText = (event: ClipboardEvent) => event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input, textarea'))
  const copyToClipboard = useLatestEvent((event: ClipboardEvent) => {
    if (event.defaultPrevented || isEditingClipboardText(event) || !event.clipboardData) return
    const payload = copyCells(event.type === 'cut')
    if (!payload) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', payload.text)
  })
  const pasteFromClipboard = useLatestEvent((event: ClipboardEvent) => {
    if (readOnly || event.defaultPrevented || isEditingClipboardText(event) || !event.clipboardData || !sheet) return
    if (!event.clipboardData.types.includes('text/plain')) return
    event.preventDefault()
    pasteCells(event.clipboardData.getData('text/plain'))
  })
  useEffect(() => {
    document.addEventListener('copy', copyToClipboard)
    document.addEventListener('cut', copyToClipboard)
    document.addEventListener('paste', pasteFromClipboard)
    return () => {
      document.removeEventListener('copy', copyToClipboard)
      document.removeEventListener('cut', copyToClipboard)
      document.removeEventListener('paste', pasteFromClipboard)
    }
  }, [copyToClipboard, pasteFromClipboard])

  useEffect(() => {
    if (!cellMenuPosition && !headerMenu) return
    const close = () => { setCellMenuPosition(null); setHeaderMenu(null) }
    sheetScrollRef.current?.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      sheetScrollRef.current?.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [cellMenuPosition, headerMenu])

  const updateSelectedStyles = (getPatch: (row: number, column: number) => CSSProperties) => {
    if (readOnly) return
    setCellStyleOverrides(current => {
      const updated = new Map(current)
      const sheetStyles = new Map(updated.get(selectedSheet))
      for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) {
        for (let column = selectedRange.s.c; column <= selectedRange.e.c; column++) {
          const address = XLSX.utils.encode_cell({ r: row, c: column })
          sheetStyles.set(address, { ...sheetStyles.get(address), ...getPatch(row, column) })
        }
      }
      updated.set(selectedSheet, sheetStyles)
      return updated
    })
  }

  const setSelectedText = (address: string, value: string) => {
    if (readOnly) return
    if (isCellTextProtected(address)) return
    if (value === textForCell(address)) {
      setEditingAddress(null)
      return
    }
    setCellTextOverrides(current => {
      const updated = new Map(current)
      const sheetTexts = new Map(updated.get(selectedSheet))
      sheetTexts.set(address, value)
      updated.set(selectedSheet, sheetTexts)
      return updated
    })
    setEditingAddress(null)
  }

  const saveCellTextDraft = (address: string, draft: ExcelCellTextDraft) => {
    if (readOnly) return
    if (isCellTextProtected(address)) return
    const text = draft.runs.map(run => run.text).join('')
    const originalCell = sheet?.[address] as ExcelFontCell | undefined
    const baseFont = String(editStyleForCell(address).fontFamily || styleForCell(address).fontFamily || 'Arial')
    const originalRuns = fontRunsForCell(originalCell, textForCell(address), baseFont)
    const sameRuns = originalRuns.length === draft.runs.length && originalRuns.every((run, index) => run.text === draft.runs[index].text && run.fontFamily === draft.runs[index].fontFamily)
    if (sameRuns && draft.typingFont === (originalCell?.previewTypingFont || baseFont)) {
      setEditingAddress(null)
      return
    }
    setWorkbook(current => {
      if (!current) return current
      const currentSheet = current.Sheets[selectedSheet]
      const cell: ExcelFontCell = { ...currentSheet[address], t: currentSheet[address]?.t ?? 's', previewFontRuns: draft.runs, previewTypingFont: draft.typingFont }
      return { ...current, Sheets: { ...current.Sheets, [selectedSheet]: { ...currentSheet, [address]: cell } } }
    })
    setSelectedText(address, text)
  }

  const changeFont = (font: string) => {
    if (readOnly) return
    if (editingAddress && cellTextEditorRef.current) {
      setEditorFont(font)
      cellTextEditorRef.current.applyFont(font)
      return
    }
    // A font choice without highlighted text only sets the font for future typing.
    setWorkbook(current => {
      if (!current) return current
      const currentSheet = { ...current.Sheets[selectedSheet] }
      for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) {
        for (let column = selectedRange.s.c; column <= selectedRange.e.c; column++) {
          const address = XLSX.utils.encode_cell({ r: row, c: column })
          const cell: ExcelFontCell = { ...currentSheet[address], t: currentSheet[address]?.t ?? 'z', previewTypingFont: font }
          if (column === scheduleSetup?.statusColumn) cell.previewFontRuns = [{ text: textForCell(address), fontFamily: font }]
          currentSheet[address] = cell
        }
      }
      return { ...current, Sheets: { ...current.Sheets, [selectedSheet]: currentSheet } }
    })
    if (formattingStatus && scheduleSetup?.statusColumn !== undefined) setCellStyleOverrides(current => {
      const styles = new Map(current.get(selectedSheet))
      for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) {
        const address = XLSX.utils.encode_cell({ r: row, c: scheduleSetup.statusColumn! })
        styles.set(address, { ...styles.get(address), fontFamily: font })
      }
      return new Map(current).set(selectedSheet, styles)
    })
  }

  const updateSelectedBorders = (borderFor: (row: number, column: number, side: BorderSide) => string | undefined) => {
    if (readOnly) return
    setCellStyleOverrides(current => {
      const sheetStyles = new Map(current.get(selectedSheet))
      let changed = false
      const write = (row: number, column: number, side: BorderSide, line: string) => {
        if (!bounds || row < 0 || column < 0 || row > bounds.lastRow || column > bounds.lastColumn) return
        const address = XLSX.utils.encode_cell({ r: row, c: column })
        if (sheetStyles.get(address)?.[side] === line) return
        sheetStyles.set(address, { ...sheetStyles.get(address), [side]: line })
        changed = true
      }
      for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) for (let column = selectedRange.s.c; column <= selectedRange.e.c; column++) {
        for (const side of BORDER_SIDES) {
          const line = borderFor(row, column, side)
          if (line === undefined) continue
          write(row, column, side, line)
          const neighbor = BORDER_NEIGHBORS[side]
          const neighborRow = row + neighbor.row, neighborColumn = column + neighbor.column
          const inside = neighborRow >= selectedRange.s.r && neighborRow <= selectedRange.e.r
            && neighborColumn >= selectedRange.s.c && neighborColumn <= selectedRange.e.c
          // Clear the adjoining edge without giving an outside cell a copy of this border.
          write(neighborRow, neighborColumn, neighbor.side, inside ? line : 'none')
        }
      }
      return changed ? new Map(current).set(selectedSheet, sheetStyles) : current
    })
  }
  const changeBorders = (preset: BorderPreset, color: string, width: number, style: BorderLineStyle) => {
    const line = `${width}px ${style} ${color}`
    const range = selectedRange
    updateSelectedBorders((row, column, side) => {
      if (preset === 'none') return 'none'
      if (preset === 'all') return line
      const outer = side === 'borderTop' ? row === range.s.r
        : side === 'borderBottom' ? row === range.e.r
        : side === 'borderLeft' ? column === range.s.c
        : column === range.e.c
      const inner = side === 'borderTop' ? row > range.s.r
        : side === 'borderBottom' ? row < range.e.r
        : side === 'borderLeft' ? column > range.s.c
        : column < range.e.c
      const horizontal = side === 'borderTop' || side === 'borderBottom'
      if (preset === 'outer' && outer) return line
      if (preset === 'inner' && inner) return line
      if (preset === 'horizontal' && horizontal && inner) return line
      if (preset === 'vertical' && !horizontal && inner) return line
      if (preset === 'left' && side === 'borderLeft' && outer) return line
      if (preset === 'top' && side === 'borderTop' && outer) return line
      if (preset === 'right' && side === 'borderRight' && outer) return line
      if (preset === 'bottom' && side === 'borderBottom' && outer) return line
      return undefined
    })
  }

  const changeBorderLine = (color: string, width: number, style: BorderLineStyle) => {
    updateSelectedBorders((row, column, side) => {
      const neighbor = BORDER_NEIGHBORS[side]
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const neighborAddress = row + neighbor.row >= 0 && column + neighbor.column >= 0
        ? XLSX.utils.encode_cell({ r: row + neighbor.row, c: column + neighbor.column }) : null
      const borderFrom = (styles: CSSProperties, edge: BorderSide): string | undefined => {
        const value = styles[edge]
        return typeof value === 'string' ? value : undefined
      }
      const ownBorder = borderFrom(editStyleForCell(address), side) ?? borderFrom(styleForCell(address), side)
      const neighborBorder = neighborAddress ? borderFrom(editStyleForCell(neighborAddress), neighbor.side) ?? borderFrom(styleForCell(neighborAddress), neighbor.side) : undefined
      const existing = strongerBorder(ownBorder, neighborBorder)
      return existing && existing !== 'none' ? `${width}px ${style} ${color}` : undefined
    })
  }

  const changeMerge = (preset: MergePreset) => {
    if (readOnly) return
    if (preset === 'unmerge') {
      setMergeOverrides(current => new Map(current).set(selectedSheet, sheetMerges.filter(merge => !rangesOverlap(merge, selectedRange))))
      setEditNotice('')
      return
    }
    if (selectedStatusText) {
      setEditNotice('Cells displaying status text cannot be merged. Select blank cells instead.')
      return
    }
    if (selectedRange.s.r === selectedRange.e.r && selectedRange.s.c === selectedRange.e.c) {
      setEditNotice('')
      return
    }
    if (preset === 'vertical' && selectedRange.s.r === selectedRange.e.r) {
      setEditNotice('Select at least two rows to merge vertically.')
      return
    }
    if (preset === 'horizontal' && selectedRange.s.c === selectedRange.e.c) {
      setEditNotice('Select at least two columns to merge horizontally.')
      return
    }
    if (sheetMerges.some(merge => rangesOverlap(merge, selectedRange) && !rangeContains(selectedRange, merge))) {
      setEditNotice('Select the full existing merged area before merging.')
      return
    }
    const newMerges: XLSX.Range[] = []
    if (preset === 'vertical') {
      for (let column = selectedRange.s.c; column <= selectedRange.e.c; column++) {
        newMerges.push({ s: { r: selectedRange.s.r, c: column }, e: { r: selectedRange.e.r, c: column } })
      }
    } else if (preset === 'horizontal') {
      for (let row = selectedRange.s.r; row <= selectedRange.e.r; row++) {
        newMerges.push({ s: { r: row, c: selectedRange.s.c }, e: { r: row, c: selectedRange.e.c } })
      }
    } else {
      newMerges.push(selectedRange)
    }
    setMergeOverrides(current => new Map(current).set(selectedSheet, [...sheetMerges.filter(merge => !rangeContains(selectedRange, merge)), ...newMerges]))
    setEditNotice('')
  }

  const toggleMerge = () => changeMerge(selectedMerge ? 'unmerge' : 'all')

  const selectCell = (range: XLSX.Range, extend = false, axis?: ResizeAxis) => {
    rowSelectionDragRef.current = null
    columnSelectionDragRef.current = null
    pendingSelectionFocusRef.current = null
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    selectionFrameRef.current = null
    setEditingAddress(null)
    setEditNotice('')
    setSelection(current => ({ anchor: extend ? current.anchor : range.s, focus: range.e, axis }))
  }

  const selectRows = (row: number, anchor = row) => {
    hideCellAnnotations()
    selectionDragRef.current = false
    selectCell({ s: { r: anchor, c: columnStart }, e: { r: row, c: columnEnd } }, false, 'row')
  }

  const selectColumns = (column: number, anchor = column) => {
    hideCellAnnotations()
    selectionDragRef.current = false
    selectCell({ s: { r: rowStart, c: anchor }, e: { r: rowEnd, c: column } }, false, 'column')
  }

  const columnHeaderKey = (event: ReactKeyboardEvent<HTMLDivElement>, column: number) => {
    if ((event.target as HTMLElement).closest('[role="separator"], button')) return
    if (!readOnly && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      selectColumns(column, event.shiftKey ? selection.anchor.c : column)
    } else if (!readOnly && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const index = columns.indexOf(column)
      const nextColumn = columns[Math.max(0, Math.min(columns.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))]
      if (event.shiftKey) selectColumns(nextColumn, selection.anchor.c)
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-grid-axis="column"][data-grid-index="${nextColumn}"]`)?.focus())
    } else headerMenuKey(event, 'column', column)
  }

  const rowHeaderKey = (event: ReactKeyboardEvent<HTMLDivElement>, row: number) => {
    if ((event.target as HTMLElement).closest('[role="separator"], button')) return
    if (!readOnly && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault()
      selectRows(row, event.shiftKey ? selection.anchor.r : row)
    } else if (!readOnly && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const index = rows.indexOf(row)
      const nextRow = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)))]
      if (event.shiftKey) selectRows(nextRow, selection.anchor.r)
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-grid-axis="row"][data-grid-index="${nextRow}"]`)?.focus())
    } else headerMenuKey(event, 'row', row)
  }

  const selectBorderedBlock = () => {
    const visibleSelection = {
      s: { r: rows.findIndex(row => row >= selectedRange.s.r), c: columns.findIndex(column => column >= selectedRange.s.c) },
      e: { r: rows.reduce((last, row, index) => row <= selectedRange.e.r ? index : last, -1), c: columns.reduce((last, column, index) => column <= selectedRange.e.c ? index : last, -1) },
    }
    if (visibleSelection.s.r < 0 || visibleSelection.s.c < 0 || visibleSelection.e.r < visibleSelection.s.r || visibleSelection.e.c < visibleSelection.s.c) return
    function* borderedCells(): Generator<BorderedCell> {
      for (const [rowIndex, row] of rows.entries()) {
        for (const [columnIndex, column] of columns.entries()) {
          const merge = visibleMerges.get(XLSX.utils.encode_cell({ r: row, c: column }))
          if (merge && (row !== merge.firstRow || column !== merge.firstColumn)) continue
          yield {
            range: { s: { r: rowIndex, c: columnIndex }, e: { r: rowIndex + (merge?.rowSpan ?? 1) - 1, c: columnIndex + (merge?.columnSpan ?? 1) - 1 } },
            borders: resolvedBordersFor(merge?.source ?? { s: { r: row, c: column }, e: { r: row, c: column } }, true),
          }
        }
      }
    }
    const block = findBorderedRegion(visibleSelection, borderedCells())
    if (!block) return
    const range = { s: { r: rows[block.s.r], c: columns[block.s.c] }, e: { r: rows[block.e.r], c: columns[block.e.c] } }
    selectCell(range)
    requestAnimationFrame(() => sheetTableRef.current?.querySelector<HTMLElement>(`[data-cell="${XLSX.utils.encode_cell(range.s)}"]`)?.focus({ preventScroll: true }))
  }

  const extendSelection = (focus: XLSX.CellAddress) => {
    pendingSelectionFocusRef.current = focus
    if (selectionFrameRef.current !== null) return
    selectionFrameRef.current = requestAnimationFrame(() => {
      selectionFrameRef.current = null
      const nextFocus = pendingSelectionFocusRef.current
      if (nextFocus) setSelection(current => ({ ...current, focus: nextFocus }))
    })
  }

  const setPreviewSize = (axis: ResizeAxis, sheetName: string, index: number, size: number) => {
    if (readOnly) return
    const setOverrides = axis === 'row' ? setRowHeightOverrides : setColumnWidthOverrides
    setOverrides(current => {
      if (current.get(sheetName)?.get(index) === size) return current
      const updated = new Map(current)
      const sheetSizes = new Map(updated.get(sheetName))
      sheetSizes.set(index, size)
      updated.set(sheetName, sheetSizes)
      return updated
    })
  }

  const previewScale = () => {
    const transform = dialogRef.current ? getComputedStyle(dialogRef.current).transform : 'none'
    const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform)
    return { x: matrix.a || 1, y: matrix.d || 1 }
  }

  const cellContextMenu = useLatestEvent((event: ReactMouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => {
    if (readOnly || (event.target as HTMLElement).closest('textarea, [contenteditable="true"]')) return
    event.preventDefault()
    hideValidationTooltip()
    hideCellAnnotations()
    selectionDragRef.current = false
    if (!rangeContains(selectedRange, cell.range)) selectCell(cell.range)
    setSheetMenu(null)
    setHeaderMenu(null)
    setCellMenuPosition({ left: event.clientX, top: event.clientY })
  })
  const cellMouseDown = useLatestEvent((event: ReactMouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => {
    if ((event.target as HTMLElement).closest('[data-column-filter]')) return
    if (event.button !== 0) return
    event.preventDefault()
    hideValidationTooltip()
    hideCellAnnotations()
    selectionDragRef.current = true
    selectCell(cell.range, event.shiftKey)
    event.currentTarget.focus()
  })
  const cellMouseEnter = useLatestEvent((event: ReactMouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => {
    if (!selectionDragRef.current && !editingAddress && !cellMenuPosition && !headerMenu) showValidationTooltip(cell.range, event.currentTarget)
    else hideValidationTooltip()
    if (selectionDragRef.current && event.buttons === 1) {
      hideCellAnnotations()
      extendSelection(cell.range.e)
    } else if (cell.annotation && !editingAddress && !cellMenuPosition) {
      keepCellAnnotations()
      const rect = event.currentTarget.getBoundingClientRect()
      setCellAnnotationHover({ address: cell.sourceAddress, anchor: { left: rect.left, right: rect.right, top: rect.top } })
    } else hideCellAnnotations()
  })
  const cellMouseLeave = useLatestEvent(() => { hideValidationTooltip(); scheduleHideCellAnnotations() })
  const cellDoubleClick = useLatestEvent((cell: ExcelPreviewCellData) => {
    if (readOnly || cell.textReadOnly) return
    hideCellAnnotations()
    selectCell(cell.range)
    setEditingAddress(cell.sourceAddress)
  })
  const clearSelectedCells = () => {
    if (readOnly || !sheet) return
    setCellTextOverrides(current => {
      const sheetTexts = current.get(selectedSheet) ?? new Map<string, string>()
      const cleared = clearRangeText(sheet, sheetTexts, selectedRange, sheetMerges, scheduleSetup?.statusColumn)
      return cleared === sheetTexts ? current : new Map(current).set(selectedSheet, cleared)
    })
    setEditingAddress(null)
  }
  const cellKeyDown = useLatestEvent((event: ReactKeyboardEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => {
    if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
      if (readOnly) return
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      setCellMenuPosition({ left: rect.left, top: rect.bottom })
    } else if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault()
      if (!readOnly && !cell.textReadOnly) setEditingAddress(cell.sourceAddress)
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      clearSelectedCells()
    } else if (bounds && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const next = {
        r: Math.max(0, Math.min(bounds.lastRow, cell.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))),
        c: Math.max(0, Math.min(bounds.lastColumn, cell.column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))),
      }
      selectCell({ s: next, e: next }, event.shiftKey)
      requestAnimationFrame(() => sheetTableRef.current?.querySelector<HTMLElement>(`[data-cell="${XLSX.utils.encode_cell(next)}"]`)?.focus())
    }
  })
  const cellSave = useLatestEvent(saveCellTextDraft)
  const cellCancel = useLatestEvent(() => setEditingAddress(null))
  const openColumnFilter = useLatestEvent((column: number, anchor: HTMLButtonElement) => {
    flushSync(() => cellTextEditorRef.current?.commit())
    setFilterMenu({ column, anchor })
  })
  const cellEvents = useMemo<ExcelPreviewCellEvents>(() => ({ contextMenu: cellContextMenu, mouseDown: cellMouseDown, mouseEnter: cellMouseEnter, mouseLeave: cellMouseLeave, doubleClick: cellDoubleClick, keyDown: cellKeyDown, save: cellSave, cancel: cellCancel, dirtyChange: setHasCellDraftChanges, filter: openColumnFilter }), [cellContextMenu, cellMouseDown, cellMouseEnter, cellMouseLeave, cellDoubleClick, cellKeyDown, cellSave, cellCancel, openColumnFilter])
  // Formatting controls can reuse their view while these handlers follow the current selection.
  const toolbarStyleChange = useLatestEvent((patch: CSSProperties) => updateSelectedStyles(() => patch))
  const toolbarFontChange = useLatestEvent(changeFont)
  const toolbarBorderChange = useLatestEvent(changeBorders)
  const toolbarBorderLineChange = useLatestEvent(changeBorderLine)
  const toolbarMergeToggle = useLatestEvent(toggleMerge)
  const toolbarMergeChange = useLatestEvent(changeMerge)
  const toolbarPlotScheduleRows = useLatestEvent((status: 'Plot' | 'Draft') => {
    if (!showPlotTool || readOnly || !scheduleSetup || currentScheduleHeaderError || !selectedPlottableRows.length) return
    const rows = selectedPlottableRows.filter(row => status === 'Plot' ? scheduleSetup.rowStatuses?.get(row) !== 'Plot' : scheduleSetup.rowStatuses?.get(row) === 'Plot')
    if (!rows.length) return
    setIsScheduleSetupOpen(false)
    setPendingScheduleStatus({ status, sheetName: selectedSheet, range: selectedRange, rows, setup: scheduleSetup })
  })
  const closeScheduleStatusConfirmation = useLatestEvent(() => setPendingScheduleStatus(null))
  const confirmScheduleStatusChange = useLatestEvent(() => {
    const pending = pendingScheduleStatus
    if (!pending) return
    setPendingScheduleStatus(null)
    if (!showPlotTool || readOnly || pending.sheetName !== selectedSheet || currentScheduleHeaderError || scheduleSetup !== pending.setup) return
    const nextSetup = plotScheduleRows(scheduleSetup, pending.range, readScheduleCell, pending.status)
    if (nextSetup !== scheduleSetup) setScheduleSetups(current => new Map(current).set(pending.sheetName, nextSetup))
    setEditNotice(`Marked ${pending.rows.length} schedule ${pending.rows.length === 1 ? 'row' : 'rows'} as ${pending.status}. Save the workbook to update the schedule.`)
  })

  const syncHeadersToTable = () => {
    const table = sheetTableRef.current
    const columnTrack = columnTrackRef.current
    const rowHeaders = rowHeaderContainerRef.current
    if (!table || !columnTrack || !rowHeaders) return

    const tableRect = table.getBoundingClientRect()
    if (!tableRect.width || !tableRect.height) return
    // Screen rectangles include the modal's scale animation; CSS sizes do not.
    const scale = previewScale()
    const tableWidth = tableRect.width / scale.x
    const tableColumns = table.querySelectorAll<HTMLTableColElement>('col')
    const tableRows = table.tBodies[0]?.rows
    const columnRects = tableColumns.length === columnTrack.children.length
      ? Array.from(tableColumns, column => column.getBoundingClientRect())
      : []
    const rowRects = tableRows && tableRows.length === rowHeaders.children.length
      ? Array.from(tableRows, row => row.getBoundingClientRect())
      : []

    if (columnRects.length && columnRects.every(rect => rect.width > 0)) {
      columnRects.forEach((rect, index) => {
        const header = columnTrack.children.item(index) as HTMLElement
        header.style.translate = `${(rect.left - tableRect.left) / scale.x}px 0`
        header.style.width = `${rect.width / scale.x}px`
      })
      columnTrack.style.width = `${tableWidth}px`
      if (sheetCanvasRef.current) sheetCanvasRef.current.style.width = `${tableWidth}px`
      if (gridRef.current) gridRef.current.style.width = `${getGridHeaderWidth() + tableWidth}px`
    }

    rowRects.forEach((rect, index) => {
      const header = rowHeaders.children.item(index) as HTMLElement
      header.style.translate = `0 ${(rect.top - tableRect.top) / scale.y}px`
      header.style.height = `${rect.height / scale.y}px`
    })
  }

  const updateSelectionOutline = () => {
    const outline = selectionOutlineRef.current
    const canvas = sheetCanvasRef.current
    const table = sheetTableRef.current
    if (!outline || !canvas || !table) return

    const selectedRowIndexes = rows.flatMap((row, index) => row >= selectionHighlightRange.s.r && row <= selectionHighlightRange.e.r ? [index] : [])
    const selectedColumnIndexes = columns.flatMap((column, index) => column >= selectionHighlightRange.s.c && column <= selectionHighlightRange.e.c ? [index] : [])
    if (!selectedRowIndexes.length || !selectedColumnIndexes.length) {
      outline.style.display = 'none'
      return
    }
    const firstRow = table.tBodies[0]?.rows.item(selectedRowIndexes[0])
    const lastRow = table.tBodies[0]?.rows.item(selectedRowIndexes[selectedRowIndexes.length - 1])
    const tableColumns = table.querySelectorAll<HTMLTableColElement>('col')
    const firstColumn = tableColumns.item(selectedColumnIndexes[0])
    const lastColumn = tableColumns.item(selectedColumnIndexes[selectedColumnIndexes.length - 1])
    if (!firstRow || !lastRow || !firstColumn || !lastColumn) {
      outline.style.display = 'none'
      return
    }

    const canvasRect = canvas.getBoundingClientRect()
    const scale = previewScale()
    const firstRowRect = firstRow.getBoundingClientRect()
    const lastRowRect = lastRow.getBoundingClientRect()
    const firstColumnRect = firstColumn.getBoundingClientRect()
    const lastColumnRect = lastColumn.getBoundingClientRect()
    outline.style.display = 'block'
    outline.style.left = `${(firstColumnRect.left - canvasRect.left) / scale.x}px`
    outline.style.top = `${(firstRowRect.top - canvasRect.top) / scale.y}px`
    outline.style.width = `${(lastColumnRect.right - firstColumnRect.left) / scale.x}px`
    outline.style.height = `${(lastRowRect.bottom - firstRowRect.top) / scale.y}px`
  }

  const syncTableHeaders = useLatestEvent(syncHeadersToTable)
  const syncSelectionOutline = useLatestEvent(updateSelectionOutline)
  useLayoutEffect(() => {
    syncSelectionOutline()
  }, [syncSelectionOutline, selectionHighlightRange, rows, columns, renderedRowHeights, rowHeightOverrides, columnWidthOverrides, sheetWidth, editingAddress])

  const applyResize = (drag: ResizeDrag) => {
    const size = `${drag.currentSize}px`
    if (drag.axis === 'row') {
      const tableRow = drag.sheetElement as HTMLTableRowElement
      tableRow.style.height = size
      syncHeadersToTable()
      updateSelectionOutline()
      return
    }

    drag.headerElement.style.width = size
    const tableColumn = drag.sheetElement as HTMLTableColElement
    tableColumn.style.width = size
    const nextSheetWidth = `${drag.baseSheetWidth + drag.currentSize - drag.startSize}px`
    if (columnTrackRef.current) columnTrackRef.current.style.width = nextSheetWidth
    if (sheetTableRef.current) sheetTableRef.current.style.width = nextSheetWidth
    if (sheetCanvasRef.current) sheetCanvasRef.current.style.width = nextSheetWidth
    if (gridRef.current) gridRef.current.style.width = `${getGridHeaderWidth() + drag.baseSheetWidth + drag.currentSize - drag.startSize}px`
    syncHeadersToTable()
    updateSelectionOutline()
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, axis: ResizeAxis, index: number, size: number) => {
    if (readOnly) return
    if (event.button !== 0) return
    const headerElement = event.currentTarget.parentElement
    const position = axis === 'row' ? rows.indexOf(index) : columns.indexOf(index)
    const sheetElement = axis === 'row'
      ? sheetTableRef.current?.tBodies[0]?.rows[position]
      : sheetTableRef.current?.querySelectorAll<HTMLTableColElement>('col[data-worksheet-column]')[position]
    if (!(headerElement instanceof HTMLDivElement) || !sheetElement) return

    event.preventDefault()
    event.stopPropagation()
    resizeDragRef.current = {
      axis,
      sheetName: selectedSheet,
      index,
      pointerId: event.pointerId,
      startPosition: axis === 'row' ? event.clientY : event.clientX,
      startSize: size,
      currentSize: size,
      baseSheetWidth: sheetWidth,
      headerElement,
      sheetElement,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const position = drag.axis === 'row' ? event.clientY : event.clientX
    const minimum = drag.axis === 'row' ? 12 : 20
    const size = Math.max(minimum, Math.round(drag.startSize + position - drag.startPosition))
    if (drag.currentSize === size) return
    drag.currentSize = size
    if (resizeFrameRef.current !== null) return
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null
      if (resizeDragRef.current === drag) applyResize(drag)
    })
  }

  const stopResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
    resizeFrameRef.current = null
    applyResize(drag)
    resizeDragRef.current = null
    if (drag.currentSize !== drag.startSize) {
      const heights = Array.from(sheetTableRef.current?.tBodies[0]?.rows || [], row => Number.parseFloat(getComputedStyle(row).height))
      setRenderedRowHeights(current =>
        current.length === heights.length && current.every((height, index) => Math.abs(height - heights[index]) < 0.1)
          ? current
          : heights,
      )
      setPreviewSize(drag.axis, drag.sheetName, drag.index, drag.currentSize)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>, axis: ResizeAxis, index: number, size: number) => {
    if (readOnly) return
    const decrease = axis === 'row' ? 'ArrowUp' : 'ArrowLeft'
    const increase = axis === 'row' ? 'ArrowDown' : 'ArrowRight'
    if (event.key !== decrease && event.key !== increase) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const minimum = axis === 'row' ? 12 : 20
    setPreviewSize(axis, selectedSheet, index, Math.max(minimum, Math.round(size + (event.key === increase ? step : -step))))
  }

  useLayoutEffect(() => {
    const table = sheetTableRef.current
    const tableRows = Array.from(table?.tBodies[0]?.rows || [])
    if (!table || !tableRows.length) return

    const measureTable = () => {
      syncTableHeaders()
      syncSelectionOutline()
      if (resizeDragRef.current) return
      const heights = tableRows.map(tableRow => Number.parseFloat(getComputedStyle(tableRow).height))
      setRenderedRowHeights(current =>
        current.length === heights.length && current.every((height, index) => Math.abs(height - heights[index]) < 0.1)
          ? current
          : heights,
      )
    }

    measureTable()
    let measureFrame: number | null = null
    const observer = new ResizeObserver(() => {
      if (measureFrame !== null) return
      measureFrame = requestAnimationFrame(() => { measureFrame = null; measureTable() })
    })
    observer.observe(table)
    tableRows.forEach(tableRow => observer.observe(tableRow))
    return () => { observer.disconnect(); if (measureFrame !== null) cancelAnimationFrame(measureFrame) }
  }, [sheet, rows, columns, syncTableHeaders, syncSelectionOutline])

  useEffect(() => {
    let cancelled = false
    setError('')
    setIsReading(true)
    importedSourceRef.current = null
    savedSnapshotRef.current = null
    seenLiveWorkbookRef.current = undefined
    liveOriginalFileRef.current = file
    setLiveConflict(undefined)
    setLiveNotice('')
    setSaveError('')
    setIsCommentsOpen(false)
    setWorkbook(null)
    setPreviewStyles(null)
    setRowHeightOverrides(new Map())
    setColumnWidthOverrides(new Map())
    setCellTextOverrides(new Map())
    setAddedRowsBySheet(new Map())
    setRowsToAdd(DEFAULT_ROWS_TO_ADD)
    setSheetMenu(null)
    setRenamingSheet(null)
    setSheetNameDraft('')
    setSheetNameError('')
    setSheetColors(new Map())
    setCellStyleOverrides(new Map())
    setMergeOverrides(new Map())
    setFormattingOverrides(new Map())
    setScheduleSetups(new Map())
    setHiddenRangeToggles(new Map())
    setIsScheduleSetupOpen(false)
    setScheduleNotice('')
    cellClipboardRef.current = null
    setCellMenuPosition(null)
    hideCellAnnotations()
    setSelection({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } })
    setEditingAddress(null)
    pendingSelectionFocusRef.current = null
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    selectionFrameRef.current = null
    resizeDragRef.current = null
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
    resizeFrameRef.current = null

    const readFile = async () => {
      try {
        if (loading || loadBlocked) return
        // Paint the loading state before synchronous XLSX/JSON parsing can block the UI.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        if (cancelled) return
        if (persistenceMode === 'firestore' && initialEditorState !== undefined) {
          const saved = deserializeWorkbookState(initialEditorState, {})
          savedSnapshotRef.current = saved
          restoreEdit(saved)
          return
        }
        if (!file) {
          // New workbooks need a baseline too, so adding the first sheet is a
          // local edit rather than an unknown workbook during live merging.
          const empty: WorkbookEditSnapshot = {
            workbook: XLSX.utils.book_new(), previewStyles: null,
            sheetColors: new Map(), addedRowsBySheet: new Map(),
            rowHeightOverrides: new Map(), columnWidthOverrides: new Map(),
            cellTextOverrides: new Map(), cellStyleOverrides: new Map(),
            mergeOverrides: new Map(), formattingOverrides: new Map(),
            scheduleSetups: new Map(), hiddenRangeToggles: new Map(),
            selectedSheet: '', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
          }
          savedSnapshotRef.current = empty
          restoreEdit(empty)
          return
        }
        if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an .xlsx workbook.')
        const data = await file.arrayBuffer()
        if (cancelled) return
        const loadedWorkbook = XLSX.read(data, { type: 'array', cellStyles: true })
        if (loadedWorkbook.SheetNames.length === 0) throw new Error('This workbook has no sheets to display.')
        const loadedStyles = parseExcelPreviewStyles(data)
        if (initialEditorState !== undefined) {
          const saved = deserializeWorkbookState(initialEditorState, loadedStyles.files)
          if (cancelled) return
          savedSnapshotRef.current = saved
          restoreEdit(saved)
          return
        }
        const detectedSetups = new Map<string, ScheduleSetup>()
        for (const name of loadedWorkbook.SheetNames) {
          const importedSheet = loadedWorkbook.Sheets[name]
          const candidates = Object.keys(importedSheet)
            .filter(address => !address.startsWith('!') && getCellText(importedSheet[address]).trim().toLowerCase() === 'college')
            .map(address => XLSX.utils.decode_cell(address))
          if (!candidates.length) continue
          const setup = detectScheduleSetup(candidates, getSheetBounds(importedSheet).lastRow, (row, column) => getCellText(importedSheet[XLSX.utils.encode_cell({ r: row, c: column })]))
          if (setup) detectedSetups.set(name, setup)
        }
        const firstVisibleSheet = loadedWorkbook.Workbook?.Sheets?.find(item => !item.Hidden)?.name
        if (cancelled) return
        setWorkbook(loadedWorkbook)
        setScheduleSetups(detectedSetups)
        setPreviewStyles(loadedStyles)
        setSelectedSheet(firstVisibleSheet || loadedWorkbook.SheetNames[0])
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'The workbook could not be opened.')
      } finally {
        if (!cancelled) setIsReading(false)
      }
    }
    void readFile()
    return () => {
      cancelled = true
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current)
      if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    }
  }, [file, initialEditorState, persistenceMode, loading, loadBlocked, emptyWorkbookBehavior])

  const finishSheetImport = useLatestEvent((importError?: string) => onImportComplete?.(importError))
  useEffect(() => {
    if (!sheetImport) return
    let cancelled = false
    const applyImport = async () => {
      try {
        if (cancelled) return
        if (readOnly || !allowImportExport || !allowSheetCreationAndRemoval || loading || loadBlocked || savingRef.current) throw new Error('The workbook is not available for importing yet.')
        flushSync(() => cellTextEditorRef.current?.commit())
        const current = workbookSnapshotRef.current
        if (!current) throw new Error('Wait for the workbook to open before importing sheets.')
        const defaultSheetName = !file && !importedSourceRef.current ? 'Sheet1' : undefined
        const prepared = appendImportedSheets(current, sheetImport, defaultSheetName)
        const source = persistenceMode === 'firestore' ? sheetImport.file : await createImportedSourceFile(importedSourceRef.current || file, sheetImport.file, prepared.snapshot.previewStyles?.files || {})
        if (cancelled) return
        const { snapshot, addedNames } = appendImportedSheets(workbookSnapshotRef.current || current, sheetImport, defaultSheetName)
        for (const name of addedNames) {
          const importedSheet = snapshot.workbook.Sheets[name]
          const candidates = Object.keys(importedSheet)
            .filter(address => !address.startsWith('!') && getCellText(importedSheet[address]).trim().toLowerCase() === 'college')
            .map(address => XLSX.utils.decode_cell(address))
          if (!candidates.length) continue
          const setup = detectScheduleSetup(candidates, getSheetBounds(importedSheet).lastRow, (row, column) => getCellText(importedSheet[XLSX.utils.encode_cell({ r: row, c: column })]))
          if (setup) snapshot.scheduleSetups.set(name, setup)
        }
        if (cancelled) return
        importedSourceRef.current = source
        restoreEdit(snapshot)
        finishSheetImport()
      } catch (caught) {
        if (!cancelled) finishSheetImport(caught instanceof Error ? caught.message : 'The selected sheets could not be imported.')
      }
    }
    // Commit active edits after React has finished the import-request render.
    void Promise.resolve().then(applyImport)
    return () => { cancelled = true }
  }, [sheetImport, file, persistenceMode, readOnly, allowImportExport, allowSheetCreationAndRemoval, loading, loadBlocked, finishSheetImport])

  useEffect(() => {
    const stopSelecting = () => { selectionDragRef.current = false; rowSelectionDragRef.current = null; columnSelectionDragRef.current = null }
    window.addEventListener('mouseup', stopSelecting)
    window.addEventListener('blur', stopSelecting)
    return () => {
      window.removeEventListener('mouseup', stopSelecting)
      window.removeEventListener('blur', stopSelecting)
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleModalKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (axisMoveDragRef.current) { endAxisDrag(); return }
        if (isExportPickerOpen || pendingScheduleStatus) return
        if (isScheduleSetupOpen) setIsScheduleSetupOpen(false)
        else if (headerMenu) closeHeaderMenu()
        else if (cellMenuPosition) setCellMenuPosition(null)
        else if (sheetMenu?.type === 'sheet' && sheetMenu.listPosition) {
          sheetMenuContextPointRef.current = null
          setSheetMenuPosition(sheetMenu.listPosition)
          setSheetMenu({ type: 'list' })
          requestAnimationFrame(() => sheetListContextAnchorRef.current?.focus())
        }
        else if (sheetMenu) setSheetMenu(null)
        else if (!savingRef.current) onClose()
      }
      if (event.key !== 'Tab' || isExportPickerOpen || pendingScheduleStatus || isScheduleSetupOpen || headerMenu) return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])
        .filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleModalKeys)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleModalKeys)
    }
  }, [onClose, sheetMenu, cellMenuPosition, isScheduleSetupOpen, headerMenu, isExportPickerOpen, pendingScheduleStatus])

  const headerNotice = allowHeaderMoves && axisMoveNotice ? axisMoveNotice
    : liveNotice && !liveConflict ? { message: liveNotice, error: false } : null

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onMouseDown={event => {
      if (event.target === event.currentTarget && !savingRef.current) onClose()
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="excel-preview-title" onKeyDown={event => {
        if (isScheduleSetupOpen) return
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a') return
        const target = event.target
        if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))) return
        if (!sheet || !rows.length || !columns.length) return
        event.preventDefault()
        window.getSelection()?.removeAllRanges()
        hideCellAnnotations()
        setHoveredSheetComment(null)
        setSheetMenu(null)
        setCellMenuPosition(null)
        selectionDragRef.current = false
        selectBorderedBlock()
      }} className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden border border-gray-200 bg-white text-slate-900 shadow-2xl animate-in zoom-in-95 duration-200 ${isAxisDragging ? 'cursor-grabbing [&_*]:!cursor-grabbing' : ''}`}>
        <div className="relative z-40 flex shrink-0 flex-wrap items-center justify-between gap-4 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white">
          <div className="min-w-0">
            <h2 id="excel-preview-title" className="text-xl font-bold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-xs font-medium text-white/80">{subtitle}</p>}
          </div>
          {headerNotice && <div className="flex min-w-[min(280px,100%)] flex-1 justify-center">
            <div className={`flex w-fit min-w-[min(280px,100%)] max-w-full flex-initial items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${headerNotice.error ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-[#c6dbb6] bg-[#f3f7ee] text-[#41572a]'}`}>
              <p role="status" aria-live="polite" className="min-w-0 flex-1 break-words">{headerNotice.message}</p>
              <button type="button" aria-label={allowHeaderMoves && axisMoveNotice ? 'Dismiss move message' : 'Dismiss live update message'} className="shrink-0 rounded px-1 font-bold focus-visible:outline-2 focus-visible:outline-current" onClick={() => { if (allowHeaderMoves && axisMoveNotice) setAxisMoveNotice(null); else setLiveNotice('') }}>×</button>
            </div>
          </div>}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {readOnly && <span className="rounded-lg bg-white/15 px-3 py-1 text-sm font-medium">Read only</span>}
            {onRetryLoad && <button type="button" disabled={loading} onClick={onRetryLoad} className="rounded-lg border border-white/30 bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25 disabled:opacity-50">Retry loading</button>}
            {onSave && !readOnly && <>
              {!loading && !loadBlocked && workbook && <span role="status" aria-live="polite" className="text-sm text-white/90">{isSaving ? savingMessage || 'Saving…' : hasUnsavedChanges || editingAddress && hasCellDraftChanges ? 'Unsaved changes' : savedMessage}</span>}
              <button type="button" disabled={isSaving || isReading || loading || loadBlocked || importing || !workbook} onClick={() => { void saveWorkbook() }} className="rounded-lg border border-white/30 bg-white/15 px-4 py-2 font-medium text-white hover:bg-white/25 disabled:opacity-50">Save</button>
            </>}
            <button type="button" autoFocus disabled={isSaving} onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-gray-50 disabled:opacity-50" aria-label="Close Excel preview">Close</button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {isOpeningWorkbook && <div role="status" aria-live="polite" className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="space-y-1">
                <p className="text-[18px] leading-[26px] font-semibold text-slate-800">Opening workbook…</p>
                <p className="text-[14px] leading-[20px] text-slate-500">{loadingMessage || 'Preparing your sheets for viewing.'}</p>
              </div>
            </div>
          </div>}
          {error && <p role="alert" className="m-6 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p>}
          {loadError && <p role="alert" className="mx-6 my-2 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{loadError}</p>}
          {saveError && <p role="alert" className="mx-6 my-2 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{saveError}</p>}
          {liveError && <div role="alert" className="mx-6 my-2 flex flex-wrap items-center gap-3 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">
            <span>{liveError}</span>
            {onRetryLive && <button type="button" onClick={onRetryLive} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-medium">Retry live updates</button>}
          </div>}
          {liveConflict && <div role="alert" className="mx-6 my-2 flex flex-wrap items-center gap-3 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900">
            <span>{liveConflict.conflicts.includes('Workbook layout or source sheets') ? 'The workbook layout or source sheets changed while you were editing. Choose which workbook to keep.' : `Another user saved changes that conflict with your edits (${liveConflict.conflicts.length}). Choose which edits to keep for those conflicts.`}</span>
            <button type="button" disabled={isSaving || importing} onClick={() => resolveLiveConflict('local')} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50">Keep my edits</button>
            <button type="button" disabled={isSaving || importing} onClick={() => resolveLiveConflict('remote')} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium disabled:opacity-50">Use saved edits</button>
          </div>}
          {roomValidationError && <p role="alert" className="mx-6 my-2 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{roomValidationError}</p>}
          {facultySuggestions?.error && <p role="alert" className="mx-6 my-2 rounded-xl bg-rose-100 px-4 py-3 text-sm text-rose-700">{facultySuggestions.error} Faculty validation is unavailable.</p>}
          {workbook && !isOpeningWorkbook && !loadBlocked && (
        <div className="flex min-h-0 flex-1 flex-col">
          {bounds && !readOnly && <ExcelCellToolbar
            style={selectedStyle}
            mergeDisabled={selectedStatusText}
            merged={Boolean(selectedMerge)}
            canUnmerge={sheetMerges.some(merge => rangesOverlap(merge, selectedRange))}
            onStyleChange={toolbarStyleChange}
            onFontChange={toolbarFontChange}
            onBorderChange={toolbarBorderChange}
            onBorderLineChange={toolbarBorderLineChange}
            onMergeToggle={toolbarMergeToggle}
            onMergeChange={toolbarMergeChange}
            onPlotScheduleRows={toolbarPlotScheduleRows}
            showPlotTool={showPlotTool}
            canPlotScheduleRows={selectedPlottableRows.length > 0}
            canUnplotScheduleRows={canUnplotScheduleRows}
            selectedRowsPlotted={selectedRowsPlotted}
          />}
          <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!bounds ? (
            !workbook.SheetNames.length
              ? <div role="status" className="flex flex-1 items-center justify-center px-6 py-8"><p className="text-center text-[18px] leading-[26px] text-slate-600">The workbook is empty.</p></div>
              : <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">This sheet has no displayed cell values.</p>
          ) : (
            <>
              <div ref={sheetScrollRef} className={`min-h-0 flex-1 overflow-auto ${allowHeaderMoves ? '[overflow-anchor:none]' : ''} ${isAxisDragging ? 'cursor-grabbing [&_*]:!cursor-grabbing' : ''}`}>
                <div ref={gridRef} className="w-max">
                  <div className="sticky top-0 z-30 bg-white">
                    <div className="flex border-t border-b border-t-[#62853e] border-b-[#62853e] bg-[#f3f7ee] text-xs text-[#41572a]">
                      <div data-grid-axis="all" aria-label="Rows and columns visibility" aria-haspopup={readOnly ? undefined : 'menu'} tabIndex={readOnly ? -1 : 0} onContextMenu={event => {
                        if (readOnly) return
                        event.preventDefault()
                        openCornerMenu({ left: event.clientX, top: event.clientY })
                      }} onKeyDown={event => {
                        if (readOnly || !(event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10' || event.key === 'Enter' || event.key === ' ')) return
                        event.preventDefault()
                        event.stopPropagation()
                        const rect = event.currentTarget.getBoundingClientRect()
                        openCornerMenu({ left: rect.left, top: rect.bottom })
                      }} className={`sticky left-0 z-10 w-16 shrink-0 border-r border-r-[#62853e] bg-[#f3f7ee] px-3 py-2 text-center font-semibold focus-visible:bg-[#e3edda] focus-visible:outline-none ${readOnly ? '' : 'cursor-pointer'}`}>#</div>
                      <div ref={columnTrackRef} className="relative flex" style={{ width: sheetWidth }}>
                        {columns.map((column, index) => (
                          <div
                            key={column}
                            data-grid-axis="column"
                            data-grid-index={column}
                            data-revealed={shownColumnRanges.some(range => column >= range.start && column <= range.end)}
                            aria-label={`Column ${XLSX.utils.encode_col(column)}`}
                            aria-haspopup={readOnly ? undefined : 'menu'}
                            tabIndex={readOnly ? -1 : 0}
                            aria-selected={selection.axis === 'column' && column >= rawSelectedRange.s.c && column <= rawSelectedRange.e.c}
                            draggable={false}
                            title={allowHeaderMoves && !readOnly ? 'Select columns, then drag a selected letter to move them. Shift-click to select multiple columns.' : undefined}
                            onPointerDown={event => startAxisDrag(event, 'column')}
                            onPointerMove={moveAxisHeaders}
                            onPointerUp={dropAxisHeaders}
                            onPointerCancel={event => { if (axisMoveDragRef.current?.pointerId === event.pointerId) endAxisDrag() }}
                            onLostPointerCapture={event => { if (axisMoveDragRef.current?.pointerId === event.pointerId) endAxisDrag() }}
                            onMouseDown={event => {
                              if (readOnly || event.button !== 0 || (event.target as HTMLElement).closest('[role="separator"]')) return
                              if (allowHeaderMoves && !event.shiftKey && selection.axis === 'column' && column >= rawSelectedRange.s.c && column <= rawSelectedRange.e.c) {
                                columnSelectionDragRef.current = null
                                event.currentTarget.focus({ preventScroll: true })
                                return
                              }
                              event.preventDefault()
                              const anchor = event.shiftKey ? selection.anchor.c : column
                              selectColumns(column, anchor)
                              columnSelectionDragRef.current = anchor
                              event.currentTarget.focus({ preventScroll: true })
                            }}
                            onMouseEnter={event => {
                              if (columnSelectionDragRef.current === null || event.buttons !== 1) return
                              const anchor = columnSelectionDragRef.current
                              selectColumns(column, anchor)
                              columnSelectionDragRef.current = anchor
                            }}
                            onContextMenu={event => {
                              if (readOnly) return
                              event.preventDefault()
                              openHeaderMenu('column', column, { left: event.clientX, top: event.clientY })
                            }}
                            onKeyDown={event => columnHeaderKey(event, column)}
                            className={`absolute inset-y-0 left-0 flex shrink-0 select-none items-center justify-center px-1 py-1 text-center font-semibold data-[revealed=true]:bg-[#e3edda] aria-selected:bg-[#c6dbb6] focus-visible:bg-[#e3edda] focus-visible:outline-none ${readOnly ? '' : allowHeaderMoves && selection.axis === 'column' && column >= rawSelectedRange.s.c && column <= rawSelectedRange.e.c ? 'cursor-grab touch-none' : 'cursor-pointer'} ${index < columns.length - 1 ? 'after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:translate-x-1/2 after:border-r after:border-r-[#c6dbb6] after:content-[\'\']' : ''}`}
                            style={{ width: displayedColumnWidth(column) }}
                          >
                            <span className="overflow-hidden">{XLSX.utils.encode_col(column)}</span>
                            {axisDropTarget?.axis === 'column' && axisDropTarget.index === column && <span aria-hidden="true" className={`pointer-events-none absolute inset-y-0 z-20 w-0.5 ${axisDropTarget.after ? 'right-0' : 'left-0'} ${axisDropTarget.error ? 'bg-rose-500' : 'bg-[#62853e]'}`} />}
                            {columnIndicators.get(column)?.map(indicator => renderVisibilityIndicator('column', indicator, columns.indexOf(column)))}
                            <div
                              role="separator"
                              aria-label={`Resize column ${XLSX.utils.encode_col(column)}`}
                              aria-orientation="vertical"
                              aria-valuemin={20}
                              aria-valuenow={displayedColumnWidth(column)}
                              aria-disabled={readOnly}
                              tabIndex={readOnly ? -1 : 0}
                              title={`Drag to resize column ${XLSX.utils.encode_col(column)}`}
                              className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-[#62853e]/20 focus-visible:bg-[#62853e]/20 focus-visible:outline-none"
                              onPointerDown={event => startResize(event, 'column', column, displayedColumnWidth(column))}
                              onPointerMove={moveResize}
                              onPointerUp={stopResize}
                              onPointerCancel={stopResize}
                              onLostPointerCapture={stopResize}
                              onKeyDown={event => resizeWithKeyboard(event, 'column', column, displayedColumnWidth(column))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex">
                    <div ref={rowHeaderContainerRef} className="sticky left-0 z-20 w-16 shrink-0 border-r border-r-[#62853e] bg-[#f3f7ee] text-center text-xs font-medium text-[#41572a]">
                      {rows.map((row, index) => (
                        <div
                          key={row}
                          data-grid-axis="row"
                          data-grid-index={row}
                          data-revealed={shownRowRanges.some(range => row >= range.start && row <= range.end)}
                          aria-haspopup={readOnly ? undefined : 'menu'}
                          tabIndex={readOnly ? -1 : 0}
                          aria-selected={selection.axis === 'row' && row >= rawSelectedRange.s.r && row <= rawSelectedRange.e.r}
                          draggable={false}
                          onPointerDown={event => startAxisDrag(event, 'row')}
                          onPointerMove={moveAxisHeaders}
                          onPointerUp={dropAxisHeaders}
                          onPointerCancel={event => { if (axisMoveDragRef.current?.pointerId === event.pointerId) endAxisDrag() }}
                          onLostPointerCapture={event => { if (axisMoveDragRef.current?.pointerId === event.pointerId) endAxisDrag() }}
                          onMouseDown={event => {
                            if (readOnly || event.button !== 0 || (event.target as HTMLElement).closest('[role="separator"]')) return
                            if (allowHeaderMoves && !event.shiftKey && selection.axis === 'row' && row >= rawSelectedRange.s.r && row <= rawSelectedRange.e.r) {
                              rowSelectionDragRef.current = null
                              event.currentTarget.focus({ preventScroll: true })
                              return
                            }
                            event.preventDefault()
                            const anchor = event.shiftKey ? selection.anchor.r : row
                            selectRows(row, anchor)
                            rowSelectionDragRef.current = anchor
                            event.currentTarget.focus({ preventScroll: true })
                          }}
                          onMouseEnter={event => {
                            if (rowSelectionDragRef.current === null || event.buttons !== 1) return
                            const anchor = rowSelectionDragRef.current
                            selectRows(row, anchor)
                            rowSelectionDragRef.current = anchor
                          }}
                          onContextMenu={event => {
                            if (readOnly) return
                            event.preventDefault()
                            openHeaderMenu('row', row, { left: event.clientX, top: event.clientY })
                          }}
                          onKeyDown={event => rowHeaderKey(event, row)}
                          aria-label={scheduleSetup?.years.has(row) && !currentScheduleHeaderError ? `Row ${row + 1}, ${SCHEDULE_YEAR_LABELS[scheduleSetup.years.get(row)!]}, ${scheduleSetup.rowStatuses?.get(row) ?? 'Draft'}` : `Row ${row + 1}`}
                          title={[scheduleSetup?.years.has(row) && !currentScheduleHeaderError ? `Status: ${scheduleSetup.rowStatuses?.get(row) ?? 'Draft'}` : '', allowHeaderMoves && !readOnly ? 'Select rows, then drag a selected number to move them. Shift-click to select multiple rows.' : ''].filter(Boolean).join('\n') || undefined}
                          className={`absolute inset-x-0 top-0 flex select-none items-center justify-center px-1 data-[revealed=true]:bg-[#e3edda] aria-selected:bg-[#c6dbb6] focus-visible:bg-[#e3edda] focus-visible:outline-none ${readOnly ? '' : allowHeaderMoves && selection.axis === 'row' && row >= rawSelectedRange.s.r && row <= rawSelectedRange.e.r ? 'cursor-grab touch-none' : 'cursor-pointer'} ${index < rows.length - 1 ? 'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:translate-y-1/2 after:border-b after:border-b-[#c6dbb6] after:content-[\'\']' : ''}`}
                          style={{ height: Math.max(displayedRowHeight(row), renderedRowHeights[index] ?? 0) }}
                        >
                          {row + 1}
                          {axisDropTarget?.axis === 'row' && axisDropTarget.index === row && <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 z-20 h-0.5 ${axisDropTarget.after ? 'bottom-0' : 'top-0'} ${axisDropTarget.error ? 'bg-rose-500' : 'bg-[#62853e]'}`} />}
                          {rowIndicators.get(row)?.map(indicator => renderVisibilityIndicator('row', indicator, index))}
                          {scheduleSetup?.years.has(row) && !currentScheduleHeaderError && <span aria-hidden="true" className="pointer-events-none absolute right-1 top-0 text-[8px] font-semibold text-[#62853e]">Y{scheduleSetup.years.get(row)}</span>}
                          <div
                            role="separator"
                            aria-label={`Resize row ${row + 1}`}
                            aria-orientation="horizontal"
                            aria-valuemin={12}
                            aria-valuenow={Math.round(rowResizeSize(row, index))}
                            aria-disabled={readOnly}
                            tabIndex={readOnly ? -1 : 0}
                            title={`Drag to resize row ${row + 1}`}
                            className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-row-resize touch-none hover:bg-[#62853e]/20 focus-visible:bg-[#62853e]/20 focus-visible:outline-none"
                            onPointerDown={event => startResize(event, 'row', row, rowResizeSize(row, index))}
                            onPointerMove={moveResize}
                            onPointerUp={stopResize}
                            onPointerCancel={stopResize}
                            onLostPointerCapture={stopResize}
                            onKeyDown={event => resizeWithKeyboard(event, 'row', row, rowResizeSize(row, index))}
                          />
                        </div>
                      ))}
                    </div>
                    <div ref={sheetCanvasRef} className="relative shrink-0" style={{ width: sheetWidth }}>
                    <table ref={sheetTableRef} aria-label={`${selectedSheet} worksheet preview`} className="table-fixed border-collapse bg-white text-left text-xs text-slate-800" style={{ width: sheetWidth }}>
                      <colgroup>
                        {columns.map(column => <col key={column} data-worksheet-column={column} style={{ width: displayedColumnWidth(column) }} />)}
                      </colgroup>
                      <tbody>
                        {previewRows.map(({ row, cells }) => <ExcelPreviewRow key={row} row={row} height={displayedRowHeight(row)} cells={cells}
                          selection={cells.some(cell => rangesOverlap(cell.range, selectedRange)) ? selectedRange : null}
                          highlightedComment={highlightedCommentCell && cells.some(cell => rangeContains(cell.range, { s: highlightedCommentCell, e: highlightedCommentCell })) ? highlightedCommentCell : null}
                          editingAddress={editingAddress && cells.some(cell => cell.sourceAddress === editingAddress) ? editingAddress : null}
                          facultySuggestions={editingAddress && cells.some(cell => cell.sourceAddress === editingAddress) ? editingFacultySuggestions : undefined}
                          sheetName={selectedSheet} editorRef={cellTextEditorRef} onFontContextChange={setEditorFont} events={cellEvents}
                          year={!currentScheduleHeaderError ? scheduleSetup?.years.get(row) : undefined} duplicate={scheduleValidation.duplicateSubjectRows.has(row)} overlap={scheduleValidation.overlapRows.has(row)} missing={scheduleValidation.missingValueRows.has(row)} />)}
                      </tbody>
                    </table>
                    <div ref={selectionOutlineRef} aria-hidden="true" className="pointer-events-none absolute z-10 box-border border-2 border-[#62853e] bg-[#62853e]/15" />
                    </div>
                  </div>
                </div>
                {!readOnly && <div className="sticky left-0 flex w-full flex-wrap items-center justify-center gap-3 border-t border-gray-200 bg-slate-50 px-4 py-3 text-lg text-slate-700">
                  <button type="button" onClick={addRows} disabled={!canAddRows} className="font-semibold text-[#62853e] hover:text-[#526f34] hover:underline disabled:cursor-not-allowed disabled:opacity-40">Add</button>
                  <input type="number" min={1} max={MAX_ROWS_TO_ADD} step={1} inputMode="numeric" aria-label="Number of rows to add" value={rowsToAdd} onChange={event => setRowsToAdd(event.target.value)} className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-slate-900 [appearance:textfield] focus:border-[#62853e] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                  <span>more rows at the bottom</span>
                </div>}
              </div>
            </>
          )}
          </div>
          {isCommentsOpen && sheet && <ExcelSheetComments sheet={sheet} sheetName={selectedSheet} onClose={() => setIsCommentsOpen(false)} onHoverCell={address => setHoveredSheetComment(address ? { sheet: selectedSheet, address } : null)} onCommentAction={handleSheetCommentAction} readOnly={readOnly} />}
          </div>
        </div>
          )}
        </div>
        {workbook && (emptyWorkbookBehavior !== 'message' || workbook.SheetNames.length > 0 || !readOnly && allowSheetCreationAndRemoval) && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2 text-sm text-slate-600">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {showFilters && bounds && <button type="button" onClick={toggleFilters} disabled={isSaving || isReading || loading || loadBlocked || importing} aria-pressed={Boolean(sheetFilter)} title={sheetFilter ? 'Turn off filters and show all rows' : 'Filter this sheet using its schedule header or the selected header row'} className="flex h-[32px] shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-[#41572a] hover:bg-[#e3edda] aria-pressed:bg-[#e3edda] disabled:opacity-40">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 fill-current"><path d="M2 3h12L9 8v5l-2 1V8Z" /></svg>Filter
              </button>}
              {onImport && !readOnly && allowImportExport && allowSheetCreationAndRemoval && <ExcelFileMenu disabled={isSaving || isReading || loading || loadBlocked || importing || isExporting} exportDisabled={!workbook.SheetNames.length} importing={importing} onImport={() => { flushSync(() => cellTextEditorRef.current?.commit()); const snapshot = workbookSnapshotRef.current; if (snapshot) onImport(persistenceMode === 'firestore' ? serializeFirestoreWorkbookState(snapshot) : serializeWorkbookState(snapshot)) }} onExport={openExportPicker} importLabel={importLabel} />}
              {!readOnly && allowSheetCreationAndRemoval && <button type="button" onClick={addSheet} aria-label="Add sheet" title="Add sheet" className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a]"><PlusIcon className="h-[20px] w-[20px]" /></button>}
              <button type="button" data-all-sheets-trigger onClick={event => openMenu({ type: 'list' }, event.currentTarget)} aria-label="All sheets" title="All sheets" className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a]">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[20px] w-[20px] fill-none stroke-current stroke-2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <div ref={sheetTabsRef} role="tablist" aria-label="Sheets" className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {sheetNames.map(name => (
                  <div key={name} data-sheet-tab onContextMenu={event => {
                    if (renamingSheet === name) return
                    event.preventDefault()
                    event.stopPropagation()
                    openMenu({ type: 'sheet', name }, event.currentTarget)
                  }} className={`flex min-h-[32px] shrink-0 items-center border-b-2 text-[16px] leading-[22px] font-medium hover:bg-[#e3edda] ${selectedSheet === name ? 'bg-[#f3f7ee] text-[#41572a]' : 'text-slate-700'}`} style={{ borderColor: sheetColors.get(name) ?? (selectedSheet === name ? '#62853e' : 'transparent') }}>
                    {renamingSheet === name ? <input
                      ref={sheetRenameInputRef}
                      autoFocus
                      aria-label={`Rename ${name}`}
                      aria-invalid={Boolean(sheetNameError)}
                      value={sheetNameDraft}
                      maxLength={31}
                      onFocus={event => event.currentTarget.select()}
                      onChange={event => { setSheetNameDraft(event.target.value); setSheetNameError('') }}
                      onBlur={() => {
                        if (skipRenameBlurRef.current) {
                          skipRenameBlurRef.current = false
                          return
                        }
                        renameSheet(name)
                      }}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          renameSheet(name)
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          skipRenameBlurRef.current = true
                          setRenamingSheet(null)
                          setSheetNameError('')
                        }
                      }}
                      style={renameTabStyle}
                      className="min-w-0 max-w-72 border-0 bg-transparent px-4 py-1 text-[16px] leading-[22px] font-medium text-inherit outline-none selection:bg-blue-600 selection:text-white"
                    /> : <button ref={element => { if (element) sheetTabButtonRefs.current.set(name, element); else sheetTabButtonRefs.current.delete(name) }} type="button" role="tab" aria-selected={selectedSheet === name} onClick={() => selectSheet(name)} onDoubleClick={event => startRenamingSheet(name, event.currentTarget)} title={name} className="max-w-72 truncate px-4 py-1">{name}</button>}
                    <button type="button" onClick={event => openMenu({ type: 'sheet', name }, event.currentTarget)} aria-label={`Options for ${name}`} title={`Options for ${name}`} className="mr-1 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[#e3edda]"><ChevronDownIcon className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => scrollSheets(-1)} disabled={!canScrollSheetsLeft} aria-label="Scroll sheets left" title="Scroll sheets left" className="flex h-[32px] w-[32px] items-center justify-center rounded-lg text-slate-700 hover:bg-[#f3f7ee] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeftIcon className="h-[20px] w-[20px]" /></button>
                <button type="button" onClick={() => scrollSheets(1)} disabled={!canScrollSheetsRight} aria-label="Scroll sheets right" title="Scroll sheets right" className="flex h-[32px] w-[32px] items-center justify-center rounded-lg text-slate-700 hover:bg-[#f3f7ee] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRightIcon className="h-[20px] w-[20px]" /></button>
              </div>
            </div>
        </div>}
        {filterMenu && sheetFilter && <ExcelColumnFilterMenu key={`${selectedSheet}:${filterMenu.column}`} anchor={filterMenu.anchor}
          label={worksheetFilterLabel(sheetFilter, filterMenu.column, readFilterCell, XLSX.utils.encode_col(filterMenu.column))}
          values={worksheetFilterOptions(visibleRows, sheetFilter, filterMenu.column, readFilterCell)} selected={sheetFilter.values.get(filterMenu.column)}
          onApply={applyColumnFilter} onClose={closeFilterMenu} />}
        {isScheduleSetupOpen && !readOnly && <ExcelScheduleSetupPanel
          anchor={scheduleSetupAnchorRef.current}
          sheetName={selectedSheet}
          selectedAddress={XLSX.utils.encode_range(selectedRange)}
          headerAddress={scheduleSetup ? XLSX.utils.encode_range(scheduleSetup.header) : undefined}
          setup={scheduleSetup}
          headerError={selectedScheduleHeaderError}
          currentHeaderError={currentScheduleHeaderError}
          insertError={scheduleInsertError}
          records={selectedScheduleRecords}
          configuredRecords={configuredScheduleRecords}
          previewAppearance={schedulePreviewAppearance}
          hasSelectedYears={Boolean(scheduleSetup && [...scheduleSetup.years.keys()].some(row => row >= selectedRange.s.r && row <= selectedRange.e.r))}
          yearCounts={scheduleYearCounts}
          notice={scheduleNotice}
          onRegister={registerScheduleHeader}
          onInsert={insertScheduleTemplate}
          onAssignYear={assignSelectedScheduleYear}
          onClear={clearScheduleSetup}
          onClose={() => setIsScheduleSetupOpen(false)}
        />}
        {cellMenuPosition && <ExcelCellContextMenu position={cellMenuPosition} rowCount={selectedRange.e.r - selectedRange.s.r + 1} columnCount={selectedRange.e.c - selectedRange.s.c + 1} details={cellDetails} onAction={action => { void handleCellMenuAction(action) }} onSaveDetail={saveCellDetail} onClose={closeCellMenu} />}
        {headerMenu && <ExcelHeaderContextMenu axis={headerMenu.axis} label={headerMenuLabel} selectedCount={axisHeaderMenu?.indexes.length} selectedHiddenCount={selectedHiddenHeaderCount} position={headerMenu.position} hidden={headerIsHidden} hiddenCount={headerMenu.axis === 'all' ? hiddenRowIndexes.length + hiddenColumnIndexes.length : hiddenHeaderIndexes.length} onHide={() => changeHeaderVisibility(true)} onShow={() => changeHeaderVisibility(false)} onRemoveIndicator={headerIndicatorRanges.length ? removeHeaderIndicator : undefined} onClose={closeHeaderMenu} />}
        {cellAnnotationHover && hoveredCell?.c?.some(isVisibleAnnotation) && !cellMenuPosition && !headerMenu && !editingAddress && <ExcelCellAnnotations anchor={cellAnnotationHover.anchor} comments={hoveredCell.c} onMouseEnter={keepCellAnnotations} onMouseLeave={scheduleHideCellAnnotations} />}
        {validationTooltip}
        {sheetMenu && createPortal(<>
          {allSheetsMenuPosition && <div key="all-sheets" ref={allSheetsMenuRef} role="menu" aria-label="All sheets" className="fixed z-[300] max-h-[70vh] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_50px_rgba(15,23,42,0.3)]" style={allSheetsMenuPosition} onKeyDown={trapSheetMenuFocus}>
            {workbook?.SheetNames.map((name, index) => {
              const hidden = Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden)
              return <button key={name} type="button" role="menuitem" disabled={readOnly && hidden} onClick={() => hidden ? setSheetHidden(name, false) : selectSheet(name)} onContextMenu={event => {
                event.preventDefault()
                event.stopPropagation()
                if (sheetMenu.type === 'sheet' && sheetMenu.name === name && allSheetsMenuPosition) {
                  sheetMenuContextPointRef.current = null
                  setSheetMenuPosition(allSheetsMenuPosition)
                  setSheetMenu({ type: 'list' })
                  event.currentTarget.focus()
                  return
                }
                const rect = event.currentTarget.getBoundingClientRect()
                const listRect = allSheetsMenuRef.current?.getBoundingClientRect() || rect
                sheetListContextAnchorRef.current = event.currentTarget
                sheetMenuContextPointRef.current = { x: event.clientX || rect.left, y: event.clientY || rect.bottom, listLeft: listRect.left, listRight: listRect.right }
                setSheetMenuView('main')
                setSheetMenu({ type: 'sheet', name, listPosition: allSheetsMenuPosition })
              }} className={menuItemClass}>
                <span className="truncate">{name}</span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">{hidden ? 'Hidden' : name === selectedSheet ? '✓' : ''}</span>
              </button>
            })}
          </div>}
          {menuSheetName && <div key="sheet-options" ref={sheetMenuRef} role="menu" aria-label={`${menuSheetName} sheet options`} className="fixed z-[300] max-h-[70vh] w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={sheetMenuPosition} onKeyDown={trapSheetMenuFocus}>
            {menuSheetName && readOnly && <button type="button" role="menuitem" onClick={() => viewSheetComments(menuSheetName)} className={menuItemClass}>View comments</button>}
            {menuSheetName && !readOnly && sheetMenuView === 'main' && <>
              {allowSheetCreationAndRemoval && <>
                <button type="button" role="menuitem" onClick={() => deleteSheet(menuSheetName)} className={menuItemClass}>Delete</button>
                <button type="button" role="menuitem" onClick={() => duplicateSheet(menuSheetName)} className={menuItemClass}>Duplicate</button>
                <button type="button" role="menuitem" onClick={() => setSheetMenuView('copy')} className={menuItemClass}>Copy to <span aria-hidden>›</span></button>
              </>}
              <button type="button" role="menuitem" onClick={() => startRenamingSheet(menuSheetName)} className={menuItemClass}>Rename</button>
              <button type="button" role="menuitem" onClick={() => setSheetMenuView('color')} className={menuItemClass}>Change color <span aria-hidden>›</span></button>
              <button type="button" role="menuitem" onClick={() => setSheetHidden(menuSheetName, !menuSheetHidden)} disabled={!menuSheetHidden && sheetNames.length <= 1} className={menuItemClass}>{menuSheetHidden ? 'Show sheet' : 'Hide sheet'}</button>
              <button type="button" role="menuitem" onClick={() => viewSheetComments(menuSheetName)} className={menuItemClass}>View comments</button>
              <div className="my-1 border-t border-slate-200" />
              <button type="button" role="menuitem" onClick={() => moveSheet(menuSheetName, menuFromAllSheets ? -1 : 1)} disabled={menuSheetOrder.indexOf(menuSheetName) === (menuFromAllSheets ? 0 : menuSheetOrder.length - 1)} className={menuItemClass}>{menuFromAllSheets ? 'Move up' : 'Move right'}</button>
              <button type="button" role="menuitem" onClick={() => moveSheet(menuSheetName, menuFromAllSheets ? 1 : -1)} disabled={menuSheetOrder.indexOf(menuSheetName) === (menuFromAllSheets ? menuSheetOrder.length - 1 : 0)} className={menuItemClass}>{menuFromAllSheets ? 'Move down' : 'Move left'}</button>
            </>}
            {menuSheetName && !readOnly && allowSheetCreationAndRemoval && sheetMenuView === 'copy' && <>
              <button type="button" onClick={() => setSheetMenuView('main')} className={menuItemClass}>‹ Back</button>
              <button type="button" role="menuitem" onClick={() => duplicateSheet(menuSheetName)} className={menuItemClass}>This workbook</button>
            </>}
            {menuSheetName && !readOnly && sheetMenuView === 'color' && <>
              <button type="button" onClick={() => setSheetMenuView('main')} className={menuItemClass}>‹ Back</button>
              <div className="flex flex-wrap gap-2 p-2" aria-label="Sheet tab color">
                {['#62853e', '#f59e0b', '#0284c7', '#f43f5e', '#8b5cf6'].map(color => <button key={color} type="button" aria-label={`Set sheet color ${color}`} onClick={() => { setSheetColors(current => new Map(current).set(menuSheetName, color)); setSheetMenu(null) }} className="h-7 w-7 rounded-full border border-slate-300" style={{ backgroundColor: color }} />)}
              </div>
              <button type="button" role="menuitem" onClick={() => { setSheetColors(current => removeMapKey(current, menuSheetName)); setSheetMenu(null) }} className={menuItemClass}>Reset color</button>
            </>}
          </div>}
        </>, document.body)}
        <span role="status" className="sr-only">{editNotice}</span>
        <span role="alert" className="sr-only">{sheetNameError}</span>
        {pendingScheduleStatus && showPlotTool && !readOnly && <ExcelScheduleStatusConfirmModal
          status={pendingScheduleStatus.status}
          rowCount={pendingScheduleStatus.rows.length}
          validationIssues={pendingScheduleIssues}
          onClose={closeScheduleStatusConfirmation}
          onConfirm={confirmScheduleStatusChange}
        />}
        {isExportPickerOpen && allowImportExport && workbook && <ExcelImportSheetsModal
          mode="export"
          fileName={subtitle || 'Current workbook'}
          sheets={workbook.SheetNames.map((name, index) => ({ name, hidden: Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden) }))}
          busy={isExporting}
          error={exportError}
          onClose={() => { if (!isExporting) setIsExportPickerOpen(false) }}
          onImport={names => { void exportSheets(names) }}
        />}
      </div>
    </div>,
    document.body,
  )
}
