import { useEffect } from 'react'
import { Button } from './Button'
import { CalendarIcon, ClockIcon, DoorIcon, UserIcon } from './Icons'
import { FACILITY_FIELD_LABELS, facilityValue } from '../utils/facilityLog'

export interface FacilityLogDetails {
  target: string
  targetDetail?: string
  action: string
  detail: string
  actor: string
  role?: string
  date: string
  time: string
  sourcePath?: string
  buildingName?: string
  facilitySnapshot?: Record<string, unknown>
  facilityChanges?: Record<string, unknown>
  deletedRooms?: Array<{ id: string; name: string; code: string }>
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const panel = 'rounded-xl border border-slate-200/80 bg-slate-50/80 p-3'
const label = 'text-[0.65rem] font-bold uppercase tracking-widest text-slate-500'

function postedDate(value: unknown) {
  const date = typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime())
    ? `${date.toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} PHT`
    : 'Date unavailable'
}

function changeValue(field: string, value: unknown, side?: 'before' | 'after') {
  if (field === 'image') return text(value) ? side === 'before' ? 'Previous image' : 'New image' : 'No image'
  if (field === 'capacity' && typeof value === 'number') return `${value} pax`
  if (field === 'maxBookingMins' && value === 0) return 'No maximum'
  if (['minBookingMins', 'maxBookingMins'].includes(field) && typeof value === 'number') return `${value} mins`
  return facilityValue(value)
}

