import { useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { Button } from '../../components/Button'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { SectionHeader } from '../../components/SectionHeader'
import {
  AlertCircleIcon,
  BuildingIcon,
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
  useReportingData,
} from '../../utils/reportingData'
import { useAcademicSemester } from '../../utils/academicSemester'

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
  isScheduleChild?: boolean
  scheduleOrder?: number
  academicYear?: string
  semester?: string
  building?: string
  floor?: number
  roomName?: string
  membershipStatus?: string
  role?: string
  searchText: string
  cells: ReportCell[]
}

interface ReportMetric {
  label: string
  value: string
  detail: string
  icon: ComponentType<IconProps>
  color: string
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
  reservations: ['Reservation', 'Date & time', 'Room', 'Requester', 'Department', 'Duration', 'Status'],
  rooms: ['Room', 'Type', 'Floor', 'Capacity', 'Availability', 'Amenities', 'Status'],
  schedules: ['Department', 'Academic year', 'Semester', 'Type', 'Format', 'Code', 'Title', 'Section', 'Instructor', 'Time', 'Days', 'Building', 'Room', 'Status'],
  members: ['Member', 'Email', 'Department', 'Role', 'Membership', 'Status', 'Joined'],
}

const DATE_RANGE_OPTIONS: Array<{ value: DateRange; label: string }> = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]

const ROOM_STATUS_OPTIONS = ['Available', 'Unavailable', 'Maintenance']
const RESERVATION_STATUS_OPTIONS = ['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed']
const MEMBER_STATUS_OPTIONS = ['Active', 'Deactivated', 'Pending']
const SCHEDULE_STATUS_OPTIONS = ['Draft', 'Returned', 'Revised', 'Plotted']
const MEMBERSHIP_STATUS_OPTIONS = ['Accepted', 'Pending']
const OFFICE_DEPARTMENTS = ['Administrative Office', "Registrar's Office"]
const MEMBER_ROLE_ORDER: Record<string, number> = {
  dean: 0,
  'program head': 1,
  instructor: 2,
}

