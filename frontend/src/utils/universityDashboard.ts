export interface UniversityDashboardRoom {
  id: string
  name?: string
  code?: string
  status?: string
  capacity?: number
}

export interface UniversityDashboardReservation {
  id: string
  roomId?: string
  date?: string
  startTime?: string
  endTime?: string
  purpose?: string
  status?: string
  registrarRecommend?: boolean
  deanRecommend?: boolean
  universityAdministratorRecommend?: boolean
}

const manilaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function universityDateKey(date: Date): string {
  const parts = manilaDate.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function universityDashboardData(rooms: UniversityDashboardRoom[], reservations: UniversityDashboardReservation[], now: Date) {
  const today = universityDateKey(now)
  const status = (value?: string) => (value || '').trim().toLowerCase()
  const pending = reservations.filter(item => status(item.status) === 'pending'
    && item.registrarRecommend === true && item.deanRecommend === true
    && item.universityAdministratorRecommend !== true)
  const todayReservations = reservations.filter(item => item.date === today && ['pending', 'approved', 'completed'].includes(status(item.status)))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
  const available = rooms.filter(item => status(item.status) === 'available').length
  const unavailable = rooms.filter(item => status(item.status) === 'unavailable').length
  const maintenance = rooms.filter(item => status(item.status) === 'maintenance').length
  const capacity = rooms.reduce((total, room) => total + (Number.isFinite(room.capacity) ? Math.max(0, room.capacity || 0) : 0), 0)
  const week = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(new Date(`${today}T12:00:00+08:00`).getTime() + offset * 86_400_000)
    const key = universityDateKey(date)
    const bookings = reservations.filter(item => item.date === key)
    const approved = bookings.filter(item => status(item.status) === 'approved').length
    const pending = bookings.filter(item => status(item.status) === 'pending').length
    return { key, label: date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric' }), approved, pending, total: approved + pending }
  })
  return { todayReservations, pending, available, unavailable, maintenance, capacity, week }
}
