import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { scheduleMeetingRecords } from '../../utils/scheduleMeetings'
import { maxReservationDuration, reservationTimeMinutes, reservationTimeString, type ReservationRequestType } from '../../utils/reservationDuration'
import { SectionHeader } from '../../components/SectionHeader'
import { UserIcon, SearchIcon, CheckIcon, ClipboardIcon, BookIcon, DoorIcon, UsersIcon, CalendarIcon, ClockIcon } from '../../components/Icons'
import { Button } from '../../components/Button'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { RoomScheduleModal } from '../../components/RoomScheduleModal'
import { BuildingBrowser } from '../../components/BuildingBrowser'
import { TimePicker } from '../../components/TimePicker'
import { DatePicker } from '../../components/DatePicker'
import { NumberInput } from '../../components/NumberInput'
import { TextInput } from '../../components/TextInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { RoomAmenities } from '../../components/RoomAmenities'
import { Snackbar } from '../../components/Snackbar'
import { db, auth } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { 
  collection, 
  doc,
  onSnapshot, 
  query, 
  orderBy,
  where,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

import type { Room, Building, RoomStatus } from '../../types/room'
import { DEFAULT_ROOM_IMAGE, roomStatusClasses, DAYS_OF_WEEK } from '../../types/room'
import { reservationUsesRoom } from '../../utils/reservationRooms'

function getLocalIsoDate(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function RoomUsageRules({ accepted, onAcceptedChange }: { accepted: boolean; onAcceptedChange: (accepted: boolean) => void }) {
  return (
    <section aria-labelledby="room-usage-rules-title" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="room-usage-rules-title" className="font-bold text-rose-800">General Rules for Room Use</h3>
        <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">Read before reserving</span>
      </div>
      <ol className="mt-3 list-none space-y-2 pl-0" role="list">
        <li className="flex items-start gap-3"><span aria-hidden="true" className="w-4 shrink-0 pt-2 text-center font-bold text-rose-700">1.</span><span className="flex-1 rounded-lg border border-rose-200 bg-white/80 px-3 py-2"><strong className="font-semibold">Do NOT use</strong> Air Conditioning Unit.</span></li>
        <li className="flex items-start gap-3"><span aria-hidden="true" className="w-4 shrink-0 pt-2 text-center font-bold text-rose-700">2.</span><span className="flex-1 rounded-lg border border-rose-200 bg-white/80 px-3 py-2"><strong className="font-semibold">CLAY-GO</strong> (Clean As You Go).</span></li>
        <li className="flex items-start gap-3"><span aria-hidden="true" className="w-4 shrink-0 pt-2 text-center font-bold text-rose-700">3.</span><span className="flex-1 rounded-lg border border-rose-200 bg-white/80 px-3 py-2"><strong className="font-semibold">ARRANGE chairs</strong> back into classroom-type set-up.</span></li>
        <li className="flex items-start gap-3"><span aria-hidden="true" className="w-4 shrink-0 pt-2 text-center font-bold text-rose-700">4.</span><span className="flex-1 rounded-lg border border-rose-200 bg-white/80 px-3 py-2">Provide cleanliness/orderliness <strong className="font-semibold">EVIDENCE</strong> (an after-use photo with its upload time recorded).</span></li>
        <li className="flex items-start gap-3"><span aria-hidden="true" className="w-4 shrink-0 pt-2 text-center font-bold text-rose-700">5.</span><span className="flex-1 rounded-lg border border-rose-200 bg-white/80 px-3 py-2"><strong className="font-semibold">VACATE the room</strong> after your allowed time of stay.</span></li>
      </ol>
      <label className="mt-4 flex cursor-pointer items-start gap-2 border-t border-rose-200 pt-3 font-semibold text-rose-900">
        <input type="checkbox" checked={accepted} onChange={event => onAcceptedChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rose-700" />
        <span>I have read and understand the room use rules.</span>
      </label>
    </section>
  )
}

const normalizeAttendeeName = (value: string) => value.trim().replace(/\s+/g, ' ')
const capitalizeAttendeeWords = (value: string) => value.replace(/(^|[^\p{L}\p{M}])(\p{L})/gu, (_, separator: string, initial: string) => separator + initial.toLocaleUpperCase())

function formatTime12(timeStr: string) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12.toString().padStart(2, '0')}:${(m || 0).toString().padStart(2, '0')} ${period}`
}

function formatDatePretty(dateStr: string) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dateObj = new Date(y, m - 1, d)
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function getEarliestAvailableDate(availableDays: string[], skipToday = false) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startOffset = skipToday ? 1 : 0

  for (let i = startOffset; i < 7 + startOffset; i++) {
    const checkDate = new Date(today)
    checkDate.setDate(today.getDate() + i)
    const dayName = dayNames[checkDate.getDay()]
    if (availableDays.includes(dayName)) {
      return getLocalIsoDate(checkDate)
    }
  }
  return getLocalIsoDate(today)
}

const normalizeDay = (day: string): string => {
  if (!day) return ''
  const trimmed = day.trim()
  if (trimmed.startsWith('Mon')) return 'Mon'
  if (trimmed.startsWith('Tue')) return 'Tue'
  if (trimmed.startsWith('Wed')) return 'Wed'
  if (trimmed.startsWith('Thu')) return 'Thu'
  if (trimmed.startsWith('Fri')) return 'Fri'
  if (trimmed.startsWith('Sat')) return 'Sat'
  if (trimmed.startsWith('Sun')) return 'Sun'
  return trimmed
}

function longestStandardDuration(room: Room, startTime: string, busy: readonly { start: number; end: number }[]): number {
  const min = Math.max(30, room.minBookingMins || 30)
  const max = maxReservationDuration(room, startTime, 'Standard', busy)
  return max < min ? min : min + Math.floor((max - min) / 30) * 30
}

interface ReserveRoomPageProps {
  userRole: string
}

interface ReservationMembership {
  id: string
  userId: string
  department: string
}

interface ScheduleSlotSelection {
  date: string
  startTime: string
}

const RESERVATION_CREATOR_ROLES = ['Admin', 'Registrar', 'University Administrator', 'Dean', 'Program Head', 'Instructor']

function ReserveRoomPage({ userRole }: ReserveRoomPageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [filterBuildingId, setFilterBuildingId] = useState('all')
  const [filterFloor, setFilterFloor] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [reservations, setReservations] = useState<any[]>([])
  const [schedules, setSchedules] = useState<any[]>([])
  const [reservationMembership, setReservationMembership] = useState<ReservationMembership | null>(null)
  const [isMembershipLoading, setIsMembershipLoading] = useState(true)
  const [membershipLoadError, setMembershipLoadError] = useState(false)
  const [isReservationEnabled, setIsReservationEnabled] = useState(false)
  const [isReservationAvailabilityLoading, setIsReservationAvailabilityLoading] = useState(true)
  const [isUpdatingReservationAvailability, setIsUpdatingReservationAvailability] = useState(false)
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('rorms_reserve_expanded')
    return saved ? JSON.parse(saved) : []
  })
  const isInitialLoad = useRef(true)
  const knownBuildingIds = useRef<Set<string>>(new Set())
  const [rooms, setRooms] = useState<Room[]>([])
  const reservationAvailabilityRef = useMemo(() => doc(db, 'settings', 'reservationAvailability'), [])
  const canManageReservationAvailability = userRole === 'Admin' || userRole === 'Registrar' || userRole === 'University Administrator'
  const canCreateReservation = RESERVATION_CREATOR_ROLES.includes(userRole)
  
  const maxAllowedDate = useMemo(() => {
    const today = new Date()
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`
  }, [])

  useEffect(() => {
    localStorage.setItem('rorms_reserve_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

  useEffect(() => {
    const unsubscribe = onSnapshot(reservationAvailabilityRef, (snapshot) => {
      setIsReservationEnabled(snapshot.exists() ? snapshot.data().isReservationEnabled !== false : true)
      setIsReservationAvailabilityLoading(false)
    }, (error) => {
      console.error('Error fetching reservation availability:', error)
      setIsReservationEnabled(false)
      setIsReservationAvailabilityLoading(false)
    })

    return unsubscribe
  }, [reservationAvailabilityRef])

  const buildingOptions = useMemo(() => Array.from(new Set(buildings.map(b => b.code).filter(Boolean))).sort(), [buildings])
  const buildingFilterOptions = useMemo(() => [
    'all',
    ...buildings.slice().sort((a, b) => a.code.localeCompare(b.code)).map(building => building.id),
  ], [buildings])
  const floorFilterOptions = useMemo(() => [
    'all',
    ...Array.from(new Set(rooms.map(room => String(room.floor)))).sort((a, b) => Number(a) - Number(b)),
  ], [rooms])
  const typeFilterOptions = useMemo(() => [
    'all',
    ...Array.from(new Set(rooms.map(room => room.type).filter(Boolean))).sort(),
  ], [rooms])
  const statusFilterOptions = useMemo(() => [
    'all',
    ...Array.from(new Set(rooms.map(room => room.status).filter(Boolean))).sort(),
  ], [rooms])
  const filteredBuildings = useMemo(() => {
    const hasRoomFilter = filterFloor !== 'all' || filterType !== 'all' || filterStatus !== 'all'
    return buildings
      .filter(building => filterBuildingId === 'all' || building.id === filterBuildingId)
      .map(building => ({
        ...building,
        rooms: building.rooms.filter(room =>
          (filterFloor === 'all' || String(room.floor) === filterFloor)
          && (filterType === 'all' || room.type === filterType)
          && (filterStatus === 'all' || room.status === filterStatus)
        ),
      }))
      .filter(building => !hasRoomFilter || building.rooms.length > 0)
  }, [buildings, filterBuildingId, filterFloor, filterType, filterStatus])
  const hasActiveFilters = filterBuildingId !== 'all' || filterFloor !== 'all' || filterType !== 'all' || filterStatus !== 'all'

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
  useEffect(() => {
    if (!selectedRoomInfo) return
    const latest = rooms.find(room => room.id === selectedRoomInfo.id)
    if (latest && latest !== selectedRoomInfo) setSelectedRoomInfo(latest)
  }, [rooms, selectedRoomInfo?.id])
  const [isRoomScheduleModalOpen, setIsRoomScheduleModalOpen] = useState(false)
  const [selectedRoomForSchedule, setSelectedRoomForSchedule] = useState<Room | null>(null)
  const [scheduleSlotSelection, setScheduleSlotSelection] = useState<ScheduleSlotSelection | null>(null)

  const [reservationData, setReservationData] = useState({
    requestType: 'Standard' as ReservationRequestType,
    includeLinkedRoom: false,
    date: getLocalIsoDate(),
    startTime: '',
    duration: 60,
    purpose: '',
    attendees: '',
    attendeeNames: [] as string[],
    subjectCode: '',
    classSection: ''
  })

  const linkedRoom = rooms.find(room => room.id === selectedRoomInfo?.collapsibleWithRoomId)
  const bookingRoom = useMemo(() => selectedRoomInfo && reservationData.includeLinkedRoom && linkedRoom ? {
    ...selectedRoomInfo,
    capacity: selectedRoomInfo.capacity + linkedRoom.capacity,
    availableDays: selectedRoomInfo.availableDays.filter(day => linkedRoom.availableDays.includes(day)),
    startTime: selectedRoomInfo.startTime > linkedRoom.startTime ? selectedRoomInfo.startTime : linkedRoom.startTime,
    endTime: selectedRoomInfo.endTime < linkedRoom.endTime ? selectedRoomInfo.endTime : linkedRoom.endTime,
    minBookingMins: Math.max(selectedRoomInfo.minBookingMins, linkedRoom.minBookingMins),
    maxBookingMins: (() => {
      const limits = [selectedRoomInfo.maxBookingMins, linkedRoom.maxBookingMins].filter(limit => limit > 0)
      return limits.length ? Math.min(...limits) : 0
    })(),
  } : selectedRoomInfo, [selectedRoomInfo, reservationData.includeLinkedRoom, linkedRoom])
  const bookedRoomIds = useMemo(() => selectedRoomInfo
    ? [selectedRoomInfo.id, ...(reservationData.includeLinkedRoom && selectedRoomInfo.collapsibleWithRoomId ? [selectedRoomInfo.collapsibleWithRoomId] : [])]
    : [], [selectedRoomInfo, reservationData.includeLinkedRoom])
  const sharedAvailableDays = selectedRoomInfo && linkedRoom
    ? selectedRoomInfo.availableDays.filter(day => linkedRoom.availableDays.includes(day)) : []
  const canCombineRooms = Boolean(selectedRoomInfo && linkedRoom
    && selectedRoomInfo.status === 'Available' && linkedRoom.status === 'Available'
    && sharedAvailableDays.length > 0
    && Math.min(reservationTimeMinutes(selectedRoomInfo.endTime), reservationTimeMinutes(linkedRoom.endTime))
      - Math.max(reservationTimeMinutes(selectedRoomInfo.startTime), reservationTimeMinutes(linkedRoom.startTime))
      >= Math.max(30, selectedRoomInfo.minBookingMins, linkedRoom.minBookingMins))

  const busyIntervals = useMemo<{ start: number; end: number }[]>(() => {
    if (!bookingRoom || !reservationData.date) return []
    const intervals: { start: number; end: number }[] = []

    const timeToMins = (t: string) => {
      if (!t) return 0
      const [h, m] = t.split(':').map(Number)
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
    }

    // 1. Existing Reservations for this room on this date
    reservations.forEach((r: any) => {
      if (
        bookedRoomIds.some(roomId => reservationUsesRoom(r, roomId)) &&
        r.date === reservationData.date &&
        ['Pending', 'Approved'].includes(r.status) &&
        r.startTime &&
        r.endTime
      ) {
        intervals.push({
          start: timeToMins(r.startTime),
          end: timeToMins(r.endTime)
        })
      }
    })

    // 2. Class Schedules for this room on this day of the week
    const [y, m, d] = reservationData.date.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const targetDay = dayAbbrs[dateObj.getDay()]

    schedules.forEach((s: any) => {
      if (
        bookedRoomIds.includes(s.roomId) &&
        s.startTime &&
        s.endTime &&
        Array.isArray(s.days) &&
        s.days.some((dayStr: string) => normalizeDay(dayStr) === targetDay)
      ) {
        intervals.push({
          start: timeToMins(s.startTime),
          end: timeToMins(s.endTime)
        })
      }
    })

    return intervals
  }, [bookingRoom, reservationData.date, reservations, schedules, bookedRoomIds])

  const isStartTimeDisabled = useCallback((timeStr: string) => {
    if (!timeStr || !bookingRoom) return false
    const [h, m] = timeStr.split(':').map(Number)
    const startMins = h * 60 + m
    const minBookingMins = Math.max(30, bookingRoom.minBookingMins || 30)
    const proposedEndMins = startMins + minBookingMins

    // Check if proposed start time or minimal booking window conflicts with any busy interval
    return busyIntervals.some(interval => {
      return interval.start < proposedEndMins && interval.end > startMins
    })
  }, [bookingRoom, busyIntervals])

  const getFirstAvailableStartTime = useCallback((
    dateStr: string,
    room: Room,
    customBusy?: { start: number; end: number }[]
  ) => {
    const timeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
    }

    const minBookingMins = Math.max(30, room.minBookingMins || 30)
    const roomStart = room.startTime || '07:30'
    const roomEnd = room.endTime || '18:00'
    const roomStartMins = timeToMins(roomStart)
    const roomEndMins = timeToMins(roomEnd)
    const maxStartMins = roomEndMins - minBookingMins

    let minStartMins = roomStartMins
    if (dateStr === getLocalIsoDate()) {
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      minStartMins = Math.max(roomStartMins, Math.ceil((nowMins + 120) / 30) * 30)
    }

    const activeBusy = customBusy || busyIntervals

    for (let t = minStartMins; t <= maxStartMins; t += 30) {
      const endT = t + minBookingMins
      const isConflict = activeBusy.some(b => b.start < endT && b.end > t)
      if (!isConflict) {
        const h = Math.floor(t / 60).toString().padStart(2, '0')
        const m = (t % 60).toString().padStart(2, '0')
        return `${h}:${m}`
      }
    }
    return null
  }, [busyIntervals])

  const durationOptions = useMemo(() => {
    if (!bookingRoom) return []
    const options = []
    const min = Math.max(30, bookingRoom.minBookingMins || 30)
    const max = maxReservationDuration(bookingRoom, reservationData.startTime, reservationData.requestType, busyIntervals)

    for (let i = min; i <= max; i += 30) {
      options.push(i.toString())
    }
    return options
  }, [bookingRoom, reservationData.startTime, reservationData.requestType, busyIntervals])

  const extendedEndTime = reservationData.startTime && reservationData.duration > 0
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + reservationData.duration)
    : ''
  const extendedMinEndTime = bookingRoom && reservationData.startTime
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + Math.max(30, bookingRoom.minBookingMins || 30))
    : '07:30'
  const extendedMaxDuration = bookingRoom
    ? maxReservationDuration(bookingRoom, reservationData.startTime, 'Extended', busyIntervals)
    : 0
  const extendedMaxEndTime = reservationData.startTime
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + extendedMaxDuration)
    : bookingRoom?.endTime || '18:00'

  const computedMaxStartTime = useMemo(() => {
    if (!bookingRoom) return '17:30'
    const endTime = bookingRoom.endTime || '18:00'
    const [eh, em] = endTime.split(':').map(Number)
    if (isNaN(eh) || isNaN(em)) return '17:30'
    
    const minMins = Math.max(30, bookingRoom.minBookingMins || 30)
    const totalEndMins = eh * 60 + em
    
    const [sh, sm] = (bookingRoom.startTime || '07:30').split(':').map(Number)
    const minStartMins = isNaN(sh) || isNaN(sm) ? 450 : sh * 60 + sm
    
    const maxStartMins = Math.max(minStartMins, totalEndMins - minMins)
    const maxH = Math.floor(maxStartMins / 60).toString().padStart(2, '0')
    const maxM = (maxStartMins % 60).toString().padStart(2, '0')
    return `${maxH}:${maxM}`
  }, [bookingRoom])

  const computedMinStartTime = useMemo(() => {
    const roomStart = bookingRoom?.startTime || '07:30'
    const [sh, sm] = roomStart.split(':').map(Number)
    const roomStartMins = isNaN(sh) || isNaN(sm) ? 450 : sh * 60 + sm

    if (reservationData.date === getLocalIsoDate()) {
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const roundedMinMins = Math.ceil((nowMins + 120) / 30) * 30
      const effectiveMinMins = Math.max(roomStartMins, roundedMinMins)
      const h = Math.floor(effectiveMinMins / 60).toString().padStart(2, '0')
      const m = (effectiveMinMins % 60).toString().padStart(2, '0')
      return `${h}:${m}`
    }

    return roomStart
  }, [bookingRoom, reservationData.date])

  const minReservationDate = useMemo(() => {
    if (!bookingRoom) return getLocalIsoDate()
    const minMins = Math.max(30, bookingRoom.minBookingMins || 30)
    const [eh, em] = (bookingRoom.endTime || '18:00').split(':').map(Number)
    const [sh, sm] = (bookingRoom.startTime || '07:30').split(':').map(Number)
    const endMins = (isNaN(eh) || isNaN(em)) ? 1080 : eh * 60 + em
    const startMins = (isNaN(sh) || isNaN(sm)) ? 450 : sh * 60 + sm
    const maxStartMins = Math.max(startMins, endMins - minMins)

    const now = new Date()
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const todayMinStartMins = Math.max(startMins, Math.ceil((nowMins + 120) / 30) * 30)

    if (todayMinStartMins > maxStartMins) {
      const tomorrow = new Date(now)
      tomorrow.setDate(now.getDate() + 1)
      return getLocalIsoDate(tomorrow)
    }
    return getLocalIsoDate(now)
  }, [bookingRoom])

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const reservationFormRef = useRef<HTMLDivElement>(null)
  const [reservationFormHeight, setReservationFormHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!isReservationModalOpen || userRole !== 'Instructor' || !selectedRoomInfo) return
    const form = reservationFormRef.current
    if (!form) return

    const syncHeight = () => setReservationFormHeight(form.getBoundingClientRect().height)
    syncHeight()
    const observer = new ResizeObserver(syncHeight)
    observer.observe(form)
    return () => observer.disconnect()
  }, [isReservationModalOpen, selectedRoomInfo, userRole])
  const [isRoomRulesModalOpen, setIsRoomRulesModalOpen] = useState(false)
  const [rulesAccepted, setRulesAccepted] = useState(false)
  const attendeeFieldCount = Number.isInteger(Number(reservationData.attendees)) && Number(reservationData.attendees) > 0
    ? Math.max(0, Math.min(Number(reservationData.attendees), bookingRoom?.capacity || 0) - 1)
    : 0
  const firstAvailableStartTime = useMemo(() => {
    if (!bookingRoom || !reservationData.date) return null
    return getFirstAvailableStartTime(reservationData.date, bookingRoom)
  }, [bookingRoom, reservationData.date, getFirstAvailableStartTime])
  const isDateFull = Boolean(bookingRoom && reservationData.date && firstAvailableStartTime === null)

  // Keep the selection valid when live reservations or class schedules change.
  useEffect(() => {
    if (!isReservationModalOpen || !bookingRoom) return
    setReservationData(prev => {
      const nextStartTime = firstAvailableStartTime === null
        ? ''
        : !prev.startTime || prev.startTime < computedMinStartTime || prev.startTime > computedMaxStartTime || isStartTimeDisabled(prev.startTime)
          ? firstAvailableStartTime
          : prev.startTime
      if (nextStartTime === prev.startTime) return prev
      return { ...prev, startTime: nextStartTime, duration: prev.requestType === 'Standard'
        ? longestStandardDuration(bookingRoom, nextStartTime, busyIntervals)
        : Math.max(30, bookingRoom.minBookingMins || 30) }
    })
  }, [isReservationModalOpen, bookingRoom, firstAvailableStartTime, computedMinStartTime, computedMaxStartTime, isStartTimeDisabled, busyIntervals])

  const [successDetails, setSuccessDetails] = useState<{
    roomName: string
    roomType: string
    buildingName: string
    floor: number
    date: string
    startTime: string
    endTime: string
    duration: number
    attendees: number
    purpose: string
    requestType: ReservationRequestType
    autoApprovedByRole: 'Admin' | 'University Administrator' | null
    registrarPreRecommended: boolean
  } | null>(null)
  const [roomInfoSource, setRoomInfoSource] = useState<'main' | 'searchResults'>('main')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})

  const [snackbar, setSnackbar] = useState<{
    isOpen: boolean
    message: string
    title?: string
    type: 'error' | 'warning' | 'info' | 'success' | 'brand'
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'error'
  })

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand' = 'error', title?: string) => {
    setSnackbar({
      isOpen: true,
      message,
      title,
      type
    })
  }

  const toggleReservationAvailability = async (nextValue: boolean) => {
    if (!canManageReservationAvailability || isUpdatingReservationAvailability) return
    if (nextValue === isReservationEnabled) return
    setIsUpdatingReservationAvailability(true)
    try {
      await setDoc(reservationAvailabilityRef, {
        isReservationEnabled: nextValue,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || '',
      }, { merge: true })
      showNotification(
        nextValue ? 'Room reservations are now available to everyone.' : 'Room reservations are now unavailable to everyone.',
        nextValue ? 'success' : 'warning',
        nextValue ? 'Reservations Enabled' : 'Reservations Disabled',
      )
    } catch (error) {
      console.error('Error updating reservation availability:', error)
      showNotification('Unable to update room reservation availability. Please try again.', 'error', 'Update Failed')
    } finally {
      setIsUpdatingReservationAvailability(false)
    }
  }

  const [isFindRoomModalOpen, setIsFindRoomModalOpen] = useState(false)
  const [isSearchResultsModalOpen, setIsSearchResultsModalOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<Room[]>([])
  const [findRoomData, setFindRoomData] = useState({
    building: '',
    floor: '',
    capacity: '',
    roomType: '',
    amenities: [] as string[],
    date: '',
    startTime: '',
    duration: '' as number | ''
  })

  const findRoomMinStartTime = useMemo(() => {
    if (findRoomData.date === getLocalIsoDate()) {
      const now = new Date()
      const nowMins = now.getHours() * 60 + now.getMinutes()
      const roundedMinMins = Math.ceil((nowMins + 120) / 30) * 30
      const effectiveMinMins = Math.max(450, roundedMinMins)
      const h = Math.floor(effectiveMinMins / 60).toString().padStart(2, '0')
      const m = (effectiveMinMins % 60).toString().padStart(2, '0')
      return `${h}:${m}`
    }
    return '07:30'
  }, [findRoomData.date])

  useEffect(() => {
    if (isReservationModalOpen) {
      setFormErrors({})
      setIsSubmitting(false)
    }
  }, [isReservationModalOpen])

  useEffect(() => {
    if (isReservationModalOpen && reservationData.requestType === 'Standard' && durationOptions.length > 0) {
      if (!durationOptions.includes(reservationData.duration.toString())) {
        setReservationData(prev => ({ ...prev, duration: parseInt(durationOptions[durationOptions.length - 1], 10) }))
      }
    }
  }, [isReservationModalOpen, durationOptions, reservationData.duration, reservationData.requestType])

  useEffect(() => {
    const buildingsQuery = query(collection(db, 'buildings'), orderBy('createdAt', 'desc'))
    const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'))

    let buildingsList: any[] = []
    let roomsList: any[] = []
    let buildingsLoaded = false
    let roomsLoaded = false

    const updateState = () => {
      const mergedBuildings = buildingsList.map(building => {
        const buildingRooms = roomsList.filter(room => room.buildingId === building.id)
        const capacity = buildingRooms.reduce((sum, room) => sum + (room.capacity || 0), 0)
        const floor = buildingRooms.length > 0 
          ? Math.max(...buildingRooms.map(room => room.floor || 0)) 
          : 0

        return {
          ...building,
          rooms: buildingRooms,
          floor,
          capacity,
        }
      }) as Building[]
      
      setBuildings(mergedBuildings)
      setRooms(roomsList)

      if (buildingsLoaded && roomsLoaded) {
        setIsLoading(false)
      }

      const currentIds = mergedBuildings.map(b => b.id)

      // Auto-expand ONLY for buildings added after the initial data fetch
      if (!isInitialLoad.current) {
        const newIds = currentIds.filter(id => !knownBuildingIds.current.has(id))
        if (newIds.length > 0) {
          setExpandedBuildingIds(prev => [...prev, ...newIds])
        }
      } else if (mergedBuildings.length > 0) {
        isInitialLoad.current = false
      }

      // Update known IDs for next time
      knownBuildingIds.current = new Set(currentIds)
    }

    const unsubscribeBuildings = onSnapshot(buildingsQuery, (snapshot) => {
      buildingsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      buildingsLoaded = true
      updateState()
    }, (error) => {
      console.error("Error fetching buildings:", error)
      buildingsLoaded = true
      updateState()
    })

    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      roomsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      roomsLoaded = true
      updateState()
    }, (error) => {
      console.error("Error fetching rooms:", error)
      roomsLoaded = true
      updateState()
    })

    const unsubscribeReservations = onSnapshot(collection(db, 'reservations'), (snapshot) => {
      setReservations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
    }, (error) => {
      console.error("Error fetching reservations:", error)
    })

    const unsubscribeSchedules = onSnapshot(collection(db, 'schedules'), (snapshot) => {
      setSchedules(scheduleMeetingRecords(snapshot.docs))
    }, (error) => {
      console.error("Error fetching schedules:", error)
    })

    return () => {
      unsubscribeBuildings()
      unsubscribeRooms()
      unsubscribeReservations()
      unsubscribeSchedules()
    }
  }, [])

  useEffect(() => {
    let unsubscribeMembership: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeMembership?.()
      unsubscribeMembership = undefined
      setReservationMembership(null)
      setMembershipLoadError(false)
      setIsMembershipLoading(Boolean(user))
      if (!user) return

      const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid))
      unsubscribeMembership = onSnapshot(membershipQuery, snapshot => {
        if (auth.currentUser?.uid !== user.uid) return
        const membershipDoc = snapshot.docs.find(record => record.data().role === userRole && record.data().status === 'accepted')
        const department = membershipDoc?.data().department
        setReservationMembership(membershipDoc && typeof department === 'string' && department.trim()
          ? { id: membershipDoc.id, userId: user.uid, department: department.trim() }
          : null)
        setMembershipLoadError(false)
        setIsMembershipLoading(false)
      }, error => {
        if (auth.currentUser?.uid !== user.uid) return
        console.error('Error fetching reservation membership:', error)
        setReservationMembership(null)
        setMembershipLoadError(true)
        setIsMembershipLoading(false)
      })
    })

    return () => {
      unsubscribeAuth()
      unsubscribeMembership?.()
    }
  }, [userRole])

  const toggleBuilding = (id: string) => {
    setExpandedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleOpenReservationModal = (room: Room, selectedSlot?: ScheduleSlotSelection) => {
    if (!canCreateReservation) return
    if (isReservationAvailabilityLoading || !isReservationEnabled) {
      showNotification('Room reservations are currently unavailable. Please try again later.', 'warning', 'Reservations Unavailable')
      return
    }

    setSelectedRoomInfo(room)
    setSelectedRoomForSchedule(room)
    setIsReservationModalOpen(true)
    setIsRoomInfoModalOpen(false)
    setIsRoomScheduleModalOpen(false)

    const minBookingMins = Math.max(30, room.minBookingMins || 30)
    const roomStart = room.startTime || '07:30'
    const roomEnd = room.endTime || '18:00'

    const timeToMins = (t: string) => {
      const [h, m] = t.split(':').map(Number)
      return isNaN(h) || isNaN(m) ? 0 : h * 60 + m
    }

    const startMins = timeToMins(roomStart)
    const endMins = timeToMins(roomEnd)
    const maxStartMins = Math.max(startMins, endMins - minBookingMins)

    const now = new Date()
    const nowMins = now.getHours() * 60 + now.getMinutes()
    const todayMinStartMins = Math.max(startMins, Math.ceil((nowMins + 120) / 30) * 30)
    const isTodayPastCutoff = todayMinStartMins > maxStartMins

    const initialDate = selectedSlot?.date || getEarliestAvailableDate(room.availableDays, isTodayPastCutoff)

    const initialBusy: { start: number; end: number }[] = []
    reservations.forEach((r: any) => {
      if (
        reservationUsesRoom(r, room.id) &&
        r.date === initialDate &&
        ['Pending', 'Approved'].includes(r.status) &&
        r.startTime &&
        r.endTime
      ) {
        initialBusy.push({ start: timeToMins(r.startTime), end: timeToMins(r.endTime) })
      }
    })
    const [y, m, d] = initialDate.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const targetDay = dayAbbrs[dateObj.getDay()]
    schedules.forEach((s: any) => {
      if (
        s.roomId === room.id &&
        s.startTime &&
        s.endTime &&
        Array.isArray(s.days) &&
        s.days.some((dayStr: string) => normalizeDay(dayStr) === targetDay)
      ) {
        initialBusy.push({ start: timeToMins(s.startTime), end: timeToMins(s.endTime) })
      }
    })

    const firstValid = getFirstAvailableStartTime(initialDate, room, initialBusy)
    const initialStart = selectedSlot?.startTime || firstValid || ''

    setReservationData({
      requestType: 'Standard',
      includeLinkedRoom: false,
      date: initialDate,
      startTime: initialStart,
      duration: longestStandardDuration(room, initialStart, initialBusy),
      purpose: '',
      attendees: '',
      attendeeNames: [],
      subjectCode: '',
      classSection: ''
    })
  }

  const handleCloseModals = () => {
    setIsRoomRulesModalOpen(false)
    setRulesAccepted(false)
    setIsRoomInfoModalOpen(false)
    setIsReservationModalOpen(false)
    setIsFindRoomModalOpen(false)
    setIsSearchResultsModalOpen(false)
    setIsRoomScheduleModalOpen(false)
    setSelectedRoomInfo(null)
    setSelectedRoomForSchedule(null)
    setScheduleSlotSelection(null)
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const allAmenities = useMemo(() => Array.from(new Set(allRooms.flatMap(r => r.amenities))).sort(), [allRooms])
  
  const selectedBuildingObj = useMemo(() => buildings.find(b => b.code === findRoomData.building), [buildings, findRoomData.building])
  const floorOptions = useMemo(() => {
    if (!selectedBuildingObj) return []
    const floors = new Set(selectedBuildingObj.rooms.map(r => r.floor))
    return Array.from(floors).sort((a, b) => a - b).map(String)
  }, [selectedBuildingObj])
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)
  const currentRoomInfo = rooms.find(room => room.id === selectedRoomInfo?.id) || selectedRoomInfo

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Find Room Modal */}
      {isFindRoomModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto flex w-full max-w-5xl flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-center">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold leading-tight">Find a Room</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Specify your requirements to find the perfect room</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Building</label>
                  <SingleSelectDropdown
                    options={['Any Building', ...buildingOptions]}
                    value={findRoomData.building || 'Any Building'}
                    onChange={(val) => setFindRoomData({ 
                      ...findRoomData, 
                      building: val === 'Any Building' ? '' : val,
                      floor: ''
                    })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Floor</label>
                    <SingleSelectDropdown
                      options={selectedBuildingObj ? ['Any Floor', ...floorOptions] : ['Select Bldg First']}
                      value={!selectedBuildingObj ? 'Select Bldg First' : (findRoomData.floor || 'Any Floor')}
                      isDisabled={!selectedBuildingObj}
                      onChange={(val) => {
                        if (val !== 'Select Bldg First') {
                          setFindRoomData({ ...findRoomData, floor: val === 'Any Floor' ? '' : val })
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Room Type</label>
                    <SingleSelectDropdown
                      options={['Any Type', 'Lecture', 'Laboratory']}
                      value={findRoomData.roomType || 'Any Type'}
                      onChange={(val) => setFindRoomData({ ...findRoomData, roomType: val === 'Any Type' ? '' : val })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Date</label>
                    <DatePicker
                      value={findRoomData.date}
                      onChange={(date) => setFindRoomData({ ...findRoomData, date })}
                      minDate={getLocalIsoDate()}
                      maxDate={maxAllowedDate}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Start Time</label>
                    <TimePicker 
                      value={findRoomData.startTime}
                      onChange={(time) => {
                        let newDuration = findRoomData.duration;
                        if (time && newDuration) {
                          const [h, m] = time.split(':').map(Number);
                          const startMins = h * 60 + m;
                          const slotBoundaries = [450, 540, 630, 720, 810, 900, 990, 1080];
                          for (let i = 0; i < slotBoundaries.length - 1; i++) {
                            if (startMins >= slotBoundaries[i] && startMins < slotBoundaries[i+1]) {
                              const maxAllowed = slotBoundaries[i+1] - startMins;
                              if (newDuration > maxAllowed) newDuration = maxAllowed;
                              break;
                            }
                          }
                        }
                        setFindRoomData({ ...findRoomData, startTime: time, duration: newDuration })
                      }}
                      minTime={findRoomMinStartTime}
                      maxTime="17:30"
                      minuteStep={30}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Duration (mins)</label>
                    <SingleSelectDropdown
                      options={(() => {
                        let max = 90;
                        if (findRoomData.startTime) {
                          const [h, m] = findRoomData.startTime.split(':').map(Number);
                          const startMins = h * 60 + m;
                          const slotBoundaries = [450, 540, 630, 720, 810, 900, 990, 1080];
                          for (let i = 0; i < slotBoundaries.length - 1; i++) {
                            if (startMins >= slotBoundaries[i] && startMins < slotBoundaries[i+1]) {
                              max = Math.min(max, slotBoundaries[i+1] - startMins);
                              break;
                            }
                          }
                        }
                        const opts = ['Any Duration'];
                        if (max >= 30) opts.push('30 mins');
                        if (max >= 60) opts.push('60 mins');
                        if (max >= 90) opts.push('90 mins');
                        return opts;
                      })()}
                      value={(() => {
                        if (!findRoomData.duration) return 'Any Duration'
                        const mins = Number(findRoomData.duration)
                        if (mins === 30) return '30 mins'
                        if (mins === 60) return '60 mins'
                        if (mins === 90) return '90 mins'
                        return `${mins} mins`
                      })()}
                      onChange={(val) => {
                        if (val === 'Any Duration') {
                          setFindRoomData({ ...findRoomData, duration: '' })
                        } else {
                          const parsed = parseInt(val, 10)
                          setFindRoomData({ ...findRoomData, duration: isNaN(parsed) ? '' : parsed })
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Capacity</label>
                    <NumberInput
                      min={1}
                      value={findRoomData.capacity}
                      onChange={(val) => setFindRoomData({ ...findRoomData, capacity: val })}
                      icon={<UserIcon className="h-4.5 w-4.5 text-gray-400" />}
                      placeholder="Min capacity"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 mb-2.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Room Amenities</label>
                    {findRoomData.amenities.length > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-color)] text-[0.625rem] font-bold text-white">
                        {findRoomData.amenities.length}
                      </span>
                    )}
                  </div>
                  <RoomAmenities
                    amenities={allAmenities}
                    selectedAmenities={findRoomData.amenities}
                    onToggleAmenity={(amenity) => {
                      setFindRoomData(prev => ({
                        ...prev,
                        amenities: prev.amenities.includes(amenity)
                          ? prev.amenities.filter(a => a !== amenity)
                          : [...prev.amenities, amenity]
                      }))
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCloseModals}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  className="flex-1"
                  icon={<SearchIcon className="h-4 w-4" />}
                  onClick={() => {
                    const capacityReq = parseInt(findRoomData.capacity) || 0
                    const buildingReq = findRoomData.building ? buildings.find(b => b.code === findRoomData.building)?.id : null
                    
                    const filtered = allRooms.filter(room => {
                      if (buildingReq && room.buildingId !== buildingReq) return false
                      if (capacityReq && (room.capacity || 0) < capacityReq) return false
                      if (findRoomData.roomType && room.type !== findRoomData.roomType) return false
                      if (findRoomData.floor && room.floor !== parseInt(findRoomData.floor)) return false
                      if (findRoomData.amenities.length > 0) {
                        const hasAll = findRoomData.amenities.every(a => room.amenities?.includes(a))
                        if (!hasAll) return false
                      }
                      if (findRoomData.date) {
                        const [y, m, d] = findRoomData.date.split('-').map(Number)
                        const dateObj = new Date(y, m - 1, d)
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                        const dayName = dayNames[dateObj.getDay()]
                        if (room.availableDays && !room.availableDays.includes(dayName)) return false
                      }
                      return true
                    })
                    
                    setSearchResults(filtered)
                    setIsFindRoomModalOpen(false)
                    setIsSearchResultsModalOpen(true)
                  }}
                >
                  Find Room
                </Button>
              </div>
            </div>
          </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={handleCloseModals} 
          />
        </div>
      )}

      {/* Search Results Modal */}
      {isSearchResultsModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-[80vw] h-[80vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white shrink-0">
              <h3 className="text-xl font-bold leading-tight">Search Results</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Found {searchResults.length} {searchResults.length === 1 ? 'room' : 'rooms'} matching your criteria</p>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {searchResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="bg-white h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                    <SearchIcon className="h-8 w-8 text-slate-300" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-700">No rooms found</h4>
                  <p className="text-sm text-slate-500 mt-1">Try adjusting your search criteria</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(
                    searchResults.reduce((acc, room) => {
                      const bId = room.buildingId || 'unknown';
                      if (!acc[bId]) {
                        acc[bId] = []
                      }
                      acc[bId].push(room)
                      return acc
                    }, {} as Record<string, Room[]>)
                  ).map(([buildingId, buildingRooms]) => {
                    const building = buildings.find(b => b.id === buildingId)
                    return (
                      <div key={buildingId} className="space-y-4">
                        <div className="flex items-center gap-4">
                          <h4 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">
                            {building?.name || 'Unknown Building'}
                          </h4>
                          <div className="h-1 flex-1 bg-gray-200" />
                        </div>
                        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                          {buildingRooms.map(room => (
                            <div
                              key={room.id}
                              onClick={() => {
                                setIsSearchResultsModalOpen(false)
                                setRoomInfoSource('searchResults')
                                handleOpenRoomInfoModal(room)
                              }}
                              className="flex rounded-2xl border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02] cursor-pointer"
                            >
                              <img
                                src={room.image}
                                alt={room.name}
                                className="aspect-square w-28 h-28 shrink-0 object-cover grayscale-[0.2] rounded-l-2xl sm:w-32 sm:h-32"
                                onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                              />

                              <div className="flex flex-1 flex-col justify-between p-3.5 min-w-0">
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 mt-1 truncate">
                                      <h5 className="text-base font-bold leading-tight text-gray-900 truncate">
                                        {room.name}
                                      </h5>
                                      {room.floor && (
                                        <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md">
                                          Flr {room.floor}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                                    {room.type}
                                  </p>
                                </div>

                                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-gray-200 shrink-0">
                                      <UserIcon className="h-4 w-4 text-gray-500" />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700">
                                      {room.capacity} pax
                                    </span>
                                  </div>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-widest ${roomStatusClasses[room.status || 'Available']}`}
                                  >
                                    {room.status || 'Available'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-white shrink-0 flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setIsSearchResultsModalOpen(false)
                  setIsFindRoomModalOpen(true)
                }}
              >
                Back to Search
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsSearchResultsModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => setIsSearchResultsModalOpen(false)} 
          />
        </div>
      )}

      {/* Room Information Modal */}
      <RoomInfoModal
        isOpen={isRoomInfoModalOpen}
        room={currentRoomInfo}
        onClose={handleCloseModals}
        onBack={roomInfoSource === 'searchResults' ? () => {
          setIsRoomInfoModalOpen(false)
          setIsSearchResultsModalOpen(true)
        } : undefined}
        actionButton={
          <Button
            variant="brand"
            icon={<CalendarIcon className="h-4 w-4" />}
            className="flex-1"
            onClick={() => {
              if (!selectedRoomInfo) return
              setSelectedRoomForSchedule(selectedRoomInfo)
              setIsRoomScheduleModalOpen(true)
              setIsRoomInfoModalOpen(false)
            }}
          >
            Room Schedule
          </Button>
        }
      />

      {/* Room Schedule Timetable Modal */}
      <RoomScheduleModal
        isOpen={isRoomScheduleModalOpen}
        room={selectedRoomForSchedule}
        buildingName={
          buildings.find(b => b.rooms.some(r => r.id === selectedRoomForSchedule?.id))?.name
        }
        hideFilters={true}
        showWeekCalendar={true}
        showStatusColors={false}
        onReserveFreeSlot={
          canCreateReservation && selectedRoomForSchedule?.status === 'Available' && isReservationEnabled && !isReservationAvailabilityLoading
            ? slot => {
              setScheduleSlotSelection(slot)
              setRulesAccepted(false)
              setIsRoomRulesModalOpen(true)
            }
            : undefined
        }
        onClose={handleCloseModals}
        onBack={() => {
          setIsRoomScheduleModalOpen(false)
          if (selectedRoomForSchedule) {
            setSelectedRoomInfo(selectedRoomForSchedule)
            setIsRoomInfoModalOpen(true)
          }
        }}
        actionButton={
          canCreateReservation && selectedRoomForSchedule?.status === 'Available' && isReservationEnabled && !isReservationAvailabilityLoading ? (
            <Button
              type="button"
              variant="brand"
              onClick={() => {
                if (selectedRoomForSchedule) {
                  setScheduleSlotSelection(null)
                  setRulesAccepted(false)
                  setIsRoomRulesModalOpen(true)
                }
              }}
              icon={<DoorIcon className="h-4 w-4" />}
              className="w-45 px-4 text-sm flex items-center justify-center gap-2"
            >
              Reserve Room
            </Button>
          ) : null
        }
      />

      {/* Room-use rules before the reservation form */}
      {isRoomRulesModalOpen && selectedRoomForSchedule && (
        <div role="dialog" aria-modal="true" aria-labelledby="room-rules-dialog-title" className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <h3 id="room-rules-dialog-title" className="mb-4 text-lg font-bold text-slate-900">Before reserving {selectedRoomForSchedule.name}</h3>
            <RoomUsageRules accepted={rulesAccepted} onAcceptedChange={setRulesAccepted} />
            <div className="mt-5 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIsRoomRulesModalOpen(false)}>Back to Schedule</Button>
              <Button
                variant="brand"
                className="flex-1"
                disabled={!rulesAccepted}
                onClick={() => {
                  handleOpenReservationModal(selectedRoomForSchedule, scheduleSlotSelection || undefined)
                  setScheduleSlotSelection(null)
                  setIsRoomRulesModalOpen(false)
                }}
              >
                Continue to Reservation
              </Button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onMouseDown={() => setIsRoomRulesModalOpen(false)} />
        </div>
      )}

      {/* Reservation Modal */}
      {canCreateReservation && isReservationModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/50 p-4 lg:items-center">
          <div className="my-auto flex w-full max-w-lg flex-col items-start justify-center gap-4 lg:max-w-[54rem] lg:flex-row">
          <div ref={reservationFormRef} className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar rounded-2xl">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold leading-tight">Reserve {selectedRoomInfo.name}</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Fill in the details to book this room</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                {selectedRoomInfo.collapsibleWithRoomId && (
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-bold uppercase tracking-widest text-gray-500">Room setup</legend>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input type="radio" name="reservation-room-setup" checked={!reservationData.includeLinkedRoom}
                        onChange={() => setReservationData(prev => ({ ...prev, includeLinkedRoom: false, startTime: '' }))}
                        className="h-4 w-4 accent-[var(--brand-color)]" />
                      {selectedRoomInfo.code} only
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input type="radio" name="reservation-room-setup" checked={reservationData.includeLinkedRoom}
                        disabled={!canCombineRooms}
                        onChange={() => setReservationData(prev => ({ ...prev, includeLinkedRoom: true,
                          date: sharedAvailableDays.includes(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${prev.date}T00:00:00`).getDay()])
                            ? prev.date : getEarliestAvailableDate(sharedAvailableDays), startTime: '' }))}
                        className="h-4 w-4 accent-[var(--brand-color)]" />
                      Both rooms: {selectedRoomInfo.code} + {linkedRoom?.code || 'linked room'}
                    </label>
                    {!canCombineRooms && <p className="text-xs text-amber-700">The linked room is not currently available for a combined reservation.</p>}
                  </fieldset>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Reservation type</label>
                  <SingleSelectDropdown
                    options={['Standard', 'Extended']}
                    value={reservationData.requestType}
                    onChange={(value) => {
                      setReservationData(prev => ({ ...prev, requestType: value === 'Extended' ? 'Extended' : 'Standard' }))
                      setFormErrors(prev => ({ ...prev, duration: false }))
                    }}
                  />
                  {reservationData.requestType === 'Extended' && (
                    <p className="text-xs text-slate-500">Longer bookings require Dean and Registrar recommendations, then University Administrator approval, and must fit within the room's available hours without conflicts.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Date Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Date <span className="text-rose-500">*</span></label>
                    <DatePicker
                      value={reservationData.date}
                      onChange={(date) => {
                        let newStartTime = ''
                        let newDuration = reservationData.duration
                        if (bookingRoom) {
                          const newBusy: { start: number; end: number }[] = []
                          const timeToMins = (t: string) => {
                            const [h, m] = t.split(':').map(Number)
                            return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
                          }
                          reservations.forEach((r: any) => {
                            if (
                              bookedRoomIds.some(roomId => reservationUsesRoom(r, roomId)) &&
                              r.date === date &&
                              ['Pending', 'Approved'].includes(r.status) &&
                              r.startTime &&
                              r.endTime
                            ) {
                              newBusy.push({ start: timeToMins(r.startTime), end: timeToMins(r.endTime) })
                            }
                          })
                          const [y, m, d] = date.split('-').map(Number)
                          const dateObj = new Date(y, m - 1, d)
                          const dayAbbrs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                          const targetDay = dayAbbrs[dateObj.getDay()]
                          schedules.forEach((s: any) => {
                            if (
                              bookedRoomIds.includes(s.roomId) &&
                              s.startTime &&
                              s.endTime &&
                              Array.isArray(s.days) &&
                              s.days.some((dayStr: string) => normalizeDay(dayStr) === targetDay)
                            ) {
                              newBusy.push({ start: timeToMins(s.startTime), end: timeToMins(s.endTime) })
                            }
                          })

                          const firstValid = getFirstAvailableStartTime(date, bookingRoom, newBusy)
                          newStartTime = firstValid ?? ''
                          if (reservationData.requestType === 'Standard') {
                            newDuration = longestStandardDuration(bookingRoom, newStartTime, newBusy)
                          }
                        }
                        setReservationData({ ...reservationData, date, startTime: newStartTime, duration: newDuration })
                        if (date) setFormErrors(prev => ({ ...prev, date: false }))
                      }}
                      minDate={minReservationDate}
                      maxDate={maxAllowedDate}
                      allowedDays={bookingRoom?.availableDays || []}
                      hasError={formErrors.date}
                      hideClear
                    />
                  </div>

                  {/* Attendees */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Attendees <span className="text-rose-500">*</span></label>
                    <NumberInput
                      min={1}
                      max={bookingRoom?.capacity}
                      value={reservationData.attendees}
                      onChange={(val) => {
                        let finalVal = val
                        if (val !== '' && bookingRoom?.capacity) {
                          const num = Number(val)
                          if (num > bookingRoom.capacity) {
                            finalVal = bookingRoom.capacity.toString()
                          }
                        }
                        setReservationData(prev => ({
                          ...prev,
                          attendees: finalVal,
                          attendeeNames: prev.attendeeNames.slice(0, Math.max(0, (Number(finalVal) || 0) - 1))
                        }))
                        if (finalVal) setFormErrors(prev => ({ ...prev, attendees: false }))
                      }}
                      icon={<UserIcon className="h-4.5 w-4.5 text-gray-400" />}
                      placeholder={`Max ${bookingRoom?.capacity || selectedRoomInfo.capacity} pax`}
                      error={formErrors.attendees}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Start Time */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Start Time <span className="text-rose-500">*</span></label>
                    <TimePicker 
                      value={reservationData.startTime}
                      onChange={(time) => {
                        const newDuration = reservationData.requestType === 'Standard'
                          ? longestStandardDuration(bookingRoom || selectedRoomInfo, time, busyIntervals)
                          : Math.min(reservationData.duration, maxReservationDuration(bookingRoom || selectedRoomInfo, time, 'Extended', busyIntervals))
                        setReservationData({ ...reservationData, startTime: time, duration: newDuration })
                        if (time) setFormErrors(prev => ({ ...prev, startTime: false }))
                      }}
                      hasError={formErrors.startTime}
                      minuteStep={30}
                      hideClear
                      minTime={computedMinStartTime}
                      maxTime={computedMaxStartTime}
                      disabledTimes={isStartTimeDisabled}
                      placeholder={isDateFull ? 'Full' : 'Select time'}
                      disabled={isDateFull}
                    />
                  </div>

                  {/* Duration */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">{reservationData.requestType === 'Extended' ? 'End Time' : 'Duration (minutes)'} <span className="text-rose-500">*</span></label>
                    {reservationData.requestType === 'Extended' ? (
                      <TimePicker
                        value={extendedEndTime}
                        onChange={(time) => {
                          setReservationData(prev => ({ ...prev, duration: reservationTimeMinutes(time) - reservationTimeMinutes(prev.startTime) }))
                          setFormErrors(prev => ({ ...prev, duration: false }))
                        }}
                        minTime={extendedMinEndTime}
                        maxTime={extendedMaxEndTime}
                        minuteStep={30}
                        hasError={formErrors.duration}
                        disabled={isDateFull || !reservationData.startTime || extendedMaxDuration < Math.max(30, bookingRoom?.minBookingMins || 30)}
                        hideClear
                      />
                    ) : (
                      <SingleSelectDropdown
                        options={durationOptions}
                        isDisabled={isDateFull}
                        value={reservationData.duration.toString()}
                        onChange={(val) => {
                          setReservationData({ ...reservationData, duration: parseInt(val, 10) })
                          setFormErrors(prev => ({ ...prev, duration: false }))
                        }}
                        className={formErrors.duration ? '[&>button]:border-rose-500 [&>button]:ring-4 [&>button]:ring-rose-50' : ''}
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="reservation-subject-code" className="text-xs font-bold uppercase tracking-widest text-gray-500">Subject Code (optional)</label>
                    <TextInput
                      id="reservation-subject-code"
                      value={reservationData.subjectCode}
                      onChange={(subjectCode) => {
                        setReservationData(prev => ({ ...prev, subjectCode: subjectCode.toUpperCase() }))
                      }}
                      placeholder="e.g., ITE 314"
                      icon={<BookIcon className="h-4 w-4" />}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="reservation-section" className="text-xs font-bold uppercase tracking-widest text-gray-500">Section (optional)</label>
                    <TextInput
                      id="reservation-section"
                      value={reservationData.classSection}
                      onChange={(classSection) => {
                        setReservationData(prev => ({ ...prev, classSection: classSection.toUpperCase() }))
                      }}
                      placeholder="e.g., 3BSIT - 1"
                      icon={<UsersIcon className="h-4 w-4" />}
                    />
                  </div>
                </div>

                {/* Purpose */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Purpose <span className="text-rose-500">*</span></label>
                    <span className={`text-[0.625rem] font-bold tabular-nums ${formErrors.purpose ? 'text-rose-500' : 'text-gray-400'}`}>
                      {reservationData.purpose.length}/50
                    </span>
                  </div>
                  <TextAreaInput
                    value={reservationData.purpose}
                    onChange={(val) => {
                      if (val.length <= 50) {
                        setReservationData({ ...reservationData, purpose: val })
                        if (val.trim()) setFormErrors(prev => ({ ...prev, purpose: false }))
                      }
                    }}
                    icon={<ClipboardIcon className="h-4 w-4" />}
                    placeholder="e.g., Team Meeting, Study Session..."
                    error={formErrors.purpose}
                    maxLength={50}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsReservationModalOpen(false)
                    setIsRoomScheduleModalOpen(true)
                  }}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  variant="brand"
                  disabled={isSubmitting || isReservationAvailabilityLoading || !isReservationEnabled || isDateFull || !reservationData.startTime || isMembershipLoading}
                  className="flex-1"
                  onClick={async () => {
                    if (!canCreateReservation) return
                    if (isReservationAvailabilityLoading || !isReservationEnabled) {
                      showNotification('Room reservations are currently unavailable. Please try again later.', 'warning', 'Reservations Unavailable')
                      return
                    }

                    if (isDateFull) {
                      showNotification('No free time on this date. Please choose another date.', 'warning', 'Room Full')
                      return
                    }

                    if (reservationData.includeLinkedRoom && (!linkedRoom || !canCombineRooms)) {
                      showNotification('The linked room is not available for a combined reservation.', 'warning', 'Linked Room Unavailable')
                      return
                    }
                    const currentBookingRoom = bookingRoom || selectedRoomInfo

                    if (!reservationMembership || reservationMembership.userId !== auth.currentUser?.uid) {
                      showNotification(
                        membershipLoadError
                          ? 'Unable to load your department. Please refresh the page and try again.'
                          : 'Your account has no assigned department. Please contact an administrator.',
                        'error',
                        'Department Unavailable'
                      )
                      return
                    }

                    const errors: Record<string, boolean> = {}
                    if (!reservationData.date) errors.date = true
                    if (!reservationData.startTime) errors.startTime = true
                    if (!reservationData.duration || isNaN(reservationData.duration)) errors.duration = true
                    if (!reservationData.attendees || isNaN(Number(reservationData.attendees))) errors.attendees = true
                    if (!reservationData.purpose.trim()) errors.purpose = true

                    if (Object.keys(errors).length > 0) {
                      setFormErrors(errors)
                      if (errors.attendees && errors.purpose) {
                        showNotification('The Attendees and Purpose fields are required.', 'error', 'Missing Information')
                      } else if (errors.attendees) {
                        showNotification('The Attendees field is required.', 'error', 'Missing Information')
                      } else if (errors.purpose) {
                        showNotification('The Purpose field is required.', 'error', 'Missing Information')
                      } else if (errors.date) {
                        showNotification('Please select a reservation date.', 'error', 'Missing Information')
                      } else if (errors.startTime) {
                        showNotification('Please select a start time.', 'error', 'Missing Information')
                      } else {
                        showNotification('Please fill in all required fields.', 'error', 'Missing Information')
                      }
                      return
                    }

                    if (reservationData.purpose.length > 50) {
                      setFormErrors(prev => ({ ...prev, purpose: true }))
                      showNotification('Purpose must be 50 characters or fewer.', 'error', 'Invalid Purpose')
                      return
                    }

                    // 1. Attendees Capacity Validation
                    const attendeeCount = Number(reservationData.attendees)
                    if (!Number.isInteger(attendeeCount) || attendeeCount <= 0 || (currentBookingRoom.capacity && attendeeCount > currentBookingRoom.capacity)) {
                      showNotification(`Number of attendees must be between 1 and ${currentBookingRoom.capacity} pax for this room setup.`, 'warning', 'Invalid Attendees')
                      setFormErrors(prev => ({ ...prev, attendees: true }))
                      return
                    }

                    const attendeeNames = Array.from({ length: attendeeCount - 1 }, (_, index) => normalizeAttendeeName(reservationData.attendeeNames[index] || ''))
                    if (userRole === 'Instructor' && (attendeeNames.some(name => !name || name.length > 120))) {
                      showNotification("Enter other attendees' full names.", 'warning', 'Attendee Names Required')
                      setFormErrors(prev => ({ ...prev, attendeeNames: true }))
                      return
                    }

                    // 2. Duration Validation
                    if (!Number.isInteger(reservationData.duration) || reservationData.duration < Math.max(30, currentBookingRoom.minBookingMins || 30) ||
                        (reservationData.requestType === 'Standard' && reservationData.duration > (currentBookingRoom.maxBookingMins || 180))) {
                      showNotification(reservationData.requestType === 'Extended'
                        ? `Duration must be at least ${Math.max(30, currentBookingRoom.minBookingMins || 30)} minutes and end within the room's available hours.`
                        : `Duration must be between ${Math.max(30, currentBookingRoom.minBookingMins || 30)} and ${currentBookingRoom.maxBookingMins || 180} minutes.`, 'warning', 'Invalid Duration')
                      setFormErrors(prev => ({ ...prev, duration: true }))
                      return
                    }

                    // 3. Date Validation (Available Days)
                    if (reservationData.date < minReservationDate || reservationData.date > maxAllowedDate) {
                      showNotification('Please select a date within the available reservation period.', 'warning', 'Invalid Date')
                      setFormErrors(prev => ({ ...prev, date: true }))
                      return
                    }
                    const [y, m, d] = reservationData.date.split('-').map(Number)
                    const selectedDateObj = new Date(y, m - 1, d)
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    const selectedDayName = dayNames[selectedDateObj.getDay()]
                    
                    if (!currentBookingRoom.availableDays.includes(selectedDayName)) {
                      showNotification(`The room is not available on ${selectedDayName}s.`, 'warning', 'Room Unavailable')
                      setFormErrors(prev => ({ ...prev, date: true }))
                      return
                    }

                    // 3. Time Validation (Room Schedule)
                    const timeToMinutes = (timeStr: string) => {
                      const [h, m] = timeStr.split(':').map(Number)
                      return h * 60 + m
                    }

                    const startMins = timeToMinutes(reservationData.startTime)
                    const endMins = startMins + reservationData.duration
                    const roomStartMins = timeToMinutes(currentBookingRoom.startTime || '07:30')
                    const roomEndMins = timeToMinutes(currentBookingRoom.endTime || '18:00')
                    const minBookingMins = Math.max(30, currentBookingRoom.minBookingMins || 30)

                    if (!Number.isFinite(startMins) || !Number.isFinite(endMins) || endMins <= startMins
                      || startMins < roomStartMins || endMins > roomEndMins || startMins > roomEndMins - minBookingMins) {
                      showNotification(`Reservation must be within the room setup's schedule: ${currentBookingRoom.startTime} - ${currentBookingRoom.endTime}. Start time cannot be after ${computedMaxStartTime}.`, 'warning', 'Invalid Time')
                      setFormErrors(prev => ({ ...prev, startTime: true }))
                      return
                    }

                    if (reservationData.date === getLocalIsoDate()) {
                      const now = new Date()
                      const nowMins = now.getHours() * 60 + now.getMinutes()
                      if (startMins < nowMins + 120) {
                        showNotification(`Same-day reservations must be booked at least 2 hours in advance. Earliest start time is ${computedMinStartTime}.`, 'warning', 'Lead Time Required')
                        setFormErrors(prev => ({ ...prev, startTime: true }))
                        return
                      }
                    }

                    // 4. Slot boundary validation
                    const slotBoundaries = [450, 540, 630, 720, 810, 900, 990, 1080]
                    for (let i = 0; reservationData.requestType === 'Standard' && i < slotBoundaries.length - 1; i++) {
                      const slotStart = slotBoundaries[i]
                      const slotEnd = slotBoundaries[i+1]
                      if (startMins >= slotStart && startMins < slotEnd) {
                        const maxAllowedBySlot = slotEnd - startMins
                        if (reservationData.duration > maxAllowedBySlot) {
                          showNotification(`Duration exceeds the slot boundary. Maximum allowed duration for this start time is ${maxAllowedBySlot} minutes.`, 'warning', 'Slot Boundary Exceeded')
                          setFormErrors(prev => ({ ...prev, duration: true }))
                          return
                        }
                        break
                      }
                    }

                    // 5. Overlap validation with existing reservations and class schedules
                    const isOverlap = busyIntervals.some(b => {
                      return b.start < endMins && b.end > startMins
                    })

                    if (isOverlap) {
                      showNotification("The selected reservation time overlaps with an existing reservation or class schedule. Please choose a different time.", 'warning', 'Time Conflict')
                      setFormErrors(prev => ({ ...prev, startTime: true, duration: true }))
                      return
                    }

                    // Calculate End Time String
                    const endH = Math.floor(endMins / 60)
                    const endM = endMins % 60
                    const endTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`

                    try {
                      setIsSubmitting(true)
                      const userId = auth.currentUser?.uid
                      if (!userId) {
                        showNotification("You must be logged in to make a reservation.", 'error', 'Authentication Required')
                        return
                      }

                      const building = buildings.find(b => b.rooms.some(r => r.id === selectedRoomInfo.id))
                      const reservationRef = doc(collection(db, 'reservations'))
                      const existingReservations = await getDocsFromServer(query(collection(db, 'reservations'), where('date', '==', reservationData.date)))
                      const slotMinutes = Array.from({ length: Math.ceil(endMins / 30) - Math.floor(startMins / 30) },
                        (_, index) => (Math.floor(startMins / 30) + index) * 30)
                      const slotRefs = bookedRoomIds.flatMap(roomId => slotMinutes.map(minute =>
                        doc(db, 'reservationSlots', `${reservationData.date}_${roomId}_${minute}`)))

                      const submissionResult = await runTransaction(db, async (transaction) => {
                        const availabilitySnapshot = await transaction.get(reservationAvailabilityRef)
                        if (availabilitySnapshot.exists() && availabilitySnapshot.data().isReservationEnabled === false) {
                          throw new Error('RESERVATIONS_DISABLED')
                        }

                        const membershipSnapshot = await transaction.get(doc(db, 'memberships', reservationMembership.id))
                        const membership = membershipSnapshot.data()
                        const department = typeof membership?.department === 'string' ? membership.department.trim() : ''
                        if (!membershipSnapshot.exists() || membership?.userId !== userId || membership?.status !== 'accepted' || !department) {
                          throw new Error('MEMBERSHIP_DEPARTMENT_UNAVAILABLE')
                        }
                        if (!RESERVATION_CREATOR_ROLES.includes(membership.role)) {
                          throw new Error('RESERVATION_ROLE_UNAVAILABLE')
                        }
                        if (membership.role === 'Instructor' && attendeeNames.some(name => !name || name.length > 120)) {
                          throw new Error('ATTENDEE_NAMES_REQUIRED')
                        }

                        const autoApprovalRole = membership.role === 'Admin' || membership.role === 'University Administrator'
                          ? membership.role
                          : null
                        const isAutoApproved = autoApprovalRole !== null
                        const registrarPreRecommended = membership.role === 'Registrar'
                        const recommendationsComplete = isAutoApproved || registrarPreRecommended
                        const [currentRooms, currentReservations, currentSlots] = await Promise.all([
                          Promise.all(bookedRoomIds.map(roomId => transaction.get(doc(db, 'rooms', roomId)))),
                          Promise.all(existingReservations.docs.map(existing => transaction.get(existing.ref))),
                          Promise.all(slotRefs.map(slotRef => transaction.get(slotRef))),
                        ])
                        const roomRecords = currentRooms.map(snapshot => snapshot.data())
                        if (reservationData.includeLinkedRoom && (roomRecords.length !== 2
                          || roomRecords[0]?.collapsibleWithRoomId !== bookedRoomIds[1]
                          || roomRecords[1]?.collapsibleWithRoomId !== bookedRoomIds[0])) {
                          throw new Error('LINKED_ROOM_CHANGED')
                        }
                        const currentCapacity = roomRecords.reduce((total, room) => total + (Number(room?.capacity) || 0), 0)
                        if (!roomRecords.length || roomRecords.some(room => !room || room.status !== 'Available'
                          || !Array.isArray(room.availableDays) || !room.availableDays.includes(selectedDayName)
                          || startMins < reservationTimeMinutes(room.startTime || '07:30')
                          || endMins > reservationTimeMinutes(room.endTime || '18:00')
                          || reservationData.duration < Math.max(30, room.minBookingMins || 30)
                          || (reservationData.requestType === 'Standard'
                            && reservationData.duration > (room.maxBookingMins || 180)))
                          || attendeeCount > currentCapacity) {
                          throw new Error('ROOM_AVAILABILITY_CHANGED')
                        }
                        if (currentReservations.some(snapshot => {
                          const other = snapshot.data()
                          return other && ['Pending', 'Approved'].includes(other.status)
                            && bookedRoomIds.some(roomId => reservationUsesRoom(other, roomId))
                            && reservationTimeMinutes(other.startTime) < endMins
                            && reservationTimeMinutes(other.endTime) > startMins
                        })) throw new Error('BOOKING_CONFLICT')
                        const heldReservationIds = [...new Set(currentSlots.map(slot => slot.data()?.reservationId).filter((id): id is string => typeof id === 'string'))]
                        const heldReservations = await Promise.all(heldReservationIds.map(id => transaction.get(doc(db, 'reservations', id))))
                        if (heldReservations.some(snapshot => snapshot.exists() && ['Pending', 'Approved'].includes(snapshot.data().status))) {
                          throw new Error('BOOKING_CONFLICT')
                        }

                        transaction.set(reservationRef, {
                          roomId: selectedRoomInfo.id,
                          roomIds: bookedRoomIds,
                          includeLinkedRoom: reservationData.includeLinkedRoom,
                          buildingId: building?.id || '',
                          userId: userId,
                          date: reservationData.date,
                          startTime: reservationData.startTime,
                          endTime: endTimeStr,
                          duration: reservationData.duration,
                          requestType: reservationData.requestType,
                          attendees: Number(reservationData.attendees),
                          ...(membership.role === 'Instructor' ? { attendeeNames } : {}),
                          purpose: reservationData.purpose.trim(),
                          subjectCode: reservationData.subjectCode.trim().toUpperCase(),
                          classSection: reservationData.classSection.trim().toUpperCase(),
                          department,
                          status: isAutoApproved ? 'Approved' : 'Pending',
                          deanRecommend: recommendationsComplete,
                          registrarRecommend: recommendationsComplete,
                          universityAdministratorRecommend: isAutoApproved,
                          ...(recommendationsComplete ? {
                            recommendedBy: userId,
                            recommendedByRole: membership.role,
                            recommendedAt: serverTimestamp(),
                            registrarRecommendedBy: userId,
                            registrarRecommendedAt: serverTimestamp(),
                          } : {}),
                          ...(isAutoApproved ? {
                            autoApproved: true,
                            approvedBy: userId,
                            approvedByRole: autoApprovalRole,
                            approvedAt: serverTimestamp(),
                          } : {}),
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp()
                        })
                        slotRefs.forEach(slotRef => transaction.set(slotRef, {
                          reservationId: reservationRef.id, date: reservationData.date, updatedAt: serverTimestamp(),
                        }))
                        return { autoApprovedByRole: autoApprovalRole, registrarPreRecommended }
                      })

                      const submittedInfo = {
                        roomName: reservationData.includeLinkedRoom && linkedRoom
                          ? `${selectedRoomInfo.name} + ${linkedRoom.name}` : selectedRoomInfo.name,
                        roomType: selectedRoomInfo.type || 'Lecture Room',
                        buildingName: building?.name || 'Building',
                        floor: selectedRoomInfo.floor,
                        date: reservationData.date,
                        startTime: reservationData.startTime,
                        endTime: endTimeStr,
                        duration: reservationData.duration,
                        requestType: reservationData.requestType,
                        attendees: Number(reservationData.attendees),
                        purpose: reservationData.purpose.trim(),
                        autoApprovedByRole: submissionResult.autoApprovedByRole,
                        registrarPreRecommended: submissionResult.registrarPreRecommended
                      }

                      setIsReservationModalOpen(false)
                      setSuccessDetails(submittedInfo)
                    } catch (error) {
                      if (error instanceof Error && error.message === 'RESERVATIONS_DISABLED') {
                        setIsReservationEnabled(false)
                        showNotification('Room reservations have been disabled. Your reservation was not submitted.', 'warning', 'Reservations Unavailable')
                      } else if (error instanceof Error && error.message === 'MEMBERSHIP_DEPARTMENT_UNAVAILABLE') {
                        showNotification('Your department is unavailable. Please refresh the page or contact an administrator.', 'error', 'Department Unavailable')
                      } else if (error instanceof Error && error.message === 'RESERVATION_ROLE_UNAVAILABLE') {
                        showNotification('Your role cannot reserve rooms.', 'error', 'Reservation Not Allowed')
                      } else if (error instanceof Error && error.message === 'ATTENDEE_NAMES_REQUIRED') {
                        showNotification('Enter the name of every attendee before submitting the reservation.', 'error', 'Attendee Names Required')
                      } else if (error instanceof Error && error.message === 'ROOM_AVAILABILITY_CHANGED') {
                        showNotification('One of the selected rooms changed its availability or capacity. Please review the room setup and time.', 'warning', 'Room Availability Changed')
                      } else if (error instanceof Error && error.message === 'LINKED_ROOM_CHANGED') {
                        showNotification('These rooms are no longer linked. Please review the room setup.', 'warning', 'Linked Rooms Changed')
                      } else if (error instanceof Error && error.message === 'BOOKING_CONFLICT') {
                        showNotification('One of the selected rooms is already reserved at this time.', 'warning', 'Time Conflict')
                      } else {
                        console.error("Error creating reservation:", error)
                        alert("Failed to submit reservation. Please try again.")
                      }
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                >
                  {isSubmitting ? (
                    'Confirming...'
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4" strokeWidth={3} />
                      Confirm Reservation
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
          </div>
          {userRole === 'Instructor' && attendeeFieldCount > 0 && (
            <aside
              aria-labelledby="reservation-attendee-heading"
              className="w-full shrink-0 rounded-2xl border border-gray-200 bg-white shadow-2xl lg:flex lg:h-[var(--reservation-form-height,auto)] lg:max-h-[calc(100dvh-2rem)] lg:w-80 lg:flex-col lg:overflow-hidden"
              style={reservationFormHeight === null ? undefined : { '--reservation-form-height': `${reservationFormHeight}px` } as CSSProperties}
              onClick={event => event.stopPropagation()}
            >
              <div className="rounded-t-2xl bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
                <h4 id="reservation-attendee-heading" className="text-xl font-bold leading-tight">Attendee names <span className="text-rose-300">*</span></h4>
                <p className="mt-0.5 text-xs font-medium text-white/80">Enter other attendees' full names.</p>
              </div>
              <div className="max-h-[calc(100dvh-12rem)] space-y-3 overflow-y-auto px-4 pt-2 pb-0 custom-scrollbar lg:min-h-0 lg:flex-1 lg:max-h-none">
                {Array.from({ length: attendeeFieldCount }, (_, index) => (
                  <div key={index} className="space-y-1.5">
                    <TextInput
                      id={`reservation-attendee-${index}`}
                      aria-label={`Attendee ${index + 1} full name`}
                      value={reservationData.attendeeNames[index] || ''}
                      onChange={value => {
                        setReservationData(prev => {
                          const attendeeNames = [...prev.attendeeNames]
                          attendeeNames[index] = capitalizeAttendeeWords(value)
                          return { ...prev, attendeeNames }
                        })
                        setFormErrors(prev => ({ ...prev, attendeeNames: false }))
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        if (index + 1 < attendeeFieldCount) {
                          document.getElementById(`reservation-attendee-${index + 1}`)?.focus()
                        }
                      }}
                      placeholder="Last Name, First Name"
                      inputClassName="rounded-none! border-x-0! border-t-0! pt-1! shadow-none! focus:ring-0!"
                      error={formErrors.attendeeNames && !normalizeAttendeeName(reservationData.attendeeNames[index] || '')}
                      maxLength={120}
                    />
                  </div>
                ))}
              </div>
              <p className="shrink-0 px-4 pt-1 pb-1 text-xs text-slate-500">{reservationData.attendeeNames.slice(0, attendeeFieldCount).filter(name => normalizeAttendeeName(name || '')).length} of {attendeeFieldCount} names entered</p>
            </aside>
          )}
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isSubmitting) handleCloseModals()
            }} 
          />
        </div>
      )}

      {/* Success Confirmation Modal */}
      {successDetails && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 md:p-7 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header: Checkmark on the left */}
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 ring-4 ring-emerald-50 text-emerald-600">
                <CheckIcon className="h-7 w-7" strokeWidth={3} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 leading-snug">
                  {successDetails.autoApprovedByRole ? 'Reservation Approved' : 'Request Sent Successfully'}
                </h3>
                <p className={`text-xs font-semibold ${successDetails.autoApprovedByRole ? 'text-emerald-700' : 'text-amber-700'}`}>{successDetails.requestType === 'Extended' ? 'Extended reservation · ' : ''}{successDetails.autoApprovedByRole ? `Automatically approved by ${successDetails.autoApprovedByRole}` : successDetails.registrarPreRecommended ? 'Awaiting University Administrator approval' : 'Pending Dean recommendation'}</p>
                <p className="text-sm text-gray-600 font-medium mt-0.5 whitespace-nowrap">
                  Your reservation for <span className="font-bold text-gray-900">{successDetails.roomName}</span> has been {successDetails.autoApprovedByRole ? 'approved' : 'submitted'}.
                </p>
              </div>
            </div>

            {/* Summary Details Card (2 rows, no icons, attendee replacing room type) */}
            <div className="mt-5 rounded-2xl bg-gray-50 border border-gray-200/80 p-4.5 text-left space-y-3">
              {/* Row 1: Room name left, Attendee right */}
              <div className="flex items-center justify-between border-b border-gray-200/60 pb-2.5 text-sm">
                <span className="font-medium text-gray-800">{successDetails.roomName}</span>
                <span className="font-medium text-gray-700">
                  {successDetails.attendees} {successDetails.attendees === 1 ? 'Attendee' : 'Attendees'}
                </span>
              </div>

              {/* Row 2: Date left, Time right */}
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{formatDatePretty(successDetails.date)}</span>
                <span className="font-medium text-gray-700">
                  {formatTime12(successDetails.startTime)} - {formatTime12(successDetails.endTime)}
                </span>
              </div>
            </div>

            {/* Bottom Action Buttons: Done left, My Reservations right */}
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1 justify-center font-semibold"
                onClick={() => {
                  setSuccessDetails(null)
                  handleCloseModals()
                }}
              >
                Done
              </Button>
              <Button
                variant="brand"
                className="flex-1 justify-center font-semibold"
                onClick={() => {
                  setSuccessDetails(null)
                  handleCloseModals()
                  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'myReservations' }))
                }}
              >
                My Reservations
              </Button>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              setSuccessDetails(null)
              handleCloseModals()
            }} 
          />
        </div>
      )}

      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="Reserve a Room" 
          description={canCreateReservation
            ? 'Find and book available rooms for classes, meetings, or special events.'
            : 'View available rooms and manage reservation availability.'}
        />

        {!isReservationAvailabilityLoading && !isReservationEnabled && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-bold">Room reservations are temporarily unavailable.</p>
            <p className="mt-1">You can still view rooms and schedules, but no reservation requests can be submitted right now.</p>
          </div>
        )}

        <section aria-label="Filter buildings and rooms" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Filter Buildings & Rooms</h2>
              <p className="text-sm text-slate-500">Narrow the buildings and rooms shown below.</p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilterBuildingId('all')
                  setFilterFloor('all')
                  setFilterType('all')
                  setFilterStatus('all')
                }}
                className="text-sm font-semibold text-[var(--brand-color)] hover:text-[var(--brand-color-hover)]"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Building</label>
              <SingleSelectDropdown
                options={buildingFilterOptions}
                value={filterBuildingId}
                onChange={setFilterBuildingId}
                getOptionLabel={value => value === 'all' ? 'All buildings' : buildings.find(building => building.id === value)?.code ?? value}
                isPlaceholder={value => value === 'all'}
                ariaLabel="Filter by building"
                portal
                matchTriggerWidth
                searchable
                showSearchChevron
                className="w-full"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Floor</label>
              <SingleSelectDropdown
                options={floorFilterOptions}
                value={filterFloor}
                onChange={setFilterFloor}
                getOptionLabel={value => value === 'all' ? 'All floors' : `Floor ${value}`}
                isPlaceholder={value => value === 'all'}
                ariaLabel="Filter by floor"
                portal
                matchTriggerWidth
                className="w-full"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Room Type</label>
              <SingleSelectDropdown
                options={typeFilterOptions}
                value={filterType}
                onChange={setFilterType}
                getOptionLabel={value => value === 'all' ? 'All types' : value}
                isPlaceholder={value => value === 'all'}
                ariaLabel="Filter by room type"
                portal
                matchTriggerWidth
                className="w-full"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Status</label>
              <SingleSelectDropdown
                options={statusFilterOptions}
                value={filterStatus}
                onChange={setFilterStatus}
                getOptionLabel={value => value === 'all' ? 'All statuses' : value}
                isPlaceholder={value => value === 'all'}
                ariaLabel="Filter by status"
                portal
                matchTriggerWidth
                className="w-full"
              />
            </div>
          </div>
        </section>

        <BuildingBrowser
          buildings={filteredBuildings}
          buildingOptions={buildingOptions}
          expandedBuildingIds={expandedBuildingIds}
          onToggleBuilding={toggleBuilding}
          onRoomClick={(room) => {
            setRoomInfoSource('main')
            handleOpenRoomInfoModal(room)
          }}
          isLoading={isLoading}
          actionButton={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {canManageReservationAvailability && (
                <SingleSelectDropdown
                  options={['Reservations On', 'Reservations Off']}
                  value={isReservationEnabled ? 'Reservations On' : 'Reservations Off'}
                  onChange={(value) => toggleReservationAvailability(value === 'Reservations On')}
                  isDisabled={isReservationAvailabilityLoading || isUpdatingReservationAvailability}
                  className="w-full sm:w-auto"
                />
              )}
              <Button
                variant="brand"
                icon={<SearchIcon className="h-4 w-4" />}
                onClick={() => setIsFindRoomModalOpen(true)}
                className="w-full lg:w-auto"
              >
                Find Room
              </Button>
            </div>
          }
        />
      </div>

      <Snackbar
        isOpen={snackbar.isOpen}
        onClose={() => setSnackbar(prev => ({ ...prev, isOpen: false }))}
        title={snackbar.title}
        message={snackbar.message}
        type={snackbar.type}
        position="top-center"
      />
    </section>
  )
}

export default ReserveRoomPage
