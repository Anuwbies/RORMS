import { deserializeWorkbookState, serializeWorkbookState, type WorkbookEditSnapshot } from './excelWorkbookState.ts'
import { readSheetPreviewFormatting } from './excelPreviewStyles.ts'

// Leave room for document names, field names, and revision metadata below 1 MiB.
export const MAX_SHEET_JSON_BYTES = 900 * 1024
export const MAX_SHEET_PART_BYTES = 400 * 1024
const MAX_WORKBOOK_JSON_BYTES = 50 * 1024 * 1024

export interface FirestoreWorkbookSheet {
  id: string
  name: string
  json: string
  byteLength: number
}

export interface FirestoreWorkbookManifest {
  sheetIds: string[]
  sheetNames: string[]
  selectedSheet: string
  selectionJson: string
}

export interface FirestoreWorkbookSheetPart extends FirestoreWorkbookSheet {
  sheetId: string
  partIndex: number
  partCount: number
  sheetByteLength: number
}

/** Split at Unicode code point boundaries, measuring UTF-8 rather than characters. */
export function splitSheetText(json: string): string[] {
  const parts: string[] = []
  let start = 0, bytes = 0
  for (let index = 0; index < json.length;) {
    const point = json.codePointAt(index)!
    const length = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
    if (bytes + length > MAX_SHEET_PART_BYTES) {
      parts.push(json.slice(start, index))
      start = index
      bytes = 0
    }
    bytes += length
    index += point > 0xffff ? 2 : 1
  }
  parts.push(json.slice(start))
  return parts
}

export function joinSheetParts(sheetId: string, name: string, parts: readonly FirestoreWorkbookSheetPart[]): FirestoreWorkbookSheet {
  const first = parts[0]
  if (!first || parts.length !== first.partCount || !Number.isSafeInteger(first.sheetByteLength) || first.sheetByteLength < 1) throw new Error('A saved sheet is incomplete.')
  for (const [index, part] of parts.entries()) {
    if (part.sheetId !== sheetId || part.id !== `${sheetId}_part_${index}` || part.name !== name
      || part.partIndex !== index || part.partCount !== parts.length || part.sheetByteLength !== first.sheetByteLength
      || part.byteLength < 1 || part.byteLength > MAX_SHEET_PART_BYTES
      || new TextEncoder().encode(part.json).byteLength !== part.byteLength) throw new Error('A saved sheet part is invalid.')
  }
  const json = parts.map(part => part.json).join('')
  if (new TextEncoder().encode(json).byteLength !== first.sheetByteLength) throw new Error('A saved sheet is incomplete.')
  return { id: sheetId, name, json, byteLength: first.sheetByteLength }
}

/** Resolve XML-backed formatting while the imported file is still in memory. */
export function serializeFirestoreWorkbookState(snapshot: WorkbookEditSnapshot): string {
  const formattingOverrides = new Map(snapshot.workbook.SheetNames.map(name => [
    name, snapshot.formattingOverrides.get(name) ?? readSheetPreviewFormatting(snapshot.previewStyles, name),
  ]))
  const previewStyles = snapshot.previewStyles ? { ...snapshot.previewStyles, files: {}, sheetPaths: {} } : null
  return serializeWorkbookState({ ...snapshot, previewStyles, formattingOverrides })
}

