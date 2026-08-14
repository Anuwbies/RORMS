import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { UserIcon, SearchIcon, CheckIcon, ClipboardIcon, BookIcon, BuildingIcon, DoorIcon, UsersIcon } from '../../components/Icons'
import { Button } from '../../components/Button'
import { SummaryCard } from '../../components/SummaryCard'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { BuildingBrowser } from '../../components/BuildingBrowser'
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

import type { Room, Building, RoomStatus } from '../../types/room'
import { DEFAULT_ROOM_IMAGE, roomStatusClasses, DAYS_OF_WEEK } from '../../types/room'

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
  const [isLoading, setIsLoading] = useState(true)
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

  useEffect(() => {
    localStorage.setItem('rorms_reserve_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

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
  const [roomInfoSource, setRoomInfoSource] = useState<'main' | 'searchResults'>('main')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reservationData, setReservationData] = useState({
    date: getLocalIsoDate(),
    startTime: '07:30',
    duration: 60,
    purpose: '',
    attendees: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({})

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
      attendees: ''
    })
  }

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setIsReservationModalOpen(false)
    setIsFindRoomModalOpen(false)
    setIsSearchResultsModalOpen(false)
    setSelectedRoomInfo(null)
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const roomTypes = useMemo(() => Array.from(new Set(allRooms.map(r => r.type))).sort(), [allRooms])
  const allAmenities = useMemo(() => Array.from(new Set(allRooms.flatMap(r => r.amenities))).sort(), [allRooms])
  
  const selectedBuildingObj = useMemo(() => buildings.find(b => b.name === findRoomData.building), [buildings, findRoomData.building])
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
            className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
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
                      options={selectedBuildingObj ? ['Any Floor', ...floorOptions] : ['Select Building First']}
                      value={!selectedBuildingObj ? 'Select Building First' : (findRoomData.floor || 'Any Floor')}
                      onChange={(val) => {
                        if (val !== 'Select Building First') {
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
                      onChange={(time) => setFindRoomData({ ...findRoomData, startTime: time })}
                      minuteStep={30}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Duration (mins)</label>
                    <SingleSelectDropdown
                      options={['Any Duration', '30', '60', '90', '120', '150', '180']}
                      value={findRoomData.duration ? findRoomData.duration.toString() : 'Any Duration'}
                      onChange={(val) => setFindRoomData({ ...findRoomData, duration: val === 'Any Duration' ? '' : Number(val) })}
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
                    const buildingReq = findRoomData.building ? buildings.find(b => b.name === findRoomData.building)?.id : null
                    
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
            className="w-[80vw] h-[80vh] flex flex-col rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
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
            onClick={() => {
              if (selectedRoomInfo) {
                handleOpenReservationModal(selectedRoomInfo)
              }
            }}
            icon={<BookIcon className="h-4 w-4" />}
            className="flex-1"
          >
            Reserve Room
          </Button>
        }
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

                  {/* Attendees */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Attendees <span className="text-rose-500">*</span></label>
                    <NumberInput
                      min={1}
                      max={selectedRoomInfo.capacity}
                      value={reservationData.attendees}
                      onChange={(val) => {
                        setReservationData({ ...reservationData, attendees: val })
                        if (val) setFormErrors(prev => ({ ...prev, attendees: false }))
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsReservationModalOpen(false)
                    setIsRoomInfoModalOpen(true)
                  }}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  variant="brand"
                  disabled={isSubmitting}
                  className="flex-1"
                  onClick={async () => {
                    const errors: Record<string, boolean> = {}
                    if (!reservationData.date) errors.date = true
                    if (!reservationData.startTime) errors.startTime = true
                    if (!reservationData.duration || isNaN(reservationData.duration)) errors.duration = true
                    if (!reservationData.attendees || isNaN(Number(reservationData.attendees))) errors.attendees = true
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
                        attendees: Number(reservationData.attendees),
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
                </Button>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Available Rooms"
            subtitle="Currently ready to book"
            icon={<DoorIcon className="w-5 h-5 text-emerald-600" />}
            gradientClasses="from-emerald-200 to-emerald-100"
            outlineClasses="bg-emerald-500"
            blobClasses="bg-emerald-500/5"
          >
            <div className="flex-1 flex flex-col items-center justify-center py-3">
              <span className="text-4xl font-black text-slate-800 tracking-tight">{availableRoomsCount}</span>
            </div>
          </SummaryCard>

          <SummaryCard
            title="Total Buildings"
            subtitle="Campus facilities managed"
            icon={<BuildingIcon className="w-5 h-5 text-amber-600" />}
            gradientClasses="from-amber-200 to-amber-100"
            outlineClasses="bg-amber-500"
            blobClasses="bg-amber-500/5"
          >
            <div className="flex-1 flex flex-col items-center justify-center py-3">
              <span className="text-4xl font-black text-slate-800 tracking-tight">{buildings.length}</span>
            </div>
          </SummaryCard>

          <SummaryCard
            title="Total Capacity"
            subtitle="Maximum campus occupancy"
            icon={<UsersIcon className="w-5 h-5 text-sky-600" />}
            gradientClasses="from-sky-200 to-sky-100"
            outlineClasses="bg-sky-500"
            blobClasses="bg-sky-500/5"
          >
            <div className="flex-1 flex flex-col items-center justify-center py-3">
              <span className="text-4xl font-black text-slate-800 tracking-tight">{totalCapacity}</span>
            </div>
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
            <Button
              variant="brand"
              icon={<BookIcon className="h-4 w-4" />}
              onClick={() => setIsFindRoomModalOpen(true)}
              className="w-full lg:w-auto"
            >
              Reserve Room
            </Button>
          }
        />
      </div>
    </section>
  )
}

export default ReserveRoomPage
