import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { UserIcon, ClockIcon, BookIcon, HourglassIcon } from './Icons'
import { roomStatusClasses, DAYS_OF_WEEK, DEFAULT_ROOM_IMAGE } from '../types/room'
import type { Room } from '../types/room'
import { Button } from './Button'
import { RoomAmenities } from './RoomAmenities'
import { RoomCommentsModal } from './RoomCommentsModal'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

interface RoomInfoModalProps {
  isOpen: boolean
  room: Room | null
  onClose: () => void
  onBack?: () => void
  actionButton?: React.ReactNode
  comments?: React.ReactNode | ((isVisible: boolean, isAnonymous: boolean) => React.ReactNode)
  hasUnreadComments?: boolean
}

export function RoomInfoModal({ isOpen, room, onClose, onBack, actionButton, comments, hasUnreadComments = false }: RoomInfoModalProps) {
  const [isCommentsVisible, setIsCommentsVisible] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [linkedRoom, setLinkedRoom] = useState<{ partnerId: string; room: Room | null; message: string } | null>(null)
  const commentsToggleRef = useRef<HTMLButtonElement>(null)
  const roomModalRef = useRef<HTMLDivElement>(null)
  const [roomModalSize, setRoomModalSize] = useState<{ width: number; height: number } | null>(null)
  const hasComments = Boolean(comments)

  useEffect(() => {
    setIsCommentsVisible(false)
    setIsAnonymous(false)
  }, [isOpen, room?.id])

  useEffect(() => {
    const partnerId = room?.collapsibleWithRoomId
    if (!isOpen || !partnerId) return
    return onSnapshot(doc(db, 'rooms', partnerId), snapshot => {
      setLinkedRoom({
        partnerId,
        room: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as Room : null,
        message: snapshot.exists() ? '' : 'Linked room record not found',
      })
    }, () => {
      setLinkedRoom({ partnerId, room: null, message: 'Could not load linked room' })
    })
  }, [isOpen, room?.collapsibleWithRoomId])

  useLayoutEffect(() => {
    const modal = roomModalRef.current
    if (!isOpen || !hasComments || !modal) return

    const measure = () => {
      const { width, height } = modal.getBoundingClientRect()
      setRoomModalSize(previous => previous?.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(modal)
    return () => observer.disconnect()
  }, [isOpen, room?.id, hasComments])

  if (!isOpen || !room) return null

  const commentsId = `room-comments-${room.id}`
  const hideComments = () => {
    setIsCommentsVisible(false)
    commentsToggleRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className={`flex w-full items-start justify-center gap-4 ${comments && isCommentsVisible ? 'max-w-lg xl:max-w-[65rem]' : 'max-w-lg'}`}>
      <div 
        ref={roomModalRef}
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <div className="flex items-stretch justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details and availability schedule</p>
            </div>
            {comments && <button
              ref={commentsToggleRef}
              type="button"
              onClick={() => setIsCommentsVisible(visible => !visible)}
              aria-label={`${isCommentsVisible ? 'Hide comments' : 'Show comments'}${hasUnreadComments ? ' (new comments)' : ''}`}
              aria-expanded={isCommentsVisible}
              aria-controls={commentsId}
              title={hasUnreadComments ? 'New comments' : isCommentsVisible ? 'Hide comments' : 'Show comments'}
              className="relative flex w-11 shrink-0 cursor-pointer items-center justify-center self-stretch rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
              </svg>
              {hasUnreadComments && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />}
            </button>}
          </div>
        </div>

        <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
          <div className="p-6 space-y-5">
            <div className="flex gap-5">
              <div className="w-[9.5rem] h-[9.5rem] shrink-0 rounded-2xl border border-gray-200 bg-gray-100 overflow-hidden shadow-sm">
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
                    <span className="inline-flex items-center justify-center rounded-xl bg-gray-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
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
                    <div className="rounded-xl border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-gray-500 shrink-0" />
                      <p className="text-sm font-bold text-gray-700">{room.capacity} pax</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Booking Limits</p>
                    <div className="rounded-xl border border-gray-200 bg-gray-100 p-2.5 flex items-center gap-2">
                      <HourglassIcon className="h-4 w-4 text-gray-500 shrink-0" />
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
                <div className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {room.description || 'No description provided for this room.'}
                  </p>
                </div>
              </div>

              {room.isCollapsible && room.collapsibleWithRoomId && (
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Collapsible With</h5>
                  <p className="rounded-xl border border-[var(--brand-color)]/20 bg-[#f3f7ee] p-3 text-sm font-semibold text-[#41572a]">
                    {linkedRoom?.partnerId === room.collapsibleWithRoomId
                      ? linkedRoom.room ? `${linkedRoom.room.code} — ${linkedRoom.room.name}` : linkedRoom.message
                      : 'Loading linked room…'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Availability</h5>
                  <div className="flex gap-1 h-[2.125rem]">
                    {DAYS_OF_WEEK.map((day) => {
                      const isAvailable = room.availableDays.includes(day)
                      return (
                        <div
                          key={day}
                          title={day}
                          className={`flex-1 flex items-center justify-center rounded-lg text-[0.625rem] font-bold transition-colors ${
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
                  <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-gray-700 bg-gray-100 h-[2.125rem] rounded-xl border border-gray-200">
                    <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                    <span>{room.startTime} - {room.endTime}</span>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">Room Amenities</h5>
                <RoomAmenities 
                  amenities={room.amenities}
                  emptyMessage="No amenities listed."
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onBack || onClose}
                className="flex-1"
              >
                {onBack ? 'Back' : 'Close'}
              </Button>
              {actionButton}
            </div>
          </div>
        </div>
      </div>
      {comments && <RoomCommentsModal
        id={commentsId}
        isOpen={isCommentsVisible}
        roomName={room.name}
        size={roomModalSize}
        onClose={hideComments}
        isAnonymous={isAnonymous}
        onAnonymousChange={setIsAnonymous}
      >
        {typeof comments === 'function' ? comments(isCommentsVisible, isAnonymous) : comments}
      </RoomCommentsModal>}
      </div>
      <div 
        className="absolute inset-0 -z-10" 
        onMouseDown={onBack || onClose} 
      />
    </div>
  )
}
