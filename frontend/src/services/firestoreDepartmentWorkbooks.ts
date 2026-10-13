import { collection, doc, documentId, getCountFromServer, getDocFromServer, getDocsFromServer, query, where, runTransaction, serverTimestamp, setDoc, type DocumentReference, type DocumentData } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { workbookTermPaths, type DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { canEditDepartmentWorkbook } from '../utils/departmentWorkbookPermissions'
import { joinFirestoreWorkbookState, type FirestoreWorkbookManifest, type FirestoreWorkbookSheet } from '../utils/firestoreWorkbookState'
import { withDeadline } from '../utils/withDeadline'
import { applyCellEdits, changedCellEdits, compressedParts, compressSnapshot, decompressSnapshot, hashSnapshot, prepareSnapshotSheets, validCellAddress, MAX_CELL_PATCH_BYTES, MAX_COMPRESSED_PART_CHARS, MAX_ENCODED_SNAPSHOT_CHARS, MAX_SNAPSHOT_BYTES, type PreparedSnapshotSheet, type CellEdit } from '../utils/firestoreWorkbookSnapshots'
import { prepareWorkbookScheduleWrites } from './workbookScheduleWrites'
import { cleanupUnusedWorkbookSheets } from './workbookSheetCleanup'
import { deleteFirestoreWorkbookCache, firestoreManifestCacheKey, firestoreSheetCacheKey, readFirestoreWorkbookCache, writeFirestoreWorkbookCache, type CachedFirestoreWorkbook } from './firestoreWorkbookCache'
import type { WorkbookScheduleRow } from '../utils/excelScheduleRows'
import { describeWorkbookSave } from '../utils/workbookAudit'

export interface SavedFirestoreDepartmentWorkbook {
  fileName: string
  revision: number
  revisionId: string
  /** A missing-data recovery must rewrite text instead of reusing its hashes. */
  needsRepair?: boolean
  /** Save succeeded, but physical deletion needs another Save to retry. */
  cleanupWarning?: string
}

export interface LoadedFirestoreDepartmentWorkbook extends SavedFirestoreDepartmentWorkbook {
  editorState: string
}

export interface FirestoreWorkbookSaveProgress {
  stage: 'preparing' | 'saving' | 'committing' | 'cleaning'
  completed: number
  total: number
}

interface FirestoreWorkbookSaveOptions {
  onProgress?: (progress: FirestoreWorkbookSaveProgress) => void
  onMetrics?: (metrics: FirestoreWorkbookSaveMetrics) => void
  forceSnapshots?: boolean
  startedAt?: number
  scheduleRows?: readonly WorkbookScheduleRow[]
  imported?: boolean
}

export interface FirestoreWorkbookSaveMetrics {
  preparationMs: number
  firestoreMs: number
  totalMs: number
  uploadedBytes: number
  rawSheetBytes: number
  snapshotChunks: number
  cellWrites: number
  documentWrites: number
  mode: 'atomic' | 'staged'
}

export class MissingFirestoreDepartmentWorkbookError extends Error {
  readonly previous: SavedFirestoreDepartmentWorkbook

  constructor(previous: SavedFirestoreDepartmentWorkbook) {
    super('Some saved sheets or chunks were deleted. Import an .xlsx again, then Save to replace the missing workbook data.')
    this.name = 'MissingFirestoreDepartmentWorkbookError'
    this.previous = { ...previous, needsRepair: true }
  }
}

async function readRequiredSheets<T>(reads: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(reads)
  // Do not offer replacement when another sheet failed for a different reason.
  for (const result of results) {
    if (result.status === 'rejected' && !(result.reason instanceof MissingFirestoreDepartmentWorkbookError)) throw result.reason
  }
  return results.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  })
}

type SheetSlot = 'a' | 'b'
const SAVE_LEASE_MS = 10 * 60 * 1000
const SAVE_REQUEST_MS = 90 * 1000
const SAVE_LIMIT_MS = 8 * 60 * 1000
const CLEANUP_LIMIT_MS = 3000
const SAVE_CONCURRENCY = 4
const ATOMIC_BYTES = 4 * 1024 * 1024
const ATOMIC_SHEETS = 6
const MAX_CELL_WRITES = 128

interface SnapshotCache {
  path: string
  userId: string
  revision: number
  revisionId: string
  manifest: Record<string, unknown>
  parents: Map<string, { data: Record<string, unknown>; slot: SheetSlot }>
  sheets: PreparedSnapshotSheet[]
  cellAddresses: Map<string, Set<string>>
}
// Only the most recently opened/saved workbook is retained, scoped to its user
// and revision. The transaction rechecks that revision before every commit.
let snapshotCache: SnapshotCache | null = null

async function persistSnapshot(cache: SnapshotCache): Promise<void> {
  try {
    if (auth.currentUser?.uid !== cache.userId) return
    const sheets = await Promise.all(cache.sheets.map(async sheet => {
      const parent = cache.parents.get(sheet.id)
      const metadata = parent && record(parent.data.slots) ? parent.data.slots[parent.slot] : undefined
      if (!parent || !record(metadata)) throw new Error('Missing cached sheet metadata.')
      return { id: sheet.id, name: sheet.name, json: sheet.json, byteLength: sheet.byteLength,
        metadataKey: firestoreSheetCacheKey(parent.slot, metadata), hash: await hashSnapshot(sheet.json),
        edits: [...(cache.cellAddresses.get(sheet.id) ?? [])].map(address => [address, sheet.edits.get(address) ?? { text: null, styleJson: null }] as [string, CellEdit]) }
    }))
    if (auth.currentUser?.uid !== cache.userId) return
    await writeFirestoreWorkbookCache(cache.userId, cache.path, { version: 1, manifestKey: firestoreManifestCacheKey(cache.manifest), sheets })
  } catch { /* Persistence is optional; cloud loading and saving remain authoritative. */ }
}

