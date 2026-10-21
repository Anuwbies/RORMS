import { useEffect, useMemo, useState } from 'react'
import { formatUserName } from '../../utils/userName'
import type { ComponentType } from 'react'
import { Button } from '../../components/Button'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { SectionHeader } from '../../components/SectionHeader'
import { ScheduleUsageBar } from '../../components/ScheduleUsageBar'
import {
  AlertCircleIcon,
  CalendarIcon,
  ClipboardIcon,
  DownloadIcon,
  DoorIcon,
  UsersIcon,
  type IconProps,
} from '../../components/Icons'
import {
  dateStringToDate,
  formatReportDate,
  formatReportTime,
  reservationDurationMinutes,
  timestampToDate,
  useFacilityScheduleRecords,
  useReportingData,
} from '../../utils/reportingData'
import { useAcademicSemester } from '../../utils/academicSemester'
import { buildingScheduleUsage } from '../../utils/buildingScheduleUsage'
import type { Building, RoomStatus } from '../../types/room'
import type { ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { downloadReportCsv } from '../../utils/reportCsv'
import { reservationDisplayStatus, reservationEvidenceFiles } from '../../utils/reservationEvidence'
import { reservationReviewStep, RESERVATION_REVIEW_STEPS } from '../../utils/reservationReviewStep'
import {
  isWorkbookSchedule,
  reportingScheduleDayText,
  reportingScheduleMeetings,
  reportingScheduleResource,
  reportingScheduleTimeText,
  scheduleReportRowId,
} from '../../utils/scheduleReporting'

type ReportKind = 'reservations' | 'rooms' | 'schedules' | 'members'
type DateRange = '7' | '30' | '90' | '365'

interface ReportCell {
  primary: string
  secondary?: string
}

interface ReportRow {
  id: string
  date: Date | null
  createdAt: Date | null
  department: string
  departments: string[]
  status: string
  recordType?: 'Building' | 'Room'
  buildingCode?: string
  roomType?: string
  requestType?: string
  reviewStep?: string
  isScheduleChild?: boolean
  sourceScheduleId?: string
  scheduleOrder?: number
  academicYear?: string
  semester?: string
  building?: string
  floor?: number
  roomName?: string
  role?: string
  isReactivation?: boolean
  searchText: string
  cells: ReportCell[]
}

const REPORT_OPTIONS: Array<{
  id: ReportKind
  label: string
  description: string
  icon: ComponentType<IconProps>
}> = [
  { id: 'reservations', label: 'Reservations', description: 'Booking request history and decisions', icon: ClipboardIcon },
  { id: 'rooms', label: 'Buildings and Rooms', description: 'Building and room inventory and operating status', icon: DoorIcon },
  { id: 'schedules', label: 'Schedules', description: 'Department schedule workflow records', icon: CalendarIcon },
  { id: 'members', label: 'Members', description: 'Membership and account records', icon: UsersIcon },
]

const REPORT_KIND_STORAGE_KEY = 'rorms-reports-selected-kind'

const REPORT_COLUMNS: Record<ReportKind, string[]> = {
  reservations: ['Reservation', 'Date & time', 'Room', 'Requester', 'Department', 'Type', 'Review step', 'Duration', 'Status'],
  rooms: ['Record', 'Building', 'Type', 'Floor', 'Capacity', 'Availability', 'Booking limits', 'Amenities', 'Schedule usage', 'Status'],
  schedules: ['Department', 'Academic year', 'Semester', 'Year level', 'College', 'Subject Area', 'Code', 'Descriptive Title', 'Course', 'Units Lec', 'Units Lab', 'Units Total', 'Hours Lec', 'Hours Lab', 'Hours Total', 'Max No. of Stud.', 'Section', 'Faculty Lec', 'Faculty Lab', 'F2F Time Lec', 'F2F Time Lab', 'F2F Days Lec', 'F2F Days Lab', 'F2F Room Lec', 'F2F Room Lab', 'Status'],
  members: ['Member info', 'Role', 'Department', 'Status', 'Join date'],
}

const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]

const ROOM_STATUS_OPTIONS = ['Available', 'Unavailable', 'Maintenance']
const ROOM_TYPE_OPTIONS = ['Lecture', 'Laboratory']
const FACILITY_RECORD_OPTIONS = ['Building', 'Room']
const RESERVATION_STATUS_OPTIONS = ['Pending', 'Approved', 'Declined', 'Cancelled', 'Needs Evidence', 'Completed']
const RESERVATION_TYPE_OPTIONS = ['Standard', 'Extended']
const MEMBER_STATUS_OPTIONS = ['Active', 'Deactivated', 'Pending']
const SCHEDULE_STATUS_OPTIONS = ['Draft', 'Plot']
const MEMBER_ROLE_OPTIONS = ['Admin', 'Registrar', 'University Administrator', 'Dean', 'Program Head', 'Instructor']
const OFFICE_DEPARTMENTS = ['Administrative Office', "Registrar's Office", 'General Service Department']
const MEMBER_ROLE_ORDER: Record<string, number> = {
  admin: 0,
  registrar: 1,
  'university administrator': 2,
  dean: 3,
  'program head': 4,
  instructor: 5,
}

interface ReportsPageProps {
  userRole: string
}
const MEMBER_STATUS_ORDER: Record<string, number> = {
  active: 0,
  pending: 1,
  deactivated: 2,
}
const ROOM_STATUS_ORDER: Record<string, number> = {
  available: 0,
  unavailable: 1,
  maintenance: 2,
}
const SCHEDULE_SEMESTER_OPTIONS = [
  { value: 'first', label: '1st Sem' },
  { value: 'second', label: '2nd Sem' },
]
const SCHEDULE_COLUMN_WIDTHS = ['8rem', '8rem', '8rem', '8rem', '8rem', '9rem', '5.625rem', '15rem', '7.5rem', '5.5rem', '5.5rem', '5.5rem', '5.5rem', '5.5rem', '5.5rem', '7rem', '6.25rem', '16.25rem', '16.25rem', '15rem', '15rem', '8.5rem', '8.5rem', '11.25rem', '11.25rem']

const statusClasses: Record<string, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
  'needs evidence': 'border-amber-200 bg-amber-50 text-amber-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  declined: 'border-rose-200 bg-rose-50 text-rose-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
  available: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  unavailable: 'border-amber-200 bg-amber-50 text-amber-700',
  maintenance: 'border-rose-200 bg-rose-50 text-rose-700',
  plot: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  plotted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  deactivated: 'border-rose-200 bg-rose-50 text-rose-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

function getStatusClasses(status: string) {
  return statusClasses[status.toLowerCase()] || 'border-slate-200 bg-slate-50 text-slate-600'
}

function getRoomStatusRank(status: string) {
  return ROOM_STATUS_ORDER[status.toLowerCase()] ?? ROOM_STATUS_OPTIONS.length
}

