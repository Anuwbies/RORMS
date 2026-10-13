import { useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, Timestamp, where } from 'firebase/firestore'
import type { DocumentData, QuerySnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'

function isNewer(candidate: Timestamp, previous?: Timestamp) {
  return !previous || candidate.seconds > previous.seconds
    || (candidate.seconds === previous.seconds && candidate.nanoseconds > previous.nanoseconds)
}

export interface CommentReadCandidate {
  id: string
  authorId: string
  createdAt: Timestamp | null
}

interface ReadPositions {
  userId: string
  rooms: Record<string, Timestamp>
  seenComments: Record<string, Record<string, Timestamp>>
}

function readSeenComments(value: unknown): Record<string, Timestamp> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).filter(([, timestamp]) => timestamp instanceof Timestamp))
}

export function useRoomCommentNotices(roomIds: string[]) {
  const [userId, setUserId] = useState(auth.currentUser?.uid ?? '')
  const [latest, setLatest] = useState<Record<string, CommentReadCandidate[]>>({})
  const [receipts, setReceipts] = useState<ReadPositions | null>(null)
  const [localReceipts, setLocalReceipts] = useState<ReadPositions | null>(null)
  const roomIdsKey = JSON.stringify([...new Set(roomIds)].sort())

  useEffect(() => onAuthStateChanged(auth, user => setUserId(user?.uid ?? '')), [])

  useEffect(() => {
    setReceipts(null)
    setLocalReceipts(null)
    if (!userId) return
    return onSnapshot(collection(db, 'users', userId, 'roomCommentReads'), { includeMetadataChanges: true }, snapshot => {
      // An initially empty cache must not temporarily override saved read positions.
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
      const rooms: Record<string, Timestamp> = {}
      const seenComments: ReadPositions['seenComments'] = {}
      snapshot.forEach(receipt => {
        const seen: unknown = receipt.data().lastSeenAt
        if (seen instanceof Timestamp) rooms[receipt.id] = seen
        seenComments[receipt.id] = readSeenComments(receipt.data().seenComments)
      })
      setReceipts({ userId, rooms, seenComments })
    }, error => console.error('Unable to load room comment read status:', error))
  }, [userId])

  const isCommentUnread = useCallback((roomId: string, comment: CommentReadCandidate) => {
    if (!userId || receipts?.userId !== userId || comment.authorId === userId || !comment.createdAt) return false
    const local = localReceipts?.userId === userId ? localReceipts : null
    return !receipts.seenComments[roomId]?.[comment.id] && !local?.seenComments[roomId]?.[comment.id]
      && isNewer(comment.createdAt, receipts.rooms[roomId])
      && isNewer(comment.createdAt, local?.rooms[roomId])
  }, [userId, receipts, localReceipts])

  useEffect(() => { setLatest({}) }, [roomIdsKey, userId])

  useEffect(() => {
    if (!userId || receipts?.userId !== userId) return
    let stopped = false
    const ids = JSON.parse(roomIdsKey) as string[]
    const unsubscribers = ids.map(roomId => {
      const roomQuery = query(collection(db, 'comments'), where('roomId', '==', roomId))
      let unsubscribe: (() => void) | undefined
      const receive = (snapshot: QuerySnapshot<DocumentData>, windowSize?: number) => {
        if (stopped || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return
        const candidates: CommentReadCandidate[] = []
        snapshot.forEach(comment => {
          const data = comment.data()
          const timestamp: unknown = data.createdAt
          if (timestamp instanceof Timestamp) candidates.push({ id: comment.id, authorId: data.authorId, createdAt: timestamp })
        })
        const local = localReceipts?.userId === userId ? localReceipts : null
        const mayHaveOlderUnread = candidates.every(comment => comment.createdAt
          && isNewer(comment.createdAt, receipts.rooms[roomId]) && isNewer(comment.createdAt, local?.rooms[roomId]))
        // Clicking a newer comment must not mark older unread comments as seen.
        if (!candidates.some(comment => isCommentUnread(roomId, comment)) && mayHaveOlderUnread && windowSize && snapshot.size === windowSize) {
          unsubscribe?.()
          subscribe(windowSize * 2)
          return
        }
        setLatest(previous => ({ ...previous, [roomId]: candidates }))
      }
      const failed = (error: Error) => console.error('Unable to load room comment notice:', error)
      const subscribe = (windowSize: number) => {
        unsubscribe = onSnapshot(query(roomQuery, orderBy('createdAt', 'desc'), limit(windowSize)), { includeMetadataChanges: true }, snapshot => receive(snapshot, windowSize), error => {
          if (stopped) return
          if (error.code === 'failed-precondition' && /index/i.test(error.message)) {
            unsubscribe = onSnapshot(roomQuery, { includeMetadataChanges: true }, snapshot => receive(snapshot), failed)
          } else failed(error)
        })
      }
      subscribe(1)
      return () => unsubscribe?.()
    })
    return () => {
      stopped = true
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [roomIdsKey, userId, receipts, localReceipts, isCommentUnread])

  const unreadRoomIds = useMemo(() => new Set(
    receipts?.userId === userId && userId
      ? Object.keys(latest).filter(roomId => latest[roomId].some(comment => isCommentUnread(roomId, comment)))
      : [],
  ), [latest, receipts, isCommentUnread, userId])

  const markCommentsSeen = useCallback(async (roomId: string, lastSeenAt: Timestamp) => {
    if (!userId || auth.currentUser?.uid !== userId) throw new Error('Sign in to save comment read status.')
    // These comments have already been displayed to this user. Clear locally
    // immediately rather than briefly showing a badge while Firestore saves.
    // Keep this session's seen position even if saving fails; the panel offers retry.
    setLocalReceipts(previous => {
      const rooms = previous?.userId === userId ? previous.rooms : {}
      return isNewer(lastSeenAt, rooms[roomId])
        ? { userId, rooms: { ...rooms, [roomId]: lastSeenAt }, seenComments: previous?.userId === userId ? previous.seenComments : {} }
        : previous
    })
    const receipt = doc(db, 'users', userId, 'roomCommentReads', roomId)
    // A transaction prevents an older tab from moving the user's read position backwards.
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(receipt)
      const previous: unknown = existing.data()?.lastSeenAt
      if (!(previous instanceof Timestamp) || isNewer(lastSeenAt, previous)) {
        const seenComments = Object.fromEntries(Object.entries(readSeenComments(existing.data()?.seenComments))
          .filter(([, timestamp]) => isNewer(timestamp, lastSeenAt)))
        transaction.set(receipt, { lastSeenAt, seenComments })
      }
    })
  }, [userId])

  const markCommentSeen = useCallback(async (roomId: string, comment: CommentReadCandidate) => {
    if (!userId || auth.currentUser?.uid !== userId || comment.authorId === userId || !comment.createdAt) return
    const createdAt = comment.createdAt
    setLocalReceipts(previous => {
      const local = previous?.userId === userId ? previous : { userId, rooms: {}, seenComments: {} }
      return { ...local, seenComments: { ...local.seenComments, [roomId]: { ...local.seenComments[roomId], [comment.id]: createdAt } } }
    })
    const receipt = doc(db, 'users', userId, 'roomCommentReads', roomId)
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(receipt)
      const lastSeenAt = existing.data()?.lastSeenAt instanceof Timestamp ? existing.data()?.lastSeenAt as Timestamp : new Timestamp(0, 0)
      if (!isNewer(createdAt, lastSeenAt)) return
      transaction.set(receipt, { lastSeenAt, seenComments: { ...readSeenComments(existing.data()?.seenComments), [comment.id]: createdAt } })
    })
  }, [userId])

  return { unreadRoomIds, markCommentsSeen, markCommentSeen, isCommentUnread }
}
