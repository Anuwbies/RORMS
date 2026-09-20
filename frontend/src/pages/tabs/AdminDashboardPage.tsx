import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/Button'
import { SummaryCard } from '../../components/SummaryCard'
import { SectionHeader } from '../../components/SectionHeader'
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DepartmentIcon,
  DoorIcon,
  PlusIcon,
  UsersIcon,
} from '../../components/Icons'
import { db } from '../../firebase'
import { collection, onSnapshot } from 'firebase/firestore'
import { useAcademicSemester } from '../../utils/academicSemester'

interface RoomRecord {
  id: string
  name?: string
  code?: string
  status?: string
  capacity?: number
}

interface ReservationRecord {
  id: string
  roomId?: string
  date?: string
  startTime?: string
  endTime?: string
  purpose?: string
  status?: string
}

interface UserRecord {
  id: string
  isActive?: boolean
}

interface InvitationRecord {
  id: string
  status?: string
  expiresAt?: unknown
}

interface ScheduleRecord {
  id: string
  parentId?: string
  status?: string
  academicYear?: string
  academicTerm?: string
  semester?: string
}

interface NamedRecord {
  id: string
}

function useCollectionData<T extends { id: string }>(collectionName: string) {
  const [records, setRecords] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, collectionName), snapshot => {
      setRecords(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T))
      setHasError(false)
      setIsLoading(false)
    }, error => {
      console.error(`Unable to load ${collectionName} for the Admin dashboard:`, error)
      setHasError(true)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [collectionName])

  return { records, isLoading, hasError }
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeToMinutes(time?: string) {
  if (!time) return 0
  const normalized = time.trim().toUpperCase()
  const isPM = normalized.includes('PM')
  const isAM = normalized.includes('AM')
  const [hourPart, minutePart] = normalized.replace(/[^\d:]/g, '').split(':')
  let hour = Number(hourPart || 0)
  const minute = Number(minutePart || 0)
  if (isPM && hour < 12) hour += 12
  if (isAM && hour === 12) hour = 0
  return hour * 60 + minute
}

