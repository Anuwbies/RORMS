import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

export interface ImportSheetChoice {
  name: string
  hidden: boolean
}

interface ExcelImportSheetsModalProps {
  fileName: string
  sheets: ImportSheetChoice[]
  onImport: (sheetNames: string[]) => void
  onClose: () => void
  mode?: 'import' | 'export'
  busy?: boolean
  error?: string
}

export function ExcelImportSheetsModal({ fileName, sheets, onImport, onClose, mode = 'import', busy = false, error }: ExcelImportSheetsModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); return }
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || [])
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKeys, true)
    return () => {
      document.removeEventListener('keydown', handleKeys, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [onClose, busy])

  return createPortal(<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[75vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
        <h3 id={titleId} className="text-xl font-bold">Choose sheets to {mode}</h3>
        <p className="mt-1 truncate text-sm text-white/80" title={fileName}>{fileName}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <p className="text-sm text-slate-600">Select the sheets you want to {mode}.</p>
        <div className="flex shrink-0 items-center justify-between gap-3 text-sm">
          <span className="text-slate-600" role="status">{selected.size} of {sheets.length} selected</span>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => setSelected(new Set(sheets.map(sheet => sheet.name)))} className="font-medium text-[#526f34] hover:underline">Select all</button>
            <button type="button" disabled={busy} onClick={() => setSelected(new Set())} className="font-medium text-slate-600 hover:underline">Clear</button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-xl border border-slate-200">
          {sheets.map(sheet => <label key={sheet.name} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-800 last:border-b-0 hover:bg-[#f3f7ee]">
            <input type="checkbox" disabled={busy} checked={selected.has(sheet.name)} onChange={event => {
              const checked = event.target.checked
              setSelected(current => { const next = new Set(current); if (checked) next.add(sheet.name); else next.delete(sheet.name); return next })
            }} className="h-4 w-4 shrink-0 accent-[#62853e]" />
            <span className="min-w-0 break-words">{sheet.name}</span>
            {sheet.hidden && <span className="ml-auto shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{mode === 'import' ? 'Hidden in file' : 'Hidden'}</span>}
          </label>)}
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex shrink-0 gap-3">
          <Button variant="outline" disabled={busy} onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="brand" disabled={!selected.size || busy} onClick={() => onImport(sheets.filter(sheet => selected.has(sheet.name)).map(sheet => sheet.name))} className="flex-1">{busy ? 'Exporting…' : mode === 'import' ? 'Import selected' : 'Export selected'}</Button>
        </div>
      </div>
    </div>
  </div>, document.body)
}
