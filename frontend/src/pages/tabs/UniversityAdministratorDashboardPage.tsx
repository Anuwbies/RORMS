import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { SectionHeader } from '../../components/SectionHeader'
import { AlertCircleIcon, ArrowRightIcon, BuildingIcon, CalendarIcon, CheckIcon, ClipboardIcon, DoorIcon } from '../../components/Icons'
import { universityDashboardData, type UniversityDashboardReservation, type UniversityDashboardRoom } from '../../utils/universityDashboard'

type DashboardTab = 'buildingsRooms' | 'manageReservations' | 'analytics' | 'reports'
interface UniversityAdministratorDashboardPageProps {
  headerAction?: ReactNode
}

function useDashboardCollection<T extends { id: string }>(name: string) {
  const [records, setRecords] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  useEffect(() => onSnapshot(collection(db, name), snapshot => {
    setRecords(snapshot.docs.map(item => ({ ...item.data(), id: item.id }) as T))
    setIsLoading(false)
    setHasError(false)
  }, error => {
    console.error(`Unable to load ${name} for the University Administrator dashboard:`, error)
    setIsLoading(false)
    setHasError(true)
  }), [name])
  return { records, isLoading, hasError }
}

function displayTime(value?: string) {
  if (!value) return 'Time not set'
  const [hour, minute] = value.split(':').map(Number)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function navigateTo(tab: DashboardTab) {
  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tab }))
}

const shortcuts: { tab: DashboardTab; label: string; description: string; icon: typeof BuildingIcon }[] = [
  { tab: 'buildingsRooms', label: 'Buildings & Rooms', description: 'Maintain rooms and facility information', icon: BuildingIcon },
  { tab: 'manageReservations', label: 'Manage Reservations', description: 'Review requests and update their status', icon: ClipboardIcon },
  { tab: 'analytics', label: 'Analytics', description: 'Explore reservation demand and room readiness', icon: CalendarIcon },
  { tab: 'reports', label: 'Reports', description: 'Review and export reservation and facility reports', icon: ClipboardIcon },
]

