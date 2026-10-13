import { useEffect, useMemo, useState } from 'react'
import { formatUserName } from '../../utils/userName'
import type { ComponentType, ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { TextInput } from '../../components/TextInput'
import {
  AlertCircleIcon,
  BuildingIcon,
  CalendarIcon,
  ClipboardIcon,
  ClockIcon,
  DownloadIcon,
  DoorIcon,
  LayersIcon,
  SearchIcon,
  UsersIcon,
  type IconProps,
} from '../../components/Icons'
import {
  dateStringToDate,
  reservationDurationMinutes,
  timeToMinutes,
  timestampToDate,
  useReportingData,
  type ReservationReportRecord,
} from '../../utils/reportingData'
import { downloadReportCsv } from '../../utils/reportCsv'
import { roomScheduleSection } from '../../utils/roomSchedule'
import {
  reportingScheduleConflicts,
  reportingScheduleDays,
  reportingScheduleDayText,
  reportingScheduleDuration,
  reportingScheduleMeetings,
  reportingScheduleResource,
  reportingScheduleTimeText,
  reportingScheduleWeeklyMinutes,
} from '../../utils/scheduleReporting'

type AnalyticsKind = 'reservations' | 'rooms' | 'schedules' | 'members'

interface AnalyticsPageProps {
  userRole: string
}

interface AnalyticsMetric {
  label: string
  value: string
  detail: string
}

interface ChartDatum {
  label: string
  value: number
  secondary?: number
}

interface RankedDatum extends ChartDatum {
  detail: string
}

interface OperationalInsight {
  label: string
  value: string
  detail: string
  color: string
}

interface AnalyticsMatrixRow {
  label: string
  values: number[]
}

interface AnalyticsActionItem {
  label: string
  count: number
  detail: string
  color: string
}

const ANALYTICS_OPTIONS: Array<{
  id: AnalyticsKind
  label: string
  description: string
  icon: ComponentType<IconProps>
}> = [
  { id: 'reservations', label: 'Reservations', description: 'Booking demand, outcomes, and usage patterns', icon: ClipboardIcon },
  { id: 'rooms', label: 'Buildings and Rooms', description: 'Room readiness, capacity, and facility coverage', icon: DoorIcon },
  { id: 'schedules', label: 'Schedules', description: 'Schedule progress and departmental workload', icon: CalendarIcon },
  { id: 'members', label: 'Members', description: 'Membership, account, and department distribution', icon: UsersIcon },
]

const ANALYTICS_KIND_STORAGE_KEY = 'rorms-analytics-selected-kind'
const MEMBER_STATUS_OPTIONS = ['Active', 'Deactivated', 'Pending']
const MEMBER_DEPARTMENT_PREFIXES = ['Administrative Office', "Registrar's Office", 'Unassigned']
const SCHEDULE_STATUS_OPTIONS = ['Draft', 'Plot']
const DATE_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]
const CHART_COLORS = ['#62853e', '#0284c7', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6', '#64748b']
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIME_BAND_ORDER = ['Early hours', 'Morning', 'Afternoon', 'Evening']
const DAY_ALIASES: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

const tooltipContentStyle = {
  borderRadius: '0.75rem',
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  fontSize: '0.75rem',
  fontWeight: 700,
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round(value / total * 100) : 0
}

function isAnalyticsKind(value: string | null): value is AnalyticsKind {
  return ANALYTICS_OPTIONS.some(option => option.id === value)
}

function getStoredAnalyticsKind(): AnalyticsKind {
  try {
    const storedAnalyticsKind = window.sessionStorage.getItem(ANALYTICS_KIND_STORAGE_KEY)
    return isAnalyticsKind(storedAnalyticsKind) ? storedAnalyticsKind : 'reservations'
  } catch {
    return 'reservations'
  }
}

function formatScheduleStatus(status?: string): 'Draft' | 'Plot' {
  const normalizedStatus = status?.trim().toLowerCase()
  return normalizedStatus === 'plot' || normalizedStatus === 'plotted' ? 'Plot' : 'Draft'
}

function formatReservationStatus(status?: string) {
  const normalizedStatus = status?.toLowerCase() || 'pending'
  if (normalizedStatus === 'rejected') return 'Declined'
  return `${normalizedStatus.charAt(0).toUpperCase()}${normalizedStatus.slice(1)}`
}

function shortLabel(value: string, maxLength = 16) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function normalizeScheduleDay(day?: string) {
  if (!day) return ''
  const normalized = day.trim().toLowerCase()
  return DAY_ALIASES[normalized] || `${normalized.charAt(0).toUpperCase()}${normalized.slice(1, 3)}`
}

function getTimeBand(time?: string) {
  if (!time) return 'Not set'
  const minutes = timeToMinutes(time)
  if (minutes < 6 * 60) return 'Early hours'
  if (minutes < 12 * 60) return 'Morning'
  if (minutes < 17 * 60) return 'Afternoon'
  return 'Evening'
}

function AnalyticsPanel({
  title,
  description,
  icon,
  children,
  className = '',
  isHighlighted = false,
}: {
  title: string
  description: string
  icon: ReactNode
  children: ReactNode
  className?: string
  isHighlighted?: boolean
}) {
  return (
    <article className={`animate-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all ${isHighlighted ? 'ring-2 ring-[var(--brand-color)] ring-offset-2 ring-offset-[var(--brand-surface)]' : ''} ${className}`}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f7ee] text-[var(--brand-color)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-black text-slate-900">{title}</h2>
          <p className="truncate text-xs text-slate-400">{description}</p>
        </div>
      </div>
      {children}
    </article>
  )
}

function EmptyAnalyticsState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
      <div>
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
          <LayersIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-black text-slate-700">No matching analytics data</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">{message}</p>
      </div>
    </div>
  )
}