interface ReportsPageProps {
  userRole: string
}
const MEMBERSHIP_STATUS_ORDER: Record<string, number> = {
  accepted: 0,
  pending: 1,
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
const SCHEDULE_COLUMN_WIDTHS = ['8rem', '8rem', '8rem', '5.625rem', '7.5rem', '5.625rem', '15rem', '6.25rem', '16.25rem', '15rem', '8.5rem', '8rem', '11.25rem']

const statusClasses: Record<string, string> = {
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-blue-200 bg-blue-50 text-blue-700',
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
  revise: 'border-purple-200 bg-purple-50 text-purple-700',
  return: 'border-rose-200 bg-rose-50 text-rose-700',
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

function formatTitleCase(value: string) {
  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue ? `${normalizedValue.charAt(0).toUpperCase()}${normalizedValue.slice(1)}` : 'Pending'
}

function getMemberDepartmentRank(department: string) {
  if (department === 'Administrative Office') return 0
  if (department === "Registrar's Office") return 1
  if (department === 'Unassigned') return 3
  return 2
}

function getMemberRoleRank(role?: string) {
  return MEMBER_ROLE_ORDER[role?.toLowerCase() || ''] ?? Object.keys(MEMBER_ROLE_ORDER).length
}

function getMembershipStatusRank(status?: string) {
  return MEMBERSHIP_STATUS_ORDER[status?.toLowerCase() || ''] ?? Object.keys(MEMBERSHIP_STATUS_ORDER).length
}

function getMemberStatusRank(status: string) {
  return MEMBER_STATUS_ORDER[status.toLowerCase()] ?? Object.keys(MEMBER_STATUS_ORDER).length
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`
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

function formatScheduleStatus(status?: string) {
  if (status === 'Plot' || status === 'Plotted') return 'Plotted'
  if (status === 'Revising') return 'Revising'
  if (status === 'Revise' || status === 'Revised') return 'Revised'
  if (status === 'Return' || status === 'Returned' || status === 'Removed') return 'Returned'
  return 'Draft'
}

function getScheduleStatusRank(status: string) {
  if (status === 'Return' || status === 'Returned' || status === 'Removed') return 1
  if (status === 'Revise' || status === 'Revising' || status === 'Revised') return 2
  if (status === 'Plot' || status === 'Plotted') return 3
  return 0
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
  const normalizedSemester = semester?.toLowerCase() || ''
  if (normalizedSemester.startsWith('1') || normalizedSemester.includes('first')) return 'first'
  if (normalizedSemester.startsWith('2') || normalizedSemester.includes('second')) return 'second'
  return ''
}

function formatSemester(semester?: string) {
  if (!semester) return 'Not recorded'
  return semester.replace(/semester/i, 'Sem')
}

function formatScheduleType(type?: string) {
  if (!type) return '----'
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}`
}

function formatScheduleFormat(type?: string, format?: string, format2?: string) {
  if (type === 'open lab' || format === 'Flexible') return 'Flexible'
  if (!format) return '----'
  if (format === format2) return `${format}²`
  return format2 ? `${format} / ${format2}` : format
}

function formatScheduleDays(days: string[] | undefined, type?: string, format2?: string) {
  const [firstDay, secondDay] = days || []
  if (!firstDay) return '----'
  const hasSecondSession = Boolean(format2) || type === 'open lab'
  if (!secondDay || (secondDay === firstDay && hasSecondSession)) return firstDay
  return `${firstDay} / ${secondDay}`
}

function formatScheduleTime(schedule: { startTime?: string; endTime?: string; startTime2?: string; endTime2?: string; instructorId?: string; instructorId2?: string; days?: string[]; type?: string; format2?: string }) {
  if (!schedule.startTime) return '----'
  const firstSession = `${schedule.startTime} - ${schedule.endTime || '----'}`
  if (!schedule.startTime2) return firstSession

  const hasSecondSession = Boolean(schedule.format2) || schedule.type === 'open lab'
  const sameInstructor = Boolean(schedule.instructorId2) && schedule.instructorId2 === schedule.instructorId
  const sameDay = schedule.days?.length === 2 && schedule.days[0] === schedule.days[1]
  if (hasSecondSession && schedule.endTime === schedule.startTime2 && sameInstructor && sameDay) {
    return `${schedule.startTime} - ${schedule.endTime2 || '----'}`
  }

  return `${firstSession} / ${schedule.startTime2} - ${schedule.endTime2 || '----'}`
}

function ReportsPage({ userRole }: ReportsPageProps) {
  const { reservations, rooms, buildings, memberships, invitations, isInvitationsLoading, invitationsError, users, departments, schedules, errors, isLoading } = useReportingData()
  const isRegistrar = userRole.trim().toLowerCase() === 'registrar'
  const [reportKind, setReportKind] = useState<ReportKind>(() => {
    const storedReportKind = getStoredReportKind()
    return isRegistrar && storedReportKind === 'members' ? 'reservations' : storedReportKind
  })
  const [dateRanges, setDateRanges] = useState<DateRange[]>([])
  const [statusFilters, setStatusFilters] = useState<string[]>([])
  const [membershipStatusFilters, setMembershipStatusFilters] = useState<string[]>([])
  const [departmentFilters, setDepartmentFilters] = useState<string[]>([])
  const [academicYearFilters, setAcademicYearFilters] = useState<string[]>([])
  const [semesterFilters, setSemesterFilters] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const { academicYears } = useAcademicSemester()
  const availableReportOptions = isRegistrar
    ? REPORT_OPTIONS.filter(option => option.id !== 'members')
    : REPORT_OPTIONS

  useEffect(() => {
    if (isRegistrar && reportKind === 'members') {
      setReportKind('reservations')
      setStatusFilters([])
      setMembershipStatusFilters([])
      setDepartmentFilters([])
      setAcademicYearFilters([])
      setSemesterFilters([])
    }
  }, [reportKind, isRegistrar])

  const roomById = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms])
  const buildingById = useMemo(() => new Map(buildings.map(building => [building.id, building])), [buildings])
  const memberByUserId = useMemo(() => new Map(memberships.filter(member => member.userId).map(member => [member.userId as string, member])), [memberships])
  const memberById = useMemo(() => new Map(memberships.map(member => [member.id, member])), [memberships])
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const unexpiredPendingInvitations = useMemo(() => {
    const now = Date.now()

    return invitations.filter(invitation => {
      const expiresAt = timestampToDate(invitation.expiresAt)
      return invitation.status?.toLowerCase() === 'pending'
        && expiresAt !== null
        && expiresAt.getTime() > now
    })
  }, [invitations])
  const unexpiredPendingInvitationMembershipIds = useMemo(
    () => new Set(unexpiredPendingInvitations.map(invitation => invitation.membershipId).filter((membershipId): membershipId is string => Boolean(membershipId))),
    [unexpiredPendingInvitations],
  )
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

    return schedules
      .filter(schedule => !mergedChildIds.has(schedule.id))
      .map(schedule => displayRecordsById.get(schedule.id) || schedule)
  }, [schedules])
  const scheduleReportById = useMemo(() => new Map(scheduleReportRecords.map(schedule => [schedule.id, schedule])), [scheduleReportRecords])
  const departmentsByRoomId = useMemo(() => {
    const roomDepartments = new Map<string, Set<string>>()

    schedules.forEach(schedule => {
      const roomId = schedule.roomId
      const department = schedule.department?.trim()
      if (!roomId || !department) return

      const assignedDepartments = roomDepartments.get(roomId) || new Set<string>()
      assignedDepartments.add(department)
      roomDepartments.set(roomId, assignedDepartments)
    })

    return new Map(Array.from(roomDepartments, ([roomId, assignedDepartments]) => [roomId, Array.from(assignedDepartments).sort()]))
  }, [schedules])

  const reportRows = useMemo<ReportRow[]>(() => {
    if (reportKind === 'reservations') {
      return reservations.map(reservation => {
        const room = roomById.get(reservation.roomId || '')
        const building = buildingById.get(reservation.buildingId || room?.buildingId || '')
        const member = memberByUserId.get(reservation.userId || '')
        const status = reservation.status || 'Pending'
        const duration = reservationDurationMinutes(reservation)
        const recordDate = dateStringToDate(reservation.date) || timestampToDate(reservation.createdAt)
        const reference = reservation.id.slice(0, 8).toUpperCase()
        const values = [
          { primary: `#${reference}`, secondary: formatReportDate(reservation.createdAt, 'Created date unavailable') },
          { primary: reservation.date ? formatReportDate(recordDate) : 'Date not set', secondary: `${formatReportTime(reservation.startTime)}–${formatReportTime(reservation.endTime)}` },
          { primary: room?.code || room?.name || 'Unassigned', secondary: building?.name || building?.code || 'Building unavailable' },
          { primary: member?.fullName || 'Unknown requester', secondary: member?.email || 'No email recorded' },
          { primary: member?.department || 'Unassigned' },
          { primary: duration > 0 ? `${(duration / 60).toFixed(duration % 60 === 0 ? 0 : 1)} hours` : 'Not recorded' },
          { primary: status },
        ]
        return {
          id: reservation.id,
          date: recordDate,
          createdAt: timestampToDate(reservation.createdAt),
          department: member?.department || 'Unassigned',
          departments: [member?.department || 'Unassigned'],
          status,
          searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
          cells: values,
        }
      })
    }

    if (reportKind === 'rooms') {
      return rooms.map(room => {
        const building = buildingById.get(room.buildingId || '')
        const roomDepartments = departmentsByRoomId.get(room.id) || []
        const status = room.status || 'Available'
        const values = [
          { primary: room.name || room.code || 'Unnamed room', secondary: building?.code || 'Building unavailable' },
          { primary: room.type || 'Not specified' },
          { primary: room.floor !== undefined ? `Floor ${room.floor}` : 'Not recorded' },
          { primary: `${Number(room.capacity) || 0} people` },
          { primary: room.availableDays?.length ? `${room.availableDays.length} days/week` : 'Days not set', secondary: room.startTime && room.endTime ? `${formatReportTime(room.startTime)}–${formatReportTime(room.endTime)}` : undefined },
          { primary: `${room.amenities?.length || 0} amenities`, secondary: room.amenities?.slice(0, 3).join(', ') || 'None recorded' },
          { primary: status },
        ]
        return {
          id: room.id,
          date: timestampToDate(room.createdAt),
          createdAt: timestampToDate(room.createdAt),
          department: roomDepartments[0] || 'Unassigned',
          departments: roomDepartments,
          status,
          building: building?.name || building?.code || 'Building unavailable',
          floor: typeof room.floor === 'number' ? room.floor : undefined,
          roomName: room.name || room.code || 'Unnamed room',
          searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
          cells: values,
        }
      })
    }

    if (reportKind === 'schedules') {
      return scheduleReportRecords.map((schedule, index) => {
        const room = roomById.get(schedule.roomId || '')
        const building = buildingById.get(schedule.buildingId || room?.buildingId || '')
        const parentSchedule = schedule.parentId ? scheduleReportById.get(schedule.parentId) : undefined
        const instructor = memberById.get(schedule.instructorId || '') || memberByUserId.get(schedule.instructorId || '')
        const secondInstructor = memberById.get(schedule.instructorId2 || '') || memberByUserId.get(schedule.instructorId2 || '')
        const secondRoom = roomById.get(schedule.roomId2 || '')
        const secondBuilding = buildingById.get(schedule.buildingId2 || secondRoom?.buildingId || '')
        const isChild = Boolean(schedule.parentId)
        const hasSecondSession = Boolean(schedule.format2) || schedule.type === 'open lab'
        const status = formatScheduleStatus(schedule.status)
        const academicYear = schedule.academicYear || 'Not recorded'
        const semester = formatSemester(schedule.semester)
        const instructorName = instructor?.fullName || '----'
        const secondInstructorName = secondInstructor?.fullName
        const instructorValue = secondInstructorName && (secondInstructorName !== instructorName || !hasSecondSession)
          ? `${instructorName} / ${secondInstructorName}`
          : instructorName
        const buildingValue = building?.code || building?.name || '----'
        const secondBuildingValue = secondBuilding?.code || secondBuilding?.name
        const roomValue = room?.name || room?.code || '----'
        const secondRoomValue = secondRoom?.name || secondRoom?.code
        const values: ReportCell[] = [
          { primary: schedule.department || 'Unassigned' },
          { primary: academicYear },
          { primary: semester },
          { primary: isChild ? '----' : formatScheduleType(schedule.type) },
          { primary: formatScheduleFormat(schedule.type, schedule.format, schedule.format2) },
          { primary: schedule.subjectCode || parentSchedule?.subjectCode || '----' },
          { primary: schedule.subjectTitle || parentSchedule?.subjectTitle || '----' },
          { primary: schedule.classSection || '----' },
          { primary: instructorValue },
          { primary: formatScheduleTime(schedule) },
          { primary: formatScheduleDays(schedule.days, schedule.type, schedule.format2) },
          { primary: secondBuildingValue && (secondBuildingValue !== buildingValue || !hasSecondSession) ? `${buildingValue} / ${secondBuildingValue}` : buildingValue },
          { primary: secondRoomValue && (secondRoomValue !== roomValue || !hasSecondSession) ? `${roomValue} / ${secondRoomValue}` : roomValue },
          { primary: isChild ? '----' : formatScheduleStatus(status) },
        ]
        return {
          id: schedule.id,
          date: timestampToDate(schedule.updatedAt) || timestampToDate(schedule.createdAt),
          createdAt: timestampToDate(schedule.createdAt),
          department: schedule.department || 'Unassigned',
          departments: [schedule.department || 'Unassigned'],
          status,
          isScheduleChild: isChild,
          scheduleOrder: schedule.orderIndex ?? index,
          academicYear,
          semester,
          searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
          cells: values,
        }
      })
    }

    const visibleMemberships = isInvitationsLoading || invitationsError
      ? memberships
      : memberships.filter(member => {
        const membershipStatus = (member.status || 'Pending').toLowerCase()
        const hasUnexpiredPendingInvitation = unexpiredPendingInvitationMembershipIds.has(member.id)
          || unexpiredPendingInvitationEmails.has(member.email?.toLowerCase() || '')
        return membershipStatus !== 'pending' || hasUnexpiredPendingInvitation
      })

    return visibleMemberships.map(member => {
      const user = userById.get(member.userId || '')
      const membershipStatus = formatTitleCase(member.status || 'Pending')
      const hasUnexpiredPendingInvitation = unexpiredPendingInvitationMembershipIds.has(member.id)
        || unexpiredPendingInvitationEmails.has(member.email?.toLowerCase() || '')
      const status = hasUnexpiredPendingInvitation || membershipStatus.toLowerCase() === 'pending'
        ? 'Pending'
        : user?.isActive === false
          ? 'Deactivated'
          : 'Active'
      const values = [
        { primary: member.fullName || user?.fullName || 'Unnamed member' },
        { primary: member.email || user?.email || 'No email recorded' },
        { primary: member.department || 'Unassigned' },
        { primary: member.role || 'Not assigned' },
        { primary: membershipStatus },
        { primary: status, secondary: status !== 'Pending' ? (user?.isVerify ? 'Email verified' : 'Email not verified') : undefined },
        { primary: formatReportDate(member.joinedAt || member.createdAt) },
      ]
      return {
        id: member.id,
        date: timestampToDate(member.joinedAt) || timestampToDate(member.createdAt),
        createdAt: timestampToDate(member.createdAt),
        department: member.department || 'Unassigned',
        departments: [member.department || 'Unassigned'],
        status,
        membershipStatus,
        role: member.role || 'Not assigned',
        searchText: values.flatMap(value => [value.primary, value.secondary || '']).join(' ').toLowerCase(),
        cells: values,
      }
    })
  }, [reportKind, reservations, rooms, memberships, isInvitationsLoading, invitationsError, unexpiredPendingInvitationMembershipIds, unexpiredPendingInvitationEmails, roomById, buildingById, memberByUserId, memberById, userById, departmentsByRoomId, scheduleReportRecords, scheduleReportById])

  const statusOptions = useMemo(() => {
    if (reportKind === 'rooms') return ROOM_STATUS_OPTIONS
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

    if (reportKind === 'rooms') return masterDepartments.sort()
    if (reportKind === 'reservations' || reportKind === 'schedules') {
      return Array.from(new Set([...reportDepartments, ...masterDepartments])).sort()
    }

    const academicDepartments = Array.from(new Set([...masterDepartments, ...reportDepartments]))
      .filter(department => department !== 'Unassigned' && !OFFICE_DEPARTMENTS.includes(department))
      .sort()

    return [...OFFICE_DEPARTMENTS, ...academicDepartments, 'Unassigned']
  }, [reportKind, reportRows, departments])
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
    {
      id: 'department',
      title: 'Department',
      options: departmentOptions,
      selectedValues: departmentFilters,
      onChange: setDepartmentFilters,
    },
    ...(reportKind === 'members' ? [{
      id: 'membership-status',
      title: 'Membership',
      options: MEMBERSHIP_STATUS_OPTIONS,
      selectedValues: membershipStatusFilters,
      onChange: setMembershipStatusFilters,
    }] : []),
    {
      id: 'status',
      title: 'Status',
      options: statusOptions,
      selectedValues: statusFilters,
      onChange: setStatusFilters,
    },
  ], [academicYearFilters, academicYearOptions, dateRanges, departmentFilters, departmentOptions, membershipStatusFilters, reportKind, semesterFilters, statusFilters, statusOptions])

  const clearReportFilters = () => {
    setDateRanges([])
    setStatusFilters([])
    setMembershipStatusFilters([])
    setDepartmentFilters([])
    setAcademicYearFilters([])
    setSemesterFilters([])
  }

  const selectReportKind = (nextReportKind: ReportKind) => {
    setReportKind(nextReportKind)
    setStatusFilters([])
    setMembershipStatusFilters([])
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
      .filter(row => departmentFilters.length === 0 || row.departments.some(department => departmentFilters.includes(department)))
      .filter(row => reportKind !== 'members' || membershipStatusFilters.length === 0 || membershipStatusFilters.includes(row.membershipStatus || ''))
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

          const floorOrder = (first.floor ?? Number.POSITIVE_INFINITY) - (second.floor ?? Number.POSITIVE_INFINITY)
          if (floorOrder !== 0) return floorOrder

          const roomNameOrder = (first.roomName || '').localeCompare(second.roomName || '', undefined, { numeric: true, sensitivity: 'base' })
          if (roomNameOrder !== 0) return roomNameOrder

          return getRoomStatusRank(first.status) - getRoomStatusRank(second.status)
        }

        if (reportKind === 'members') {
          const firstDepartmentRank = getMemberDepartmentRank(first.department)
          const secondDepartmentRank = getMemberDepartmentRank(second.department)
          if (firstDepartmentRank !== secondDepartmentRank) return firstDepartmentRank - secondDepartmentRank

          const departmentOrder = first.department.localeCompare(second.department, undefined, { numeric: true, sensitivity: 'base' })
          if (departmentOrder !== 0) return departmentOrder

          const roleOrder = getMemberRoleRank(first.role) - getMemberRoleRank(second.role)
          if (roleOrder !== 0) return roleOrder

          const membershipStatusOrder = getMembershipStatusRank(first.membershipStatus) - getMembershipStatusRank(second.membershipStatus)
          if (membershipStatusOrder !== 0) return membershipStatusOrder

          const statusOrder = getMemberStatusRank(first.status) - getMemberStatusRank(second.status)
          if (statusOrder !== 0) return statusOrder

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
  }, [academicYearFilters, dateRanges, departmentFilters, membershipStatusFilters, reportKind, reportRows, searchQuery, semesterFilters, statusFilters])

  const summaryRows = useMemo(
    () => reportKind === 'schedules' ? filteredRows.filter(row => !row.isScheduleChild) : filteredRows,
    [filteredRows, reportKind],
  )

  const metrics = useMemo<ReportMetric[]>(() => {
    const statusCount = (statuses: string[]) => summaryRows.filter(row => statuses.includes(row.status.toLowerCase())).length
    const percent = (value: number) => summaryRows.length > 0 ? `${Math.round(value / summaryRows.length * 100)}%` : '0%'

    if (reportKind === 'reservations') {
      const approved = statusCount(['approved', 'completed'])
      const pending = statusCount(['pending'])
      const matchingIds = new Set(filteredRows.map(row => row.id))
      const totalHours = reservations.filter(item => matchingIds.has(item.id)).reduce((total, item) => total + reservationDurationMinutes(item), 0) / 60
      return [
        { label: 'Reservation records', value: filteredRows.length.toLocaleString(), detail: 'matching the current report', icon: ClipboardIcon, color: 'bg-blue-50 text-blue-700' },
        { label: 'Approved or completed', value: approved.toLocaleString(), detail: `${percent(approved)} of matching requests`, icon: CalendarIcon, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Awaiting decision', value: pending.toLocaleString(), detail: `${percent(pending)} remain pending`, icon: AlertCircleIcon, color: 'bg-amber-50 text-amber-700' },
        { label: 'Reserved time', value: `${totalHours.toFixed(totalHours % 1 === 0 ? 0 : 1)}h`, detail: 'combined requested duration', icon: DoorIcon, color: 'bg-purple-50 text-purple-700' },
      ]
    }

    if (reportKind === 'rooms') {
      const matchingIds = new Set(filteredRows.map(row => row.id))
      const matchingRooms = rooms.filter(room => matchingIds.has(room.id))
      const capacity = matchingRooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0)
      const available = statusCount(['available'])
      const maintenance = statusCount(['maintenance'])
      return [
        { label: 'Rooms recorded', value: filteredRows.length.toLocaleString(), detail: `${buildings.length} campus buildings`, icon: DoorIcon, color: 'bg-blue-50 text-blue-700' },
        { label: 'Available rooms', value: available.toLocaleString(), detail: `${percent(available)} currently ready`, icon: CalendarIcon, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Under maintenance', value: maintenance.toLocaleString(), detail: `${percent(maintenance)} unavailable`, icon: AlertCircleIcon, color: 'bg-rose-50 text-rose-700' },
        { label: 'Recorded capacity', value: capacity.toLocaleString(), detail: 'seats across matching rooms', icon: UsersIcon, color: 'bg-purple-50 text-purple-700' },
      ]
    }

    if (reportKind === 'schedules') {
      const plotted = statusCount(['plot', 'plotted'])
      const draft = statusCount(['draft', 'drafted'])
      const needsReview = statusCount(['revise', 'revised', 'return', 'returned'])
      return [
        { label: 'Schedule records', value: summaryRows.length.toLocaleString(), detail: 'parent schedule entries', icon: CalendarIcon, color: 'bg-blue-50 text-blue-700' },
        { label: 'Plotted schedules', value: plotted.toLocaleString(), detail: `${percent(plotted)} assigned`, icon: DoorIcon, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Draft schedules', value: draft.toLocaleString(), detail: `${percent(draft)} still drafting`, icon: ClipboardIcon, color: 'bg-amber-50 text-amber-700' },
        { label: 'Needs review', value: needsReview.toLocaleString(), detail: `${percent(needsReview)} returned or revised`, icon: AlertCircleIcon, color: 'bg-rose-50 text-rose-700' },
      ]
    }

    const active = statusCount(['active'])
    const deactivated = statusCount(['deactivated'])
    const representedDepartments = new Set(filteredRows.map(row => row.department).filter(value => value !== 'Unassigned')).size
    return [
      { label: 'Membership records', value: filteredRows.length.toLocaleString(), detail: 'matching directory entries', icon: UsersIcon, color: 'bg-blue-50 text-blue-700' },
      { label: 'Active or accepted', value: active.toLocaleString(), detail: `${percent(active)} in good standing`, icon: CalendarIcon, color: 'bg-emerald-50 text-emerald-700' },
      { label: 'Deactivated accounts', value: deactivated.toLocaleString(), detail: `${percent(deactivated)} of matching members`, icon: AlertCircleIcon, color: 'bg-rose-50 text-rose-700' },
      { label: 'Departments represented', value: representedDepartments.toLocaleString(), detail: 'across matching members', icon: BuildingIcon, color: 'bg-purple-50 text-purple-700' },
    ]
  }, [reportKind, filteredRows, summaryRows, reservations, rooms, buildings.length])

  const statusBreakdown = useMemo(() => {
    const predefinedStatuses = reportKind === 'rooms'
      ? ROOM_STATUS_OPTIONS
      : reportKind === 'reservations'
        ? RESERVATION_STATUS_OPTIONS
        : reportKind === 'members'
          ? MEMBER_STATUS_OPTIONS
          : reportKind === 'schedules'
            ? SCHEDULE_STATUS_OPTIONS
            : undefined

    if (predefinedStatuses) {
      return predefinedStatuses.map(status => [
        status,
        summaryRows.filter(row => row.status.toLowerCase() === status.toLowerCase()).length,
      ] as [string, number])
    }

    const counts = new Map<string, number>()
    summaryRows.forEach(row => counts.set(row.status, (counts.get(row.status) || 0) + 1))
    return Array.from(counts.entries()).sort((first, second) => second[1] - first[1])
  }, [reportKind, summaryRows])

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

      const isStatusCell = cellIndex === row.cells.length - 1 && reportKind !== 'members'
      const isMemberStatusCell = reportKind === 'members' && (cellIndex === 4 || cellIndex === 5)

      if (isStatusCell || isMemberStatusCell) {
        return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[0.65rem] font-black ${getStatusClasses(cell.primary)}`}>{cell.primary}</span>
      }

      return (
        <div className="max-w-64">
          <p className="truncate font-bold text-slate-700" title={cell.primary}>{cell.primary}</p>
          {cell.secondary && <p className="mt-0.5 truncate text-xs text-slate-400" title={cell.secondary}>{cell.secondary}</p>}
        </div>
      )
    },
  })), [reportKind])

  const exportCsv = () => {
    const headers = REPORT_COLUMNS[reportKind]
    const rows = filteredRows.map(row => row.cells.map(cell => [cell.primary, cell.secondary].filter(Boolean).join(' — ')))
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rorms-${reportKind}-report-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader
          title="Reports"
          description="Review what happened across reservations, rooms, schedules, and member records, then export the exact results you need."
        />

        {errors.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
            <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Some report sources are unavailable</p>
              <p className="mt-0.5 text-xs text-amber-700">Could not load: {errors.join(', ')}. Available records are still included.</p>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm ${availableReportOptions.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`} role="tablist" aria-label="Report categories">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => {
            return (
              <article key={metric.label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{metric.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{metric.detail}</p>
                  </div>
                  <p className="shrink-0 text-3xl font-black tracking-tight text-slate-900">{isLoading ? '—' : metric.value}</p>
                </div>
              </article>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-12">
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-9">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700"><ClipboardIcon className="h-5 w-5" /></span>
              <div>
                <h2 className="font-black text-slate-900">Status breakdown</h2>
                <p className="text-xs text-slate-400">Within this report</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3 overflow-x-auto custom-scrollbar pb-1">
              {statusBreakdown.length === 0 ? <p className="text-xs text-slate-400">No status data available.</p> : statusBreakdown.map(([status, count]) => {
                const share = summaryRows.length > 0 ? Math.round(count / summaryRows.length * 100) : 0
                const shareLabel = share === 0 ? '0%' : `${share}%`
                const countAndShareLabel = count === 0 ? shareLabel : `${count} · ${shareLabel}`
                return (
                  <div key={status} className="min-w-40 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-black text-slate-700">{status}</span>
                      <span className="text-sm font-black text-slate-900">{countAndShareLabel}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-[var(--brand-color)]" style={{ width: `${share}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
            <p className="text-sm font-bold text-slate-700">Report scope</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-600">Date range</dt><dd className="max-w-32 truncate font-black text-slate-900" title={dateRanges.map(value => DATE_RANGE_OPTIONS.find(option => option.value === value)?.label || value).join(', ')}>{dateRanges.length === 0 ? 'All dates' : dateRanges.map(value => DATE_RANGE_OPTIONS.find(option => option.value === value)?.label || value).join(', ')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-600">Department</dt><dd className="max-w-32 truncate font-black text-slate-900" title={departmentFilters.join(', ')}>{departmentFilters.length === 0 ? 'All' : departmentFilters.join(', ')}</dd></div>
              <div className="flex justify-between gap-3"><dt className="font-bold text-slate-600">Status</dt><dd className="max-w-32 truncate font-black text-slate-900" title={statusFilters.join(', ')}>{statusFilters.length === 0 ? 'All' : statusFilters.join(', ')}</dd></div>
            </dl>
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
                  disabled={filteredRows.length === 0}
                  className="!h-11 px-4"
                >
                  Export CSV
                </Button>
              )}
              isLoading={isLoading}
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