export default function UniversityAdministratorDashboardPage({ headerAction }: UniversityAdministratorDashboardPageProps) {
  const rooms = useDashboardCollection<UniversityDashboardRoom>('rooms')
  const reservations = useDashboardCollection<UniversityDashboardReservation>('reservations')
  const buildings = useDashboardCollection<{ id: string }>('buildings')
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const data = useMemo(() => universityDashboardData(rooms.records, reservations.records, now), [rooms.records, reservations.records, now])
  const roomsById = useMemo(() => new Map(rooms.records.map(room => [room.id, room.name || room.code || 'Unnamed room'])), [rooms.records])
  const isLoading = rooms.isLoading || reservations.isLoading || buildings.isLoading
  const hasError = rooms.hasError || reservations.hasError || buildings.hasError
  const peak = Math.max(1, ...data.week.map(day => day.total))
  const availability = rooms.records.length ? Math.round(data.available / rooms.records.length * 100) : 0
  const roomStatuses = [
    { label: 'Available', value: data.available, color: 'bg-emerald-500', surface: 'bg-emerald-50 text-emerald-700' },
    { label: 'Unavailable', value: data.unavailable, color: 'bg-amber-500', surface: 'bg-amber-50 text-amber-700' },
    { label: 'Maintenance', value: data.maintenance, color: 'bg-rose-500', surface: 'bg-rose-50 text-rose-700' },
  ]
  const attentionItems: { label: string; description: string; count: number; tab: DashboardTab }[] = [
    { label: 'Pending reservations', description: 'Requests waiting for a decision', count: data.pending.length, tab: 'manageReservations' },
    { label: 'Rooms under maintenance', description: 'Review facility readiness', count: data.maintenance, tab: 'buildingsRooms' },
    { label: 'Unavailable rooms', description: 'Review rooms currently unavailable', count: data.unavailable, tab: 'buildingsRooms' },
  ]
  const activeAttention = attentionItems.filter(item => item.count > 0)

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader title="University Administrator Dashboard" description="General Service Department overview of room readiness, reservations, and facility operations." action={headerAction} />

        {hasError && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"><AlertCircleIcon className="h-5 w-5 shrink-0" /><div><p className="text-sm font-bold">Some live information is unavailable</p><p className="mt-1 text-xs">Affected totals may be incomplete. Available information is shown below.</p></div></div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Pending Requests', value: reservations.isLoading || reservations.hasError ? '—' : data.pending.length, detail: 'Waiting for an approval decision', icon: ClipboardIcon, tab: 'manageReservations' as const, action: 'Review' },
            { label: 'Today’s Reservations', value: reservations.isLoading || reservations.hasError ? '—' : data.todayReservations.length, detail: 'Pending, approved, and completed today', icon: CalendarIcon, tab: 'manageReservations' as const, action: 'View' },
            { label: 'Available Rooms', value: rooms.isLoading || rooms.hasError ? '—' : `${data.available} / ${rooms.records.length}`, detail: 'Rooms marked ready for use', icon: DoorIcon, tab: 'buildingsRooms' as const, action: 'Explore' },
            { label: 'Buildings', value: buildings.isLoading || buildings.hasError ? '—' : buildings.records.length, detail: 'Campus facilities in the directory', icon: BuildingIcon, tab: 'buildingsRooms' as const, action: 'Manage' },
          ].map(item => {
            const Icon = item.icon
            return (
              <button key={item.label} type="button" onClick={() => navigateTo(item.tab)} className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-600">{item.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-3xl font-black text-slate-900">{item.value}</p>
                  <span className="flex items-center gap-1 text-xs font-bold text-slate-600">{item.action}<ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="flex min-h-64 max-h-96 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div className="min-w-0"><h2 className="font-black text-slate-900">Today’s reservation timeline</h2><p className="mt-1 text-xs text-slate-400">{now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div><button type="button" onClick={() => navigateTo('manageReservations')} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#526f34]">View all <ArrowRightIcon className="h-4 w-4" /></button></header>
            <div className="custom-scrollbar min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
              {reservations.isLoading ? <p className="p-5 text-sm text-slate-500">Loading reservations…</p> : data.todayReservations.length === 0 ? <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-5 text-center"><CalendarIcon className="h-8 w-8 text-slate-300" /><p className="text-sm font-bold text-slate-600">{reservations.hasError ? 'Reservations are currently unavailable' : 'No reservations scheduled today'}</p></div> : data.todayReservations.slice(0, 5).map(item => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5"><div className="w-24 shrink-0"><p className="text-sm font-black text-slate-800">{displayTime(item.startTime)}</p><p className="mt-1 text-xs text-slate-400">to {displayTime(item.endTime)}</p></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.purpose || 'Room reservation'}</p><p className="mt-1 truncate text-xs text-slate-500">{roomsById.get(item.roomId || '') || 'Room unavailable'}</p></div><span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${item.status?.toLowerCase() === 'approved' ? 'bg-emerald-100 text-emerald-700' : item.status?.toLowerCase() === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span></div>
              ))}
            </div>
          </section>

          <section className="flex min-h-64 max-h-96 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5">
            <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4"><AlertCircleIcon className="h-6 w-6 shrink-0 text-amber-500" /><div><h2 className="font-black text-slate-900">Requires attention</h2><p className="mt-1 text-xs text-slate-400">Reservation requests and facility readiness</p></div></header>
            <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {isLoading ? <p className="text-sm text-slate-500">Loading live information…</p> : activeAttention.length ? activeAttention.map(item => <button key={item.label} type="button" onClick={() => navigateTo(item.tab)} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-colors hover:bg-slate-50"><span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-amber-50 text-sm font-black text-amber-700">{item.count}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">{item.label}</span><span className="mt-1 block text-xs text-slate-500">{item.description}</span></span><ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-400" /></button>) : <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"><CheckIcon className="h-8 w-8 text-emerald-500" /><p className="text-sm font-bold text-slate-600">{hasError ? 'Some information is unavailable' : 'No requests or rooms require attention'}</p></div>}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Seven-day reservation demand</h2><p className="mt-1 text-xs text-slate-400">Approved and pending bookings · Philippine time</p></div><button type="button" onClick={() => navigateTo('analytics')} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#526f34]">Analytics <ArrowRightIcon className="h-4 w-4" /></button></div>
            {reservations.isLoading || reservations.hasError ? <p className="py-12 text-center text-sm text-slate-500">{reservations.isLoading ? 'Loading reservation demand…' : 'Reservation demand is unavailable'}</p> : <><div className="mt-5 flex h-44 items-end gap-2 sm:gap-3">{data.week.map(day => <div key={day.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${day.label}: ${day.approved} approved, ${day.pending} pending`}><span className="mb-1 text-xs font-bold text-slate-600">{day.total}</span><div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-md bg-slate-100" style={{ height: day.total ? `${Math.max(4, day.total / peak * 65)}%` : '4px' }}>{day.approved > 0 && <span className="bg-emerald-500" style={{ height: `${day.approved / day.total * 100}%` }} />}{day.pending > 0 && <span className="bg-amber-400" style={{ height: `${day.pending / day.total * 100}%` }} />}</div><span className="mt-2 text-center text-[0.65rem] font-bold text-slate-500">{day.label}</span></div>)}</div><div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" />Approved</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span><span className="ml-auto font-bold">{data.week.reduce((sum, day) => sum + day.total, 0)} bookings</span></div></>}
          </section>

          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Room readiness</h2><p className="mt-1 text-xs text-slate-400">Current room status and seating capacity</p></div><button type="button" onClick={() => navigateTo('buildingsRooms')} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#526f34]">View rooms <ArrowRightIcon className="h-4 w-4" /></button></div>
            {rooms.isLoading || rooms.hasError ? <p className="py-12 text-center text-sm text-slate-500">{rooms.isLoading ? 'Loading room readiness…' : 'Room readiness is unavailable'}</p> : <>
              <div className="mt-5 flex items-end justify-between gap-3"><div><p className="text-4xl font-black text-[#41572a]">{availability}%</p><p className="mt-1 text-xs font-bold text-slate-500">{rooms.records.length ? 'of rooms available' : 'No rooms added yet'}</p></div><div className="text-right"><p className="text-xl font-black text-slate-900">{data.capacity.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">total seats</p></div></div>
              <div role="img" aria-label={`${data.available} available rooms, ${data.unavailable} unavailable rooms, ${data.maintenance} rooms under maintenance`} className="mt-5 flex h-4 overflow-hidden rounded-full bg-slate-100">{roomStatuses.filter(item => item.value > 0).map(item => <span key={item.label} className={item.color} style={{ width: `${item.value / rooms.records.length * 100}%` }} />)}</div>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">{roomStatuses.map(item => <div key={item.label} className={`rounded-xl px-3 py-3 ${item.surface}`}><p className="text-xl font-black">{item.value}</p><p className="mt-1 text-xs font-bold">{item.label}</p></div>)}</div>
              <p className="mt-auto pt-4 text-xs text-slate-500">Readiness reflects each room’s status in Buildings &amp; Rooms.</p>
            </>}
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-900">Quick access</h2><p className="mt-1 text-xs text-slate-500">Manage facilities and review reservation activity.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{shortcuts.map(item => {
            const Icon = item.icon
            return <button key={item.tab} type="button" onClick={() => navigateTo(item.tab)} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-[#c6dbb6] hover:bg-[#f3f7ee]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#62853e]" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">{item.label}</span><span className="mt-1 block text-xs text-slate-500">{item.description}</span></span><ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /></button>
          })}</div>
        </section>
      </div>
    </section>
  )
}
