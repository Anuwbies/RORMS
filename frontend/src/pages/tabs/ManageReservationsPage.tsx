import { useState, useEffect, useMemo, useCallback } from 'react'
import { ClipboardIcon, SearchIcon, EditIcon, TrashIcon, CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, DoorIcon, CalendarIcon, UserIcon, BookIcon, BuildingIcon, LayersIcon, UsersIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { Button } from '../../components/Button'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { db } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore'

type ReservationStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'
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

interface Reservation {
  id: string
  userId: string
  roomId: string
  buildingId: string
  date: string
  startTime: string
  endTime: string
  status: ReservationStatus
  purpose?: string
  createdAt: any
  updatedAt?: any
  // Joined data
  requester?: {
    name: string
    email: string
    avatar: string
  }
  roomName?: string
  buildingName?: string
}

interface Building {
  id: string
  name: string
  code: string
  floor?: number
  capacity?: number
}

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

interface User {
  id: string
  fullName: string
  email: string
  profilePicture: string
}

const statusClasses: Record<ReservationStatus, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const STATUS_ORDER: ReservationStatus[] = ['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed']
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface StatusUpdateModalProps {
  reservation: Reservation
  onClose: () => void
  onUpdate: (id: string, newStatus: ReservationStatus) => Promise<void>
}

function StatusUpdateModal({ reservation, onClose, onUpdate }: StatusUpdateModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ReservationStatus>(reservation.status)
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      await onUpdate(reservation.id, selectedStatus)
      onClose()
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <h3 className="text-xl font-bold text-white">Update Status</h3>
          <p className="mt-1 text-sm text-white/80">Change the status of this reservation request.</p>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <img
                src={reservation.requester?.avatar}
                alt={reservation.requester?.name}
                className="h-10 w-10 rounded-full border border-slate-300 object-cover"
              />
              <div>
                <p className="text-sm font-bold text-slate-900">{reservation.requester?.name}</p>
                <p className="text-xs font-medium text-slate-500">{reservation.roomName}</p>
              </div>
            </div>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Select New Status
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                    selectedStatus === status
                      ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 text-[var(--brand-color)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusClasses[status].split(' ')[0]}`} />
                    {status}
                  </span>
                  {selectedStatus === status && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isUpdating}
              className="flex-1 h-12 text-base"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleUpdate}
              disabled={isUpdating || selectedStatus === reservation.status}
              className="flex-1 h-12 text-base"
            >
              {isUpdating ? 'Updating...' : 'Update Status'}
            </Button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={() => !isUpdating && onClose()} />
    </div>
  )
}

interface ConfirmationModalProps {
  reservation: Reservation
  type: 'decline' | 'delete'
  onConfirm: () => Promise<void>
  onClose: () => void
}

function ConfirmationModal({ reservation, type, onConfirm, onClose }: ConfirmationModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error(`Error during ${type} action:`, error)
    } finally {
      setIsProcessing(false)
    }
  }

  const isDecline = type === 'decline'
  const headerBg = 'bg-rose-600'
  const title = isDecline ? 'Decline Reservation' : 'Delete Reservation'
  const description = isDecline 
    ? 'Are you sure you want to decline this reservation request?' 
    : 'Are you sure you want to permanently delete this reservation record?'

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${headerBg} p-6 text-white`}>
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm text-white/80">{description}</p>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 overflow-hidden">
              {reservation.requester?.avatar && !avatarError ? (
                <img 
                  src={reservation.requester.avatar} 
                  alt="" 
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserIcon className="h-7 w-7" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{reservation.requester?.name}</p>
              <p className="text-xs font-medium text-slate-500">{reservation.roomName} • {reservation.buildingName}</p>
            </div>
          </div>

          <div className="rounded-xl p-4 border bg-rose-50 border-rose-100">
            <p className="text-xs leading-relaxed text-rose-700">
              <span className="font-bold uppercase tracking-wider">Warning:</span> {isDecline 
                ? 'This action will notify the requester that their reservation has been declined. This can be undone by manually changing the status later.' 
                : 'This action is permanent and cannot be undone. All data associated with this reservation record will be removed from the system.'}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 h-12 text-base"
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex-1 rounded-md h-12 text-base font-bold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed bg-rose-600 enabled:hover:bg-rose-700"
            >
              {isProcessing ? 'Processing...' : (isDecline ? 'Confirm Decline' : 'Confirm Delete')}
            </button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={() => !isProcessing && onClose()} />
    </div>
  )
}

interface ReservationDetailsModalProps {
  reservation: Reservation
  onClose: () => void
  onViewRoom: () => void
}

function ReservationDetailsModal({ reservation, onClose, onViewRoom }: ReservationDetailsModalProps) {
  const formatDateFull = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'N/A'
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50">
      <div 
        className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <h3 className="text-xl font-bold leading-tight">Reservation Information</h3>
          <p className="mt-1 text-sm text-white/80">Comprehensive details of the booking request</p>
        </div>

        <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
          <div className="p-6 space-y-5">
            <div className="flex gap-5">
              <div className="w-[9.5rem] h-[9.5rem] shrink-0 rounded-full border border-slate-200 bg-slate-100 overflow-hidden shadow-sm">
                <img 
                  src={reservation.requester?.avatar} 
                  alt={reservation.requester?.name} 
                  className="h-full w-full object-cover" 
                />
              </div>
              
              <div className="flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <h4 className="text-xl font-bold text-slate-900 leading-tight">{reservation.requester?.name}</h4>
                  <p className="text-sm text-slate-500 font-medium mt-1">{reservation.requester?.email}</p>
                  <div className="mt-3">
                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[reservation.status]}`}>
                      {reservation.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Reservation ID</p>
                    <p className="text-sm font-mono text-slate-700">{reservation.id}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Location</h5>
                  <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-700 bg-slate-50/80 h-[2.875rem] rounded-xl border border-slate-200/80">
                    <DoorIcon className="h-4 w-4 text-[var(--brand-color)]" />
                    <div className="truncate">
                      <span>{reservation.roomName} • {reservation.buildingName}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Schedule</h5>
                  <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-700 bg-slate-50/80 h-[2.875rem] rounded-xl border border-slate-200/80">
                    <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                    <span>{reservation.startTime} - {reservation.endTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Date</h5>
                <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-700 bg-slate-50/80 h-[2.875rem] rounded-xl border border-slate-200/80">
                  <CalendarIcon className="h-4 w-4 text-[var(--brand-color)]" />
                  <span>{formatDateFull(reservation.date)}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Purpose</h5>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm text-slate-600 leading-relaxed italic">
                    "{reservation.purpose || 'No purpose provided.'}"
                  </p>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Metadata</h5>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-tight">Created At:</span>
                    <span className="text-slate-600 font-medium">{formatTimestamp(reservation.createdAt)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-slate-400 uppercase tracking-tight">Updated At:</span>
                    <span className="text-slate-600 font-medium">{formatTimestamp(reservation.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 h-12 text-base"
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                className="flex-1 h-12 text-base flex items-center justify-center gap-2"
                onClick={onViewRoom}
              >
                <DoorIcon className="h-4 w-4" />
                View Room Information
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={onClose} />
    </div>
  )
}

interface RoomDetailsModalProps {
  room: Room
  onClose: () => void
}

function RoomDetailsModal({ room, onClose }: RoomDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50">
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
                  src={room.image} 
                  alt={room.name} 
                  className="h-full w-full object-cover grayscale-[0.2]" 
                  onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                />
              </div>
              
              <div className="flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <div className="flex items-center justify-start gap-3">
                    <h4 className="text-xl font-bold text-slate-900 leading-tight">{room.name}</h4>
                    <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-slate-600 border border-slate-200">
                      {room.code}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}>
                      {room.status}
                    </span>
                    <span className="text-sm text-slate-500 font-semibold">
                      {room.type} • Floor {room.floor}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Capacity</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-slate-500 shrink-0" />
                      <p className="text-sm font-bold text-slate-700">{room.capacity} pax</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Booking Limits</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-slate-500 shrink-0" />
                      <p className="text-sm font-bold text-slate-700">
                        {room.minBookingMins}m - {room.maxBookingMins}m
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
                    {room.description || 'No description provided for this room.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Availability</h5>
                  <div className="flex gap-1 h-[2.125rem]">
                    {DAYS_OF_WEEK.map((day) => {
                      const isAvailable = room.availableDays.includes(day)
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
                    <span>{room.startTime} - {room.endTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2.5">Room Amenities</h5>
                <div className="flex flex-wrap gap-1.5 max-h-[7.5rem] overflow-y-auto custom-scrollbar pr-1">
                  {room.amenities.length > 0 ? (
                    room.amenities.map((amenity, i) => (
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
                variant="brand"
                onClick={onClose}
                className="flex-1 h-12 text-base"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={onClose} />
    </div>
  )
}

function ManageReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [viewingReservation, setViewingReservation] = useState<Reservation | null>(null)
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null)
  const [confirmingAction, setConfirmingAction] = useState<{
    reservation: Reservation;
    type: 'decline' | 'delete';
  } | null>(null)

  useEffect(() => {
    const unsubRes = onSnapshot(query(collection(db, 'reservations'), orderBy('createdAt', 'desc')), (snapshot) => {
      setReservations(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data()
      })) as Reservation[])
    })

    const unsubBuildings = onSnapshot(collection(db, 'buildings'), (snapshot) => {
      setBuildings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Building[])
    })

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Room[])
    })

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[])
    })

    return () => {
      unsubRes()
      unsubBuildings()
      unsubRooms()
      unsubUsers()
    }
  }, [])

  const enrichedReservations = useMemo(() => {
    return reservations.map(res => {
      const user = users.find(u => u.id === res.userId)
      const room = rooms.find(r => r.id === res.roomId)
      const building = buildings.find(b => b.id === res.buildingId)

      return {
        ...res,
        requester: {
          name: user?.fullName || 'Unknown User',
          email: user?.email || 'No Email',
          avatar: user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.fullName || 'U')}&background=random`,
        },
        roomName: room?.name || 'Unknown Room',
        buildingName: building?.name || 'Unknown Building'
      }
    })
  }, [reservations, users, rooms, buildings])

  const filteredReservations = useMemo(() => {
    return enrichedReservations
      .filter((res) => {
        const matchesSearch = [
          res.requester?.name,
          res.requester?.email,
          res.roomName,
          res.buildingName,
          res.status
        ].some((val) => val?.toLowerCase().includes(searchTerm.toLowerCase()))

        const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(res.status)
        const matchesBuilding = selectedBuildings.length === 0 || selectedBuildings.includes(res.buildingName || '')

        return matchesSearch && matchesStatus && matchesBuilding
      })
      .sort((a, b) => {
        const orderA = STATUS_ORDER.indexOf(a.status)
        const orderB = STATUS_ORDER.indexOf(b.status)
        if (orderA !== orderB) return orderA - orderB
        // Secondary sort by date (descending)
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }, [enrichedReservations, searchTerm, selectedStatuses, selectedBuildings])

  const handleApprove = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reservations', id), {
        status: 'Approved',
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error approving reservation:', error)
    }
  }

  const handleStatusUpdate = async (id: string, newStatus: ReservationStatus) => {
    try {
      await updateDoc(doc(db, 'reservations', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error updating status:', error)
      throw error
    }
  }

  const handleReject = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reservations', id), {
        status: 'Declined',
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error declining reservation:', error)
      throw error
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reservations', id))
    } catch (error) {
      console.error('Error deleting reservation:', error)
      throw error
    }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const month = d.toLocaleDateString('en-US', { month: 'short' })
    const day = d.getDate()
    const year = d.getFullYear()
    return `${month} ${day}, ${year}`
  }

  const handleViewRoomInfo = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (room) {
      setViewingRoom(room)
    }
  }

  const columns: ColumnDef<typeof enrichedReservations[0]>[] = [
    {
      header: 'Requester',
      width: '25%',
      render: (res) => (
        <div className="flex items-center gap-4">
          <img
            src={res.requester?.avatar}
            alt={res.requester?.name}
            className="h-10 w-10 rounded-full border border-slate-200 object-cover ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300 shadow-sm"
          />
          <div>
            <p className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{res.requester?.name}</p>
            <p className="text-xs font-medium text-slate-500">{res.requester?.email}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Room',
      width: '25%',
      render: (res) => {
        const room = rooms.find(r => r.id === res.roomId)
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
                {res.roomName}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {res.buildingName}
              </span>
            </div>
          </div>
        )
      }
    },
    {
      header: 'Date & Time',
      width: '20%',
      render: (res) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
            {formatDate(res.date)}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {res.startTime} - {res.endTime}
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      width: '15%',
      render: (res) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[res.status] || 'bg-slate-100 text-slate-700'}`}>
          {res.status}
        </span>
      )
    },
    {
      header: 'Actions',
      width: '15%',
      align: 'right',
      render: (res) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Approve reservation"
            disabled={res.status !== 'Pending'}
            className={`h-8 w-8 rounded-lg bg-white transition-all border border-slate-200 ${
              res.status === 'Pending' 
                ? 'text-emerald-500 hover:border-emerald-300 hover:text-emerald-600 hover:shadow hover:-translate-y-0.5' 
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            onClick={() => handleApprove(res.id)}
          >
            <CheckIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Decline reservation"
            disabled={res.status !== 'Pending'}
            className={`h-8 w-8 rounded-lg bg-white transition-all border border-slate-200 ${
              res.status === 'Pending' 
                ? 'text-rose-500 hover:border-rose-300 hover:text-rose-600 hover:shadow hover:-translate-y-0.5' 
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            onClick={() => setConfirmingAction({ reservation: res, type: 'decline' })}
          >
            <CloseIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Edit status"
            className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
            onClick={() => setEditingReservation(res)}
          >
            <EditIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Delete reservation"
            className="h-8 w-8 rounded-lg bg-white text-rose-500 shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5 transition-all"
            onClick={() => setConfirmingAction({ reservation: res, type: 'delete' })}
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      )
    }
  ]

  const buildingOptions = useMemo(() => {
    return Array.from(new Set(buildings.map(b => b.name))).sort()
  }, [buildings])

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
      options: STATUS_ORDER,
      selectedValues: selectedStatuses,
      onChange: setSelectedStatuses
    }
  ]

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader 
          title="Manage Reservations" 
          description="Review, approve, or decline room booking requests from faculty and staff." 
        />

        <div className="relative z-10">
          <DataTable
            data={filteredReservations}
            columns={columns}
            searchPlaceholder="Search reservations..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={<FilterDropdown groups={filterGroups} />}
            emptyTitle="No reservations found"
            emptyDescription="No reservations found matching your filters."
            emptyIcon={<ClipboardIcon className="h-12 w-12" />}
            onRowClick={(res) => setViewingReservation(res)}
          />
        </div>

      {viewingReservation && (
        <ReservationDetailsModal
          reservation={viewingReservation}
          onClose={() => setViewingReservation(null)}
          onViewRoom={() => {
            handleViewRoomInfo(viewingReservation.roomId)
            setViewingReservation(null)
          }}
        />
      )}

      {viewingRoom && (
        <RoomDetailsModal
          room={viewingRoom}
          onClose={() => setViewingRoom(null)}
        />
      )}

      {editingReservation && (
        <StatusUpdateModal
          reservation={editingReservation}
          onClose={() => setEditingReservation(null)}
          onUpdate={handleStatusUpdate}
        />
      )}

      {confirmingAction && (
        <ConfirmationModal
          reservation={confirmingAction.reservation}
          type={confirmingAction.type}
          onConfirm={() => confirmingAction.type === 'decline' ? handleReject(confirmingAction.reservation.id) : handleDelete(confirmingAction.reservation.id)}
          onClose={() => setConfirmingAction(null)}
        />
      )}
      </div>
    </section>
  )
}

export default ManageReservationsPage
