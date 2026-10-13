import { useEffect } from 'react'
import { Button } from './Button'
import { CalendarIcon, ClockIcon, UserIcon } from './Icons'
import { scheduleChangeValue, type ScheduleLogSnapshot } from '../utils/scheduleLog'

interface ScheduleLogDetails {
  id?: string
  target: string
  targetDetail?: string
  action: string
  detail: string
  actor: string
  role?: string
  date: string
  time: string
  sourcePath?: string
  scheduleSnapshot?: ScheduleLogSnapshot
}

const label = 'text-[0.65rem] font-bold uppercase tracking-widest text-slate-500'
const panel = 'rounded-xl border border-slate-200/80 bg-slate-50/80 p-3'

function ChangeValue({ field, value }: { field: string; value: string | null }) {
  const formatted = scheduleChangeValue(field, value)
  return <>
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{formatted.text}</p>
    {formatted.recordedText && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Recorded text</summary><p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs">{formatted.recordedText}</p></details>}
  </>
}

export function ScheduleLogDetailsModal({ event, onClose }: { event: ScheduleLogDetails; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const snapshot = event.scheduleSnapshot

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="schedule-log-title" aria-describedby="schedule-log-description" className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
          <h3 id="schedule-log-title" className="text-xl font-bold leading-tight">Schedule Log Details</h3>
          <p id="schedule-log-description" className="mt-1 text-sm text-white/80">Review the recorded action and schedule changes</p>
        </div>

        <div className="max-h-[400px] min-h-0 space-y-3 overflow-y-auto p-5 custom-scrollbar">
          <div className="flex items-start justify-between gap-3"><h4 className="min-w-0 break-words text-xl font-bold leading-tight text-slate-900">{event.action}</h4><span className="shrink-0 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-widest text-emerald-700">Success</span></div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"><UserIcon className="h-6 w-6 text-slate-400" /></span>
            <div className="min-w-0"><p className={`mb-1 ${label}`}>Changed by</p><p className="break-words text-sm font-bold leading-tight text-slate-700">{event.actor}</p>{event.role && <p className="mt-0.5 text-xs font-medium text-slate-500">{event.role}</p>}</div>
          </div>

          <dl className={`grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 ${panel}`}>
            <div className="min-w-0"><dt className={`mb-1 ${label}`}>Event date</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700"><CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.date}</span></dd></div>
            <div className="min-w-0 min-[400px]:text-right"><dt className={`mb-1 ${label}`}>Time · PHT</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700 min-[400px]:justify-end"><ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.time}</span></dd></div>
          </dl>

          <div className={panel}><h5 className={`mb-1 ${label}`}>Source schedule</h5><p className="break-words text-lg font-bold text-slate-900">{event.target}</p><p className="mt-0.5 break-words text-sm font-semibold text-slate-500">{event.targetDetail}</p></div>
          <div className={panel}><h5 className={`mb-1 ${label}`}>Change summary</h5><p className="break-words text-sm font-semibold leading-relaxed text-slate-700">{event.detail}</p></div>

          {snapshot && !snapshot.baselineAvailable && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">No earlier saved version was available for comparison. Initial values are recorded as additions.</p>}

          {Boolean(snapshot?.samples.length) && <section aria-labelledby="schedule-changes-title" className="space-y-2">
            <h5 id="schedule-changes-title" className={label}>Recorded changes</h5>
            {snapshot?.samples.map((change, index) => <div key={index} className={panel}>
              <p className={`mb-1 break-words ${label}`}>{[change.sheet && `Sheet: ${change.sheet}`, change.location].filter(Boolean).join(' · ') || 'Workbook'}</p>
              <h6 className="mb-2 break-words text-sm font-bold text-slate-700">{change.field === 'Resolved meetings' ? 'Meeting details' : change.field === 'Validation issues' ? 'Validation checks' : change.field || 'Schedule change'}</h6>
              <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5"><dt className={`mb-2 ${label}`}>Before</dt><dd className="text-slate-500"><ChangeValue field={change.field} value={change.before} /></dd></div>
                <div className="min-w-0 rounded-lg border border-[#c6dbb6] bg-[#f3f7ee] p-2.5"><dt className={`mb-2 ${label}`}>After</dt><dd className="font-semibold text-slate-700"><ChangeValue field={change.field} value={change.after} /></dd></div>
              </dl>
            </div>)}
          </section>}
          {snapshot && !snapshot.samples.length && <p className="text-xs text-slate-500">No individual change descriptions were recorded for this event.</p>}
          {Boolean(snapshot?.omittedSamples) && <p className="text-xs leading-relaxed text-slate-500">{snapshot?.omittedSamples} additional change descriptions were not saved. The summary includes all counted changes.</p>}

          <details className={panel}>
            <summary className="cursor-pointer text-sm font-bold text-slate-700">Saved workbook information</summary>
            <dl className="mt-3 space-y-3">
              {[['File', snapshot?.fileName || 'Not recorded'], ['Saved revision', snapshot?.revision === undefined ? 'Not recorded' : String(snapshot.revision)], ['Sheets', snapshot?.sheetNames.join(', ') || 'None']].map(([title, value]) => <div key={title} className="min-w-0"><dt className={label}>{title}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</dd></div>)}
            </dl>
            <p className="mt-3 border-t border-slate-200/80 pt-2.5 text-xs leading-relaxed text-slate-500">These details belong to this saved event. Later edits do not change this history. Long recorded values may be shortened.</p>
          </details>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-slate-400"><span>Historical record</span>{event.id && <span title={event.id}>Log: {event.id.replace(/^schedule_/, '').slice(0, 8)}</span>}</div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 bg-white px-5 py-4"><Button type="button" variant="outline" className="h-12 flex-1 text-base" autoFocus onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}
