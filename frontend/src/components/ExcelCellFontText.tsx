import type { ExcelFontRun } from '../utils/excelFontRuns'

export function ExcelCellFontText({ runs }: { runs: readonly ExcelFontRun[] }) {
  return <>{runs.map((run, index) => <span key={index} style={{ fontFamily: run.fontFamily }}>{run.text}</span>)}</>
}
