import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { CELL_UNDO_COOLDOWN_MS, CellTextHistory, sameEditCell, type CellEditLocation, type CellHistoryCheckpoint } from '../utils/cellTextHistory'
import { isColumnCellSelected, type ColumnCellSelection } from '../utils/columnCellSelection'
import { changeDepartmentCourseRows, COURSE_CLIPBOARD_TYPE, courseClipboardText, planCoursePaste, readCourseClipboard, type CourseClipboard } from '../utils/departmentCourseEditing'
import { createEmptyDepartmentCourseSheet, DEPARTMENT_COURSE_HEADERS, type DepartmentCourseSheet } from '../utils/departmentCourseImport'
import { applyScheduleCellValues, indexScheduleRows, type ScheduleCellValueChange } from '../utils/departmentScheduleEdits'
import { sameScheduleClipboardText } from '../utils/scheduleCellClipboard'
import type { WorkbookCellActions } from './DepartmentScheduleImportTableBody'

export function useCoursesWorkbook(initialSheets: DepartmentCourseSheet[] | undefined, tableRef: RefObject<HTMLTableElement | null>) {
  const [initial] = useState(() => {
    const sheets = initialSheets ?? [createEmptyDepartmentCourseSheet()]
    return { sheets, indexes: indexScheduleRows(sheets) }
  })
  const [sheets, setSheets] = useState(initial.sheets)
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [selection, setSelection] = useState<ColumnCellSelection | null>(null)
  const sheetsRef = useRef(initial.sheets)
  const indexesRef = useRef(initial.indexes)
  const selectionRef = useRef<ColumnCellSelection | null>(null)
  const dragRef = useRef<ColumnCellSelection | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const selectionFrameRef = useRef<number | null>(null)
  const historyRef = useRef(new CellTextHistory())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copiedRef = useRef<{ source: CourseClipboard; text: string } | null>(null)
  const sessionRef = useRef<{ cell: CellEditLocation; originals: ScheduleCellValueChange[]; checkpoint: CellHistoryCheckpoint; hasTyped: boolean } | null>(null)

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
  }, [])

  const changeSelection = useCallback((next: ColumnCellSelection | null) => {
    const previous = selectionRef.current
    if (previous === next || previous && next && previous.sheet === next.sheet && previous.column === next.column
      && previous.anchor === next.anchor && previous.end === next.end) return
    selectionRef.current = next
    setSelection(next)
  }, [])

  const flushTyping = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    historyRef.current.flushPending()
  }, [])

  const readValue = useCallback((cell: CellEditLocation) => {
    const index = indexesRef.current[cell.sheet]?.get(cell.row)
    return index === undefined ? '' : sheetsRef.current[cell.sheet]?.rows[index]?.values[cell.column] ?? ''
  }, [])

  const applyValues = useCallback((changes: readonly ScheduleCellValueChange[]) => {
    const current = sheetsRef.current
    const next = applyScheduleCellValues(current, indexesRef.current, changes)
    if (next === current) return
    sheetsRef.current = next
    setSheets(next)
  }, [])

  const updateSelection = useCallback(() => {
    selectionFrameRef.current = null
    const drag = dragRef.current
    const pointer = pointerRef.current
    pointerRef.current = null
    if (!drag || !pointer) return
    const row = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLTableRowElement>('tr[data-row-index]')
    if (!row || !tableRef.current?.contains(row)) return
    const end = Number(row.dataset.rowIndex)
    if (end === drag.end) return
    const next = { ...drag, end }
    dragRef.current = next
    changeSelection(next)
  }, [changeSelection, tableRef])

  const startSelection = useCallback((event: ReactPointerEvent<HTMLTableCellElement>, sheet: number, column: number, rowIndex: number) => {
    if (event.button !== 0) return
    event.preventDefault()
    const current = selectionRef.current
    const extend = event.shiftKey && current?.sheet === sheet && current.column === column
    const next = { sheet, column, anchor: extend ? current.anchor : rowIndex, end: rowIndex }
    dragRef.current = next
    if (extend || !isColumnCellSelected(current, sheet, column, rowIndex)) changeSelection(next)
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [changeSelection])

  const moveSelection = useCallback((event: ReactPointerEvent<HTMLTableCellElement>) => {
    if (!dragRef.current) return
    pointerRef.current = { x: event.clientX, y: event.clientY }
    if (selectionFrameRef.current === null) selectionFrameRef.current = requestAnimationFrame(updateSelection)
  }, [updateSelection])

  const endSelection = useCallback(() => {
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    updateSelection()
    dragRef.current = null
  }, [updateSelection])

  const focusCell = useCallback((sheet: number, column: number, rowIndex: number) => {
    if (!dragRef.current && !isColumnCellSelected(selectionRef.current, sheet, column, rowIndex)) {
      changeSelection({ sheet, column, anchor: rowIndex, end: rowIndex })
    }
  }, [changeSelection])

  const beginEditing = useCallback((cell: CellEditLocation) => {
    flushTyping()
    const originals = [{ cell, value: readValue(cell) }]
    const selected = selectionRef.current
    if (selected?.sheet === cell.sheet && selected.column === cell.column) {
      const rows = sheetsRef.current[cell.sheet].rows
      const first = Math.max(0, Math.min(selected.anchor, selected.end))
      const last = Math.min(rows.length - 1, Math.max(selected.anchor, selected.end))
      for (let index = first; index <= last; index++) {
        if (rows[index].rowNumber !== cell.row) originals.push({ cell: { ...cell, row: rows[index].rowNumber }, value: rows[index].values[cell.column] })
      }
    }
    sessionRef.current = { cell, originals, checkpoint: historyRef.current.checkpoint(), hasTyped: false }
  }, [flushTyping, readValue])

  const updateCell = useCallback((cell: CellEditLocation, after: string) => {
    const session = sessionRef.current
    const targets = session && sameEditCell(session.cell, cell) ? session.originals : [{ cell, value: readValue(cell) }]
    const changes = targets.map(target => ({ cell: target.cell, before: readValue(target.cell) }))
    if (changes.every(change => change.before === after)) return
    if (session) session.hasTyped = true
    historyRef.current.recordTyping(changes, after)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { historyRef.current.flushPending(); timerRef.current = null }, CELL_UNDO_COOLDOWN_MS)
    applyValues(changes.map(change => ({ cell: change.cell, value: after })))
  }, [applyValues, readValue])

  const finishEditing = useCallback((cell: CellEditLocation, save: boolean) => {
    const session = sessionRef.current
    if (!session || !sameEditCell(session.cell, cell)) return
    if (!save) {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      historyRef.current.restore(session.checkpoint)
      applyValues(session.originals)
    } else {
      flushTyping()
      const after = readValue(cell)
      const changes = session.originals.map(original => ({ cell: original.cell, before: readValue(original.cell) }))
      if (!session.hasTyped && changes.some(change => change.before !== after)) {
        historyRef.current.recordMany(changes, after)
        applyValues(changes.map(change => ({ cell: change.cell, value: after })))
      }
    }
    sessionRef.current = null
  }, [applyValues, flushTyping, readValue])

  const actions = useMemo<WorkbookCellActions>(() => ({ startSelection, moveSelection, endSelection, focusCell, beginEditing, updateCell, finishEditing }),
    [startSelection, moveSelection, endSelection, focusCell, beginEditing, updateCell, finishEditing])

  const replaceSheets = useCallback((next: DepartmentCourseSheet[]) => {
    flushTyping()
    historyRef.current.reset()
    sessionRef.current = null
    dragRef.current = null
    pointerRef.current = null
    if (selectionFrameRef.current !== null) cancelAnimationFrame(selectionFrameRef.current)
    selectionFrameRef.current = null
    sheetsRef.current = next
    indexesRef.current = indexScheduleRows(next)
    setSheets(next)
    setSelectedSheet(0)
    changeSelection(null)
  }, [changeSelection, flushTyping])

  const changeSheet = useCallback((index: number) => {
    flushTyping()
    endSelection()
    setSelectedSheet(index)
    changeSelection(null)
  }, [changeSelection, endSelection, flushTyping])

  const selectForContextMenu = useCallback((sheet: number, column: number, index: number) => {
    const current = selectionRef.current
    const inside = current?.sheet === sheet && index >= Math.min(current.anchor, current.end)
      && index <= Math.max(current.anchor, current.end) && (current.column === column || current.column === -1)
    if (!inside) changeSelection({ sheet, column, anchor: index, end: index })
    return inside && current?.column === -1 ? -1 : column
  }, [changeSelection])

  const copyToClipboard = useCallback((clipboard: Pick<DataTransfer, 'setData'>) => {
    const selected = selectionRef.current
    if (!selected) return
    const rows = sheetsRef.current[selected.sheet]?.rows.slice(Math.min(selected.anchor, selected.end), Math.max(selected.anchor, selected.end) + 1)
    if (!rows?.length) return
    const source: CourseClipboard = selected.column === -1 ? { version: 1, kind: 'rows', rows: rows.map(row => [...row.values]) }
      : { version: 1, kind: 'cells', column: selected.column, values: rows.map(row => row.values[selected.column]) }
    const text = courseClipboardText(source)
    clipboard.setData('text/plain', text)
    try { clipboard.setData(COURSE_CLIPBOARD_TYPE, JSON.stringify(source)) } catch { /* Retain the local plain-text fallback. */ }
    copiedRef.current = { source, text }
  }, [])

  const readSource = useCallback((clipboard: Pick<DataTransfer, 'getData'>) => {
    const remembered = copiedRef.current
    return readCourseClipboard(clipboard.getData(COURSE_CLIPBOARD_TYPE))
      ?? (remembered && sameScheduleClipboardText(remembered.text, clipboard.getData('text/plain')) ? remembered.source : null)
  }, [])

  const canPasteText = useCallback((text: string) => {
    const selected = selectionRef.current
    const copied = copiedRef.current
    if (!selected || !copied || !sameScheduleClipboardText(copied.text, text)) return false
    try { return planCoursePaste(copied.source, selected, sheetsRef.current[selected.sheet]).length > 0 } catch { return false }
  }, [])

  const pasteFromClipboard = useCallback((clipboard: Pick<DataTransfer, 'getData'>) => {
    const selected = selectionRef.current
    const source = readSource(clipboard)
    if (!selected || !source) return
    try {
      const changes = planCoursePaste(source, selected, sheetsRef.current[selected.sheet])
      flushTyping()
      historyRef.current.recordChanges(changes.map(change => ({ cell: change.cell, before: readValue(change.cell), after: change.value })))
      applyValues(changes)
      const first = Math.min(selected.anchor, selected.end)
      const count = source.kind === 'rows' ? changes.length / DEPARTMENT_COURSE_HEADERS.length : changes.length
      changeSelection({ ...selected, anchor: first, end: first + count - 1 })
    } catch { /* Incompatible pastes do not add a message above the table. */ }
  }, [applyValues, changeSelection, flushTyping, readSource, readValue])

  const focusSelection = useCallback((selected: ColumnCellSelection, rowNumber: number, fallbackColumn = 0) => {
    requestAnimationFrame(() => {
      const selector = selected.column === -1 ? `th[data-row-counter][data-source-row="${rowNumber}"]`
        : `td[data-edit-cell="${selected.sheet}:${rowNumber}:${selected.column < 0 ? fallbackColumn : selected.column}"]`
      tableRef.current?.querySelector<HTMLTableCellElement>(selector)?.focus({ preventScroll: true })
    })
  }, [tableRef])

  const rowAction = useCallback((action: 'add' | 'delete') => {
    const selected = selectionRef.current
    if (!selected) return
    flushTyping()
    const before = sheetsRef.current[selected.sheet]
    const result = changeDepartmentCourseRows(before, selected, action)
    historyRef.current.recordStructure({ sheet: selected.sheet, row: result.sheet.rows[result.rowIndex].rowNumber, column: Math.max(0, selected.column) }, before, result.sheet)
    const next = [...sheetsRef.current]
    next[selected.sheet] = result.sheet
    sheetsRef.current = next
    indexesRef.current = indexScheduleRows(next)
    setSheets(next)
    const nextSelection = { ...selected, anchor: result.rowIndex, end: result.rowIndex }
    changeSelection(nextSelection)
    focusSelection(nextSelection, result.sheet.rows[result.rowIndex].rowNumber)
  }, [changeSelection, flushTyping, focusSelection])

  const changeHistory = useCallback((redo: boolean) => {
    flushTyping()
    const session = sessionRef.current
    const edit = redo ? historyRef.current.redo(session?.cell) : historyRef.current.undo(session?.checkpoint.past.length ?? 0, session?.cell)
    if (!edit) return
    let focusRow = edit.cell.row
    if (edit.structure) {
      const restored = redo ? edit.structure.after : edit.structure.before
      const next = [...sheetsRef.current]
      next[edit.cell.sheet] = restored
      sheetsRef.current = next
      indexesRef.current = indexScheduleRows(next)
      setSheets(next)
      const current = selectionRef.current
      const index = Math.min(current?.anchor ?? 0, restored.rows.length - 1)
      focusRow = restored.rows[index].rowNumber
      changeSelection({ sheet: edit.cell.sheet, column: current?.column ?? edit.cell.column, anchor: index, end: index })
    } else applyValues([edit, ...(edit.related ?? [])].map(change => ({ cell: change.cell, value: redo ? change.after : change.before })))
    if (!session) setSelectedSheet(edit.cell.sheet)
    requestAnimationFrame(() => {
      const selected = selectionRef.current
      const selector = selected?.column === -1 && selected.sheet === edit.cell.sheet ? `th[data-row-counter][data-source-row="${focusRow}"]`
        : `td[data-edit-cell="${edit.cell.sheet}:${focusRow}:${edit.cell.column}"]`
      const cell = tableRef.current?.querySelector<HTMLTableCellElement>(selector)
      const input = cell?.querySelector('input')
      if (input) input.setSelectionRange(redo ? edit.afterCaret : edit.beforeCaret, redo ? edit.afterCaret : edit.beforeCaret)
      else cell?.focus({ preventScroll: true })
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }, [applyValues, changeSelection, flushTyping, tableRef])

  const finishCurrentEditing = () => {
    if (sessionRef.current) finishEditing(sessionRef.current.cell, true)
    flushTyping()
    return sheetsRef.current
  }

  return { sheets, selectedSheet, selection, selectionRef, actions, replaceSheets, changeSheet, finishCurrentEditing, selectForContextMenu, copyToClipboard,
    pasteFromClipboard, canPasteText, rowAction, changeHistory, rememberedText: () => copiedRef.current?.text ?? '' }
}
