import { memo } from 'react'
import type { ColumnCellSelection } from '../utils/columnCellSelection'
import { DEPARTMENT_COURSE_HEADERS, type DepartmentCourseRow } from '../utils/departmentCourseImport'
import { EditableScheduleCell, type WorkbookCellActions } from './DepartmentScheduleImportTableBody'

interface CourseRowProps {
  row: DepartmentCourseRow
  rowIndex: number
  sheetIndex: number
  selectedColumn: number | null
  selectionTop: boolean
  selectionBottom: boolean
  actions: WorkbookCellActions
}

const CourseRow = memo(function CourseRow({ row, rowIndex, sheetIndex, selectedColumn, selectionTop, selectionBottom, actions }: CourseRowProps) {
  return <tr data-row-index={rowIndex} className="even:bg-slate-50">
    <th
      scope="row"
      tabIndex={0}
      data-row-counter
      data-source-row={row.rowNumber}
      aria-label={`Select row ${rowIndex + 1}`}
      aria-selected={selectedColumn === -1}
      className={`relative whitespace-nowrap border-r border-b border-slate-300 px-3 py-2 font-normal text-slate-500 ${selectedColumn === -1
        ? `bg-[#62853e]/15 outline-none after:pointer-events-none after:absolute after:left-0 after:-right-px after:top-0 after:-bottom-px after:z-[1] after:border-l-2 after:border-[var(--brand-color)] ${selectionTop ? 'after:border-t-2' : ''} ${selectionBottom ? 'after:border-b-2' : ''}`
        : 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand-color)]'}`}
      onPointerDown={event => actions.startSelection(event, sheetIndex, -1, rowIndex)}
      onPointerMove={actions.moveSelection}
      onPointerUp={event => {
        actions.endSelection()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={actions.endSelection}
      onLostPointerCapture={actions.endSelection}
      onFocus={() => actions.focusCell(sheetIndex, -1, rowIndex)}
    >{rowIndex + 1}</th>
    {row.values.map((value, column) => <EditableScheduleCell
      key={column}
      value={value}
      label={`${DEPARTMENT_COURSE_HEADERS[column]}, row ${rowIndex + 1}`}
      sheetIndex={sheetIndex}
      rowNumber={row.rowNumber}
      rowIndex={rowIndex}
      column={column}
      selected={selectedColumn === column || selectedColumn === -1}
      rowSelected={selectedColumn === -1}
      selectionTop={(selectedColumn === column || selectedColumn === -1) && selectionTop}
      selectionBottom={(selectedColumn === column || selectedColumn === -1) && selectionBottom}
      actions={actions}
    />)}
  </tr>
})

interface DepartmentCoursesTableBodyProps {
  rows: DepartmentCourseRow[]
  sheetIndex: number
  selection: ColumnCellSelection | null
  actions: WorkbookCellActions
}

export const DepartmentCoursesTableBody = memo(function DepartmentCoursesTableBody({ rows, sheetIndex, selection, actions }: DepartmentCoursesTableBodyProps) {
  const first = selection?.sheet === sheetIndex ? Math.min(selection.anchor, selection.end) : -1
  const last = selection?.sheet === sheetIndex ? Math.max(selection.anchor, selection.end) : -1
  return <tbody>{rows.map((row, rowIndex) => <CourseRow
    key={row.rowNumber}
    row={row}
    rowIndex={rowIndex}
    sheetIndex={sheetIndex}
    selectedColumn={rowIndex >= first && rowIndex <= last ? selection!.column : null}
    selectionTop={rowIndex === first}
    selectionBottom={rowIndex === last}
    actions={actions}
  />)}</tbody>
})
