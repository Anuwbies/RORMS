import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCommentTime, isVisibleAnnotation, type PreviewComment } from '../utils/excelAnnotations'

interface ExcelCellAnnotationsProps {
  anchor: { left: number; right: number; top: number }
  comments: PreviewComment[]
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function ExcelCellAnnotations({ anchor, comments, onMouseEnter, onMouseLeave }: ExcelCellAnnotationsProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchor.right + 4, top: anchor.top })
  const threaded = comments.filter(comment => comment.T && isVisibleAnnotation(comment))
  const notes = comments.filter(comment => !comment.T)

  useLayoutEffect(() => {
    const rect = popupRef.current?.getBoundingClientRect()
    if (!rect) return
    const right = anchor.right + 4
    setPosition({ left: Math.max(8, Math.min(right + rect.width <= window.innerWidth - 8 ? right : anchor.left - rect.width - 4, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(anchor.top, window.innerHeight - rect.height - 8)) })
  }, [anchor, comments])

  return createPortal(<div ref={popupRef} role="tooltip" aria-label={threaded.length ? 'Cell comments' : 'Cell note'} className={`fixed z-[305] w-80 max-w-[calc(100vw-1rem)] shadow-[0_8px_16px_rgba(15,23,42,0.25)] ${threaded.length ? notes.length ? 'rounded-t-2xl rounded-b-lg' : 'rounded-2xl' : 'rounded-lg'}`} style={position} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <div className="max-h-[calc(100vh-1rem)] space-y-2 overflow-y-auto rounded-[inherit]">
    {!!threaded.length && <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-100 p-4">
      {threaded.map((comment, index) => {
        const author = comment.a || 'Unknown author'
        const time = formatCommentTime(comment.createdAt)
        return <div key={index}>
          <div className="mb-3 flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e3edda] font-semibold text-[#41572a]">
              <span aria-hidden="true">{author.trim().charAt(0).toUpperCase()}</span>
              {comment.avatarUrl && <img src={comment.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.hidden = true }} />}
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-900">{author}</p>
              {time && <time dateTime={comment.createdAt} className="text-xs text-slate-600">{time}</time>}
            </div>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{comment.t}</p>
        </div>
      })}
    </div>}
    {!!notes.length && <div className="rounded-lg border border-slate-200 bg-white p-3">
      {notes.map((note, index) => <p key={index} className="whitespace-pre-wrap break-words text-sm text-slate-700">{note.t}</p>)}
    </div>}
    </div>
  </div>, document.body)
}
