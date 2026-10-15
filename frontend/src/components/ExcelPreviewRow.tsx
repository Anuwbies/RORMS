import { Fragment, memo, type CSSProperties, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import type { CellAddress, Range } from 'xlsx'
import { ExcelCellFontText } from './ExcelCellFontText'
import { ExcelCellTextEditor, type ExcelCellTextDraft, type ExcelCellTextEditorHandle } from './ExcelCellTextEditor'
import { ExcelRotatedCellText } from './ExcelRotatedCellText'
import type { ExcelFontRun } from '../utils/excelFontRuns'
import type { ScheduleYear } from '../utils/excelScheduleTemplate'
import type { ExcelFacultyDirectory } from '../utils/excelFacultySuggestions'
import type { DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'
import type { ExcelRoomDirectory } from '../utils/excelRoomSuggestions'

export interface ExcelPreviewCellData {
  row: number
  column: number
  address: string
  sourceAddress: string
  range: Range
  rowSpan?: number
  columnSpan?: number
  style: CSSProperties
  rotatedStyle: CSSProperties
  text: string
  runs: ExcelFontRun[]
  typingFont: string
  rotation: number
  transformed: boolean
  link: string | null
  annotation: 'comment' | 'note' | null
  revealed: boolean
  mergedContinuation?: boolean
  textReadOnly?: boolean
  filters?: readonly { column: number; label: string; active: boolean }[]
}

export interface ExcelPreviewCellEvents {
  contextMenu: (event: MouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => void
  mouseDown: (event: MouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => void
  mouseEnter: (event: MouseEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => void
  mouseLeave: () => void
  doubleClick: (cell: ExcelPreviewCellData) => void
  keyDown: (event: KeyboardEvent<HTMLTableCellElement>, cell: ExcelPreviewCellData) => void
  save: (address: string, draft: ExcelCellTextDraft) => void
  cancel: () => void
  dirtyChange: (dirty: boolean) => void
  filter: (column: number, anchor: HTMLButtonElement) => void
}


interface ExcelPreviewRowProps {
  row: number
  height: number
  cells: readonly ExcelPreviewCellData[]
  selection: Range | null
  highlightedComment: CellAddress | null
  editingAddress: string | null
  facultySuggestions?: ExcelFacultyDirectory
  subjectSuggestions?: readonly DepartmentCourseSuggestion[]
  subjectIncludesSection?: boolean
  roomSuggestions?: ExcelRoomDirectory
  sheetName: string
  editorRef: RefObject<ExcelCellTextEditorHandle | null>
  onFontContextChange: (font: string) => void
  events: ExcelPreviewCellEvents
  year?: ScheduleYear
  duplicate: boolean
  overlap: boolean
  missing: boolean
}

export const ExcelPreviewRow = memo(function ExcelPreviewRow({ row, height, cells, selection, highlightedComment, editingAddress, facultySuggestions, subjectSuggestions, subjectIncludesSection, roomSuggestions, sheetName, editorRef, onFontContextChange, events, year, duplicate, overlap, missing }: ExcelPreviewRowProps) {
  return <tr data-source-row={row + 1} data-schedule-year={year} data-schedule-duplicate={duplicate} data-schedule-overlap={overlap} data-schedule-missing={missing} style={{ height }}>
    {cells.map((cell, index) => {
      const selected = Boolean(selection && cell.range.s.r <= selection.e.r && cell.range.e.r >= selection.s.r && cell.range.s.c <= selection.e.c && cell.range.e.c >= selection.s.c)
      const commentHighlighted = highlightedComment && cell.range.s.r <= highlightedComment.r && cell.range.e.r >= highlightedComment.r && cell.range.s.c <= highlightedComment.c && cell.range.e.c >= highlightedComment.c
      return <Fragment key={cell.column}><td rowSpan={cell.rowSpan} colSpan={cell.columnSpan} style={cell.style} tabIndex={selected ? 0 : -1} aria-selected={selected} aria-readonly={cell.textReadOnly || undefined}
        onContextMenu={event => events.contextMenu(event, cell)} onMouseDown={event => events.mouseDown(event, cell)} onMouseEnter={event => events.mouseEnter(event, cell)} onMouseLeave={events.mouseLeave} onDoubleClick={() => events.doubleClick(cell)} onKeyDown={event => events.keyDown(event, cell)} data-cell={cell.address}
        className="relative overflow-hidden rounded-none px-0.5 py-0 focus:outline-none focus-visible:outline-none">
        {editingAddress === cell.sourceAddress && !cell.mergedContinuation && !cell.textReadOnly
          ? <ExcelCellTextEditor ref={editorRef} key={`${sheetName}:${cell.sourceAddress}`} runs={cell.runs} typingFont={cell.typingFont} facultySuggestions={facultySuggestions} subjectSuggestions={subjectSuggestions} subjectIncludesSection={subjectIncludesSection} roomSuggestions={roomSuggestions} onFontContextChange={onFontContextChange} onDirtyChange={events.dirtyChange} onSave={draft => events.save(cell.sourceAddress, draft)} onCancel={events.cancel} />
          : cell.transformed
            ? <ExcelRotatedCellText text={cell.text} angle={cell.rotation} cellStyle={cell.rotatedStyle} runs={cell.runs} />
            : cell.link
              ? <a href={cell.link} target="_blank" rel="noopener noreferrer" onClick={event => { if (!event.ctrlKey && !event.metaKey) event.preventDefault() }} className="inline-block text-blue-700 underline" style={{ fontFamily: cell.style.fontFamily }}>{cell.runs.length ? <ExcelCellFontText runs={cell.runs} /> : cell.link}</a>
              : <span className="inline-block" style={{ fontFamily: cell.style.fontFamily }}><ExcelCellFontText runs={cell.runs} /></span>}
        {cell.annotation && <span aria-label="Cell has a comment or note" className={`pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[5px] border-t-[5px] border-l-transparent ${cell.annotation === 'comment' ? 'border-t-amber-500' : 'border-t-slate-900'}`} />}
        {cell.filters && <span className="absolute right-0.5 bottom-0.5 z-20 flex gap-0.5">
          {cell.filters.map(filter => <button key={filter.column} type="button" aria-label={`Filter ${filter.label}`} title={`Filter ${filter.label}`} aria-haspopup="dialog" data-column-filter
            onPointerDown={event => event.stopPropagation()} onMouseDown={event => { event.preventDefault(); event.stopPropagation() }} onDoubleClick={event => event.stopPropagation()}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }}
            onClick={event => { event.stopPropagation(); events.filter(filter.column, event.currentTarget) }}
            className={`flex h-[18px] w-[18px] items-center justify-center rounded border border-slate-400 bg-white hover:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e] ${filter.active ? 'text-[#526f34]' : 'text-slate-600'}`}>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 fill-current"><path d={filter.active ? 'M2 3h12L9 8v5l-2 1V8Z' : 'm3 6 5 5 5-5Z'} /></svg>
          </button>)}
        </span>}
        {cell.revealed && <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[#62853e]/10" />}
        {commentHighlighted && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 border-2 border-[#62853e] bg-[#62853e]/10" />}
      </td></Fragment>
    })}
  </tr>
}, (previous, next) => {
  if (previous.row !== next.row || previous.cells !== next.cells || previous.height !== next.height || previous.editingAddress !== next.editingAddress
    || previous.highlightedComment !== next.highlightedComment || previous.facultySuggestions !== next.facultySuggestions || previous.subjectSuggestions !== next.subjectSuggestions || previous.subjectIncludesSection !== next.subjectIncludesSection || previous.roomSuggestions !== next.roomSuggestions || previous.events !== next.events || previous.sheetName !== next.sheetName
    || previous.editorRef !== next.editorRef || previous.onFontContextChange !== next.onFontContextChange || previous.year !== next.year
    || previous.duplicate !== next.duplicate || previous.overlap !== next.overlap || previous.missing !== next.missing) return false
  if (previous.selection === next.selection) return true
  const selected = (range: Range, selection: Range | null) => Boolean(selection && range.s.r <= selection.e.r && range.e.r >= selection.s.r && range.s.c <= selection.e.c && range.e.c >= selection.s.c)
  // Extending a drag should not redraw rows whose selected cells did not change.
  return next.cells.every(cell => selected(cell.range, previous.selection) === selected(cell.range, next.selection))
})
