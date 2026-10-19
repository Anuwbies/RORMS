import { useState, useEffect, useMemo, useCallback } from 'react'
import { formatUserName } from '../../utils/userName'
import { ClipboardIcon, SearchIcon, EditIcon, TrashIcon, CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, UserIcon, BookIcon, BuildingIcon, LayersIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { Button } from '../../components/Button'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { ReservationInfoModal } from '../../components/ReservationInfoModal'
import { ReservationReviewIndicators } from '../../components/ReservationReviewIndicators'
import { reservationReviewStep, RESERVATION_REVIEW_STEPS } from '../../utils/reservationReviewStep'
import { reservationDisplayStatus } from '../../utils/reservationEvidence'
import { db, functions, auth } from '../../firebase'
import { httpsCallable } from 'firebase/functions'
import { 
  collection, 
  deleteField,
  getDocs,
  onSnapshot, 
  query, 
  runTransaction,
  serverTimestamp,
  where,
  doc, 
  deleteDoc,
} from 'firebase/firestore'

type ReservationStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'
type AdminReviewState = 'registrarPending' | 'registrarApproved' | 'registrarDeclined' | 'deanApproved' | 'deanDeclined' | 'administratorApproved' | 'administratorDeclined'
type ReviewRole = 'Registrar' | 'Dean' | 'University Administrator'
type ReviewDecision = 'pending' | 'approve' | 'decline'
const ADMIN_REVIEW_OPTIONS: { value: AdminReviewState; label: string; status: ReservationStatus }[] = [
  { value: 'registrarPending', label: 'Awaiting Registrar', status: 'Pending' },
  { value: 'registrarApproved', label: 'Registrar approved', status: 'Pending' },
  { value: 'registrarDeclined', label: 'Registrar declined', status: 'Declined' },
  { value: 'deanApproved', label: 'Dean approved', status: 'Pending' },
  { value: 'deanDeclined', label: 'Dean declined', status: 'Declined' },
  { value: 'administratorApproved', label: 'University Administrator approved', status: 'Approved' },
  { value: 'administratorDeclined', label: 'University Administrator declined', status: 'Declined' },
]
const adminReviewStateFor = (role: ReviewRole, decision: ReviewDecision): AdminReviewState => {
  if (role === 'Registrar') return decision === 'pending' ? 'registrarPending' : decision === 'approve' ? 'registrarApproved' : 'registrarDeclined'
  if (role === 'Dean') return decision === 'pending' ? 'registrarApproved' : decision === 'approve' ? 'deanApproved' : 'deanDeclined'
  return decision === 'pending' ? 'deanApproved' : decision === 'approve' ? 'administratorApproved' : 'administratorDeclined'
}
const adminDecisionFor = (reservation: Reservation, role: ReviewRole): ReviewDecision => {
  if (reservation.status === 'Declined' && !reservation.autoProcessed) return 'decline'
  if (role === 'University Administrator' && reservation.status === 'Pending') return 'pending'
  const recommended = role === 'Registrar' ? reservation.registrarRecommend
    : role === 'Dean' ? reservation.deanRecommend
      : reservation.universityAdministratorRecommend === true || reservation.status === 'Approved' || reservation.status === 'Completed'
  return recommended === true ? 'approve' : 'pending'
}
const updateReservationStatus = httpsCallable<
  { reservationId: string; status: ReservationStatus; expectedStatus: ReservationStatus; recommendation?: 'Registrar' | 'Dean'; declinedReason?: string; manualOverride?: boolean; adminReviewState?: AdminReviewState; expectedReview?: { registrar: boolean; dean: boolean; universityAdministrator: boolean; declinedByRole: string | null } },
  { changed: boolean; logId: string | null }
>(functions, 'updateReservationStatus')
type RoomStatus = 'Available' | 'Occupied' | 'Maintenance'

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
  duration?: number
  attendees?: number
  status: ReservationStatus
  deanRecommend?: boolean
  registrarRecommend?: boolean
  universityAdministratorRecommend?: boolean
  declinedReason?: string
  declinedByRole?: string
  autoProcessed?: boolean
  evidencePath?: string
  evidenceType?: 'image' | 'video'
  evidenceFileName?: string
  evidenceSubmittedAt?: { toDate: () => Date }
  purpose?: string
  requestType?: 'Standard' | 'Extended'
  subjectCode?: string
  classSection?: string
  department?: string
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

type ReviewProgress = Pick<Reservation, 'status' | 'registrarRecommend' | 'deanRecommend' | 'universityAdministratorRecommend' | 'declinedByRole' | 'autoProcessed'>

const deanHasDecided = (reservation: ReviewProgress) => reservation.deanRecommend === true
  || (reservation.status === 'Declined' && (reservation.declinedByRole === 'Dean'
    || (!reservation.declinedByRole && reservation.autoProcessed !== true
      && reservation.registrarRecommend === true)))

const administratorHasDecided = (reservation: ReviewProgress) => reservation.universityAdministratorRecommend === true
  || (reservation.status === 'Declined' && (reservation.declinedByRole === 'University Administrator'
    || (!reservation.declinedByRole && reservation.autoProcessed !== true
      && reservation.registrarRecommend === true && reservation.deanRecommend === true)))

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
  Maintenance: 'bg-rose-100 text-rose-700',
}

const STATUS_ORDER: ReservationStatus[] = ['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed']
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface StatusUpdateModalProps {
  reservation: Reservation
  allowedStatuses: ReservationStatus[]
  reviewRole?: 'Registrar' | 'Dean' | 'University Administrator'
  adminReview?: boolean
  onClose: () => void
  onUpdate: (id: string, newStatus: ReservationStatus, declinedReason?: string) => Promise<void>
  onReview?: (id: string, decision: 'pending' | 'approve' | 'decline', declinedReason?: string) => Promise<void>
  onAdminReview?: (reservation: Reservation, role: ReviewRole, decision: ReviewDecision, declinedReason?: string) => Promise<void>
}

