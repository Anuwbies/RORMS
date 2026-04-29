import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { DoorIcon, ClockIcon, CalendarIcon, UserIcon, BuildingIcon, ClipboardIcon, CheckIcon, ChevronDownIcon, SearchIcon, LayersIcon, UsersIcon, BookIcon } from '../../components/Icons'
import { SearchFilters } from '../../components/SearchFilters'
import { db, auth } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  where,
  orderBy
} from 'firebase/firestore'

type ReservationStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'

interface Reservation {
  id: string
  roomId: string
  buildingId: string
  userId: string
  date: string
  startTime: string
  endTime: string
  duration: number
  purpose: string
  status: ReservationStatus
  createdAt: any
  updatedAt: any
}

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

interface Room {
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
  buildingId: string
}

interface Building {
  id: string
  name: string
  code: string
}

const statusClasses: Record<ReservationStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700 border-amber-200',
  Approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Declined: 'bg-rose-100 text-rose-700 border-rose-200',
  Cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
  Completed: 'bg-blue-100 text-blue-700 border-blue-200',
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function createRoomImage() {
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

const DEFAULT_ROOM_IMAGE = createRoomImage()

interface MultiSelectDropdownProps<T extends string> {
  label: string
  options: T[]
  selectedValues: T[]
  onChange: (values: T[]) => void
  className?: string
  onToggle?: (isOpen: boolean) => void
}

function MultiSelectDropdown<T extends string>({ 
  label, 
  options, 
  selectedValues, 
  onChange, 
  className = '',
  onToggle
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (option: T) => {
    const nextValues = selectedValues.includes(option)
      ? selectedValues.filter((v) => v !== option)
      : [...selectedValues, option]
    onChange(nextValues)
  }

  const displayText = selectedValues.length === 0 
    ? label 
    : selectedValues.length === 1 
      ? selectedValues[0] 
      : `${selectedValues[0]} +${selectedValues.length - 1}`

  const longestOption = options.reduce((a, b) => (a.length > (b?.length || 0) ? a : b), label)
  const widestTriggerText = [label, longestOption, `${longestOption} +${Math.max(options.length - 1, 0)}`]
    .reduce((a, b) => (a.length > (b?.length || 0) ? a : b))

  useLayoutEffect(() => {
    if (!menuWidthRef.current) return
    setMenuMinWidth(menuWidthRef.current.offsetWidth)
  }, [longestOption])

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
      style={menuMinWidth ? { minWidth: `${menuMinWidth}px` } : undefined}
    >
      <div
        ref={menuWidthRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-md border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold">
          <span className="h-4 w-4 shrink-0 rounded border border-transparent" />
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white pl-4 pr-3 py-3 text-sm font-bold text-gray-600 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
      >
        <div className="relative flex items-center">
          <span className="invisible h-0 overflow-hidden whitespace-nowrap font-bold" aria-hidden="true">
            {widestTriggerText}
          </span>
          <span className="absolute left-0 whitespace-nowrap text-gray-900">{displayText}</span>
        </div>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-20 mt-2 min-w-full overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)]' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)] border-[var(--brand-color)]' 
                      : 'border-gray-300 bg-white group-hover:border-gray-400'
                  }`}>
                    {isSelected && <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className="whitespace-nowrap">{option}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ReservationItem({ 
  res, 
  room, 
  building,
  onViewRoomInfo
}: { 
  res: Reservation, 
  room?: Room, 
  building?: Building,
  onViewRoomInfo: (room: Room) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div 
      className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition hover:shadow-md cursor-pointer group"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Status Indicator Bar */}
        <div className={`w-full sm:w-2 ${statusClasses[res.status].split(' ')[0]}`} />
        
        <div className="flex-1 p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            {/* Header Area - Always Visible */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-xl font-bold text-gray-900">{room?.name || 'Unknown Room'}</h4>
                <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
                  {room?.code || 'N/A'}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border ${statusClasses[res.status]}`}>
                  {res.status}
                </span>
              </div>

              <div className="flex items-center justify-between gap-6">
                {/* Collapsed view date/time */}
                {!isExpanded && (
                  <div className="flex items-center gap-4 text-gray-500 animate-in fade-in duration-300">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="h-4 w-4 text-gray-400" />
                      <span className="text-xs font-bold">
                        {new Date(res.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="h-4 w-4 text-gray-400" />
                      <span className="text-xs font-bold">{res.startTime} - {res.endTime}</span>
                    </div>
                  </div>
                )}
                
                <div className={`flex h-8 w-8 items-center justify-center rounded-md border transition-all ${
                  isExpanded 
                    ? 'bg-gray-100 border-gray-200 shadow-inner' 
                    : 'bg-white border-gray-100 group-hover:border-gray-200 group-hover:shadow-sm'
                }`}>
                  <ChevronDownIcon className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="space-y-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center gap-3 text-gray-600">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 border border-gray-100">
                      <BuildingIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Building</span>
                      <span className="text-sm font-bold">{building?.name || 'Unknown'} ({building?.code || 'N/A'})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-gray-600">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 border border-gray-100">
                      <CalendarIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Date</span>
                      <span className="text-sm font-bold">{new Date(res.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-gray-600">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 border border-gray-100">
                      <ClockIcon className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Schedule</span>
                      <span className="text-sm font-bold">{res.startTime} - {res.endTime} ({res.duration}m)</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-md bg-gray-50 p-4 border border-gray-100">
                  <div className="flex items-center gap-3">
                    <ClipboardIcon className="h-6 w-6 text-gray-400 shrink-0" />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[12px] font-bold uppercase tracking-widest text-gray-400 leading-tight">Purpose</span>
                      <p className="text-sm text-gray-600 font-medium leading-5">{res.purpose}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-gray-100 pt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      room && onViewRoomInfo(room)
                    }}
                    className="flex items-center gap-2 self-start rounded-md border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm"
                  >
                    <SearchIcon className="h-3.5 w-3.5" />
                    View Room Information
                  </button>
                  <div className="flex flex-col gap-1 lg:items-end">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Requested on</span>
                    <span className="text-xs font-bold text-gray-500">
                      {res.createdAt?.toDate 
                        ? `${res.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${res.createdAt.toDate().toLocaleTimeString('en-US')}`
                        : 'Just now'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MyReservationsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Record<string, Room>>({})
  const [buildings, setBuildings] = useState<Record<string, Building>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<ReservationStatus[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setSelectedRoomInfo(null)
  }

  useEffect(() => {
    const userId = auth.currentUser?.uid
    if (!userId) return

    const reservationsQuery = query(
      collection(db, 'reservations'),
      where('userId', '==', userId)
    )

    const statusOrder: Record<ReservationStatus, number> = {
      Pending: 0,
      Approved: 1,
      Declined: 2,
      Cancelled: 3,
      Completed: 4,
    }

    const unsubscribeReservations = onSnapshot(reservationsQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation))
      // Sort by status, then date (asc), then startTime (asc)
      list.sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status]
        if (statusDiff !== 0) return statusDiff

        const dateDiff = a.date.localeCompare(b.date)
        if (dateDiff !== 0) return dateDiff

        return a.startTime.localeCompare(b.startTime)
      })
      setReservations(list)
      setLoading(false)
    })

    const unsubscribeRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const map: Record<string, Room> = {}
      snapshot.docs.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() } as Room
      })
      setRooms(map)
    })

    const unsubscribeBuildings = onSnapshot(collection(db, 'buildings'), (snapshot) => {
      const map: Record<string, Building> = {}
      snapshot.docs.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() } as Building
      })
      setBuildings(map)
    })

    return () => {
      unsubscribeReservations()
      unsubscribeRooms()
      unsubscribeBuildings()
    }
  }, [])

  const buildingOptions = useMemo(() => {
    return Array.from(new Set(Object.values(buildings).map(b => b.name))).sort()
  }, [buildings])

  const filteredReservations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    
    return reservations.filter(res => {
      const room = rooms[res.roomId]
      const building = buildings[res.buildingId]
      
      // 1. Filter by status
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(res.status)) {
        return false
      }

      // 2. Filter by building
      if (selectedBuildings.length > 0 && building && !selectedBuildings.includes(building.name)) {
        return false
      }

      // 3. Filter by search term
      if (!normalizedSearch) return true

      return [
        room?.name || '',
        room?.code || '',
        building?.name || '',
        building?.code || '',
        res.purpose,
        res.status,
        res.date
      ].some(val => val.toLowerCase().includes(normalizedSearch))
    })
  }, [reservations, rooms, buildings, searchTerm, selectedStatuses, selectedBuildings])

  const pendingCount = reservations.filter(r => r.status === 'Pending').length
  const approvedCount = reservations.filter(r => r.status === 'Approved').length
  const declinedCount = reservations.filter(r => r.status === 'Declined').length
  const cancelledCount = reservations.filter(r => r.status === 'Cancelled').length
  const completedCount = reservations.filter(r => r.status === 'Completed').length

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Room Information Modal (Read-only) */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details and availability schedule</p>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <div className="w-[152px] h-[152px] shrink-0 rounded-md border border-gray-200 bg-gray-100 overflow-hidden shadow-sm">
                    <img 
                      src={selectedRoomInfo.image} 
                      alt={selectedRoomInfo.name} 
                      className="h-full w-full object-cover grayscale-[0.2]" 
                      onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                    />
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-start gap-3">
                        <h4 className="text-xl font-bold text-gray-900 leading-tight">{selectedRoomInfo.name}</h4>
                        <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
                          {selectedRoomInfo.code}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-sm text-gray-500 font-semibold">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Capacity</p>
                        <div className="rounded-md border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-gray-500 shrink-0" />
                          <p className="text-sm font-bold text-gray-700">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Booking Limits</p>
                        <div className="rounded-md border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-gray-500 shrink-0" />
                          <p className="text-sm font-bold text-gray-700">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Description</h5>
                    <div className="rounded-md border border-gray-200 bg-gray-100 p-4">
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {selectedRoomInfo.description || 'No description provided for this room.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Availability</h5>
                      <div className="flex gap-1 h-[34px]">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays?.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-sm text-[10px] font-bold transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white' : 'bg-gray-200 text-gray-500'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Schedule</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-gray-700 bg-gray-100 h-[34px] rounded-md border border-gray-200">
                        <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">Room Amenities</h5>
                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                      {selectedRoomInfo.amenities?.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="flex-1 min-w-[fit-content] flex items-center justify-center gap-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-bold text-gray-600 shadow-sm whitespace-nowrap"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm italic text-gray-400">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleCloseModals}
                    className="flex-1 rounded-md border border-gray-200 bg-[var(--brand-color)] py-3 text-sm font-bold text-white transition hover:bg-[#526f34] shadow-md"
                  >
                    Close
                  </button>
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

      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              My Reservations
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              View your current room bookings, historical reservations, and active requests.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                  <ClockIcon className="h-9 w-9 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Pending</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{pendingCount}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 shrink-0">
                  <CheckIcon className="h-9 w-9 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Approved</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{approvedCount}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rose-50 border border-rose-100 shrink-0">
                  <DoorIcon className="h-9 w-9 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Declined</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{declinedCount}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-gray-100 border border-gray-200 shrink-0">
                  <CalendarIcon className="h-9 w-9 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Cancelled</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{cancelledCount}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <ClipboardIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Completed</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{completedCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search by room, building, purpose or status..."
          dropdowns={
            <>
              <MultiSelectDropdown
                label="Building"
                options={buildingOptions}
                selectedValues={selectedBuildings}
                onChange={setSelectedBuildings}
                className="w-full sm:w-auto"
              />
              <MultiSelectDropdown
                label="Status"
                options={['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed']}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
                className="w-full sm:w-auto"
              />
            </>
          }
        />

        <div className="space-y-4">
          {loading ? (
            <div className="py-20 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--brand-color)] border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <p className="mt-4 text-sm font-bold text-gray-500 uppercase tracking-widest">Loading your reservations...</p>
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-200 bg-white p-12 text-center shadow-sm">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-lg font-semibold text-gray-900">No reservations found</p>
              <p className="mt-2 text-sm text-gray-500">Try adjusting your filters or make a new reservation.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredReservations.map((res) => {
                const room = rooms[res.roomId]
                const building = buildings[res.buildingId]

                return (
                  <ReservationItem 
                    key={res.id}
                    res={res}
                    room={room}
                    building={building}
                    onViewRoomInfo={handleOpenRoomInfoModal}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default MyReservationsPage