function AnalyticsPage({ userRole }: AnalyticsPageProps) {
  const { reservations, rooms, buildings, memberships, invitations, users, departments, schedules, isLoading } = useReportingData()
  const isRegistrar = userRole.trim().toLowerCase() === 'registrar'
  const [analyticsKind, setAnalyticsKind] = useState<AnalyticsKind>(() => {
    const storedAnalyticsKind = getStoredAnalyticsKind()
    return isRegistrar && storedAnalyticsKind === 'members' ? 'reservations' : storedAnalyticsKind
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeFilters, setDateRangeFilters] = useState<string[]>([])
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([])

  const availableAnalyticsOptions = isRegistrar
    ? ANALYTICS_OPTIONS.filter(option => option.id !== 'members')
    : ANALYTICS_OPTIONS

  useEffect(() => {
    if (isRegistrar && analyticsKind === 'members') {
      setAnalyticsKind('reservations')
    }
  }, [analyticsKind, isRegistrar])

  const selectAnalyticsKind = (nextAnalyticsKind: AnalyticsKind) => {
    setAnalyticsKind(nextAnalyticsKind)
    setSearchQuery('')
    setDateRangeFilters([])
    setDepartmentFilters([])

    try {
      window.sessionStorage.setItem(ANALYTICS_KIND_STORAGE_KEY, nextAnalyticsKind)
    } catch {
      // Analytics remains usable when browser storage is unavailable.
    }
  }

  const parentSchedules = useMemo(() => schedules.filter(schedule => !schedule.parentId), [schedules])
  const scheduleMeetings = useMemo(() => reportingScheduleMeetings(schedules), [schedules])
  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const buildingById = useMemo(() => new Map(buildings.map(building => [building.id, building])), [buildings])
  const memberById = useMemo(() => new Map(memberships.map(member => [member.id, member])), [memberships])
  const memberByUserId = useMemo(() => new Map(memberships.filter(member => member.userId).map(member => [member.userId as string, member])), [memberships])
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const pendingInvitations = useMemo(() => {
    const now = Date.now()
    return invitations.filter(invitation => {
      const expiresAt = timestampToDate(invitation.expiresAt)
      return invitation.status?.toLowerCase() === 'pending' && expiresAt !== null && expiresAt.getTime() > now
    })
  }, [invitations])
  const pendingMembershipIds = useMemo(
    () => new Set(pendingInvitations.map(invitation => invitation.membershipId).filter((membershipId): membershipId is string => Boolean(membershipId))),
    [pendingInvitations],
  )
  const pendingEmails = useMemo(
    () => new Set(pendingInvitations.map(invitation => invitation.email?.toLowerCase()).filter((email): email is string => Boolean(email))),
    [pendingInvitations],
  )
  const memberRecords = useMemo(() => memberships.flatMap(member => {
    const user = userById.get(member.userId || '')
    const email = member.email || user?.email || ''
    const membershipStatus = (member.status || 'Pending').toLowerCase()
    const hasPendingInvitation = pendingMembershipIds.has(member.id) || pendingEmails.has(email.toLowerCase())

    if (membershipStatus === 'pending' && !hasPendingInvitation) return []
    const status = hasPendingInvitation || membershipStatus === 'pending'
      ? 'Pending'
      : user?.isActive === false ? 'Deactivated' : 'Active'
    const department = member.department || (
      member.role === 'Admin' ? 'Administrative Office' :
        member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned'
    )

    return [{
      id: member.id,
      name: formatUserName(user, member) || 'Unnamed member',
      email: email || 'No email recorded',
      department,
      role: member.role || 'Not assigned',
      membershipStatus: membershipStatus === 'accepted' ? 'Accepted' : 'Pending',
      status,
      joinedAt: member.joinedAt,
      createdAt: member.createdAt,
      isVerified: user?.isVerify === true,
    }]
  }), [memberships, pendingEmails, pendingMembershipIds, userById])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const isCardHighlighted = (title: string) => Boolean(normalizedSearch) && title.toLowerCase().includes(normalizedSearch)
  const selectedDateRangeDays = Number(dateRangeFilters[0]) || 0
  const selectedDateRangeLabel = DATE_RANGE_OPTIONS.find(option => option.value === dateRangeFilters[0])?.label || 'All dates'
  const selectedDepartmentLabel = departmentFilters.length === 0 ? 'All' : departmentFilters.join(', ')
  const dateRangeStart = useMemo(() => {
    if (!selectedDateRangeDays) return null
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - (selectedDateRangeDays - 1))
  }, [selectedDateRangeDays])
  const dateRangeEnd = useMemo(() => {
    if (dateRangeStart === null) return null
    const tomorrow = new Date()
    return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1)
  }, [dateRangeStart])
  const isInDateRange = (date: Date | null) => dateRangeStart === null || (date !== null && date >= dateRangeStart && date < dateRangeEnd!)
  const matchesDepartment = (department?: string) => departmentFilters.length === 0 || departmentFilters.includes(department?.trim() || 'Unassigned')
  const reservationDepartment = (reservation: ReservationReportRecord) => reservation.department?.trim() || memberByUserId.get(reservation.userId || '')?.department?.trim() || 'Unassigned'

  const matchingReservations = reservations.filter(reservation => (
    isInDateRange(dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt))
    && matchesDepartment(reservationDepartment(reservation))
  ))
  const matchingRooms = rooms.filter(room => {
    if (!isInDateRange(timestampToDate(room.createdAt))) return false
    const assignedDepartments = scheduleMeetings
      .filter(schedule => schedule.roomId === room.id)
      .map(schedule => schedule.department?.trim() || 'Unassigned')
    return (assignedDepartments.length ? assignedDepartments : ['Unassigned']).some(matchesDepartment)
  })
  const matchingSchedules = parentSchedules.filter(schedule => (
    isInDateRange(timestampToDate(schedule.createdAt))
    && matchesDepartment(schedule.department)
  ))
  const matchingScheduleMeetings = scheduleMeetings.filter(schedule => (
    isInDateRange(timestampToDate(schedule.createdAt))
    && matchesDepartment(schedule.department)
  ))
  const matchingMembers = memberRecords.filter(member => (
    isInDateRange(timestampToDate(member.joinedAt) || timestampToDate(member.createdAt))
    && matchesDepartment(member.department)
  ))

  const approvedReservations = matchingReservations.filter(reservation => ['approved', 'completed'].includes(reservation.status?.toLowerCase() || '')).length
  const declinedReservations = matchingReservations.filter(reservation => ['declined', 'rejected'].includes(reservation.status?.toLowerCase() || '')).length
  const decidedReservations = approvedReservations + declinedReservations
  const totalReservedMinutes = matchingReservations.reduce((total, reservation) => total + reservationDurationMinutes(reservation), 0)
  const previousReservations = useMemo(() => {
    if (!selectedDateRangeDays || dateRangeStart === null) return []
    const today = new Date()
    const currentPeriodStart = dateRangeStart
    const previousPeriodStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (selectedDateRangeDays * 2 - 1))
    return reservations.filter(reservation => {
      const date = dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt)
      return date !== null && date >= previousPeriodStart && date < currentPeriodStart && matchesDepartment(reservationDepartment(reservation))
    })
  }, [dateRangeStart, reservations, selectedDateRangeDays, departmentFilters, memberByUserId])
  const matchingPreviousReservations = previousReservations
  const demandChange = matchingPreviousReservations.length > 0
    ? Math.round((matchingReservations.length - matchingPreviousReservations.length) / matchingPreviousReservations.length * 100)
    : matchingReservations.length > 0 ? 100 : 0

  const availableRooms = matchingRooms.filter(room => (room.status || 'Available').toLowerCase() === 'available').length
  const unavailableRooms = matchingRooms.filter(room => room.status?.toLowerCase() === 'unavailable').length
  const maintenanceRooms = matchingRooms.filter(room => room.status?.toLowerCase() === 'maintenance').length
  const totalRoomCapacity = matchingRooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)

  const plottedSchedules = matchingSchedules.filter(schedule => formatScheduleStatus(schedule.status) === 'Plot').length
  const draftSchedules = matchingSchedules.filter(schedule => formatScheduleStatus(schedule.status) === 'Draft').length
  const scheduledDepartments = new Set(matchingSchedules.map(schedule => schedule.department?.trim()).filter(Boolean)).size

  const activeMembers = matchingMembers.filter(member => member.status === 'Active').length
  const pendingMembers = matchingMembers.filter(member => member.status === 'Pending').length
  const deactivatedMembers = matchingMembers.filter(member => member.status === 'Deactivated').length
  const acceptedMemberships = matchingMembers.filter(member => member.membershipStatus === 'Accepted').length
  const allPlottedSchedules = parentSchedules.filter(schedule => formatScheduleStatus(schedule.status) === 'Plot').length

  const metrics: AnalyticsMetric[] = analyticsKind === 'rooms' ? [
    { label: 'Rooms recorded', value: matchingRooms.length.toLocaleString(), detail: 'rooms matching this analytics view' },
    { label: 'Available rooms', value: availableRooms.toLocaleString(), detail: `${percent(availableRooms, matchingRooms.length)}% of matching rooms` },
    { label: 'Unavailable or maintenance', value: (unavailableRooms + maintenanceRooms).toLocaleString(), detail: `${unavailableRooms} unavailable · ${maintenanceRooms} maintenance` },
    { label: 'Recorded capacity', value: totalRoomCapacity.toLocaleString(), detail: 'seats across matching rooms' },
  ] : analyticsKind === 'schedules' ? [
    { label: 'Schedule records', value: matchingSchedules.length.toLocaleString(), detail: 'matching parent schedule entries' },
    { label: 'Plotted schedules', value: plottedSchedules.toLocaleString(), detail: `${percent(plottedSchedules, matchingSchedules.length)}% assigned` },
    { label: 'Draft schedules', value: draftSchedules.toLocaleString(), detail: `${percent(draftSchedules, matchingSchedules.length)}% still drafting` },
    { label: 'Departments represented', value: scheduledDepartments.toLocaleString(), detail: 'across matching schedules' },
  ] : analyticsKind === 'members' ? [
    { label: 'Member records', value: matchingMembers.length.toLocaleString(), detail: `${acceptedMemberships} accepted memberships` },
    { label: 'Active members', value: activeMembers.toLocaleString(), detail: `${percent(activeMembers, matchingMembers.length)}% of matching members` },
    { label: 'Pending members', value: pendingMembers.toLocaleString(), detail: 'active, unexpired invitations' },
    { label: 'Deactivated members', value: deactivatedMembers.toLocaleString(), detail: 'accounts currently deactivated' },
  ] : [
    { label: 'Reservation demand', value: matchingReservations.length.toLocaleString(), detail: `${demandChange >= 0 ? '+' : ''}${demandChange}% vs. prior period` },
    { label: 'Approval rate', value: `${percent(approvedReservations, decidedReservations)}%`, detail: `${decidedReservations} requests received a decision` },
    { label: 'Reserved time', value: `${(totalReservedMinutes / 60).toFixed(totalReservedMinutes % 60 === 0 ? 0 : 1)}h`, detail: `${matchingReservations.length > 0 ? (totalReservedMinutes / matchingReservations.length / 60).toFixed(1) : '0'} hours per request on average` },
    { label: 'Schedule completion', value: `${percent(allPlottedSchedules, parentSchedules.length)}%`, detail: `${allPlottedSchedules} of ${parentSchedules.length} schedules plotted` },
  ]

  const statusBreakdown = analyticsKind === 'rooms'
    ? [
      { status: 'Available', count: availableRooms },
      { status: 'Unavailable', count: unavailableRooms },
      { status: 'Maintenance', count: maintenanceRooms },
    ]
    : analyticsKind === 'schedules'
      ? SCHEDULE_STATUS_OPTIONS.map(status => ({
        status,
        count: matchingSchedules.filter(schedule => formatScheduleStatus(schedule.status) === status).length,
      }))
      : analyticsKind === 'members'
        ? [
          { status: 'Active', count: activeMembers },
          { status: 'Deactivated', count: deactivatedMembers },
          { status: 'Pending', count: pendingMembers },
        ]
        : [
          { status: 'Pending', count: matchingReservations.filter(reservation => (reservation.status || 'Pending').toLowerCase() === 'pending').length },
          { status: 'Approved', count: matchingReservations.filter(reservation => reservation.status?.toLowerCase() === 'approved').length },
          { status: 'Declined', count: matchingReservations.filter(reservation => ['declined', 'rejected'].includes(reservation.status?.toLowerCase() || '')).length },
          { status: 'Cancelled', count: matchingReservations.filter(reservation => reservation.status?.toLowerCase() === 'cancelled').length },
          { status: 'Completed', count: matchingReservations.filter(reservation => reservation.status?.toLowerCase() === 'completed').length },
        ]
  const statusBreakdownTotal = statusBreakdown.reduce((total, item) => total + item.count, 0)

  const departmentOptions = useMemo(
    () => Array.from(new Set(
      departments
        .map((department) => department.code?.trim() || department.name?.trim())
        .filter((department): department is string => Boolean(department)),
    )).sort((first, second) => first.localeCompare(second)),
    [departments],
  )
  const memberDepartmentOptions = useMemo(
    () => [
      ...MEMBER_DEPARTMENT_PREFIXES,
      ...departmentOptions.filter(department => !MEMBER_DEPARTMENT_PREFIXES.includes(department)),
    ],
    [departmentOptions],
  )
  const filterGroups: FilterGroup[] = [
    {
      id: 'date-range',
      title: 'Date range',
      options: DATE_RANGE_OPTIONS,
      selectedValues: dateRangeFilters,
      onChange: nextFilters => {
        const addedFilter = nextFilters.find(filter => !dateRangeFilters.includes(filter))
        setDateRangeFilters(addedFilter ? [addedFilter] : nextFilters)
      },
    },
    {
      id: 'department',
      title: 'Department',
      options: analyticsKind === 'members' ? memberDepartmentOptions : departmentOptions,
      selectedValues: departmentFilters,
      onChange: setDepartmentFilters,
    },
  ]
  const activeAnalyticsOption = ANALYTICS_OPTIONS.find(option => option.id === analyticsKind) || ANALYTICS_OPTIONS[0]
  const matchingRecordCount = analyticsKind === 'rooms'
    ? matchingRooms.length
    : analyticsKind === 'schedules'
      ? matchingSchedules.length
      : analyticsKind === 'members'
        ? matchingMembers.length
        : matchingReservations.length

  const detailedAnalytics = (() => {
    let primaryData: ChartDatum[] = []
    let distributionData: ChartDatum[] = []
    let rankedData: RankedDatum[] = []
    let insights: OperationalInsight[] = []
    let primaryTitle = ''
    let primaryDescription = ''
    let primaryValueLabel = ''
    let primarySecondaryLabel = ''
    let distributionTitle = ''
    let distributionDescription = ''
    let rankedTitle = ''
    let rankedDescription = ''

    if (analyticsKind === 'reservations') {
      const today = new Date()
      const trendDays = selectedDateRangeDays || 90
      const start = dateRangeStart || new Date(today.getFullYear(), today.getMonth(), today.getDate() - (trendDays - 1))
      const bucketDays = Math.ceil(trendDays / 12)
      primaryData = Array.from({ length: 12 }, (_, index) => {
        const bucketStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index * bucketDays)
        return {
          label: bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: 0,
          secondary: 0,
        }
      })
      matchingReservations.forEach(reservation => {
        const date = dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt)
        if (!date) return
        const bucketIndex = Math.floor((date.getTime() - start.getTime()) / (bucketDays * 24 * 60 * 60 * 1000))
        const bucket = primaryData[bucketIndex]
        if (!bucket) return
        bucket.value += 1
        if (['approved', 'completed'].includes(reservation.status?.toLowerCase() || '')) bucket.secondary = (bucket.secondary || 0) + 1
      })

      const timeBands = new Map(['Early hours', 'Morning', 'Afternoon', 'Evening', 'Not set'].map(label => [label, 0]))
      matchingReservations.forEach(reservation => {
        const band = getTimeBand(reservation.startTime)
        timeBands.set(band, (timeBands.get(band) || 0) + 1)
      })
      distributionData = Array.from(timeBands, ([label, value]) => ({ label, value }))

      const roomDemand = new Map<string, { count: number; minutes: number }>()
      matchingReservations.forEach(reservation => {
        const key = reservation.roomId || 'unassigned'
        const current = roomDemand.get(key) || { count: 0, minutes: 0 }
        current.count += 1
        current.minutes += reservationDurationMinutes(reservation)
        roomDemand.set(key, current)
      })
      rankedData = Array.from(roomDemand, ([roomId, demand]) => ({
        label: roomId === 'unassigned' ? 'Unassigned room' : roomById.get(roomId)?.code || roomById.get(roomId)?.name || 'Unknown room',
        value: demand.count,
        detail: `${(demand.minutes / 60).toFixed(demand.minutes % 60 === 0 ? 0 : 1)} reserved hours`,
      })).sort((first, second) => second.value - first.value).slice(0, 5)

      const weekdayCounts = new Map<string, number>()
      const leadTimes: number[] = []
      matchingReservations.forEach(reservation => {
        const date = dateStringToDate(reservation.date)
        if (date) weekdayCounts.set(date.toLocaleDateString('en-US', { weekday: 'long' }), (weekdayCounts.get(date.toLocaleDateString('en-US', { weekday: 'long' })) || 0) + 1)
        const createdAt = timestampToDate(reservation.createdAt)
        if (date && createdAt && date >= createdAt) leadTimes.push((date.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
      })
      const busiestDay = Array.from(weekdayCounts).sort((first, second) => second[1] - first[1])[0]
      const peakBand = Array.from(timeBands).sort((first, second) => second[1] - first[1])[0]
      const averageLeadTime = leadTimes.length > 0 ? leadTimes.reduce((total, days) => total + days, 0) / leadTimes.length : 0
      const roomsUsed = new Set(matchingReservations.map(reservation => reservation.roomId).filter(Boolean)).size
      insights = [
        { label: 'Busiest booking day', value: busiestDay?.[0] || '—', detail: busiestDay ? `${busiestDay[1]} requests` : 'No dated requests', color: 'bg-sky-500 text-sky-700' },
        { label: 'Peak start period', value: peakBand?.[1] ? peakBand[0] : '—', detail: peakBand?.[1] ? `${peakBand[1]} requests` : 'No start times', color: 'bg-amber-500 text-amber-700' },
        { label: 'Average lead time', value: leadTimes.length ? `${averageLeadTime.toFixed(1)} days` : '—', detail: 'from request to reserved date', color: 'bg-purple-500 text-purple-700' },
        { label: 'Rooms requested', value: roomsUsed.toLocaleString(), detail: `${percent(roomsUsed, rooms.length)}% of room inventory`, color: 'bg-emerald-500 text-emerald-700' },
      ]
      primaryTitle = 'Reservation demand trend'
      primaryDescription = `Requests and approved outcomes over ${selectedDateRangeLabel.toLowerCase()}`
      primaryValueLabel = 'Requests'
      primarySecondaryLabel = 'Approved'
      distributionTitle = 'Demand by start time'
      distributionDescription = 'When room demand begins during the day'
      rankedTitle = 'Most requested rooms'
      rankedDescription = 'Rooms with the highest booking demand'
    } else if (analyticsKind === 'rooms') {
      const buildingStats = new Map<string, { rooms: number; capacity: number }>()
      matchingRooms.forEach(room => {
        const building = buildingById.get(room.buildingId || '')
        const label = building?.code || building?.name || 'Unassigned'
        const current = buildingStats.get(label) || { rooms: 0, capacity: 0 }
        current.rooms += 1
        current.capacity += Number(room.capacity) || 0
        buildingStats.set(label, current)
      })
      primaryData = Array.from(buildingStats, ([label, stats]) => ({ label: shortLabel(label), value: stats.rooms, secondary: stats.capacity }))
        .sort((first, second) => second.value - first.value).slice(0, 10)

      const typeCounts = new Map<string, number>()
      matchingRooms.forEach(room => {
        const type = room.type?.trim() || 'Not specified'
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1)
      })
      distributionData = Array.from(typeCounts, ([label, value]) => ({ label, value })).sort((first, second) => second.value - first.value)

      const amenityCounts = new Map<string, number>()
      matchingRooms.forEach(room => room.amenities?.forEach(amenity => amenityCounts.set(amenity, (amenityCounts.get(amenity) || 0) + 1)))
      rankedData = Array.from(amenityCounts, ([label, value]) => ({
        label,
        value,
        detail: `${percent(value, matchingRooms.length)}% room coverage`,
      })).sort((first, second) => second.value - first.value).slice(0, 5)

      const largestRoom = [...matchingRooms].sort((first, second) => (Number(second.capacity) || 0) - (Number(first.capacity) || 0))[0]
      const availableCapacity = matchingRooms.filter(room => (room.status || 'Available').toLowerCase() === 'available').reduce((total, room) => total + (Number(room.capacity) || 0), 0)
      const buildingsCovered = new Set(matchingRooms.map(room => room.buildingId).filter(Boolean)).size
      const roomsWithAmenities = matchingRooms.filter(room => (room.amenities?.length || 0) > 0).length
      insights = [
        { label: 'Average room capacity', value: matchingRooms.length ? Math.round(totalRoomCapacity / matchingRooms.length).toLocaleString() : '—', detail: 'seats per matching room', color: 'bg-sky-500 text-sky-700' },
        { label: 'Largest room', value: largestRoom?.code || largestRoom?.name || '—', detail: largestRoom ? `${Number(largestRoom.capacity) || 0} recorded seats` : 'No capacity data', color: 'bg-purple-500 text-purple-700' },
        { label: 'Available capacity', value: availableCapacity.toLocaleString(), detail: `${percent(availableCapacity, totalRoomCapacity)}% of recorded seats`, color: 'bg-emerald-500 text-emerald-700' },
        { label: 'Facility coverage', value: `${buildingsCovered}/${buildings.length}`, detail: `${roomsWithAmenities} rooms list amenities`, color: 'bg-amber-500 text-amber-700' },
      ]
      primaryTitle = 'Rooms by building'
      primaryDescription = 'Room inventory and recorded seat capacity by location'
      primaryValueLabel = 'Rooms'
      primarySecondaryLabel = 'Seats'
      distributionTitle = 'Room type mix'
      distributionDescription = 'How the room inventory is configured'
      rankedTitle = 'Most common amenities'
      rankedDescription = 'Facility features with the widest coverage'
    } else if (analyticsKind === 'schedules') {
      const departmentStats = new Map<string, { schedules: number; plotted: number }>()
      matchingSchedules.forEach(schedule => {
        const label = schedule.department?.trim() || 'Unassigned'
        const current = departmentStats.get(label) || { schedules: 0, plotted: 0 }
        current.schedules += 1
        if (formatScheduleStatus(schedule.status) === 'Plot') current.plotted += 1
        departmentStats.set(label, current)
      })
      primaryData = Array.from(departmentStats, ([label, stats]) => ({ label: shortLabel(label), value: stats.schedules, secondary: stats.plotted }))
        .sort((first, second) => second.value - first.value).slice(0, 10)

      const dayCounts = new Map(DAY_ORDER.map(day => [day, 0]))
      matchingScheduleMeetings.forEach(schedule => reportingScheduleDays(schedule).forEach(day => {
        dayCounts.set(day, (dayCounts.get(day) || 0) + 1)
      }))
      distributionData = Array.from(dayCounts, ([label, value]) => ({ label, value }))

      const instructorLoads = new Map<string, { name: string; classes: number; minutes: number }>()
      matchingScheduleMeetings.forEach(schedule => {
        const instructor = memberById.get(schedule.instructorId || '') || memberByUserId.get(schedule.instructorId || '')
        const name = reportingScheduleResource(formatUserName(userById.get(instructor?.userId || ''), instructor), schedule.faculty)
        if (name === '----' || name.toUpperCase() === 'TBA') return
        const key = schedule.instructorId || `saved:${name.toUpperCase()}`
        const current = instructorLoads.get(key) || { name, classes: 0, minutes: 0 }
        current.classes += 1
        current.minutes += reportingScheduleWeeklyMinutes(schedule)
        instructorLoads.set(key, current)
      })
      rankedData = Array.from(instructorLoads.values(), load => ({
        label: load.name,
        value: load.classes,
        detail: `${(load.minutes / 60).toFixed(load.minutes % 60 === 0 ? 0 : 1)} scheduled hours`,
      })).sort((first, second) => second.value - first.value).slice(0, 5)

      const assignedRooms = matchingScheduleMeetings.filter(schedule => Boolean(schedule.roomId)).length
      const assignedInstructors = matchingScheduleMeetings.filter(schedule => Boolean(schedule.instructorId)).length
      const usedRooms = new Set(matchingScheduleMeetings.map(schedule => schedule.roomId).filter(Boolean)).size
      const totalWeeklyMinutes = matchingScheduleMeetings.reduce((total, schedule) => total + reportingScheduleWeeklyMinutes(schedule), 0)
      const busiestScheduleDay = [...distributionData].sort((first, second) => second.value - first.value)[0]
      insights = [
        { label: 'Room assignment', value: `${percent(assignedRooms, matchingScheduleMeetings.length)}%`, detail: `${assignedRooms} meetings linked to rooms`, color: 'bg-emerald-500 text-emerald-700' },
        { label: 'Instructor assignment', value: `${percent(assignedInstructors, matchingScheduleMeetings.length)}%`, detail: `${assignedInstructors} meetings linked to instructors`, color: 'bg-sky-500 text-sky-700' },
        { label: 'Busiest teaching day', value: busiestScheduleDay?.value ? busiestScheduleDay.label : '—', detail: busiestScheduleDay?.value ? `${busiestScheduleDay.value} class entries` : 'No day data', color: 'bg-amber-500 text-amber-700' },
        { label: 'Weekly teaching time', value: `${(totalWeeklyMinutes / 60).toFixed(totalWeeklyMinutes % 60 === 0 ? 0 : 1)}h`, detail: `${usedRooms} rooms represented`, color: 'bg-purple-500 text-purple-700' },
      ]
      primaryTitle = 'Department workload'
      primaryDescription = 'Schedule volume and plotting progress across departments'
      primaryValueLabel = 'Schedules'
      primarySecondaryLabel = 'Plot'
      distributionTitle = 'Weekly class pattern'
      distributionDescription = 'Class entries assigned to each teaching day'
      rankedTitle = 'Highest instructor loads'
      rankedDescription = 'Instructors appearing most often in matching schedules'
    } else {
      const departmentStats = new Map<string, { members: number; active: number }>()
      matchingMembers.forEach(member => {
        const current = departmentStats.get(member.department) || { members: 0, active: 0 }
        current.members += 1
        if (member.status === 'Active') current.active += 1
        departmentStats.set(member.department, current)
      })
      primaryData = Array.from(departmentStats, ([label, stats]) => ({ label: shortLabel(label), value: stats.members, secondary: stats.active }))
        .sort((first, second) => second.value - first.value).slice(0, 10)

      const roleCounts = new Map<string, number>()
      matchingMembers.forEach(member => roleCounts.set(member.role, (roleCounts.get(member.role) || 0) + 1))
      distributionData = Array.from(roleCounts, ([label, value]) => ({ label, value })).sort((first, second) => second.value - first.value)

      const today = new Date()
      rankedData = Array.from({ length: 6 }, (_, reverseIndex) => {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - reverseIndex), 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - (4 - reverseIndex), 1)
        const joined = matchingMembers.filter(member => {
          const joinedAt = timestampToDate(member.joinedAt) || timestampToDate(member.createdAt)
          return joinedAt !== null && joinedAt >= monthStart && joinedAt < monthEnd
        }).length
        return {
          label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          value: joined,
          detail: joined === 1 ? '1 member joined' : `${joined} members joined`,
        }
      })

      const verifiedMembers = matchingMembers.filter(member => member.isVerified).length
      const representedDepartments = new Set(matchingMembers.map(member => member.department).filter(department => department !== 'Unassigned')).size
      const topRole = [...distributionData].sort((first, second) => second.value - first.value)[0]
      insights = [
        { label: 'Verified accounts', value: `${percent(verifiedMembers, matchingMembers.length)}%`, detail: `${verifiedMembers} linked accounts verified`, color: 'bg-emerald-500 text-emerald-700' },
        { label: 'Departments represented', value: representedDepartments.toLocaleString(), detail: `${departments.length} academic departments recorded`, color: 'bg-sky-500 text-sky-700' },
        { label: 'Largest role group', value: topRole?.value ? topRole.label : '—', detail: topRole?.value ? `${topRole.value} members` : 'No role data', color: 'bg-purple-500 text-purple-700' },
        { label: 'Open invitations', value: pendingInvitations.length.toLocaleString(), detail: 'pending and not yet expired', color: 'bg-amber-500 text-amber-700' },
      ]
      primaryTitle = 'Members by department'
      primaryDescription = 'Membership coverage and active accounts across the organization'
      primaryValueLabel = 'Members'
      primarySecondaryLabel = 'Active'
      distributionTitle = 'Role distribution'
      distributionDescription = 'How responsibilities are represented in the directory'
      rankedTitle = 'Membership growth'
      rankedDescription = 'New directory records over the last six months'
    }

    return {
      primaryData,
      distributionData,
      rankedData,
      insights,
      primaryTitle,
      primaryDescription,
      primaryValueLabel,
      primarySecondaryLabel,
      distributionTitle,
      distributionDescription,
      rankedTitle,
      rankedDescription,
    }
  })()

  const extendedAnalytics = (() => {
    let matrixColumns: string[] = []
    let matrixRows: AnalyticsMatrixRow[] = []
    let matrixTitle = ''
    let matrixDescription = ''
    let secondaryData: ChartDatum[] = []
    let secondaryTitle = ''
    let secondaryDescription = ''
    let actionItems: AnalyticsActionItem[] = []
    let actionTitle = ''
    let actionDescription = ''

    if (analyticsKind === 'reservations') {
      matrixColumns = TIME_BAND_ORDER
      matrixRows = DAY_ORDER.map(label => ({ label, values: TIME_BAND_ORDER.map(() => 0) }))
      matchingReservations.forEach(reservation => {
        const date = dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt)
        const band = getTimeBand(reservation.startTime)
        if (!date || !TIME_BAND_ORDER.includes(band)) return
        const dayIndex = DAY_ORDER.indexOf(date.toLocaleDateString('en-US', { weekday: 'short' }))
        const bandIndex = TIME_BAND_ORDER.indexOf(band)
        if (dayIndex >= 0 && bandIndex >= 0) matrixRows[dayIndex].values[bandIndex] += 1
      })

      const durationBuckets = [30, 60, 90]
      secondaryData = durationBuckets.map(duration => ({
        label: `${duration} minutes`,
        value: matchingReservations.filter(reservation => reservationDurationMinutes(reservation) === duration).length,
      }))

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const isPending = (status?: string) => (status || 'Pending').toLowerCase() === 'pending'
      const pendingPast = matchingReservations.filter(reservation => {
        const date = dateStringToDate(reservation.date)
        return isPending(reservation.status) && date !== null && date < todayStart
      }).length
      const pendingUpcoming = matchingReservations.filter(reservation => {
        const date = dateStringToDate(reservation.date)
        return isPending(reservation.status) && date !== null && date >= todayStart
      }).length
      const declinedWithoutReason = matchingReservations.filter(reservation => ['declined', 'rejected'].includes(reservation.status?.toLowerCase() || '') && !reservation.declinedReason?.trim()).length
      const missingRoom = matchingReservations.filter(reservation => !reservation.roomId || !roomById.has(reservation.roomId)).length
      const uniqueRequesters = new Set(matchingReservations.map(reservation => reservation.userId).filter(Boolean)).size
      const requestingDepartments = new Set(matchingReservations.map(reservationDepartment).filter(department => department !== 'Unassigned')).size
      actionItems = [
        { label: 'Overdue pending requests', count: pendingPast, detail: 'reservation date has already passed', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Upcoming pending requests', count: pendingUpcoming, detail: 'still awaiting a decision', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Declines without a reason', count: declinedWithoutReason, detail: 'decision context is missing', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Missing room references', count: missingRoom, detail: 'room was removed or never assigned', color: 'border-slate-200 bg-slate-100 text-slate-700' },
        { label: 'Unique requesters', count: uniqueRequesters, detail: `${requestingDepartments} departments represented`, color: 'border-sky-200 bg-sky-50 text-sky-700' },
      ]
      matrixTitle = 'Reservation demand heatmap'
      matrixDescription = 'Request starts by weekday and time of day'
      secondaryTitle = 'Booking duration profile'
      secondaryDescription = 'How long matching room requests run'
      actionTitle = 'Reservation action queue'
      actionDescription = 'Requests and data conditions worth reviewing'
    } else if (analyticsKind === 'rooms') {
      const matchingRoomIds = new Set(matchingRooms.map(room => room.id))
      matrixColumns = ['Available', 'Classes', 'Bookings']
      matrixRows = DAY_ORDER.map(label => ({ label, values: [0, 0, 0] }))
      matchingRooms.forEach(room => room.availableDays?.forEach(day => {
        const row = matrixRows.find(item => item.label === normalizeScheduleDay(day))
        if (row) row.values[0] += 1
      }))
      scheduleMeetings.filter(schedule => matchingRoomIds.has(schedule.roomId || '')).forEach(schedule => reportingScheduleDays(schedule).forEach(day => {
        const row = matrixRows.find(item => item.label === day)
        if (row) row.values[1] += 1
      }))
      matchingReservations.filter(reservation => matchingRoomIds.has(reservation.roomId || '') && ['approved', 'completed'].includes(reservation.status?.toLowerCase() || '')).forEach(reservation => {
        const date = dateStringToDate(reservation.date)
        const row = date ? matrixRows.find(item => item.label === date.toLocaleDateString('en-US', { weekday: 'short' })) : undefined
        if (row) row.values[2] += 1
      })

      const capacityBuckets = [
        { label: 'Not set', minimum: 0, maximum: 0 },
        { label: '1–20 seats', minimum: 1, maximum: 20 },
        { label: '21–40 seats', minimum: 21, maximum: 40 },
        { label: '41–60 seats', minimum: 41, maximum: 60 },
        { label: '61–100 seats', minimum: 61, maximum: 100 },
        { label: '100+ seats', minimum: 101, maximum: Number.POSITIVE_INFINITY },
      ]
      secondaryData = capacityBuckets.map(bucket => ({
        label: bucket.label,
        value: matchingRooms.filter(room => {
          const capacity = Number(room.capacity) || 0
          return capacity >= bucket.minimum && capacity <= bucket.maximum
        }).length,
      }))

      const usedRoomIds = new Set([
        ...scheduleMeetings.map(schedule => schedule.roomId).filter((id): id is string => Boolean(id)),
        ...matchingReservations.map(reservation => reservation.roomId).filter((id): id is string => Boolean(id)),
      ])
      actionItems = [
        { label: 'Missing capacity', count: matchingRooms.filter(room => !(Number(room.capacity) > 0)).length, detail: 'rooms without usable seat data', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'No listed amenities', count: matchingRooms.filter(room => !room.amenities?.length).length, detail: 'facility details are incomplete', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'No availability days', count: matchingRooms.filter(room => !room.availableDays?.length).length, detail: 'weekly availability is not configured', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Missing operating hours', count: matchingRooms.filter(room => !room.startTime || !room.endTime).length, detail: 'start or end time is absent', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Unused room inventory', count: matchingRooms.filter(room => !usedRoomIds.has(room.id)).length, detail: 'no schedule or recent reservation usage', color: 'border-slate-200 bg-slate-100 text-slate-700' },
      ]
      matrixTitle = 'Weekly facility coverage'
      matrixDescription = 'Available rooms compared with scheduled and reserved demand'
      secondaryTitle = 'Capacity distribution'
      secondaryDescription = 'Room inventory grouped by recorded seat count'
      actionTitle = 'Room data readiness'
      actionDescription = 'Inventory gaps that can affect allocation decisions'
    } else if (analyticsKind === 'schedules') {
      matrixColumns = TIME_BAND_ORDER
      matrixRows = DAY_ORDER.map(label => ({ label, values: TIME_BAND_ORDER.map(() => 0) }))
      matchingScheduleMeetings.filter(schedule => reportingScheduleDuration(schedule) !== null).forEach(schedule => reportingScheduleDays(schedule).forEach(day => {
        const band = getTimeBand(schedule.startTime)
        const rowIndex = DAY_ORDER.indexOf(day)
        const columnIndex = TIME_BAND_ORDER.indexOf(band)
        if (rowIndex >= 0 && columnIndex >= 0) matrixRows[rowIndex].values[columnIndex] += 1
      }))

      const formatCounts = new Map<string, number>()
      matchingScheduleMeetings.forEach(schedule => {
        const format = schedule.format || 'Not specified'
        formatCounts.set(format, (formatCounts.get(format) || 0) + 1)
      })
      secondaryData = Array.from(formatCounts, ([label, value]) => ({ label, value })).sort((first, second) => second.value - first.value)

      const { rooms: roomConflicts, instructors: instructorConflicts } = reportingScheduleConflicts(matchingScheduleMeetings)
      actionItems = [
        { label: 'Unassigned rooms', count: matchingScheduleMeetings.filter(schedule => !schedule.roomId).length, detail: 'meetings still need a linked room', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Unassigned instructors', count: matchingScheduleMeetings.filter(schedule => !schedule.instructorId).length, detail: 'meetings still need a linked instructor', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Invalid or missing times', count: matchingScheduleMeetings.filter(schedule => reportingScheduleDuration(schedule) === null).length, detail: 'time range cannot be analyzed', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Potential room conflicts', count: roomConflicts, detail: 'overlapping room and weekday pairs', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Potential instructor conflicts', count: instructorConflicts, detail: 'overlapping instructor and weekday pairs', color: 'border-slate-200 bg-slate-100 text-slate-700' },
      ]
      matrixTitle = 'Teaching-time heatmap'
      matrixDescription = 'Class starts across the teaching week'
      secondaryTitle = 'Instruction format mix'
      secondaryDescription = 'Lecture, laboratory, and flexible session coverage'
      actionTitle = 'Schedule integrity checks'
      actionDescription = 'Assignment gaps and potential overlap risks'
    } else {
      const roleColumns = ['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor', 'Other']
      const today = new Date()
      matrixColumns = roleColumns
      matrixRows = Array.from({ length: 6 }, (_, reverseIndex) => {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - reverseIndex), 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - (4 - reverseIndex), 1)
        return {
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          values: roleColumns.map(role => matchingMembers.filter(member => {
            const joinedAt = timestampToDate(member.joinedAt) || timestampToDate(member.createdAt)
            const memberRole = roleColumns.includes(member.role) ? member.role : 'Other'
            return joinedAt !== null && joinedAt >= monthStart && joinedAt < monthEnd && memberRole === role
          }).length),
        }
      })

      const now = Date.now()
      const invitationCounts = new Map<string, number>([['Accepted', 0], ['Pending', 0], ['Expired', 0], ['Revoked', 0]])
      invitations.forEach(invitation => {
        const status = invitation.status?.toLowerCase() || 'pending'
        const expiresAt = timestampToDate(invitation.expiresAt)
        const label = status === 'pending' && expiresAt && expiresAt.getTime() <= now
          ? 'Expired'
          : status === 'accepted' ? 'Accepted'
            : status === 'revoked' ? 'Revoked' : 'Pending'
        invitationCounts.set(label, (invitationCounts.get(label) || 0) + 1)
      })
      secondaryData = Array.from(invitationCounts, ([label, value]) => ({ label, value }))

      const emailCounts = new Map<string, number>()
      matchingMembers.forEach(member => {
        const email = member.email.trim().toLowerCase()
        if (email && email !== 'no email recorded') emailCounts.set(email, (emailCounts.get(email) || 0) + 1)
      })
      const duplicateEmails = Array.from(emailCounts.values()).filter(count => count > 1).reduce((total, count) => total + count, 0)
      actionItems = [
        { label: 'Unverified linked accounts', count: matchingMembers.filter(member => member.status !== 'Pending' && !member.isVerified).length, detail: 'accepted members not email-verified', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Deactivated accounts', count: deactivatedMembers, detail: 'accounts currently unable to participate', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Unassigned departments', count: matchingMembers.filter(member => member.department === 'Unassigned').length, detail: 'organizational ownership is missing', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Memberships without users', count: matchingMembers.filter(member => !memberById.get(member.id)?.userId).length, detail: 'directory entries not linked to an account', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Duplicate email records', count: duplicateEmails, detail: 'members sharing a normalized email address', color: 'border-slate-200 bg-slate-100 text-slate-700' },
      ]
      matrixTitle = 'Role onboarding trend'
      matrixDescription = 'New memberships by role over the last six months'
      secondaryTitle = 'Invitation outcomes'
      secondaryDescription = 'Acceptance, pending, expiry, and revocation coverage'
      actionTitle = 'Member directory health'
      actionDescription = 'Account and membership records that need attention'
    }

    return {
      matrixColumns,
      matrixRows,
      matrixTitle,
      matrixDescription,
      secondaryData,
      secondaryTitle,
      secondaryDescription,
      actionItems,
      actionTitle,
      actionDescription,
    }
  })()

  const primaryDataMaximum = Math.max(0, ...detailedAnalytics.primaryData.flatMap(item => [item.value, item.secondary || 0]))
  const distributionTotal = detailedAnalytics.distributionData.reduce((total, item) => total + item.value, 0)
  const visibleDistributionData = detailedAnalytics.distributionData.filter(item => item.value > 0)
  const distributionGradient = (() => {
    if (distributionTotal <= 0) return '#e2e8f0'
    let cumulativeShare = 0
    const segments = visibleDistributionData.map(item => {
      const colorIndex = detailedAnalytics.distributionData.findIndex(distributionItem => distributionItem.label === item.label)
      const start = cumulativeShare
      cumulativeShare += item.value / distributionTotal * 100
      return `${CHART_COLORS[colorIndex % CHART_COLORS.length]} ${start}% ${cumulativeShare}%`
    })
    return `conic-gradient(${segments.join(', ')})`
  })()
  const rankedMaximum = Math.max(0, ...detailedAnalytics.rankedData.map(item => item.value))
  const matrixMaximum = Math.max(0, ...extendedAnalytics.matrixRows.flatMap(row => row.values))
  const secondaryMaximum = Math.max(0, ...extendedAnalytics.secondaryData.map(item => item.value))
  const secondaryTotal = extendedAnalytics.secondaryData.reduce((total, item) => total + item.value, 0)

  const exportAnalyticsCsv = () => {
    let headers: string[] = []
    let rows: string[][] = []

    if (analyticsKind === 'rooms') {
      headers = ['Room', 'Code', 'Type', 'Floor', 'Capacity', 'Status', 'Building', 'Building code', 'Amenities', 'Available days', 'Start time', 'End time']
      rows = matchingRooms.map(room => [
        room.name || 'Unnamed room',
        room.code || '',
        room.type || '',
        String(room.floor ?? ''),
        String(room.capacity ?? ''),
        room.status || 'Available',
        buildingById.get(room.buildingId || '')?.name || '',
        buildingById.get(room.buildingId || '')?.code || '',
        room.amenities?.join(', ') || '',
        room.availableDays?.join(', ') || '',
        room.startTime || '',
        room.endTime || '',
      ])
    } else if (analyticsKind === 'schedules') {
      headers = ['Department', 'Code', 'Title', 'Section', 'Days', 'Start time', 'End time', 'Status', 'Format', 'Instructor', 'Room', 'Time', 'Academic year', 'Semester']
      rows = matchingScheduleMeetings.map(schedule => {
        const instructor = memberById.get(schedule.instructorId || '') || memberByUserId.get(schedule.instructorId || '')
        const room = roomById.get(schedule.roomId || '')
        return [
          schedule.department || 'Unassigned',
          schedule.subjectCode || '',
          schedule.subjectTitle || '',
          roomScheduleSection(schedule),
          reportingScheduleDayText(schedule),
          schedule.startTime || '',
          schedule.endTime || '',
          formatScheduleStatus(schedule.status),
          schedule.format || '',
          reportingScheduleResource(formatUserName(userById.get(instructor?.userId || ''), instructor), schedule.faculty),
          reportingScheduleResource(room?.name || room?.code, schedule.room),
          reportingScheduleTimeText(schedule),
          schedule.academicYear || '',
          schedule.semester || schedule.semesterKey || '',
        ]
      })
    } else if (analyticsKind === 'members') {
      headers = ['Member', 'Email', 'Department', 'Role', 'Membership', 'Status']
      rows = matchingMembers.map(member => [member.name, member.email, member.department, member.role, member.membershipStatus, member.status])
    } else {
      headers = ['Reference', 'Date', 'Start time', 'End time', 'Purpose', 'Status', 'Room', 'Building', 'Requester', 'Email', 'Department', 'Duration (minutes)', 'Attendees', 'Subject code', 'Section']
      rows = matchingReservations.map(reservation => {
        const member = memberByUserId.get(reservation.userId || '')
        const user = userById.get(reservation.userId || '')
        const room = roomById.get(reservation.roomId || '')
        const building = buildingById.get(reservation.buildingId || room?.buildingId || '')
        return [
          reservation.id,
          reservation.date || '',
          reservation.startTime || '',
          reservation.endTime || '',
          reservation.purpose || '',
          formatReservationStatus(reservation.status),
          room?.code || room?.name || 'Unassigned',
          building?.name || building?.code || '',
          formatUserName(user, member) || 'Unknown requester',
          user?.email || member?.email || '',
          reservationDepartment(reservation),
          String(reservationDurationMinutes(reservation)),
          String(reservation.attendees ?? ''),
          reservation.subjectCode?.trim() || 'N/A',
          reservation.classSection?.trim() || 'N/A',
        ]
      })
    }

    downloadReportCsv(`${analyticsKind}-analytics.csv`, headers, rows)
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="Analytics"
          description="Review operational metrics across reservations, rooms, schedules, and member records."
        />

        <div className={`animate-in grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${availableAnalyticsOptions.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`} role="tablist" aria-label="Analytics categories">
          {availableAnalyticsOptions.map(option => {
            const AnalyticsIcon = option.icon
            const isActive = analyticsKind === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="analytics-metrics"
                onClick={() => selectAnalyticsKind(option.id)}
                className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] focus-visible:ring-offset-2 ${isActive ? 'bg-gradient-to-br from-[#e3edda] to-[#f3f7ee] text-[#41572a] shadow-sm ring-1 ring-[#c6dbb6]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                  <AnalyticsIcon className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{option.label}</span>
                  <span className="hidden truncate text-[0.65rem] leading-relaxed opacity-70 sm:block">{option.description}</span>
                </span>
                {isActive && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--brand-color)]" aria-hidden="true" />}
              </button>
            )
          })}
        </div>

        <div id="analytics-metrics" role="tabpanel" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, metricIndex) => (
            <article key={metricIndex} className={`animate-in relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all ${isCardHighlighted(metric.label) ? 'ring-2 ring-[var(--brand-color)] ring-offset-2 ring-offset-[var(--brand-surface)]' : ''}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
                </div>
                <p className="shrink-0 text-3xl font-black tracking-tight text-slate-900">{isLoading ? '—' : metric.value}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-12">
          <section className={`animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all xl:col-span-9 ${isCardHighlighted('Status breakdown') ? 'ring-2 ring-[var(--brand-color)] ring-offset-2 ring-offset-[var(--brand-surface)]' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700"><ClipboardIcon className="h-5 w-5" /></span>
              <div>
                <h2 className="font-black text-slate-900">Status breakdown</h2>
                <p className="text-xs text-slate-400">Within this analytics view</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3 overflow-x-auto custom-scrollbar pb-1">
              {statusBreakdown.map(({ status, count }) => {
                const share = percent(count, statusBreakdownTotal)
                const countAndShareLabel = count === 0 ? '0%' : `${count} · ${share}%`
                return (
                  <div key={status} className={`min-w-40 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm transition-all ${isCardHighlighted(status) ? 'ring-2 ring-[var(--brand-color)]' : ''}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-black text-slate-700">{status}</span>
                      <span className="shrink-0 text-sm font-black text-slate-900">{countAndShareLabel}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-[var(--brand-color)]" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className={`animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all xl:col-span-3 ${isCardHighlighted('Analytics scope') ? 'ring-2 ring-[var(--brand-color)] ring-offset-2 ring-offset-[var(--brand-surface)]' : ''}`}>
            <p className="text-sm font-bold text-slate-700">Analytics scope</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-600">Date range</dt><dd className="font-black text-slate-900">{selectedDateRangeLabel}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-600">Department</dt><dd className="max-w-36 truncate text-right font-black text-slate-900" title={selectedDepartmentLabel}>{selectedDepartmentLabel}</dd></div>
            </dl>
          </aside>
        </div>

        <section className="animate-in rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`${activeAnalyticsOption.label} analytics controls`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
              <TextInput
                value={searchQuery}
                onChange={setSearchQuery}
                icon={<SearchIcon className="h-5 w-5" />}
                placeholder="Search card titles..."
                aria-label="Search analytics card titles"
                className="w-full lg:max-w-xl"
              />
              <FilterDropdown
                groups={filterGroups}
                onClearAll={() => {
                  setDateRangeFilters([])
                  setDepartmentFilters([])
                }}
                buttonClassName="w-full sm:w-auto"
              />
            </div>
            <Button
              type="button"
              variant="brand"
              icon={<DownloadIcon className="h-4 w-4" />}
              onClick={exportAnalyticsCsv}
              disabled={isLoading || matchingRecordCount === 0}
              className="shrink-0"
            >
              Export CSV
            </Button>
          </div>
        </section>

        <section aria-label="Detailed analytics">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <AnalyticsPanel
              title={detailedAnalytics.primaryTitle}
              description={detailedAnalytics.primaryDescription}
              icon={<CalendarIcon className="h-5 w-5" />}
              className="flex flex-col xl:col-span-8"
              isHighlighted={isCardHighlighted(detailedAnalytics.primaryTitle)}
            >
              <div className="min-h-80 flex-1 px-2 pb-4 pt-5 sm:px-4">
                {primaryDataMaximum > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    {analyticsKind === 'reservations' ? (
                      <LineChart data={detailedAnalytics.primaryData} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={12} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                        <YAxis width={28} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipContentStyle} cursor={{ stroke: '#c6dbb6', strokeWidth: 1 }} />
                        <Line type="monotone" dataKey="value" name={detailedAnalytics.primaryValueLabel} stroke="#62853e" strokeWidth={3} dot={{ r: 3, fill: '#62853e', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="secondary" name={detailedAnalytics.primarySecondaryLabel} stroke="#0284c7" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                      </LineChart>
                    ) : (
                      <BarChart data={detailedAnalytics.primaryData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={14} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} />
                        <YAxis yAxisId="primary" width={28} allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <YAxis yAxisId="secondary" width={28} orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                        <Tooltip contentStyle={tooltipContentStyle} cursor={{ fill: '#f8fafc' }} />
                        <Bar yAxisId="primary" dataKey="value" name={detailedAnalytics.primaryValueLabel} fill="#62853e" radius={[6, 6, 0, 0]} maxBarSize={34} />
                        <Bar yAxisId="secondary" dataKey="secondary" name={detailedAnalytics.primarySecondaryLabel} fill="#a3c48b" radius={[6, 6, 0, 0]} maxBarSize={34} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <EmptyAnalyticsState message={isLoading ? 'Loading the latest Firestore records…' : 'Try widening the filters to reveal a trend.'} />
                )}
              </div>
              {primaryDataMaximum > 0 && (
                <div className="flex items-center justify-center gap-5 border-t border-slate-100 px-5 py-3 text-xs font-bold text-slate-500">
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-color)]" />{detailedAnalytics.primaryValueLabel}</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#a3c48b]" />{detailedAnalytics.primarySecondaryLabel}</span>
                </div>
              )}
            </AnalyticsPanel>

            <AnalyticsPanel
              title={detailedAnalytics.distributionTitle}
              description={detailedAnalytics.distributionDescription}
              icon={<LayersIcon className="h-5 w-5" />}
              className="flex flex-col xl:col-span-4"
              isHighlighted={isCardHighlighted(detailedAnalytics.distributionTitle)}
            >
              <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
                {distributionTotal > 0 ? (
                  <>
                    <div className="flex h-44 items-center justify-center">
                      <div
                        className="relative h-40 w-40 shrink-0 rounded-full"
                        style={{ background: distributionGradient }}
                        role="img"
                        aria-label={visibleDistributionData.map(item => `${item.label}: ${percent(item.value, distributionTotal)}%`).join(', ')}
                      >
                        <div className="absolute inset-5 flex items-center justify-center rounded-full bg-white">
                          <div className="text-center">
                          <p className="text-2xl font-black text-slate-900">{distributionTotal.toLocaleString()}</p>
                          <p className="text-[0.65rem] font-black uppercase tracking-wider text-slate-400">Total</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {detailedAnalytics.distributionData.map((item, index) => (
                        <div key={item.label} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          <span className="min-w-0 flex-1 truncate font-bold text-slate-600" title={item.label}>{item.label}</span>
                          <span className="shrink-0 tabular-nums font-black text-slate-900">{percent(item.value, distributionTotal)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyAnalyticsState message={isLoading ? 'Loading the latest Firestore records…' : 'No distribution is available for this filtered view.'} />
                )}
              </div>
            </AnalyticsPanel>

            <AnalyticsPanel
              title={extendedAnalytics.secondaryTitle}
              description={extendedAnalytics.secondaryDescription}
              icon={<LayersIcon className="h-5 w-5" />}
              className="flex flex-col xl:col-span-7"
              isHighlighted={isCardHighlighted(extendedAnalytics.secondaryTitle)}
            >
              <div className="flex flex-1 flex-col gap-4 p-5">
                {secondaryMaximum > 0 ? (
                  extendedAnalytics.secondaryData.map((item, index) => (
                    <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                          <span className="truncate text-sm font-black text-slate-700" title={item.label}>{item.label}</span>
                        </div>
                        <span className="shrink-0 tabular-nums text-sm font-black text-slate-900">
                          {item.value.toLocaleString()} <span className="text-xs text-slate-400">· {percent(item.value, secondaryTotal)}%</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <span
                          className="block h-full rounded-full transition-all"
                          style={{
                            backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                            width: `${item.value > 0 ? Math.max(3, item.value / secondaryMaximum * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyAnalyticsState message={isLoading ? 'Loading the latest Firestore records…' : 'No matching records are available for this distribution.'} />
                )}
              </div>
            </AnalyticsPanel>

            <AnalyticsPanel
              title="Operational highlights"
              description="Quick signals derived from the current analytics view"
              icon={<ClockIcon className="h-5 w-5" />}
              className="xl:col-span-5"
              isHighlighted={isCardHighlighted('Operational highlights')}
            >
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-2">
                {detailedAnalytics.insights.map(insight => (
                  <div key={insight.label} className={`rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all ${isCardHighlighted(insight.label) ? 'ring-2 ring-[var(--brand-color)]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">{insight.label}</p>
                      <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${insight.color.split(' ')[0]}`} />
                    </div>
                    <p className={`mt-2 truncate text-xl font-black ${insight.color.split(' ')[1]}`} title={insight.value}>{isLoading ? '—' : insight.value}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{insight.detail}</p>
                  </div>
                ))}
              </div>
            </AnalyticsPanel>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
            <AnalyticsPanel
              title={extendedAnalytics.matrixTitle}
              description={extendedAnalytics.matrixDescription}
              icon={<CalendarIcon className="h-5 w-5" />}
              className="xl:col-span-7"
              isHighlighted={isCardHighlighted(extendedAnalytics.matrixTitle)}
            >
              <div className="overflow-x-auto custom-scrollbar p-5">
                {matrixMaximum > 0 ? (
                  <table className="w-full min-w-145 border-separate border-spacing-1.5" aria-label={extendedAnalytics.matrixTitle}>
                    <thead>
                      <tr>
                        <th className="px-2 py-2 text-left text-[0.65rem] font-black uppercase tracking-wider text-slate-400">Period</th>
                        {extendedAnalytics.matrixColumns.map(column => (
                          <th key={column} className="px-2 py-2 text-center text-[0.65rem] font-black uppercase tracking-wider text-slate-400">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {extendedAnalytics.matrixRows.map(row => (
                        <tr key={row.label}>
                          <th className="whitespace-nowrap px-2 py-2 text-left text-xs font-black text-slate-600">{row.label}</th>
                          {row.values.map((value, columnIndex) => {
                            const intensity = matrixMaximum > 0 ? value / matrixMaximum : 0
                            return (
                              <td key={`${row.label}-${extendedAnalytics.matrixColumns[columnIndex]}`} className="p-0.5">
                                <span
                                  className={`flex h-10 min-w-16 items-center justify-center rounded-lg text-xs font-black transition-colors ${intensity > 0.55 ? 'text-white' : value > 0 ? 'text-[#41572a]' : 'text-slate-300'}`}
                                  style={{ backgroundColor: value > 0 ? `rgba(98, 133, 62, ${0.16 + intensity * 0.84})` : '#f8fafc' }}
                                  title={`${row.label}, ${extendedAnalytics.matrixColumns[columnIndex]}: ${value}`}
                                >
                                  {value}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyAnalyticsState message={isLoading ? 'Loading the latest Firestore records…' : 'There is not enough timing or onboarding data for this matrix.'} />
                )}
              </div>
              {matrixMaximum > 0 && (
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 text-[0.65rem] font-bold text-slate-400">
                  <span>Lower</span>
                  {[0.18, 0.38, 0.6, 0.82, 1].map(opacity => <span key={opacity} className="h-3 w-5 rounded-sm" style={{ backgroundColor: `rgba(98, 133, 62, ${opacity})` }} />)}
                  <span>Higher</span>
                </div>
              )}
            </AnalyticsPanel>

            <AnalyticsPanel
              title={detailedAnalytics.rankedTitle}
              description={detailedAnalytics.rankedDescription}
              icon={analyticsKind === 'members' ? <UsersIcon className="h-5 w-5" /> : analyticsKind === 'rooms' ? <BuildingIcon className="h-5 w-5" /> : <DoorIcon className="h-5 w-5" />}
              className="flex flex-col xl:col-span-5"
              isHighlighted={isCardHighlighted(detailedAnalytics.rankedTitle)}
            >
              <div className="flex flex-1 flex-col gap-4 p-5">
                {detailedAnalytics.rankedData.length > 0 ? detailedAnalytics.rankedData.map((item, index) => (
                  <div key={`${item.label}-${index}`}>
                    <div className="mb-1.5 flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-700" title={item.label}>{item.label}</p>
                        <p className="truncate text-xs text-slate-400">{item.detail}</p>
                      </div>
                      <span className="shrink-0 text-lg font-black text-slate-900">{item.value.toLocaleString()}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-[#62853e] to-[#a3c48b] transition-all"
                        style={{ width: `${rankedMaximum > 0 ? Math.max(3, item.value / rankedMaximum * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )) : <EmptyAnalyticsState message={isLoading ? 'Loading the latest Firestore records…' : 'No ranked records match the current filters.'} />}
              </div>
            </AnalyticsPanel>

            <AnalyticsPanel
              title={extendedAnalytics.actionTitle}
              description={extendedAnalytics.actionDescription}
              icon={<AlertCircleIcon className="h-5 w-5" />}
              className="xl:col-span-12"
              isHighlighted={isCardHighlighted(extendedAnalytics.actionTitle)}
            >
              <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
                {extendedAnalytics.actionItems.map(item => (
                  <div key={item.label} className={`rounded-xl border p-4 transition-all ${item.color} ${isCardHighlighted(item.label) ? 'ring-2 ring-[var(--brand-color)]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.07em] opacity-80">{item.label}</p>
                      <span className="shrink-0 text-2xl font-black leading-none">{isLoading ? '—' : item.count.toLocaleString()}</span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed opacity-75">{item.detail}</p>
                  </div>
                ))}
              </div>
            </AnalyticsPanel>
          </div>
        </section>
      </div>
    </section>
  )
}

export default AnalyticsPage
