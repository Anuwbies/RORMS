import { memo, useEffect, type CSSProperties, type ReactNode } from 'react'
import { projectScheduleMerges, scheduleHeaderMerges, type ScheduleRange, type ScheduleRecord, type ScheduleSetup } from '../utils/excelScheduleTemplate'
import { useExcelValidationTooltip, type ExcelValidationTone } from './ExcelValidationTooltip'

export interface SchedulePreviewAppearance {
  merges: readonly ScheduleRange[]
  columns: readonly number[]
  columnWidth: (column: number) => number
  rowHeight: (row: number) => number
  cellStyle: (range: ScheduleRange) => CSSProperties
  cellContent: (row: number, column: number, style: CSSProperties) => ReactNode
  validationMessages?: (range: ScheduleRange) => readonly string[]
  validationTone?: (range: ScheduleRange) => ExcelValidationTone
}

export const ExcelScheduleRowsPreview = memo(function ExcelScheduleRowsPreview({ setup, records, appearance }: { setup: ScheduleSetup; records: readonly ScheduleRecord[]; appearance: SchedulePreviewAppearance }) {
  const { showValidationTooltip, hideValidationTooltip, validationTooltip } = useExcelValidationTooltip(range => appearance.validationMessages?.(range) ?? [], appearance.validationTone)
  useEffect(hideValidationTooltip, [setup, records, appearance, hideValidationTooltip])
  const columns = appearance.columns
  const headerRows = [setup.header.s.r, setup.header.e.r]
  const bodyRows = records.map(record => record.row)
  const headerMerges = projectScheduleMerges(headerRows, columns, scheduleHeaderMerges(setup.header, setup.columns))
  const bodyMerges = projectScheduleMerges(bodyRows, columns, appearance.merges)
  const renderRow = (row: number, header: boolean, rowIndex: number) => <tr key={row} data-source-row={row + 1} style={{ height: appearance.rowHeight(row) }}>
    {columns.map((column, columnIndex) => {
      const merge = (header ? headerMerges : bodyMerges).get(`${row}:${column}`)
      if (merge && (merge.firstRow !== row || merge.firstColumn !== column)) return null
      const range = merge?.source ?? { s: { r: row, c: column }, e: { r: row, c: column } }
      const style = appearance.cellStyle(range)
      const cellStyle = { ...style }
      delete cellStyle.rotate
      if (Number.parseFloat(String(style.rotate ?? 0)) || ['vertical-rl', 'vertical-lr', 'sideways-rl', 'sideways-lr'].includes(String(style.writingMode))) {
        delete cellStyle.writingMode
        delete cellStyle.textOrientation
      }
      // Keep the other outer edges borderless and close the preview with a bottom grid line.
      if (columnIndex === 0) cellStyle.borderLeft = 'none'
      if (columnIndex + (merge?.columnSpan ?? 1) === columns.length) cellStyle.borderRight = 'none'
      if (header && rowIndex === 0) cellStyle.borderTop = 'none'
      if ((!header && rowIndex + (merge?.rowSpan ?? 1) === bodyRows.length) || (header && !bodyRows.length && rowIndex + (merge?.rowSpan ?? 1) === headerRows.length)) {
        cellStyle.borderBottom = style.borderBottom && style.borderBottom !== 'none' ? style.borderBottom : '1px solid #d4d4d4'
      }
      const Cell = header ? 'th' : 'td'
      return <Cell key={column} scope={header ? (merge?.columnSpan && merge.columnSpan > 1 ? 'colgroup' : 'col') : undefined} rowSpan={merge?.rowSpan} colSpan={merge?.columnSpan} style={cellStyle} className="relative overflow-hidden rounded-none px-0.5 py-0" onMouseEnter={event => { if (!header) showValidationTooltip(range, event.currentTarget) }} onMouseLeave={hideValidationTooltip}>
        {appearance.cellContent(range.s.r, range.s.c, style)}
      </Cell>
    })}
  </tr>

  return <div tabIndex={0} aria-label="Schedule table preview" className="min-h-0 flex-1 overflow-auto border border-slate-200">
    <table className="table-fixed border-collapse bg-white text-left text-xs text-slate-800" style={{ width: columns.reduce((width, column) => width + appearance.columnWidth(column), 0) }}>
      <colgroup>{columns.map(column => <col key={column} style={{ width: appearance.columnWidth(column) }} />)}</colgroup>
      <thead>{headerRows.map((row, index) => renderRow(row, true, index))}</thead>
      <tbody>{bodyRows.map((row, index) => renderRow(row, false, index))}</tbody>
    </table>
    {validationTooltip}
  </div>
})
