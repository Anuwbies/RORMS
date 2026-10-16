import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { CellEditLocation } from '../utils/cellTextHistory'
import type { ColumnCellSelection } from '../utils/columnCellSelection'
import type { DepartmentScheduleImportRow, DepartmentScheduleYearSection } from '../utils/departmentScheduleImport'
import { insertScheduleCellText } from '../utils/scheduleCellClipboard'
import type { ScheduleDirectory } from '../utils/excelScheduleRows'
import { facultyFragment, filterFacultyNames } from '../utils/excelFacultySuggestions'
import { filterRoomNames } from '../utils/excelRoomSuggestions'
import type { ParallelRoomGroupRecommendation } from '../utils/scheduleRoomRecommendations'
import { ExcelFacultySuggestions } from './ExcelFacultySuggestions'
import { completeScheduleResourceText, insertScheduleChoice, SCHEDULE_TIME_CHOICES, SCHEDULE_DAY_CHOICES } from '../utils/scheduleResourceCompletion'
import { formatScheduleTimeInput, hasExtraScheduleValues, isScheduleCellCharacterAllowed } from '../utils/departmentScheduleEdits'
import { rankScheduleCourses, resolveScheduleCourse, scheduleCourseYear, type DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'
import { facultyScheduleRowKey, isScheduleColumnEditable, scheduleEditableColleges, SCHEDULE_COLLEGE_CHOICES, scheduleValidationTone, splitScheduleResources } from '../utils/ScheduleValidation'

interface ScheduleSuggestionProps {
  suggestionDirectory?: ScheduleDirectory | null
  suggestionError?: string
  courseSuggestions?: readonly DepartmentCourseSuggestion[] | null
  courseSuggestionError?: string
  suggestionYearLevel?: number
}

export interface WorkbookCellActions {
  startSelection: (event: ReactPointerEvent<HTMLTableCellElement>, sheet: number, column: number, rowIndex: number) => void
  moveSelection: (event: ReactPointerEvent<HTMLTableCellElement>) => void
  endSelection: () => void
  focusCell: (sheet: number, column: number, rowIndex: number) => void
  beginEditing: (cell: CellEditLocation) => void
  updateCell: (cell: CellEditLocation, value: string) => void
  finishEditing: (cell: CellEditLocation, save: boolean) => void
  chooseCourse?: (cell: CellEditLocation, course: Pick<DepartmentCourseSuggestion, 'code' | 'title'>) => void
  recommendRooms?: (cell: CellEditLocation, entryIndex: number) => readonly string[]
  recommendParallelRoomGroups?: (cell: CellEditLocation, entryIndex: number) => readonly ParallelRoomGroupRecommendation[]
  chooseParallelRoomGroup?: (cell: CellEditLocation, entryIndex: number, label: string) => void
  recommendMeetingSlots?: (cell: CellEditLocation) => readonly string[] | null
}

export interface ScheduleCellActions extends WorkbookCellActions {
  renameYear: (sheet: number, start: number, label: string) => void
}

interface EditableScheduleCellProps extends ScheduleSuggestionProps {
  value: string
  editable?: boolean
  label: string
  sheetIndex: number
  rowNumber: number
  rowIndex: number
  column: number
  selected: boolean
  rowSelected: boolean
  selectionTop: boolean
  selectionBottom: boolean
  actions: WorkbookCellActions
  validationMessage?: string
}

export const EditableScheduleCell = memo(function EditableScheduleCell({ value, editable = true, label, sheetIndex, rowNumber, rowIndex, column, selected, rowSelected, selectionTop, selectionBottom, actions, validationMessage, suggestionDirectory, suggestionError, courseSuggestions, courseSuggestionError, suggestionYearLevel = 0 }: EditableScheduleCellProps) {
  const cellRef = useRef<HTMLTableCellElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef(false)
  const selectAllRef = useRef(true)
  const [editing, setEditing] = useState(false)
  const suggestionsId = useId()
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [caret, setCaret] = useState({ start: 0, end: 0 })
  const isCollege = column === 0
  const isRoom = column === 19 || column === 20
  const isCourse = column === 2 || column === 3
  const isTime = column === 15 || column === 16, isDay = column === 17 || column === 18
  const isMeetingSlot = isTime || isDay
  const hasSuggestions = isCollege || isCourse || isRoom || isMeetingSlot || column === 13 || column === 14
  const fragment = isCourse ? { start: 0, end: value.length, query: value.trim() } : facultyFragment(value, caret.start, caret.end)
  const roomEntryIndex = isRoom ? splitScheduleResources(value.slice(fragment.start, fragment.end)).length > 1
    ? -1 : splitScheduleResources(value.slice(0, fragment.start)).length - 1 : 0
  const recommendedRooms = useMemo(() => editing && isRoom
    ? actions.recommendRooms?.({ sheet: sheetIndex, row: rowNumber, column }, roomEntryIndex) ?? [] : [],
  [editing, isRoom, actions, sheetIndex, rowNumber, column, roomEntryIndex, value, validationMessage])
  const parallelRoomGroups = useMemo(() => editing && isRoom
    ? actions.recommendParallelRoomGroups?.({ sheet: sheetIndex, row: rowNumber, column }, roomEntryIndex) ?? [] : [],
  [editing, isRoom, actions, sheetIndex, rowNumber, column, roomEntryIndex, value, validationMessage])
  const recommendedGroupNames = parallelRoomGroups.map(group => group.label)
  const recommendedSlots = useMemo(() => editing && isMeetingSlot
    ? actions.recommendMeetingSlots?.({ sheet: sheetIndex, row: rowNumber, column }) ?? null : null,
  [editing, isMeetingSlot, actions, sheetIndex, rowNumber, column, value, validationMessage])
  const seenCourseValues = new Set<string>()
  const courseMatches = editing && isCourse ? rankScheduleCourses(courseSuggestions ?? [], fragment.query, suggestionYearLevel)
    .filter(course => {
      if (!course.code || !course.title) return false
      const key = (column === 2 ? course.code : course.title).toUpperCase()
      if (seenCourseValues.has(key)) return false
      seenCourseValues.add(key)
      return true
    }) : []
  const matches = !editing || !hasSuggestions ? [] : isCollege ? [...SCHEDULE_COLLEGE_CHOICES] : isCourse
    ? courseMatches.map(course => column === 2 ? course.code : course.title) : isRoom
    ? [...new Set([...recommendedGroupNames, ...recommendedRooms, ...filterRoomNames(suggestionDirectory?.rooms ?? [], fragment.query), 'TBA'])]
    : isMeetingSlot ? [...new Set([...(recommendedSlots ?? []), ...(isTime ? SCHEDULE_TIME_CHOICES : SCHEDULE_DAY_CHOICES), 'TBA'])]
    : [...new Set([...filterFacultyNames(suggestionDirectory?.faculty.map(member => member.fullName) ?? [], fragment.query), 'TBA'])]
  const suggestionsVisible = editing && hasSuggestions && suggestionsOpen
  const cell = { sheet: sheetIndex, row: rowNumber, column }

  const beginEditing = (initialValue = value, selectAll = true) => {
    if (!editable) return
    activeRef.current = true
    selectAllRef.current = selectAll
    actions.beginEditing(cell)
    if (initialValue !== value) actions.updateCell(cell, initialValue)
    setEditing(true)
    setSuggestionsOpen(hasSuggestions)
    setActiveIndex(-1)
  }

  const finishEditing = (save: boolean, restoreFocus = false, chosenValue?: string, chosenCourse?: DepartmentCourseSuggestion) => {
    if (!activeRef.current) return
    activeRef.current = false
    if (save) {
      const text = chosenValue ?? inputRef.current?.value ?? value
      const course = isCourse ? chosenCourse ?? resolveScheduleCourse(courseSuggestions ?? [], text, column, suggestionYearLevel) : undefined
      if (course?.code && course.title && actions.chooseCourse) actions.chooseCourse(cell, course)
      else {
        const completed = completeScheduleResourceText(text, column, suggestionDirectory)
        if (completed !== value) actions.updateCell(cell, completed)
      }
    }
    actions.finishEditing(cell, save)
    setEditing(false)
    setSuggestionsOpen(false)
    if (restoreFocus) cellRef.current?.focus()
  }

  const chooseSuggestion = (name: string) => {
    if (isRoom && parallelRoomGroups.some(group => group.label === name)) {
      finishEditing(false, true)
      actions.chooseParallelRoomGroup?.(cell, roomEntryIndex, name)
      return
    }
    if (isCollege) {
      finishEditing(true, true, name)
      return
    }
    if (isMeetingSlot || name === 'TBA' && !isCourse) {
      const input = inputRef.current
      const chosen = name.includes('/') ? name
        : insertScheduleChoice(value, name, input?.selectionStart ?? caret.start, input?.selectionEnd ?? caret.end, column)
      finishEditing(true, true, chosen)
      return
    }
    if (isCourse) {
      const course = courseMatches[matches.indexOf(name)]
      if (course) finishEditing(true, true, column === 2 ? course.code : course.title, course)
      return
    }
    const input = inputRef.current
    const part = facultyFragment(value, input?.selectionStart ?? caret.start, input?.selectionEnd ?? caret.end)
    finishEditing(true, true, value.slice(0, part.start) + name + value.slice(part.end))
  }

  return (
    <td
      ref={cellRef}
      title={!editable ? 'Choose a compatible College value to edit this Lec/Lab cell.' : validationMessage ? undefined : value}
      aria-label={`${validationMessage ? `${label}. ${validationMessage}` : label}${editable ? '' : '. Read-only for this College value.'}`}
      aria-readonly={!editable || undefined}
      aria-invalid={validationMessage ? true : undefined}
      data-edit-cell={`${sheetIndex}:${rowNumber}:${column}`}
      data-row-index={rowIndex}
      aria-selected={selected}
      tabIndex={editing ? -1 : 0}
      className={`relative max-w-0 border-r border-b border-slate-300 px-3 py-2 ${selected
        ? `bg-[#62853e]/15 outline-none after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-bottom-px ${rowSelected ? 'after:-right-px after:z-[1] last:after:right-0 last:after:border-r-2' : 'after:border-x-2'} after:border-[var(--brand-color)] ${selectionTop ? 'after:border-t-2' : ''} ${selectionBottom ? 'after:border-b-2' : ''}`
        : 'focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--brand-color)] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-[var(--brand-color)]'}`}
      onPointerDown={event => { if (!editing) actions.startSelection(event, sheetIndex, column, rowIndex) }}
      onPointerMove={actions.moveSelection}
      onPointerUp={event => {
        actions.endSelection()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={actions.endSelection}
      onLostPointerCapture={actions.endSelection}
      onFocus={event => { if (event.target === event.currentTarget) actions.focusCell(sheetIndex, column, rowIndex) }}
      onDoubleClick={() => { if (!editing) beginEditing() }}
      onKeyDown={event => {
        if (editing) return
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !isScheduleCellCharacterAllowed(column, event.key)) {
          event.preventDefault()
          return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          beginEditing('', false)
        } else if (event.key === 'Enter' || event.key === 'F2') {
          event.preventDefault()
          beginEditing()
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          beginEditing(event.key, false)
        }
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          aria-label={label}
          role={hasSuggestions ? 'combobox' : undefined}
          aria-autocomplete={hasSuggestions ? 'list' : undefined}
          aria-expanded={hasSuggestions ? suggestionsVisible : undefined}
          aria-controls={suggestionsVisible ? suggestionsId : undefined}
          aria-activedescendant={suggestionsVisible && activeIndex >= 0 && activeIndex < matches.length ? `${suggestionsId}-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          className="block w-full min-w-0 border-0 bg-transparent p-0 text-center text-sm text-inherit outline-none"
          onFocus={event => {
            if (selectAllRef.current) event.currentTarget.select()
            else event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)
            setCaret({ start: event.currentTarget.selectionStart ?? 0, end: event.currentTarget.selectionEnd ?? 0 })
          }}
          onChange={event => {
            const input = event.currentTarget
            const next = column === 15 || column === 16 ? formatScheduleTimeInput(input.value, input.selectionStart ?? input.value.length, value) : null
            actions.updateCell(cell, next?.value ?? input.value)
            setCaret({ start: next?.caret ?? input.selectionStart ?? 0, end: next?.caret ?? input.selectionEnd ?? 0 })
            if (next && next.value !== input.value) requestAnimationFrame(() => {
              if (inputRef.current === input) input.setSelectionRange(next.caret, next.caret)
            })
            setSuggestionsOpen(hasSuggestions)
            setActiveIndex(-1)
          }}
          onSelect={event => setCaret({ start: event.currentTarget.selectionStart ?? 0, end: event.currentTarget.selectionEnd ?? 0 })}
          onCompositionStart={() => setSuggestionsOpen(false)}
          onCompositionEnd={() => setSuggestionsOpen(hasSuggestions)}
          onBlur={() => finishEditing(true)}
          onPaste={event => {
            if (!isCourse) return
            const pasted = event.clipboardData.getData('text/plain')
            if (/[\t\r\n]/.test(pasted)) return
            event.preventDefault()
            event.stopPropagation()
            const input = event.currentTarget
            const start = input.selectionStart ?? 0, end = input.selectionEnd ?? start
            finishEditing(true, true, input.value.slice(0, start) + pasted + input.value.slice(end))
          }}
          onKeyDown={event => {
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
              const input = event.currentTarget
              const start = input.selectionStart ?? 0, end = input.selectionEnd ?? start
              if (hasExtraScheduleValues(column, input.value.slice(0, start) + event.key + input.value.slice(end))) {
                event.preventDefault()
                event.stopPropagation()
                return
              }
            }
            if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !isScheduleCellCharacterAllowed(column, event.key)) {
              event.preventDefault()
              event.stopPropagation()
              return
            }
            if (event.nativeEvent.isComposing) return
            if (suggestionsVisible && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              event.stopPropagation()
              if (matches.length) setActiveIndex(current => current < 0
                ? event.key === 'ArrowDown' ? 0 : matches.length - 1
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length)
              return
            }
            if (suggestionsVisible && (event.key === 'Enter' || event.key === 'Tab') && activeIndex >= 0 && matches[activeIndex]) {
              event.preventDefault()
              event.stopPropagation()
              chooseSuggestion(matches[activeIndex])
              return
            }
            if (suggestionsVisible && event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setSuggestionsOpen(false)
              return
            }
            if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.stopPropagation()
              const input = event.currentTarget
              const inserted = insertScheduleCellText(input.value, ' ', input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length)
              actions.updateCell(cell, inserted.value)
              requestAnimationFrame(() => input.setSelectionRange(inserted.caret, inserted.caret))
              return
            }
            if (event.key !== 'Enter' && event.key !== 'Escape') return
            event.preventDefault()
            event.stopPropagation()
            finishEditing(event.key === 'Enter', true)
          }}
        />
      ) : <span className="block overflow-hidden text-ellipsis whitespace-pre">{value.replace(/[\r\n]+/g, ' ')}</span>}
      {suggestionsVisible && <ExcelFacultySuggestions
        id={suggestionsId}
        anchor={cellRef}
        names={matches}
        recommendedNames={isRoom ? [...recommendedGroupNames, ...recommendedRooms] : isMeetingSlot ? recommendedSlots ?? undefined : undefined}
        loading={isCollege || isMeetingSlot ? false : isCourse ? !courseSuggestions && !courseSuggestionError : !suggestionDirectory && !suggestionError}
        error={isCollege || isMeetingSlot ? undefined : isCourse ? courseSuggestionError : suggestionError}
        activeIndex={activeIndex}
        onSelect={chooseSuggestion}
        label={isCollege ? 'College options' : isCourse ? 'Department courses, same year level first' : isRoom ? 'System rooms' : isTime ? 'Time options' : isDay ? 'Day options' : 'Department instructors and program heads'}
        noun={isCollege ? 'College options' : isCourse ? 'department courses' : isRoom ? 'rooms' : isTime ? 'time recommendations' : isDay ? 'day recommendations' : 'instructors or program heads'}
        emptyMessage={isMeetingSlot ? 'No recommendations available.' : undefined}
        statusMessage={isMeetingSlot && recommendedSlots !== null && recommendedSlots.length === 0 ? 'No recommendations available.' : undefined}
        matchAnchorWidth
        expandToFit
        portalTarget={cellRef.current?.closest('dialog')}
      />}
    </td>
  )
})