export function splitFirestoreWorkbookState(editorState: string, includeParts = true): { manifest: FirestoreWorkbookManifest; sheets: FirestoreWorkbookSheet[]; parts: FirestoreWorkbookSheetPart[] } {
  const snapshot = deserializeWorkbookState(editorState, {})
  const names = snapshot.workbook.SheetNames
  if (names.length > 1000) throw new Error('The workbook supports up to 1,000 sheets.')
  // Every persisted sheet needs its own resolved formatting, rather than source XML.
  if (names.some(name => !snapshot.formattingOverrides.has(name))) throw new Error('Sheet formatting must be prepared before saving to Firestore.')
  const only = <T>(map: Map<string, T>, name: string): Map<string, T> => new Map(map.has(name) ? [[name, map.get(name)!]] : [])
  // Keep frequent text edits after the large imported cells and formatting.
  // Inserting text must not shift every subsequent formatting chunk boundary.
  const { cellTextOverrides, selection, ...stableFields } = snapshot
  let totalBytes = 0
  const sheets = names.map((name, index) => {
    const workbook = {
      ...snapshot.workbook, SheetNames: [name], Sheets: { [name]: snapshot.workbook.Sheets[name] },
      Workbook: { ...snapshot.workbook.Workbook, Sheets: [{ ...snapshot.workbook.Workbook?.Sheets?.[index], name }] },
    }
    const json = serializeWorkbookState({
      ...stableFields, workbook,
      previewStyles: snapshot.previewStyles ? { ...snapshot.previewStyles, files: {}, sheetPaths: {} } : null,
      sheetColors: only(snapshot.sheetColors, name), addedRowsBySheet: only(snapshot.addedRowsBySheet, name),
      rowHeightOverrides: only(snapshot.rowHeightOverrides, name), columnWidthOverrides: only(snapshot.columnWidthOverrides, name),
      cellStyleOverrides: only(snapshot.cellStyleOverrides, name),
      mergeOverrides: only(snapshot.mergeOverrides, name), formattingOverrides: only(snapshot.formattingOverrides, name),
      scheduleSetups: only(snapshot.scheduleSetups, name), hiddenRangeToggles: only(snapshot.hiddenRangeToggles, name),
      selectedSheet: name,
      cellTextOverrides: only(cellTextOverrides, name),
      selection: name === snapshot.selectedSheet ? selection : { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
    })
    const byteLength = new TextEncoder().encode(json).byteLength
    totalBytes += byteLength
    if (totalBytes > MAX_WORKBOOK_JSON_BYTES) throw new Error('This workbook exceeds the 50 MB editor data limit. Import fewer sheets and save again.')
    return { id: `sheet_${index}`, name, json, byteLength }
  })
  return {
    manifest: { sheetIds: sheets.map(sheet => sheet.id), sheetNames: names, selectedSheet: snapshot.selectedSheet, selectionJson: JSON.stringify(snapshot.selection) },
    sheets,
    parts: includeParts ? sheets.flatMap(sheet => {
      const text = splitSheetText(sheet.json)
      return text.map((json, partIndex) => ({ id: `${sheet.id}_part_${partIndex}`, sheetId: sheet.id, name: sheet.name, json,
        byteLength: new TextEncoder().encode(json).byteLength, partIndex, partCount: text.length, sheetByteLength: sheet.byteLength }))
    }) : [],
  }
}

export function joinFirestoreWorkbookState(manifest: FirestoreWorkbookManifest, sheets: readonly FirestoreWorkbookSheet[]): string {
  if (sheets.length !== manifest.sheetIds.length || sheets.length !== manifest.sheetNames.length
    || new Set(manifest.sheetIds).size !== sheets.length || new Set(manifest.sheetNames).size !== sheets.length
    || (sheets.length ? !manifest.sheetNames.includes(manifest.selectedSheet) : manifest.selectedSheet !== '')) throw new Error('The saved workbook is incomplete.')
  if (!sheets.length) {
    const json = serializeWorkbookState({
      workbook: { SheetNames: [], Sheets: {}, Workbook: { Sheets: [] } }, previewStyles: null,
      sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(), columnWidthOverrides: new Map(),
      cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(), formattingOverrides: new Map(),
      scheduleSetups: new Map(), hiddenRangeToggles: new Map(), selectedSheet: '', selection: JSON.parse(manifest.selectionJson),
    })
    deserializeWorkbookState(json, {})
    return json
  }
  const snapshots = sheets.map((sheet, index) => {
    if (sheet.id !== manifest.sheetIds[index] || sheet.name !== manifest.sheetNames[index]
      || new TextEncoder().encode(sheet.json).byteLength !== sheet.byteLength) throw new Error('A saved sheet is invalid.')
    const snapshot = deserializeWorkbookState(sheet.json, {})
    if (snapshot.workbook.SheetNames.length !== 1 || snapshot.workbook.SheetNames[0] !== sheet.name
      || !snapshot.formattingOverrides.has(sheet.name)) throw new Error('A saved sheet is invalid.')
    return snapshot
  })
  const first = snapshots[0]
  const joined: WorkbookEditSnapshot = {
    ...first,
    workbook: { ...first.workbook, SheetNames: manifest.sheetNames, Sheets: Object.assign({}, ...snapshots.map(snapshot => snapshot.workbook.Sheets)),
      Workbook: { ...first.workbook.Workbook, Sheets: snapshots.flatMap(snapshot => snapshot.workbook.Workbook?.Sheets ?? []) } },
    selectedSheet: manifest.selectedSheet, selection: JSON.parse(manifest.selectionJson),
  }
  const combine = <T>(maps: Map<string, T>[]): Map<string, T> => new Map(maps.flatMap(map => [...map]))
  joined.sheetColors = combine(snapshots.map(snapshot => snapshot.sheetColors))
  joined.addedRowsBySheet = combine(snapshots.map(snapshot => snapshot.addedRowsBySheet))
  joined.rowHeightOverrides = combine(snapshots.map(snapshot => snapshot.rowHeightOverrides))
  joined.columnWidthOverrides = combine(snapshots.map(snapshot => snapshot.columnWidthOverrides))
  joined.cellTextOverrides = combine(snapshots.map(snapshot => snapshot.cellTextOverrides))
  joined.cellStyleOverrides = combine(snapshots.map(snapshot => snapshot.cellStyleOverrides))
  joined.mergeOverrides = combine(snapshots.map(snapshot => snapshot.mergeOverrides))
  joined.formattingOverrides = combine(snapshots.map(snapshot => snapshot.formattingOverrides))
  joined.scheduleSetups = combine(snapshots.map(snapshot => snapshot.scheduleSetups))
  joined.hiddenRangeToggles = combine(snapshots.map(snapshot => snapshot.hiddenRangeToggles))
  const json = serializeWorkbookState(joined)
  // Validate manifest selection and the combined editor state before returning it.
  deserializeWorkbookState(json, {})
  return json
}