export function firestoreWorkbookPath(term: DepartmentWorkbookTerm): string {
  return workbookTermPaths(term).document
}

function legacyWorkbookPath(term: DepartmentWorkbookTerm): string {
  return workbookTermPaths(term).legacyDocument
}

function previousWorkbookPaths(term: DepartmentWorkbookTerm): string[] {
  const paths = workbookTermPaths(term)
  return [...new Set([paths.previousDocument, paths.namedLegacyDocument, paths.legacyDocument])]
}

async function workbookDocumentId(path: string): Promise<string> {
  return `workbook_${await textHash(path)}`
}

async function textHash(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

interface ChunkReferences {
  partSlots: SheetSlot[]
  partRevisionIds: string[]
  partHashes: string[]
}

function chunkReferences(metadata: Record<string, unknown>): ChunkReferences | null {
  if (metadata.partSlots === undefined && metadata.partRevisionIds === undefined && metadata.partHashes === undefined) return null
  const { partCount, partSlots, partRevisionIds, partHashes } = metadata
  if (!Number.isSafeInteger(partCount) || typeof partCount !== 'number' || partCount < 1 || partCount > 1000
    || !Array.isArray(partSlots) || !Array.isArray(partRevisionIds) || !Array.isArray(partHashes)
    || partSlots.length !== partCount || partRevisionIds.length !== partCount || partHashes.length !== partCount
    || partSlots.some(slot => slot !== 'a' && slot !== 'b')
    || partRevisionIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))
    || partHashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('A saved sheet has invalid chunk references. Reopen the workbook.')
  return { partSlots, partRevisionIds, partHashes }
}

function checkAccount(userId: string) {
  if (auth.currentUser?.uid !== userId) throw new Error('Your account changed. Reopen the workbook.')
}

