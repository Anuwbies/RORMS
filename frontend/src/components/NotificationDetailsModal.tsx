import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { NotificationItem } from '../types/notifications'
import { BellIcon, CloseIcon } from './Icons'

interface NotificationDetailsModalProps {
  notification: NotificationItem
  onClose: () => void
}

export function NotificationDetailsModal({ notification, onClose }: NotificationDetailsModalProps) {
  const titleId = useId()
  const messageId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()

    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      } else if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [tabindex="0"]') || [])
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeys, true)
    return () => {
      document.removeEventListener('keydown', handleKeys, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-[var(--brand-color)]/5 px-6 py-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--brand-color)]">
            <BellIcon className="h-5 w-5" />
            Notification
          </div>
          <button
            type="button"
            aria-label="Close notification"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div tabIndex={0} className="min-h-0 overflow-y-auto p-6 [overflow-wrap:anywhere]">
          <h2 id={titleId} className="whitespace-pre-wrap text-lg font-bold text-slate-900">{notification.title}</h2>
          <time dateTime={notification.createdAt} className="mt-2 block text-xs text-slate-500">
            {new Date(notification.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
          </time>
          <p id={messageId} className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{notification.message}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
