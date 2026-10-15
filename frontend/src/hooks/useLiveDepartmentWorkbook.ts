import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'
import { workbookTermPaths, type DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { deserializeWorkbookState, type WorkbookEditSnapshot } from '../utils/excelWorkbookState'
import { createLiveWorkbookReceiver } from '../utils/liveWorkbookReceiver'
import { subscribeWorkbookRevisions } from '../services/workbookLiveUpdates'
import { useLatestEvent } from './useLatestEvent'

export interface LiveWorkbookUpdate {
  revision: number
  snapshot: WorkbookEditSnapshot
  originalFile?: File
  isCurrent?: () => boolean
  onApplied: () => void
}

interface SavedWorkbook { revision: number; editorState: string; file?: File; workbookPath?: string }

export function useLiveDepartmentWorkbook<T extends SavedWorkbook>(term: DepartmentWorkbookTerm | undefined, paused: boolean, load: () => Promise<T | null>, savedRevision: () => number, apply: (saved: T) => void) {
  const [update, setUpdate] = useState<LiveWorkbookUpdate & { scope: string }>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const originalFilesRef = useRef<{ key: string; files: Record<string, Uint8Array> } | undefined>(undefined)
  const loadLatest = useLatestEvent(async () => {
    const account = auth.currentUser?.uid
    const saved = await load()
    if (!saved) return null
    const key = JSON.stringify([account, saved.workbookPath])
    const files = saved.file ? saved.workbookPath && originalFilesRef.current?.key === key ? originalFilesRef.current.files
      : (await import('../utils/excelPreviewStyles')).parseExcelPreviewStyles(await saved.file.arrayBuffer()).files : {}
    if (!account || account !== auth.currentUser?.uid) throw new Error('Your account changed. Live workbook updates have been stopped.')
    if (saved.file) originalFilesRef.current = { key, files }
    return { saved, account, revision: saved.revision, snapshot: deserializeWorkbookState(saved.editorState, files) }
  })
  const currentRevision = useLatestEvent(savedRevision)
  const applyLatest = useLatestEvent(apply)
  const paths = useMemo(() => {
    if (!term) return []
    const value = workbookTermPaths(term)
    return [...new Set([value.document, value.previousDocument, value.namedLegacyDocument, value.legacyDocument])]
  }, [term?.departmentId, term?.academicYearId, term?.academicYear, term?.semester])
  const scope = JSON.stringify(paths)
  const receiver = useMemo(() => createLiveWorkbookReceiver(loadLatest, currentRevision, loaded => {
    setError('')
    setUpdate({
      scope, revision: loaded.revision, snapshot: loaded.snapshot, originalFile: loaded.saved.file,
      isCurrent: () => loaded.account === auth.currentUser?.uid && loaded.revision > currentRevision(),
      onApplied: () => {
        if (loaded.account === auth.currentUser?.uid) applyLatest(loaded.saved)
      },
    })
  }, caught => setError(caught instanceof Error ? caught.message : 'Live updates could not be loaded. Your local edits have been kept.')), [paths, loadLatest, currentRevision, applyLatest])
  useEffect(() => {
    receiver.pause(paused)
  }, [receiver, paused])
  useEffect(() => {
    setUpdate(undefined)
    setError('')
    if (!paths.length) return
    let unsubscribeWorkbook: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeWorkbook?.()
      receiver.stop()
      setUpdate(undefined)
      if (!user) { setError('Sign in again to receive live workbook updates.'); return }
      receiver.start()
      unsubscribeWorkbook = subscribeWorkbookRevisions(paths, receiver.notify, caught => setError(caught instanceof Error ? caught.message : 'Live workbook updates are unavailable.'))
    })
    return () => { receiver.stop(); unsubscribeAuth(); unsubscribeWorkbook?.() }
  }, [paths, receiver, attempt])
  return { update: update?.scope === scope ? update : undefined, error, retry: () => setAttempt(current => current + 1) }
}
