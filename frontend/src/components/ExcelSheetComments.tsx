import { useMemo } from 'react'
import * as XLSX from 'xlsx'
import { formatCommentTime, type PreviewComment, type CommentAction } from '../utils/excelAnnotations'

interface ExcelSheetCommentsProps {
  sheet: XLSX.WorkSheet
  sheetName: string
  onClose: () => void
  onHoverCell: (address: string | null) => void
  onCommentAction: (address: string, index: number, action: CommentAction) => void
  readOnly?: boolean
}

function commentTimestamp(comment: PreviewComment): number {
  const timestamp = Date.parse((comment.resolved ? comment.resolvedAt : comment.createdAt) ?? '')
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY
}

export function ExcelSheetComments({ sheet, sheetName, onClose, onHoverCell, onCommentAction, readOnly = false }: ExcelSheetCommentsProps) {
  const threads = useMemo(() => Object.entries(sheet)
    .filter(([address]) => /^[A-Z]+[1-9]\d*$/.test(address))
    .flatMap(([address, value]) => (((value as XLSX.CellObject).c as PreviewComment[] | undefined) ?? [])
      .map((comment, index) => ({ address, position: XLSX.utils.decode_cell(address), comment, index }))
      .filter(({ comment }) => comment.T))
    .sort((first, second) => Number(Boolean(first.comment.resolved)) - Number(Boolean(second.comment.resolved)) || commentTimestamp(first.comment) - commentTimestamp(second.comment) || first.position.r - second.position.r || first.position.c - second.position.c || first.index - second.index), [sheet])
  const count = threads.length

  return <aside aria-label={`Comments on ${sheetName}`} className="flex min-h-0 w-96 max-w-[50%] shrink-0 flex-col border-l border-slate-200 bg-slate-50">
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-slate-900">Comments <span className="text-sm font-normal text-slate-500">({count})</span></h3>
        <p className="break-words text-sm text-slate-600">{sheetName}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Close comments" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-[#62853e]">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {!threads.length && <p className="text-sm text-slate-500">No comments on this sheet.</p>}
      {threads.map(({ address, comment, index }, threadIndex) => {
        const author = comment.a || 'Unknown author'
        const time = formatCommentTime(comment.createdAt)
        const resolver = comment.resolvedBy?.name || 'Unknown user'
        const resolvedTime = formatCommentTime(comment.resolvedAt)
        return <div key={`${address}:${index}`} className="space-y-2">
          {comment.resolved && (threadIndex === 0 || !threads[threadIndex - 1].comment.resolved) && <h4 className="text-sm font-medium text-slate-600">Resolved</h4>}
          <article aria-label={`${comment.resolved ? 'Resolved comment' : 'Comment'} for ${address}`} tabIndex={0} onMouseEnter={() => onHoverCell(address)} onMouseLeave={() => onHoverCell(null)} onFocus={() => onHoverCell(address)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHoverCell(null) }} className={`space-y-4 rounded-2xl border border-slate-200 p-4 hover:border-[#62853e] focus-visible:outline-2 focus-visible:outline-[#62853e] ${comment.resolved ? 'bg-slate-200' : 'bg-slate-100'}`}>
          <p className="break-words text-sm font-medium text-slate-600">{sheetName} · {address}</p>
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e3edda] font-semibold text-[#41572a]">
                <span aria-hidden="true">{author.trim().charAt(0).toUpperCase()}</span>
                {comment.avatarUrl && <img src={comment.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true }} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-900">{author}</p>
                {time && <time dateTime={comment.createdAt} className="text-xs text-slate-600">{time}</time>}
              </div>
              {!readOnly && <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => onCommentAction(address, index, comment.resolved ? 'unresolve' : 'resolve')} aria-label={`${comment.resolved ? 'Mark as unresolved: comment' : 'Resolve comment'} by ${author} in ${address}`} title={comment.resolved ? 'Mark as unresolved' : 'Resolve comment'} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#62853e] hover:bg-[#e3edda] hover:text-[#526f34] focus-visible:outline-2 focus-visible:outline-[#62853e]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">{comment.resolved ? <path d="m8 6-4 4 4 4M4 10h10a6 6 0 0 1 0 12" /> : <path d="m5 12 4 4L19 6" />}</svg>
                </button>
                <button type="button" onClick={() => onCommentAction(address, index, 'delete')} aria-label={`Delete comment by ${author} in ${address}`} title="Delete comment" className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="m6 6 12 12M18 6 6 18" /></svg>
                </button>
              </div>}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.t}</p>
          </div>
          {comment.resolved && <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e3edda] font-semibold text-[#41572a]">
                <span aria-hidden="true">{resolver.trim().charAt(0).toUpperCase()}</span>
                {comment.resolvedBy?.avatarUrl && <img src={comment.resolvedBy.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true }} />}
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">{resolver}</p>
                {resolvedTime && <time dateTime={comment.resolvedAt} className="text-xs text-slate-600">{resolvedTime}</time>}
              </div>
            </div>
            <p className="text-sm text-slate-800">Marked as resolved</p>
          </div>}
          </article>
        </div>
      })}
    </div>
  </aside>
}
