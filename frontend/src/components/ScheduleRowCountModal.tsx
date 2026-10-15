import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { NumberInput } from './NumberInput'

interface ScheduleRowCountModalProps {
  yearLabel: string
  onClose: () => void
  onAdd: (count: number) => void
}

export function ScheduleRowCountModal({ yearLabel, onClose, onAdd }: ScheduleRowCountModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [count, setCount] = useState('1')
  const valid = Number.isSafeInteger(Number(count)) && Number(count) > 0

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose() }}
      onKeyDown={event => event.stopPropagation()}
      className="m-auto w-[calc(100%_-_2rem)] max-w-xs rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/30"
    >
      <form onSubmit={event => { event.preventDefault(); if (valid) onAdd(Number(count)) }}>
        <h2 id={titleId} className="text-lg font-semibold">Add Rows</h2>
        <p className="mt-1 break-words text-sm text-slate-500">{yearLabel}</p>
        <label htmlFor={inputId} className="mt-5 block text-sm font-medium">Number of rows</label>
        <NumberInput
          id={inputId}
          autoFocus
          required
          min={1}
          step={1}
          value={count}
          onFocus={event => event.currentTarget.select()}
          onChange={setCount}
          className="mt-2"
        />
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="brand" className="w-full" disabled={!valid}>Add Rows</Button>
        </div>
      </form>
    </dialog>, document.body,
  )
}
