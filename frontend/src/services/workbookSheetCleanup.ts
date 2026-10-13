import { collection, doc, getDocsFromServer, limit, query, runTransaction, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { withDeadline } from '../utils/withDeadline'

interface WorkbookCleanupScope {
  path: string
  workbookId: string
  revisionId: string
  userId: string
  sheetIds: readonly string[]
}

/** Called only after Save commits. Incomplete cleanup is retried on the next Save. */
export async function cleanupUnusedWorkbookSheets(scope: WorkbookCleanupScope): Promise<boolean> {
  const stopAt = Date.now() + 30000
  let stopped = false
  const check = () => {
    if (stopped || Date.now() >= stopAt) throw new Error('Unused sheet cleanup timed out.')
    if (auth.currentUser?.uid !== scope.userId) throw new Error('Your account changed during sheet cleanup.')
  }
  const wait = async <T>(operation: () => Promise<T>): Promise<T> => {
    check()
    try {
      const result = await withDeadline(operation(), Math.min(10000, stopAt - Date.now()), 'Unused sheet cleanup timed out.')
      check()
      return result
    } catch (caught) {
      stopped = true
      throw caught
    }
  }
  const target = doc(db, scope.path)
  const lockRef = doc(db, `${scope.path}/saveLocks/current`)
  // Include old orphan sheets, so reopening and saving also retries cleanup.
  const candidates = await wait(() => getDocsFromServer(query(collection(db, 'sheets'), where('workbookId', '==', scope.workbookId))))
  for (const candidate of candidates.docs) {
    if (scope.sheetIds.includes(candidate.data().sheetId)) continue
    let more = true
    while (more) {
      // Web transactions cannot query collections. Fetch bounded child pages
      // first, then guard their deletion with transactional manifest/lease reads.
      const [chunks, cells] = await wait(() => Promise.all([
        getDocsFromServer(query(collection(db, candidate.ref.path, 'chunks'), limit(4))),
        getDocsFromServer(query(collection(db, candidate.ref.path, 'cells'), limit(16))),
      ]))
      const children = [...chunks.docs, ...cells.docs]
      const result = await wait(() => runTransaction(db, async transaction => {
        check()
        const [manifest, lock, sheet] = await Promise.all([transaction.get(target), transaction.get(lockRef), transaction.get(candidate.ref)])
        check()
        const current = manifest.data(), data = sheet.data(), lease = lock.data()
        if (current?.schemaVersion !== 3 || current.workbookId !== scope.workbookId || current.revisionId !== scope.revisionId
          || current.savedBy !== scope.userId || !Array.isArray(current.sheetIds)) return 'deferred'
        if (!data) return 'done'
        if (data.workbookId !== scope.workbookId || !Number.isSafeInteger(data.sheetIndex) || data.sheetIndex < 0 || data.sheetIndex >= 1000
          || data.sheetId !== `sheet_${data.sheetIndex}` || candidate.id !== `${scope.workbookId}_${data.sheetId}`) return 'deferred'
        if (current.sheetIds.includes(data.sheetId)) return 'done'
        const startedAt: unknown = lease?.createdAt?.toMillis?.()
        if (lease?.status === 'saving' && (typeof startedAt !== 'number' || !Number.isFinite(startedAt)
          || startedAt > Date.now() - 10 * 60 * 1000)) return 'deferred'
        if (children.length) {
          for (const child of children) transaction.delete(child.ref)
          return 'more'
        }
        // Keep the parent discoverable until both known subcollections are empty.
        transaction.delete(candidate.ref)
        return 'done'
      }))
      if (result === 'deferred') return false
      more = result === 'more'
    }
  }
  return true
}
