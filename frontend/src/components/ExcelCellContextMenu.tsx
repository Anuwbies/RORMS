import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type CellMenuAction = 'cut' | 'copy' | 'paste' | 'insertRow' | 'insertColumn' | 'insertRight' | 'insertDown' | 'deleteRow' | 'deleteColumn' | 'deleteLeft' | 'deleteUp'
export type CellDetailKind = 'link' | 'comment' | 'note'

interface ExcelCellContextMenuProps {
  position: { left: number; top: number }
  rowCount: number
  columnCount: number
  details: Record<CellDetailKind, string>
  onAction: (action: CellMenuAction) => void
  onSaveDetail: (kind: CellDetailKind, value: string) => void
  onClose: () => void
}

const itemClass = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f3f7ee] focus:bg-[#f3f7ee] focus:outline-none'
const iconPaths = {
  cut: 'm4 4 16 16M20 4 4 20M8 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
  paste: 'M8 5H4v16h16V5h-4M8 3h8v5H8z',
  insert: 'M12 5v14M5 12h14',
  delete: 'M3 6h18M9 3h6M6 6l1 15h10l1-15M10 10v7M14 10v7',
  link: 'M10 14 14 10M9 15l-2 2a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0M15 9l2-2a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0',
  comment: 'M3 3h18v14H8l-5 4zM8 7h8M8 11h5',
  note: 'M4 3h16v13l-5 5H4zM15 21v-5h5M8 7h8M8 11h8',
}

function MenuIcon({ kind }: { kind: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-current stroke-[1.6]" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[kind]} /></svg>
}

export function ExcelCellContextMenu({ position, rowCount, columnCount, details, onAction, onSaveDetail, onClose }: ExcelCellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const submenuButtons = useRef<Partial<Record<'insert' | 'delete', HTMLButtonElement>>>({})
  const focusSubmenuRef = useRef(false)
  const submenuId = useId()
  const [view, setView] = useState<'main' | CellDetailKind>('main')
  const [submenu, setSubmenu] = useState<'insert' | 'delete' | null>(null)
  const [submenuPlacement, setSubmenuPlacement] = useState({ left: 0, top: 0 })
  const [draft, setDraft] = useState('')
  const [placement, setPlacement] = useState(position)

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    setPlacement({ left: Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8)) })
    menu.querySelector<HTMLElement>('input, textarea, [role="menuitem"]')?.focus()
  }, [position, view])

  useLayoutEffect(() => {
    if (!submenu || !submenuRef.current || !menuRef.current) return
    const parent = menuRef.current.getBoundingClientRect()
    const opener = submenuButtons.current[submenu]?.getBoundingClientRect()
    const rect = submenuRef.current.getBoundingClientRect()
    const right = parent.right + 4
    setSubmenuPlacement({ left: Math.max(8, Math.min(right + rect.width <= window.innerWidth - 8 ? right : parent.left - rect.width - 4, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(opener?.top ?? parent.top, window.innerHeight - rect.height - 8)) })
    if (focusSubmenuRef.current) submenuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    focusSubmenuRef.current = false
  }, [submenu, placement])

  const openSubmenu = (kind: 'insert' | 'delete', focus = false) => {
    focusSubmenuRef.current = focus
    setSubmenu(kind)
    if (focus && submenu === kind) {
      submenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
      focusSubmenuRef.current = false
    }
  }
  const closeSubmenu = () => {
    if (submenu) submenuButtons.current[submenu]?.focus()
    setSubmenu(null)
  }

  const action = (label: string, kind: keyof typeof iconPaths, value: CellMenuAction, shortcut?: string, nested = false) => <button type="button" role="menuitem" className={itemClass} onMouseEnter={() => { if (!nested) setSubmenu(null) }} onClick={() => onAction(value)}><MenuIcon kind={kind} /><span className="flex-1">{label}</span>{shortcut && <span className="text-xs text-slate-400">{shortcut}</span>}</button>
  const submenuTrigger = (kind: 'insert' | 'delete', label: string) => <button ref={element => { if (element) submenuButtons.current[kind] = element }} type="button" role="menuitem" data-submenu={kind} aria-haspopup="menu" aria-expanded={submenu === kind} aria-controls={submenu === kind ? submenuId : undefined} className={`${itemClass} ${submenu === kind ? 'bg-[#f3f7ee]' : ''}`} onMouseEnter={() => openSubmenu(kind)} onClick={() => openSubmenu(kind, true)}><MenuIcon kind={kind} /><span className="flex-1">{label}</span><span aria-hidden="true">›</span></button>
  const openDetail = (kind: CellDetailKind) => { setSubmenu(null); setDraft(details[kind]); setView(kind) }
  const detailView = view === 'link' || view === 'comment' || view === 'note'

  return createPortal(<>
    <div className="fixed inset-0 z-[310]" onMouseDown={onClose} onContextMenu={event => { event.preventDefault(); onClose() }} />
    <div ref={menuRef} role={detailView ? 'dialog' : 'menu'} aria-label={detailView ? `Cell ${view}` : 'Cell actions'} className="fixed z-[320] w-80 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={placement} onScroll={() => setSubmenu(null)} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.stopPropagation()
        if (event.key === 'Escape') event.preventDefault()
        if (event.key === 'Escape' && submenu) closeSubmenu()
        else onClose()
      } else if (event.key === 'ArrowRight' && !detailView) {
        const kind = (document.activeElement as HTMLElement)?.dataset.submenu
        if (kind === 'insert' || kind === 'delete') {
          event.preventDefault()
          event.stopPropagation()
          openSubmenu(kind, true)
        }
      } else if (!detailView && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
        if (!items[next]?.dataset.submenu) setSubmenu(null)
      }
    }}>
      {view === 'main' && <>
        {action('Cut', 'cut', 'cut', 'Ctrl+X')}
        {action('Copy', 'copy', 'copy', 'Ctrl+C')}
        {action('Paste', 'paste', 'paste', 'Ctrl+V')}
        <div role="separator" className="my-1.5 border-t border-slate-200" />
        {action(`Insert ${rowCount} ${rowCount === 1 ? 'row' : 'rows'} above`, 'insert', 'insertRow')}
        {action(`Insert ${columnCount} ${columnCount === 1 ? 'column' : 'columns'} left`, 'insert', 'insertColumn')}
        {submenuTrigger('insert', 'Insert cells')}
        <div role="separator" className="my-1.5 border-t border-slate-200" />
        {action(`Delete ${rowCount === 1 ? 'row' : 'rows'}`, 'delete', 'deleteRow')}
        {action(`Delete ${columnCount === 1 ? 'column' : 'columns'}`, 'delete', 'deleteColumn')}
        {submenuTrigger('delete', 'Delete cells')}
        <div role="separator" className="my-1.5 border-t border-slate-200" />
        {(['link', 'comment', 'note'] as const).map(kind => <button key={kind} type="button" role="menuitem" className={itemClass} onMouseEnter={() => setSubmenu(null)} onClick={() => openDetail(kind)}><MenuIcon kind={kind} /><span>{details[kind] ? 'Edit' : kind === 'comment' ? 'Add' : 'Insert'} {kind}</span></button>)}
      </>}
      {detailView && <form className="space-y-3 p-3" onSubmit={event => { event.preventDefault(); onSaveDetail(view, draft) }}>
        <label className="block text-sm font-semibold capitalize text-slate-800">{view}
          {view === 'link' ? <input autoFocus type="url" required value={draft} onChange={event => setDraft(event.target.value)} placeholder="https://example.com" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#62853e]" /> : <textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-[#62853e]" />}
        </label>
        <div className="flex items-center justify-end gap-2">
          {details[view] && <button type="button" onClick={() => onSaveDetail(view, '')} className="mr-auto text-sm text-rose-600 hover:underline">Remove</button>}
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" className="rounded-lg bg-[#62853e] px-3 py-2 text-sm font-medium text-white hover:bg-[#526f34]">Save</button>
        </div>
      </form>}
    </div>
    {submenu && <div ref={submenuRef} id={submenuId} role="menu" aria-label={`${submenu === 'insert' ? 'Insert' : 'Delete'} cells`} className="fixed z-[330] w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl" style={submenuPlacement} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        closeSubmenu()
      } else if (event.key === 'Tab') {
        event.stopPropagation()
        onClose()
      } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(submenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }
    }}>
      {submenu === 'insert' ? <>{action('Shift cells right', 'insert', 'insertRight', undefined, true)}{action('Shift cells down', 'insert', 'insertDown', undefined, true)}</> : <>{action('Shift cells left', 'delete', 'deleteLeft', undefined, true)}{action('Shift cells up', 'delete', 'deleteUp', undefined, true)}</>}
    </div>}
  </>, document.body)
}
