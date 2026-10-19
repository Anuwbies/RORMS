import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { FirebaseError } from 'firebase/app'
import type { User } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore'
import type { DocumentData, QuerySnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { manageFacility, facilityActionError } from '../services/facilityManagement'
import { formatUserName } from '../utils/userName'
import { Button } from './Button'
import { TextAreaInput } from './TextAreaInput'
import { ConfirmModal } from './ConfirmModal'
import { UserIcon } from './Icons'
import type { CommentReadCandidate } from '../hooks/useRoomCommentNotices'

interface RoomCommentsProps {
  roomId: string
  isVisible?: boolean
  isAnonymous?: boolean
  onCommentsSeen?: (roomId: string, lastSeenAt: Timestamp) => Promise<void>
  onCommentSeen?: (roomId: string, comment: CommentReadCandidate) => Promise<void>
  isCommentUnread?: (roomId: string, comment: CommentReadCandidate) => boolean
  canModerateComments?: boolean
}

interface RoomComment {
  id: string
  authorId: string
  authorName: string
  text: string
  createdAt: Timestamp | null
}

const PAGE_SIZE = 20
const MAX_COMMENT_LENGTH = 1000

export function RoomComments({ roomId, isVisible = false, isAnonymous = false, onCommentsSeen, onCommentSeen, isCommentUnread, canModerateComments = false }: RoomCommentsProps) {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [comments, setComments] = useState<RoomComment[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [isComposerFocused, setIsComposerFocused] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPosting, setIsPosting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [commentToDelete, setCommentToDelete] = useState<RoomComment | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [authorPhotos, setAuthorPhotos] = useState<Record<string, string>>({})
  const [lastLoadedAt, setLastLoadedAt] = useState<Timestamp | null>(null)
  const [readError, setReadError] = useState('')
  const lastLoadedRef = useRef<Timestamp | null>(null)
  const retryReadRef = useRef<(() => Promise<void>) | null>(null)
  lastLoadedRef.current = lastLoadedAt
  const authorIdsKey = JSON.stringify([...new Set(comments.filter(comment => comment.authorName !== 'Anonymous').map(comment => comment.authorId).filter(Boolean))].sort())
  const posting = useRef(false)
  const deleting = useRef(false)
  const commentListRef = useRef<HTMLDivElement>(null)
  const [scrollbarWidth, setScrollbarWidth] = useState(0)

  useLayoutEffect(() => {
    const list = commentListRef.current
    if (!list || !isVisible) return
    const measure = () => setScrollbarWidth(list.offsetWidth - list.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [isVisible, comments.length, isLoading])

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  const saveRead = (operation: () => Promise<void>) => {
    retryReadRef.current = operation
    setReadError('')
    void operation().catch(error => {
      console.error('Unable to save comment read status:', error)
      setReadError('Unable to save comment read status.')
    })
  }

  useEffect(() => {
    if (!isVisible || !onCommentsSeen || !user) return
    // Hiding the panel or closing its room marks the loaded discussion seen.
    // Merely opening it leaves individual highlights available to click.
    return () => {
      const lastSeenAt = lastLoadedRef.current
      if (lastSeenAt && auth.currentUser?.uid === user.uid) saveRead(() => onCommentsSeen(roomId, lastSeenAt))
    }
  }, [isVisible, onCommentsSeen, roomId, user?.uid])

  useEffect(() => {
    setComments([])
    setLastLoadedAt(null)
    setHasMore(false)
    setLoadError('')
    if (!user) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    let stopped = false
    let unsubscribe: (() => void) | undefined
    const roomCommentsQuery = query(collection(db, 'comments'), where('roomId', '==', roomId))
    const orderedCommentsQuery = query(roomCommentsQuery, orderBy('createdAt', 'desc'), limit(visibleCount + 1))
    const handleSnapshot = (snapshot: QuerySnapshot<DocumentData>) => {
      if (stopped) return
      const loadedComments = snapshot.docs.map(comment => {
        const data = comment.data({ serverTimestamps: 'estimate' })
        return {
          id: comment.id,
          authorId: typeof data.authorId === 'string' ? data.authorId : '',
          authorName: typeof data.authorName === 'string' ? data.authorName : 'Unknown user',
          text: typeof data.text === 'string' ? data.text : '',
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
        }
      }).sort((first, second) => (second.createdAt?.seconds ?? 0) - (first.createdAt?.seconds ?? 0)
        || (second.createdAt?.nanoseconds ?? 0) - (first.createdAt?.nanoseconds ?? 0)
        || second.id.localeCompare(first.id))
      setHasMore(loadedComments.length > visibleCount)
      setComments(loadedComments.slice(0, visibleCount))
      if (!snapshot.metadata.hasPendingWrites) {
        const newest = loadedComments[0]?.createdAt ?? null
        setLastLoadedAt(previous => previous && newest && previous.isEqual(newest) ? previous : newest)
      }
      setLoadError('')
      setIsLoading(false)
    }
    const handleLoadError = (error: FirebaseError) => {
      if (stopped) return
      console.error('Error loading room comments:', error)
      setComments([])
      setHasMore(false)
      setLoadError(error.code === 'permission-denied'
        ? 'You do not have permission to view comments. Please contact your administrator.'
        : 'Unable to load comments. You can still try posting your comment.')
      setIsLoading(false)
    }
    unsubscribe = onSnapshot(orderedCommentsQuery, { includeMetadataChanges: true }, handleSnapshot, error => {
      if (stopped) return
      if (error.code === 'failed-precondition' && /index/i.test(error.message)) {
        // A room-only filter uses Firestore's default single-field index.
        // Keep comments usable while the optional composite index is unavailable.
        unsubscribe = onSnapshot(roomCommentsQuery, { includeMetadataChanges: true }, handleSnapshot, handleLoadError)
      } else {
        handleLoadError(error)
      }
    })
    return () => {
      stopped = true
      unsubscribe?.()
    }
  }, [roomId, user, visibleCount, retryCount])

  useEffect(() => {
    if (!user) {
      setAuthorPhotos({})
      return
    }
    const authorIds = JSON.parse(authorIdsKey) as string[]
    const unsubscribers = authorIds.map(authorId => onSnapshot(doc(db, 'users', authorId), snapshot => {
      const picture: unknown = snapshot.data()?.profilePicture
      setAuthorPhotos(previous => ({ ...previous, [authorId]: typeof picture === 'string' ? picture : '' }))
    }, error => {
      console.warn('Unable to load comment author picture:', error)
    }))
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [authorIdsKey, user])

  const handlePost = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = text.trim()
    if (!user || auth.currentUser?.uid !== user.uid || !body || body.length > MAX_COMMENT_LENGTH || posting.current) return

    posting.current = true
    setIsPosting(true)
    setActionError('')
    try {
      const authorName = isAnonymous
        ? 'Anonymous'
        : (formatUserName((await getDoc(doc(db, 'users', user.uid))).data()) || user.displayName || 'Member').trim().slice(0, 200)
      await addDoc(collection(db, 'comments'), {
        roomId,
        authorId: user.uid,
        authorName,
        text: body,
        createdAt: serverTimestamp(),
      })
      setText('')
      if (loadError) setRetryCount(count => count + 1)
    } catch (error) {
      console.error('Error posting room comment:', error)
      setActionError(error instanceof FirebaseError && error.code === 'permission-denied'
        ? 'You do not have permission to post comments. Please contact your administrator. Your draft has been kept.'
        : 'Unable to post your comment. Your draft has been kept; please try again.')
    } finally {
      posting.current = false
      setIsPosting(false)
    }
  }

  const handleDelete = async (comment: RoomComment) => {
    if (!user || auth.currentUser?.uid !== user.uid || (comment.authorId !== user.uid && !canModerateComments) || deleting.current) return
    deleting.current = true
    setDeletingId(comment.id)
    setActionError('')
    try {
      await manageFacility({ action: 'delete_comment', targetId: comment.id })
    } catch (error) {
      console.error('Error deleting room comment:', error)
      setActionError(facilityActionError(error, 'Unable to delete this comment. Please try again.'))
    } finally {
      deleting.current = false
      setDeletingId(null)
    }
  }

  return (
    <section aria-label="Room comments" className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        ref={commentListRef}
        className="-mr-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-[max(0px,calc(1.5rem-var(--comment-scrollbar-width)))] custom-scrollbar"
        style={{ '--comment-scrollbar-width': `${scrollbarWidth}px` } as React.CSSProperties}
      >
      {loadError && <p role="alert" className="text-sm text-rose-700">
        {loadError}{' '}
        <button type="button" onClick={() => setRetryCount(count => count + 1)} className="cursor-pointer font-semibold underline">Retry loading</button>
      </p>}
      {readError && <p role="alert" className="text-sm text-rose-700">
        {readError}{' '}
        <button type="button" onClick={() => { if (retryReadRef.current) saveRead(retryReadRef.current) }} className="cursor-pointer font-semibold underline">Retry</button>
      </p>}
      {isLoading && <p role="status" className="text-sm text-slate-500">Loading comments…</p>}
      {user && !isLoading && !loadError && comments.length === 0 && <p className="text-sm text-slate-500">No comments yet. Be the first to leave one.</p>}
      {comments.map(comment => {
        const unread = isCommentUnread?.(roomId, comment) ?? false
        const markSeen = () => { if (unread && onCommentSeen) saveRead(() => onCommentSeen(roomId, comment)) }
        return (
        <article
          key={comment.id}
          role={unread ? 'button' : undefined}
          tabIndex={unread ? 0 : undefined}
          aria-label={unread ? `New comment by ${comment.authorName}. Mark as seen` : undefined}
          onClick={markSeen}
          onKeyDown={event => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              markSeen()
            }
          }}
          className={`space-y-2 rounded-xl border p-3 transition-[opacity,transform,background-color,border-color] duration-200 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none ${unread ? 'cursor-pointer border-amber-300 bg-amber-50 ring-1 ring-inset ring-amber-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500' : 'border-slate-200 bg-gray-100'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 shadow-sm ring-1 ring-slate-300">
                <UserIcon className="h-5 w-5" aria-hidden="true" />
                {comment.authorName !== 'Anonymous' && (authorPhotos[comment.authorId] || (comment.authorId === user?.uid ? user.photoURL : '')) && <img
                  src={authorPhotos[comment.authorId] || user?.photoURL || ''}
                  alt={`${comment.authorName}'s profile`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={event => { event.currentTarget.hidden = true }}
                  onLoad={event => { event.currentTarget.hidden = false }}
                />}
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold leading-tight text-slate-900">{comment.authorName}</p>
                {comment.createdAt && <time dateTime={comment.createdAt.toDate().toISOString()} className="block text-xs leading-tight text-slate-500">
                  {comment.createdAt.toDate().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </time>}
              </div>
            </div>
            {user && (comment.authorId === user.uid || canModerateComments) && <button
              type="button"
              onClick={event => { event.stopPropagation(); setCommentToDelete(comment) }}
              disabled={deletingId !== null}
              aria-label={comment.authorId === user.uid ? 'Delete your comment' : 'Delete comment'}
              className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-default disabled:opacity-50"
            >{deletingId === comment.id ? 'Deleting…' : 'Delete'}</button>}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{comment.text}</p>
        </article>
      )})}
      {hasMore && <Button type="button" variant="outline" onClick={() => setVisibleCount(count => count + PAGE_SIZE)}>Load older comments</Button>}
      </div>

      {user ? (
        <form
          onSubmit={handlePost}
          onFocus={() => setIsComposerFocused(true)}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsComposerFocused(false)
          }}
          className="shrink-0"
        >
          <TextAreaInput
            id={`room-comment-${roomId}`}
            value={text}
            onChange={setText}
            placeholder="Share feedback or report an issue with this room…"
            maxLength={MAX_COMMENT_LENGTH}
            rows={1}
            inputClassName={`block bg-gray-100! transition-[height,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none ${isComposerFocused ? 'h-[calc(3lh+1.5rem+2px)]' : 'h-12'}`}
            disabled={isPosting}
            aria-label="Leave a comment"
            aria-describedby={`room-comment-limit-${roomId}`}
          />
          <div
            aria-hidden={!isComposerFocused}
            inert={!isComposerFocused}
            className={`grid transition-[grid-template-rows,opacity,transform,margin-top] duration-200 ease-out motion-reduce:transition-none ${isComposerFocused ? 'mt-2 grid-rows-[1fr] translate-y-0 opacity-100' : 'pointer-events-none mt-0 grid-rows-[0fr] translate-y-2 opacity-0'}`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span id={`room-comment-limit-${roomId}`} className="text-xs text-slate-500">{text.length}/{MAX_COMMENT_LENGTH} characters</span>
                <Button type="submit" variant="brand" disabled={!isComposerFocused || !text.trim() || isPosting}>
                  {isPosting ? 'Posting…' : 'Post Comment'}
                </Button>
              </div>
            </div>
          </div>
          {actionError && <p role="alert" className="mt-2 text-sm text-rose-700">{actionError}</p>}
        </form>
      ) : <p className="shrink-0 text-sm text-slate-500">Sign in to view and leave room comments.</p>}
      {commentToDelete && createPortal(
        <ConfirmModal
          isOpen
          title="Delete Comment"
          message="Are you sure you want to delete this comment? This action cannot be undone."
          confirmText="Delete Comment"
          isDestructive
          onCancel={() => setCommentToDelete(null)}
          onConfirm={() => {
            const comment = commentToDelete
            setCommentToDelete(null)
            void handleDelete(comment)
          }}
        />,
        document.body,
      )}
    </section>
  )
}
