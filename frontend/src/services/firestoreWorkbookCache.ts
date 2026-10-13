import { app } from '../firebase'
import type { FirestoreWorkbookSheet } from '../utils/firestoreWorkbookState'
import { hashSnapshot, MAX_SNAPSHOT_BYTES, validCellAddress, type CellEdit } from '../utils/firestoreWorkbookSnapshots'
import { deleteWorkbookFileCache, readWorkbookFileCache, workbookFileCacheKey, writeWorkbookFileCache } from './departmentWorkbookCache'

export interface CachedFirestoreSheet extends FirestoreWorkbookSheet {
  metadataKey: string
  edits: [string, CellEdit][]
  hash: string
}

export interface CachedFirestoreWorkbook {
  version: 1
  manifestKey: string
  sheets: CachedFirestoreSheet[]
}

function key(userId: string, path: string): string {
  return workbookFileCacheKey(JSON.stringify(['firestore-v3', app.options.projectId, app.name, userId]), path, 'snapshot-v1')
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function firestoreManifestCacheKey(data: Record<string, unknown>): string {
  return JSON.stringify([data.schemaVersion, data.workbookId, data.revision, data.revisionId, data.sheetIds, data.sheetNames,
    data.sheetSlots, data.sheetRevisionIds, data.cellCounts, data.selectedSheet, data.selectionJson])
}

export function firestoreSheetCacheKey(slot: string, metadata: Record<string, unknown>): string {
  return JSON.stringify([slot, metadata.name, metadata.encoding, metadata.revisionId, metadata.jsonByteLength, metadata.encodedLength,
    metadata.jsonHash, metadata.baseHash, metadata.partCount, metadata.partSlots, metadata.partRevisionIds, metadata.partHashes])
}

export async function readFirestoreWorkbookCache(userId: string, path: string, manifestKey: string): Promise<CachedFirestoreWorkbook | null> {
  try {
    const blob = await readWorkbookFileCache(key(userId, path))
    if (!blob || blob.size > 150 * 1024 * 1024) return null
    const value: unknown = JSON.parse(await blob.text())
    if (!record(value) || value.version !== 1 || value.manifestKey !== manifestKey || !Array.isArray(value.sheets) || value.sheets.length > 1000) return null
    const sheets: CachedFirestoreSheet[] = []
    let bytes = 0
    for (const [index, sheet] of value.sheets.entries()) {
      if (!record(sheet) || sheet.id !== `sheet_${index}` || typeof sheet.name !== 'string' || typeof sheet.json !== 'string'
        || typeof sheet.byteLength !== 'number' || sheet.byteLength < 1 || new TextEncoder().encode(sheet.json).byteLength !== sheet.byteLength
        || typeof sheet.metadataKey !== 'string' || typeof sheet.hash !== 'string' || !Array.isArray(sheet.edits)
        || await hashSnapshot(sheet.json) !== sheet.hash) return null
      bytes += sheet.byteLength
      if (bytes > MAX_SNAPSHOT_BYTES) return null
      const edits: [string, CellEdit][] = []
      const addresses = new Set<string>()
      for (const entry of sheet.edits) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !validCellAddress(entry[0]) || addresses.has(entry[0])
          || !record(entry[1]) || (entry[1].text !== null && typeof entry[1].text !== 'string')
          || (entry[1].styleJson !== null && typeof entry[1].styleJson !== 'string')) return null
        addresses.add(entry[0])
        edits.push([entry[0], { text: entry[1].text, styleJson: entry[1].styleJson }])
      }
      sheets.push({ id: sheet.id, name: sheet.name, json: sheet.json, byteLength: sheet.byteLength, metadataKey: sheet.metadataKey, hash: sheet.hash, edits })
    }
    return { version: 1, manifestKey, sheets }
  } catch { return null }
}

export async function writeFirestoreWorkbookCache(userId: string, path: string, snapshot: CachedFirestoreWorkbook): Promise<void> {
  try {
    // One slot per account and term replaces older revisions, including deleted sheets.
    await writeWorkbookFileCache(key(userId, path), new Blob([JSON.stringify(snapshot)], { type: 'application/json' }))
  } catch { /* A full, blocked or unavailable browser cache must not fail Save. */ }
}

export async function deleteFirestoreWorkbookCache(userId: string, path: string): Promise<void> {
  await deleteWorkbookFileCache(key(userId, path))
}
