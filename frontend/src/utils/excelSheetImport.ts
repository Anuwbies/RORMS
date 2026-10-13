import type { WorkBook } from 'xlsx'
import type { ExcelPreviewStyles, SheetPreviewFormatting } from './excelPreviewStyles'
import type { WorkbookEditSnapshot } from './excelWorkbookState'
import { findDepartmentTemplateSheets, templateRole } from './departmentScheduleTemplates'

export interface ExcelSheetImport {
  file: File
  workbook: WorkBook
  styles: ExcelPreviewStyles
  formatting: Map<string, SheetPreviewFormatting>
  sheetNames: string[]
  id: string
  replaceDepartmentTemplates?: boolean
  replaceDepartmentRooms?: boolean
}

function removeDepartmentTemplates(current: WorkbookEditSnapshot, roomsOnly = false): WorkbookEditSnapshot {
  const removed = new Set(current.workbook.SheetNames.filter(name => {
    const role = templateRole(current.workbook.Sheets[name])
    return roomsOnly ? role === 'rooms' : Boolean(role)
  }))
  if (roomsOnly) {
    const oldRoomSheet = findDepartmentTemplateSheets(current)?.roomsSheet
    if (oldRoomSheet) removed.add(oldRoomSheet)
  }
  if (!removed.size) return current
  const keep = <T>(map: Map<string, T>) => new Map([...map].filter(([name]) => !removed.has(name)))
  const names = current.workbook.SheetNames.filter(name => !removed.has(name))
  return {
    ...current, workbook: { ...current.workbook, SheetNames: names,
      Sheets: Object.fromEntries(names.map(name => [name, current.workbook.Sheets[name]])),
      Workbook: { ...current.workbook.Workbook, Sheets: current.workbook.SheetNames.flatMap((name, index) => removed.has(name) ? [] : [{ ...current.workbook.Workbook?.Sheets?.[index], name }]) } },
    sheetColors: keep(current.sheetColors), addedRowsBySheet: keep(current.addedRowsBySheet), rowHeightOverrides: keep(current.rowHeightOverrides),
    columnWidthOverrides: keep(current.columnWidthOverrides), cellTextOverrides: keep(current.cellTextOverrides), cellStyleOverrides: keep(current.cellStyleOverrides),
    mergeOverrides: keep(current.mergeOverrides), formattingOverrides: keep(current.formattingOverrides), scheduleSetups: keep(current.scheduleSetups), hiddenRangeToggles: keep(current.hiddenRangeToggles),
  }
}

function removeUntouchedDefaultSheet(current: WorkbookEditSnapshot, defaultSheetName?: string): WorkbookEditSnapshot {
  const name = 'Sheet1'
  const sheet = current.workbook.Sheets[name]
  if (!sheet || (sheet['!rormsDefaultSheet'] !== true && defaultSheetName !== name)) return current
  // User-created/imported empty sheets and any customized placeholder stay intact.
  if (sheet['!ref'] !== 'A1:Z30' || Object.keys(sheet).some(key => key !== '!ref' && key !== '!rormsDefaultSheet')) return current
  if (current.sheetColors.has(name) || current.scheduleSetups.has(name)
    || (current.addedRowsBySheet.get(name) ?? 25) !== 25
    || current.rowHeightOverrides.get(name)?.size || current.columnWidthOverrides.get(name)?.size
    || current.cellTextOverrides.get(name)?.size || current.cellStyleOverrides.get(name)?.size
    || current.mergeOverrides.has(name) || current.formattingOverrides.has(name)
    || current.hiddenRangeToggles.has(name)) return current
  const without = <T>(map: Map<string, T>): Map<string, T> => { const next = new Map(map); next.delete(name); return next }
  const names = current.workbook.SheetNames.filter(sheetName => sheetName !== name)
  const sheets = { ...current.workbook.Sheets }
  delete sheets[name]
  return {
    ...current,
    workbook: {
      ...current.workbook, SheetNames: names, Sheets: sheets,
      Workbook: { ...current.workbook.Workbook, Sheets: current.workbook.SheetNames.flatMap((sheetName, index) => sheetName === name ? [] : [{ ...current.workbook.Workbook?.Sheets?.[index], name: sheetName }]) },
    },
    sheetColors: without(current.sheetColors), addedRowsBySheet: without(current.addedRowsBySheet),
    rowHeightOverrides: without(current.rowHeightOverrides), columnWidthOverrides: without(current.columnWidthOverrides),
    cellTextOverrides: without(current.cellTextOverrides), cellStyleOverrides: without(current.cellStyleOverrides),
    mergeOverrides: without(current.mergeOverrides), formattingOverrides: without(current.formattingOverrides),
    scheduleSetups: without(current.scheduleSetups), hiddenRangeToggles: without(current.hiddenRangeToggles),
  }
}

