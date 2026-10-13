import type { Room } from '../types/room'

export type ReservationRequestType = 'Standard' | 'Extended'

export function reservationTimeMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function reservationTimeString(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`
}

/** Extended requests bypass duration/slot limits, but never room hours or occupied time. */
export function maxReservationDuration(
  room: Pick<Room, 'startTime' | 'endTime' | 'maxBookingMins'>,
  startTime: string,
  requestType: ReservationRequestType,
  busy: readonly { start: number; end: number }[],
): number {
  if (!startTime) return 0
  const start = reservationTimeMinutes(startTime)
  const opening = reservationTimeMinutes(room.startTime || '07:30')
  const closing = reservationTimeMinutes(room.endTime || '18:00')
  if (!Number.isFinite(start) || start < opening || start >= closing) return 0
  let max = closing - start
  if (requestType === 'Standard') {
    max = Math.min(max, room.maxBookingMins || 180)
    const nextBoundary = [450, 540, 630, 720, 810, 900, 990, 1080]
      .find((boundary, index) => index > 0 && start >= 450 && boundary > start)
    if (nextBoundary !== undefined) max = Math.min(max, nextBoundary - start)
  }
  for (const interval of busy) {
    if (interval.end > start) max = Math.min(max, Math.max(0, interval.start - start))
  }
  return Math.max(0, max)
}
