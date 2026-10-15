import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import type { ExcelScheduleRowIssues } from '../utils/ScheduleValidation'

interface ExcelScheduleStatusConfirmModalProps {
  status: 'Plot' | 'Draft'
  rowCount: number
  validationIssues?: readonly ExcelScheduleRowIssues[]
  onConfirm: () => void
  onClose: () => void
}

export function ExcelScheduleStatusConfirmModal({ status, rowCount, validationIssues = [], onConfirm, onClose }: ExcelScheduleStatusConfirmModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const validationId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const action = status === 'Plot' ? 'Plot' : 'Unplot'
  const showValidationIssues = status === 'Plot' && validationIssues.length > 0

  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])
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
  }, [onClose])

  return createPortal(<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${descriptionId}${showValidationIssues ? ` ${validationId}` : ''}`}
      onKeyDown={event => event.stopPropagation()}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
        <h3 id={titleId} className="text-xl font-bold">{action} schedule?</h3>
        <p className="mt-1 truncate text-sm text-white/80">Are you sure you want to {action.toLowerCase()}?</p>
      </div>
      <div className="space-y-5 p-6">
        <p id={descriptionId} className="text-sm text-slate-600">{status === 'Plot' ? 'Mark' : 'Return'} {rowCount} selected schedule {rowCount === 1 ? 'row' : 'rows'} {status === 'Plot' ? 'as Plot' : 'to Draft'}? Save the workbook afterward to update the schedule.</p>
        {showValidationIssues && <div id={validationId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <p className="text-sm font-semibold">Validation errors in {validationIssues.length} selected schedule {validationIssues.length === 1 ? 'row' : 'rows'}</p>
          <p className="mt-1 text-xs">Review these errors before plotting. You can still confirm Plot.</p>
          <div className="mt-3 max-h-48 space-y-3 overflow-y-auto">
            {validationIssues.map(issue => <div key={issue.row}>
              <p className="text-xs font-semibold">Row #{issue.row + 1}</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {issue.messages.map(message => <li key={message}>{message}</li>)}
              </ul>
            </div>)}
          </div>
        </div>}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="brand" onClick={onConfirm} className="flex-1">Confirm {action}</Button>
        </div>
      </div>
    </div>
  </div>, document.body)
}
