import * as XLSX from 'xlsx'
import type { WorkbookEditSnapshot } from './excelWorkbookState'
import { validateScheduleHeader } from './excelScheduleTemplate.ts'
import { canonicalizeFacultyText, canonicalizeFacultyFontRuns } from './excelFacultySuggestions.ts'
import type { ExcelFontCell } from './excelFontRuns'

/** Normalize only faculty cells below valid schedule headers, without changing formatting. */
export function canonicalizeWorkbookFaculty(snapshot: WorkbookEditSnapshot, names: readonly string[]): WorkbookEditSnapshot {
  let workbook = snapshot.workbook
  let overrides = snapshot.cellTextOverrides
  for (const [sheetName, setup] of snapshot.scheduleSetups) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const texts = overrides.get(sheetName)
    const read = (row: number, column: number) => {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const cell = sheet[address]
      return texts?.get(address) ?? (cell?.v !== undefined ? XLSX.utils.format_cell({ ...cell }) : cell?.f ? `=${cell.f}` : '')
    }
    if (validateScheduleHeader(setup.header, read, setup.columns)) continue
    let updatedSheet = sheet
    let updatedTexts = texts
    for (const address of new Set([...Object.keys(sheet), ...(texts?.keys() ?? [])])) {
      if (!/^[A-Z]+[1-9]\d*$/.test(address)) continue
      const position = XLSX.utils.decode_cell(address)
      if (position.r <= setup.header.e.r || ![setup.columns[13], setup.columns[14]].includes(position.c)) continue
      const cell = sheet[address] as ExcelFontCell | undefined
      if (cell?.f && !texts?.has(address)) continue
      const current = read(position.r, position.c)
      const normalized = canonicalizeFacultyText(current, names)
      if (normalized === current) continue
      if (updatedTexts === texts) updatedTexts = new Map(texts)
      updatedTexts!.set(address, normalized)
      if (cell?.previewFontRuns && cell.previewFontRuns.map(run => run.text).join('') === current) {
        if (updatedSheet === sheet) updatedSheet = { ...sheet }
        updatedSheet[address] = { ...cell, previewFontRuns: canonicalizeFacultyFontRuns(cell.previewFontRuns, names) }
      }
    }
    if (updatedTexts !== texts) {
      if (overrides === snapshot.cellTextOverrides) overrides = new Map(overrides)
      overrides.set(sheetName, updatedTexts!)
    }
    if (updatedSheet !== sheet) {
      if (workbook === snapshot.workbook) workbook = { ...workbook, Sheets: { ...workbook.Sheets } }
      workbook.Sheets[sheetName] = updatedSheet
    }
  }
  return workbook === snapshot.workbook && overrides === snapshot.cellTextOverrides ? snapshot : { ...snapshot, workbook, cellTextOverrides: overrides }
}
