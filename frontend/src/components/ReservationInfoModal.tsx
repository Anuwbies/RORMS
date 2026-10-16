import { useState, useEffect } from 'react'
import { CalendarIcon, ClockIcon, UserIcon, HourglassIcon, DoorIcon } from './Icons'
import { Button } from './Button'
import { ExtendedReservationBadge } from './ExtendedReservationBadge'
import { ReservationReviewIndicators } from './ReservationReviewIndicators'
import { roomScheduleSection } from '../utils/roomSchedule'

type ReservationStatus = 'Pending' | 'Recommending Approval' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'

export interface RequesterInfo {
  name: string
  email?: string
  avatar?: string
}

interface ReservationInfoModalProps {
  isOpen: boolean
  onClose: () => void
  reservation: {
    id: string
    date: string
    startTime: string
    endTime: string
    duration?: number
    attendees?: number
    purpose?: string
    requestType?: 'Standard' | 'Extended'
    subjectCode?: string
    classSection?: string
    department?: string
    status: ReservationStatus
    deanRecommend?: boolean
    registrarRecommend?: boolean
    universityAdministratorRecommend?: boolean
    declinedReason?: string
    createdAt?: any
    updatedAt?: any
  }
  roomName: string
  roomType: string
  requester?: RequesterInfo
  onCancel?: (reservationId: string) => void
  onDelete?: (reservationId: string) => void
  onViewRoom?: () => void
  isCanceling?: boolean
  showReviewIndicators?: boolean
}

const statusClasses: Record<ReservationStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  'Recommending Approval': 'bg-sky-100 text-sky-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

