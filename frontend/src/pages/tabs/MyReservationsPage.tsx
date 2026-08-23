import { useState, useEffect, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { ClockIcon, UserIcon, SearchIcon, CalendarIcon, PlusIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { Button } from '../../components/Button'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { SummaryCard } from '../../components/SummaryCard'
import { db, auth } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  where
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
  attendees?: number
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
  Pending: 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
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

function MyReservationsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [rooms, setRooms] = useState<Record<string, Room>>({})
  const [buildings, setBuildings] = useState<Record<string, Building>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])

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
    if (!userId) {
      return
    }

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

  const columns: ColumnDef<Reservation>[] = [
    {
      header: 'Room',
      width: '20%',
      render: (res) => {
        const room = rooms[res.roomId]
        const building = buildings[res.buildingId]
        return (
          <div className="flex items-center gap-4">
            <img
              src={room?.image || DEFAULT_ROOM_IMAGE}
              alt={room?.name || 'Room'}
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                {room?.name || 'Unknown Room'}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {building?.name || 'Unknown Building'}
              </span>
            </div>
          </div>
        )
      }
    },
    {
      header: 'Attendee',
      width: '20%',
      render: (res) => {
        const count = res.attendees || 1
        return (
          <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
            {count} {count === 1 ? 'Attendee' : 'Attendees'}
          </span>
        )
      }
    },
    {
      header: 'Date & Time',
      width: '20%',
      render: (res) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
            {new Date(res.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {res.startTime} - {res.endTime}
          </span>
        </div>
      )
    },
    {
      header: 'Requested Date',
      width: '20%',
      render: (res) => (
        <span className="text-sm font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
          {res.createdAt?.toDate 
            ? `${res.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'Just now'}
        </span>
      )
    },
    {
      header: 'Status',
      width: '20%',
      render: (res) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[res.status]}`}>
          {res.status}
        </span>
      )
    },
    {
      header: 'Actions',
      width: '1%',
      align: 'right',
      render: (res) => {
        const room = rooms[res.roomId]
        return (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton
              label="View Room"
              onClick={() => {
                if (room) handleOpenRoomInfoModal(room)
              }}
              className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
            >
              <SearchIcon className="h-4 w-4" />
            </IconButton>
          </div>
        )
      }
    }
  ]

  const filterGroups: FilterGroup[] = [
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
      options: ['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed'],
      selectedValues: selectedStatuses,
      onChange: setSelectedStatuses
    }
  ]

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Room Information Modal (Read-only) */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="mt-1 text-sm text-white/80">Comprehensive details and availability schedule</p>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <div className="w-[9.5rem] h-[9.5rem] shrink-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shadow-sm">
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
                        <h4 className="text-xl font-bold text-slate-900 leading-tight">{selectedRoomInfo.name}</h4>
                        <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-slate-600 border border-slate-200">
                          {selectedRoomInfo.code}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-sm text-slate-500 font-semibold">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Capacity</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-slate-500 shrink-0" />
                          <p className="text-sm font-bold text-slate-700">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Booking Limits</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-slate-500 shrink-0" />
                          <p className="text-sm font-bold text-slate-700">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Description</h5>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {selectedRoomInfo.description || 'No description provided for this room.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Availability</h5>
                      <div className="flex gap-1 h-[2.125rem]">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays?.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-md text-[0.625rem] font-bold transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white' : 'bg-slate-200 text-slate-500'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Schedule</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-700 bg-slate-50/80 h-[2.125rem] rounded-xl border border-slate-200/80">
                        <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2.5">Room Amenities</h5>
                    <div className="flex flex-wrap gap-1.5 max-h-[7.5rem] overflow-y-auto custom-scrollbar pr-1">
                      {selectedRoomInfo.amenities?.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="flex-1 min-w-[fit-content] flex items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm whitespace-nowrap"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm italic text-slate-400">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex pt-2">
                  <Button
                    type="button"
                    variant="brand"
                    onClick={handleCloseModals}
                    className="flex-1 h-12 text-base"
                  >
                    Close
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

      <div className="space-y-6">
        <SectionHeader 
          title="My Reservations" 
          description="Track your room bookings, check their status, and manage upcoming schedules." 
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            title="Card 1"
            subtitle="Subtitle 1"
            icon={<UserIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          />
          <SummaryCard
            title="Card 2"
            subtitle="Subtitle 2"
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          />
          <SummaryCard
            title="Card 3"
            subtitle="Subtitle 3"
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-400 to-indigo-500"
            blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
          />
        </div>

        <div className="relative z-10">
          <DataTable
            data={filteredReservations}
            columns={columns}
            searchPlaceholder="Search by room, building, purpose or status..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={<FilterDropdown groups={filterGroups} />}
            primaryAction={
              <Button
                variant="brand"
                className="w-full lg:w-auto"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'reserveRoom' }))
                }}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Reserve Room
              </Button>
            }
            emptyTitle="No reservations found"
            emptyDescription="Try adjusting your filters or make a new reservation."
            emptyIcon={<CalendarIcon className="h-12 w-12" />}
            onRowClick={(res) => {
              const room = rooms[res.roomId]
              if (room) handleOpenRoomInfoModal(room)
            }}
          />
        </div>
      </div>
    </section>
  )
}

export default MyReservationsPage