function permissionError(caught: unknown): never {
  if (caught && typeof caught === 'object' && 'code' in caught && caught.code === 'permission-denied') {
    throw new Error('Firestore denied access to the workbook. Deploy the updated firestore.rules and check your membership and semester phase.')
  }
  throw caught
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function timestampMillis(value: unknown): number {
  if (record(value) && typeof value.toMillis === 'function') return value.toMillis()
  return Number.NaN
}

export function loadFirestoreDepartmentWorkbook(term: DepartmentWorkbookTerm, onProgress?: (message: string) => void): Promise<LoadedFirestoreDepartmentWorkbook | null> {
  let active = true
  return withDeadline(readWorkbook(term, message => { if (active) onProgress?.(message) }), 30000, 'Opening the Firestore workbook took too long. Check your connection and try again.')
    .finally(() => { active = false })
}

async function readWorkbook(term: DepartmentWorkbookTerm, onProgress?: (message: string) => void): Promise<LoadedFirestoreDepartmentWorkbook | null> {
  const userId = auth.currentUser?.uid
  let path = ''
  try {
    if (!userId) throw new Error('Sign in again before opening the workbook.')
    onProgress?.('Checking the latest workbook in Firestore…')
    path = firestoreWorkbookPath(term)
    let snapshot = await getDocFromServer(doc(db, path))
    for (const previousPath of previousWorkbookPaths(term)) {
      if (snapshot.exists()) break
      path = previousPath
      snapshot = await getDocFromServer(doc(db, path))
    }
    checkAccount(userId)
    if (!snapshot.exists()) {
      snapshotCache = null
      await Promise.all([firestoreWorkbookPath(term), ...previousWorkbookPaths(term)].map(candidate => deleteFirestoreWorkbookCache(userId, candidate)))
      onProgress?.('Opening an empty workbook…')
      return null
    }
    const data = snapshot.data()
    if (data.schemaVersion === 1 && typeof data.workbookPath === 'string') {
      const { loadDepartmentWorkbook, MissingDepartmentWorkbookError } = await import('./departmentWorkbooks')
      try {
        let source = 'saved workbook files'
        const saved = await loadDepartmentWorkbook(term, stage => {
          if (stage === 'cached') source = 'workbook from cache'
          if (stage === 'downloading') source = 'downloaded workbook'
          onProgress?.(stage === 'checking' ? 'Checking saved workbook files…' : stage === 'downloading' ? 'Downloading workbook files…' : 'Preparing workbook from cache…')
        })
        checkAccount(userId)
        if (!saved || saved.revision !== data.revision || typeof data.revisionId !== 'string') throw new Error('The workbook changed while loading. Open it again.')
        onProgress?.(`Preparing ${source}…`)
        const [{ deserializeWorkbookState }, { serializeFirestoreWorkbookState }, { parseExcelPreviewStyles }] = await Promise.all([
          import('../utils/excelWorkbookState'), import('../utils/firestoreWorkbookState'), import('../utils/excelPreviewStyles'),
        ])
        const styles = parseExcelPreviewStyles(await saved.file.arrayBuffer())
        checkAccount(userId)
        const editorState = serializeFirestoreWorkbookState(deserializeWorkbookState(saved.editorState, styles.files))
        onProgress?.(`Opening ${source}…`)
        return { fileName: saved.fileName, revision: saved.revision, revisionId: data.revisionId, editorState }
      } catch (caught) {
        if (caught instanceof MissingDepartmentWorkbookError && typeof data.revisionId === 'string') {
          throw new MissingFirestoreDepartmentWorkbookError({ fileName: data.fileName, revision: data.revision, revisionId: data.revisionId })
        }
        throw caught
      }
    }
    if (data.schemaVersion !== 3 || typeof data.fileName !== 'string' || !Number.isSafeInteger(data.revision) || data.revision < 1
      || typeof data.revisionId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(data.revisionId)
      || !Array.isArray(data.sheetIds) || data.sheetIds.length > 1000
      || data.sheetIds.some((id: unknown, index: number) => id !== `sheet_${index}`)
      || !Array.isArray(data.sheetNames) || data.sheetNames.some((name: unknown) => typeof name !== 'string')
      || data.sheetNames.length !== data.sheetIds.length || typeof data.selectedSheet !== 'string' || typeof data.selectionJson !== 'string') throw new Error('The saved Firestore workbook is invalid.')
    const manifest: FirestoreWorkbookManifest = { sheetIds: data.sheetIds, sheetNames: data.sheetNames, selectedSheet: data.selectedSheet, selectionJson: data.selectionJson }
    const previous: SavedFirestoreDepartmentWorkbook = { fileName: data.fileName, revision: data.revision, revisionId: data.revisionId }
    let sheets: FirestoreWorkbookSheet[]
    let cacheHit = false
    let cachedSheetCount = 0
    let loadedCache: Pick<SnapshotCache, 'parents' | 'cellAddresses'> | undefined
    try {
      onProgress?.('Checking the workbook cache…')
      const cached = await readFirestoreWorkbookCache(userId, path, firestoreManifestCacheKey(data))
      checkAccount(userId)
      const loaded = await readCompressedSheets(term, path, data, manifest, previous, cached, onProgress)
      sheets = loaded.sheets
      loadedCache = loaded
      cacheHit = loaded.cacheHit
      cachedSheetCount = loaded.cachedSheetCount
    } catch (caught) {
      // Missing data can be replaced only against the same term revision.
      // Access, network, and malformed-data errors remain blocking errors.
      if (caught instanceof MissingFirestoreDepartmentWorkbookError) {
        checkAccount(userId)
        const latest = (await getDocFromServer(doc(db, path))).data()
        checkAccount(userId)
        if (latest?.revisionId !== previous.revisionId) throw new Error('The workbook changed while loading. Try opening it again.')
      }
      throw caught
    }
    checkAccount(userId)
    onProgress?.('Confirming the latest workbook revision in Firestore…')
    const latest = (await getDocFromServer(doc(db, path))).data()
    if (latest?.revisionId !== data.revisionId) throw new Error('The workbook changed while loading. Try opening it again.')
    const source = !sheets.length ? 'empty workbook' : cachedSheetCount === sheets.length ? 'workbook from cache'
      : cachedSheetCount ? 'workbook from cached and downloaded sheets' : 'downloaded workbook'
    onProgress?.(`Preparing ${source}…`)
    const editorState = joinFirestoreWorkbookState(manifest, sheets)
    if (loadedCache) {
      const prepared = await prepareSnapshotSheets(editorState)
      checkAccount(userId)
      snapshotCache = { ...loadedCache, path, userId, revision: data.revision, revisionId: data.revisionId, manifest: data, sheets: prepared.sheets }
      if (!cacheHit) {
        onProgress?.('Updating the workbook cache…')
        await persistSnapshot(snapshotCache)
      }
    }
    checkAccount(userId)
    onProgress?.(`Opening ${source}…`)
    return { fileName: data.fileName, revision: data.revision, revisionId: data.revisionId, editorState }
  } catch (caught) {
    snapshotCache = null
    if (userId && path) await deleteFirestoreWorkbookCache(userId, path)
    return permissionError(caught)
  }
}

async function readCompressedSheets(term: DepartmentWorkbookTerm, path: string, data: Record<string, unknown>, manifest: FirestoreWorkbookManifest, previous: SavedFirestoreDepartmentWorkbook, cached: CachedFirestoreWorkbook | null = null, onProgress?: (message: string) => void) {
  const workbookId = await workbookDocumentId(legacyWorkbookPath(term))
  const slots = data.sheetSlots, revisions = data.sheetRevisionIds, counts = data.cellCounts
  if (data.workbookId !== workbookId || !Array.isArray(slots) || !Array.isArray(revisions) || !Array.isArray(counts)
    || slots.length !== manifest.sheetIds.length || revisions.length !== slots.length || counts.length !== slots.length
    || slots.some(slot => slot !== 'a' && slot !== 'b') || revisions.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))
    || counts.some(count => !Number.isSafeInteger(count) || count < 0)) throw new Error('The saved compressed workbook index is invalid.')
  const parents: SnapshotCache['parents'] = new Map()
  const cellAddresses: SnapshotCache['cellAddresses'] = new Map()
  let cacheHit = Boolean(cached && cached.sheets.length === manifest.sheetIds.length)
  let cachedSheetCount = 0
  // Sheets load concurrently. Report active work across all sheets so one
  // completed cache hit cannot hide another sheet's ongoing download.
  const stages: ('checking' | 'downloading' | 'preparing' | 'ready')[] = manifest.sheetIds.map(() => 'checking')
  const report = () => {
    const ready = stages.filter(stage => stage === 'ready').length
    const action = stages.includes('downloading') ? 'Downloading sheets from Firestore'
      : stages.includes('checking') ? cached ? 'Checking cached sheets against Firestore' : 'Checking saved sheets in Firestore'
      : stages.includes('preparing') ? 'Preparing downloaded sheets' : null
    if (action) onProgress?.(`${action}… (${ready}/${stages.length} ready)`)
  }
  report()
  let totalBytes = 0
  const sheets = await readRequiredSheets(manifest.sheetIds.map(async (sheetId, index) => {
    const sheetPath = `sheets/${workbookId}_${sheetId}`
    const saved = await getDocFromServer(doc(db, sheetPath))
    if (!saved.exists()) throw new MissingFirestoreDepartmentWorkbookError(previous)
    const parent = saved.data()
    const slot = slots[index] as SheetSlot
    const metadata = record(parent?.slots) ? parent.slots[slot] : undefined
    if (parent?.schemaVersion !== 3 || parent.workbookId !== workbookId || parent.sourceWorkbook !== path || parent.sheetId !== sheetId || parent.sheetIndex !== index
      || !record(metadata) || metadata.revisionId !== revisions[index] || metadata.name !== manifest.sheetNames[index]
      || metadata.encoding !== 'gzip-base64' || typeof metadata.jsonHash !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.jsonHash)
      || typeof metadata.baseHash !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.baseHash)
      || typeof metadata.jsonByteLength !== 'number' || !Number.isSafeInteger(metadata.jsonByteLength) || metadata.jsonByteLength < 1 || metadata.jsonByteLength > MAX_SNAPSHOT_BYTES
      || typeof metadata.encodedLength !== 'number' || !Number.isSafeInteger(metadata.encodedLength) || metadata.encodedLength < 1 || metadata.encodedLength > MAX_ENCODED_SNAPSHOT_CHARS) throw new Error('A saved compressed sheet is invalid.')
    const refs = chunkReferences(metadata)
    if (!refs) throw new Error('A saved compressed sheet is missing its chunk index.')
    totalBytes += metadata.jsonByteLength
    if (totalBytes > MAX_SNAPSHOT_BYTES) throw new Error('The saved workbook exceeds the 50 MB editor data limit.')
    const downloadChunks = async () => {
      stages[index] = 'downloading'
      report()
      const chunks = await readRequiredSheets(refs.partSlots.map(async (partSlot, partIndex) => {
        const chunk = await getDocFromServer(doc(db, sheetPath, 'chunks', `part_${partIndex}`))
        if (!chunk.exists()) throw new MissingFirestoreDepartmentWorkbookError(previous)
        const content = chunk.data()
        const part = record(content?.slots) ? content.slots[partSlot] : undefined
        if (content?.schemaVersion !== 3 || content.workbookId !== workbookId || content.sourceWorkbook !== path || content.sheetId !== sheetId
          || content.sheetIndex !== index || content.partIndex !== partIndex || !record(part) || part.encoding !== 'gzip-base64'
          || part.revisionId !== refs.partRevisionIds[partIndex] || typeof part.data !== 'string' || !part.data.length || part.data.length > MAX_COMPRESSED_PART_CHARS
          || part.byteLength !== part.data.length || await hashSnapshot(part.data) !== refs.partHashes[partIndex]) throw new Error('A saved compressed sheet chunk is invalid.')
        return part.data
      }))
      stages[index] = 'checking'
      report()
      return chunks
    }
    const candidate = cached?.sheets[index]
    const cachedSheet = candidate?.id === sheetId && candidate.name === manifest.sheetNames[index]
      && candidate.metadataKey === firestoreSheetCacheKey(slot, metadata) ? candidate : undefined
    const chunksPromise = cachedSheet ? (async () => {
      // Aggregate only the required chunk IDs: old extra chunks cannot hide a
      // deleted active part. This checks live access/existence without payloads.
      for (let offset = 0; offset < refs.partSlots.length; offset += 30) {
        const ids = refs.partSlots.slice(offset, offset + 30).map((_, index) => `part_${offset + index}`)
        const count = await getCountFromServer(query(collection(db, sheetPath, 'chunks'), where(documentId(), 'in', ids)))
        if (count.data().count !== ids.length) throw new MissingFirestoreDepartmentWorkbookError(previous)
      }
      return null
    })() : downloadChunks()
    const cellsPromise = getDocsFromServer(query(collection(db, sheetPath, 'cells'), where('baseRevisionId', '==', metadata.revisionId)))
    const results = await Promise.allSettled([chunksPromise, cellsPromise])
    for (const result of results) {
      if (result.status === 'rejected' && !(result.reason instanceof MissingFirestoreDepartmentWorkbookError)) throw result.reason
    }
    const [chunkResult, cellResult] = results
    if (chunkResult.status === 'rejected') throw chunkResult.reason
    if (cellResult.status === 'rejected') throw cellResult.reason
    const cells = cellResult.value
    if (cells.docs.length < counts[index]) throw new MissingFirestoreDepartmentWorkbookError(previous)
    if (cells.docs.length !== counts[index]) throw new Error('The saved cell edits changed while loading. Open the workbook again.')
    const edits = new Map<string, CellEdit>()
    for (const cell of cells.docs) {
      const edit = cell.data()
      if (edit.schemaVersion !== 3 || edit.workbookId !== workbookId || edit.sourceWorkbook !== path || edit.sheetId !== sheetId || edit.sheetIndex !== index
        || !validCellAddress(cell.id) || edit.baseRevisionId !== metadata.revisionId || !Number.isSafeInteger(edit.revision) || edit.revision < 1 || edit.revision > previous.revision
        || (edit.text !== null && typeof edit.text !== 'string') || (edit.styleJson !== null && typeof edit.styleJson !== 'string')) throw new Error('A saved cell edit is invalid. Open the workbook again.')
      edits.set(cell.id, { text: edit.text, styleJson: edit.styleJson })
    }
    const cachedEdits = new Map(cachedSheet?.edits)
    const sameEdits = cachedSheet && edits.size === cachedEdits.size && [...edits].every(([address, edit]) => {
      const cached = cachedEdits.get(address)
      return cached && cached.text === edit.text && cached.styleJson === edit.styleJson
    })
    let sheet: FirestoreWorkbookSheet
    if (cachedSheet && sameEdits) {
      sheet = { id: sheetId, name: cachedSheet.name, json: cachedSheet.json, byteLength: cachedSheet.byteLength }
      cachedSheetCount++
    } else {
      cacheHit = false
      const chunks = chunkResult.value ?? await downloadChunks()
      stages[index] = 'preparing'
      report()
      const encoded = chunks.join('')
      if (encoded.length !== metadata.encodedLength) throw new Error('A saved compressed sheet is incomplete.')
      const json = await decompressSnapshot(encoded, metadata.jsonByteLength)
      if (await hashSnapshot(json) !== metadata.jsonHash) throw new Error('A saved compressed sheet has invalid text.')
      sheet = applyCellEdits({ id: sheetId, name: manifest.sheetNames[index], json, byteLength: metadata.jsonByteLength }, edits)
    }
    parents.set(sheetId, { data: parent, slot })
    cellAddresses.set(sheetId, new Set(edits.keys()))
    stages[index] = 'ready'
    report()
    return sheet
  }))
  return { sheets, parents, cellAddresses, cacheHit, cachedSheetCount }
}

