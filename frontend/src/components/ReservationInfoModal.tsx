import { CalendarIcon, ClockIcon, UserIcon, HourglassIcon } from './Icons'
import { Button } from './Button'

type ReservationStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'

interface ReservationInfoModalProps {
  isOpen: boolean
  onClose: () => void
  reservation: {
    id: string
    date: string
    startTime: string
    endTime: string
    duration: number
    attendees?: number
    purpose: string
    status: ReservationStatus
    createdAt?: any
  }
  roomName: string
  buildingName: string
  onCancel?: (reservationId: string) => void
  onDelete?: (reservationId: string) => void
  isCanceling?: boolean
}

const statusClasses: Record<ReservationStatus, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

export function ReservationInfoModal({ isOpen, onClose, onCancel, onDelete, isCanceling, reservation, roomName, buildingName }: ReservationInfoModalProps) {
  if (!isOpen || !reservation) return null

  const canCancel = reservation.status === 'Pending' || reservation.status === 'Approved'
  const canDelete = reservation.status === 'Cancelled' || reservation.status === 'Completed' || reservation.status === 'Declined'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <h3 className="text-xl font-bold leading-tight">Reservation Details</h3>
          <p className="mt-1 text-sm text-white/80">View information about your reservation</p>
        </div>

        <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
          <div className="p-6 space-y-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                 <div>
                   <h4 className="text-xl font-bold text-slate-900 leading-tight">{roomName}</h4>
                   <p className="text-sm font-semibold text-slate-500">{buildingName}</p>
                 </div>
                 <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-widest ${statusClasses[reservation.status]}`}>
                    {reservation.status}
                 </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                 <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Date</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                      <p className="text-sm font-bold text-slate-700">
                         {new Date(reservation.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Time</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                      <p className="text-sm font-bold text-slate-700">
                        {reservation.startTime} - {reservation.endTime}
                      </p>
                    </div>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Attendees</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                      <p className="text-sm font-bold text-slate-700">{reservation.attendees || 1} pax</p>
                    </div>
                 </div>
                 <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Duration</p>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                      <HourglassIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                      <p className="text-sm font-bold text-slate-700">{reservation.duration} mins</p>
                    </div>
                 </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Purpose</h5>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                  <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                    {reservation.purpose || 'No purpose specified.'}
                  </p>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-[0.65rem] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-4 mt-2">
                 <span>Requested {reservation.createdAt?.toDate ? reservation.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                 <span>ID: {reservation.id.slice(0, 8)}</span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={isCanceling}
                onClick={onClose}
                className="flex-1 h-12 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Close
              </Button>
              {canCancel && (
                <Button
                  type="button"
                  variant="brand"
                  disabled={isCanceling}
                  onClick={() => onCancel?.(reservation.id)}
                  className="flex-1 h-12 text-base !bg-rose-600 !text-white !border-transparent hover:!bg-rose-700 shadow-sm disabled:!opacity-50 disabled:!cursor-not-allowed"
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
                  className="flex-1 h-12 text-base !bg-rose-600 !text-white !border-transparent hover:!bg-rose-700 shadow-sm disabled:!opacity-50 disabled:!cursor-not-allowed"
                >
                  {isCanceling ? 'Deleting...' : 'Delete Record'}
                </Button>
              )}
            </div>
          </div>
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