function getMemberRoleRank(role?: string) {
  return MEMBER_ROLE_ORDER[role?.toLowerCase() || ''] ?? Object.keys(MEMBER_ROLE_ORDER).length
}

function memberDepartment(role: string, department?: string) {
  return department?.trim() || (role === 'Admin' ? 'Administrative Office'
    : role === 'Registrar' ? "Registrar's Office"
      : role === 'University Administrator' ? 'General Service Department' : 'Unassigned')
}

function getMemberStatusRank(status: string) {
  return MEMBER_STATUS_ORDER[status.toLowerCase()] ?? Object.keys(MEMBER_STATUS_ORDER).length
}

function isDateRange(value: string): value is DateRange {
  return DATE_RANGE_OPTIONS.some(option => option.value === value)
}

function isReportKind(value: string | null): value is ReportKind {
  return REPORT_OPTIONS.some(option => option.id === value)
}

function getStoredReportKind(): ReportKind {
  try {
    const storedReportKind = window.sessionStorage.getItem(REPORT_KIND_STORAGE_KEY)
    return isReportKind(storedReportKind) ? storedReportKind : 'reservations'
  } catch {
    return 'reservations'
  }
}

function formatScheduleStatus(status?: string): 'Draft' | 'Plot' {
  const normalizedStatus = status?.trim().toLowerCase()
  return normalizedStatus === 'plot' || normalizedStatus === 'plotted' ? 'Plot' : 'Draft'
}

function getScheduleStatusRank(status: string) {
  return formatScheduleStatus(status) === 'Plot' ? 1 : 0
}

function getSemesterRank(semester?: string) {
  const semesterKey = getSemesterKey(semester)
  if (semesterKey === 'first') return 1
  if (semesterKey === 'second') return 2
  const normalizedSemester = semester?.toLowerCase() || ''
  if (normalizedSemester.includes('summer')) return 3
  return 4
}

function getSemesterKey(semester?: string) {
  const normalizedSemester = semester?.trim().toLowerCase() || ''
  if (normalizedSemester === 'sem1') return 'first'
  if (normalizedSemester === 'sem2') return 'second'
  if (normalizedSemester.startsWith('1') || normalizedSemester.includes('first')) return 'first'
  if (normalizedSemester.startsWith('2') || normalizedSemester.includes('second')) return 'second'
  return ''
}

function formatSemester(semester?: string) {
  if (!semester) return 'Not recorded'
  if (semester.trim().toLowerCase() === 'sem1') return '1st Sem'
  if (semester.trim().toLowerCase() === 'sem2') return '2nd Sem'
  return semester.replace(/semester/i, 'Sem')
}