interface ScheduleRowProps extends ScheduleSuggestionProps {
  row: DepartmentScheduleImportRow
  editableCollege: string
  rowIndex: number
  yearEndsTable: boolean
  yearLabel?: string
  yearSourceLabel?: string
  yearRowSpan: number
  displayRowNumber: number
  renameRequest?: number
  sheetIndex: number
  selectedColumn: number | null
  selectionTop: boolean
  selectionBottom: boolean
  columnLabels: readonly string[]
  actions: ScheduleCellActions
  validationMessage?: string
  status: string
}

const EditableYearHeader = memo(function EditableYearHeader({ initialLabel, rowSpan, endsTable, renameRequest, onRename, collapsed = false }: { initialLabel: string; sourceLabel?: string; rowSpan: number; endsTable: boolean; renameRequest?: number; onRename: (label: string) => void; collapsed?: boolean }) {
  const headerRef = useRef<HTMLTableCellElement>(null)
  const activeRef = useRef(false)
  const label = initialLabel
  const [draft, setDraft] = useState(initialLabel)
  const [editing, setEditing] = useState(false)
  const [editorWidth, setEditorWidth] = useState(0)

  const beginEditing = () => {
    activeRef.current = true
    setEditorWidth(headerRef.current?.querySelector<HTMLElement>('[data-year-label-text]')?.getBoundingClientRect().height ?? headerRef.current?.clientHeight ?? 0)
    setDraft(label)
    setEditing(true)
  }

  useEffect(() => {
    if (renameRequest !== undefined) beginEditing()
  }, [renameRequest])

  const content = editing ? (
        <input
          autoFocus
          aria-label="Edit year label"
          value={draft}
          className={`${collapsed ? 'block' : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90'} h-6 border-0 bg-transparent p-0 text-center text-sm text-inherit outline-none`}
          style={{ width: collapsed ? '100%' : editorWidth }}
          onFocus={event => event.currentTarget.select()}
          onChange={event => setDraft(event.target.value)}
          onBlur={() => {
            if (!activeRef.current) return
            activeRef.current = false
            onRename(draft)
            setEditing(false)
          }}
          onKeyDown={event => {
            event.stopPropagation()
            if (event.key !== 'Enter' && event.key !== 'Escape') return
            event.preventDefault()
            activeRef.current = false
            onRename(event.key === 'Enter' ? draft : label)
            setEditing(false)
            headerRef.current?.focus({ preventScroll: true })
          }}
        />
      ) : collapsed ? <span className="block truncate">{label}</span>
        : <span data-year-label-text className="block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{label}</span>

  return (
    <th
      ref={headerRef}
      scope="rowgroup"
      data-year-header
      rowSpan={collapsed ? 1 : rowSpan}
      colSpan={collapsed ? 24 : undefined}
      title={label}
      tabIndex={editing ? -1 : 0}
      aria-label={`Year label: ${label}`}
      aria-expanded={!collapsed}
      className={collapsed
        ? 'group border-0 bg-white p-0 text-left! font-semibold text-[#41572a] outline-none'
        : `sticky left-0 z-[5] border-r ${endsTable ? '' : 'border-b'} border-black bg-[#e3edda] p-0 font-semibold text-[#41572a] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-color)]`}
      onDoubleClick={() => { if (!editing) beginEditing() }}
      onKeyDown={event => {
        if (!editing && (event.key === 'Enter' || event.key === 'F2')) {
          event.preventDefault()
          beginEditing()
        }
      }}
    >
      {collapsed ? <div className="sticky left-0 inline-block w-[var(--schedule-pinned-width,6rem)] border border-black bg-[#e3edda] px-3 py-2 group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-[var(--brand-color)]">{content}</div> : (
        <span data-year-label-viewport className="sticky flex items-center justify-center py-2" style={editing ? { minHeight: editorWidth + 16 } : undefined}>{content}</span>
      )}
    </th>
  )
})

