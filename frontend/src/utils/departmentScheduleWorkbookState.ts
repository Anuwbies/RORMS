import * as XLSX from 'xlsx'
import { createEmptyDepartmentScheduleSheet, readDepartmentScheduleImport, type DepartmentScheduleImportSheet, type DepartmentScheduleYearSection } from './departmentScheduleImport.ts'
import { scheduleHeaderAt, scheduleHeaderMerges, scheduleHeaderValues } from './excelScheduleTemplate.ts'
import { deserializeWorkbookState, type WorkbookEditSnapshot } from './excelWorkbookState.ts'
import { serializeFirestoreWorkbookState } from './firestoreWorkbookState.ts'

const METADATA_KEY = '!rormsDepartmentScheduleImport'
interface ScheduleMetadata {
  version: 1
  rowNumbers: number[]
  yearSections?: DepartmentScheduleYearSection[]
  columnWidths: number[] | null
}

function metadata(value: unknown): ScheduleMetadata {
  if (!value || typeof value !== 'object') throw new Error('Invalid saved schedule settings.')
  const data = value as ScheduleMetadata
  if (data.version !== 1 || !Array.isArray(data.rowNumbers)
    || data.rowNumbers.some(row => !Number.isSafeInteger(row) || row < 1)
    || new Set(data.rowNumbers).size !== data.rowNumbers.length
    || data.columnWidths !== null && (!Array.isArray(data.columnWidths) || ![22, 23].includes(data.columnWidths.length)
      || data.columnWidths.some(width => !Number.isFinite(width) || width <= 0))) {
    throw new Error('Invalid saved schedule settings.')
  }
  if (data.yearSections !== undefined) {
    let next = 0
    if (!Array.isArray(data.yearSections) || data.yearSections.some(section => {
      if (!section || typeof section.label !== 'string' || section.start !== next
        || !Number.isInteger(section.count) || section.count < 1
        || section.sourceLabel !== undefined && typeof section.sourceLabel !== 'string'
        || section.hidden !== undefined && typeof section.hidden !== 'boolean') return true
      next += section.count
      return false
    }) || next !== data.rowNumbers.length) throw new Error('Invalid saved year sections.')
  }
  return data
}

export interface DepartmentScheduleWorkbookState {
  sheets: DepartmentScheduleImportSheet[]
  selectedSheet: number
  columnWidths: number[] | null
  snapshot: WorkbookEditSnapshot
  ownedNames: string[]
}

/** Read editor overrides too, and keep empty rows rather than parsing them away. */
export function readDepartmentScheduleWorkbookState(editorState: string): DepartmentScheduleWorkbookState {
  const snapshot = deserializeWorkbookState(editorState, {})
  const workbook: XLSX.WorkBook = { ...snapshot.workbook, Sheets: { ...snapshot.workbook.Sheets } }
  for (const name of workbook.SheetNames) {
    const worksheet = { ...workbook.Sheets[name] }
    for (const [address, text] of snapshot.cellTextOverrides.get(name) ?? []) worksheet[address] = { t: 's', v: text }
    workbook.Sheets[name] = worksheet
  }
  const imported = readDepartmentScheduleImport({ ...workbook,
    SheetNames: workbook.SheetNames.filter(name => !workbook.Sheets[name][METADATA_KEY]) })
  const sheets = workbook.SheetNames.flatMap(name => {
    const worksheet = workbook.Sheets[name]
    if (!worksheet[METADATA_KEY]) return imported.filter(sheet => sheet.name === name)
    const settings = metadata(worksheet[METADATA_KEY])
    return [{ name, headerRow: 1, yearSections: settings.yearSections,
      rows: settings.rowNumbers.map((rowNumber, index) => ({ rowNumber,
        values: Array.from({ length: 21 }, (_, column) => {
          const cell = worksheet[XLSX.utils.encode_cell({ r: index + 2, c: column })] as XLSX.CellObject | undefined
          return cell ? XLSX.utils.format_cell(cell) : ''
        }),
      })),
    }]
  })
  const ownedNames = sheets.map(sheet => sheet.name)
  if (!sheets.length) {
    const empty = createEmptyDepartmentScheduleSheet()
    empty.name = uniqueSheetName(empty.name, new Set(workbook.SheetNames))
    sheets.push(empty)
  }
  const selectedSheet = Math.max(0, sheets.findIndex(sheet => sheet.name === snapshot.selectedSheet))
  const settings = workbook.Sheets[sheets[selectedSheet].name]?.[METADATA_KEY] as ScheduleMetadata | undefined
  const savedWidths = settings?.columnWidths ?? null
  return { sheets, selectedSheet, columnWidths: savedWidths?.length === 22 ? [...savedWidths, 96] : savedWidths, snapshot, ownedNames }
}

