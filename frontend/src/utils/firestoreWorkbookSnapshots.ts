import { deserializeWorkbookState, serializeWorkbookState } from './excelWorkbookState.ts'
import { splitFirestoreWorkbookState, type FirestoreWorkbookSheet } from './firestoreWorkbookState.ts'

export const MAX_COMPRESSED_PART_CHARS = 400 * 1024
export const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024
export const MAX_ENCODED_SNAPSHOT_CHARS = 70 * 1024 * 1024
export const MAX_CELL_PATCH_BYTES = 64 * 1024

export interface CellEdit {
  text: string | null
  styleJson: string | null
}

export interface PreparedSnapshotSheet extends FirestoreWorkbookSheet {
  baseHash: string
  edits: Map<string, CellEdit>
}

export async function hashSnapshot(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function validCellAddress(address: string): boolean {
  const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(address)
  if (!match || Number(match[2]) > 1048576) return false
  const column = [...match[1]].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0)
  return column <= 16384
}

export async function prepareSnapshotSheets(editorState: string) {
  const { manifest, sheets } = splitFirestoreWorkbookState(editorState, false)
  const prepared = await Promise.all(sheets.map(async sheet => {
    const snapshot = deserializeWorkbookState(sheet.json, {})
    // Selection belongs to the term, not the large sheet snapshot.
    snapshot.selection = { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } }
    const json = serializeWorkbookState(snapshot)
    const texts = snapshot.cellTextOverrides.get(sheet.name) ?? new Map<string, string>()
    const styles = snapshot.cellStyleOverrides.get(sheet.name) ?? new Map()
    const edits = new Map<string, CellEdit>()
    for (const address of new Set([...texts.keys(), ...styles.keys()])) {
      if (!validCellAddress(address)) throw new Error('The sheet contains an invalid edited cell address.')
      edits.set(address, { text: texts.get(address) ?? null, styleJson: styles.has(address) ? JSON.stringify(styles.get(address)) : null })
    }
    const baseHash = await hashSnapshot(serializeWorkbookState({ ...snapshot, cellTextOverrides: new Map(), cellStyleOverrides: new Map() }))
    return { ...sheet, json, byteLength: new TextEncoder().encode(json).byteLength, baseHash, edits }
  }))
  return { manifest, sheets: prepared }
}

export function changedCellEdits(before: Map<string, CellEdit>, after: Map<string, CellEdit>): Map<string, CellEdit> {
  const changed = new Map<string, CellEdit>()
  for (const address of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(address), current = after.get(address)
    if (previous?.text !== current?.text || previous?.styleJson !== current?.styleJson) changed.set(address, current ?? { text: null, styleJson: null })
  }
  return changed
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 16384) binary += String.fromCharCode(...bytes.subarray(start, start + 16384))
  return btoa(binary)
}

export async function compressSnapshot(json: string): Promise<string> {
  const bytes = new TextEncoder().encode(json)
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES) throw new Error('This sheet exceeds the 50 MB editor data limit.')
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return base64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export function compressedParts(encoded: string): string[] {
  return Array.from({ length: Math.ceil(encoded.length / MAX_COMPRESSED_PART_CHARS) }, (_, index) => encoded.slice(index * MAX_COMPRESSED_PART_CHARS, (index + 1) * MAX_COMPRESSED_PART_CHARS))
}

export async function decompressSnapshot(encoded: string, expectedBytes: number): Promise<string> {
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_SNAPSHOT_BYTES
    || !encoded.length || encoded.length > MAX_ENCODED_SNAPSHOT_CHARS
    || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(encoded.slice(0, encoded.length - padding))) throw new Error('The saved compressed sheet is invalid.')
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > expectedBytes) throw new Error('The saved sheet exceeds its declared size.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  if (total !== expectedBytes) throw new Error('The saved compressed sheet is incomplete.')
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(output)
}

export function applyCellEdits(sheet: FirestoreWorkbookSheet, edits: Map<string, CellEdit>): FirestoreWorkbookSheet {
  const snapshot = deserializeWorkbookState(sheet.json, {})
  const texts = new Map(snapshot.cellTextOverrides.get(sheet.name))
  const styles = new Map(snapshot.cellStyleOverrides.get(sheet.name))
  for (const [address, edit] of edits) {
    if (!validCellAddress(address) || (edit.text !== null && typeof edit.text !== 'string') || (edit.styleJson !== null && typeof edit.styleJson !== 'string')) throw new Error('A saved cell edit is invalid.')
    if (edit.text === null) texts.delete(address)
    else texts.set(address, edit.text)
    if (edit.styleJson === null) styles.delete(address)
    else {
      const style: unknown = JSON.parse(edit.styleJson)
      if (!style || typeof style !== 'object' || Array.isArray(style)) throw new Error('A saved cell style is invalid.')
      styles.set(address, style)
    }
  }
  snapshot.cellTextOverrides.set(sheet.name, texts)
  snapshot.cellStyleOverrides.set(sheet.name, styles)
  const json = serializeWorkbookState(snapshot)
  // The normal snapshot validator checks the restored cell styles and maps.
  deserializeWorkbookState(json, {})
  return { ...sheet, json, byteLength: new TextEncoder().encode(json).byteLength }
}
