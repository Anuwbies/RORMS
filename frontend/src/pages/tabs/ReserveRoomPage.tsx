import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { DoorIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, ClockIcon, BookIcon, CheckIcon, CalendarIcon, ClipboardIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchInput } from '../../components/SearchInput'
import { FilterDropdown } from '../../components/FilterDropdown'
import { Button } from '../../components/Button'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { TimePicker } from '../../components/TimePicker'
import { DatePicker } from '../../components/DatePicker'
import { NumberInput } from '../../components/NumberInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { RoomAmenities } from '../../components/RoomAmenities'
import { db, auth } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  addDoc,
  serverTimestamp
} from 'firebase/firestore'

export type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

export function createRoomImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="28" fill="#f3f4f6" />
      <g transform="translate(225, 88) scale(8)" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M6 20V5.8c0-.64.43-1.2 1.04-1.36l7-1.84a1.4 1.4 0 0 1 1.76 1.35V20" />
        <path d="M6 20h11.5" />
        <path d="M11.95 12.15h.1" />
        <path d="M15.8 20V4.1" />
      </g>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export const DEFAULT_ROOM_IMAGE = createRoomImage()

export interface Room {
  id: string
  image: string
  code: string
  name: string
  type: string
  floor: number
  capacity: number
  status: RoomStatus
  description: string
  amenities: string[]
  availableDays: string[]
  startTime: string
  endTime: string
  minBookingMins: number
  maxBookingMins: number
}

export interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

export const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getLocalIsoDate(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getEarliestAvailableDate(availableDays: string[]) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 7; i++) {
    const checkDate = new Date(today)
    checkDate.setDate(today.getDate() + i)
    const dayName = dayNames[checkDate.getDay()]
    if (availableDays.includes(dayName)) {
      return getLocalIsoDate(checkDate)
    }
  }
  return getLocalIsoDate(today)
}



function ReserveRoomPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('rorms_reserve_expanded')
    return saved ? JSON.parse(saved) : []
  })
  const isInitialLoad = useRef(true)
  const knownBuildingIds = useRef<Set<string>>(new Set())
  const [rooms, setRooms] = useState<Room[]>([])
  
  const maxAllowedDate = useMemo(() => {
    const today = new Date()
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0)
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`
  }, [])

  const [selectedStatuses, setSelectedStatuses] = useState<RoomStatus[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [activeDropdowns, setActiveDropdowns] = useState(0)

  useEffect(() => {
    localStorage.setItem('rorms_reserve_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  const buildingOptions = useMemo(() => buildings.map(b => b.name).sort(), [buildings])

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)

  const durationOptions = useMemo(() => {
    if (!selectedRoomInfo) return []
    const options = []
    const min = Math.max(30, selectedRoomInfo.minBookingMins || 30)
    const max = selectedRoomInfo.maxBookingMins || 180
    for (let i = min; i <= max; i += 30) {
      options.push(i.toString())
    }
    return options
  }, [selectedRoomInfo])

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reservationData, setReservationData] = useState({
    date: getLocalIsoDate(),
    startTime: '07:30',
    duration: 60,
    purpose: '',
    capacity: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})

  const [isFindRoomModalOpen, setIsFindRoomModalOpen] = useState(false)
  const [findRoomData, setFindRoomData] = useState({
    building: '',
    capacity: '',
    roomType: '',
    amenities: [] as string[],
    date: getLocalIsoDate(),
    startTime: '07:30',
    duration: 60 as number | ''
  })

  useEffect(() => {
    if (isReservationModalOpen) {
      setFormErrors({})
      setIsSubmitting(false)
    }
  }, [isReservationModalOpen])

  useEffect(() => {
    const buildingsQuery = query(collection(db, 'buildings'), orderBy('createdAt', 'desc'))
    const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'))

    let buildingsList: any[] = []
    let roomsList: any[] = []

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
      updateState()
    })

    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      roomsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateState()
    })

    return () => {
      unsubscribeBuildings()
      unsubscribeRooms()
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
    setSelectedRoomInfo(room)
    setIsReservationModalOpen(true)
    setIsRoomInfoModalOpen(false)
    setReservationData({
      date: getEarliestAvailableDate(room.availableDays),
      startTime: '07:30',
      duration: room.minBookingMins,
      purpose: '',
      capacity: ''
    })
  }

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setIsReservationModalOpen(false)
    setIsFindRoomModalOpen(false)
    setSelectedRoomInfo(null)
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const roomTypes = useMemo(() => Array.from(new Set(allRooms.map(r => r.type))).sort(), [allRooms])
  const allAmenities = useMemo(() => Array.from(new Set(allRooms.flatMap(r => r.amenities))).sort(), [allRooms])
  const availableRoomsCount = allRooms.filter(room => room.status === 'Available').length
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)

  const filteredBuildings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    
    return buildings
      .map((building) => {
        // 1. Filter by building selection
        if (selectedBuildings.length > 0 && !selectedBuildings.includes(building.name)) {
          return null
        }

        // 2. Filter rooms by status (always applies)
        const statusMatchingRooms = selectedStatuses.length > 0
          ? building.rooms.filter(room => selectedStatuses.includes(room.status))
          : building.rooms

        // 3. If no search term, return building with status-filtered rooms
        if (!normalizedSearch) {
          return {
            ...building,
            rooms: statusMatchingRooms,
          }
        }

        // 4. Check if building itself matches search
        const buildingMatchesSearch = [
          building.name,
          building.code,
          String(building.floor),
          String(building.rooms.length),
          String(building.capacity),
        ].some((value) => value.toLowerCase().includes(normalizedSearch))

        if (buildingMatchesSearch) {
          return {
            ...building,
            rooms: statusMatchingRooms,
          }
        }

        // 5. If building doesn't match, check rooms for search match (within status-filtered rooms)
        const fullyMatchingRooms = statusMatchingRooms.filter((room) =>
          [
            room.name,
            room.code,
            room.type,
            String(room.capacity),
            room.status,
          ].some((value) => value.toLowerCase().includes(normalizedSearch)),
        )

        if (fullyMatchingRooms.length === 0) {
          return null
        }

        return {
          ...building,
          rooms: fullyMatchingRooms,
        }
      })
      .filter((building): building is Building => building !== null)
  }, [buildings, searchTerm, selectedStatuses, selectedBuildings])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Find Room Modal */}
      {isFindRoomModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
              <h3 className="text-xl font-bold leading-tight">Find a Room</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Specify your requirements to find the perfect room</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Building</label>
                    <SingleSelectDropdown
                      options={['Any Building', ...buildingOptions]}
                      value={findRoomData.building || 'Any Building'}
                      onChange={(val) => setFindRoomData({ ...findRoomData, building: val === 'Any Building' ? '' : val })}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Start Time</label>
                    <TimePicker 
                      value={findRoomData.startTime}
                      onChange={(time) => setFindRoomData({ ...findRoomData, startTime: time })}
                      minuteStep={30}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Duration (mins)</label>
                    <SingleSelectDropdown
                      options={['30', '60', '90', '120', '150', '180']}
                      value={findRoomData.duration ? findRoomData.duration.toString() : '60'}
                      onChange={(val) => setFindRoomData({ ...findRoomData, duration: Number(val) })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5 block">Room Amenities</label>
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
                <button
                  onClick={handleCloseModals}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[var(--brand-color-hover)]"
                  onClick={() => {
                    alert("Room search criteria applied. Integration with the main list is pending.")
                    setIsFindRoomModalOpen(false)
                  }}
                >
                  <SearchIcon className="h-4 w-4" />
                  Find Room
                </button>
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={handleCloseModals} 
          />
        </div>
      )}

      {/* Room Information Modal */}
      <RoomInfoModal
        isOpen={isRoomInfoModalOpen}
        room={selectedRoomInfo}
        onClose={handleCloseModals}
        onReserve={(room) => handleOpenReservationModal(room)}
      />

      {/* Reservation Modal */}
      {isReservationModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
              <h3 className="text-xl font-bold leading-tight">Reserve {selectedRoomInfo.name}</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Fill in the details to book this room</p>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Date Selection */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Date <span className="text-rose-500">*</span></label>
                    <DatePicker
                      value={reservationData.date}
                      onChange={(date) => {
                        setReservationData({ ...reservationData, date })
                        if (date) setFormErrors(prev => ({ ...prev, date: false }))
                      }}
                      minDate={getLocalIsoDate()}
                      maxDate={maxAllowedDate}
                      allowedDays={selectedRoomInfo.availableDays}
                      hasError={formErrors.date}
                    />
                  </div>

                  {/* Capacity */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Capacity <span className="text-rose-500">*</span></label>
                    <NumberInput
                      min={1}
                      max={selectedRoomInfo.capacity}
                      value={reservationData.capacity}
                      onChange={(val) => {
                        setReservationData({ ...reservationData, capacity: val })
                        if (val) setFormErrors(prev => ({ ...prev, capacity: false }))
                      }}
                      icon={<UserIcon className="h-4.5 w-4.5 text-gray-400" />}
                      placeholder={`Max ${selectedRoomInfo.capacity} pax`}
                      error={formErrors.capacity}
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
                        setReservationData({ ...reservationData, startTime: time })
                        if (time) setFormErrors(prev => ({ ...prev, startTime: false }))
                      }}
                      hasError={formErrors.startTime}
                      minuteStep={30}
                    />
                  </div>

                  {/* Duration */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Duration (minutes) <span className="text-rose-500">*</span></label>
                    <SingleSelectDropdown
                      options={durationOptions}
                      value={reservationData.duration.toString()}
                      onChange={(val) => {
                        setReservationData({ ...reservationData, duration: parseInt(val, 10) })
                        setFormErrors(prev => ({ ...prev, duration: false }))
                      }}
                      className={formErrors.duration ? '[&>button]:border-rose-500 [&>button]:ring-4 [&>button]:ring-rose-50' : ''}
                    />
                  </div>
                </div>

                {/* Purpose */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Purpose <span className="text-rose-500">*</span></label>
                    <span className={`text-[0.625rem] font-bold tabular-nums ${formErrors.purpose ? 'text-rose-500' : 'text-gray-400'}`}>
                      {reservationData.purpose.length}/200
                    </span>
                  </div>
                  <TextAreaInput
                    value={reservationData.purpose}
                    onChange={(val) => {
                      if (val.length <= 200) {
                        setReservationData({ ...reservationData, purpose: val })
                        if (val.trim()) setFormErrors(prev => ({ ...prev, purpose: false }))
                      }
                    }}
                    icon={<ClipboardIcon className="h-4 w-4" />}
                    placeholder="e.g., Team Meeting, Study Session..."
                    error={formErrors.purpose}
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsReservationModalOpen(false)
                    setIsRoomInfoModalOpen(true)
                  }}
                  disabled={isSubmitting}
                  className={`flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Back
                </button>
                <button
                  disabled={isSubmitting}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md transition ${
                    isSubmitting ? 'bg-[var(--brand-color)]/70 cursor-not-allowed' : 'bg-[var(--brand-color)] hover:bg-[var(--brand-color-hover)]'
                  }`}
                  onClick={async () => {
                    const errors: Record<string, boolean> = {}
                    if (!reservationData.date) errors.date = true
                    if (!reservationData.startTime) errors.startTime = true
                    if (!reservationData.duration || isNaN(reservationData.duration)) errors.duration = true
                    if (!reservationData.capacity || isNaN(Number(reservationData.capacity))) errors.capacity = true
                    if (!reservationData.purpose.trim()) errors.purpose = true

                    if (Object.keys(errors).length > 0) {
                      setFormErrors(errors)
                      return
                    }

                    // 1. Duration Validation
                    if (reservationData.duration < selectedRoomInfo.minBookingMins || 
                        reservationData.duration > selectedRoomInfo.maxBookingMins) {
                      alert(`Duration must be between ${selectedRoomInfo.minBookingMins} and ${selectedRoomInfo.maxBookingMins} minutes.`)
                      setFormErrors(prev => ({ ...prev, duration: true }))
                      return
                    }

                    // 2. Date Validation (Available Days)
                    const [y, m, d] = reservationData.date.split('-').map(Number)
                    const selectedDateObj = new Date(y, m - 1, d)
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    const selectedDayName = dayNames[selectedDateObj.getDay()]
                    
                    if (!selectedRoomInfo.availableDays.includes(selectedDayName)) {
                      alert(`The room is not available on ${selectedDayName}s.`)
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
                    const roomStartMins = timeToMinutes(selectedRoomInfo.startTime)
                    const roomEndMins = timeToMinutes(selectedRoomInfo.endTime)

                    if (startMins < roomStartMins || endMins > roomEndMins) {
                      alert(`Reservation must be within the room's schedule: ${selectedRoomInfo.startTime} - ${selectedRoomInfo.endTime}.`)
                      setFormErrors(prev => ({ ...prev, startTime: true }))
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
                        alert("You must be logged in to make a reservation.")
                        return
                      }

                      const building = buildings.find(b => b.rooms.some(r => r.id === selectedRoomInfo.id))

                      await addDoc(collection(db, 'reservations'), {
                        roomId: selectedRoomInfo.id,
                        buildingId: building?.id || '',
                        userId: userId,
                        date: reservationData.date,
                        startTime: reservationData.startTime,
                        endTime: endTimeStr,
                        duration: reservationData.duration,
                        purpose: reservationData.purpose.trim(),
                        status: 'Pending',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
                      })

                      alert("Reservation request submitted successfully!")
                      handleCloseModals()
                    } catch (error) {
                      console.error("Error creating reservation:", error)
                      alert("Failed to submit reservation. Please try again.")
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
                </button>
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

      <div className="space-y-6">
        <SectionHeader 
          title="Reserve a Room" 
          description="Find and book available rooms for classes, meetings, or special events." 
        />

        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-visible flex flex-col w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full relative z-20 p-4 bg-white rounded-t-3xl border-b border-gray-200">
            <div className="flex items-center gap-3 w-full flex-1 flex-col lg:flex-row">
              <div className="relative w-full lg:max-w-md">
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search by building name, room code, status, capacity..."
                  className="w-full"
                />
              </div>
              <div className="shrink-0 w-full sm:w-auto">
                <FilterDropdown
                  label="Filters"
                  groups={[
                    {
                      id: 'building',
                      title: 'Building',
                      options: buildingOptions,
                      selectedValues: selectedBuildings,
                      onChange: setSelectedBuildings
                    },
                    {
                      id: 'status',
                      title: 'Status',
                      options: ['Available', 'Occupied', 'Reserved', 'Maintenance'],
                      selectedValues: selectedStatuses,
                      onChange: (newSelected) => setSelectedStatuses(newSelected as RoomStatus[])
                    }
                  ]}
                  onClearAll={() => {
                    setSelectedBuildings([])
                    setSelectedStatuses([])
                  }}
                  buttonClassName="w-full sm:w-auto"
                />
              </div>
            </div>
            <div className="shrink-0 w-full lg:w-auto">
              <Button
                variant="brand"
                icon={<BookIcon className="h-4 w-4" />}
                onClick={() => setIsFindRoomModalOpen(true)}
                className="w-full lg:w-auto"
              >
                Reserve Room
              </Button>
            </div>
          </div>

          <div className="flex flex-col">
            {filteredBuildings.length === 0 ? (
              <div className="p-16 text-center bg-gray-50/50 rounded-b-3xl">
                <p className="text-lg font-semibold text-[var(--brand-color)]">
                  No matching buildings or rooms
                </p>
                <p className="mt-3 text-sm leading-7 text-gray-500">
                  Try a different building name, room code, status, or capacity.
                </p>
              </div>
            ) : (
              filteredBuildings.map((building, index) => {
            const roomsByFloor = building.rooms.reduce((acc, room) => {
              if (!acc[room.floor]) {
                acc[room.floor] = []
              }
              acc[room.floor].push(room)
              return acc
            }, {} as Record<number, Room[]>)

            const sortedFloors = Object.keys(roomsByFloor)
              .map(Number)
              .sort((a, b) => a - b)

            const isExpanded = expandedBuildingIds.includes(building.id)

            return (
              <article
                key={building.id}
                className={`p-6 sm:p-8 transition-colors ${
                  index !== filteredBuildings.length - 1 ? 'border-b border-gray-200' : ''
                } hover:bg-gray-50/50`}
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                          {building.name}
                        </h3>
                        <span className="inline-flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[0.625rem] font-bold uppercase tracking-widest text-gray-600 shadow-sm leading-none">
                          {building.code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton
                        label={isExpanded ? 'Collapse building' : 'Expand building'}
                        onClick={() => toggleBuilding(building.id)}
                        className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
                      >
                        <ChevronDownIcon
                          className={`h-6 w-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 border border-amber-100 shrink-0">
                        <LayersIcon className="h-9 w-9 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Floor">
                          Floor
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.floor}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100 shrink-0">
                        <DoorIcon className="h-9 w-9 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Rooms">
                          Rooms
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.rooms.length}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 shrink-0">
                        <UsersIcon className="h-9 w-9 text-rose-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 truncate" title="Capacity">
                          Capacity
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.capacity}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] mt-10 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'}`}>
                  <div className="overflow-hidden px-4 -mx-4">
                    <div className="space-y-12 pb-4">
                      {building.rooms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                          <DoorIcon className="mx-auto h-12 w-12 text-gray-300" />
                          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-gray-400">
                            No rooms registered yet
                          </p>
                        </div>
                      ) : (
                        sortedFloors.map((floor) => (
                          <div key={floor} className="space-y-6">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2.5">
                                <span className="h-2 w-2 rounded-full bg-gray-400" />
                                <h4 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">
                                  Floor {floor}
                                </h4>
                              </div>
                              <div className="h-1 flex-1 bg-gray-200" />
                            </div>

                            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                              {roomsByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map((room) => (
                                <div
                                  key={room.id}
                                  onClick={() => handleOpenRoomInfoModal(room)}
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
                                        <h5 className="text-base font-bold leading-tight text-gray-900 truncate mt-1">
                                          {room.name}
                                        </h5>
                                        <div className="h-8 w-8 shrink-0"></div>
                                      </div>
                                      <p className="-mt-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                                        {room.type}
                                      </p>
                                    </div>

                                    <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-gray-200 shrink-0">
                                          <UserIcon className="h-4 w-4 text-gray-500" />
                                        </div>
                                        <span className="text-sm font-bold text-gray-700">
                                          {room.capacity} people
                                        </span>
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}
                                      >
                                        {room.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          }))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default ReserveRoomPage
