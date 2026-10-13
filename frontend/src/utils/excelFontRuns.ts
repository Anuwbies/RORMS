import type * as XLSX from 'xlsx'

export interface ExcelFontRun {
  text: string
  fontFamily: string
}

export type ExcelFontCell = XLSX.CellObject & {
  previewFontRuns?: ExcelFontRun[]
  previewTypingFont?: string
}

export function normalizeFontRuns(runs: readonly ExcelFontRun[]): ExcelFontRun[] {
  const result: ExcelFontRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const previous = result[result.length - 1]
    if (previous?.fontFamily === run.fontFamily) previous.text += run.text
    else result.push({ ...run })
  }
  return result
}

export function fontRunsForCell(cell: ExcelFontCell | undefined, text: string, fontFamily: string): ExcelFontRun[] {
  const runs = cell?.previewFontRuns
  return runs && runs.map(run => run.text).join('') === text ? runs : text ? [{ text, fontFamily }] : []
}

export function sliceFontRuns(runs: readonly ExcelFontRun[], start: number, end: number): ExcelFontRun[] {
  let offset = 0
  return runs.flatMap(run => {
    const text = run.text.slice(Math.max(0, start - offset), Math.max(0, end - offset))
    offset += run.text.length
    return text ? [{ ...run, text }] : []
  })
}

export function replaceFontRuns(runs: readonly ExcelFontRun[], start: number, end: number, inserted: readonly ExcelFontRun[]): ExcelFontRun[] {
  return normalizeFontRuns([
    ...sliceFontRuns(runs, 0, start),
    ...inserted,
    ...sliceFontRuns(runs, end, Infinity),
  ])
}