export function FacilityLogDetailsModal({ event, onClose }: { event: FacilityLogDetails; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const snapshot = event.facilitySnapshot || {}
  const [collectionName, sourceId] = (event.sourcePath || '').split('/')
  const isComment = collectionName === 'comments'
  const isRoom = collectionName === 'rooms'
  const isFacility = collectionName === 'facilities'
  const kind = isComment ? 'Comment' : isRoom ? 'Room' : isFacility ? 'Facility' : 'Building'
  const operation = event.action.startsWith('Deleted') ? 'Deleted' : event.action.startsWith('Added') ? 'Added' : 'Edited'
  const operationClass = operation === 'Deleted' ? 'bg-rose-100 text-rose-700'
    : operation === 'Added' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
  const changes = Object.entries(event.facilityChanges || {}).filter(([field]) => !['record', 'rooms', 'facilities'].includes(field))
  const days = Array.isArray(snapshot.availableDays) ? snapshot.availableDays.filter((day): day is string => typeof day === 'string') : []
  const amenities = Array.isArray(snapshot.amenities) ? snapshot.amenities.filter((item): item is string => typeof item === 'string') : []

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="facility-log-title" aria-describedby="facility-log-description" className={`flex ${isRoom ? 'max-h-[80dvh]' : 'max-h-[calc(100dvh-2rem)]'} w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200`}>
        <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
          <h3 id="facility-log-title" className="text-xl font-bold leading-tight">{kind} Details</h3>
          <p id="facility-log-description" className="mt-1 text-sm text-white/80">Review {kind.toLowerCase()} information and recorded changes</p>
        </div>

        <div className={`min-h-0 overflow-y-auto custom-scrollbar ${isRoom ? 'max-h-[400px]' : ''}`}>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="break-words text-xl font-bold leading-tight text-slate-900">{text(snapshot.name) || event.target}</h4>
                <p className="mt-0.5 break-words text-sm font-semibold text-slate-500">{isComment ? 'Room comment' : isRoom || isFacility ? text(snapshot.type) || kind : 'Building'}{(isRoom || isFacility || isComment) && event.buildingName ? ` · ${event.buildingName}` : ''}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-widest ${operationClass}`}>{operation}</span>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm"><UserIcon className="h-6 w-6 text-slate-400" /></span>
              <div className="min-w-0 flex-1">
                <p className={`mb-1 ${label}`}>{operation === 'Added' ? 'Added by' : operation === 'Deleted' ? 'Deleted by' : 'Edited by'}</p>
                <p className="break-words text-sm font-bold leading-tight text-slate-700">{event.actor}</p>
                {event.role && <p className="mt-0.5 text-xs font-medium text-slate-500">{event.role}</p>}
              </div>
            </div>

            <div className={panel}>
              <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <div className="min-w-0"><dt className={`mb-1 ${label}`}>Event date</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700"><CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.date}</span></dd></div>
                <div className="min-w-0 min-[400px]:text-right"><dt className={`mb-1 ${label}`}>Time · PHT</dt><dd className="flex items-start gap-2 text-sm font-bold text-slate-700 min-[400px]:justify-end"><ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><span>{event.time}</span></dd></div>
              </dl>
              <p className="mt-3 border-t border-slate-200/80 pt-2.5 text-sm font-semibold text-slate-700">{event.action}</p>
              {!changes.length && <p className="mt-1 break-words text-xs leading-relaxed text-slate-500">{event.detail}</p>}
            </div>

            {changes.length > 0 && <section aria-labelledby="facility-changes-title" className="space-y-2">
              <h5 id="facility-changes-title" className={label}>Recorded changes</h5>
              {changes.map(([field, value]) => {
                const change = record(value)
                return <div key={field} className={panel}>
                  <h6 className="mb-2 break-words text-sm font-bold text-slate-700">{FACILITY_FIELD_LABELS[field] || field}</h6>
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5"><dt className={label}>Before</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-500">{changeValue(field, change.before, 'before')}</dd></div>
                    <div className="min-w-0 rounded-lg border border-[#c6dbb6] bg-[#f3f7ee] p-2.5"><dt className={`${label} text-[#526f34]`}>After</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-700">{changeValue(field, change.after, 'after')}</dd></div>
                  </dl>
                </div>
              })}
            </section>}

            <section aria-labelledby="facility-snapshot-title" className="space-y-3">
              <h5 id="facility-snapshot-title" className={label}>Details at the time of this event</h5>
              {!isComment && <dl className={`grid gap-3 ${isRoom || isFacility ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'}`}>
                {[
                  ['Code', facilityValue(snapshot.code)],
                  ...(isRoom || isFacility ? [['Floor', facilityValue(snapshot.floor)], ['Capacity', typeof snapshot.capacity === 'number' ? `${snapshot.capacity} pax` : 'Not set']] : []),
                ].map(([title, value]) => <div key={title} className="min-w-0 space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5"><dt className={label}>{title}</dt><dd className="break-words text-sm font-bold text-slate-700">{value}</dd></div>)}
              </dl>}

              {isFacility && <div className={panel}><h6 className={label}>Status</h6><p className="mt-1 text-sm font-bold text-slate-700">{facilityValue(snapshot.status)}</p></div>}

              {(isRoom || isFacility) && <>
                <div className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><h6 className={label}>Availability</h6><span className={`rounded-md px-2 py-1 text-[0.65rem] font-bold ${snapshot.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : snapshot.status === 'Maintenance' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{facilityValue(snapshot.status)}</span></div>
                  <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700"><ClockIcon className="h-4 w-4 shrink-0 text-[var(--brand-color)]" />{facilityValue(snapshot.startTime)} – {facilityValue(snapshot.endTime)}</p>
                  <p className="mt-2 border-t border-slate-200/80 pt-2.5 text-xs font-medium leading-relaxed text-slate-500">{days.length ? days.join(', ') : 'No available days'}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  {[['Minimum booking', changeValue('minBookingMins', snapshot.minBookingMins)], ['Maximum booking', changeValue('maxBookingMins', snapshot.maxBookingMins)]].map(([title, value]) => <div key={title} className="min-w-0 space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5"><dt className={label}>{title}</dt><dd className="break-words text-sm font-bold text-slate-700">{value}</dd></div>)}
                </dl>
                <div className={panel}><h6 className={`mb-1 ${label}`}>Description</h6><p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-slate-600">{text(snapshot.description) || 'No description provided.'}</p></div>
                <div className={panel}><h6 className={`mb-2 ${label}`}>Amenities</h6>{amenities.length ? <ul className="flex flex-wrap gap-2">{amenities.map(amenity => <li key={amenity} className="max-w-full break-words rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{amenity}</li>)}</ul> : <p className="text-sm text-slate-500">No amenities listed.</p>}</div>
              </>}

              {isComment && <div className={panel}>
                <h6 className={label}>Deleted comment</h6>
                <p className="mt-2 break-words text-sm font-bold text-slate-700">{text(snapshot.authorName) || 'Unknown author'}</p>
                <p className="mt-0.5 text-xs text-slate-500">Posted {postedDate(snapshot.createdAt)}</p>
                <p className="mt-3 whitespace-pre-wrap break-words border-t border-slate-200/80 pt-2.5 text-sm font-semibold leading-relaxed text-slate-600">{text(snapshot.text) || 'Comment text unavailable.'}</p>
              </div>}

              {Boolean(event.deletedRooms?.length) && <div className={panel}>
                <h6 className={label}>Rooms removed with this building ({event.deletedRooms?.length})</h6>
                <ul className="mt-3 divide-y divide-slate-200/80">{event.deletedRooms?.map(room => <li key={room.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0"><DoorIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" /><div className="min-w-0"><p className="break-words text-sm font-bold text-slate-700">{room.name || room.code || 'Unnamed room'}</p>{room.code && <p className="break-words text-xs text-slate-500">{room.code}</p>}</div></li>)}</ul>
              </div>}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] font-bold uppercase tracking-widest text-slate-400">
              <span>Historical record</span>{sourceId && <span title={sourceId}>ID: {sourceId.slice(0, 8)}</span>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 bg-white px-5 py-4"><Button type="button" variant="outline" className="h-12 flex-1 text-base" autoFocus onClick={onClose}>Close</Button></div>
      </div>
    </div>
  )
}
