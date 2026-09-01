import React from 'react'
import { UserIcon, ClockIcon, BookIcon } from './Icons'
import { roomStatusClasses, DAYS_OF_WEEK, DEFAULT_ROOM_IMAGE } from '../types/room'
import type { Room } from '../types/room'
import { Button } from './Button'
import { RoomAmenities } from './RoomAmenities'

interface RoomInfoModalProps {
  isOpen: boolean
  room: Room | null
  onClose: () => void
  onBack?: () => void
  actionButton?: React.ReactNode
}

export function RoomInfoModal({ isOpen, room, onClose, onBack, actionButton }: RoomInfoModalProps) {
  if (!isOpen || !room) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
          <h3 className="text-xl font-bold leading-tight">Room Information</h3>
          <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details and availability schedule</p>
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
                <div className="rounded-2xl border border-gray-200 bg-gray-100 p-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {room.description || 'No description provided for this room.'}
                  </p>
                </div>
              </div>

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
      <div 
        className="absolute inset-0 -z-10" 
        onMouseDown={onBack || onClose} 
      />
    </div>
  )
}
