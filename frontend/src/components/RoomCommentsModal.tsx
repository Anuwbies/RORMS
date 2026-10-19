import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface RoomCommentsModalProps {
  id: string
  isOpen: boolean
  roomName: string
  size: { width: number; height: number } | null
  onClose: () => void
  isAnonymous: boolean
  onAnonymousChange: (isAnonymous: boolean) => void
  children: ReactNode
}

export function RoomCommentsModal({ id, isOpen, roomName, size, onClose, isAnonymous, onAnonymousChange, children }: RoomCommentsModalProps) {
  const anonymousButtonRef = useRef<HTMLButtonElement>(null)
  const headerTextRef = useRef<HTMLDivElement>(null)
  const [anonymousButtonSize, setAnonymousButtonSize] = useState<number | null>(null)

  useLayoutEffect(() => {
    const headerText = headerTextRef.current
    if (!isOpen || !headerText) return

    const measure = () => setAnonymousButtonSize(headerText.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(headerText)
    return () => observer.disconnect()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) anonymousButtonRef.current?.focus()
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
          ref={anonymousButtonRef}
          type="button"
          onClick={() => onAnonymousChange(!isAnonymous)}
          aria-label={`Anonymous posting ${isAnonymous ? 'on' : 'off'}`}
          aria-pressed={isAnonymous}
          title={`Anonymous posting is ${isAnonymous ? 'on' : 'off'}`}
          className={`flex aspect-square shrink-0 cursor-pointer flex-col items-center justify-center self-stretch rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${isAnonymous ? 'bg-white text-[#41572a] hover:bg-[#f3f7ee]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          style={anonymousButtonSize !== null ? { width: anonymousButtonSize, height: anonymousButtonSize } : undefined}
        >
          <span aria-hidden="true" className="text-[10px] font-bold leading-none">ANON</span>
          <span aria-hidden="true" className="mt-0.5 text-xs font-black leading-none">{isAnonymous ? 'ON' : 'OFF'}</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-6">
        {children}
      </div>
    </aside>
  )
}
