import type { Comment } from 'xlsx'

export interface CommentAuthor {
  name: string
  id?: string
  avatarUrl?: string
}

export type CommentAction = 'resolve' | 'unresolve' | 'delete'

export function isVisibleAnnotation(comment: PreviewComment): boolean {
  return !comment.T || !comment.resolved
}

export function applyCommentAction(comments: PreviewComment[], index: number, action: CommentAction, resolution?: { author: CommentAuthor; createdAt: string }): PreviewComment[] {
  const comment = comments[index]
  if (!comment?.T || (action === 'resolve' && comment.resolved) || (action === 'unresolve' && !comment.resolved)) return comments
  if (action === 'delete') return comments.filter((_, position) => position !== index)
  return comments.map((item, position) => {
    if (position !== index) return item
    if (action === 'resolve') return {
      ...item, resolved: true,
      ...(resolution ? { resolvedBy: { ...resolution.author }, resolvedAt: resolution.createdAt } : {}),
    }
    const unresolved = { ...item }
    delete unresolved.resolved
    delete unresolved.resolvedBy
    delete unresolved.resolvedAt
    return unresolved
  })
}

export interface PreviewComment extends Comment {
  createdAt?: string
  authorId?: string
  avatarUrl?: string
  resolved?: boolean
  resolvedBy?: CommentAuthor
  resolvedAt?: string
}

export function updateCellAnnotation(comments: readonly PreviewComment[], kind: 'comment' | 'note', text: string, author: CommentAuthor, createdAt: string): PreviewComment[] {
  const threaded = kind === 'comment'
  const retained = comments.filter(comment => Boolean(comment.T) !== threaded || (threaded && comment.resolved))
  if (!text.trim()) return retained
  if (!threaded) return [...retained, { t: text.trim(), T: false }]
  const previous = comments.find(comment => comment.T && !comment.resolved)
  return [...retained, {
    t: text.trim(), T: true,
    a: previous?.a && previous.a !== 'You' ? previous.a : author.name,
    createdAt: previous?.createdAt ?? createdAt,
    authorId: previous?.authorId ?? (previous?.a && previous.a !== 'You' ? undefined : author.id),
    avatarUrl: previous?.avatarUrl ?? (previous?.a && previous.a !== 'You' ? undefined : author.avatarUrl),
  }]
}

export function formatCommentTime(createdAt: string | undefined, now = new Date()): string | null {
  if (!createdAt) return null
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return null
  const timeZone = 'Asia/Manila'
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(date)
  const label = day.format(date) === day.format(now) ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(date)
  return `${time} ${label}`
}