function formatTime(time?: string) {
  if (!time) return 'Time not set'
  const minutes = timeToMinutes(time)
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function timestampToDate(value: unknown) {
  if (!value) return null
  if (typeof value === 'object' && 'toDate' in value) {
    const converter = (value as { toDate?: unknown }).toDate
    if (typeof converter === 'function') return converter.call(value) as Date
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

const reservationStatusClasses: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Completed: 'bg-blue-100 text-blue-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-600',
}

const phaseDescriptions: Record<string, string> = {
  Drafting: 'Departments are preparing class schedules and teaching assignments.',
  Plotting: 'Rooms are being assigned to submitted department schedules.',
  Revision: 'Returned schedules are being corrected before finalization.',
  Final: 'The active semester schedule is finalized and ready for use.',
  Closed: 'Scheduling activity for this semester is currently closed.',
}

const summaryCardGroups = [
  {
    source: 'Members',
    description: 'People, roles, and account status',
    icon: UsersIcon,
    accent: 'bg-purple-500',
    badge: 'border-purple-100 bg-purple-50 text-purple-700',
    cards: [
      { title: 'Total Members', description: 'Active members and pending invitations' },
      { title: 'Member Role Distribution', description: 'Role counts shown as a mountain landscape' },
      { title: 'Member Prison', description: 'Deactivated and pending account activity' },
    ],
  },
  {
    source: 'Buildings & Rooms',
    description: 'Campus spaces and capacity',
    icon: BuildingIcon,
    accent: 'bg-emerald-500',
    badge: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    cards: [
      { title: 'Total Buildings', description: 'Interactive overview of campus buildings' },
      { title: 'Total Rooms', description: 'Managed rooms with environmental context' },
      { title: 'Total Capacity', description: 'Campus-wide seating capacity' },
    ],
  },
  {
    source: 'Departments',
    description: 'Academic units and leadership',
    icon: DepartmentIcon,
    accent: 'bg-amber-500',
    badge: 'border-amber-100 bg-amber-50 text-amber-700',
    cards: [
      { title: 'Total Departments', description: 'Registered academic departments' },
      { title: 'Total Members', description: 'Faculty enrolled across departments' },
      { title: 'Dean Coverage', description: 'Department leadership coverage' },
    ],
  },
  {
    source: 'Reserve a Room',
    description: 'Bookable rooms and availability',
    icon: DoorIcon,
    accent: 'bg-sky-500',
    badge: 'border-sky-100 bg-sky-50 text-sky-700',
    cards: [
      { title: 'Available Rooms', description: 'Rooms currently ready to reserve' },
      { title: 'Total Buildings', description: 'Facilities available for reservations' },
      { title: 'Total Capacity', description: 'Maximum occupancy across bookable rooms' },
    ],
  },
  {
    source: 'Department Schedules',
    description: 'Proposal and plotting workflow',
    icon: CalendarIcon,
    accent: 'bg-rose-500',
    badge: 'border-rose-100 bg-rose-50 text-rose-700',
    cards: [
      { title: 'Plot Schedules', description: 'Schedules ready for room plotting' },
      { title: 'Drafted Proposals', description: 'Department schedules still in draft' },
      { title: 'Revised & Returned', description: 'Schedules requiring another review' },
    ],
  },
  {
    source: 'My Schedule',
    description: 'Personal teaching workload',
    icon: CalendarIcon,
    accent: 'bg-blue-500',
    badge: 'border-blue-100 bg-blue-50 text-blue-700',
    cards: [
      { title: 'Total Assigned Classes', description: 'Classes assigned for the active term' },
      { title: 'Active Teaching Days', description: 'Days containing scheduled classes' },
      { title: 'Weekly Teaching Load', description: 'Total scheduled teaching hours' },
    ],
  },
]

const emptySlotStyles = [
  {
    gradient: 'from-[var(--brand-color)]/20 to-[#7b9d4f]/10',
    outline: 'bg-[var(--brand-color)]',
    icon: 'text-[var(--brand-color)]',
  },
  {
    gradient: 'from-amber-200 to-amber-100',
    outline: 'bg-amber-500',
    icon: 'text-amber-600',
  },
  {
    gradient: 'from-sky-200 to-sky-100',
    outline: 'bg-sky-500',
    icon: 'text-sky-600',
  },
]

export function AdminDashboardPage() {
  const { activeAcademicYear, currentSemester, isLoading: isAcademicYearLoading } = useAcademicSemester()
  const { records: rooms, isLoading: areRoomsLoading, hasError: roomsError } = useCollectionData<RoomRecord>('rooms')
  const { records: reservations, isLoading: areReservationsLoading, hasError: reservationsError } = useCollectionData<ReservationRecord>('reservations')
  const { records: users, isLoading: areUsersLoading, hasError: usersError } = useCollectionData<UserRecord>('users')
  const { records: invitations, isLoading: areInvitationsLoading, hasError: invitationsError } = useCollectionData<InvitationRecord>('invitations')
  const { records: schedules, isLoading: areSchedulesLoading, hasError: schedulesError } = useCollectionData<ScheduleRecord>('schedule')
  const { records: departments, isLoading: areDepartmentsLoading, hasError: departmentsError } = useCollectionData<NamedRecord>('departments')
  const { records: buildings, isLoading: areBuildingsLoading, hasError: buildingsError } = useCollectionData<NamedRecord>('buildings')
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [selectedCard, setSelectedCard] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(clock)
  }, [])

  useEffect(() => {
    if (activeSlot === null) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSlot(null)
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activeSlot])

  const openCardPicker = (slot: number) => {
    setActiveSlot(slot)
    setSelectedCard(null)
  }

  const navigateTo = (tabId: string) => {
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tabId }))
  }

  const roomStats = useMemo(() => {
    const available = rooms.filter(room => (room.status || 'Available').toLowerCase() === 'available').length
    const occupied = rooms.filter(room => room.status?.toLowerCase() === 'occupied').length
    const maintenance = rooms.filter(room => room.status?.toLowerCase() === 'maintenance').length
    const totalCapacity = rooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)
    return { available, occupied, maintenance, total: rooms.length, totalCapacity }
  }, [rooms])

  const todayKey = formatDateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const todayReservations = useMemo(() => reservations
    .filter(reservation => {
      const status = reservation.status?.toLowerCase()
      return reservation.date === todayKey && status !== 'cancelled' && status !== 'declined'
    })
    .sort((first, second) => timeToMinutes(first.startTime) - timeToMinutes(second.startTime)), [reservations, todayKey])
  const pendingReservations = reservations.filter(reservation => reservation.status?.toLowerCase() === 'pending').length

  const pendingInvitations = invitations.filter(invitation => {
    if (invitation.status?.toLowerCase() !== 'pending') return false
    const expiry = timestampToDate(invitation.expiresAt)
    return !expiry || expiry.getTime() > now.getTime()
  }).length

  const activeUsers = users.filter(user => user.isActive !== false).length
  const deactivatedUsers = users.length - activeUsers

  const currentSchedules = useMemo(() => {
    const activeYear = activeAcademicYear?.academicYear?.toLowerCase()
    const isSecondSemester = currentSemester.toLowerCase().includes('2nd')

    return schedules.filter(schedule => {
      if (schedule.parentId) return false

      const yearReference = `${schedule.academicYear || ''} ${schedule.academicTerm || ''}`.trim().toLowerCase()
      if (activeYear && yearReference && !yearReference.includes(activeYear)) return false

      const semesterReference = schedule.semester?.toLowerCase() || ''
      if (semesterReference) {
        const scheduleIsSecond = semesterReference.includes('2nd') || semesterReference.includes('second')
        const scheduleIsFirst = semesterReference.includes('1st') || semesterReference.includes('first')
        if ((isSecondSemester && scheduleIsFirst) || (!isSecondSemester && scheduleIsSecond)) return false
      }

      return true
    })
  }, [activeAcademicYear?.academicYear, currentSemester, schedules])

  const scheduleStats = useMemo(() => {
    const normalizedStatus = (schedule: ScheduleRecord) => (schedule.status || 'Draft').toLowerCase()
    const plotted = currentSchedules.filter(schedule => ['plot', 'plotted'].includes(normalizedStatus(schedule))).length
    const drafted = currentSchedules.filter(schedule => ['draft', 'drafted'].includes(normalizedStatus(schedule))).length
    const needsReview = currentSchedules.filter(schedule => ['revise', 'revised', 'return', 'returned', 'removed'].includes(normalizedStatus(schedule))).length
    return { plotted, drafted, needsReview, total: currentSchedules.length }
  }, [currentSchedules])

  const upcomingReservationDays = useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const dateKey = formatDateKey(date)
    const dayReservations = reservations.filter(reservation => {
      const status = reservation.status?.toLowerCase()
      return reservation.date === dateKey && status !== 'cancelled' && status !== 'declined'
    })

    return {
      dateKey,
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      date: date.getDate(),
      total: dayReservations.length,
      approved: dayReservations.filter(reservation => reservation.status?.toLowerCase() === 'approved').length,
      pending: dayReservations.filter(reservation => reservation.status?.toLowerCase() === 'pending').length,
    }
  }), [now, reservations])

  const weeklyReservationTotal = upcomingReservationDays.reduce((total, day) => total + day.total, 0)
  const weeklyReservationPeak = Math.max(1, ...upcomingReservationDays.map(day => day.total))
  const busiestReservationDay = upcomingReservationDays.reduce((busiest, day) => day.total > busiest.total ? day : busiest)
  const semesterDetails = currentSemester === '2nd Semester' ? activeAcademicYear?.sem2 : activeAcademicYear?.sem1
  const currentPhase = semesterDetails?.phase || 'Not set'
  const scheduleCompletion = scheduleStats.total > 0 ? Math.round(scheduleStats.plotted / scheduleStats.total * 100) : 0
  const roomAvailability = roomStats.total > 0 ? Math.round(roomStats.available / roomStats.total * 100) : 0

  const roomsById = useMemo(() => new Map(rooms.map(room => [room.id, room.name || room.code || 'Room'])), [rooms])
  const isDashboardLoading = areRoomsLoading || areReservationsLoading || areUsersLoading
    || areInvitationsLoading || areSchedulesLoading || areDepartmentsLoading
    || areBuildingsLoading || isAcademicYearLoading
  const hasDataError = roomsError || reservationsError || usersError || invitationsError
    || schedulesError || departmentsError || buildingsError

  const attentionItems = [
    {
      label: 'Pending reservation requests',
      description: 'Waiting for an approval decision',
      count: pendingReservations,
      tab: 'manageReservations',
      color: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: 'Rooms under maintenance',
      description: 'Unavailable until facilities are restored',
      count: roomStats.maintenance,
      tab: 'buildingsRooms',
      color: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    {
      label: 'Pending member invitations',
      description: 'Active invitations awaiting acceptance',
      count: pendingInvitations,
      tab: 'members',
      color: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    {
      label: 'Schedules needing review',
      description: 'Revised or returned schedule records',
      count: scheduleStats.needsReview,
      tab: 'departmentSchedules',
      color: 'border-purple-200 bg-purple-50 text-purple-700',
    },
  ].filter(item => item.count > 0)

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader
          title="Admin Dashboard"
          description="A live overview of campus operations, requests, people, rooms, and scheduling activity."
        />

        {hasDataError && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Some live information is unavailable</p>
              <p className="mt-0.5 text-xs text-amber-700">The available dashboard data is still shown and will update automatically when the connection recovers.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {emptySlotStyles.map((style, index) => (
            <button
              key={style.outline}
              type="button"
              onClick={() => openCardPicker(index)}
              className="block h-full w-full cursor-pointer rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] focus-visible:ring-offset-2"
              aria-label={`Choose content for summary card ${index + 1}`}
            >
              <SummaryCard
                title={`Summary Card ${index + 1}`}
                subtitle="Empty slot · Click to choose"
                icon={<PlusIcon className={`h-5 w-5 ${style.icon}`} />}
                gradientClasses={style.gradient}
                outlineClasses={style.outline}
                blobClasses="bg-slate-100"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center transition-colors group-hover:border-[var(--brand-color)]/40 group-hover:bg-[#f3f7ee]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm transition-transform group-hover:scale-105 group-hover:text-[var(--brand-color)]">
                    <PlusIcon className="h-6 w-6" />
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate-600">Choose a summary card</span>
                  <span className="mt-1 text-xs text-slate-400">Browse cards from other tabs</span>
                </div>
              </SummaryCard>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ClockIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-black text-slate-900">Today’s reservation timeline</h2>
                  <p className="truncate text-xs text-slate-400">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigateTo('manageReservations')} className="group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
                View all <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </header>

            <div className="divide-y divide-slate-100">
              {areReservationsLoading ? (
                <div className="space-y-3 p-5">
                  {[1, 2, 3].map(item => <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : todayReservations.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><CalendarIcon className="h-6 w-6" /></span>
                  <p className="mt-3 text-sm font-black text-slate-700">No reservations scheduled today</p>
                  <p className="mt-1 text-xs text-slate-400">New bookings will appear here automatically.</p>
                </div>
              ) : (
                todayReservations.slice(0, 5).map(reservation => {
                  const status = reservation.status || 'Pending'
                  const isOngoing = status.toLowerCase() === 'approved'
                    && nowMinutes >= timeToMinutes(reservation.startTime)
                    && nowMinutes < timeToMinutes(reservation.endTime)
                  return (
                    <div key={reservation.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50">
                      <div className="w-20 shrink-0">
                        <p className="text-sm font-black text-slate-800">{formatTime(reservation.startTime)}</p>
                        <p className="mt-0.5 text-[0.65rem] text-slate-400">to {formatTime(reservation.endTime)}</p>
                      </div>
                      <span className={`h-9 w-1 shrink-0 rounded-full ${isOngoing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{reservation.purpose || 'Room reservation'}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">{roomsById.get(reservation.roomId || '') || 'Room not assigned'}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[0.65rem] font-black ${isOngoing ? 'bg-emerald-100 text-emerald-700' : reservationStatusClasses[status] || 'bg-slate-100 text-slate-600'}`}>
                        {isOngoing ? 'In progress' : status}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><AlertCircleIcon className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-black text-slate-900">Requires attention</h2>
                  <p className="text-xs text-slate-400">Items waiting for an administrator</p>
                </div>
              </div>
              {!isDashboardLoading && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{attentionItems.reduce((total, item) => total + item.count, 0)}</span>}
            </header>

            <div className="p-4">
              {isDashboardLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
              ) : attentionItems.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckIcon className="h-6 w-6" /></span>
                  <p className="mt-3 text-sm font-black text-slate-800">Everything is caught up</p>
                  <p className="mt-1 text-xs text-slate-400">No records currently require attention.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {attentionItems.map(item => (
                    <button key={item.label} type="button" onClick={() => navigateTo(item.tab)} className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-slate-100 p-3 text-left transition-all hover:border-slate-200 hover:bg-slate-50">
                      <span className={`flex h-10 min-w-10 items-center justify-center rounded-xl border text-sm font-black ${item.color}`}>{item.count}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">{item.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{item.description}</span>
                      </span>
                      <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-black text-slate-900">Seven-day reservation load</h2>
                  <p className="truncate text-xs text-slate-400">Approved and pending room demand</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-black text-slate-900">{areReservationsLoading ? '—' : weeklyReservationTotal}</p>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Bookings</p>
              </div>
            </header>

            <div className="flex h-[calc(100%-4.6rem)] flex-col p-5">
              {areReservationsLoading ? (
                <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <>
                  <div className="flex min-h-36 flex-1 items-end gap-2 sm:gap-3">
                    {upcomingReservationDays.map(day => {
                      const other = Math.max(0, day.total - day.approved - day.pending)
                      return (
                        <div key={day.dateKey} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center" title={`${day.day}: ${day.total} reservation${day.total === 1 ? '' : 's'}`}>
                          <span className="mb-1 text-xs font-black text-slate-700">{day.total || ''}</span>
                          <div
                            className={`mx-auto flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-md ${day.total === 0 ? 'bg-slate-100' : 'bg-slate-200'}`}
                            style={{ height: `${day.total === 0 ? 4 : Math.max(18, day.total / weeklyReservationPeak * 100)}%` }}
                          >
                            {day.approved > 0 && <span className="bg-emerald-500" style={{ height: `${day.approved / day.total * 100}%` }} />}
                            {day.pending > 0 && <span className="bg-amber-400" style={{ height: `${day.pending / day.total * 100}%` }} />}
                            {other > 0 && <span className="bg-blue-400" style={{ height: `${other / day.total * 100}%` }} />}
                          </div>
                          <p className="mt-2 text-[0.65rem] font-bold uppercase text-slate-400">{day.day}</p>
                          <p className="text-xs font-black text-slate-600">{day.date}</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-3 text-[0.65rem] font-bold text-slate-500">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Approved</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400" />Other</span>
                    </div>
                    <p className="text-[0.65rem] text-slate-400">Peak: <span className="font-black text-slate-600">{busiestReservationDay.day} · {busiestReservationDay.total}</span></p>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-4">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><DoorIcon className="h-5 w-5" /></span>
                <div>
                  <h2 className="font-black text-slate-900">Live room status</h2>
                  <p className="text-xs text-slate-400">Current room readiness</p>
                </div>
              </div>
              <button type="button" onClick={() => navigateTo('buildingsRooms')} className="group flex cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
                Open <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </header>

            <div className="flex h-[calc(100%-4.6rem)] flex-col p-5">
              {areRoomsLoading ? (
                <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <>
                  <div className="flex flex-1 items-center gap-5">
                    <div className="relative flex aspect-square h-full w-auto max-w-[45%] shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#10b981 ${roomAvailability * 3.6}deg, #e2e8f0 0deg)` }}>
                      <div className="flex h-[62%] w-[62%] flex-col items-center justify-center rounded-full bg-white shadow-inner">
                        <span className="text-2xl font-black text-slate-900">{roomAvailability}%</span>
                        <span className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">Ready</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex h-full flex-1 flex-col gap-2.5">
                      {[
                        {
                          label: 'Available',
                          value: roomStats.available,
                          color: 'bg-emerald-500',
                          surface: 'border-emerald-100 bg-emerald-50 text-emerald-700',
                        },
                        {
                          label: 'Occupied',
                          value: roomStats.occupied,
                          color: 'bg-amber-400',
                          surface: 'border-amber-100 bg-amber-50 text-amber-700',
                        },
                        {
                          label: 'Maintenance',
                          value: roomStats.maintenance,
                          color: 'bg-rose-500',
                          surface: 'border-rose-100 bg-rose-50 text-rose-700',
                        },
                      ].map(item => (
                        <div
                          key={item.label}
                          className={`grid flex-1 grid-cols-[0.6rem_1fr_auto] items-center gap-2 rounded-xl border px-3 ${item.surface}`}
                        >
                          <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                          <span className="truncate text-xs font-bold">{item.label}</span>
                          <span className="text-sm font-black">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-auto border-t border-slate-100 pt-4">
                    <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-400">Rooms to watch</p>
                    <div className="flex flex-wrap gap-2">
                      {rooms.filter(room => ['maintenance', 'occupied'].includes(room.status?.toLowerCase() || '')).slice(0, 4).map(room => (
                        <span key={room.id} className={`rounded-lg border px-2.5 py-1 text-[0.65rem] font-bold ${room.status?.toLowerCase() === 'maintenance' ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
                          {room.name || room.code || 'Unnamed room'}
                        </span>
                      ))}
                      {roomStats.occupied + roomStats.maintenance === 0 && <span className="text-xs font-bold text-emerald-600">All rooms are clear.</span>}
                      {roomStats.occupied + roomStats.maintenance > 4 && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold text-slate-500">+{roomStats.occupied + roomStats.maintenance - 4} more</span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-3">
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600"><CalendarIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="truncate font-black text-slate-900">Academic workflow</h2>
                  <p className="truncate text-xs text-slate-400">{activeAcademicYear?.academicYear || 'No active year'}</p>
                </div>
              </div>
            </header>

            <div className="flex h-[calc(100%-4.6rem)] flex-col p-5">
              {areSchedulesLoading || isAcademicYearLoading ? (
                <div className="h-52 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-slate-400">{currentSemester}</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{currentPhase}</p>
                    </div>
                    <span className="rounded-lg bg-purple-50 px-2 py-1 text-xs font-black text-purple-700">{scheduleCompletion}% plotted</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">{phaseDescriptions[currentPhase] || 'Current scheduling records for the active academic semester.'}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-500" style={{ width: `${scheduleCompletion}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-50 py-2"><p className="text-sm font-black text-emerald-700">{scheduleStats.plotted}</p><p className="text-[0.6rem] text-emerald-600">Plotted</p></div>
                    <div className="rounded-lg bg-amber-50 py-2"><p className="text-sm font-black text-amber-700">{scheduleStats.drafted}</p><p className="text-[0.6rem] text-amber-600">Drafted</p></div>
                    <div className="rounded-lg bg-purple-50 py-2"><p className="text-sm font-black text-purple-700">{scheduleStats.needsReview}</p><p className="text-[0.6rem] text-purple-600">Review</p></div>
                  </div>
                  <button type="button" onClick={() => navigateTo('departmentSchedules')} className="group mt-3 flex w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700">
                    Open schedules <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-black text-slate-900">Campus snapshot</h2>
              <p className="text-xs text-slate-400">Current totals from core Firestore collections</p>
            </div>
            <span className="flex items-center gap-2 text-xs font-bold text-emerald-600"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Active users', value: activeUsers, detail: `${deactivatedUsers} deactivated`, icon: UsersIcon, color: 'bg-purple-50 text-purple-700' },
              { label: 'Departments', value: departments.length, detail: 'academic units', icon: DepartmentIcon, color: 'bg-amber-50 text-amber-700' },
              { label: 'Buildings', value: buildings.length, detail: `${roomStats.total} rooms`, icon: BuildingIcon, color: 'bg-emerald-50 text-emerald-700' },
              { label: 'Room capacity', value: roomStats.totalCapacity.toLocaleString(), detail: 'total seats', icon: DoorIcon, color: 'bg-sky-50 text-sky-700' },
            ].map(item => {
              const SnapshotIcon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.color}`}><SnapshotIcon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-xl font-black tracking-tight text-slate-900">{isDashboardLoading ? '—' : item.value}</p>
                    <p className="truncate text-xs font-bold text-slate-600">{item.label}</p>
                    <p className="truncate text-[0.65rem] text-slate-400">{item.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {activeSlot !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="summary-card-picker-title"
        >
          <button
            type="button"
            aria-label="Close summary card picker"
            onClick={() => setActiveSlot(null)}
            className="absolute inset-0 cursor-default bg-slate-950/55"
          />

          <div className="relative z-10 flex max-h-[min(52rem,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl sm:max-h-[min(52rem,calc(100vh-3rem))]">
            <header className="border-b border-[#526f34] bg-gradient-to-br from-[var(--brand-color)] to-[#7b9d4f] px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h2 id="summary-card-picker-title" className="text-xl font-black tracking-tight text-white sm:text-2xl">
                  Choose a summary card
                </h2>
                <p className="mt-1 text-sm text-white/90">Select an existing card from another tab to place in this slot.</p>
              </div>
            </header>

            <div className="custom-scrollbar flex-1 overflow-y-auto bg-white px-5 py-5 sm:px-6">
              <div className="space-y-6">
                {summaryCardGroups.map(group => {
                  const SourceIcon = group.icon
                  return (
                    <section key={group.source} aria-labelledby={`summary-source-${group.source.replaceAll(' ', '-').toLowerCase()}`}>
                      <div className="mb-3 flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${group.badge}`}>
                          <SourceIcon className="h-4.5 w-4.5" />
                        </span>
                        <div>
                          <h3 id={`summary-source-${group.source.replaceAll(' ', '-').toLowerCase()}`} className="text-sm font-black text-slate-900">{group.source}</h3>
                          <p className="text-xs text-slate-400">{group.description}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {group.cards.map(card => {
                          const optionId = `${group.source}:${card.title}`
                          const isSelected = selectedCard === optionId
                          return (
                            <button
                              key={optionId}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedCard(optionId)}
                              className={`group/option relative cursor-pointer overflow-hidden rounded-xl border bg-white p-4 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] ${
                                isSelected
                                  ? 'border-[var(--brand-color)] ring-2 ring-[var(--brand-color)]/15'
                                  : 'border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
                              }`}
                            >
                              <span className={`absolute inset-x-0 top-0 h-1 ${group.accent}`} />
                              <div className="flex items-start justify-between gap-3">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-black text-slate-900">{card.title}</span>
                                  <span className="mt-1 block text-xs leading-5 text-slate-500">{card.description}</span>
                                </span>
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                  isSelected
                                    ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white'
                                    : 'border-slate-200 bg-white text-transparent group-hover/option:border-slate-300'
                                }`}>
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </span>
                              </div>
                              <div className="mt-4 flex h-12 items-end gap-1.5 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" aria-hidden="true">
                                {[45, 72, 56, 88, 64].map((height, barIndex) => (
                                  <span key={barIndex} className={`flex-1 rounded-sm opacity-55 ${group.accent}`} style={{ height: `${height}%` }} />
                                ))}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>

            <footer className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs text-slate-400">Prototype picker only — applying selections will be added later.</p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setActiveSlot(null)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled
                  variant="brand"
                >
                  Add to dashboard
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}

export default AdminDashboardPage