function ReportsPage({ userRole }: ReportsPageProps) {
  const { reservations, rooms, buildings, memberships, invitations, users, departments, schedules, errors, isLoading } = useReportingData()
  const isRegistrar = userRole.trim().toLowerCase() === 'registrar'
  const isUniversityAdministrator = userRole.trim().toLowerCase() === 'university administrator'
  const [reportKind, setReportKind] = useState<ReportKind>(() => {
    const storedReportKind = getStoredReportKind()
    return (isUniversityAdministrator && storedReportKind !== 'reservations' && storedReportKind !== 'rooms')
      || (isRegistrar && storedReportKind === 'members') ? 'reservations' : storedReportKind
  })
  const [dateRanges, setDateRanges] = useState<DateRange[]>([])
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [reservationTypeFilters, setReservationTypeFilters] = useState<string[]>([])
  const [reviewStepFilters, setReviewStepFilters] = useState<string[]>([])
  const [buildingFilters, setBuildingFilters] = useState<string[]>([])
  const [roomTypeFilters, setRoomTypeFilters] = useState<string[]>([])
  const [facilityRecordFilters, setFacilityRecordFilters] = useState<string[]>([])
  const [roleFilters, setRoleFilters] = useState<string[]>([])
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([])
  const [academicYearFilters, setAcademicYearFilters] = useState<string[]>([])
  const [semesterFilters, setSemesterFilters] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const { academicYears, activeAcademicYear, currentSemester, isLoading: isAcademicYearLoading } = useAcademicSemester()
  const { records: currentScheduleRecords, isLoading: isCurrentSchedulesLoading, error: currentSchedulesError } = useFacilityScheduleRecords()
  const availableReportOptions = isUniversityAdministrator
    ? REPORT_OPTIONS.filter(option => option.id === 'reservations' || option.id === 'rooms')
    : isRegistrar
    ? REPORT_OPTIONS.filter(option => option.id !== 'members')
    : REPORT_OPTIONS

  useEffect(() => {
    if ((isUniversityAdministrator && reportKind !== 'reservations' && reportKind !== 'rooms')
      || (isRegistrar && reportKind === 'members')) {
      setReportKind('reservations')
      setStatusFilters([])
      setReservationTypeFilters([])
      setReviewStepFilters([])
      setBuildingFilters([])
      setRoomTypeFilters([])
      setFacilityRecordFilters([])
      setRoleFilters([])
      setDepartmentFilters([])
      setAcademicYearFilters([])
      setSemesterFilters([])
    }
  }, [reportKind, isRegistrar, isUniversityAdministrator])

  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const buildingById = useMemo(() => new Map(buildings.map(building => [building.id, building])), [buildings])
  const facilityUsage = useMemo(() => {
    const normalizedBuildings: Building[] = buildings.map(building => ({
      id: building.id,
      name: building.name || '',
      code: building.code || '',
      floor: 0,
      capacity: 0,
      rooms: rooms.filter(room => room.buildingId === building.id).map(room => {
        const status: RoomStatus = room.status === 'Available' || room.status === 'Maintenance' ? room.status : 'Unavailable'
        return {
          id: room.id,
          buildingId: room.buildingId,
          image: '',
          code: room.code || '',
          name: room.name || '',
          type: room.type || '',
          floor: Number(room.floor) || 0,
          capacity: Number(room.capacity) || 0,
          status,
          description: room.description || '',
          amenities: room.amenities || [],
          availableDays: room.availableDays || [],
          startTime: room.startTime || '',
          endTime: room.endTime || '',
          minBookingMins: room.minBookingMins || 0,
          maxBookingMins: room.maxBookingMins || 0,
        }
      }),
    }))
    const meetings = reportingScheduleMeetings([...currentScheduleRecords, ...schedules]) as unknown as ScheduleMeetingRecord[]
    return buildingScheduleUsage(normalizedBuildings, meetings, activeAcademicYear, currentSemester)
  }, [buildings, rooms, currentScheduleRecords, schedules, activeAcademicYear, currentSemester])
  const facilityUsageColorIndexes = useMemo(() => Object.fromEntries(
    [...new Set(Object.values(facilityUsage.buildings).flatMap(usage => usage.departments.map(department => department.name)))]
      .sort().map((name, index) => [name, index]),
  ) as Record<string, number>, [facilityUsage])
  const facilityUsageLoading = isLoading || isAcademicYearLoading || isCurrentSchedulesLoading
  const facilityUsageError = Boolean(currentSchedulesError || errors.includes('schedule'))
  const memberByUserId = useMemo(() => new Map(memberships.filter(member => member.userId).map(member => [member.userId as string, member])), [memberships])
  const memberById = useMemo(() => new Map(memberships.map(member => [member.id, member])), [memberships])
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const unexpiredPendingInvitations = useMemo(() => {
    const now = Date.now()

    return invitations.filter(invitation => {
      const expiresAt = timestampToDate(invitation.expiresAt)
      return invitation.status?.toLowerCase() === 'pending'
        && (expiresAt === null || expiresAt.getTime() > now)
    })
  }, [invitations])
  const unexpiredPendingInvitationEmails = useMemo(
    () => new Set(unexpiredPendingInvitations.map(invitation => invitation.email?.toLowerCase()).filter((email): email is string => Boolean(email))),
    [unexpiredPendingInvitations],
  )
  const scheduleReportRecords = useMemo(() => {
    const recordsById = new Map(schedules.map(schedule => [schedule.id, schedule]))
    const displayRecordsById = new Map(schedules.map(schedule => [schedule.id, { ...schedule, days: [...(schedule.days || [])] }]))
    const mergedChildIds = new Set<string>()
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    schedules.forEach(child => {
      if (isWorkbookSchedule(child)) return
      const parent = child.parentId ? recordsById.get(child.parentId) : undefined
      const displayParent = child.parentId ? displayRecordsById.get(child.parentId) : undefined
      if (!parent || !displayParent || parent.orderIndex !== child.orderIndex) return

      displayParent.instructorId2 = displayParent.instructorId2 || (child.instructorId === displayParent.instructorId ? '' : child.instructorId)
      displayParent.format2 = displayParent.format2 || (child.format === displayParent.format ? '' : child.format)
      displayParent.startTime2 = displayParent.startTime2 || (child.startTime === displayParent.startTime ? '' : child.startTime)
      displayParent.endTime2 = displayParent.endTime2 || (child.endTime === displayParent.endTime ? '' : child.endTime)
      displayParent.buildingId2 = displayParent.buildingId2 || (child.buildingId === displayParent.buildingId ? '' : child.buildingId)
      displayParent.roomId2 = displayParent.roomId2 || (child.roomId === displayParent.roomId ? '' : child.roomId)
      displayParent.days = [...(displayParent.days || []), ...(child.days || [])]
        .sort((first, second) => dayOrder.indexOf(first) - dayOrder.indexOf(second))
      mergedChildIds.add(child.id)
    })

    const legacyRecords = schedules
      .filter(schedule => !mergedChildIds.has(schedule.id))
      .map(schedule => displayRecordsById.get(schedule.id) || schedule)

    const records = [
      ...legacyRecords.map(schedule => ({ schedule, collection: 'schedule' as const })),
      ...currentScheduleRecords.map(schedule => ({ schedule, collection: 'schedules' as const })),
    ]
    const rows = new Map<string, { schedule: typeof records[number]['schedule']; collection: typeof records[number]['collection']; meetings: typeof records[number]['schedule'][] }>()
    records.forEach(({ schedule, collection }) => {
      const key = `${collection}:${isWorkbookSchedule(schedule) ? scheduleReportRowId(schedule) : schedule.id}`
      const row = rows.get(key)
      if (row) row.meetings.push(schedule)
      else rows.set(key, { schedule, collection, meetings: [schedule] })
    })
    return [...rows.values()]
  }, [schedules, currentScheduleRecords])
  const scheduleReportById = useMemo(() => new Map(scheduleReportRecords.map(({ schedule, collection }) => [`${collection}:${schedule.id}`, schedule])), [scheduleReportRecords])

  const reportRows = useMemo<ReportRow[]>(() => {
    if (reportKind === 'reservations') {
      return reservations.map(reservation => {
        const room = roomById.get(reservation.roomId || '')
        const building = buildingById.get(reservation.buildingId || room?.buildingId || '')
        const member = memberByUserId.get(reservation.userId || '')
        const requester = userById.get(reservation.userId || '')
        const department = reservation.department?.trim() || member?.department || 'Unassigned'
        const rawStatus = reservation.status || 'Pending'
        const status = reservationDisplayStatus(rawStatus, reservation)
        const requestType = reservation.requestType === 'Extended' ? 'Extended' : 'Standard'
        const reviewStep = reservationReviewStep({ ...reservation, status: rawStatus })
        const reviewDetail = rawStatus === 'Pending'
          ? reviewStep === 'University Administrator' ? 'Awaiting final approval' : 'Awaiting recommendation'
          : rawStatus === 'Declined' ? reservation.autoProcessed ? 'Automatically declined' : `Declined by ${reservation.declinedByRole || reviewStep}`
            : rawStatus === 'Approved' || rawStatus === 'Completed' ? 'Final approval complete' : undefined
        const duration = reservationDurationMinutes(reservation)
        const recordDate = dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt)
        const reference = reservation.id.slice(0, 8).toUpperCase()
        const values = [
          { primary: `#${reference}`, secondary: formatReportDate(reservation.createdAt, 'Created date unavailable') },
          { primary: reservation.date ? formatReportDate(recordDate) : 'Date not set', secondary: `${formatReportTime(reservation.startTime)}–${formatReportTime(reservation.endTime)}` },
          { primary: room?.code || room?.name || 'Unassigned', secondary: building?.name || building?.code || 'Building unavailable' },
          { primary: formatUserName(requester, member) || 'Unknown requester', secondary: requester?.email || member?.email || 'No email recorded' },
          { primary: department },
          { primary: requestType },
          { primary: reviewStep, secondary: reviewDetail },
          { primary: duration > 0 ? `${(duration / 60).toFixed(duration % 60 === 0 ? 0 : 1)} hours` : 'Not recorded' },
          { primary: status, secondary: rawStatus === 'Declined' ? reservation.declinedReason?.trim() : rawStatus === 'Cancelled' ? reservation.cancellationReason?.trim() : undefined },
        ]
        return {
          id: reservation.id,
          date: recordDate,
          createdAt: timestampToDate(reservation.createdAt),
          department,
          departments: [department],
          status,
          requestType,
          reviewStep,
          searchText: [reservation.purpose || '', ...values.flatMap(value => [value.primary, value.secondary || ''])].join(' ').toLowerCase(),
          cells: values,
        }
      })
    }

    if (reportKind === 'rooms') {
      const buildingRows: ReportRow[] = buildings.map(building => {
        const buildingRooms = rooms.filter(room => room.buildingId === building.id)
        const usage = facilityUsage.buildings[building.id]
        const floorNumbers = buildingRooms.map(room => Number(room.floor)).filter(Number.isFinite)
        const capacity = buildingRooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)
        const values: ReportCell[] = [
          { primary: building.name || building.code || 'Unnamed building', secondary: building.code || undefined },
          { primary: '—' },
          { primary: 'Building' },
          { primary: floorNumbers.length ? `Floor ${Math.max(...floorNumbers)}` : 'No rooms' },
          { primary: `${capacity} people` },
          { primary: `${buildingRooms.length} rooms`, secondary: `${buildingRooms.filter(room => room.status === 'Available').length} available` },
          { primary: '—' },
          { primary: '—' },
          { primary: facilityUsageLoading || facilityUsageError ? '—' : `${Math.round(usage?.totalPercent || 0)}%` },
          { primary: '—' },
        ]
        return {
          id: building.id,
          date: timestampToDate(building.createdAt),
          createdAt: timestampToDate(building.createdAt),
          department: '',
          departments: [],
          status: '',
          recordType: 'Building',
          building: building.name || building.code || 'Unnamed building',
          buildingCode: building.code || '',
          floor: floorNumbers.length ? Math.max(...floorNumbers) : undefined,
          searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
          cells: values,
        }
      })
      const roomRows: ReportRow[] = rooms.map(room => {
        const building = buildingById.get(room.buildingId || '')
        const usage = facilityUsage.rooms[room.id]
        const status = room.status || 'Not recorded'
        const values: ReportCell[] = [
          { primary: room.name || room.code || 'Unnamed room', secondary: room.code || undefined },
          { primary: building?.name || building?.code || 'Building unavailable', secondary: building?.code || undefined },
          { primary: room.type || 'Not specified' },
          { primary: room.floor !== undefined ? `Floor ${room.floor}` : 'Not recorded' },
          { primary: `${Number(room.capacity) || 0} people` },
          { primary: room.availableDays?.length ? `${room.availableDays.length} days/week` : 'Days not set', secondary: room.startTime && room.endTime ? `${formatReportTime(room.startTime)}–${formatReportTime(room.endTime)}` : undefined },
          { primary: room.minBookingMins && room.maxBookingMins ? `${room.minBookingMins}–${room.maxBookingMins} min` : 'Not recorded' },
          { primary: `${room.amenities?.length || 0} amenities`, secondary: room.amenities?.slice(0, 3).join(', ') || 'None recorded' },
          { primary: room.status !== 'Available' || facilityUsageLoading || facilityUsageError ? '—' : `${Math.round(usage?.totalPercent || 0)}%` },
          { primary: status },
        ]
        return {
          id: room.id,
          date: timestampToDate(room.createdAt),
          createdAt: timestampToDate(room.createdAt),
          department: '',
          departments: [],
          status,
          recordType: 'Room',
          building: building?.name || building?.code || 'Building unavailable',
          buildingCode: building?.code || '',
          floor: typeof room.floor === 'number' ? room.floor : undefined,
          roomType: room.type || '',
          roomName: room.name || room.code || 'Unnamed room',
          searchText: [room.description || '', ...(room.availableDays || []), ...(room.amenities || []), ...values.flatMap(value => [value.primary, value.secondary || ''])].join(' ').toLowerCase(),
          cells: values,
        }
      })
      return [...buildingRows, ...roomRows]
    }

    if (reportKind === 'schedules') {
      return scheduleReportRecords.map(({ schedule, collection, meetings }, index) => {
        const parentSchedule = schedule.parentId ? scheduleReportById.get(`${collection}:${schedule.parentId}`) : undefined
        const isChild = Boolean(schedule.parentId)
        const isWorkbook = isWorkbookSchedule(schedule)
        const status = isWorkbook && meetings.some(meeting => formatScheduleStatus(meeting.status) === 'Plot') ? 'Plot' : formatScheduleStatus(schedule.status)
        const academicYear = schedule.academicYear || 'Not recorded'
        const semester = formatSemester(schedule.semester || schedule.semesterKey)
        const yearLevel = schedule.yearLevelLabel?.split(':', 1)[0].trim() || (schedule.yearLevel ? `Year ${schedule.yearLevel}` : '----')
        const rawValues = schedule.rawValues?.length === 21 ? schedule.rawValues : []
        const textValue = (value?: string | number | null) => value === null || value === undefined ? '' : String(value).trim()
        const listValue = (values?: string[]) => values?.filter(Boolean).join(' / ') || ''
        const field = (cellIndex: number, fallback?: string | number | null) => rawValues[cellIndex]?.trim() || textValue(fallback) || '----'
        const meetingDetails = isWorkbook ? meetings : reportingScheduleMeetings([schedule])
        const meetingValue = (format: 'lec' | 'lab', value: (meeting: typeof schedule) => string) => meetingDetails
          .filter(meeting => (meeting.format?.toLowerCase() === 'lab' ? 'lab' : 'lec') === format)
          .map(value).filter(value => value && value !== '----').join(' / ')
        const meetingFaculty = (meeting: typeof schedule) => {
          const instructor = memberById.get(meeting.instructorId || '') || memberByUserId.get(meeting.instructorId || '')
          const savedName = typeof meeting.faculty === 'string' ? meeting.faculty.trim() : ''
          return isWorkbook && savedName ? savedName : reportingScheduleResource(formatUserName(userById.get(instructor?.userId || ''), instructor), meeting.faculty)
        }
        const meetingRoom = (meeting: typeof schedule) => {
          const room = roomById.get(meeting.roomId || '')
          return isWorkbook && meeting.room?.trim() ? meeting.room.trim() : reportingScheduleResource(room?.name || room?.code, meeting.room)
        }
        const values: ReportCell[] = [
          { primary: schedule.department || 'Unassigned' },
          { primary: academicYear },
          { primary: semester },
          { primary: yearLevel },
          { primary: field(0, schedule.college) },
          { primary: field(1, schedule.subjectArea) },
          { primary: field(2, schedule.subjectCode || parentSchedule?.subjectCode) },
          { primary: field(3, schedule.subjectTitle || parentSchedule?.subjectTitle) },
          { primary: field(4, schedule.course) },
          { primary: field(5, schedule.units?.lec) },
          { primary: field(6, schedule.units?.lab) },
          { primary: field(7, schedule.units?.total ?? schedule.credits) },
          { primary: field(8, schedule.hours?.lec) },
          { primary: field(9, schedule.hours?.lab) },
          { primary: field(10, schedule.hours?.total) },
          { primary: field(11, schedule.maxStudents) },
          { primary: field(12, schedule.classSection) },
          { primary: field(13, meetingValue('lec', meetingFaculty)) },
          { primary: field(14, meetingValue('lab', meetingFaculty)) },
          { primary: field(15, listValue(schedule.f2fTime?.lec) || meetingValue('lec', reportingScheduleTimeText)) },
          { primary: field(16, listValue(schedule.f2fTime?.lab) || meetingValue('lab', reportingScheduleTimeText)) },
          { primary: field(17, listValue(schedule.f2fDays?.lec) || meetingValue('lec', reportingScheduleDayText)) },
          { primary: field(18, listValue(schedule.f2fDays?.lab) || meetingValue('lab', reportingScheduleDayText)) },
          { primary: field(19, listValue(schedule.f2fRoom?.lec) || meetingValue('lec', meetingRoom)) },
          { primary: field(20, listValue(schedule.f2fRoom?.lab) || meetingValue('lab', meetingRoom)) },
          { primary: status },
        ]
        return {
          id: `${collection}:${schedule.id}`,
          date: timestampToDate(schedule.updatedAt) || timestampToDate(schedule.createdAt),
          createdAt: timestampToDate(schedule.createdAt),
          department: schedule.department || 'Unassigned',
          departments: [schedule.department || 'Unassigned'],
          status,
          isScheduleChild: isChild,
          sourceScheduleId: isWorkbook ? `${collection}:${scheduleReportRowId(schedule)}` : undefined,
          scheduleOrder: schedule.orderIndex ?? index,
          academicYear,
          semester,
          searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
          cells: values,
        }
      })
    }

    const makeMemberRow = (record: { id: string; name: string; email: string; role: string; department?: string; status: 'Active' | 'Pending' | 'Deactivated'; joinedAt?: unknown; reportDate?: unknown; isReactivation?: boolean }): ReportRow => {
      const department = memberDepartment(record.role, record.department)
      const values: ReportCell[] = [
        { primary: record.name || record.email || 'Unnamed member', secondary: record.name ? record.email || undefined : undefined },
        { primary: record.role },
        { primary: department },
        { primary: record.status },
        { primary: formatReportDate(record.joinedAt, '—') },
      ]
      return {
        id: record.id,
        date: timestampToDate(record.reportDate),
        createdAt: timestampToDate(record.reportDate),
        department,
        departments: [department],
        status: record.status,
        role: record.role,
        isReactivation: record.isReactivation,
        searchText: [...values.flatMap(value => [value.primary, value.secondary || '']), record.isReactivation ? 're-invitation reactivation' : ''].join(' ').toLowerCase(),
        cells: values,
      }
    }
    const membershipsById = new Map(memberships.map(member => [member.id, member]))
    const membershipsByEmail = new Map(memberships.filter(member => member.email).map(member => [member.email!.toLowerCase(), member]))
    const usersByEmail = new Map(users.filter(user => user.email).map(user => [user.email!.toLowerCase(), user]))
    const linkedUserIds = new Set(memberships.filter(member => member.userId && userById.has(member.userId)).map(member => member.userId))
    const accountRows = memberships.flatMap(member => {
      const user = userById.get(member.userId || '')
      if (!user) return []
      const email = user.email || member.email || ''
      if (user.isActive === false && unexpiredPendingInvitationEmails.has(email.toLowerCase())) return []
      return [makeMemberRow({
        id: `membership:${member.id}`,
        name: formatUserName(user, member),
        email,
        role: member.role || 'Instructor',
        department: member.department,
        status: user.isActive === false ? 'Deactivated' : 'Active',
        joinedAt: user.createdAt,
        reportDate: user.createdAt,
      })]
    })
    const unlinkedDeactivatedRows = users.filter(user => user.isActive === false && !linkedUserIds.has(user.id)
      && !unexpiredPendingInvitationEmails.has(user.email?.toLowerCase() || '')).map(user => makeMemberRow({
        id: `user:${user.id}`,
        name: formatUserName(user),
        email: user.email || '',
        role: 'Instructor',
        status: 'Deactivated',
        joinedAt: user.createdAt,
        reportDate: user.createdAt,
      }))
    const invitationRows = unexpiredPendingInvitations.map(invitation => {
      const membership = (invitation.membershipId ? membershipsById.get(invitation.membershipId) : undefined)
        || membershipsByEmail.get(invitation.email?.toLowerCase() || '')
      const user = usersByEmail.get(invitation.email?.toLowerCase() || '')
      return makeMemberRow({
        id: `invitation:${invitation.id}`,
        name: formatUserName(user, membership),
        email: invitation.email || '',
        role: membership?.role || invitation.role || 'Instructor',
        department: membership?.department || invitation.department,
        status: 'Pending',
        joinedAt: user?.createdAt,
        reportDate: invitation.createdAt,
        isReactivation: Boolean(invitation.isReactivation || membership?.userId || user),
      })
    })
    return [...accountRows, ...unlinkedDeactivatedRows, ...invitationRows]
  }, [reportKind, reservations, rooms, buildings, memberships, users, unexpiredPendingInvitations, unexpiredPendingInvitationEmails, roomById, buildingById, memberByUserId, memberById, userById, scheduleReportRecords, scheduleReportById, facilityUsage, facilityUsageLoading, facilityUsageError])

  const statusOptions = useMemo(() => {
    if (reportKind === 'rooms') return reportRows.some(row => row.recordType === 'Room' && row.status === 'Not recorded')
      ? [...ROOM_STATUS_OPTIONS, 'Not recorded'] : ROOM_STATUS_OPTIONS
    if (reportKind === 'reservations') return RESERVATION_STATUS_OPTIONS
    if (reportKind === 'members') return MEMBER_STATUS_OPTIONS
    if (reportKind === 'schedules') return SCHEDULE_STATUS_OPTIONS
    return Array.from(new Set(reportRows.map(row => row.status))).sort()
  }, [reportKind, reportRows])
  const departmentOptions = useMemo(() => {
    const reportDepartments = reportRows.map(row => row.department)
    const masterDepartments = departments
      .map(department => department.code || department.name)
      .filter((department): department is string => Boolean(department))

    if (reportKind === 'reservations' || reportKind === 'schedules') {
      return Array.from(new Set([...reportDepartments, ...masterDepartments])).sort()
    }

    const academicDepartments = Array.from(new Set([...masterDepartments, ...reportDepartments]))
      .filter(department => department !== 'Unassigned' && !OFFICE_DEPARTMENTS.includes(department))
      .sort()

    return [...OFFICE_DEPARTMENTS, 'Unassigned', ...academicDepartments]
  }, [reportKind, reportRows, departments])
  const buildingOptions = useMemo(() => Array.from(new Set(buildings.map(building => building.code).filter((code): code is string => Boolean(code)))).sort(), [buildings])
  const academicYearOptions = useMemo(() => Array.from(new Set(
    academicYears
      .map(year => year.academicYear)
      .filter((academicYear): academicYear is string => Boolean(academicYear)),
  )).sort((first, second) => second.localeCompare(first, undefined, { numeric: true })), [academicYears])

  const filterGroups = useMemo<FilterGroup[]>(() => [
    {
      id: 'date-range',
      title: 'Date range',
      options: DATE_RANGE_OPTIONS,
      selectedValues: dateRanges,
      onChange: values => setDateRanges(values.filter(isDateRange)),
    },
    ...(reportKind === 'schedules' ? [
      {
        id: 'academic-year',
        title: 'Academic year',
        options: academicYearOptions,
        selectedValues: academicYearFilters,
        onChange: setAcademicYearFilters,
      },
      {
        id: 'semester',
        title: 'Semester',
        options: SCHEDULE_SEMESTER_OPTIONS,
        selectedValues: semesterFilters,
        onChange: setSemesterFilters,
      },
    ] : []),
    ...(reportKind === 'rooms' ? [
      {
        id: 'building',
        title: 'Building',
        options: buildingOptions,
        selectedValues: buildingFilters,
        onChange: setBuildingFilters,
      },
      {
        id: 'facility-record',
        title: 'Record',
        options: FACILITY_RECORD_OPTIONS,
        selectedValues: facilityRecordFilters,
        onChange: setFacilityRecordFilters,
      },
      {
        id: 'room-type',
        title: 'Room type',
        options: ROOM_TYPE_OPTIONS,
        selectedValues: roomTypeFilters,
        onChange: setRoomTypeFilters,
      },
    ] : [{
      id: 'department',
      title: 'Department',
      options: departmentOptions,
      selectedValues: departmentFilters,
      onChange: setDepartmentFilters,
    }]),
    ...(reportKind === 'members' ? [{
      id: 'role',
      title: 'Role',
      options: MEMBER_ROLE_OPTIONS,
      selectedValues: roleFilters,
      onChange: setRoleFilters,
    }] : []),
    ...(reportKind === 'reservations' ? [
      {
        id: 'reservation-type',
        title: 'Reservation type',
        options: RESERVATION_TYPE_OPTIONS,
        selectedValues: reservationTypeFilters,
        onChange: setReservationTypeFilters,
      },
      {
        id: 'review-step',
        title: 'Review step',
        options: [...RESERVATION_REVIEW_STEPS],
        selectedValues: reviewStepFilters,
        onChange: setReviewStepFilters,
      },
    ] : []),
    {
      id: 'status',
      title: 'Status',
      options: statusOptions,
      selectedValues: statusFilters,
      onChange: setStatusFilters,
    },
  ], [academicYearFilters, academicYearOptions, buildingFilters, buildingOptions, dateRanges, departmentFilters, departmentOptions, facilityRecordFilters, roleFilters, reportKind, reservationTypeFilters, reviewStepFilters, roomTypeFilters, semesterFilters, statusFilters, statusOptions])

  const clearReportFilters = () => {
    setDateRanges([])
    setStatusFilters([])
    setReservationTypeFilters([])
    setReviewStepFilters([])
    setBuildingFilters([])
    setRoomTypeFilters([])
    setFacilityRecordFilters([])
    setRoleFilters([])
    setDepartmentFilters([])
    setAcademicYearFilters([])
    setSemesterFilters([])
  }

  const selectReportKind = (nextReportKind: ReportKind) => {
    setReportKind(nextReportKind)
    setStatusFilters([])
    setReservationTypeFilters([])
    setReviewStepFilters([])
    setBuildingFilters([])
    setRoomTypeFilters([])
    setFacilityRecordFilters([])
    setRoleFilters([])
    setDepartmentFilters([])
    setAcademicYearFilters([])
    setSemesterFilters([])

    try {
      window.sessionStorage.setItem(REPORT_KIND_STORAGE_KEY, nextReportKind)
    } catch {
      // The report still works when browser storage is unavailable.
    }
  }

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    const today = new Date()
    const cutoffs = dateRanges.map(days => new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(days) + 1))

    return reportRows
      .filter(row => statusFilters.length === 0 || statusFilters.includes(row.status))
      .filter(row => reportKind !== 'rooms' || buildingFilters.length === 0 || buildingFilters.includes(row.buildingCode || ''))
      .filter(row => reportKind !== 'rooms' || facilityRecordFilters.length === 0 || facilityRecordFilters.includes(row.recordType || ''))
      .filter(row => reportKind !== 'rooms' || roomTypeFilters.length === 0 || (row.recordType === 'Room' && roomTypeFilters.includes(row.roomType || '')))
      .filter(row => reportKind !== 'reservations' || reservationTypeFilters.length === 0 || reservationTypeFilters.includes(row.requestType || 'Standard'))
      .filter(row => reportKind !== 'reservations' || reviewStepFilters.length === 0 || reviewStepFilters.includes(row.reviewStep || ''))
      .filter(row => reportKind === 'rooms' || departmentFilters.length === 0 || row.departments.some(department => departmentFilters.includes(department)))
      .filter(row => reportKind !== 'members' || roleFilters.length === 0 || roleFilters.includes(row.role || ''))
      .filter(row => reportKind !== 'schedules' || academicYearFilters.length === 0 || academicYearFilters.includes(row.academicYear || ''))
      .filter(row => reportKind !== 'schedules' || semesterFilters.length === 0 || semesterFilters.includes(getSemesterKey(row.semester)))
      .filter(row => !normalizedSearch || row.searchText.includes(normalizedSearch))
      .filter(row => {
        const reportDate = row.date
        return cutoffs.length === 0 || (reportDate !== null && cutoffs.some(cutoff => reportDate >= cutoff))
      })
      .sort((first, second) => {
        if (reportKind === 'rooms') {
          const buildingOrder = (first.building || '').localeCompare(second.building || '', undefined, { numeric: true, sensitivity: 'base' })
          if (buildingOrder !== 0) return buildingOrder

          if (first.recordType !== second.recordType) return first.recordType === 'Building' ? -1 : 1

          const floorOrder = (first.floor ?? Number.POSITIVE_INFINITY) - (second.floor ?? Number.POSITIVE_INFINITY)
          if (floorOrder !== 0) return floorOrder

          const roomNameOrder = (first.roomName || '').localeCompare(second.roomName || '', undefined, { numeric: true, sensitivity: 'base' })
          if (roomNameOrder !== 0) return roomNameOrder

          return getRoomStatusRank(first.status) - getRoomStatusRank(second.status)
        }

        if (reportKind === 'members') {
          const statusOrder = getMemberStatusRank(first.status) - getMemberStatusRank(second.status)
          if (statusOrder !== 0) return statusOrder

          if (first.status === 'Pending' && first.isReactivation !== second.isReactivation) {
            return first.isReactivation ? -1 : 1
          }

          const roleOrder = getMemberRoleRank(first.role) - getMemberRoleRank(second.role)
          if (roleOrder !== 0) return roleOrder

          return first.cells[0].primary.localeCompare(second.cells[0].primary, undefined, { numeric: true, sensitivity: 'base' })
        }

        if (reportKind === 'schedules') {
          const firstAcademicYear = first.academicYear || ''
          const secondAcademicYear = second.academicYear || ''
          const academicYearOrder = firstAcademicYear.localeCompare(secondAcademicYear, undefined, { numeric: true })
          if (academicYearOrder !== 0) return academicYearOrder

          const semesterOrder = getSemesterRank(first.semester) - getSemesterRank(second.semester)
          if (semesterOrder !== 0) return semesterOrder
        }

        const departmentOrder = first.department.localeCompare(second.department)
        if (departmentOrder !== 0) return departmentOrder

        if (reportKind === 'schedules') {
          const statusOrder = getScheduleStatusRank(first.status) - getScheduleStatusRank(second.status)
          if (statusOrder !== 0) return statusOrder
          return (first.scheduleOrder || 0) - (second.scheduleOrder || 0)
        }

        const statusOrder = first.status.localeCompare(second.status)
        if (statusOrder !== 0) return statusOrder

        return (second.createdAt?.getTime() || 0) - (first.createdAt?.getTime() || 0)
      })
  }, [academicYearFilters, buildingFilters, dateRanges, departmentFilters, facilityRecordFilters, roleFilters, reportKind, reportRows, reservationTypeFilters, reviewStepFilters, roomTypeFilters, searchQuery, semesterFilters, statusFilters])

  const activeReport = availableReportOptions.find(option => option.id === reportKind) || availableReportOptions[0]
  const reportColumns = useMemo<ColumnDef<ReportRow>[]>(() => REPORT_COLUMNS[reportKind].map((header, cellIndex) => ({
    header,
    align: cellIndex === REPORT_COLUMNS[reportKind].length - 1 ? 'right' : undefined,
    width: reportKind === 'schedules'
      ? (cellIndex === REPORT_COLUMNS.schedules.length - 1 ? '1%' : SCHEDULE_COLUMN_WIDTHS[cellIndex])
      : (cellIndex === REPORT_COLUMNS[reportKind].length - 1 ? '1%' : undefined),
    render: row => {
      const cell = row.cells[cellIndex]
      if (!cell) return <span className="text-slate-400">—</span>

      if (reportKind === 'schedules') {
        return <span className={`block max-w-64 truncate text-sm font-medium ${row.isScheduleChild ? 'text-slate-500' : 'text-slate-900'}`} title={cell.primary}>{cell.primary}</span>
      }

      if (reportKind === 'rooms' && cellIndex === 8) {
        const usage = row.recordType === 'Building' ? facilityUsage.buildings[row.id] : facilityUsage.rooms[row.id]
        const isExcluded = row.recordType === 'Room' && roomById.get(row.id)?.status !== 'Available'
        return (
          <div className="min-w-36">
            <p className="text-xs font-semibold text-slate-700" title={activeAcademicYear ? `${activeAcademicYear.academicYear} · ${currentSemester}` : 'No academic year'}>
              {isExcluded || facilityUsageLoading || facilityUsageError ? '—' : `${Math.round(usage?.totalPercent || 0)}%`}
            </p>
            <ScheduleUsageBar
              usage={usage}
              isLoading={facilityUsageLoading}
              hasError={facilityUsageError}
              isExcluded={isExcluded}
              colorIndexes={facilityUsageColorIndexes}
              label={`Scheduled usage for ${row.recordType?.toLowerCase() || 'facility'} ${row.cells[0].primary}`}
              emptyMessage={isExcluded ? 'Excluded from usage' : 'No scheduled room hours'}
              compact={row.recordType === 'Room'}
            />
          </div>
        )
      }

      const isStatusCell = cellIndex === row.cells.length - 1 && reportKind !== 'members'
      const isMemberStatusCell = reportKind === 'members' && cellIndex === 3

      if (reportKind === 'rooms' && row.recordType === 'Building' && isStatusCell) return <span className="text-slate-400">—</span>

      if (isStatusCell || isMemberStatusCell) {
        return <div><span className={`inline-flex rounded-lg border px-2.5 py-1 text-[0.65rem] font-black ${getStatusClasses(cell.primary)}`}>{cell.primary}</span>{reportKind === 'reservations' && cell.secondary && <p className="mt-0.5 max-w-64 truncate text-xs text-slate-400" title={cell.secondary}>{cell.secondary}</p>}</div>
      }

      return (
        <div className="max-w-64">
          <p className="truncate font-bold text-slate-700" title={cell.primary}>{cell.primary}</p>
          {cell.secondary && <p className="mt-0.5 truncate text-xs text-slate-400" title={cell.secondary}>{cell.secondary}</p>}
        </div>
      )
    },
  })), [reportKind, facilityUsage, facilityUsageLoading, facilityUsageError, facilityUsageColorIndexes, roomById, activeAcademicYear, currentSemester])

  const exportCsv = () => {
    const headers = [...REPORT_COLUMNS[reportKind]]
    if (reportKind === 'reservations') headers.push('Reference', 'Purpose', 'Subject code', 'Section', 'Attendees', 'Duration (minutes)', 'Dean recommended', 'Registrar recommended', 'University Administrator approved', 'Declined by', 'Decline reason', 'Cancellation reason', 'Evidence files')
    if (reportKind === 'rooms') headers.push('Record ID', 'Code', 'Building code', 'Description', 'Available days', 'Start time', 'End time', 'Minimum booking (minutes)', 'Maximum booking (minutes)', 'Schedule term', 'Schedule usage by department')
    if (reportKind === 'members') {
      headers.splice(0, 1, 'Member', 'Email')
      headers.push('Invitation type', 'Invitation sent')
    }
    const reservationById = new Map(reservations.map(reservation => [reservation.id, reservation]))
    const rows = filteredRows.map(row => {
      const values = row.cells.map(cell => [cell.primary, cell.secondary].filter(Boolean).join(' — '))
      if (reportKind === 'reservations') {
        const reservation = reservationById.get(row.id)
        values.push(
          row.id,
          reservation?.purpose || '',
          reservation?.subjectCode?.trim() || 'N/A',
          reservation?.classSection?.trim() || 'N/A',
          String(reservation?.attendees ?? ''),
          reservation ? String(reservationDurationMinutes(reservation)) : '',
          reservation?.deanRecommend === true ? 'Yes' : 'No',
          reservation?.registrarRecommend === true ? 'Yes' : 'No',
          reservation?.universityAdministratorRecommend === true ? 'Yes' : 'No',
          reservation?.declinedByRole || '',
          reservation?.declinedReason || '',
          reservation?.cancellationReason || '',
          reservation ? String(reservationEvidenceFiles(reservation).length) : '',
        )
      } else if (reportKind === 'rooms') {
        const room = row.recordType === 'Room' ? roomById.get(row.id) : undefined
        const building = row.recordType === 'Building' ? buildingById.get(row.id) : undefined
        const usage = row.recordType === 'Building' ? facilityUsage.buildings[row.id] : facilityUsage.rooms[row.id]
        if (room) values[7] = room.amenities?.join(', ') || 'None recorded'
        values.push(
          row.id,
          room?.code || building?.code || '',
          row.recordType === 'Room' ? row.buildingCode || '' : '',
          room?.description || '',
          room?.availableDays?.join(', ') || '',
          room?.startTime || '',
          room?.endTime || '',
          room?.minBookingMins !== undefined ? String(room.minBookingMins) : '',
          room?.maxBookingMins !== undefined ? String(room.maxBookingMins) : '',
          activeAcademicYear ? `${activeAcademicYear.academicYear} · ${currentSemester}` : 'No academic year',
          facilityUsageLoading || facilityUsageError || (room && room.status !== 'Available') ? '' : usage?.departments.map(department => `${department.name}: ${department.percent.toFixed(1)}%`).join(', ') || '',
        )
      } else if (reportKind === 'members') {
        values.splice(0, 1, row.cells[0].primary, row.cells[0].secondary || (row.cells[0].primary.includes('@') ? row.cells[0].primary : ''))
        values.push(row.status === 'Pending' ? row.isReactivation ? 'Re-invitation' : 'Invitation' : '',
          row.status === 'Pending' && row.date ? formatReportDate(row.date, '') : '')
      }
      return values
    })
    downloadReportCsv(`rorms-${reportKind}-report-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows)
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="Reports"
          description="Review what happened across reservations, rooms, schedules, and member records, then export the exact results you need."
        />

        {(errors.length > 0 || ((reportKind === 'rooms' || reportKind === 'schedules') && currentSchedulesError)) && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Some report sources are unavailable</p>
              <p className="mt-0.5 text-xs text-amber-700">Could not load: {[...errors, ...((reportKind === 'rooms' || reportKind === 'schedules') && currentSchedulesError ? [currentSchedulesError] : [])].join(', ')}. Available records are still included.</p>
            </div>
          </div>
        )}

        <div className={`animate-in grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${availableReportOptions.length === 2 ? 'lg:grid-cols-2' : availableReportOptions.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`} role="tablist" aria-label="Report categories">
          {availableReportOptions.map(option => {
            const ReportIcon = option.icon
            const isActive = reportKind === option.id
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="report-results"
                onClick={() => selectReportKind(option.id)}
                className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] focus-visible:ring-offset-2 ${isActive ? 'bg-gradient-to-br from-[#e3edda] to-[#f3f7ee] text-[#41572a] shadow-sm ring-1 ring-[#c6dbb6]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
                  <ReportIcon className="h-4.5 w-4.5" />
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
          <aside className="animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-12">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-8">
            <p className="shrink-0 text-sm font-bold text-slate-700">Report scope</p>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Date range</dt><dd className="min-w-0 break-words font-black text-slate-900" title={dateRanges.map(value => DATE_RANGE_OPTIONS.find(option => option.value === value)?.label || value).join(', ')}>{dateRanges.length === 0 ? 'All dates' : dateRanges.map(value => DATE_RANGE_OPTIONS.find(option => option.value === value)?.label || value).join(', ')}</dd></div>
              {reportKind === 'rooms'
                ? <>
                  <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Building</dt><dd className="min-w-0 break-words font-black text-slate-900" title={buildingFilters.join(', ')}>{buildingFilters.length === 0 ? 'All' : buildingFilters.join(', ')}</dd></div>
                  <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Record</dt><dd className="min-w-0 break-words font-black text-slate-900" title={facilityRecordFilters.join(', ')}>{facilityRecordFilters.length === 0 ? 'All' : facilityRecordFilters.join(', ')}</dd></div>
                  <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Room type</dt><dd className="min-w-0 break-words font-black text-slate-900" title={roomTypeFilters.join(', ')}>{roomTypeFilters.length === 0 ? 'All' : roomTypeFilters.join(', ')}</dd></div>
                </>
                : <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Department</dt><dd className="min-w-0 break-words font-black text-slate-900" title={departmentFilters.join(', ')}>{departmentFilters.length === 0 ? 'All' : departmentFilters.join(', ')}</dd></div>}
              {reportKind === 'reservations' && <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Type</dt><dd className="min-w-0 break-words font-black text-slate-900" title={reservationTypeFilters.join(', ')}>{reservationTypeFilters.length === 0 ? 'All' : reservationTypeFilters.join(', ')}</dd></div>}
              {reportKind === 'reservations' && <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Review step</dt><dd className="min-w-0 break-words font-black text-slate-900" title={reviewStepFilters.join(', ')}>{reviewStepFilters.length === 0 ? 'All' : reviewStepFilters.join(', ')}</dd></div>}
              {reportKind === 'members' && <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Role</dt><dd className="min-w-0 break-words font-black text-slate-900" title={roleFilters.join(', ')}>{roleFilters.length === 0 ? 'All' : roleFilters.join(', ')}</dd></div>}
              <div className="flex min-w-0 items-baseline gap-2"><dt className="shrink-0 font-bold text-slate-600">Status</dt><dd className="min-w-0 break-words font-black text-slate-900" title={statusFilters.join(', ')}>{statusFilters.length === 0 ? 'All' : statusFilters.join(', ')}</dd></div>
            </dl>
            </div>
          </aside>

          <section id="report-results" role="tabpanel" className="overflow-visible xl:col-span-12">
            <DataTable
              data={filteredRows}
              columns={reportColumns}
              searchPlaceholder={`Search ${activeReport.label.toLowerCase()}...`}
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              filters={<FilterDropdown groups={filterGroups} onClearAll={clearReportFilters} buttonClassName="!h-11 px-4" />}
              primaryAction={(
                <Button
                  type="button"
                  variant="brand"
                  icon={<DownloadIcon className="h-4 w-4" />}
                  onClick={exportCsv}
                  disabled={filteredRows.length === 0 || isLoading || (reportKind === 'schedules' && isCurrentSchedulesLoading) || (reportKind === 'rooms' && facilityUsageLoading)}
                  className="!h-11 px-4"
                >
                  Export CSV
                </Button>
              )}
              isLoading={isLoading || (reportKind === 'schedules' && isCurrentSchedulesLoading)}
              emptyTitle="No matching records"
              emptyDescription="Try changing the date, department, status, or search filters."
              emptyIcon={<ClipboardIcon className="h-12 w-12" />}
            />
          </section>
        </div>
      </div>
    </section>
  )
}

export default ReportsPage
