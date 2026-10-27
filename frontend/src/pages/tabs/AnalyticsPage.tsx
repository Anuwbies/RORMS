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
  formatReportDate,
  reservationDurationMinutes,
  timeToMinutes,
  timestampToDate,
  useFacilityScheduleRecords,
  useReportingData,
  type ReservationReportRecord,
  type ScheduleReportRecord,
} from '../../utils/reportingData'
import { downloadReportCsv } from '../../utils/reportCsv'
import { scheduleMatchesTerm } from '../../utils/roomSchedule'
import { useAcademicSemester } from '../../utils/academicSemester'
import { buildingScheduleUsage } from '../../utils/buildingScheduleUsage'
import type { Building, RoomStatus } from '../../types/room'
import type { ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { reservationDisplayStatus, reservationEvidenceFiles } from '../../utils/reservationEvidence'
import { reservationReviewStep } from '../../utils/reservationReviewStep'
import {
  isWorkbookSchedule,
  reportingScheduleConflicts,
  reportingScheduleDays,
  reportingScheduleDayText,
  reportingScheduleDuration,
  reportingScheduleMeetings,
  reportingScheduleResource,
  reportingScheduleTimeText,
  reportingScheduleWeeklyMinutes,
  scheduleReportRowId,
} from '../../utils/scheduleReporting'

type AnalyticsKind = 'reservations' | 'rooms' | 'schedules' | 'members'

interface AnalyticsPageProps {
  userRole: string
}

interface ChartDatum {
  label: string
  value: number
  secondary?: number
}

interface RankedDatum extends ChartDatum {
  detail: string
  suffix?: string
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

interface AnalyticsMemberRecord {
  id: string
  name: string
  email: string
  department: string
  role: string
  status: 'Active' | 'Pending' | 'Deactivated'
  joinedAt?: unknown
  activityAt?: unknown
  isVerified: boolean
  isReactivation: boolean
}

type AnalyticsScheduleRecord = ScheduleReportRecord & { reportCollection: 'schedule' | 'schedules' }

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
const MEMBER_DEPARTMENT_PREFIXES = ['Administrative Office', "Registrar's Office", 'General Service Department', 'Unassigned']
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

function memberDepartment(role: string, department?: string) {
  return department?.trim() || (role === 'Admin' ? 'Administrative Office'
    : role === 'Registrar' ? "Registrar's Office"
      : role === 'University Administrator' ? 'General Service Department' : 'Unassigned')
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
  const { reservations, rooms, buildings, memberships, invitations, users, departments, schedules, errors, isLoading } = useReportingData()
  const { records: currentScheduleRecords, isLoading: isCurrentSchedulesLoading, error: currentSchedulesError } = useFacilityScheduleRecords()
  const { activeAcademicYear, currentSemester, isLoading: isAcademicYearLoading } = useAcademicSemester()
  const isUniversityAdministrator = userRole.trim().toLowerCase() === 'university administrator'
  const isDepartmentLeader = ['dean', 'program head'].includes(userRole.trim().toLowerCase())
  const [analyticsKind, setAnalyticsKind] = useState<AnalyticsKind>(() => {
    const storedAnalyticsKind = getStoredAnalyticsKind()
    return (isUniversityAdministrator && storedAnalyticsKind !== 'reservations' && storedAnalyticsKind !== 'rooms')
      || (isDepartmentLeader && storedAnalyticsKind !== 'reservations' && storedAnalyticsKind !== 'schedules') ? 'reservations' : storedAnalyticsKind
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRangeFilters, setDateRangeFilters] = useState<string[]>([])
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([])

  const availableAnalyticsOptions = isUniversityAdministrator
    ? ANALYTICS_OPTIONS.filter(option => option.id === 'reservations' || option.id === 'rooms')
    : isDepartmentLeader
    ? ANALYTICS_OPTIONS.filter(option => option.id === 'reservations' || option.id === 'schedules')
    : ANALYTICS_OPTIONS

  useEffect(() => {
    if ((isUniversityAdministrator && analyticsKind !== 'reservations' && analyticsKind !== 'rooms')
      || (isDepartmentLeader && analyticsKind !== 'reservations' && analyticsKind !== 'schedules')) {
      setAnalyticsKind('reservations')
    }
  }, [analyticsKind, isUniversityAdministrator, isDepartmentLeader])

  const selectAnalyticsKind = (nextAnalyticsKind: AnalyticsKind) => {
    setAnalyticsKind(nextAnalyticsKind)
    setSearchQuery(previous => previous ? '' : previous)
    setDateRangeFilters(previous => previous.length ? [] : previous)
    setDepartmentFilters(previous => previous.length ? [] : previous)

    try {
      window.sessionStorage.setItem(ANALYTICS_KIND_STORAGE_KEY, nextAnalyticsKind)
    } catch {
      // Analytics remains usable when browser storage is unavailable.
    }
  }

  const scheduleRecords = useMemo(() => [
    ...schedules.map(schedule => ({ schedule, collection: 'schedule' as const })),
    ...currentScheduleRecords.map(schedule => ({ schedule, collection: 'schedules' as const })),
  ], [schedules, currentScheduleRecords])
  const scheduleRows = useMemo(() => {
    const rows = new Map<string, AnalyticsScheduleRecord>()
    scheduleRecords.forEach(({ schedule, collection }) => {
      if (!isWorkbookSchedule(schedule) && schedule.parentId) return
      const key = `${collection}:${isWorkbookSchedule(schedule) ? scheduleReportRowId(schedule) : schedule.id}`
      const existing = rows.get(key)
      if (!existing) rows.set(key, { ...schedule, reportCollection: collection })
      else if (formatScheduleStatus(schedule.status) === 'Plot') rows.set(key, { ...existing, status: 'Plot' })
    })
    return [...rows.values()]
  }, [scheduleRecords])
  const scheduleMeetings = useMemo(() => reportingScheduleMeetings([...schedules, ...currentScheduleRecords]), [schedules, currentScheduleRecords])
  const currentTermMeetings = useMemo(() => activeAcademicYear
    ? scheduleMeetings.filter(schedule => scheduleMatchesTerm({ ...schedule }, activeAcademicYear, currentSemester))
    : scheduleMeetings, [scheduleMeetings, activeAcademicYear, currentSemester])
  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const buildingById = useMemo(() => new Map(buildings.map(building => [building.id, building])), [buildings])
  const memberById = useMemo(() => new Map(memberships.map(member => [member.id, member])), [memberships])
  const memberByUserId = useMemo(() => new Map(memberships.filter(member => member.userId).map(member => [member.userId as string, member])), [memberships])
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const pendingInvitations = useMemo(() => {
    const now = Date.now()
    return invitations.filter(invitation => {
      const expiresAt = timestampToDate(invitation.expiresAt)
      return invitation.status?.toLowerCase() === 'pending' && (expiresAt === null || expiresAt.getTime() > now)
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
  const memberRecords = useMemo<AnalyticsMemberRecord[]>(() => {
    const membershipsById = new Map(memberships.map(member => [member.id, member]))
    const membershipsByEmail = new Map(memberships.filter(member => member.email).map(member => [member.email!.toLowerCase(), member]))
    const usersByEmail = new Map(users.filter(user => user.email).map(user => [user.email!.toLowerCase(), user]))
    const linkedUserIds = new Set(memberships.filter(member => member.userId && userById.has(member.userId)).map(member => member.userId))
    const accounts = memberships.flatMap(member => {
      const user = userById.get(member.userId || '')
      if (!user) return []
      const email = user.email || member.email || ''
      if (user.isActive === false && pendingEmails.has(email.toLowerCase())) return []
      const role = member.role || 'Instructor'
      return [{ id: `membership:${member.id}`, name: formatUserName(user, member) || email || 'Unnamed member', email,
        department: memberDepartment(role, member.department), role, status: user.isActive === false ? 'Deactivated' as const : 'Active' as const,
        joinedAt: user.createdAt, activityAt: user.createdAt, isVerified: user.isVerify === true, isReactivation: false }]
    })
    const unlinkedDeactivated = users.filter(user => user.isActive === false && !linkedUserIds.has(user.id)
      && !pendingEmails.has(user.email?.toLowerCase() || '')).map(user => ({
        id: `user:${user.id}`, name: formatUserName(user) || user.email || 'Unnamed member', email: user.email || '',
        department: 'Unassigned', role: 'Instructor', status: 'Deactivated' as const,
        joinedAt: user.createdAt, activityAt: user.createdAt, isVerified: user.isVerify === true, isReactivation: false,
      }))
    const pending = pendingInvitations.map(invitation => {
      const membership = (invitation.membershipId ? membershipsById.get(invitation.membershipId) : undefined)
        || membershipsByEmail.get(invitation.email?.toLowerCase() || '')
      const user = usersByEmail.get(invitation.email?.toLowerCase() || '')
      const role = membership?.role || invitation.role || 'Instructor'
      const email = invitation.email || ''
      return { id: `invitation:${invitation.id}`, name: formatUserName(user, membership) || email || 'Unnamed member', email,
        department: memberDepartment(role, membership?.department || invitation.department), role, status: 'Pending' as const,
        joinedAt: user?.createdAt, activityAt: invitation.createdAt, isVerified: user?.isVerify === true,
        isReactivation: Boolean(invitation.isReactivation || membership?.userId || user) }
    })
    return [...accounts, ...unlinkedDeactivated, ...pending]
  }, [memberships, users, pendingEmails, pendingInvitations, userById])

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

  const matchingReservations = useMemo(() => reservations.filter(reservation => (
    isInDateRange(dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt))
    && matchesDepartment(reservationDepartment(reservation))
  )), [reservations, dateRangeStart, dateRangeEnd, departmentFilters, memberByUserId])
  const roomDepartments = useMemo(() => {
    const departmentsByRoom = new Map<string, Set<string>>()
    currentTermMeetings.forEach(schedule => {
      if (!schedule.roomId) return
      const assigned = departmentsByRoom.get(schedule.roomId) || new Set<string>()
      assigned.add(schedule.department?.trim() || 'Unassigned')
      departmentsByRoom.set(schedule.roomId, assigned)
    })
    return departmentsByRoom
  }, [currentTermMeetings])
  const matchingRooms = useMemo(() => rooms.filter(room => {
    if (!isInDateRange(timestampToDate(room.createdAt))) return false
    const assignedDepartments = roomDepartments.get(room.id)
    return assignedDepartments?.size ? [...assignedDepartments].some(matchesDepartment) : matchesDepartment('Unassigned')
  }), [rooms, roomDepartments, dateRangeStart, dateRangeEnd, departmentFilters])
  const matchingBuildings = useMemo(() => {
    const buildingIds = new Set(matchingRooms.map(room => room.buildingId))
    return buildings.filter(building => {
      const hasMatchingRoom = buildingIds.has(building.id)
      return departmentFilters.length > 0 ? hasMatchingRoom : hasMatchingRoom || isInDateRange(timestampToDate(building.createdAt))
    })
  }, [buildings, matchingRooms, dateRangeStart, dateRangeEnd, departmentFilters])
  const matchingSchedules = useMemo(() => scheduleRows.filter(schedule => (
    isInDateRange(timestampToDate(schedule.createdAt))
    && matchesDepartment(schedule.department)
  )), [scheduleRows, dateRangeStart, dateRangeEnd, departmentFilters])
  const matchingScheduleMeetings = useMemo(() => scheduleMeetings.filter(schedule => (
    isInDateRange(timestampToDate(schedule.createdAt))
    && matchesDepartment(schedule.department)
  )), [scheduleMeetings, dateRangeStart, dateRangeEnd, departmentFilters])
  const matchingMembers = useMemo(() => memberRecords.filter(member => (
    isInDateRange(timestampToDate(member.activityAt))
    && matchesDepartment(member.department)
  )), [memberRecords, dateRangeStart, dateRangeEnd, departmentFilters])
  const facilityUsage = useMemo(() => {
    const normalizedBuildings: Building[] = buildings.map(building => ({
      id: building.id,
      name: building.name || '',
      code: building.code || '',
      floor: 0,
      capacity: 0,
      rooms: rooms.filter(room => room.buildingId === building.id).map(room => {
        const status: RoomStatus = room.status === 'Available' || room.status === 'Maintenance' ? room.status : 'Unavailable'
        return { id: room.id, buildingId: room.buildingId, image: '', code: room.code || '', name: room.name || '',
          type: room.type || '', floor: Number(room.floor) || 0, capacity: Number(room.capacity) || 0, status,
          description: room.description || '', amenities: room.amenities || [], availableDays: room.availableDays || [],
          startTime: room.startTime || '', endTime: room.endTime || '', minBookingMins: room.minBookingMins || 0,
          maxBookingMins: room.maxBookingMins || 0 }
      }),
    }))
    return buildingScheduleUsage(normalizedBuildings, currentTermMeetings as unknown as ScheduleMeetingRecord[], activeAcademicYear, currentSemester)
  }, [buildings, rooms, currentTermMeetings, activeAcademicYear, currentSemester])
  const facilityUsageLoading = isLoading || isCurrentSchedulesLoading || isAcademicYearLoading
  const facilityUsageError = Boolean(currentSchedulesError || errors.includes('schedule'))

  const totalRoomCapacity = matchingRooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)
  const deactivatedMembers = matchingMembers.filter(member => member.status === 'Deactivated').length

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
    ? matchingRooms.length + matchingBuildings.length
    : analyticsKind === 'schedules'
      ? matchingSchedules.length
      : analyticsKind === 'members'
        ? matchingMembers.length
        : matchingReservations.length
  const analyticsLoading = isLoading || ((analyticsKind === 'rooms' || analyticsKind === 'schedules') && isCurrentSchedulesLoading)
    || (analyticsKind === 'rooms' && isAcademicYearLoading)

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
      const extendedRequests = matchingReservations.filter(reservation => reservation.requestType === 'Extended').length
      insights = [
        { label: 'Busiest booking day', value: busiestDay?.[0] || '—', detail: busiestDay ? `${busiestDay[1]} requests` : 'No dated requests', color: 'bg-sky-500 text-sky-700' },
        { label: 'Peak start period', value: peakBand?.[1] ? peakBand[0] : '—', detail: peakBand?.[1] ? `${peakBand[1]} requests` : 'No start times', color: 'bg-amber-500 text-amber-700' },
        { label: 'Average lead time', value: leadTimes.length ? `${averageLeadTime.toFixed(1)} days` : '—', detail: 'from request to reserved date', color: 'bg-purple-500 text-purple-700' },
        { label: 'Extended requests', value: extendedRequests.toLocaleString(), detail: `${roomsUsed} different rooms requested`, color: 'bg-emerald-500 text-emerald-700' },
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
      matchingBuildings.forEach(building => {
        buildingStats.set(building.code || building.name || 'Unnamed building', { rooms: 0, capacity: 0 })
      })
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

      const buildingUsage = matchingBuildings.map(building => ({
        label: `${building.code || building.name || 'Unnamed building'} · Building`,
        value: Math.round(facilityUsage.buildings[building.id]?.totalPercent || 0),
        detail: `${building.name || building.code || 'Building'} · scheduled hours used`,
        suffix: '%',
      })).sort((first, second) => second.value - first.value).slice(0, 3)
      const roomUsage = matchingRooms.filter(room => room.status === 'Available').map(room => ({
        label: `${room.code || room.name || 'Unnamed room'} · Room`,
        value: Math.round(facilityUsage.rooms[room.id]?.totalPercent || 0),
        detail: `${buildingById.get(room.buildingId || '')?.name || 'Building unavailable'} · scheduled hours used`,
        suffix: '%',
      })).sort((first, second) => second.value - first.value).slice(0, 3)
      rankedData = facilityUsageLoading || facilityUsageError || !activeAcademicYear ? [] : [...buildingUsage, ...roomUsage]

      const largestRoom = [...matchingRooms].sort((first, second) => (Number(second.capacity) || 0) - (Number(first.capacity) || 0))[0]
      const availableCapacity = matchingRooms.filter(room => (room.status || 'Available').toLowerCase() === 'available').reduce((total, room) => total + (Number(room.capacity) || 0), 0)
      const roomsWithAmenities = matchingRooms.filter(room => (room.amenities?.length || 0) > 0).length
      insights = [
        { label: 'Average room capacity', value: matchingRooms.length ? Math.round(totalRoomCapacity / matchingRooms.length).toLocaleString() : '—', detail: 'seats per matching room', color: 'bg-sky-500 text-sky-700' },
        { label: 'Largest room', value: largestRoom?.code || largestRoom?.name || '—', detail: largestRoom ? `${Number(largestRoom.capacity) || 0} recorded seats` : 'No capacity data', color: 'bg-purple-500 text-purple-700' },
        { label: 'Available capacity', value: availableCapacity.toLocaleString(), detail: `${percent(availableCapacity, totalRoomCapacity)}% of recorded seats`, color: 'bg-emerald-500 text-emerald-700' },
        { label: 'Facility coverage', value: `${matchingBuildings.length}/${buildings.length}`, detail: `${roomsWithAmenities} rooms list amenities`, color: 'bg-amber-500 text-amber-700' },
      ]
      primaryTitle = 'Rooms by building'
      primaryDescription = 'Room inventory and recorded seat capacity by location'
      primaryValueLabel = 'Rooms'
      primarySecondaryLabel = 'Seats'
      distributionTitle = 'Room type mix'
      distributionDescription = 'How the room inventory is configured'
      rankedTitle = 'Schedule usage by facility'
      rankedDescription = activeAcademicYear ? `Current term: ${activeAcademicYear.academicYear} · ${currentSemester}` : 'Current academic term is unavailable'
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
          const joinedAt = timestampToDate(member.joinedAt)
          return member.status !== 'Pending' && joinedAt !== null && joinedAt >= monthStart && joinedAt < monthEnd
        }).length
        return {
          label: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          value: joined,
          detail: joined === 1 ? '1 member joined' : `${joined} members joined`,
        }
      })

      const linkedAccounts = matchingMembers.filter(member => member.status !== 'Pending')
      const verifiedMembers = linkedAccounts.filter(member => member.isVerified).length
      const representedDepartments = new Set(matchingMembers.map(member => member.department).filter(department => department !== 'Unassigned')).size
      const topRole = [...distributionData].sort((first, second) => second.value - first.value)[0]
      insights = [
        { label: 'Verified accounts', value: `${percent(verifiedMembers, linkedAccounts.length)}%`, detail: `${verifiedMembers} linked accounts verified`, color: 'bg-emerald-500 text-emerald-700' },
        { label: 'Departments represented', value: representedDepartments.toLocaleString(), detail: `${departments.length} academic departments recorded`, color: 'bg-sky-500 text-sky-700' },
        { label: 'Largest role group', value: topRole?.value ? topRole.label : '—', detail: topRole?.value ? `${topRole.value} members` : 'No role data', color: 'bg-purple-500 text-purple-700' },
        { label: 'Open invitations', value: matchingMembers.filter(member => member.status === 'Pending').length.toLocaleString(), detail: 'pending and not yet expired', color: 'bg-amber-500 text-amber-700' },
      ]
      primaryTitle = 'Members by department'
      primaryDescription = 'Membership coverage and active accounts across the organization'
      primaryValueLabel = 'Members'
      primarySecondaryLabel = 'Active'
      distributionTitle = 'Role distribution'
      distributionDescription = 'How responsibilities are represented in the directory'
      rankedTitle = 'Member growth'
      rankedDescription = 'New user accounts over the last six months'
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

      secondaryData = [30, 60, 90].map(duration => ({
        label: `${duration} minutes`,
        value: matchingReservations.filter(reservation => reservation.requestType !== 'Extended' && reservationDurationMinutes(reservation) === duration).length,
      }))
      secondaryData.push(
        { label: 'Other standard', value: matchingReservations.filter(reservation => reservation.requestType !== 'Extended' && ![30, 60, 90].includes(reservationDurationMinutes(reservation))).length },
        { label: 'Extended', value: matchingReservations.filter(reservation => reservation.requestType === 'Extended').length },
      )

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const isPending = (status?: string) => (status || 'Pending').toLowerCase() === 'pending'
      const pendingByStep = (step: string) => matchingReservations.filter(reservation => isPending(reservation.status)
        && reservationReviewStep({ ...reservation, status: reservation.status || 'Pending' }) === step).length
      const pendingPast = matchingReservations.filter(reservation => {
        const date = dateStringToDate(reservation.date)
        return isPending(reservation.status) && date !== null && date < todayStart
      }).length
      const declinedWithoutReason = matchingReservations.filter(reservation => ['declined', 'rejected'].includes(reservation.status?.toLowerCase() || '') && !reservation.declinedReason?.trim()).length
      const needsEvidence = matchingReservations.filter(reservation => reservationDisplayStatus(reservation.status || 'Pending', reservation) === 'Needs Evidence').length
      actionItems = [
        { label: 'Overdue pending requests', count: pendingPast, detail: 'reservation date has already passed', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Awaiting Dean', count: pendingByStep('Dean'), detail: 'first recommendation is pending', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Awaiting Registrar', count: pendingByStep('Registrar'), detail: 'second recommendation is pending', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Awaiting final approval', count: pendingByStep('University Administrator'), detail: 'both recommendations are recorded', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
        { label: 'Completed, needs evidence', count: needsEvidence, detail: 'no completion evidence attached', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Declines without a reason', count: declinedWithoutReason, detail: 'decision context is missing', color: 'border-purple-200 bg-purple-50 text-purple-700' },
      ]
      matrixTitle = 'Reservation demand heatmap'
      matrixDescription = 'Request starts by weekday and time of day'
      secondaryTitle = 'Booking duration profile'
      secondaryDescription = 'Standard durations and extended requests'
      actionTitle = 'Reservation action queue'
      actionDescription = 'Requests and data conditions worth reviewing'
    } else if (analyticsKind === 'rooms') {
      const matchingRoomIds = new Set(matchingRooms.map(room => room.id))
      matrixColumns = ['Available', 'Classes', 'Bookings']
      matrixRows = DAY_ORDER.map(label => ({ label, values: [0, 0, 0] }))
      matchingRooms.filter(room => room.status === 'Available').forEach(room => room.availableDays?.forEach(day => {
        const row = matrixRows.find(item => item.label === normalizeScheduleDay(day))
        if (row) row.values[0] += 1
      }))
      currentTermMeetings.filter(schedule => matchingRoomIds.has(schedule.roomId || '')).forEach(schedule => reportingScheduleDays(schedule).forEach(day => {
        const row = matrixRows.find(item => item.label === day)
        if (row) row.values[1] += 1
      }))
      matchingReservations.filter(reservation => matchingRoomIds.has(reservation.roomId || '') && ['approved', 'completed'].includes(reservation.status?.toLowerCase() || '')).forEach(reservation => {
        const date = dateStringToDate(reservation.date)
        const row = date ? matrixRows.find(item => item.label === date.toLocaleDateString('en-US', { weekday: 'short' })) : undefined
        if (row) row.values[2] += 1
      })

      const capacityBuckets = [
        { label: '50–75 seats', minimum: 50, maximum: 75 },
        { label: '75–100 seats', minimum: 75, maximum: 100 },
        { label: '100+ seats', minimum: 100, maximum: Number.POSITIVE_INFINITY },
      ]
      secondaryData = capacityBuckets.map(bucket => ({
        label: bucket.label,
        value: matchingRooms.filter(room => {
          const capacity = Number(room.capacity) || 0
          return capacity >= bucket.minimum && capacity < bucket.maximum
        }).length,
      }))

      const usedRoomIds = new Set([
        ...currentTermMeetings.map(schedule => schedule.roomId).filter((id): id is string => Boolean(id)),
        ...matchingReservations.map(reservation => reservation.roomId).filter((id): id is string => Boolean(id)),
      ])
      actionItems = [
        { label: 'Missing capacity', count: matchingRooms.filter(room => !(Number(room.capacity) > 0)).length, detail: 'rooms without usable seat data', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'No listed amenities', count: matchingRooms.filter(room => !room.amenities?.length).length, detail: 'facility details are incomplete', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'No availability days', count: matchingRooms.filter(room => !room.availableDays?.length).length, detail: 'weekly availability is not configured', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Missing operating hours', count: matchingRooms.filter(room => !room.startTime || !room.endTime).length, detail: 'start or end time is absent', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Unused room inventory', count: matchingRooms.filter(room => !usedRoomIds.has(room.id)).length, detail: 'no current-term class or matching booking', color: 'border-slate-200 bg-slate-100 text-slate-700' },
      ]
      matrixTitle = 'Weekly facility coverage'
      matrixDescription = 'Available rooms, current-term classes, and matching bookings'
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
      const roleColumns = ['Admin', 'Registrar', 'University Administrator', 'Dean', 'Program Head', 'Instructor', 'Other']
      const today = new Date()
      matrixColumns = roleColumns
      matrixRows = Array.from({ length: 6 }, (_, reverseIndex) => {
        const monthStart = new Date(today.getFullYear(), today.getMonth() - (5 - reverseIndex), 1)
        const monthEnd = new Date(today.getFullYear(), today.getMonth() - (4 - reverseIndex), 1)
        return {
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          values: roleColumns.map(role => matchingMembers.filter(member => {
            const joinedAt = timestampToDate(member.joinedAt)
            const memberRole = roleColumns.includes(member.role) ? member.role : 'Other'
            return member.status !== 'Pending' && joinedAt !== null && joinedAt >= monthStart && joinedAt < monthEnd && memberRole === role
          }).length),
        }
      })

      const now = Date.now()
      const invitationCounts = new Map<string, number>([['Accepted', 0], ['Pending', 0], ['Expired', 0], ['Revoked', 0]])
      const membershipsById = new Map(memberships.map(member => [member.id, member]))
      invitations.forEach(invitation => {
        if (!isInDateRange(timestampToDate(invitation.createdAt))) return
        const membership = membershipsById.get(invitation.membershipId || '')
        const role = membership?.role || invitation.role || 'Instructor'
        if (!matchesDepartment(memberDepartment(role, membership?.department || invitation.department))) return
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
      const orphanMemberships = memberships.filter(member => (!member.userId || !userById.has(member.userId)) && !pendingMembershipIds.has(member.id)
        && isInDateRange(timestampToDate(member.createdAt)) && matchesDepartment(memberDepartment(member.role || 'Instructor', member.department))).length
      actionItems = [
        { label: 'Unverified accounts', count: matchingMembers.filter(member => member.status !== 'Pending' && !member.isVerified).length, detail: 'user profiles not email-verified', color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Deactivated accounts', count: deactivatedMembers, detail: 'accounts currently unable to participate', color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Unassigned departments', count: matchingMembers.filter(member => member.department === 'Unassigned').length, detail: 'organizational ownership is missing', color: 'border-purple-200 bg-purple-50 text-purple-700' },
        { label: 'Pending re-invitations', count: matchingMembers.filter(member => member.status === 'Pending' && member.isReactivation).length, detail: 'deactivated users awaiting reactivation', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Memberships without users', count: orphanMemberships, detail: 'no linked account or live invitation', color: 'border-sky-200 bg-sky-50 text-sky-700' },
        { label: 'Duplicate email records', count: duplicateEmails, detail: 'members sharing a normalized email address', color: 'border-slate-200 bg-slate-100 text-slate-700' },
      ]
      matrixTitle = 'Role onboarding trend'
      matrixDescription = 'New user accounts by role over the last six months'
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
      headers = ['Record', 'Name', 'Code', 'Building', 'Building code', 'Type', 'Floor', 'Capacity', 'Rooms', 'Status', 'Amenities', 'Available days', 'Start time', 'End time', 'Minimum booking (minutes)', 'Maximum booking (minutes)', 'Schedule usage (%)', 'Schedule term']
      const term = activeAcademicYear ? `${activeAcademicYear.academicYear} · ${currentSemester}` : ''
      rows = [
        ...matchingBuildings.map(building => {
          const buildingRooms = matchingRooms.filter(room => room.buildingId === building.id)
          const capacity = buildingRooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)
          const floors = buildingRooms.map(room => Number(room.floor)).filter(Number.isFinite)
          return ['Building', building.name || building.code || 'Unnamed building', building.code || '', '', '', '',
            floors.length ? String(Math.max(...floors)) : '', String(capacity), String(buildingRooms.length), '', '', '', '', '', '', '',
            facilityUsageLoading || facilityUsageError || !activeAcademicYear ? '' : (facilityUsage.buildings[building.id]?.totalPercent || 0).toFixed(1), term]
        }),
        ...matchingRooms.map(room => {
          const building = buildingById.get(room.buildingId || '')
          return ['Room', room.name || room.code || 'Unnamed room', room.code || '', building?.name || '', building?.code || '',
            room.type || '', String(room.floor ?? ''), String(room.capacity ?? ''), '', room.status || '',
            room.amenities?.join(', ') || '', room.availableDays?.join(', ') || '', room.startTime || '', room.endTime || '',
            String(room.minBookingMins ?? ''), String(room.maxBookingMins ?? ''),
            facilityUsageLoading || facilityUsageError || !activeAcademicYear || room.status !== 'Available' ? '' : (facilityUsage.rooms[room.id]?.totalPercent || 0).toFixed(1), term]
        }),
      ]
    } else if (analyticsKind === 'schedules') {
      headers = ['Department', 'Academic year', 'Semester', 'Year level', 'College', 'Subject Area', 'Code', 'Descriptive Title', 'Course', 'Units Lec', 'Units Lab', 'Units Total', 'Hours Lec', 'Hours Lab', 'Hours Total', 'Max No. of Stud.', 'Section', 'Faculty Lec', 'Faculty Lab', 'F2F Time Lec', 'F2F Time Lab', 'F2F Days Lec', 'F2F Days Lab', 'F2F Room Lec', 'F2F Room Lab', 'Status']
      rows = matchingSchedules.map(schedule => {
        const isWorkbook = isWorkbookSchedule(schedule)
        const sourceId = scheduleReportRowId(schedule)
        const meetings = isWorkbook ? scheduleRecords.filter(record => record.collection === schedule.reportCollection
          && scheduleReportRowId(record.schedule) === sourceId).map(record => record.schedule) : reportingScheduleMeetings([schedule])
        const rawValues = schedule.rawValues?.length === 21 ? schedule.rawValues : []
        const text = (value?: string | number | null) => value === null || value === undefined ? '' : String(value).trim()
        const field = (index: number, fallback?: string | number | null) => rawValues[index]?.trim() || text(fallback)
        const list = (values?: string[]) => values?.filter(Boolean).join(' / ') || ''
        const meetingValue = (format: 'lec' | 'lab', value: (meeting: ScheduleReportRecord) => string) => meetings
          .filter(meeting => (meeting.format?.toLowerCase() === 'lab' ? 'lab' : 'lec') === format)
          .map(value).filter(value => value && value !== '----').join(' / ')
        const meetingFaculty = (meeting: ScheduleReportRecord) => {
          const saved = typeof meeting.faculty === 'string' ? meeting.faculty.trim() : ''
          const instructor = memberById.get(meeting.instructorId || '') || memberByUserId.get(meeting.instructorId || '')
          return isWorkbook && saved ? saved : reportingScheduleResource(formatUserName(userById.get(instructor?.userId || ''), instructor), meeting.faculty)
        }
        const meetingRoom = (meeting: ScheduleReportRecord) => {
          const room = roomById.get(meeting.roomId || '')
          return isWorkbook && meeting.room?.trim() ? meeting.room.trim() : reportingScheduleResource(room?.name || room?.code, meeting.room)
        }
        return [schedule.department || 'Unassigned', schedule.academicYear || '', schedule.semester || schedule.semesterKey || '',
          schedule.yearLevelLabel?.split(':', 1)[0].trim() || (schedule.yearLevel ? `Year ${schedule.yearLevel}` : ''),
          field(0, schedule.college), field(1, schedule.subjectArea), field(2, schedule.subjectCode), field(3, schedule.subjectTitle),
          field(4, schedule.course), field(5, schedule.units?.lec), field(6, schedule.units?.lab),
          field(7, schedule.units?.total ?? schedule.credits), field(8, schedule.hours?.lec), field(9, schedule.hours?.lab),
          field(10, schedule.hours?.total), field(11, schedule.maxStudents), field(12, schedule.classSection),
          field(13, meetingValue('lec', meetingFaculty)), field(14, meetingValue('lab', meetingFaculty)),
          field(15, list(schedule.f2fTime?.lec) || meetingValue('lec', reportingScheduleTimeText)),
          field(16, list(schedule.f2fTime?.lab) || meetingValue('lab', reportingScheduleTimeText)),
          field(17, list(schedule.f2fDays?.lec) || meetingValue('lec', reportingScheduleDayText)),
          field(18, list(schedule.f2fDays?.lab) || meetingValue('lab', reportingScheduleDayText)),
          field(19, list(schedule.f2fRoom?.lec) || meetingValue('lec', meetingRoom)),
          field(20, list(schedule.f2fRoom?.lab) || meetingValue('lab', meetingRoom)), formatScheduleStatus(schedule.status)]
      })
    } else if (analyticsKind === 'members') {
      headers = ['Member', 'Email', 'Role', 'Department', 'Status', 'Join date', 'Invitation type', 'Invitation sent']
      rows = matchingMembers.map(member => [member.name, member.email, member.role, member.department, member.status,
        member.joinedAt ? formatReportDate(member.joinedAt, '') : '', member.status === 'Pending' ? member.isReactivation ? 'Re-invitation' : 'Invitation' : '',
        member.status === 'Pending' && member.activityAt ? formatReportDate(member.activityAt, '') : ''])
    } else {
      headers = ['Reference', 'Date', 'Start time', 'End time', 'Purpose', 'Type', 'Review step', 'Status', 'Room', 'Building', 'Requester', 'Email', 'Department', 'Duration (minutes)', 'Attendees', 'Subject code', 'Section', 'Dean recommended', 'Registrar recommended', 'University Administrator approved', 'Declined by', 'Decline reason', 'Cancellation reason', 'Evidence files']
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
          reservation.requestType === 'Extended' ? 'Extended' : 'Standard',
          reservationReviewStep({ ...reservation, status: reservation.status || 'Pending' }),
          reservationDisplayStatus(formatReservationStatus(reservation.status), reservation),
          room?.code || room?.name || 'Unassigned',
          building?.name || building?.code || '',
          formatUserName(user, member) || 'Unknown requester',
          user?.email || member?.email || '',
          reservationDepartment(reservation),
          String(reservationDurationMinutes(reservation)),
          String(reservation.attendees ?? ''),
          reservation.subjectCode?.trim() || 'N/A',
          reservation.classSection?.trim() || 'N/A',
          reservation.deanRecommend === true ? 'Yes' : 'No',
          reservation.registrarRecommend === true ? 'Yes' : 'No',
          reservation.universityAdministratorRecommend === true ? 'Yes' : 'No',
          reservation.declinedByRole || '',
          reservation.declinedReason || '',
          reservation.cancellationReason || '',
          String(reservationEvidenceFiles(reservation).length),
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

        {(errors.length > 0 || ((analyticsKind === 'rooms' || analyticsKind === 'schedules') && currentSchedulesError)) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Some analytics sources are unavailable</p>
              <p className="mt-0.5 text-xs text-amber-700">Could not load: {[...errors, ...((analyticsKind === 'rooms' || analyticsKind === 'schedules') && currentSchedulesError ? [currentSchedulesError] : [])].join(', ')}. Available records are still included.</p>
            </div>
          </div>
        )}

        <div className={`animate-in grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${availableAnalyticsOptions.length === 2 ? 'lg:grid-cols-2' : availableAnalyticsOptions.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`} role="tablist" aria-label="Analytics categories">
          {availableAnalyticsOptions.map(option => {
            const AnalyticsIcon = option.icon
            const isActive = analyticsKind === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="analytics-details"
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

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-12">
          <aside className={`animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all xl:col-span-12 ${isCardHighlighted('Analytics scope') ? 'ring-2 ring-[var(--brand-color)] ring-offset-2 ring-offset-[var(--brand-surface)]' : ''}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-8">
              <p className="shrink-0 text-sm font-bold text-slate-700">Analytics scope</p>
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Date range</dt><dd className="min-w-0 break-words font-black text-slate-900">{selectedDateRangeLabel}</dd></div>
                <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Department</dt><dd className="min-w-0 break-words font-black text-slate-900" title={selectedDepartmentLabel}>{selectedDepartmentLabel}</dd></div>
              </dl>
            </div>
          </aside>
        </div>

        <section className="relative z-20 animate-in rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`${activeAnalyticsOption.label} analytics controls`}>
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
              disabled={analyticsLoading || (analyticsKind === 'rooms' && facilityUsageLoading) || matchingRecordCount === 0}
              className="shrink-0"
            >
              Export CSV
            </Button>
          </div>
        </section>

        <section id="analytics-details" role="tabpanel" aria-label="Detailed analytics">
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
                        {analyticsKind !== 'members' && <YAxis yAxisId="secondary" width={28} orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />}
                        <Tooltip contentStyle={tooltipContentStyle} cursor={{ fill: '#f8fafc' }} itemSorter={analyticsKind === 'members' ? item => item.dataKey === 'value' ? 0 : 1 : 'name'} />
                        <Bar yAxisId="primary" dataKey="value" name={detailedAnalytics.primaryValueLabel} fill="#62853e" radius={[6, 6, 0, 0]} maxBarSize={34} />
                        <Bar yAxisId={analyticsKind === 'members' ? 'primary' : 'secondary'} dataKey="secondary" name={detailedAnalytics.primarySecondaryLabel} fill="#a3c48b" radius={[6, 6, 0, 0]} maxBarSize={34} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <EmptyAnalyticsState message={analyticsLoading ? 'Loading the latest Firestore records…' : 'Try widening the filters to reveal a trend.'} />
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
                  <EmptyAnalyticsState message={analyticsLoading ? 'Loading the latest Firestore records…' : 'No distribution is available for this filtered view.'} />
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
                  <EmptyAnalyticsState message={analyticsLoading ? 'Loading the latest Firestore records…' : 'No matching records are available for this distribution.'} />
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
                    <p className={`mt-2 truncate text-xl font-black ${insight.color.split(' ')[1]}`} title={insight.value}>{analyticsLoading ? '—' : insight.value}</p>
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
                  <EmptyAnalyticsState message={analyticsLoading ? 'Loading the latest Firestore records…' : 'There is not enough timing or onboarding data for this matrix.'} />
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
                      <span className="shrink-0 text-lg font-black text-slate-900">{item.value.toLocaleString()}{item.suffix}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-[#62853e] to-[#a3c48b] transition-all"
                        style={{ width: `${analyticsKind === 'rooms' ? Math.max(0, Math.min(100, item.value)) : rankedMaximum > 0 ? Math.max(3, item.value / rankedMaximum * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )) : <EmptyAnalyticsState message={analyticsLoading ? 'Loading the latest Firestore records…' : 'No ranked records match the current filters.'} />}
              </div>
            </AnalyticsPanel>

            <AnalyticsPanel
              title={extendedAnalytics.actionTitle}
              description={extendedAnalytics.actionDescription}
              icon={<AlertCircleIcon className="h-5 w-5" />}
              className="xl:col-span-12"
              isHighlighted={isCardHighlighted(extendedAnalytics.actionTitle)}
            >
              <div className={`grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 ${extendedAnalytics.actionItems.length === 6 ? 'xl:grid-cols-3' : 'xl:grid-cols-5'}`}>
                {extendedAnalytics.actionItems.map(item => (
                  <div key={item.label} className={`rounded-xl border p-4 transition-all ${item.color} ${isCardHighlighted(item.label) ? 'ring-2 ring-[var(--brand-color)]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-[0.07em] opacity-80">{item.label}</p>
                      <span className="shrink-0 text-2xl font-black leading-none">{analyticsLoading ? '—' : item.count.toLocaleString()}</span>
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
