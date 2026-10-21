import { useEffect, useMemo, useState } from 'react'
import { ChevronRightIcon, ClockIcon, DoorIcon } from './Icons'

export interface DashboardReservation {
  id: string
  roomId: string
  date: string
  startTime: string
  endTime: string
  purpose: string
  status: string
  isHidden: boolean
}

interface WeekReservationsCardProps {
  reservations: DashboardReservation[]
  roomsById: ReadonlyMap<string, string>
  isLoading: boolean
  hasError: boolean
  onViewAll: () => void
}

const statusClasses: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

export function WeekReservationsCard({ reservations, roomsById, isLoading, hasError, onViewAll }: WeekReservationsCardProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const datePart = (type: string) => todayParts.find(part => part.type === type)?.value || ''
  const todayUtc = new Date(Date.UTC(Number(datePart('year')), Number(datePart('month')) - 1, Number(datePart('day'))))
  const weekStartUtc = new Date(todayUtc)
  weekStartUtc.setUTCDate(todayUtc.getUTCDate() - (todayUtc.getUTCDay() + 6) % 7)
  const weekEndUtc = new Date(weekStartUtc)
  weekEndUtc.setUTCDate(weekStartUtc.getUTCDate() + 6)
  const weekStart = weekStartUtc.toISOString().slice(0, 10)
  const weekEnd = weekEndUtc.toISOString().slice(0, 10)
  const displayWeek = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  })
  const reservationDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  })
  const weekReservations = useMemo(() => reservations
    .filter(reservation => !reservation.isHidden && reservation.date >= weekStart && reservation.date <= weekEnd)
    .sort((first, second) => first.date.localeCompare(second.date) || first.startTime.localeCompare(second.startTime)),
  [reservations, weekStart, weekEnd])

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:flex lg:h-full lg:flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 leading-tight">This Week's Reservations</h3>
          <p className="text-xs text-gray-500 mt-0.5">{displayWeek.format(weekStartUtc)} – {displayWeek.format(weekEndUtc)}</p>
        </div>
        <button type="button" onClick={onViewAll} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
          <span>View All</span>
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto custom-scrollbar lg:min-h-0 lg:max-h-none lg:flex-1">
        {hasError ? (
          <p className="p-6 text-sm text-rose-600">This week's reservations are unavailable.</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading this week's reservations…</p>
        ) : weekReservations.length > 0 ? (
          weekReservations.map(reservation => (
            <div key={reservation.id} className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[7rem_auto_minmax(0,1fr)_auto] sm:px-5">
              <span className="text-xs font-bold text-slate-900">
                <span className="block">{reservation.startTime} – {reservation.endTime}</span>
                <span className="mt-0.5 block font-medium text-slate-500">{reservationDay.format(new Date(`${reservation.date}T00:00:00Z`))}</span>
              </span>
              <span className="flex min-w-0 max-w-40 items-center gap-1 text-xs font-medium text-slate-500">
                <DoorIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{roomsById.get(reservation.roomId) || 'Room'}</span>
              </span>
              <span className="min-w-0 truncate text-sm font-bold text-slate-900" title={reservation.purpose || 'Room reservation'}>{reservation.purpose || 'Room reservation'}</span>
              <span className={`w-fit justify-self-end rounded-md px-2.5 py-1 text-[0.65rem] font-bold ${statusClasses[reservation.status] || 'bg-slate-100 text-slate-700'}`}>
                {reservation.status}
              </span>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><ClockIcon className="h-6 w-6" /></div>
            <p className="text-sm font-bold text-slate-800">No reservations this week</p>
            <p className="mt-1 text-xs text-slate-400">You have no room bookings dated this week.</p>
          </div>
        )}
      </div>
    </div>
  )
}
