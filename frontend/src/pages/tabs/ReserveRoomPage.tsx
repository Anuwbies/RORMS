import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import { scheduleMeetingRecords } from '../../utils/scheduleMeetings'
import { maxReservationDuration, reservationTimeMinutes, reservationTimeString, type ReservationRequestType } from '../../utils/reservationDuration'
import { SectionHeader } from '../../components/SectionHeader'
import { UserIcon, SearchIcon, CheckIcon, ClipboardIcon, BookIcon, BuildingIcon, DoorIcon, UsersIcon, CalendarIcon, ClockIcon } from '../../components/Icons'
import { Button } from '../../components/Button'
import { SummaryCard } from '../../components/SummaryCard'
import { SummaryGraph } from '../../summary-graphs/SummaryGraph'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { ScheduleModal } from '../../components/ScheduleModal'
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
  limit,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

import type { Room, Building, RoomStatus } from '../../types/room'
import { DEFAULT_ROOM_IMAGE, roomStatusClasses, DAYS_OF_WEEK } from '../../types/room'

function getLocalIsoDate(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

interface ReserveRoomPageProps {
  userRole: string
}

interface ReservationMembership {
  id: string
  userId: string
  department: string
}

function ReserveRoomPage({ userRole }: ReserveRoomPageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [buildings, setBuildings] = useState<Building[]>([])
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
  const canManageReservationAvailability = userRole === 'Admin' || userRole === 'Registrar'
  
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

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
  const [isRoomScheduleModalOpen, setIsRoomScheduleModalOpen] = useState(false)
  const [selectedRoomForSchedule, setSelectedRoomForSchedule] = useState<Room | null>(null)

  const [reservationData, setReservationData] = useState({
    requestType: 'Standard' as ReservationRequestType,
    date: getLocalIsoDate(),
    startTime: '',
    duration: 60,
    purpose: '',
    attendees: '',
    subjectCode: '',
    classSection: ''
  })

  const busyIntervals = useMemo<{ start: number; end: number }[]>(() => {
    if (!selectedRoomInfo || !reservationData.date) return []
    const intervals: { start: number; end: number }[] = []

    const timeToMins = (t: string) => {
      if (!t) return 0
      const [h, m] = t.split(':').map(Number)
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
    }

    // 1. Existing Reservations for this room on this date
    reservations.forEach((r: any) => {
      if (
        r.roomId === selectedRoomInfo.id &&
        r.date === reservationData.date &&
        r.status !== 'Declined' &&
        r.status !== 'Cancelled' &&
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
        s.roomId === selectedRoomInfo.id &&
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
  }, [selectedRoomInfo, reservationData.date, reservations, schedules])

  const isStartTimeDisabled = useCallback((timeStr: string) => {
    if (!timeStr || !selectedRoomInfo) return false
    const [h, m] = timeStr.split(':').map(Number)
    const startMins = h * 60 + m
    const minBookingMins = Math.max(30, selectedRoomInfo.minBookingMins || 30)
    const proposedEndMins = startMins + minBookingMins

    // Check if proposed start time or minimal booking window conflicts with any busy interval
    return busyIntervals.some(interval => {
      return interval.start < proposedEndMins && interval.end > startMins
    })
  }, [selectedRoomInfo, busyIntervals])

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
    if (!selectedRoomInfo) return []
    const options = []
    const min = Math.max(30, selectedRoomInfo.minBookingMins || 30)
    const max = maxReservationDuration(selectedRoomInfo, reservationData.startTime, reservationData.requestType, busyIntervals)

    for (let i = min; i <= max; i += 30) {
      options.push(i.toString())
    }
    return options
  }, [selectedRoomInfo, reservationData.startTime, reservationData.requestType, busyIntervals])

  const extendedEndTime = reservationData.startTime && reservationData.duration > 0
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + reservationData.duration)
    : ''
  const extendedMinEndTime = selectedRoomInfo && reservationData.startTime
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + Math.max(30, selectedRoomInfo.minBookingMins || 30))
    : '07:30'
  const extendedMaxDuration = selectedRoomInfo
    ? maxReservationDuration(selectedRoomInfo, reservationData.startTime, 'Extended', busyIntervals)
    : 0
  const extendedMaxEndTime = reservationData.startTime
    ? reservationTimeString(reservationTimeMinutes(reservationData.startTime) + extendedMaxDuration)
    : selectedRoomInfo?.endTime || '18:00'

  const computedMaxStartTime = useMemo(() => {
    if (!selectedRoomInfo) return '17:30'
    const endTime = selectedRoomInfo.endTime || '18:00'
    const [eh, em] = endTime.split(':').map(Number)
    if (isNaN(eh) || isNaN(em)) return '17:30'
    
    const minMins = Math.max(30, selectedRoomInfo.minBookingMins || 30)
    const totalEndMins = eh * 60 + em
    
    const [sh, sm] = (selectedRoomInfo.startTime || '07:30').split(':').map(Number)
    const minStartMins = isNaN(sh) || isNaN(sm) ? 450 : sh * 60 + sm
    
    const maxStartMins = Math.max(minStartMins, totalEndMins - minMins)
    const maxH = Math.floor(maxStartMins / 60).toString().padStart(2, '0')
    const maxM = (maxStartMins % 60).toString().padStart(2, '0')
    return `${maxH}:${maxM}`
  }, [selectedRoomInfo])

  const computedMinStartTime = useMemo(() => {
    const roomStart = selectedRoomInfo?.startTime || '07:30'
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
  }, [selectedRoomInfo, reservationData.date])

  const minReservationDate = useMemo(() => {
    if (!selectedRoomInfo) return getLocalIsoDate()
    const minMins = Math.max(30, selectedRoomInfo.minBookingMins || 30)
    const [eh, em] = (selectedRoomInfo.endTime || '18:00').split(':').map(Number)
    const [sh, sm] = (selectedRoomInfo.startTime || '07:30').split(':').map(Number)
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
  }, [selectedRoomInfo])

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const firstAvailableStartTime = useMemo(() => {
    if (!selectedRoomInfo || !reservationData.date) return null
    return getFirstAvailableStartTime(reservationData.date, selectedRoomInfo)
  }, [selectedRoomInfo, reservationData.date, getFirstAvailableStartTime])
  const isDateFull = Boolean(selectedRoomInfo && reservationData.date && firstAvailableStartTime === null)

  // Keep the selection valid when live reservations or class schedules change.
  useEffect(() => {
    if (!isReservationModalOpen || !selectedRoomInfo) return
    setReservationData(prev => {
      const nextStartTime = firstAvailableStartTime === null
        ? ''
        : !prev.startTime || prev.startTime < computedMinStartTime || prev.startTime > computedMaxStartTime || isStartTimeDisabled(prev.startTime)
          ? firstAvailableStartTime
          : prev.startTime
      if (nextStartTime === prev.startTime) return prev
      return { ...prev, startTime: nextStartTime, duration: Math.max(30, selectedRoomInfo.minBookingMins || 30) }
    })
  }, [isReservationModalOpen, selectedRoomInfo, firstAvailableStartTime, computedMinStartTime, computedMaxStartTime, isStartTimeDisabled])

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
        setReservationData(prev => ({ ...prev, duration: parseInt(durationOptions[0], 10) }))
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

    const unsubscribeSchedules = onSnapshot(collection(db, 'schedule'), (snapshot) => {
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

      const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid), limit(1))
      unsubscribeMembership = onSnapshot(membershipQuery, snapshot => {
        if (auth.currentUser?.uid !== user.uid) return
        const membershipDoc = snapshot.docs[0]
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
  }, [])

  const toggleBuilding = (id: string) => {
    setExpandedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleOpenReservationModal = (room: Room) => {
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

    const initialDate = getEarliestAvailableDate(room.availableDays, isTodayPastCutoff)

    const initialBusy: { start: number; end: number }[] = []
    reservations.forEach((r: any) => {
      if (
        r.roomId === room.id &&
        r.date === initialDate &&
        r.status !== 'Declined' &&
        r.status !== 'Cancelled' &&
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
    const initialStart = firstValid ?? ''

    setReservationData({
      requestType: 'Standard',
      date: initialDate,
      startTime: initialStart,
      duration: minBookingMins,
      purpose: '',
      attendees: '',
      subjectCode: '',
      classSection: ''
    })
  }

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setIsReservationModalOpen(false)
    setIsFindRoomModalOpen(false)
    setIsSearchResultsModalOpen(false)
    setIsRoomScheduleModalOpen(false)
    setSelectedRoomInfo(null)
    setSelectedRoomForSchedule(null)
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const roomTypes = useMemo(() => Array.from(new Set(allRooms.map(r => r.type))).sort(), [allRooms])
  const allAmenities = useMemo(() => Array.from(new Set(allRooms.flatMap(r => r.amenities))).sort(), [allRooms])
  
  const selectedBuildingObj = useMemo(() => buildings.find(b => b.code === findRoomData.building), [buildings, findRoomData.building])
  const floorOptions = useMemo(() => {
    if (!selectedBuildingObj) return []
    const floors = new Set(selectedBuildingObj.rooms.map(r => r.floor))
    return Array.from(floors).sort((a, b) => a - b).map(String)
  }, [selectedBuildingObj])
  const availableRoomsCount = allRooms.filter(room => room.status === 'Available').length
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Find Room Modal */}
      {isFindRoomModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
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
                      options={['Any Type', ...roomTypes]}
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
        room={selectedRoomInfo}
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
      <ScheduleModal
        isOpen={isRoomScheduleModalOpen}
        room={selectedRoomForSchedule}
        buildingName={
          buildings.find(b => b.rooms.some(r => r.id === selectedRoomForSchedule?.id))?.name
        }
        hideFilters={true}
        showWeekCalendar={true}
        onClose={handleCloseModals}
        onBack={() => {
          setIsRoomScheduleModalOpen(false)
          if (selectedRoomForSchedule) {
            setSelectedRoomInfo(selectedRoomForSchedule)
            setIsRoomInfoModalOpen(true)
          }
        }}
        actionButton={
          selectedRoomForSchedule?.status === 'Available' && isReservationEnabled && !isReservationAvailabilityLoading ? (
            <Button
              type="button"
              variant="brand"
              onClick={() => {
                if (selectedRoomForSchedule) {
                  handleOpenReservationModal(selectedRoomForSchedule)
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

      {/* Reservation Modal */}
      {isReservationModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar rounded-2xl">
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
                    <p className="text-xs text-slate-500">Longer bookings require Admin/Registrar approval and must fit within the room's available hours, without conflicts.</p>
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
                        if (selectedRoomInfo) {
                          const newBusy: { start: number; end: number }[] = []
                          const timeToMins = (t: string) => {
                            const [h, m] = t.split(':').map(Number)
                            return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
                          }
                          reservations.forEach((r: any) => {
                            if (
                              r.roomId === selectedRoomInfo.id &&
                              r.date === date &&
                              r.status !== 'Declined' &&
                              r.status !== 'Cancelled' &&
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
                              s.roomId === selectedRoomInfo.id &&
                              s.startTime &&
                              s.endTime &&
                              Array.isArray(s.days) &&
                              s.days.some((dayStr: string) => normalizeDay(dayStr) === targetDay)
                            ) {
                              newBusy.push({ start: timeToMins(s.startTime), end: timeToMins(s.endTime) })
                            }
                          })

                          const firstValid = getFirstAvailableStartTime(date, selectedRoomInfo, newBusy)
                          newStartTime = firstValid ?? ''
                        }
                        setReservationData({ ...reservationData, date, startTime: newStartTime })
                        if (date) setFormErrors(prev => ({ ...prev, date: false }))
                      }}
                      minDate={minReservationDate}
                      maxDate={maxAllowedDate}
                      allowedDays={selectedRoomInfo.availableDays}
                      hasError={formErrors.date}
                      hideClear
                    />
                  </div>

                  {/* Attendees */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Attendees <span className="text-rose-500">*</span></label>
                    <NumberInput
                      min={1}
                      max={selectedRoomInfo.capacity}
                      value={reservationData.attendees}
                      onChange={(val) => {
                        let finalVal = val
                        if (val !== '' && selectedRoomInfo.capacity) {
                          const num = Number(val)
                          if (num > selectedRoomInfo.capacity) {
                            finalVal = selectedRoomInfo.capacity.toString()
                          }
                        }
                        setReservationData({ ...reservationData, attendees: finalVal })
                        if (finalVal) setFormErrors(prev => ({ ...prev, attendees: false }))
                      }}
                      icon={<UserIcon className="h-4.5 w-4.5 text-gray-400" />}
                      placeholder={`Max ${selectedRoomInfo.capacity} pax`}
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
                        const maxDuration = maxReservationDuration(selectedRoomInfo, time, reservationData.requestType, busyIntervals)
                        const newDuration = Math.min(reservationData.duration, maxDuration)
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
                        disabled={isDateFull || !reservationData.startTime || extendedMaxDuration < Math.max(30, selectedRoomInfo.minBookingMins || 30)}
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
                    if (isReservationAvailabilityLoading || !isReservationEnabled) {
                      showNotification('Room reservations are currently unavailable. Please try again later.', 'warning', 'Reservations Unavailable')
                      return
                    }

                    if (isDateFull) {
                      showNotification('No free time on this date. Please choose another date.', 'warning', 'Room Full')
                      return
                    }

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
                    if (attendeeCount <= 0 || (selectedRoomInfo.capacity && attendeeCount > selectedRoomInfo.capacity)) {
                      showNotification(`Number of attendees must be between 1 and ${selectedRoomInfo.capacity} pax for this room.`, 'warning', 'Invalid Attendees')
                      setFormErrors(prev => ({ ...prev, attendees: true }))
                      return
                    }

                    // 2. Duration Validation
                    if (!Number.isInteger(reservationData.duration) || reservationData.duration < Math.max(30, selectedRoomInfo.minBookingMins || 30) ||
                        (reservationData.requestType === 'Standard' && reservationData.duration > (selectedRoomInfo.maxBookingMins || 180))) {
                      showNotification(reservationData.requestType === 'Extended'
                        ? `Duration must be at least ${Math.max(30, selectedRoomInfo.minBookingMins || 30)} minutes and end within the room's available hours.`
                        : `Duration must be between ${Math.max(30, selectedRoomInfo.minBookingMins || 30)} and ${selectedRoomInfo.maxBookingMins || 180} minutes.`, 'warning', 'Invalid Duration')
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
                    
                    if (!selectedRoomInfo.availableDays.includes(selectedDayName)) {
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
                    const roomStartMins = timeToMinutes(selectedRoomInfo.startTime || '07:30')
                    const roomEndMins = timeToMinutes(selectedRoomInfo.endTime || '18:00')
                    const minBookingMins = Math.max(30, selectedRoomInfo.minBookingMins || 30)

                    if (startMins < roomStartMins || endMins > roomEndMins || startMins > roomEndMins - minBookingMins) {
                      showNotification(`Reservation must be within the room's schedule: ${selectedRoomInfo.startTime} - ${selectedRoomInfo.endTime}. Start time cannot be after ${computedMaxStartTime}.`, 'warning', 'Invalid Time')
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

                      await runTransaction(db, async (transaction) => {
                        const availabilitySnapshot = await transaction.get(reservationAvailabilityRef)
                        if (availabilitySnapshot.exists() && availabilitySnapshot.data().isReservationEnabled === false) {
                          throw new Error('RESERVATIONS_DISABLED')
                        }

                        const membershipSnapshot = await transaction.get(doc(db, 'memberships', reservationMembership.id))
                        const membership = membershipSnapshot.data()
                        const department = typeof membership?.department === 'string' ? membership.department.trim() : ''
                        if (!membershipSnapshot.exists() || membership?.userId !== userId || !department) {
                          throw new Error('MEMBERSHIP_DEPARTMENT_UNAVAILABLE')
                        }

                        if (reservationData.requestType === 'Extended') {
                          const currentRoomSnapshot = await transaction.get(doc(db, 'rooms', selectedRoomInfo.id))
                          const currentRoom = currentRoomSnapshot.data()
                          if (!currentRoom || currentRoom.status !== 'Available'
                            || !Array.isArray(currentRoom.availableDays) || !currentRoom.availableDays.includes(selectedDayName)
                            || startMins < reservationTimeMinutes(currentRoom.startTime || '07:30')
                            || endMins > reservationTimeMinutes(currentRoom.endTime || '18:00')
                            || reservationData.duration < Math.max(30, currentRoom.minBookingMins || 30)
                            || attendeeCount > currentRoom.capacity) {
                            throw new Error('ROOM_AVAILABILITY_CHANGED')
                          }
                        }

                        transaction.set(doc(collection(db, 'reservations')), {
                          roomId: selectedRoomInfo.id,
                          buildingId: building?.id || '',
                          userId: userId,
                          date: reservationData.date,
                          startTime: reservationData.startTime,
                          endTime: endTimeStr,
                          duration: reservationData.duration,
                          requestType: reservationData.requestType,
                          attendees: Number(reservationData.attendees),
                          purpose: reservationData.purpose.trim(),
                          subjectCode: reservationData.subjectCode.trim().toUpperCase(),
                          classSection: reservationData.classSection.trim().toUpperCase(),
                          department,
                          status: 'Pending',
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp()
                        })
                      })

                      const submittedInfo = {
                        roomName: selectedRoomInfo.name,
                        roomType: selectedRoomInfo.type || 'Lecture Room',
                        buildingName: building?.name || 'Building',
                        floor: selectedRoomInfo.floor,
                        date: reservationData.date,
                        startTime: reservationData.startTime,
                        endTime: endTimeStr,
                        duration: reservationData.duration,
                        requestType: reservationData.requestType,
                        attendees: Number(reservationData.attendees),
                        purpose: reservationData.purpose.trim()
                      }

                      setIsReservationModalOpen(false)
                      setSuccessDetails(submittedInfo)
                    } catch (error) {
                      if (error instanceof Error && error.message === 'RESERVATIONS_DISABLED') {
                        setIsReservationEnabled(false)
                        showNotification('Room reservations have been disabled. Your reservation was not submitted.', 'warning', 'Reservations Unavailable')
                      } else if (error instanceof Error && error.message === 'MEMBERSHIP_DEPARTMENT_UNAVAILABLE') {
                        showNotification('Your department is unavailable. Please refresh the page or contact an administrator.', 'error', 'Department Unavailable')
                      } else if (error instanceof Error && error.message === 'ROOM_AVAILABILITY_CHANGED') {
                        showNotification('The room availability or capacity changed. Please review the room and choose a valid time.', 'warning', 'Room Availability Changed')
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
                  Request Sent Successfully
                </h3>
                {successDetails.requestType === 'Extended' && <p className="text-xs font-semibold text-amber-700">Extended reservation · Pending Admin/Registrar approval</p>}
                <p className="text-sm text-gray-600 font-medium mt-0.5 whitespace-nowrap">
                  Your reservation for <span className="font-bold text-gray-900">{successDetails.roomName}</span> has been submitted.
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
          description="Find and book available rooms for classes, meetings, or special events." 
        />

        {!isReservationAvailabilityLoading && !isReservationEnabled && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-bold">Room reservations are temporarily unavailable.</p>
            <p className="mt-1">You can still view rooms and schedules, but no reservation requests can be submitted right now.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            className="animate-in"
            title="Available Rooms"
            subtitle={`${availableRoomsCount} currently ready to book`}
            icon={<DoorIcon className="w-5 h-5 text-emerald-600" />}
            gradientClasses="from-emerald-200 to-emerald-100"
            outlineClasses="bg-emerald-500"
            blobClasses="bg-emerald-500/5"
          >
            <SummaryGraph variant="pie" total={availableRoomsCount} points={[
              { label: 'Available', value: availableRoomsCount },
              { label: 'Unavailable', value: allRooms.filter(room => room.status === 'Unavailable').length },
              { label: 'Maintenance', value: allRooms.filter(room => room.status === 'Maintenance').length },
            ]} tone="emerald" />
          </SummaryCard>

          <SummaryCard
            className="animate-in"
            title="Total Buildings"
            subtitle={`${buildings.length} campus facilities managed`}
            icon={<BuildingIcon className="w-5 h-5 text-amber-600" />}
            gradientClasses="from-amber-200 to-amber-100"
            outlineClasses="bg-amber-500"
            blobClasses="bg-amber-500/5"
          >
            <SummaryGraph variant="bar" total={buildings.length} points={buildings.map(building => ({ label: building.code || building.name, value: building.rooms.length, tooltipLabel: 'Rooms' }))} unit="buildings" tone="amber" />
          </SummaryCard>

          <SummaryCard
            className="animate-in"
            title="Total Capacity"
            subtitle={`${totalCapacity} maximum campus seats`}
            icon={<UsersIcon className="w-5 h-5 text-sky-600" />}
            gradientClasses="from-sky-200 to-sky-100"
            outlineClasses="bg-sky-500"
            blobClasses="bg-sky-500/5"
          >
            <SummaryGraph variant="line" total={totalCapacity} points={buildings.map(building => ({ label: building.code || building.name, value: building.capacity, tooltipLabel: 'Capacity' }))} unit="seats" tone="sky" />
          </SummaryCard>
        </div>

        <BuildingBrowser
          buildings={buildings}
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