function StatusUpdateModal({ reservation, allowedStatuses, reviewRole, adminReview, onClose, onUpdate, onReview, onAdminReview }: StatusUpdateModalProps) {
  const currentRecommendation = reviewRole === 'University Administrator'
    ? reservation.universityAdministratorRecommend === true || reservation.status === 'Approved' || reservation.status === 'Completed'
    : reviewRole === 'Dean' ? reservation.deanRecommend : reservation.registrarRecommend
  const laterRecommendation = reviewRole === 'Registrar'
    ? reservation.deanRecommend === true || reservation.universityAdministratorRecommend === true
    : reviewRole === 'Dean' && reservation.universityAdministratorRecommend === true
  const [selectedStatus, setSelectedStatus] = useState<ReservationStatus>(reservation.status)
  const [selectedReviewAction, setSelectedReviewAction] = useState<'pending' | 'approve' | 'decline' | null>(reviewRole && reservation.status === 'Declined' ? 'decline' : reviewRole && currentRecommendation === true ? 'approve' : reviewRole ? 'pending' : null)
  const adminReviewRole: ReviewRole = reservation.status === 'Declined' &&
    (reservation.declinedByRole === 'Registrar' || reservation.declinedByRole === 'Dean' || reservation.declinedByRole === 'University Administrator')
    ? reservation.declinedByRole
    : reservation.registrarRecommend !== true ? 'Registrar' : reservation.deanRecommend !== true ? 'Dean' : 'University Administrator'
  const [selectedAdminDecision, setSelectedAdminDecision] = useState<ReviewDecision>(adminDecisionFor(reservation, adminReviewRole))
  const [declinedReason, setDeclinedReason] = useState(reservation.status === 'Declined' ? reservation.declinedReason || '' : '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [avatarError, setAvatarError] = useState(false)
  const isDeclining = adminReview ? selectedAdminDecision === 'decline' : reviewRole ? selectedReviewAction === 'decline' : selectedStatus === 'Declined'
  const reviewUnchanged = reviewRole && (
    (selectedReviewAction === 'pending' && reservation.status === 'Pending' && currentRecommendation !== true && !laterRecommendation)
    || (selectedReviewAction === 'approve' && reservation.status !== 'Declined' && currentRecommendation === true)
    || (selectedReviewAction === 'decline' && reservation.status === 'Declined' && declinedReason.trim() === (reservation.declinedReason || '').trim())
  )

  const handleUpdate = async () => {
    if (isDeclining && !declinedReason.trim()) {
      setErrorMessage('Enter a reason for declining this reservation.')
      return
    }
    setErrorMessage('')
    setIsUpdating(true)
    try {
      if (adminReview) {
        if (!onAdminReview) throw new Error('Select a review decision.')
        await onAdminReview(reservation, adminReviewRole, selectedAdminDecision, isDeclining ? declinedReason.trim() : undefined)
      } else if (reviewRole) {
        if (!selectedReviewAction || !onReview) throw new Error('Select Pending, Approve, or Decline.')
        await onReview(reservation.id, selectedReviewAction, isDeclining ? declinedReason.trim() : undefined)
      } else {
        await onUpdate(reservation.id, selectedStatus, isDeclining ? declinedReason.trim() : undefined)
      }
      onClose()
    } catch (error) {
      console.error('Error updating status:', error)
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the reservation. Please try again.')
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
              {reservation.requester?.avatar && !avatarError ? (
                <img
                  src={reservation.requester.avatar}
                  alt={reservation.requester.name}
                  className="h-10 w-10 shrink-0 rounded-full border border-slate-300 object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-slate-400">
                  <UserIcon className="h-5 w-5" />
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-slate-900">{reservation.requester?.name}</p>
                <p className="text-xs font-medium text-slate-500">{reservation.roomName}</p>
              </div>
            </div>

            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Select New Status
            </label>
            <div className="grid grid-cols-1 gap-2">
              {adminReview || reviewRole ? (['pending', 'approve', 'decline'] as const).map((decision) => (
                <button
                  key={decision}
                  type="button"
                  onClick={() => adminReview ? setSelectedAdminDecision(decision) : setSelectedReviewAction(decision)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                    (adminReview ? selectedAdminDecision : selectedReviewAction) === decision
                      ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 text-[var(--brand-color)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${decision === 'pending' ? 'bg-amber-100' : decision === 'approve' ? 'bg-emerald-100' : 'bg-rose-100'}`} />
                    {decision === 'pending' ? 'Pending' : decision === 'approve' ? 'Approve' : 'Decline'}
                  </span>
                  {(adminReview ? selectedAdminDecision : selectedReviewAction) === decision && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                </button>
              )) : allowedStatuses.map((status) => (
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
            {isDeclining && <div className="mt-4">
              <label htmlFor="status-decline-reason" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Reason for declining</label>
              <textarea
                id="status-decline-reason"
                value={declinedReason}
                onChange={event => setDeclinedReason(event.target.value)}
                maxLength={500}
                rows={3}
                required
                disabled={isUpdating}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-rose-400 focus:outline-none"
                placeholder="Explain why this request was declined"
              />
            </div>}
          </div>

          {errorMessage && <p role="alert" className="mb-4 text-sm text-rose-700">{errorMessage}</p>}
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
              disabled={isUpdating || (!adminReview && (reviewRole ? !selectedReviewAction || reviewUnchanged : selectedStatus === reservation.status)) || (isDeclining && !declinedReason.trim())}
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
  onConfirm: (reason?: string) => Promise<void>
  onClose: () => void
}

function ConfirmationModal({ reservation, type, onConfirm, onClose }: ConfirmationModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [avatarError, setAvatarError] = useState(false)
  const [declinedReason, setDeclinedReason] = useState('')
  const isDecline = type === 'decline'

  const handleConfirm = async () => {
    if (isDecline && !declinedReason.trim()) {
      setErrorMessage('Enter a reason for declining this reservation.')
      return
    }
    setErrorMessage('')
    setIsProcessing(true)
    try {
      await onConfirm(isDecline ? declinedReason.trim() : undefined)
      onClose()
    } catch (error) {
      console.error(`Error during ${type} action:`, error)
      setErrorMessage(error instanceof Error ? error.message : 'Could not complete this action. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

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

          {isDecline && <div>
            <label htmlFor="reservation-decline-reason" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Reason for declining</label>
            <textarea
              id="reservation-decline-reason"
              value={declinedReason}
              onChange={event => setDeclinedReason(event.target.value)}
              maxLength={500}
              rows={3}
              required
              disabled={isProcessing}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 focus:border-rose-400 focus:outline-none"
              placeholder="Explain why this request was declined"
            />
          </div>}

          <div className="rounded-xl p-4 border bg-rose-50 border-rose-100">
            <p className="text-xs leading-relaxed text-rose-700">
              <span className="font-bold uppercase tracking-wider">Warning:</span> {isDecline 
                ? 'This action will notify the requester that their reservation has been declined and include your reason.' 
                : 'This action is permanent and cannot be undone. All data associated with this reservation record will be removed from the system.'}
            </p>
          </div>

          {errorMessage && <p role="alert" className="text-sm text-rose-700">{errorMessage}</p>}
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
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing || (isDecline && !declinedReason.trim())}
              className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg h-12 text-base"
            >
              {isProcessing ? 'Processing...' : (isDecline ? 'Confirm Decline' : 'Confirm Delete')}
            </Button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={() => !isProcessing && onClose()} />
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

function ManageReservationsPage({ userRole }: { userRole: string }) {
  const isDepartmentReviewer = userRole === 'Dean'
  const isRegistrar = userRole === 'Registrar'
  const isUniversityAdministrator = userRole === 'University Administrator'
  const canManageRecords = userRole === 'Admin' || isRegistrar || isUniversityAdministrator
  const [department, setDepartment] = useState<string | null>(null)
  const [statusError, setStatusError] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [reservationsLoaded, setReservationsLoaded] = useState(false)
  const [sessionOrder, setSessionOrder] = useState<string[] | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedReviewSteps, setSelectedReviewSteps] = useState<string[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [viewingReservation, setViewingReservation] = useState<Reservation | null>(null)
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null)
  const [confirmingAction, setConfirmingAction] = useState<{
    reservation: Reservation;
    type: 'decline' | 'delete';
  } | null>(null)
  
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDepartment(null)
    const uid = auth.currentUser?.uid
    if (!uid || !isDepartmentReviewer) return
    return onSnapshot(query(collection(db, 'memberships'), where('userId', '==', uid)), snapshot => {
      const member = snapshot.docs.map(record => record.data()).find(record => record.status === 'accepted' && record.role === userRole)
      setDepartment(typeof member?.department === 'string' ? member.department.trim() : null)
    }, () => { setDepartment(null); setStatusError('Could not load your department. Please reload and try again.') })
  }, [userRole, isDepartmentReviewer])

  useEffect(() => {
    setReservations([])
    setReservationsLoaded(false)
    if (isDepartmentReviewer && !department) return
    // Use a department-only query so no new composite index is needed.
    const reservationQuery = isDepartmentReviewer
      ? query(collection(db, 'reservations'), where('department', '==', department))
      : query(collection(db, 'reservations'))
    return onSnapshot(reservationQuery, snapshot => {
      const records = snapshot.docs.map(record => ({ id: record.id, ...record.data() })) as Reservation[]
      setReservations(records)
      setReservationsLoaded(true)
    }, () => { setReservations([]); setReservationsLoaded(false); setStatusError('Could not load reservation requests. Please reload and try again.') })
  }, [department, isDepartmentReviewer, isRegistrar, isUniversityAdministrator])

  useEffect(() => {
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
          name: formatUserName(user) || 'Unknown User',
          email: user?.email || 'No Email',
          avatar: user?.profilePicture || '',
        },
        roomName: room?.name || 'Unknown Room',
        buildingName: building?.name || 'Unknown Building',
        buildingCode: building?.code || ''
      }
    })
  }, [reservations, users, rooms, buildings])

  const sortedReservations = useMemo(() => {
    return [...enrichedReservations].sort((a, b) => {
        if (isRegistrar) {
          const registrarOrder = (reservation: Reservation) => {
            if (reservation.registrarRecommend === true) {
              if (reservation.status === 'Declined' && (reservation.declinedByRole === 'Dean'
                || (!reservation.declinedByRole && reservation.autoProcessed !== true
                  && reservation.deanRecommend !== true))) return 4
              if (reservation.deanRecommend === true) return 3
              if (reservation.status === 'Pending') return 1
            }
            if (reservation.status === 'Pending'
              && reservation.registrarRecommend !== true) return 0
            if (reservation.status === 'Declined' && (reservation.declinedByRole === 'Registrar'
              || (!reservation.declinedByRole && reservation.autoProcessed !== true
                && reservation.registrarRecommend !== true))) return 2
            return 5
          }
          const reviewOrder = registrarOrder(a) - registrarOrder(b)
          if (reviewOrder !== 0) return reviewOrder
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        }
        if (isDepartmentReviewer) {
          const deanOrder = (reservation: Reservation) => {
            if (reservation.registrarRecommend === true) {
              if (reservation.deanRecommend === true) {
                if (reservation.universityAdministratorRecommend === true) return 5
                if (reservation.status === 'Declined' && (reservation.declinedByRole === 'University Administrator'
                  || (!reservation.declinedByRole && reservation.autoProcessed !== true))) return 6
                if (reservation.status === 'Pending') return 1
              }
              if (reservation.status === 'Declined' && reservation.declinedByRole === 'Dean') return 2
              if (reservation.status === 'Declined' && !reservation.declinedByRole
                && reservation.autoProcessed !== true && reservation.deanRecommend !== true) return 2
              if (reservation.status === 'Pending') return 0
            }
            if (reservation.status === 'Pending'
              && reservation.registrarRecommend !== true) return 3
            if (reservation.status === 'Declined' && (reservation.declinedByRole === 'Registrar'
              || (!reservation.declinedByRole && reservation.autoProcessed !== true
                && reservation.registrarRecommend !== true))) return 4
            return 7
          }
          const reviewOrder = deanOrder(a) - deanOrder(b)
          if (reviewOrder !== 0) return reviewOrder
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        }
        if (isUniversityAdministrator || userRole === 'Admin') {
          const administratorOrder = (reservation: Reservation) => {
            if (reservation.registrarRecommend === true && reservation.deanRecommend === true) {
              if (reservation.status === 'Pending'
                && reservation.universityAdministratorRecommend !== true) return 0
              if (reservation.universityAdministratorRecommend === true) return 1
              if (reservation.status === 'Declined' && (reservation.declinedByRole === 'University Administrator'
                || (!reservation.declinedByRole && reservation.autoProcessed !== true))) return 2
            }
            if (reservation.registrarRecommend === true) {
              if (reservation.status === 'Pending') return 3
              if (reservation.status === 'Declined' && (reservation.declinedByRole === 'Dean'
                || (!reservation.declinedByRole && reservation.autoProcessed !== true))) return 4
            }
            if (reservation.status === 'Pending') return 5
            if (reservation.status === 'Declined' && (reservation.declinedByRole === 'Registrar'
              || (!reservation.declinedByRole && reservation.autoProcessed !== true))) return 6
            return 7
          }
          const reviewOrder = administratorOrder(a) - administratorOrder(b)
          if (reviewOrder !== 0) return reviewOrder
          return new Date(b.date).getTime() - new Date(a.date).getTime()
        }
        const orderA = STATUS_ORDER.indexOf(a.status)
        const orderB = STATUS_ORDER.indexOf(b.status)
        if (orderA !== orderB) return orderA - orderB
        // Secondary sort by date (descending)
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  }, [enrichedReservations, isRegistrar, isDepartmentReviewer, isUniversityAdministrator, userRole])

  useEffect(() => {
    if (!reservationsLoaded) return
    const currentIds = sortedReservations.map(reservation => reservation.id)
    setSessionOrder(previous => {
      if (previous === null) return currentIds
      const currentSet = new Set(currentIds)
      const previousSet = new Set(previous)
      const next = [...previous.filter(id => currentSet.has(id)), ...currentIds.filter(id => !previousSet.has(id))]
      return next.length === previous.length && next.every((id, index) => id === previous[index]) ? previous : next
    })
  }, [reservationsLoaded, sortedReservations])

  const filteredReservations = useMemo(() => {
    const positions = new Map(sessionOrder?.map((id, index) => [id, index]) ?? [])
    const ordered = sessionOrder === null ? sortedReservations : [...sortedReservations].sort((a, b) => {
      const aIndex = positions.get(a.id)
      const bIndex = positions.get(b.id)
      if (aIndex === undefined) return bIndex === undefined ? 0 : 1
      if (bIndex === undefined) return -1
      return aIndex - bIndex
    })
    return ordered.filter((res) => {
      const matchesSearch = [
        res.requester?.name,
        res.requester?.email,
        res.roomName,
        res.buildingName,
        res.buildingCode,
        reservationDisplayStatus(res.status, res.evidencePath)
      ].some((val) => val?.toLowerCase().includes(searchTerm.toLowerCase()))

      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(reservationDisplayStatus(res.status, res.evidencePath))
      const matchesReviewStep = selectedReviewSteps.length === 0 || selectedReviewSteps.includes(reservationReviewStep(res))
      const matchesBuilding = selectedBuildings.length === 0 || selectedBuildings.includes(res.buildingCode)

      return matchesSearch && matchesStatus && matchesReviewStep && matchesBuilding
    })
  }, [sortedReservations, sessionOrder, searchTerm, selectedStatuses, selectedReviewSteps, selectedBuildings])

  const reviewCounts = useMemo(() => {
    const counts = { registrar: 0, dean: 0, administrator: 0, approved: 0, declined: 0, cancelled: 0, needsEvidence: 0, completed: 0 }
    for (const reservation of reservations) {
      if (reservation.status === 'Pending') {
        if (reservation.registrarRecommend !== true) counts.registrar += 1
        else if (reservation.deanRecommend !== true) counts.dean += 1
        else counts.administrator += 1
      } else if (reservation.status === 'Approved') counts.approved += 1
      else if (reservation.status === 'Declined') counts.declined += 1
      else if (reservation.status === 'Cancelled') counts.cancelled += 1
      else if (reservation.status === 'Completed') {
        if (reservation.evidencePath) counts.completed += 1
        else counts.needsEvidence += 1
      }
    }
    return counts
  }, [reservations])

  const reviewSummaryGroups = [
    {
      title: 'Awaiting review',
      columns: 'sm:grid-cols-3',
      items: [
        { label: 'Registrar', step: 'Step 1', count: reviewCounts.registrar, active: isRegistrar, color: 'border-blue-200 bg-blue-50 text-blue-700' },
        { label: 'Dean', step: 'Step 2', count: reviewCounts.dean, active: isDepartmentReviewer, color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'University Administrator', step: 'Final step', count: reviewCounts.administrator, active: isUniversityAdministrator, color: 'border-[#c6dbb6] bg-[#f3f7ee] text-[#41572a]' },
      ],
    },
    {
      title: 'Reservation outcomes',
      columns: 'sm:grid-cols-4',
      items: [
        { label: 'Approved', step: '', count: reviewCounts.approved, active: false, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
        { label: 'Declined', step: '', count: reviewCounts.declined, active: false, color: 'border-rose-200 bg-rose-50 text-rose-700' },
        { label: 'Cancelled', step: '', count: reviewCounts.cancelled, active: false, color: 'border-slate-200 bg-slate-50 text-slate-700' },
        { label: 'Needs Evidence', step: '', count: reviewCounts.needsEvidence, active: false, color: 'border-amber-200 bg-amber-50 text-amber-700' },
        { label: 'Completed', step: '', count: reviewCounts.completed, active: false, color: 'border-sky-200 bg-sky-50 text-sky-700' },
      ],
    },
  ]

  const handleStatusUpdate = async (id: string, newStatus: ReservationStatus, recommendation?: 'Registrar' | 'Dean', declinedReason?: string) => {
    setStatusError('')
    const reservation = editingReservation?.id === id ? editingReservation
      : confirmingAction?.reservation.id === id ? confirmingAction.reservation
        : reservations.find(record => record.id === id)
    if (!reservation) throw new Error('This reservation no longer exists. Reload the page and try again.')
    await updateReservationStatus({ reservationId: id, status: newStatus, expectedStatus: reservation.status, ...(recommendation ? { recommendation } : {}), ...(declinedReason ? { declinedReason } : {}) })
  }

  const saveRegistrarDecisionInFirestore = async (reservation: Reservation, decision: 'pending' | 'recommend' | 'decline', reason?: string, manualOverride = false) => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Sign in before reviewing a reservation.')
    const declinedReason = reason?.trim() || ''
    if (decision === 'decline' && (!declinedReason || declinedReason.length > 500)) {
      throw new Error('Enter a reason for declining this reservation (up to 500 characters).')
    }
    const memberships = await getDocs(query(collection(db, 'memberships'), where('userId', '==', uid)))
    const acceptedMembership = memberships.docs.find(record => {
      const member = record.data()
      return member.status === 'accepted' && member.role === 'Registrar'
    })
    if (!acceptedMembership) throw new Error('An accepted Registrar membership is required to recommend reservations.')

    const reservationRef = doc(db, 'reservations', reservation.id)
    const memberRef = acceptedMembership.ref
    const profileRef = doc(db, 'users', uid)
    const logRef = doc(collection(db, 'logs'))
    await runTransaction(db, async transaction => {
      const [reservationSnapshot, memberSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(reservationRef), transaction.get(memberRef), transaction.get(profileRef),
      ])
      if (!reservationSnapshot.exists()) throw new Error('This reservation no longer exists. Reload the page and try again.')
      const current = reservationSnapshot.data()
      const member = memberSnapshot.data()
      const profile = profileSnapshot.data()
      if (member?.status !== 'accepted' || member.role !== 'Registrar' || profile?.isActive === false) {
        throw new Error('An active Registrar membership is required to recommend reservations.')
      }
      if (current.status !== reservation.status) throw new Error('The reservation status changed. Reload the page and try again.')
      if (deanHasDecided(current as ReviewProgress)) {
        throw new Error('The Dean has already decided this request. The Registrar decision can no longer be edited.')
      }
      const wasDeclined = current.status === 'Declined'
      const registrarDeclined = current.declinedByRole === 'Registrar'
        || (!current.declinedByRole && current.autoProcessed !== true
          && current.registrarRecommend !== true && current.deanRecommend !== true)
      if (current.status !== 'Pending'
        && !(manualOverride && wasDeclined && registrarDeclined)) {
        throw new Error('Only open or Registrar-declined requests can be edited here.')
      }
      if (current.registrarRecommend === true && decision === 'recommend') return
      if (decision === 'pending' && current.status === 'Pending' && current.registrarRecommend !== true
        && current.deanRecommend !== true && current.universityAdministratorRecommend !== true) return
      if (current.registrarRecommend === true && decision === 'decline' && !manualOverride) {
        throw new Error('The Registrar can decline only before recommending an open request.')
      }
      const previousDeclinedReason = typeof current.declinedReason === 'string' ? current.declinedReason.trim() : ''
      if (wasDeclined && decision === 'decline' && declinedReason === previousDeclinedReason) return

      const wasDeanRecommended = current.deanRecommend === true
      const wasAdministratorRecommended = current.universityAdministratorRecommend === true
      transaction.update(reservationRef, {
        ...(decision === 'recommend' ? {
          status: 'Pending',
          ...(wasDeclined ? {
            declinedReason: deleteField(),
            declinedByRole: deleteField(),
            declinedBy: deleteField(),
            declinedAt: deleteField(),
          } : {}),
          registrarRecommend: true,
          registrarRecommendedBy: uid,
          registrarRecommendedAt: serverTimestamp(),
          ...(wasDeanRecommended ? {
            deanRecommend: false,
            recommendedBy: deleteField(),
            recommendedByRole: deleteField(),
            recommendedAt: deleteField(),
          } : {}),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
        } : decision === 'pending' ? {
          status: 'Pending',
          registrarRecommend: false,
          registrarRecommendedBy: deleteField(),
          registrarRecommendedAt: deleteField(),
          ...(wasDeanRecommended ? {
            deanRecommend: false,
            recommendedBy: deleteField(),
            recommendedByRole: deleteField(),
            recommendedAt: deleteField(),
          } : {}),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
          ...(wasDeclined ? {
            declinedReason: deleteField(), declinedByRole: deleteField(),
            declinedBy: deleteField(), declinedAt: deleteField(),
          } : {}),
        } : {
          status: 'Declined',
          declinedReason,
          declinedByRole: 'Registrar',
          declinedBy: uid,
          declinedAt: serverTimestamp(),
          registrarRecommend: false,
          registrarRecommendedBy: deleteField(),
          registrarRecommendedAt: deleteField(),
          ...(wasDeanRecommended ? {
            deanRecommend: false,
            recommendedBy: deleteField(),
            recommendedByRole: deleteField(),
            recommendedAt: deleteField(),
          } : {}),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
        }),
        updatedAt: serverTimestamp(),
      })
      transaction.set(logRef, {
        action: 'reservation.status_changed',
        targetCollection: 'reservations',
        targetId: reservation.id,
        actorId: uid,
        actorName: formatUserName(profile, member) || uid,
        actorRole: 'Registrar',
        membershipId: acceptedMembership.id,
        changes: {
          status: { before: current.status, after: decision === 'decline' ? 'Declined' : 'Pending' },
          ...(decision === 'recommend' ? {
            registrarRecommend: { before: current.registrarRecommend === true, after: true },
            ...(wasDeanRecommended ? { deanRecommend: { before: true, after: false } } : {}),
            ...(wasAdministratorRecommended ? { universityAdministratorRecommend: { before: true, after: false } } : {}),
            ...(wasDeclined ? { declinedReason: { before: previousDeclinedReason, after: '' } } : {}),
          } : decision === 'pending' ? {
            registrarRecommend: { before: current.registrarRecommend === true, after: false },
            ...(wasDeanRecommended ? { deanRecommend: { before: true, after: false } } : {}),
            ...(wasAdministratorRecommended ? { universityAdministratorRecommend: { before: true, after: false } } : {}),
            ...(wasDeclined ? { declinedReason: { before: previousDeclinedReason, after: '' } } : {}),
          } : {
            registrarRecommend: { before: current.registrarRecommend === true, after: false },
            ...(wasDeanRecommended ? { deanRecommend: { before: true, after: false } } : {}),
            ...(wasAdministratorRecommended ? { universityAdministratorRecommend: { before: true, after: false } } : {}),
            declinedReason: { before: previousDeclinedReason, after: declinedReason },
          }),
        },
        ...(decision === 'recommend' ? { reviewStage: 'Registrar' } : {}),
        createdAt: serverTimestamp(),
        source: 'user',
        roomId: current.roomId || '',
        buildingId: current.buildingId || '',
        requesterId: current.userId || '',
        department: current.department || '',
        reservationDate: current.date || '',
      })
    })
  }

  const saveDeanDecisionInFirestore = async (reservation: Reservation, decision: 'pending' | 'recommend' | 'decline', reason?: string, manualOverride = false) => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Sign in before reviewing a reservation.')
    const declinedReason = reason?.trim() || ''
    if (decision === 'decline' && (!declinedReason || declinedReason.length > 500)) {
      throw new Error('Enter a reason for declining this reservation (up to 500 characters).')
    }
    const memberships = await getDocs(query(collection(db, 'memberships'), where('userId', '==', uid)))
    const acceptedMembership = memberships.docs.find(record => {
      const member = record.data()
      return member.status === 'accepted' && member.role === 'Dean'
        && typeof reservation.department === 'string' && reservation.department.trim()
        && member.department === reservation.department.trim()
    })
    if (!acceptedMembership) throw new Error('An accepted Dean membership for this department is required.')

    const reservationRef = doc(db, 'reservations', reservation.id)
    const logRef = doc(collection(db, 'logs'))
    await runTransaction(db, async transaction => {
      const [reservationSnapshot, memberSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(reservationRef), transaction.get(acceptedMembership.ref), transaction.get(doc(db, 'users', uid)),
      ])
      if (!reservationSnapshot.exists()) throw new Error('This reservation no longer exists. Reload the page and try again.')
      const current = reservationSnapshot.data()
      const member = memberSnapshot.data()
      const profile = profileSnapshot.data()
      if (member?.status !== 'accepted' || member.role !== 'Dean' || profile?.isActive === false
        || typeof current.department !== 'string' || !current.department.trim()
        || member.department !== current.department.trim()) {
        throw new Error('An active Dean membership for this department is required.')
      }
      if (current.status !== reservation.status) throw new Error('The reservation status changed. Reload the page and try again.')
      if (administratorHasDecided(current as ReviewProgress)) {
        throw new Error('The University Administrator has already decided this request. The Dean decision can no longer be edited.')
      }
      const wasDeclined = current.status === 'Declined'
      const deanDeclined = current.declinedByRole === 'Dean'
        || (!current.declinedByRole && current.autoProcessed !== true
          && current.registrarRecommend === true && current.deanRecommend !== true)
      if (current.status !== 'Pending'
        && !(manualOverride && wasDeclined && deanDeclined)) {
        throw new Error('Only open or Dean-declined requests can be edited here.')
      }
      if (current.registrarRecommend !== true) throw new Error('The Registrar must recommend this request before Dean review.')
      if (current.deanRecommend === true && decision === 'recommend') return
      if (decision === 'pending' && current.status === 'Pending' && current.deanRecommend !== true
        && current.universityAdministratorRecommend !== true) return
      if (current.deanRecommend === true && decision === 'decline' && !manualOverride) {
        throw new Error('The Dean can decline only before recommending an open request.')
      }
      const previousDeclinedReason = typeof current.declinedReason === 'string' ? current.declinedReason.trim() : ''
      if (wasDeclined && decision === 'decline' && declinedReason === previousDeclinedReason) return

      const wasAdministratorRecommended = current.universityAdministratorRecommend === true
      transaction.update(reservationRef, {
        ...(decision === 'recommend' ? {
          status: 'Pending',
          ...(wasDeclined ? {
            declinedReason: deleteField(), declinedByRole: deleteField(),
            declinedBy: deleteField(), declinedAt: deleteField(),
          } : {}),
          deanRecommend: true,
          recommendedBy: uid,
          recommendedByRole: 'Dean',
          recommendedAt: serverTimestamp(),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
        } : decision === 'pending' ? {
          status: 'Pending',
          deanRecommend: false,
          recommendedBy: deleteField(),
          recommendedByRole: deleteField(),
          recommendedAt: deleteField(),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
          ...(wasDeclined ? {
            declinedReason: deleteField(), declinedByRole: deleteField(),
            declinedBy: deleteField(), declinedAt: deleteField(),
          } : {}),
        } : {
          status: 'Declined',
          declinedReason,
          declinedByRole: 'Dean',
          declinedBy: uid,
          declinedAt: serverTimestamp(),
          deanRecommend: false,
          recommendedBy: deleteField(),
          recommendedByRole: deleteField(),
          recommendedAt: deleteField(),
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: false } : {}),
        }),
        updatedAt: serverTimestamp(),
      })
      transaction.set(logRef, {
        action: 'reservation.status_changed',
        targetCollection: 'reservations',
        targetId: reservation.id,
        actorId: uid,
        actorName: formatUserName(profile, member) || uid,
        actorRole: 'Dean',
        membershipId: acceptedMembership.id,
        changes: {
          status: { before: current.status, after: decision === 'decline' ? 'Declined' : 'Pending' },
          deanRecommend: { before: current.deanRecommend === true, after: decision === 'recommend' },
          ...(wasAdministratorRecommended ? { universityAdministratorRecommend: { before: true, after: false } } : {}),
          ...(decision === 'decline' ? { declinedReason: { before: previousDeclinedReason, after: declinedReason } }
            : wasDeclined ? { declinedReason: { before: previousDeclinedReason, after: '' } } : {}),
        },
        ...(decision === 'recommend' ? { reviewStage: 'Dean' } : {}),
        createdAt: serverTimestamp(),
        source: 'user',
        roomId: current.roomId || '',
        buildingId: current.buildingId || '',
        requesterId: current.userId || '',
        department: current.department || '',
        reservationDate: current.date || '',
      })
    })
  }

  const saveAdministratorDecisionInFirestore = async (reservation: Reservation, decision: 'pending' | 'approve' | 'decline', reason?: string, manualOverride = false) => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Sign in before reviewing a reservation.')
    const declinedReason = reason?.trim() || ''
    if (decision === 'decline' && (!declinedReason || declinedReason.length > 500)) {
      throw new Error('Enter a reason for declining this reservation (up to 500 characters).')
    }
    // Extended approvals need the server's atomic room and schedule conflict checks.
    if (decision === 'approve' && reservation.requestType === 'Extended') {
      await updateReservationStatus({
        reservationId: reservation.id,
        status: 'Approved',
        expectedStatus: reservation.status,
        ...(manualOverride && reservation.status === 'Declined' ? { manualOverride: true } : {}),
      })
      return
    }

    const memberships = await getDocs(query(collection(db, 'memberships'), where('userId', '==', uid)))
    const acceptedMembership = memberships.docs.find(record => {
      const member = record.data()
      return member.status === 'accepted' && member.role === 'University Administrator'
    })
    if (!acceptedMembership) throw new Error('An accepted University Administrator membership is required.')

    const reservationRef = doc(db, 'reservations', reservation.id)
    const logRef = doc(collection(db, 'logs'))
    await runTransaction(db, async transaction => {
      const [reservationSnapshot, memberSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(reservationRef), transaction.get(acceptedMembership.ref), transaction.get(doc(db, 'users', uid)),
      ])
      if (!reservationSnapshot.exists()) throw new Error('This reservation no longer exists. Reload the page and try again.')
      const current = reservationSnapshot.data()
      const member = memberSnapshot.data()
      const profile = profileSnapshot.data()
      if (member?.status !== 'accepted' || member.role !== 'University Administrator' || profile?.isActive === false) {
        throw new Error('An active University Administrator membership is required.')
      }
      if (current.status !== reservation.status) throw new Error('The reservation status changed. Reload the page and try again.')
      if (current.registrarRecommend !== true || current.deanRecommend !== true) {
        throw new Error('Registrar and Dean recommendations are required before final review.')
      }
      if (decision === 'approve' && current.requestType === 'Extended') {
        throw new Error('This extended reservation requires server validation. Reload the page and try again.')
      }
      const wasDeclined = current.status === 'Declined'
      const administratorDeclined = current.declinedByRole === 'University Administrator'
        || (!current.declinedByRole && current.autoProcessed !== true
          && current.universityAdministratorRecommend !== true)
      if (current.status !== 'Pending'
        && !(manualOverride && current.status === 'Approved' && (decision === 'decline' || decision === 'pending'))
        && !(manualOverride && wasDeclined && administratorDeclined)) {
        throw new Error('Only recommended or University Administrator-decided requests can be edited here.')
      }
      if (current.universityAdministratorRecommend === true && decision === 'approve') return
      if (decision === 'pending' && current.status === 'Pending' && current.universityAdministratorRecommend !== true) return
      if (wasDeclined && decision === 'decline' && declinedReason === (current.declinedReason || '').trim()) return

      const previousDeclinedReason = typeof current.declinedReason === 'string' ? current.declinedReason.trim() : ''
      transaction.update(reservationRef, {
        status: decision === 'approve' ? 'Approved' : decision === 'pending' ? 'Pending' : 'Declined',
        universityAdministratorRecommend: decision === 'approve',
        ...(decision === 'approve' || decision === 'pending' ? {
          ...(wasDeclined ? {
            declinedReason: deleteField(), declinedByRole: deleteField(),
            declinedBy: deleteField(), declinedAt: deleteField(),
          } : {}),
        } : {
          declinedReason,
          declinedByRole: 'University Administrator',
          declinedBy: uid,
          declinedAt: serverTimestamp(),
        }),
        updatedAt: serverTimestamp(),
      })
      transaction.set(logRef, {
        action: 'reservation.status_changed',
        targetCollection: 'reservations',
        targetId: reservation.id,
        actorId: uid,
        actorName: formatUserName(profile, member) || uid,
        actorRole: 'University Administrator',
        membershipId: acceptedMembership.id,
        changes: {
          status: { before: current.status, after: decision === 'approve' ? 'Approved' : decision === 'pending' ? 'Pending' : 'Declined' },
          universityAdministratorRecommend: { before: current.universityAdministratorRecommend === true, after: decision === 'approve' },
          ...(decision === 'decline' ? { declinedReason: { before: previousDeclinedReason, after: declinedReason } }
            : wasDeclined ? { declinedReason: { before: previousDeclinedReason, after: '' } } : {}),
        },
        createdAt: serverTimestamp(),
        source: 'user',
        roomId: current.roomId || '',
        buildingId: current.buildingId || '',
        requesterId: current.userId || '',
        department: current.department || '',
        reservationDate: current.date || '',
      })
    })
  }

  const canAdvanceReservation = (reservation: Reservation) => {
    const open = reservation.status === 'Pending'
    if (isRegistrar) return open && reservation.registrarRecommend !== true && !deanHasDecided(reservation)
    if (isDepartmentReviewer) return open && reservation.registrarRecommend === true && reservation.deanRecommend !== true && !administratorHasDecided(reservation)
    if (isUniversityAdministrator) return open && reservation.registrarRecommend === true && reservation.deanRecommend === true && reservation.universityAdministratorRecommend !== true
    return false
  }

  const canManuallyReviewAsRegistrar = (reservation: Reservation) => isRegistrar && !deanHasDecided(reservation) && (
    reservation.status === 'Pending'
    || (reservation.status === 'Declined' && (reservation.declinedByRole === 'Registrar'
      || (!reservation.declinedByRole && reservation.autoProcessed !== true
        && reservation.registrarRecommend !== true && reservation.deanRecommend !== true)))
  )

  const canManuallyReviewAsDean = (reservation: Reservation) => isDepartmentReviewer && reservation.registrarRecommend === true
    && !administratorHasDecided(reservation) && (
    reservation.status === 'Pending'
    || (reservation.status === 'Declined' && (reservation.declinedByRole === 'Dean'
      || (!reservation.declinedByRole && reservation.autoProcessed !== true
        && reservation.deanRecommend !== true)))
  )

  const canManuallyReviewAsAdministrator = (reservation: Reservation) => isUniversityAdministrator
    && reservation.registrarRecommend === true && reservation.deanRecommend === true && (
      reservation.status === 'Pending' || reservation.status === 'Approved'
      || (reservation.status === 'Declined' && (reservation.declinedByRole === 'University Administrator'
        || (!reservation.declinedByRole && reservation.autoProcessed !== true
          && reservation.universityAdministratorRecommend !== true)))
    )

  const allowedStatusesFor = (reservation: Reservation): ReservationStatus[] => {
    if (!canManageRecords) return []
    if (isUniversityAdministrator) return []
    if (isRegistrar) return []
    if (reservation.status === 'Pending' && reservation.registrarRecommend === true && reservation.deanRecommend === true) return ['Cancelled']
    return reservation.status === 'Approved' ? ['Cancelled', 'Completed'] : []
  }

  const canEditReservation = (reservation: Reservation) => canManuallyReviewAsRegistrar(reservation)
    || canManuallyReviewAsDean(reservation) || canManuallyReviewAsAdministrator(reservation)
    || userRole === 'Admin' || allowedStatusesFor(reservation).length > 0

  const saveAdminReviewInFirestore = async (reservation: Reservation, role: ReviewRole, decision: ReviewDecision, declinedReason?: string) => {
    const state = adminReviewStateFor(role, decision)
    const option = ADMIN_REVIEW_OPTIONS.find(entry => entry.value === state)
    if (!option) throw new Error('Select a review state.')
    await updateReservationStatus({
      reservationId: reservation.id,
      status: option.status,
      expectedStatus: reservation.status,
      adminReviewState: state,
      expectedReview: {
        registrar: reservation.registrarRecommend === true,
        dean: reservation.deanRecommend === true,
        universityAdministrator: reservation.universityAdministratorRecommend === true,
        declinedByRole: reservation.declinedByRole || null,
      },
      ...(declinedReason ? { declinedReason } : {}),
    })
  }

  const handleApprove = async (id: string) => {
    try {
      setStatusError('')
      const reservation = reservations.find(record => record.id === id)
      if (!reservation) throw new Error('This reservation no longer exists. Reload the page and try again.')
      if (isRegistrar) await saveRegistrarDecisionInFirestore(reservation, 'recommend')
      else if (isDepartmentReviewer) await saveDeanDecisionInFirestore(reservation, 'recommend')
      else if (isUniversityAdministrator) await saveAdministratorDecisionInFirestore(reservation, 'approve')
    } catch (error) {
      console.error('Error approving reservation:', error)
      setStatusError(error instanceof Error ? error.message : 'Could not approve the reservation. Please try again.')
    }
  }

  const handleReject = (id: string, reason: string) => {
    const reservation = confirmingAction?.reservation.id === id ? confirmingAction.reservation : reservations.find(record => record.id === id)
    if (!reservation) throw new Error('This reservation no longer exists. Reload the page and try again.')
    return isRegistrar
      ? saveRegistrarDecisionInFirestore(reservation, 'decline', reason)
      : isDepartmentReviewer
        ? saveDeanDecisionInFirestore(reservation, 'decline', reason)
      : isUniversityAdministrator
        ? saveAdministratorDecisionInFirestore(reservation, 'decline', reason)
        : handleStatusUpdate(id, 'Declined', undefined, reason)
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
      width: '30%',
      render: (res) => (
        <div className="flex items-center gap-4">
          {res.requester?.avatar && !avatarErrors[res.requester.avatar] ? (
            <img
              src={res.requester.avatar}
              alt={res.requester.name}
              className="h-10 w-10 rounded-full border border-slate-200 object-cover ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300 shadow-sm"
              onError={() => setAvatarErrors(prev => ({ ...prev, [res.requester!.avatar!]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
              <UserIcon className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{res.requester?.name}</p>
            <p className="text-xs font-medium text-slate-500">{res.requester?.email}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Room',
      width: '20%',
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
                {room?.type || 'Unknown Room Type'}
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
            {res.requestType === 'Extended' && <span className="ml-2 whitespace-nowrap text-[0.625rem] font-bold text-sky-700" title="Extended reservation">EXTD</span>}
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      width: '15%',
      render: (res) => (
        <div className="relative flex w-40 max-w-full flex-col items-start gap-1">
          <ReservationReviewIndicators registrarRecommend={res.registrarRecommend} deanRecommend={res.deanRecommend} universityAdministratorRecommend={res.universityAdministratorRecommend} status={reservationDisplayStatus(res.status, res.evidencePath)} declinedByRole={res.declinedByRole} autoProcessed={res.autoProcessed} />
          {!((isRegistrar || isDepartmentReviewer || isUniversityAdministrator) && canEditReservation(res)) && (res.status === 'Cancelled' || res.status === 'Completed' || res.status === 'Declined' || res.status === 'Approved' || res.status === 'Pending') && <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className={`-rotate-6 whitespace-nowrap border-2 bg-white/85 px-1.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest shadow-sm ${res.status === 'Approved' ? 'border-emerald-600 text-emerald-700' : res.status === 'Completed' ? res.evidencePath ? 'border-blue-600 text-blue-700' : 'border-amber-600 text-amber-700' : res.status === 'Declined' ? 'border-rose-600 text-rose-700' : res.status === 'Pending' ? 'border-amber-600 text-amber-700' : 'border-slate-500 text-slate-600'}`}>{reservationDisplayStatus(res.status, res.evidencePath)}</span>
          </span>}
        </div>
      )
    },
    {
      header: 'Actions',
      width: '15%',
      align: 'right',
      render: (res) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label={isRegistrar ? 'Recommend as Registrar' : isDepartmentReviewer ? res.registrarRecommend === true ? 'Recommend as Dean' : 'Awaiting Registrar recommendation' : 'Approve as University Administrator'}
            disabled={!canAdvanceReservation(res)}
            className={`h-8 w-8 rounded-lg bg-white transition-all border border-slate-200 ${
              canAdvanceReservation(res)
                ? 'text-emerald-500 hover:border-emerald-300 hover:text-emerald-600 hover:shadow hover:-translate-y-0.5' 
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            onClick={() => handleApprove(res.id)}
          >
            <CheckIcon className="h-4 w-4" />
          </IconButton>
          {(isRegistrar || isDepartmentReviewer || isUniversityAdministrator) && <IconButton
            label="Decline reservation"
            disabled={!canAdvanceReservation(res)}
            className={`h-8 w-8 rounded-lg bg-white transition-all border border-slate-200 ${
              canAdvanceReservation(res)
                ? 'text-rose-500 hover:border-rose-300 hover:text-rose-600 hover:shadow hover:-translate-y-0.5' 
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            onClick={() => setConfirmingAction({ reservation: res, type: 'decline' })}
          >
            <CloseIcon className="h-4 w-4" />
          </IconButton>}
          {(canManageRecords || isDepartmentReviewer) && <><IconButton
            label={isRegistrar || isDepartmentReviewer || isUniversityAdministrator ? 'Manual edit status' : 'Edit status'}
            disabled={!canEditReservation(res)}
            className={`h-8 w-8 rounded-lg bg-white border border-slate-200 transition-all ${canEditReservation(res)
              ? 'text-slate-500 shadow-sm hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5'
              : 'opacity-30 cursor-not-allowed text-slate-400'}`}
            onClick={() => setEditingReservation(res)}
          >
            <EditIcon className="h-4 w-4" />
          </IconButton>
          {userRole === 'Admin' && <IconButton
            label="Delete reservation"
            className="h-8 w-8 rounded-lg bg-white text-rose-500 shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5 transition-all"
            onClick={() => setConfirmingAction({ reservation: res, type: 'delete' })}
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>}</>}
        </div>
      )
    }
  ]

  const buildingOptions = useMemo(() => {
    return Array.from(new Set(buildings.map(b => b.code).filter(Boolean))).sort()
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
      options: [...STATUS_ORDER.slice(0, -1), 'Needs Evidence', 'Completed'],
      selectedValues: selectedStatuses,
      onChange: setSelectedStatuses
    },
    {
      id: 'reviewStep',
      title: 'Review Step',
      options: [...RESERVATION_REVIEW_STEPS],
      selectedValues: selectedReviewSteps,
      onChange: setSelectedReviewSteps
    }
  ]

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="Manage Reservations" 
          description={isRegistrar ? 'Recommend pending requests before Dean review.' : isDepartmentReviewer ? 'View your department requests and review them after Registrar recommendation.' : isUniversityAdministrator ? 'Give final approval after Registrar and Dean recommendations.' : 'Manage reservation records.'}
        />

        <section aria-label="Reservation review overview" className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,4fr)]">
          {reviewSummaryGroups.map(group => (
            <div key={group.title} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">{group.title}</h2>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-600">{isDepartmentReviewer ? 'Department' : 'Campus-wide'}</span>
              </div>
              <div className={`grid flex-1 grid-cols-2 gap-3 ${group.columns}`}>
                {group.items.map((item, index) => (
                  <div key={item.label} className={`flex min-h-28 min-w-0 flex-col justify-between rounded-xl border p-3.5 sm:p-4 ${item.color} ${group.title === 'Awaiting review' && index === 2 ? 'col-span-2 sm:col-span-1' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-3xl font-bold leading-none tabular-nums" aria-label={`${group.title}, ${item.label}: ${reservationsLoaded ? item.count : 'loading'}`}>{reservationsLoaded ? item.count : '—'}</p>
                      {item.active && <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[0.625rem] font-bold">Your step</span>}
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-bold leading-tight sm:text-sm">{item.label}</p>
                      {item.step && <p className="mt-1 text-xs font-medium opacity-75">{item.step}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="relative z-10">
          {statusError && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{statusError}</p>}
          <DataTable
            data={filteredReservations}
            pageResetKey={JSON.stringify([searchTerm, selectedStatuses, selectedReviewSteps, selectedBuildings])}
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
        <ReservationInfoModal
          isOpen={!!viewingReservation}
          onClose={() => setViewingReservation(null)}
          reservation={enrichedReservations.find(reservation => reservation.id === viewingReservation.id) || viewingReservation}
          roomName={viewingReservation.roomName || 'Unknown Room'}
          roomType={rooms.find(room => room.id === viewingReservation.roomId)?.type || 'Unknown Room Type'}
          requester={viewingReservation.requester}
          showReviewIndicators
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
          allowedStatuses={allowedStatusesFor(editingReservation)}
          adminReview={userRole === 'Admin'}
          reviewRole={canManuallyReviewAsRegistrar(editingReservation) ? 'Registrar'
            : canManuallyReviewAsDean(editingReservation) ? 'Dean'
              : canManuallyReviewAsAdministrator(editingReservation) ? 'University Administrator' : undefined}
          onClose={() => setEditingReservation(null)}
          onUpdate={(id, status, reason) => handleStatusUpdate(id, status, undefined, reason)}
          onAdminReview={saveAdminReviewInFirestore}
          onReview={(id, decision, reason) => {
            const reservation = editingReservation.id === id ? editingReservation : reservations.find(record => record.id === id)
            if (!reservation) throw new Error('This reservation no longer exists. Reload the page and try again.')
            return isDepartmentReviewer
              ? saveDeanDecisionInFirestore(reservation, decision === 'approve' ? 'recommend' : decision, reason, true)
              : isUniversityAdministrator
                ? saveAdministratorDecisionInFirestore(reservation, decision, reason, true)
                : saveRegistrarDecisionInFirestore(reservation, decision === 'approve' ? 'recommend' : decision, reason, true)
          }}
        />
      )}

      {confirmingAction && (
        <ConfirmationModal
          reservation={confirmingAction.reservation}
          type={confirmingAction.type}
          onConfirm={(reason) => confirmingAction.type === 'decline' ? handleReject(confirmingAction.reservation.id, reason || '') : handleDelete(confirmingAction.reservation.id)}
          onClose={() => setConfirmingAction(null)}
        />
      )}
      </div>
    </section>
  )
}

export default ManageReservationsPage