const CollapsedYearRow = memo(function CollapsedYearRow({ label, start, sheetIndex, renameRequest, actions }: { label: string; start: number; sheetIndex: number; renameRequest?: number; actions: ScheduleCellActions }) {
  const renameYear = useCallback((value: string) => actions.renameYear(sheetIndex, start, value), [actions, sheetIndex, start])
  return <tr data-row-index={start}><EditableYearHeader initialLabel={label} rowSpan={1} endsTable collapsed renameRequest={renameRequest} onRename={renameYear} /></tr>
})

const ScheduleRow = memo(function ScheduleRow({ row, editableCollege, rowIndex, yearEndsTable, yearLabel, yearSourceLabel, yearRowSpan, displayRowNumber, renameRequest, sheetIndex, selectedColumn, selectionTop, selectionBottom, columnLabels, actions, validationMessage, status, suggestionDirectory, suggestionError, courseSuggestions, courseSuggestionError, suggestionYearLevel }: ScheduleRowProps) {
  const renameYear = useCallback((label: string) => actions.renameYear(sheetIndex, rowIndex, label), [actions, sheetIndex, rowIndex])
  const tone = scheduleValidationTone(validationMessage?.split('\n') ?? [])
  const rowColor = tone === 'blue' ? 'bg-blue-100 text-blue-900' : tone === 'purple' ? 'bg-purple-100 text-purple-900' : 'bg-rose-100 text-rose-900'
  const counterText = tone === 'blue' ? 'text-blue-900' : tone === 'purple' ? 'text-purple-900' : 'text-rose-900'
  const counterBackground = tone === 'blue' ? 'bg-blue-100' : tone === 'purple' ? 'bg-purple-100' : 'bg-rose-100'
  return (
    <tr data-row-index={rowIndex} aria-invalid={validationMessage ? true : undefined} className={`${validationMessage ? rowColor : rowIndex % 2 === 1 ? 'bg-slate-50' : ''} ${rowIndex > 0 && yearLabel !== undefined ? '[&>th]:border-t [&>td]:border-t' : ''}`}>
      {yearLabel !== undefined && yearLabel !== '' && (
        <EditableYearHeader initialLabel={yearLabel} sourceLabel={yearSourceLabel} rowSpan={yearRowSpan} endsTable={yearEndsTable} renameRequest={renameRequest} onRename={renameYear} />
      )}
      {yearLabel === '' && <th aria-label="Rows without a year heading" rowSpan={yearRowSpan} className="sticky left-0 z-[5] border-r border-black bg-white p-0" />}
      <th
        scope="row"
        tabIndex={0}
        data-row-counter
        data-source-row={row.rowNumber}
        aria-label={`Select row ${displayRowNumber}${validationMessage ? `. ${validationMessage}` : ''}`}
        aria-invalid={validationMessage ? true : undefined}
        aria-selected={selectedColumn === -1}
        className={`sticky left-[var(--schedule-year-width,3rem)] z-[4] whitespace-nowrap border-r border-b border-black px-3 py-2 font-normal ${validationMessage ? counterText : 'text-slate-500'} ${selectedColumn === -1
          ? `bg-[#e7eddf] outline-none after:pointer-events-none after:absolute after:left-0 after:-right-px after:top-0 after:-bottom-px after:z-[1] after:border-l-2 after:border-[var(--brand-color)] ${selectionTop ? 'after:border-t-2' : ''} ${selectionBottom ? 'after:border-b-2' : ''}`
          : `${validationMessage ? counterBackground : rowIndex % 2 === 1 ? 'bg-slate-50' : 'bg-white'} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-color)]`}`}
        onPointerDown={event => actions.startSelection(event, sheetIndex, -1, rowIndex)}
        onPointerMove={actions.moveSelection}
        onPointerUp={event => {
          actions.endSelection()
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={actions.endSelection}
        onLostPointerCapture={actions.endSelection}
        onFocus={() => actions.focusCell(sheetIndex, -1, rowIndex)}
      >{displayRowNumber}</th>
      {row.values.map((value, column) => (
        <EditableScheduleCell
          key={column}
          value={value}
          editable={isScheduleColumnEditable(editableCollege, column)}
          label={`${columnLabels[column]}, row ${rowIndex + 1}`}
          sheetIndex={sheetIndex}
          rowNumber={row.rowNumber}
          rowIndex={rowIndex}
          column={column}
          selected={selectedColumn === column || selectedColumn === -1}
          rowSelected={selectedColumn === -1}
          selectionTop={(selectedColumn === column || selectedColumn === -1) && selectionTop}
          selectionBottom={(selectedColumn === column || selectedColumn === -1) && selectionBottom}
          actions={actions}
          validationMessage={validationMessage}
          suggestionDirectory={suggestionDirectory}
          suggestionError={suggestionError}
          courseSuggestions={courseSuggestions}
          courseSuggestionError={courseSuggestionError}
          suggestionYearLevel={suggestionYearLevel}
        />
      ))}
      <td
        data-edit-cell={`${sheetIndex}:${row.rowNumber}:21`}
        data-row-index={rowIndex}
        tabIndex={0}
        aria-label={`${status ? `Schedule status: ${status}` : 'No schedule status'}${validationMessage ? `. ${validationMessage}` : ''}`}
        aria-readonly="true"
        aria-selected={selectedColumn === 21 || selectedColumn === -1}
        className={`relative max-w-0 border-r border-b border-slate-300 px-3 py-2 ${selectedColumn === 21 || selectedColumn === -1
          ? `bg-[#62853e]/15 outline-none after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:-bottom-px ${selectedColumn === -1 ? 'after:-right-px after:z-[1] last:after:right-0 last:after:border-r-2' : 'after:border-x-2'} after:border-[var(--brand-color)] ${selectionTop ? 'after:border-t-2' : ''} ${selectionBottom ? 'after:border-b-2' : ''}`
          : 'focus:outline-2 focus:-outline-offset-2 focus:outline-[var(--brand-color)]'}`}
        onPointerDown={event => actions.startSelection(event, sheetIndex, 21, rowIndex)}
        onPointerMove={actions.moveSelection}
        onPointerUp={event => {
          actions.endSelection()
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={actions.endSelection}
        onLostPointerCapture={actions.endSelection}
        onFocus={() => actions.focusCell(sheetIndex, 21, rowIndex)}
      ><span className="block overflow-hidden text-ellipsis whitespace-pre">{status}</span></td>
    </tr>
  )
})

interface DepartmentScheduleImportTableBodyProps extends ScheduleSuggestionProps {
  rows: DepartmentScheduleImportRow[]
  yearSections?: readonly DepartmentScheduleYearSection[]
  yearRenameRequest?: { sheet: number; start: number; id: number }
  sheetIndex: number
  selection: ColumnCellSelection | null
  columnLabels: readonly string[]
  actions: ScheduleCellActions
  hasSheet: boolean
  rowIssues?: ReadonlyMap<number, readonly string[]>
  rowStatuses?: ReadonlyMap<string, string>
  statusesReady: boolean
  sheetName: string
}

export const DepartmentScheduleImportTableBody = memo(function DepartmentScheduleImportTableBody({ rows, yearSections, yearRenameRequest, sheetIndex, selection, columnLabels, actions, hasSheet, rowIssues, rowStatuses, statusesReady, sheetName, suggestionDirectory, suggestionError, courseSuggestions, courseSuggestionError }: DepartmentScheduleImportTableBodyProps) {
  const editableColleges = useMemo(() => scheduleEditableColleges(rows, yearSections), [rows, yearSections])
  const first = selection?.sheet === sheetIndex ? Math.min(selection.anchor, selection.end) : -1
  const last = selection?.sheet === sheetIndex ? Math.max(selection.anchor, selection.end) : -1
  let sectionIndex = 0
  return (
    <tbody>
      {rows.map((row, index) => {
        while (yearSections?.[sectionIndex + 1] && yearSections[sectionIndex + 1].start <= index) sectionIndex++
        const section = yearSections?.[sectionIndex] ?? { label: '', start: 0, count: rows.length }
        if (section.hidden && index !== section.start) return null
        const selected = index >= first && index <= last
        return <Fragment key={row.rowNumber}>
          {index > 0 && index === section.start && (
            <tr aria-hidden="true"><td colSpan={24} className="h-[calc((1lh_+_1rem_+_1px)/2)] border-0 bg-white p-0" /></tr>
          )}
          {section.hidden ? <CollapsedYearRow
            label={section.label}
            start={section.start}
            sheetIndex={sheetIndex}
            renameRequest={yearRenameRequest?.sheet === sheetIndex && yearRenameRequest.start === index ? yearRenameRequest.id : undefined}
            actions={actions}
          /> : <ScheduleRow
            row={row}
            editableCollege={editableColleges[index]}
            rowIndex={index}
            yearEndsTable={section.start + section.count >= rows.length}
            yearLabel={index === section.start ? section.label : undefined}
            yearSourceLabel={section.sourceLabel}
            yearRowSpan={section.count}
            displayRowNumber={index - section.start + 1}
            renameRequest={yearRenameRequest?.sheet === sheetIndex && yearRenameRequest.start === index ? yearRenameRequest.id : undefined}
            sheetIndex={sheetIndex}
            selectedColumn={selected ? selection!.column : null}
            selectionTop={selected && index === first}
            selectionBottom={selected && index === last}
            columnLabels={columnLabels}
            actions={actions}
            validationMessage={rowIssues?.get(row.rowNumber)?.join('\n') || undefined}
            status={rowStatuses?.get(facultyScheduleRowKey(sheetName, row.rowNumber)) ?? (statusesReady && row.values.slice(1).some(value => value.trim()) ? 'Draft' : '')}
            suggestionDirectory={suggestionDirectory}
            suggestionError={suggestionError}
            courseSuggestions={courseSuggestions}
            courseSuggestionError={courseSuggestionError}
            suggestionYearLevel={scheduleCourseYear(section.label, section.sourceLabel, sectionIndex)}
          />}
        </Fragment>
      })}
      {hasSheet && !rows.length && <tr><td colSpan={24} className="px-4 py-8 text-slate-500">Headers matched. This worksheet has no data rows.</td></tr>}
    </tbody>
  )
})