export function appendImportedSheets(current: WorkbookEditSnapshot, incoming: ExcelSheetImport, defaultSheetName?: string): { snapshot: WorkbookEditSnapshot; addedNames: string[] } {
  const selected = new Set(incoming.sheetNames)
  const names = incoming.workbook.SheetNames.filter(name => selected.has(name) && incoming.workbook.Sheets[name])
  if (!names.length || selected.size !== names.length) throw new Error('Choose at least one valid sheet to import.')
  current = removeUntouchedDefaultSheet(current, defaultSheetName)
  if (incoming.replaceDepartmentTemplates) current = removeDepartmentTemplates(current)
  else if (incoming.replaceDepartmentRooms) current = removeDepartmentTemplates(current, true)
  const occupied = new Set(current.workbook.SheetNames.map(name => name.toLowerCase()))
  const addedNames = names.map(name => {
    let candidate = name
    for (let suffix = 2; occupied.has(candidate.toLowerCase()); suffix++) {
      const ending = ` (${suffix})`
      candidate = `${name.slice(0, 31 - ending.length)}${ending}`
    }
    occupied.add(candidate.toLowerCase())
    return candidate
  })
  const existingStyles = current.previewStyles?.cellStyles.length ? current.previewStyles.cellStyles : [{}]
  const importedStyles = incoming.styles.cellStyles.length ? incoming.styles.cellStyles : [{}]
  const offset = existingStyles.length
  const prefix = `imports/${incoming.id}/`
  const files = { ...current.previewStyles?.files }
  const sheetPaths = { ...current.previewStyles?.sheetPaths }
  const sheets = { ...current.workbook.Sheets }
  const formatting = new Map(current.formattingOverrides)
  names.forEach((name, index) => {
    const target = addedNames[index]
    sheets[target] = incoming.workbook.Sheets[name]
    const path = incoming.styles.sheetPaths[name]
    if (path) {
      sheetPaths[target] = `${prefix}${path}`
      if (incoming.styles.files[path]) files[`${prefix}${path}`] = incoming.styles.files[path]
    }
    const source = incoming.formatting.get(name)
    if (!source) throw new Error('The imported sheet formatting could not be read.')
    formatting.set(target, {
      indexes: new Map([...source.indexes].map(([address, style]) => [address, style + offset])),
      rowIndexes: new Map([...source.rowIndexes].map(([row, style]) => [row, style + offset])),
      columnIndexes: [...source.columnIndexes.map(column => ({ ...column, styleId: column.styleId + offset })), { first: 0, last: 16383, styleId: offset }],
      conditionalRules: source.conditionalRules,
    })
  })
  const metadata = current.workbook.SheetNames.map((name, index) => ({ ...current.workbook.Workbook?.Sheets?.[index], name }))
  return {
    addedNames,
    snapshot: {
      ...current,
      workbook: {
        ...current.workbook,
        SheetNames: [...current.workbook.SheetNames, ...addedNames],
        Sheets: sheets,
        Workbook: { ...current.workbook.Workbook, Sheets: [...metadata, ...addedNames.map(name => ({ name, Hidden: 0 as const }))] },
      },
      previewStyles: { files, sheetPaths, cellStyles: [...existingStyles, ...importedStyles], differentialStyles: current.previewStyles?.differentialStyles || [] },
      formattingOverrides: formatting,
      scheduleSetups: new Map(current.scheduleSetups),
      selectedSheet: addedNames[0],
      selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
    },
  }
}

export async function createImportedSourceFile(currentFile: File | null | undefined, incomingFile: File, files: Record<string, Uint8Array>): Promise<File> {
  const { unzipSync, zipSync } = await import('fflate')
  const source = currentFile || incomingFile
  const originalFiles = unzipSync(new Uint8Array(await source.arrayBuffer()))
  // Retain the original XLSX and the sheet XML used by every editor snapshot.
  const bytes = zipSync({ ...originalFiles, ...files }, { level: 6 })
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('The combined workbook exceeds 20 MB. Import fewer sheets or a smaller file.')
  return new File([bytes.buffer as ArrayBuffer], source.name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
