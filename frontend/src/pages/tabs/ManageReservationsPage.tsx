import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { ClipboardIcon, SearchIcon, EditIcon, TrashIcon, CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, DoorIcon, CalendarIcon, UserIcon, BookIcon, BuildingIcon, LayersIcon, UsersIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
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
  Cancelled: 'bg-gray-100 text-gray-700',
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
        className="relative flex h-[46px] w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white pl-4 pr-3 py-3 text-sm font-bold text-gray-600 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
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
        <div className="absolute left-0 z-50 mt-2 min-w-full overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
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
        className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <h3 className="text-xl font-bold text-white">Update Status</h3>
          <p className="mt-1 text-sm text-white/80">Change the status of this reservation request.</p>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <div className="mb-4 flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50/50 p-3">
              <img
                src={reservation.requester?.avatar}
                alt={reservation.requester?.name}
                className="h-10 w-10 rounded-full border border-gray-300 object-cover"
              />
              <div>
                <p className="text-sm font-bold text-gray-900">{reservation.requester?.name}</p>
                <p className="text-xs font-medium text-gray-500">{reservation.roomName}</p>
              </div>
            </div>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">
              Select New Status
            </label>
            <div className="grid grid-cols-1 gap-2">
              {STATUS_ORDER.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`flex items-center justify-between rounded-md border px-4 py-3 text-sm font-bold transition-all ${
                    selectedStatus === status
                      ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 text-[var(--brand-color)]'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
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
            <button
              onClick={onClose}
              disabled={isUpdating}
              className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={isUpdating || selectedStatus === reservation.status}
              className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isUpdating ? 'Updating...' : 'Update Status'}
            </button>
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
        className="w-full max-w-md overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${headerBg} p-6 text-white`}>
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 text-sm text-white/80">{description}</p>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden">
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
              <p className="text-sm font-bold text-gray-900">{reservation.requester?.name}</p>
              <p className="text-xs font-medium text-gray-500">{reservation.roomName} • {reservation.buildingName}</p>
            </div>
          </div>

          <div className="rounded-md p-4 border bg-rose-50 border-rose-100">
            <p className="text-xs leading-relaxed text-rose-700">
              <span className="font-bold uppercase tracking-wider">Warning:</span> {isDecline 
                ? 'This action will notify the requester that their reservation has been declined. This can be undone by manually changing the status later.' 
                : 'This action is permanent and cannot be undone. All data associated with this reservation record will be removed from the system.'}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex-1 rounded-md py-3 text-sm font-bold text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed bg-rose-600 enabled:hover:bg-rose-700"
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
        className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
          <h3 className="text-xl font-bold leading-tight">Reservation Information</h3>
          <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details of the booking request</p>
        </div>

        <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
          <div className="p-6 space-y-5">
            <div className="flex gap-5">
              <div className="w-[152px] h-[152px] shrink-0 rounded-full border border-gray-200 bg-gray-100 overflow-hidden shadow-sm">
                <img 
                  src={reservation.requester?.avatar} 
                  alt={reservation.requester?.name} 
                  className="h-full w-full object-cover" 
                />
              </div>
              
              <div className="flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <h4 className="text-xl font-bold text-gray-900 leading-tight">{reservation.requester?.name}</h4>
                  <p className="text-sm text-gray-500 font-medium mt-1">{reservation.requester?.email}</p>
                  <div className="mt-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClasses[reservation.status]}`}>
                      {reservation.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Reservation ID</p>
                    <p className="text-sm font-mono text-gray-700">{reservation.id}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Location</h5>
                  <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-gray-700 bg-gray-100 h-[46px] rounded-md border border-gray-200">
                    <DoorIcon className="h-4 w-4 text-[var(--brand-color)]" />
                    <div className="truncate">
                      <span>{reservation.roomName} • {reservation.buildingName}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Schedule</h5>
                  <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-gray-700 bg-gray-100 h-[46px] rounded-md border border-gray-200">
                    <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                    <span>{reservation.startTime} - {reservation.endTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Date</h5>
                <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-gray-700 bg-gray-100 h-[46px] rounded-md border border-gray-200">
                  <CalendarIcon className="h-4 w-4 text-[var(--brand-color)]" />
                  <span>{formatDateFull(reservation.date)}</span>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Purpose</h5>
                <div className="rounded-md border border-gray-200 bg-gray-100 p-4">
                  <p className="text-sm text-gray-600 leading-relaxed italic">
                    "{reservation.purpose || 'No purpose provided.'}"
                  </p>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Metadata</h5>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-gray-400 uppercase tracking-tight">Created At:</span>
                    <span className="text-gray-600 font-medium">{formatTimestamp(reservation.createdAt)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-gray-400 uppercase tracking-tight">Updated At:</span>
                    <span className="text-gray-600 font-medium">{formatTimestamp(reservation.updatedAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm"
              >
                Cancel
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34]"
                onClick={onViewRoom}
              >
                <DoorIcon className="h-4 w-4" />
                View Room Information
              </button>
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
        className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
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
                  src={room.image} 
                  alt={room.name} 
                  className="h-full w-full object-cover grayscale-[0.2]" 
                  onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                />
              </div>
              
              <div className="flex-1 flex flex-col justify-between py-0.5">
                <div>
                  <div className="flex items-center justify-start gap-3">
                    <h4 className="text-xl font-bold text-gray-900 leading-tight">{room.name}</h4>
                    <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
                      {room.code}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}>
                      {room.status}
                    </span>
                    <span className="text-sm text-gray-500 font-semibold">
                      {room.type} • Floor {room.floor}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Capacity</p>
                    <div className="rounded-md border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-gray-500 shrink-0" />
                      <p className="text-sm font-bold text-gray-700">{room.capacity} pax</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Booking Limits</p>
                    <div className="rounded-md border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-gray-500 shrink-0" />
                      <p className="text-sm font-bold text-gray-700">
                        {room.minBookingMins}m - {room.maxBookingMins}m
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
                    {room.description || 'No description provided for this room.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Availability</h5>
                  <div className="flex gap-1 h-[34px]">
                    {DAYS_OF_WEEK.map((day) => {
                      const isAvailable = room.availableDays.includes(day)
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
                    <span>{room.startTime} - {room.endTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">Room Amenities</h5>
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                  {room.amenities.length > 0 ? (
                    room.amenities.map((amenity, i) => (
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
                onClick={onClose}
                className="flex-1 rounded-md border border-gray-200 bg-[var(--brand-color)] py-3 text-sm font-bold text-white transition hover:bg-[#526f34] shadow-md"
              >
                Close
              </button>
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
  const [selectedStatuses, setSelectedStatuses] = useState<ReservationStatus[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [activeDropdowns, setActiveDropdowns] = useState(0)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [viewingReservation, setViewingReservation] = useState<Reservation | null>(null)
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null)
  const [confirmingAction, setConfirmingAction] = useState<{
    reservation: Reservation;
    type: 'decline' | 'delete';
  } | null>(null)

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

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

  const pendingCount = reservations.filter(r => r.status === 'Pending').length
  const approvedCount = reservations.filter(r => r.status === 'Approved').length
  const declinedCount = reservations.filter(r => r.status === 'Declined').length
  const cancelledCount = reservations.filter(r => r.status === 'Cancelled').length
  const completedCount = reservations.filter(r => r.status === 'Completed').length

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

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Manage Reservations
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Track, approve, or modify room reservation requests across the university.
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
          placeholder="Search reservations..."
          dropdowns={
            <>
              <MultiSelectDropdown
                label="Buildings"
                options={buildings.map(b => b.name)}
                selectedValues={selectedBuildings}
                onChange={setSelectedBuildings}
                onToggle={handleDropdownToggle}
                className="w-full sm:w-auto"
              />
              <MultiSelectDropdown
                label="Status"
                options={STATUS_ORDER}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
                onToggle={handleDropdownToggle}
                className="w-full sm:w-auto"
              />
            </>
          }
        />

        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[30%]">
                    Requester
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Room / Building
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Date & Time
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No reservations found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((res) => (
                    <tr 
                      key={res.id} 
                      className="cursor-pointer transition hover:bg-gray-50/50"
                      onClick={() => setViewingReservation(res)}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={res.requester?.avatar}
                            alt={res.requester?.name}
                            className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                          />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{res.requester?.name}</p>
                            <p className="text-xs font-medium text-gray-500">{res.requester?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{res.roomName}</p>
                        <p className="text-xs font-medium text-gray-500">{res.buildingName}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <p className="text-sm font-semibold text-gray-600">{formatDate(res.date)}</p>
                        <p className="text-xs font-medium text-gray-400">{res.startTime} - {res.endTime}</p>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClasses[res.status] || 'bg-gray-100 text-gray-700'}`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <IconButton
                            label="Approve reservation"
                            disabled={res.status !== 'Pending'}
                            className={`h-8 w-8 rounded-md bg-white text-emerald-400 shadow-sm transition-all border border-gray-100 ${
                              res.status === 'Pending' 
                                ? 'hover:bg-emerald-50 hover:text-emerald-600' 
                                : 'opacity-30 cursor-not-allowed text-gray-400'
                            }`}
                            onClick={() => handleApprove(res.id)}
                          >
                            <CheckIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Decline reservation"
                            disabled={res.status !== 'Pending'}
                            className={`h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm transition-all border border-gray-100 ${
                              res.status === 'Pending' 
                                ? 'hover:bg-rose-50 hover:text-rose-600' 
                                : 'opacity-30 cursor-not-allowed text-gray-400'
                            }`}
                            onClick={() => setConfirmingAction({ reservation: res, type: 'decline' })}
                          >
                            <CloseIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Edit status"
                            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
                            onClick={() => setEditingReservation(res)}
                          >
                            <EditIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Delete reservation"
                            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
                            onClick={() => setConfirmingAction({ reservation: res, type: 'delete' })}
                          >
                            <TrashIcon className="h-4.5 w-4.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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
    </section>
  )
}


export default ManageReservationsPage
