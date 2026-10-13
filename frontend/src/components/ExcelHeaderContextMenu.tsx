import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ExcelHeaderContextMenuProps {
  axis: 'row' | 'column' | 'all'
  label: string
  position: { left: number; top: number }
  hidden: boolean
  hiddenCount: number
  selectedCount?: number
  selectedHiddenCount?: number
  onHide: () => void
  onShow: () => void
  onRemoveIndicator?: () => void
  onClose: () => void
}

export function ExcelHeaderContextMenu({ axis, label, position, hidden, hiddenCount, selectedCount = 1, selectedHiddenCount = hidden ? 1 : 0, onHide, onShow, onRemoveIndicator, onClose }: ExcelHeaderContextMenuProps) {
  const selectionLabel = `${axis}${selectedCount > 1 ? 's' : ''} ${label}`
  const menuRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState(position)
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    setPlacement({ left: Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8)) })
    menu.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [position])
  const itemClass = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] focus-visible:bg-[#f3f7ee] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent'
  return createPortal(<>
    <div className="fixed inset-0 z-[310]" onMouseDown={onClose} onContextMenu={event => { event.preventDefault(); onClose() }} />
    <div ref={menuRef} role="menu" aria-label={`${axis === 'all' ? 'Rows and columns' : axis === 'row' ? 'Row' : 'Column'} visibility`} className="fixed z-[320] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={placement} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.stopPropagation()
        if (event.key === 'Escape') event.preventDefault()
        onClose()
      } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>
      {axis !== 'all' && <button type="button" role="menuitem" disabled={hidden} onClick={onHide} className={itemClass}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.5]"><path d="m3 3 18 18M10 5.2A12 12 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3.3 3.8M6.1 6.1A19 19 0 0 0 2 12s4 7 10 7a12 12 0 0 0 5.9-1.9M10 10a3 3 0 0 0 4 4" /></svg>
        Hide {selectionLabel}
      </button>}
      <button type="button" role="menuitem" disabled={!hidden && !hiddenCount} onClick={onShow} className={itemClass}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.5]"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
        {axis === 'all' ? `Show all hidden rows and columns (${hiddenCount})` : selectedHiddenCount > 0 ? `Show ${selectionLabel}` : `Show all hidden ${axis === 'row' ? 'rows' : 'columns'} (${hiddenCount})`}
      </button>
      {onRemoveIndicator && <button type="button" role="menuitem" onClick={onRemoveIndicator} className={itemClass}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.5]"><path d="M4 4h16v16H4ZM9 9l6 6m0-6-6 6" /></svg>
        Remove indicator
      </button>}
    </div>
  </>, document.body)
}
