import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import { DoorIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, ClockIcon, BookIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { db } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore'

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

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
}

interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

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

  const longestOption = options.reduce((a, b) => (a.length > b.length ? a : b), label)
  const widestTriggerText = [label, longestOption, `${longestOption} +${Math.max(options.length - 1, 0)}`]
    .reduce((a, b) => (a.length > b.length ? a : b))

  useLayoutEffect(() => {
    if (!menuWidthRef.current) {
      return
    }

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

function ReserveRoomPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  
  const [selectedStatuses, setSelectedStatuses] = useState<RoomStatus[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [activeDropdowns, setActiveDropdowns] = useState(0)

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  const buildingOptions = useMemo(() => buildings.map(b => b.code).sort(), [buildings])

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)

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

      // Auto-expand new buildings if they weren't already tracked
      setExpandedBuildingIds(prev => {
        const newIds = mergedBuildings.map(b => b.id).filter(id => !prev.includes(id))
        return [...prev, ...newIds]
      })
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

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setSelectedRoomInfo(null)
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const availableRoomsCount = allRooms.filter(room => room.status === 'Available').length
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)

  const filteredBuildings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    
    return buildings
      .map((building) => {
        // 1. Filter by building selection
        if (selectedBuildings.length > 0 && !selectedBuildings.includes(building.code)) {
          return null
        }

        // 2. Filter rooms by status
        let matchingRooms = building.rooms
        if (selectedStatuses.length > 0) {
          matchingRooms = matchingRooms.filter(room => selectedStatuses.includes(room.status))
        }

        // 3. Filter by search term
        if (normalizedSearch) {
          const buildingMatchesSearch = [
            building.name,
            building.code,
            String(building.floor),
            String(building.rooms.length),
            String(building.capacity),
          ].some((value) => value.toLowerCase().includes(normalizedSearch))

          if (!buildingMatchesSearch) {
            matchingRooms = matchingRooms.filter((room) =>
              [
                room.name,
                room.code,
                room.type,
                String(room.capacity),
                room.status,
              ].some((value) => value.toLowerCase().includes(normalizedSearch)),
            )
          }
        }

        if (matchingRooms.length === 0) {
          return null
        }

        return {
          ...building,
          rooms: matchingRooms,
        }
      })
      .filter((building): building is Building => building !== null)
  }, [buildings, searchTerm, selectedStatuses, selectedBuildings])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Room Information Modal (Read-only) */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details and availability schedule</p>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <div className="w-32 h-32 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden shadow-sm">
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
                        <h4 className="text-lg font-bold text-gray-900 leading-tight">{selectedRoomInfo.name}</h4>
                        <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
                          {selectedRoomInfo.code}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2 flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">Capacity</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2 flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">Booking Limits</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1.5">Description</h5>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {selectedRoomInfo.description || 'No description provided for this room.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Availability</h5>
                      <div className="flex gap-1 h-[30px]">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-sm text-[9px] font-bold transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white' : 'bg-gray-100 text-gray-300'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Schedule</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-xs font-bold text-gray-700 bg-gray-50 h-[30px] rounded-md border border-gray-100">
                        <ClockIcon className="h-3.5 w-3.5 text-[var(--brand-color)]" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2.5">Room Amenities</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRoomInfo.amenities.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-100 bg-white px-2 py-1 text-[10px] font-bold text-gray-600 shadow-sm"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-[10px] italic text-gray-400">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleCloseModals}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-2.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm"
                  >
                    Close
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#526f34]"
                    onClick={() => {
                      // Placeholder for reservation action
                      alert("Reservation flow would start here.")
                    }}
                  >
                    <BookIcon className="h-3.5 w-3.5" />
                    Reserve Room
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (activeDropdowns > 0) return
              handleCloseModals()
            }} 
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Reserve a Room
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Find and book available rooms for classes, meetings, or special events.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-purple-50 border border-purple-100 shrink-0">
                  <BookIcon className="h-9 w-9 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Available Rooms</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{availableRoomsCount}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <BuildingIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total buildings</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{buildings.length}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                  <LayersIcon className="h-9 w-9 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total floors</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{totalFloors}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rose-50 border border-rose-100 shrink-0">
                  <UsersIcon className="h-9 w-9 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total room capacity</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{totalCapacity}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search by building name, room code, status, capacity..."
          dropdowns={
            <>
              <MultiSelectDropdown
                label="Building"
                options={buildingOptions}
                selectedValues={selectedBuildings}
                onChange={setSelectedBuildings}
                onToggle={handleDropdownToggle}
                className="w-full sm:w-auto"
              />
              <MultiSelectDropdown
                label="Status"
                options={['Available', 'Occupied', 'Reserved', 'Maintenance']}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
                onToggle={handleDropdownToggle}
                className="w-full sm:w-auto"
              />
            </>
          }
        />

        <div className="space-y-6">
          {filteredBuildings.length === 0 ? (
            <div className="rounded-md border border-dashed border-[color:rgba(98,133,62,0.2)] bg-[var(--card-surface)] p-8 text-center shadow-[0_18px_45px_rgba(98,133,62,0.06)]">
              <p className="text-lg font-semibold text-[var(--brand-color)]">
                No matching buildings or rooms
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(98,133,62,0.78)]">
                Try a different building name, room code, status, or capacity.
              </p>
            </div>
          ) : filteredBuildings.map((building) => {
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
                className="rounded-lg border border-gray-200 bg-gray-50/50 p-6 shadow-md sm:p-8"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                          {building.name}
                        </h3>
                        <span className="inline-flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-600 shadow-sm leading-none">
                          {building.code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <IconButton
                        label={isExpanded ? 'Collapse building' : 'Expand building'}
                        onClick={() => toggleBuilding(building.id)}
                        className="h-10 w-10 shrink-0 rounded-md border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
                      >
                        <ChevronDownIcon
                          className={`h-6 w-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                        <LayersIcon className="h-9 w-9 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                          Floor
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.floor}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 shrink-0">
                        <DoorIcon className="h-9 w-9 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                          Rooms
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.rooms.length}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rose-50 border border-rose-100 shrink-0">
                        <UsersIcon className="h-9 w-9 text-rose-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
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
                        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
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

                            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,500px),1fr))]">
                              {roomsByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map((room) => (
                                <div
                                  key={room.id}
                                  onClick={() => handleOpenRoomInfoModal(room)}
                                  className="flex overflow-hidden rounded-md border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02] cursor-pointer"
                                >
                                  <img
                                    src={room.image}
                                    alt={room.name}
                                    className="aspect-square w-32 h-32 shrink-0 object-cover grayscale-[0.2] sm:w-40 sm:h-40"
                                    onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                                  />

                                  <div className="flex flex-1 flex-col justify-between p-4">
                                    <div>
                                      <div className="flex items-start justify-between gap-2">
                                        <h5 className="text-lg font-bold leading-tight text-gray-900">
                                          {room.name}
                                        </h5>
                                      </div>
                                      <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-gray-400">
                                        {room.type}
                                      </p>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white border border-gray-200 shrink-0">
                                          <UserIcon className="h-6 w-6 text-gray-500" />
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">
                                            Capacity
                                          </span>
                                          <span className="text-sm font-bold text-gray-700 leading-none mt-0.5">
                                            {room.capacity} people
                                          </span>
                                        </div>
                                      </div>
                                      <span
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}
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
          })}
        </div>
      </div>
    </section>
  )
}

export default ReserveRoomPage