interface SnapshotWrite {
  ref: DocumentReference<DocumentData>
  data: Record<string, unknown>
  fields?: string[]
  kind: 'chunk' | 'parent' | 'cell'
}

export async function saveFirestoreDepartmentWorkbook(term: DepartmentWorkbookTerm, fileName: string, editorState: string, previous: SavedFirestoreDepartmentWorkbook | null, options: FirestoreWorkbookSaveOptions = {}): Promise<SavedFirestoreDepartmentWorkbook> {
  const startedAt = options.startedAt ?? performance.now()
  const user = auth.currentUser
  if (!user) throw new Error('Sign in again before saving the workbook.')
  if (!term.membershipId) throw new Error('An accepted department membership is required to save.')
  if (!/\.xlsx$/i.test(fileName) || fileName.length > 255) throw new Error('Use an .xlsx filename of no more than 255 characters.')
  if (previous && (!Number.isSafeInteger(previous.revision) || previous.revision < 1)) throw new Error('Reopen the workbook before saving.')
  const path = firestoreWorkbookPath(term)
  const legacyPath = legacyWorkbookPath(term)
  const previousPaths = previousWorkbookPaths(term)
  const target = doc(db, path), lockRef = doc(db, `${path}/saveLocks/current`)
  const revision = (previous?.revision ?? 0) + 1, revisionId = crypto.randomUUID()
  const stopAt = Date.now() + SAVE_LIMIT_MS
  const timeoutMessage = 'Saving took too long. Your edits are still here. Check your connection and reopen the semester to check the saved version before retrying.'
  let stopped = false, leaseAttempted = false, completed = 0, total = 0
  let failure: unknown
  const check = () => {
    if (!stopped && Date.now() >= stopAt) { stopped = true; failure = new Error(timeoutMessage) }
    if (stopped) throw failure
    checkAccount(user.uid)
  }
  const wait = async <T>(operation: () => Promise<T>): Promise<T> => {
    check()
    try {
      const result = await withDeadline(operation(), Math.min(SAVE_REQUEST_MS, stopAt - Date.now()), timeoutMessage)
      check()
      return result
    } catch (caught) { stopped = true; failure = caught; throw caught }
  }
  const progress = (stage: FirestoreWorkbookSaveProgress['stage']) => options.onProgress?.({ stage, completed, total })
  const cleanup = () => withDeadline(runTransaction(db, async transaction => {
    const lock = await transaction.get(lockRef)
    if (lock.data()?.saveId === revisionId && lock.data()?.status === 'saving') transaction.set(lockRef, { ...lock.data(), status: 'idle' })
  }), CLEANUP_LIMIT_MS, 'Save lock cleanup took too long.').catch(() => {})
  try {
    progress('preparing')
    const prepared = await wait(() => prepareSnapshotSheets(editorState))
    const workbookId = await workbookDocumentId(legacyPath)
    const scheduleRows = options.scheduleRows
    const scheduleWrites = scheduleRows ? await wait(() => prepareWorkbookScheduleWrites(term, scheduleRows, path, [path, ...previousPaths])) : undefined
    let cache = snapshotCache?.path === path && snapshotCache.userId === user.uid && snapshotCache.revision === previous?.revision
      && snapshotCache.revisionId === previous?.revisionId && !previous?.needsRepair ? snapshotCache : null
    if (previous && !cache && !previous.needsRepair) {
      // A cold save must establish a trusted baseline; subsequent saves use the
      // loaded revision in memory and need no sheet/chunk reads before commit.
      const loaded = await wait(() => loadFirestoreDepartmentWorkbook(term))
      if (!loaded || loaded.revision !== previous.revision || loaded.revisionId !== previous.revisionId) throw new Error('Someone saved a newer version of this workbook. Reopen it before saving again.')
      cache = snapshotCache?.path === path && snapshotCache.revisionId === previous.revisionId ? snapshotCache : null
    }
    // Removed sheets may await cleanup and are not active generations.
    // Reusing those IDs starts with the same default slot as the rules.
    const activeSheetIds = new Set(cache?.sheets.map(sheet => sheet.id))
    const parents: SnapshotCache['parents'] = new Map([...(cache?.parents ?? [])].filter(([id]) => activeSheetIds.has(id)))
    if (!cache && previous) {
      let current = await wait(() => getDocFromServer(target))
      for (const previousPath of previousPaths) {
        if (current.exists()) break
        current = await wait(() => getDocFromServer(doc(db, previousPath)))
      }
      const oldManifest = current.data()
      if (oldManifest?.revision !== previous.revision || oldManifest?.revisionId !== previous.revisionId) throw new Error('Someone saved a newer version of this workbook. Reopen it before saving again.')
      await wait(() => Promise.all(prepared.sheets.map(async (sheet, index) => {
        const parent = await getDocFromServer(doc(db, 'sheets', `${workbookId}_${sheet.id}`))
        const data = parent.data()
        if (parent.exists()) {
          if (![2, 3].includes(data?.schemaVersion) || data?.workbookId !== workbookId || ![path, ...previousPaths].includes(data.sourceWorkbook)) throw new Error('A saved sheet document is invalid. Reopen the workbook.')
          const referenced = oldManifest.schemaVersion !== 3 || index < oldManifest.sheetIds.length
          parents.set(sheet.id, { data: referenced ? data : {}, slot: oldManifest.schemaVersion === 3 ? oldManifest.sheetSlots[index] ?? 'b' : oldManifest.slot ?? 'b' })
        } else {
          // A manually deleted parent still has an active slot in the term.
          // Recovery must preserve that slot until the replacement commits.
          parents.set(sheet.id, { data: {}, slot: oldManifest.schemaVersion === 3 ? oldManifest.sheetSlots[index] ?? 'b' : oldManifest.slot ?? 'b' })
        }
      })))
    }
    const identity = { schemaVersion: 3, workbookId, sourceWorkbook: path, departmentId: term.departmentId, departmentCode: term.departmentCode,
      academicYearId: term.academicYearId, semester: term.semester }
    const sheetSlots: SheetSlot[] = [], sheetRevisionIds: string[] = [], cellCounts: number[] = []
    const nextAddresses: SnapshotCache['cellAddresses'] = new Map()
    const writes: SnapshotWrite[] = []
    const previousSheets = new Map(cache?.sheets.map(sheet => [sheet.id, sheet]))
    const plans = prepared.sheets.map((sheet, index) => {
      const old = previousSheets.get(sheet.id)
      const parent = parents.get(sheet.id)
      const value = parent && record(parent.data.slots) ? parent.data.slots[parent.slot] : undefined
      const metadata = record(value) ? value : undefined
      const changes = old ? changedCellEdits(old.edits, sheet.edits) : new Map<string, CellEdit>()
      const fold = !cache || !old || !metadata || old.baseHash !== sheet.baseHash || changes.size > MAX_CELL_WRITES || (options.forceSnapshots && changes.size > 0)
        || [...changes.values()].some(edit => new TextEncoder().encode(JSON.stringify(edit)).byteLength > MAX_CELL_PATCH_BYTES)
      return { sheet, index, parent, metadata, changes, fold }
    })
    // The rules limit document lookups per atomic request. A large paste or
    // many edited sheets folds edits into compressed bases instead of staging
    // thousands of independently visible cell records.
    const touched = plans.filter(plan => plan.fold || plan.changes.size)
    const tooManyCells = plans.reduce((sum, plan) => sum + (plan.fold ? 0 : plan.changes.size), 0) > MAX_CELL_WRITES
    if (touched.length > ATOMIC_SHEETS || tooManyCells) for (const plan of touched) plan.fold = true
    for (const plan of plans) {
      check()
      const { sheet, index, parent, metadata, changes } = plan
      const sheetPath = `sheets/${workbookId}_${sheet.id}`
      if (!plan.fold && parent && metadata) {
        sheetSlots.push(parent.slot)
        sheetRevisionIds.push(metadata.revisionId as string)
        const addresses = new Set(cache?.cellAddresses.get(sheet.id))
        for (const [address, edit] of changes) {
          addresses.add(address)
          writes.push({ ref: doc(db, sheetPath, 'cells', address), kind: 'cell', data: { ...identity, sheetId: sheet.id, sheetIndex: index,
            baseRevisionId: metadata.revisionId, revision, revisionId, ...edit, savedBy: user.uid, membershipId: term.membershipId, updatedAt: serverTimestamp() } })
        }
        nextAddresses.set(sheet.id, addresses)
        cellCounts.push(addresses.size)
        continue
      }
      const encoded = await wait(() => compressSnapshot(sheet.json))
      const parts = compressedParts(encoded)
      const slot: SheetSlot = parent?.slot === 'a' ? 'b' : 'a'
      const refs = metadata ? chunkReferences(metadata) : null
      const partSlots: SheetSlot[] = [], partRevisionIds: string[] = [], partHashes: string[] = []
      for (const [partIndex, data] of parts.entries()) {
        const partSlot: SheetSlot = (refs?.partSlots[partIndex] ?? parent?.slot ?? 'b') === 'a' ? 'b' : 'a'
        partSlots.push(partSlot); partRevisionIds.push(revisionId); partHashes.push(await hashSnapshot(data))
        const payload = { ...identity, sheetId: sheet.id, sheetIndex: index, partIndex,
          slots: { [partSlot]: { encoding: 'gzip-base64', data, byteLength: data.length, revisionId,
            savedBy: user.uid, membershipId: term.membershipId, updatedAt: serverTimestamp() } } }
        writes.push({ ref: doc(db, sheetPath, 'chunks', `part_${partIndex}`), kind: 'chunk', data: payload,
          fields: [...Object.keys(payload).filter(key => key !== 'slots'), `slots.${partSlot}`] })
      }
      const nextMetadata = { name: sheet.name, encoding: 'gzip-base64', jsonByteLength: sheet.byteLength, encodedLength: encoded.length,
        jsonHash: await hashSnapshot(sheet.json), baseHash: sheet.baseHash, partCount: parts.length, partSlots, partRevisionIds, partHashes,
        revisionId, savedBy: user.uid, membershipId: term.membershipId, updatedAt: serverTimestamp() }
      const payload = { ...identity, sheetId: sheet.id, sheetIndex: index, slots: { [slot]: nextMetadata } }
      writes.push({ ref: doc(db, sheetPath), kind: 'parent', data: payload,
        fields: [...Object.keys(payload).filter(key => key !== 'slots'), `slots.${slot}`] })
      parents.set(sheet.id, { slot, data: { ...parent?.data, ...payload, slots: { ...(record(parent?.data.slots) ? parent.data.slots : {}), [slot]: nextMetadata } } })
      sheetSlots.push(slot); sheetRevisionIds.push(revisionId); cellCounts.push(0); nextAddresses.set(sheet.id, new Set())
    }
    const uploadBytes = writes.reduce((sum, write) => sum + new TextEncoder().encode(JSON.stringify(write.data)).byteLength, 0)
    const staged = touched.length > ATOMIC_SHEETS || uploadBytes + writes.length * 4096 > ATOMIC_BYTES
    if (staged && writes.some(write => write.kind === 'cell')) return await saveFirestoreDepartmentWorkbook(term, fileName, editorState, previous,
      { ...options, forceSnapshots: true, startedAt })
    const mode = staged ? 'staged' as const : 'atomic' as const
    total = writes.length + 1 + (scheduleWrites?.count ?? 0)
    const preparationMs = performance.now() - startedAt
    const firestoreStarted = performance.now()
    const audit = describeWorkbookSave({ before: cache?.sheets ?? null, after: prepared.sheets, previousFileName: previous?.fileName,
      fileName, previousRevision: previous?.revision ?? 0, imported: options.imported, repaired: previous?.needsRepair,
      schedules: scheduleWrites?.audit })
    const manifestData = { schemaVersion: 3, workbookId, departmentId: term.departmentId, departmentCode: term.departmentCode,
      academicYearId: term.academicYearId, academicYear: term.academicYear, semester: term.semester,
      fileName, ...prepared.manifest, sheetSlots, sheetRevisionIds, cellCounts, revision, revisionId, savedBy: user.uid, membershipId: term.membershipId,
      audit: { ...audit, revisionId, previousRevision: previous?.revision ?? 0 } }
    const validateLatest = (latest: Record<string, unknown> | undefined) => {
      if ((latest?.revision ?? 0) !== (previous?.revision ?? 0) || (previous && latest?.revisionId !== previous.revisionId)) throw new Error('Someone saved a newer version of this workbook. Reopen it before saving again.')
    }
    const checkLease = (lease: Record<string, unknown> | undefined) => {
      const started = timestampMillis(lease?.createdAt)
      if (lease?.status === 'saving' && (!Number.isFinite(started) || started > Date.now() - SAVE_LEASE_MS)) throw new Error('Someone is currently saving this workbook. Wait for that save to finish and try again.')
    }
    const readPrevious = async (transaction: { get: (ref: DocumentReference<DocumentData>) => Promise<{ exists(): boolean; data(): Record<string, unknown> | undefined }> }, current: { exists(): boolean; data(): Record<string, unknown> | undefined }) => {
      if (current.exists()) return current
      let latest = current
      for (const previousPath of previousPaths) {
        const legacy = await transaction.get(doc(db, previousPath))
        if (legacy.exists()) { latest = legacy; break }
      }
      return latest
    }
    const commit = () => runTransaction(db, async transaction => {
      check()
      const [current, lock, year, membership] = await Promise.all([transaction.get(target), transaction.get(lockRef),
        transaction.get(doc(db, 'academicYears', term.academicYearId)), transaction.get(doc(db, 'memberships', term.membershipId))])
      const latest = await readPrevious(transaction, current)
      check()
      validateLatest(latest.data())
      if (!canEditDepartmentWorkbook(membership.data(), user.uid, term.departmentCode, year.data()?.[term.semester]?.phase ?? 'Closed')) throw new Error('This semester is read only for your membership or role.')
      await scheduleWrites?.validate(transaction)
      if (staged) {
        if (lock.data()?.status !== 'saving' || lock.data()?.saveId !== revisionId) throw new Error('The workbook save expired. Try saving again.')
      } else {
        checkLease(lock.data())
        for (const write of writes) {
          if (write.fields) transaction.set(write.ref, write.data, { mergeFields: write.fields })
          else transaction.set(write.ref, write.data)
        }
      }
      transaction.set(target, { ...manifestData, createdAt: latest.data()?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp() })
      scheduleWrites?.apply(transaction, revision, revisionId, user.uid)
      if (staged) transaction.set(lockRef, { ...lock.data(), status: 'idle' })
    })
    if (staged) {
      leaseAttempted = true
      const acquisition = runTransaction(db, async transaction => {
        check()
        const [current, lock, year, membership] = await Promise.all([transaction.get(target), transaction.get(lockRef),
          transaction.get(doc(db, 'academicYears', term.academicYearId)), transaction.get(doc(db, 'memberships', term.membershipId))])
        const latest = await readPrevious(transaction, current)
        check(); validateLatest(latest.data()); checkLease(lock.data())
        if (!canEditDepartmentWorkbook(membership.data(), user.uid, term.departmentCode, year.data()?.[term.semester]?.phase ?? 'Closed')) throw new Error('This semester is read only for your membership or role.')
        transaction.set(lockRef, { status: 'saving', saveId: revisionId, savedBy: user.uid, membershipId: term.membershipId,
          academicYearId: term.academicYearId, createdAt: serverTimestamp() })
      })
      void acquisition.then(() => { if (stopped) void cleanup() }, () => {})
      await wait(() => acquisition)
      progress('saving')
      const writeGroup = async (group: SnapshotWrite[]) => {
        let cursor = 0
        const results = await Promise.allSettled(Array.from({ length: Math.min(SAVE_CONCURRENCY, group.length) }, async () => {
          while (cursor < group.length) {
            check()
            const write = group[cursor++]
            await wait(() => write.fields ? setDoc(write.ref, write.data, { mergeFields: write.fields }) : setDoc(write.ref, write.data))
            completed++; progress('saving')
          }
        }))
        const rejected = results.find(result => result.status === 'rejected')
        if (rejected?.status === 'rejected') throw rejected.reason
      }
      await writeGroup(writes.filter(write => write.kind === 'chunk'))
      await writeGroup(writes.filter(write => write.kind === 'parent'))
    } else progress('saving')
    progress('committing')
    await wait(commit)
    leaseAttempted = false
    completed = total
    snapshotCache = { path, userId: user.uid, revision, revisionId, manifest: manifestData, parents,
      sheets: prepared.sheets, cellAddresses: nextAddresses }
    await persistSnapshot(snapshotCache)
    progress('cleaning')
    let cleanupWarning: string | undefined
    try {
      const complete = await cleanupUnusedWorkbookSheets({ path, workbookId, revisionId, userId: user.uid, sheetIds: prepared.manifest.sheetIds })
      if (!complete) cleanupWarning = 'Workbook saved. Unused sheet cleanup was deferred by another save; save again to retry if needed.'
    } catch (caught) {
      const denied = record(caught) && caught.code === 'permission-denied'
      cleanupWarning = denied
        ? 'Workbook saved, but unused sheets could not be deleted. Deploy the updated Firestore rules, then save again.'
        : 'Workbook saved, but unused sheet cleanup did not finish. Save again to retry.'
      console.warn('Unused workbook sheet cleanup did not finish.', caught)
    }
    const metrics: FirestoreWorkbookSaveMetrics = { preparationMs, firestoreMs: performance.now() - firestoreStarted, totalMs: performance.now() - startedAt,
      uploadedBytes: uploadBytes, rawSheetBytes: prepared.sheets.reduce((sum, sheet) => sum + sheet.byteLength, 0),
      snapshotChunks: writes.filter(write => write.kind === 'chunk').length, cellWrites: writes.filter(write => write.kind === 'cell').length,
      documentWrites: writes.length + 1 + (scheduleWrites?.count ?? 0) + (staged ? 2 : 0), mode }
    try { options.onMetrics?.(metrics) } catch { /* Reporting cannot undo a confirmed save. */ }
    return { fileName, revision, revisionId, cleanupWarning }
  } catch (caught) {
    stopped = true; failure = caught
    snapshotCache = null
    return permissionError(caught)
  } finally { if (leaseAttempted) await cleanup() }
}
