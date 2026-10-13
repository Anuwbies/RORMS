import { useEffect, useRef, useState } from 'react'

interface ExcelFileMenuProps {
  disabled: boolean
  importing: boolean
  exportDisabled?: boolean
  onImport: () => void
  importLabel?: string
  onExport: () => void
}

export function ExcelFileMenu({ disabled, importing, exportDisabled = false, onImport, onExport, importLabel = 'Import Excel file' }: ExcelFileMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  return <div ref={containerRef} className="relative shrink-0">
    <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className="h-[32px] shrink-0 rounded-lg px-3 text-[16px] font-medium text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a] disabled:opacity-50">{importing ? 'Opening…' : 'Import / Export'}</button>
    {open && <div ref={menuRef} role="menu" aria-label="Import or export Excel" className="absolute bottom-full left-0 z-[300] mb-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); triggerRef.current?.focus(); onImport() }} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a]">{importLabel}</button>
      <button type="button" role="menuitem" disabled={exportDisabled} onClick={() => { setOpen(false); triggerRef.current?.focus(); onExport() }} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] hover:text-[#41572a] disabled:text-slate-400 disabled:hover:bg-transparent">Export Excel file</button>
    </div>}
  </div>
}