export function ReservationInfoModal({
  isOpen,
  onClose,
  onCancel,
  onDelete,
  onViewRoom,
  isCanceling,
  reservation,
  roomName,
  roomType,
  requester,
  showReviewIndicators,
}: ReservationInfoModalProps) {
  const [avatarError, setAvatarError] = useState(false)

  useEffect(() => {
    setAvatarError(false)
  }, [reservation?.id, requester?.avatar])

  if (!isOpen || !reservation) return null

  const canCancel = !!onCancel && (reservation.status === 'Pending' || reservation.status === 'Recommending Approval' || reservation.status === 'Approved')
  const canDelete = !!onDelete && (reservation.status === 'Cancelled' || reservation.status === 'Completed' || reservation.status === 'Declined')

  const calculateDuration = () => {
    if (reservation.duration) return reservation.duration
    if (reservation.startTime && reservation.endTime) {
      const [startH, startM] = reservation.startTime.split(':').map(Number)
      const [endH, endM] = reservation.endTime.split(':').map(Number)
      if (!isNaN(startH) && !isNaN(endH)) {
        const diff = (endH * 60 + (endM || 0)) - (startH * 60 + (startM || 0))
        if (diff > 0) return diff
      }
    }
    return 60
  }

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    }
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div 
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
          <h3 className="text-xl font-bold leading-tight">Reservation Details</h3>
          <p className="mt-1 text-sm text-white/80">
            {requester ? 'Review booking request and requester details' : 'View information about your reservation'}
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto custom-scrollbar">
          <div className="p-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-xl font-bold text-slate-900 leading-tight">{roomName}</h4>
                  <p className="text-sm font-semibold text-slate-500">{roomType}</p>
                  <ExtendedReservationBadge requestType={reservation.requestType} />
                </div>
                <span className={`inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-widest ${statusClasses[reservation.status]}`}>
                  {reservation.status}
                </span>
              </div>

              {showReviewIndicators && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                  <ReservationReviewIndicators
                    registrarRecommend={reservation.registrarRecommend}
                    deanRecommend={reservation.deanRecommend}
                    universityAdministratorRecommend={reservation.universityAdministratorRecommend}
                    status={reservation.status}
                  />
                </div>
              )}

              {requester && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-3">
                  <div className="relative h-14 w-14 shrink-0 rounded-full border border-slate-200 bg-white overflow-hidden shadow-sm flex items-center justify-center">
                    {requester.avatar && !avatarError ? (
                      <img
                        src={requester.avatar}
                        alt={requester.name}
                        className="h-full w-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <UserIcon className="h-6 w-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">Reserved By</p>
                    <p className="text-sm font-bold text-slate-700 truncate leading-tight">{requester.name}</p>
                    {requester.email && (
                      <p className="text-xs font-medium text-slate-500 truncate">{requester.email}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Date</dt>
                    <dd className="flex items-start gap-2 text-sm font-bold text-slate-700">
                      <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" />
                      <span>{formatDateDisplay(reservation.date)}</span>
                    </dd>
                  </div>
                  <div className="min-w-0 text-right">
                    <dt className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Time</dt>
                    <dd className="flex items-start justify-end gap-2 text-sm font-bold text-slate-700">
                      <span>{reservation.startTime} - {reservation.endTime}</span>
                      <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-color)]" />
                    </dd>
                  </div>
                </dl>
                <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200/80 pt-2.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <dt className="flex items-center gap-2">
                      <UserIcon className="h-4 w-4 shrink-0 text-[var(--brand-color)]" />
                      Attendees
                    </dt>
                    <dd className="font-bold text-slate-700">{reservation.attendees || 1} pax</dd>
                  </div>
                  <div className="ml-auto flex flex-row-reverse items-center gap-2 text-xs text-slate-500">
                    <dt className="flex flex-row-reverse items-center gap-2">
                      <HourglassIcon className="h-4 w-4 shrink-0 text-[var(--brand-color)]" />
                      Duration
                    </dt>
                    <dd className="font-bold text-slate-700">{calculateDuration()} mins</dd>
                  </div>
                </dl>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ['Subject Code', reservation.subjectCode?.trim() || 'N/A'],
                  ['Section', reservation.classSection?.trim() ? roomScheduleSection(reservation) : 'N/A'],
                  ['Department', reservation.department]
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="min-w-0 space-y-1.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
                    <p className="text-[0.65rem] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-700 break-words">{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
                <h5 className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500">Purpose</h5>
                <p className="break-words text-sm text-slate-600 leading-relaxed font-semibold">
                  {reservation.purpose || 'No purpose specified.'}
                </p>
              </div>

              {reservation.status === 'Declined' && reservation.declinedReason?.trim() && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <h5 className="mb-1 text-xs font-bold uppercase tracking-widest text-rose-700">Reason for declining</h5>
                  <p className="break-words text-sm font-semibold leading-relaxed text-rose-800">{reservation.declinedReason}</p>
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center gap-2 text-[0.65rem] text-slate-400 font-bold uppercase tracking-widest">
                <span>Requested {reservation.createdAt?.toDate ? reservation.createdAt.toDate().toLocaleDateString() : 'date unavailable'}</span>
                <span>ID: {reservation.id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-100 bg-white px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={isCanceling}
            onClick={onClose}
            className="flex-1 h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Close
          </Button>
          {onViewRoom && (
            <Button
              type="button"
              variant="brand"
              onClick={onViewRoom}
              className="flex-1 h-12 text-sm sm:text-base flex items-center justify-center gap-2"
            >
              <DoorIcon className="h-4 w-4" />
              <span>Room Information</span>
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="brand"
              disabled={isCanceling}
              onClick={() => onCancel?.(reservation.id)}
              className="flex-1 h-12 text-sm sm:text-base !bg-rose-600 !text-white !border-transparent hover:!bg-rose-700 shadow-sm disabled:!opacity-50 disabled:!cursor-not-allowed"
            >
              {isCanceling ? 'Canceling...' : 'Cancel Reservation'}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="brand"
              disabled={isCanceling}
              onClick={() => onDelete?.(reservation.id)}
              className="flex-1 h-12 text-sm sm:text-base !bg-rose-600 !text-white !border-transparent hover:!bg-rose-700 shadow-sm disabled:!opacity-50 disabled:!cursor-not-allowed"
            >
              {isCanceling ? 'Deleting...' : 'Delete Record'}
            </Button>
          )}
        </div>
      </div>
      <div 
        className="absolute inset-0 -z-10" 
        onMouseDown={() => {
          if (!isCanceling) onClose()
        }} 
      />
    </div>
  )
}
