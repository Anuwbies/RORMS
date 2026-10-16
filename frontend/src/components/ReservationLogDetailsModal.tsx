import { useEffect } from 'react'
import { Button } from './Button'
import { CalendarIcon, ClockIcon, UserIcon } from './Icons'

export interface ReservationLogSource {
  reservation: {
    id: string
    date: string
    startTime: string
    endTime: string
    status: string
    purpose?: string
    subjectCode?: string
    classSection?: string
    department?: string
    duration?: number
    attendees?: number
    createdAt?: Date
  }
  roomName: string
  roomType: string
  requester?: { name: string; email?: string }
}

interface ReservationLogDetails {
  id: string
  actor: string
  role: string
  date: string
  time: string
  action: string
  reviewStage?: 'Registrar' | 'Dean'
  outcome: string
  sourceId?: string
  reservationSnapshot?: { date: string; department: string; beforeStatus: string; afterStatus: string }
}

const label = 'text-[0.65rem] font-bold uppercase tracking-widest text-slate-500'
const panel = 'rounded-xl border border-slate-200/80 bg-slate-50/80 p-3'
const statusClasses: Record<string, string> = {
  'Recommending Approval': 'bg-sky-100 text-sky-700',
  Pending: 'bg-amber-100 text-amber-700', Approved: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-rose-100 text-rose-700', Cancelled: 'bg-slate-100 text-slate-700', Completed: 'bg-blue-100 text-blue-700',
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex max-w-full break-words rounded-md px-2.5 py-1 text-xs font-bold ${statusClasses[value] || 'bg-slate-100 text-slate-600'}`}>{value || 'Unknown'}</span>
}

function bookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || 'Date unavailable'
  const date = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? 'Date unavailable'
    : date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function ReservationLogDetailsModal({ event, source, isLoading, sourceNotice, onClose }: {
  event: ReservationLogDetails
  source: ReservationLogSource | null
  isLoading: boolean
  sourceNotice: string
  onClose: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const recorded = event.reservationSnapshot
  const reservation = source?.reservation

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="reservation-log-title" aria-describedby="reservation-log-description" className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
          <h3 id="reservation-log-title" className="text-xl font-bold leading-tight">Reservation Log Details</h3>
          <p id="reservation-log-description" className="mt-1 text-sm text-white/80">Review the recorded action and reservation information</p>
        </div>

        <div className="max-h-[400px] min-h-0 overflow-y-auto p-5 custom-scrollbar">
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h4 className="min-w-0 break-words text-xl font-bold leading-tight text-slate-900">{event.action}</h4>
              <span className="shrink-0 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-widest text-emerald-700">{event.outcome}</span>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"><UserIcon className="h-6 w-6 text-slate-400" /></span>
              <div className="min-w-0"><p className={`mb-1 ${label}`}>Changed by</p><p className="break-words text-sm font-bold leading-tight text-slate-700">{event.actor}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{event.role}</p></div>
            </div>

            <dl className={`grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 ${panel}`}>
              <div className="min-w-0"><dt className={`mb-1 ${label}`}>Event date</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700"><CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.date}</span></dd></div>
              <div className="min-w-0 min-[400px]:text-right"><dt className={`mb-1 ${label}`}>Time · PHT</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700 min-[400px]:justify-end"><ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.time}</span></dd></div>
            </dl>

            <div className={panel}>
              <h5 className={`mb-2 ${label}`}>{event.reviewStage ? `${event.reviewStage} recommendation` : 'Recorded status change'}</h5>
              <dl className="grid grid-cols-2 gap-3">
                <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5"><dt className={`mb-2 ${label}`}>Before</dt><dd><Status value={recorded?.beforeStatus || 'Unknown'} /></dd></div>
                <div className="min-w-0 rounded-lg border border-[#c6dbb6] bg-[#f3f7ee] p-2.5"><dt className={`mb-2 ${label}`}>After</dt><dd><Status value={recorded?.afterStatus || 'Unknown'} /></dd></div>
              </dl>
            </div>

            <div className={panel}>
              <h5 className={`mb-2 ${label}`}>Reservation at the time of this event</h5>
              <dl className="grid grid-cols-2 gap-3">
                <div className="min-w-0"><dt className={label}>Booking date</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{bookingDate(recorded?.date || '')}</dd></div>
                <div className="min-w-0"><dt className={label}>Department</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{recorded?.department || 'Not recorded'}</dd></div>
              </dl>
            </div>

            {sourceNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">{sourceNotice}</p>}
            <details className={panel}>
              <summary className="cursor-pointer text-sm font-bold text-slate-700">Current reservation information{isLoading ? ' · Loading…' : ''}</summary>
              <div className="mt-3 space-y-3" aria-live="polite">
                {isLoading ? <p className="text-xs text-slate-500">Loading the source reservation…</p> : source && reservation ? <>
                  <p className="text-xs leading-relaxed text-slate-500">Current information may differ from the recorded event above.</p>
                  <div><p className="break-words text-lg font-bold text-slate-900">{source.roomName}</p><p className="text-sm font-semibold text-slate-500">{source.roomType}</p></div>
                  <dl className="grid grid-cols-2 gap-3">
                    {[
                      ['Reserved by', source.requester?.name || 'Requester unavailable'],
                      ['Current status', reservation.status],
                      ['Booking date', bookingDate(reservation.date)],
                      ['Time', `${reservation.startTime || 'Not set'} – ${reservation.endTime || 'Not set'}`],
                      ['Attendees', reservation.attendees === undefined ? 'Not recorded' : `${reservation.attendees} pax`],
                      ['Duration', reservation.duration === undefined ? 'Not recorded' : `${reservation.duration} mins`],
                      ['Subject code', reservation.subjectCode || 'N/A'],
                      ['Section', reservation.classSection || 'N/A'],
                      ['Department', reservation.department || 'Unassigned'],
                      ['Requested', reservation.createdAt?.toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }) || 'Date unavailable'],
                    ].map(([title, value]) => <div key={title} className="min-w-0"><dt className={label}>{title}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</dd></div>)}
                  </dl>
                  {source.requester?.email && <p className="break-all text-xs text-slate-500">{source.requester.email}</p>}
                  <div className="border-t border-slate-200/80 pt-2.5"><h6 className={`mb-1 ${label}`}>Purpose</h6><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600">{reservation.purpose || 'No purpose specified.'}</p></div>
                </> : <p className="text-xs text-slate-500">Current reservation information is unavailable. The recorded event is preserved above.</p>}
              </div>
            </details>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-slate-400"><span title={event.id}>Log: {event.id.slice(0, 8)}</span>{event.sourceId && <span title={event.sourceId}>Reservation: {event.sourceId.slice(0, 8)}</span>}</div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 bg-white px-5 py-4"><Button type="button" variant="outline" className="h-12 flex-1 text-base" autoFocus onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}
