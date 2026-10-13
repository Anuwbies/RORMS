import { collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { deleteObject, getBlob, getMetadata, ref, uploadBytes, type FullMetadata } from 'firebase/storage'
import { app, auth, db, storage } from '../firebase'
import { workbookTermPaths, type DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { canEditDepartmentWorkbook, workbookEditablePhases } from '../utils/departmentWorkbookPermissions'
import { withDeadline } from '../utils/withDeadline'
import { readWorkbookFileCache, writeWorkbookFileCache, workbookFileCacheKey } from './departmentWorkbookCache'
import type { WorkbookScheduleRow } from '../utils/excelScheduleRows'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024
const MAX_EDITOR_BYTES = 50 * 1024 * 1024
const fileReadsInFlight = new Map<string, { promise: Promise<Blob>; listeners: Set<() => void>; isDownloading: () => boolean }>()

function revisionFile(path: string, base: string, fileName: string): boolean {
  if (!path.startsWith(`${base}/`)) return false
  const parts = path.slice(base.length + 1).split('/')
  return parts.length === 2 && /^[A-Za-z0-9_-]+$/.test(parts[0]) && parts[1] === fileName
}

export interface SavedDepartmentWorkbook {
  fileName: string
  workbookPath: string
  editorStatePath: string
  revision: number
}

export interface LoadedDepartmentWorkbook extends SavedDepartmentWorkbook {
  file: File
  editorState: string
}

export class MissingDepartmentWorkbookError extends Error {
  readonly previous: SavedDepartmentWorkbook

  constructor(previous: SavedDepartmentWorkbook) {
    super('The saved workbook files were deleted. Import an .xlsx again, then Save to replace them.')
    this.name = 'MissingDepartmentWorkbookError'
    this.previous = previous
  }
}

export type WorkbookLoadStage = 'checking' | 'downloading' | 'cached'

function cacheScope(userId: string): string {
  return JSON.stringify([app.options.projectId, app.options.storageBucket, userId])
}

function checkAccount(userId: string) {
  if (auth.currentUser?.uid !== userId) throw new Error('Your account changed. Reopen the semester workbook.')
}

async function readCachedFile(scope: string, path: string, metadata: FullMetadata, limit: number, onDownload: () => void): Promise<Blob> {
  if (!metadata.generation || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > limit) throw new Error('The saved workbook file size is invalid.')
  const key = workbookFileCacheKey(scope, path, metadata.generation)
  const pending = fileReadsInFlight.get(key)
  if (pending) {
    pending.listeners.add(onDownload)
    if (pending.isDownloading()) onDownload()
    return pending.promise
  }
  const listeners = new Set([onDownload])
  let downloading = false
  const reading = (async () => {
    const cached = await readWorkbookFileCache(key)
    if (cached?.size === metadata.size) return cached
    downloading = true
    for (const listener of listeners) listener()
    const blob = await getBlob(ref(storage, path), limit)
    if (blob.size !== metadata.size) throw new Error('The saved workbook changed while downloading. Try loading again.')
    void writeWorkbookFileCache(key, blob)
    return blob
  })().finally(() => { fileReadsInFlight.delete(key) })
  fileReadsInFlight.set(key, { promise: reading, listeners, isDownloading: () => downloading })
  return reading
}

export function loadDepartmentWorkbook(term: DepartmentWorkbookTerm, onStage?: (stage: WorkbookLoadStage) => void): Promise<LoadedDepartmentWorkbook | null> {
  return withDeadline(readDepartmentWorkbook(term, onStage), 30000, 'Opening the saved workbook took too long. Check your connection and try loading again.')
}

async function readDepartmentWorkbook(term: DepartmentWorkbookTerm, onStage?: (stage: WorkbookLoadStage) => void): Promise<LoadedDepartmentWorkbook | null> {
  onStage?.('checking')
  const userId = auth.currentUser?.uid
  if (!userId) throw new Error('Sign in again before opening the workbook.')
  const paths = workbookTermPaths(term)
  // Cached absence must never authorize a new import over a saved term.
  let record = await getDocFromServer(doc(db, paths.document))
  for (const path of new Set([paths.previousDocument, paths.namedLegacyDocument, paths.legacyDocument])) {
    if (record.exists()) break
    record = await getDocFromServer(doc(db, path))
  }
  if (!record.exists()) return null
  const data = record.data()
  if (data.schemaVersion !== 1 || typeof data.fileName !== 'string' || typeof data.workbookPath !== 'string'
    || typeof data.editorStatePath !== 'string' || !Number.isSafeInteger(data.revision) || data.revision < 1
    || !(revisionFile(data.workbookPath, paths.storage, 'original.xlsx') || revisionFile(data.workbookPath, paths.previousStorage, 'original.xlsx') || revisionFile(data.workbookPath, paths.namedLegacyStorage, 'original.xlsx') || revisionFile(data.workbookPath, paths.legacyStorage, 'original.xlsx'))
    || !(revisionFile(data.editorStatePath, paths.storage, 'editor.json') || revisionFile(data.editorStatePath, paths.previousStorage, 'editor.json') || revisionFile(data.editorStatePath, paths.namedLegacyStorage, 'editor.json') || revisionFile(data.editorStatePath, paths.legacyStorage, 'editor.json'))) throw new Error('The saved semester workbook is invalid.')
  const previous: SavedDepartmentWorkbook = { fileName: data.fileName, workbookPath: data.workbookPath, editorStatePath: data.editorStatePath, revision: data.revision }
  const [workbookBlob, editorBlob] = await (async () => {
    // Metadata verifies access, object generation, and deletions even on a cache hit.
    const [workbookMetadata, editorMetadata] = await Promise.all([
      getMetadata(ref(storage, previous.workbookPath)), getMetadata(ref(storage, previous.editorStatePath)),
    ])
    checkAccount(userId)
    const scope = cacheScope(userId)
    let downloading = false
    const onDownload = () => { downloading = true; onStage?.('downloading') }
    const blobs = await Promise.all([
      readCachedFile(scope, previous.workbookPath, workbookMetadata, MAX_WORKBOOK_BYTES, onDownload),
      readCachedFile(scope, previous.editorStatePath, editorMetadata, MAX_EDITOR_BYTES, onDownload),
    ])
    checkAccount(userId)
    if (!downloading) onStage?.('cached')
    return blobs
  })().catch((caught: unknown) => {
    if (caught && typeof caught === 'object' && 'code' in caught && caught.code === 'storage/object-not-found') throw new MissingDepartmentWorkbookError(previous)
    throw caught
  })
  return {
    ...previous,
    file: new File([workbookBlob], data.fileName, { type: XLSX_TYPE }), editorState: await editorBlob.text(),
  }
}

export async function saveDepartmentWorkbook(term: DepartmentWorkbookTerm, file: File, editorState: string, previous: SavedDepartmentWorkbook | null, replaceMissingFiles = false, scheduleRows?: readonly WorkbookScheduleRow[]): Promise<SavedDepartmentWorkbook> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in again before saving the workbook.')
  if (!term.membershipId) throw new Error('An accepted department membership is required to save.')
  if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > MAX_WORKBOOK_BYTES) throw new Error('Choose an .xlsx file no larger than 20 MB.')
  const stateBlob = new Blob([editorState], { type: 'application/json' })
  if (stateBlob.size > MAX_EDITOR_BYTES) throw new Error('This workbook is too large to save its editor settings.')
  const paths = workbookTermPaths(term)
  if (previous && (!(revisionFile(previous.workbookPath, paths.storage, 'original.xlsx') || revisionFile(previous.workbookPath, paths.previousStorage, 'original.xlsx') || revisionFile(previous.workbookPath, paths.namedLegacyStorage, 'original.xlsx') || revisionFile(previous.workbookPath, paths.legacyStorage, 'original.xlsx'))
    || !(revisionFile(previous.editorStatePath, paths.storage, 'editor.json') || revisionFile(previous.editorStatePath, paths.previousStorage, 'editor.json') || revisionFile(previous.editorStatePath, paths.namedLegacyStorage, 'editor.json') || revisionFile(previous.editorStatePath, paths.legacyStorage, 'editor.json'))
    || !Number.isSafeInteger(previous.revision) || previous.revision < 1)) throw new Error('The saved semester workbook is invalid. Reopen it before saving.')
  const [year, membership] = await Promise.all([
    getDoc(doc(db, 'academicYears', term.academicYearId)),
    getDoc(doc(db, 'memberships', term.membershipId)),
  ])
  const member = membership.data()
  const phase = year.data()?.[term.semester]?.phase
  if (!canEditDepartmentWorkbook(member, user.uid, term.departmentCode, phase)) {
    if (!workbookEditablePhases(member?.role).includes(phase)) throw new Error('This semester is read only for your role.')
    throw new Error('An accepted membership authorized to manage this department workbook is required to save.')
  }
  // Read only rows owned by this workbook. The term revision below serializes concurrent saves.
  const rowSnapshots = scheduleRows ? await Promise.all([...new Set([paths.document, paths.previousDocument, paths.namedLegacyDocument, paths.legacyDocument])].map(path => getDocs(query(collection(db, 'schedule'), where('sourceWorkbook', '==', path))))) : null
  const existingRows = rowSnapshots ? { docs: [...new Map(rowSnapshots.flatMap(snapshot => snapshot.docs).map(row => [row.id, row])).values()] } : null
  const rowId = (sheet: string, row: number) => `workbook_${encodeURIComponent(JSON.stringify([term.departmentId, term.academicYearId, term.semester, sheet, row]))}`
  const rowDocuments = scheduleRows?.map((row, index) => {
    const id = rowId(row.sourceSheet, row.sourceRow)
    const first = row.meetings[0]
    return { ...row, id, source: 'workbook', schemaVersion: 2, sourceWorkbook: paths.document,
      departmentId: term.departmentId, department: term.departmentCode, academicYearId: term.academicYearId,
      academicYear: term.academicYear, semester: term.semester === 'sem1' ? '1st Semester' : '2nd Semester', semesterKey: term.semester,
      orderIndex: index, status: row.status, type: row.parallelSourceRow !== null ? 'parallel' : row.college.toLowerCase() || 'normal',
      groupId: row.parallelSourceRow !== null ? rowId(row.sourceSheet, row.parallelSourceRow) : '',
      isSplitSession: row.meetings.length > 1, parentId: '',
      format: first?.format ?? '', startTime: first?.startTime ?? '', endTime: first?.endTime ?? '', days: first?.days ?? [],
      instructorId: first?.instructorId ?? '', roomId: first?.roomId ?? '', buildingId: first?.buildingId ?? '',
      instructorIds: [...new Set(row.meetings.map(meeting => meeting.instructorId).filter(Boolean))],
      roomIds: [...new Set(row.meetings.map(meeting => meeting.roomId).filter(Boolean))] }
  })
  checkAccount(user.uid)
  const revisionId = crypto.randomUUID()
  const uploadRef = doc(db, `${paths.document}/uploads/${revisionId}`)
  const originalPath = previous && !replaceMissingFiles ? previous.workbookPath : `${paths.storage}/${revisionId}/original.xlsx`
  const editorPath = `${paths.storage}/${revisionId}/editor.json`
  const uploaded: string[] = []
  const cacheAfterSave: { path: string; blob: Blob; generation: string }[] = []
  let committed = false
  await setDoc(uploadRef, { savedBy: user.uid, membershipId: term.membershipId, academicYearId: term.academicYearId, createdAt: serverTimestamp() })
  try {
    if (!previous || replaceMissingFiles) {
      uploaded.push(originalPath)
      const result = await uploadBytes(ref(storage, originalPath), file, { contentType: XLSX_TYPE })
      cacheAfterSave.push({ path: originalPath, blob: file, generation: result.metadata.generation })
    }
    uploaded.push(editorPath)
    const result = await uploadBytes(ref(storage, editorPath), stateBlob, { contentType: 'application/json' })
    cacheAfterSave.push({ path: editorPath, blob: stateBlob, generation: result.metadata.generation })
    const revision = (previous?.revision ?? 0) + 1
    await runTransaction(db, async transaction => {
      const target = doc(db, paths.document)
      let latest = await transaction.get(target)
      for (const path of new Set([paths.previousDocument, paths.namedLegacyDocument, paths.legacyDocument])) {
        if (latest.exists()) break
        latest = await transaction.get(doc(db, path))
      }
      if ((latest.data()?.revision ?? 0) !== (previous?.revision ?? 0)) throw new Error('Someone saved a newer version of this semester. Reopen the workbook before saving again.')
      if (rowDocuments && existingRows) {
        const retained = new Set(rowDocuments.map(row => row.id))
        const old = new Map(existingRows.docs.map(row => [row.id, row.data()]))
        for (const row of rowDocuments) transaction.set(doc(db, 'schedule', row.id), {
          ...row, workbookRevision: revision, workbookRevisionId: revisionId, savedBy: user.uid,
          createdAt: old.get(row.id)?.createdAt ?? serverTimestamp(), updatedAt: serverTimestamp(),
        })
        for (const row of existingRows.docs) if (!retained.has(row.id)) transaction.delete(row.ref)
      }
      transaction.set(target, {
        schemaVersion: 1, departmentId: term.departmentId, departmentCode: term.departmentCode,
        academicYearId: term.academicYearId, academicYear: term.academicYear, semester: term.semester,
        fileName: file.name, workbookPath: originalPath, editorStatePath: editorPath,
        revision, revisionId, savedBy: user.uid, membershipId: term.membershipId,
        updatedAt: serverTimestamp(), createdAt: latest.data()?.createdAt ?? serverTimestamp(),
      })
    })
    committed = true
    if (auth.currentUser?.uid === user.uid) for (const entry of cacheAfterSave) void writeWorkbookFileCache(workbookFileCacheKey(cacheScope(user.uid), entry.path, entry.generation), entry.blob)
    return { fileName: file.name, workbookPath: originalPath, editorStatePath: editorPath, revision }
  } finally {
    if (!committed) {
      // Failed saves never replace the current revision; remove their staging files.
      const cleanup = await Promise.allSettled(uploaded.map(path => deleteObject(ref(storage, path))))
      if (cleanup.every(result => result.status === 'fulfilled' || (result.status === 'rejected' && result.reason?.code === 'storage/object-not-found'))) await deleteDoc(uploadRef).catch(() => {})
    }
  }
}
