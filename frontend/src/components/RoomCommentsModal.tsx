import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from './Icons'

interface RoomCommentsModalProps {
  id: string
  isOpen: boolean
  roomName: string
  size: { width: number; height: number } | null
  onClose: () => void
  children: ReactNode
}

export function RoomCommentsModal({ id, isOpen, roomName, size, onClose, children }: RoomCommentsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const headerTextRef = useRef<HTMLDivElement>(null)
  const [closeButtonSize, setCloseButtonSize] = useState<number | null>(null)

  useLayoutEffect(() => {
    const headerText = headerTextRef.current
    if (!isOpen || !headerText) return

    const measure = () => setCloseButtonSize(headerText.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(headerText)
    return () => observer.disconnect()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus()
  }, [isOpen])

  return (
    <aside
      id={id}
      role="dialog"
      aria-labelledby={`${id}-title`}
      aria-hidden={!isOpen}
      className={`${isOpen ? 'flex' : 'hidden'} fixed right-4 top-1/2 z-[1] w-full max-w-lg -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl xl:static xl:z-auto xl:shrink-0 xl:translate-y-0`}
      style={size ? { width: size.width, height: size.height } : undefined}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex shrink-0 items-stretch justify-between gap-3 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
        <div ref={headerTextRef} className="min-w-0">
          <h3 id={`${id}-title`} className="text-xl font-bold leading-tight">Room Comments</h3>
          <p className="mt-0.5 break-words text-xs font-medium text-white/80">{roomName}</p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Hide comments"
          className="flex aspect-square shrink-0 cursor-pointer items-center justify-center self-stretch rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          style={closeButtonSize !== null ? { width: closeButtonSize, height: closeButtonSize } : undefined}
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-6">
        {children}
      </div>
    </aside>
  )
}