function uniqueSheetName(name: string, used: Set<string>): string {
  let candidate = name
  let suffix = 2
  while (used.has(candidate)) candidate = `${name.slice(0, 25)} (${suffix++})`
  used.add(candidate)
  return candidate
}

/** Save compact editor sheets alongside any unrelated worksheets already in this term. */
export function createDepartmentScheduleWorkbookSnapshot(sheets: readonly DepartmentScheduleImportSheet[], selectedSheet: number,
  columnWidths: number[] | null, previous?: Pick<DepartmentScheduleWorkbookState, 'snapshot' | 'ownedNames'>) {
  if (!sheets.length) throw new Error('There is no workbook to save.')
  const base = previous?.snapshot
  const retained = base?.workbook.SheetNames.filter(name => !previous?.ownedNames.includes(name)) ?? []
  const used = new Set(retained)
  const names = sheets.map(sheet => uniqueSheetName(sheet.name, used))
  const workbook: XLSX.WorkBook = { ...base?.workbook, SheetNames: [...retained, ...names],
    Sheets: Object.fromEntries(retained.map(name => [name, base!.workbook.Sheets[name]])) }
  sheets.forEach((sheet, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet([...scheduleHeaderValues(), ...sheet.rows.map(row => row.values)])
    worksheet['!merges'] = scheduleHeaderMerges(scheduleHeaderAt({ r: 0, c: 0 }))
    worksheet[METADATA_KEY] = { version: 1, rowNumbers: sheet.rows.map(row => row.rowNumber),
      yearSections: sheet.yearSections, columnWidths } satisfies ScheduleMetadata
    if (columnWidths) worksheet['!cols'] = columnWidths.slice(1, 22).map(wpx => ({ wpx }))
    workbook.Sheets[names[index]] = worksheet
  })
  const keep = <T>(map?: Map<string, T>) => new Map([...map ?? []].filter(([name]) => retained.includes(name)))
  const snapshot: WorkbookEditSnapshot = {
    workbook, previewStyles: base?.previewStyles ?? null,
    sheetColors: keep(base?.sheetColors), addedRowsBySheet: keep(base?.addedRowsBySheet),
    rowHeightOverrides: keep(base?.rowHeightOverrides), columnWidthOverrides: keep(base?.columnWidthOverrides),
    cellTextOverrides: keep(base?.cellTextOverrides), cellStyleOverrides: keep(base?.cellStyleOverrides),
    mergeOverrides: keep(base?.mergeOverrides), formattingOverrides: keep(base?.formattingOverrides),
    scheduleSetups: keep(base?.scheduleSetups), hiddenRangeToggles: keep(base?.hiddenRangeToggles),
    selectedSheet: names[selectedSheet] ?? names[0], selection: { anchor: { r: 2, c: 0 }, focus: { r: 2, c: 0 } },
  }
  return { snapshot, ownedNames: names }
}

export function createDepartmentScheduleWorkbookState(sheets: readonly DepartmentScheduleImportSheet[], selectedSheet: number,
  columnWidths: number[] | null, previous?: Pick<DepartmentScheduleWorkbookState, 'snapshot' | 'ownedNames'>) {
  const state = createDepartmentScheduleWorkbookSnapshot(sheets, selectedSheet, columnWidths, previous)
  return { ...state, editorState: serializeFirestoreWorkbookState(state.snapshot) }
}
