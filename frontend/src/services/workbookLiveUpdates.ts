import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import type { WorkbookRevision } from '../utils/liveWorkbookReceiver'

export function subscribeWorkbookRevisions(paths: readonly string[], receive: (revision: WorkbookRevision) => void, onError: (error: unknown) => void): () => void {
  const revisions = new Map<string, WorkbookRevision | null>()
  let stopped = false, delivered = ''
  const subscriptions = paths.map(path => onSnapshot(doc(db, path), { includeMetadataChanges: true }, snapshot => {
    if (stopped || snapshot.metadata.hasPendingWrites) return
    if (snapshot.metadata.fromCache) { delivered = ''; return }
    const data = snapshot.data()
    if (snapshot.exists() && (!Number.isSafeInteger(data?.revision) || data?.revision < 1)) {
      onError(new Error('The saved workbook has an invalid revision. Live updates are unavailable.'))
      return
    }
    revisions.set(path, snapshot.exists() ? { path, revision: data!.revision, revisionId: data?.revisionId } : null)
    // Resolve legacy records only after every path has a server result.
    if (revisions.size !== paths.length) return
    const current = paths.map(candidate => revisions.get(candidate)).find(Boolean)
    if (!current) return
    const key = JSON.stringify(current)
    if (key === delivered) return
    delivered = key
    receive(current)
  }, error => { if (!stopped) onError(error) }))
  return () => { stopped = true; subscriptions.forEach(unsubscribe => unsubscribe()) }
}
