import { useEffect, useMemo, useRef, useState } from 'react'

interface ExcelColumnFilterMenuProps {
  anchor: HTMLButtonElement
  label: string
  values: readonly string[]
  selected?: ReadonlySet<string>
  onApply: (values: ReadonlySet<string> | undefined) => void
  onClose: () => void
}

export function ExcelColumnFilterMenu({ anchor, label, values, selected, onApply, onClose }: ExcelColumnFilterMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState(() => new Set(selected ?? values))
  const matching = useMemo(() => values.filter(value => (value || '(Blanks)').toLocaleLowerCase().includes(search.toLocaleLowerCase())), [values, search])
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(288, window.innerWidth - 16)
  const maxHeight = Math.min(420, window.innerHeight - 16)
  const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - maxHeight - 8))
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))

  useEffect(() => {
    menuRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !anchor.contains(event.target)) onClose()
    }
    const moved = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      onClose()
    }
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', onClose)
    document.addEventListener('scroll', moved, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('resize', onClose)
      document.removeEventListener('scroll', moved, true)
    }
  }, [anchor, onClose])

  const close = () => { onClose(); anchor.focus({ preventScroll: true }) }
  const toggleMatching = () => setChecked(current => {
    const next = new Set(current)
    const remove = matching.every(value => next.has(value))
    matching.forEach(value => { if (remove) next.delete(value); else next.add(value) })
    return next
  })

  return <div ref={menuRef} role="dialog" aria-label={`Filter ${label}`} className="fixed z-[240] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-xl" style={{ top, left, width, maxHeight }} onKeyDown={event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); close() }
    if (event.key === 'Tab') {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <p className="mb-2 truncate font-semibold" title={label}>{label}</p>
    <button type="button" className="mb-2 text-left font-medium text-[#526f34] hover:underline" onClick={() => { onApply(undefined); close() }}>Clear this column’s filter</button>
    <input type="search" aria-label={`Search values in ${label}`} placeholder="Search values…" value={search} onChange={event => setSearch(event.target.value)} className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#a3c48b]" />
    <label className="flex items-center gap-2 border-b border-slate-200 pb-2"><input type="checkbox" checked={matching.length > 0 && matching.every(value => checked.has(value))} onChange={toggleMatching} className="accent-[#62853e]" />Select all{search ? ' matches' : ''}</label>
    <div className="min-h-0 flex-1 overflow-y-auto py-2">
      {!matching.length && <p className="text-slate-500">No matching values.</p>}
      {matching.slice(0, 200).map(value => <label key={value} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-[#f3f7ee]"><input type="checkbox" checked={checked.has(value)} onChange={() => setChecked(current => {
        const next = new Set(current)
        if (next.has(value)) next.delete(value); else next.add(value)
        return next
      })} className="mt-0.5 accent-[#62853e]" /><span className="min-w-0 break-words whitespace-pre-wrap">{value || '(Blanks)'}</span></label>)}
      {matching.length > 200 && <p className="mt-2 text-xs text-slate-500">Showing the first 200 values. Search to narrow the list.</p>}
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-2">
      <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">Cancel</button>
      <button type="button" onClick={() => { onApply(values.every(value => checked.has(value)) ? undefined : checked); close() }} className="rounded-lg bg-[#62853e] px-3 py-1.5 font-medium text-white hover:bg-[#526f34]">Apply</button>
    </div>
  </div>
}
