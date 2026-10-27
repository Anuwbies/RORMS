import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { scheduleMeetingRecords } from './scheduleMeetings'

export interface ReservationReportRecord {
  id: string
  roomId?: string
  buildingId?: string
  userId?: string
  date?: string
  startTime?: string
  endTime?: string
  duration?: number
  requestType?: 'Standard' | 'Extended'
  purpose?: string
  subjectCode?: string
  classSection?: string
  department?: string
  attendees?: number
  status?: string
  deanRecommend?: boolean
  registrarRecommend?: boolean
  universityAdministratorRecommend?: boolean
  autoApproved?: boolean
  approvedByRole?: string
  declinedByRole?: string
  declinedReason?: string
  cancellationReason?: string
  autoProcessed?: boolean
  evidencePath?: string
  evidenceFiles?: Array<{ path: string; type: 'image' | 'video'; fileName: string; uploadedAt?: string }>
  createdAt?: unknown
  updatedAt?: unknown
  completedAt?: unknown
}

export interface RoomReportRecord {
  id: string
  buildingId?: string
  name?: string
  code?: string
  type?: string
  floor?: number | string
  capacity?: number
  status?: string
  amenities?: string[]
  availableDays?: string[]
  startTime?: string
  endTime?: string
  minBookingMins?: number
  maxBookingMins?: number
  description?: string
  createdAt?: unknown
  updatedAt?: unknown
}

export interface BuildingReportRecord {
  id: string
  name?: string
  code?: string
  createdAt?: unknown
}

export interface MembershipReportRecord {
  id: string
  userId?: string
  fullName?: string
  firstName?: string
  surname?: string
  email?: string
  department?: string
  role?: string
  status?: string
  joinedAt?: unknown
  createdAt?: unknown
}

export interface InvitationReportRecord {
  id: string
  membershipId?: string
  email?: string
  role?: string
  department?: string
  isReactivation?: boolean
  status?: string
  createdAt?: unknown
  expiresAt?: unknown
}

export interface UserReportRecord {
  id: string
  email?: string
  fullName?: string
  firstName?: string
  surname?: string
  isActive?: boolean
  isVerify?: boolean
  createdAt?: unknown
}

export interface DepartmentReportRecord {
  id: string
  name?: string
  code?: string
  dean?: string
  programHead?: string
  createdAt?: unknown
}

export interface ScheduleReportRecord {
  id: string
  source?: string
  schemaVersion?: number
  sourceScheduleId?: string
  parentId?: string
  course?: string
  college?: string
  subjectArea?: string
  yearLevel?: number
  yearLevelLabel?: string
  units?: { lec?: number | null; lab?: number | null; total?: number | null }
  credits?: number | null
  hours?: { lec?: number | null; lab?: number | null; total?: number | null }
  maxStudents?: number | null
  f2fTime?: { lec?: string[]; lab?: string[] }
  f2fDays?: { lec?: string[]; lab?: string[] }
  f2fRoom?: { lec?: string[]; lab?: string[] }
  rawValues?: string[]
  faculty?: unknown
  room?: string
  time?: string
  day?: string
  department?: string
  type?: string
  subjectCode?: string
  subjectTitle?: string
  classSection?: string
  format?: string
  format2?: string
  startTime?: string
  endTime?: string
  startTime2?: string
  endTime2?: string
  days?: string[]
  buildingId?: string
  buildingId2?: string
  roomId?: string
  roomId2?: string
  instructorId?: string
  instructorId2?: string
  status?: string
  academicYear?: string
  academicYearId?: string
  semester?: string
  semesterKey?: string
  academicTerm?: string
  orderIndex?: number
  createdAt?: unknown
  updatedAt?: unknown
}

function useRealtimeCollection<T extends { id: string }>(collectionName: string) {
  const [records, setRecords] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, collectionName), snapshot => {
      setRecords(collectionName === 'schedule' || collectionName === 'schedules' ? scheduleMeetingRecords(snapshot.docs) as unknown as T[] : snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T))
      setError(null)
      setIsLoading(false)
    }, snapshotError => {
      console.error(`Unable to load ${collectionName} reporting data:`, snapshotError)
      setError(collectionName)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [collectionName])

  return { records, isLoading, error }
}

export function useFacilityScheduleRecords() {
  return useRealtimeCollection<ScheduleReportRecord>('schedules')
}

export function timestampToDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const converter = (value as { toDate?: unknown }).toDate
    if (typeof converter === 'function') return converter.call(value) as Date
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export function dateStringToDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatReportDate(value: unknown, fallback = 'Not recorded') {
  const date = timestampToDate(value)
  if (!date) return fallback
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatReportDateTime(value: unknown, fallback = 'Not recorded') {
  const date = timestampToDate(value)
  if (!date) return fallback
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function timeToMinutes(time?: string) {
  if (!time) return 0
  const normalized = time.trim().toUpperCase()
  const isPM = normalized.includes('PM')
  const isAM = normalized.includes('AM')
  const [hourPart, minutePart] = normalized.replace(/[^\d:]/g, '').split(':')
  let hour = Number(hourPart || 0)
  const minute = Number(minutePart || 0)
  if (isPM && hour < 12) hour += 12
  if (isAM && hour === 12) hour = 0
  return hour * 60 + minute
}

export function formatReportTime(time?: string) {
  if (!time) return 'Not set'
  const minutes = timeToMinutes(time)
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

export function reservationDurationMinutes(reservation: ReservationReportRecord) {
  const explicitDuration = Number(reservation.duration)
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) return explicitDuration
  const calculated = timeToMinutes(reservation.endTime) - timeToMinutes(reservation.startTime)
  return Math.max(0, calculated)
}

export function useReportingData() {
  const reservationsState = useRealtimeCollection<ReservationReportRecord>('reservations')
  const roomsState = useRealtimeCollection<RoomReportRecord>('rooms')
  const buildingsState = useRealtimeCollection<BuildingReportRecord>('buildings')
  const membershipsState = useRealtimeCollection<MembershipReportRecord>('memberships')
  const invitationsState = useRealtimeCollection<InvitationReportRecord>('invitations')
  const usersState = useRealtimeCollection<UserReportRecord>('users')
  const departmentsState = useRealtimeCollection<DepartmentReportRecord>('departments')
  const schedulesState = useRealtimeCollection<ScheduleReportRecord>('schedule')

  const errors = [
    reservationsState.error,
    roomsState.error,
    buildingsState.error,
    membershipsState.error,
    invitationsState.error,
    usersState.error,
    departmentsState.error,
    schedulesState.error,
  ].filter((value): value is string => Boolean(value))

  const isLoading = [
    reservationsState.isLoading,
    roomsState.isLoading,
    buildingsState.isLoading,
    membershipsState.isLoading,
    invitationsState.isLoading,
    usersState.isLoading,
    departmentsState.isLoading,
    schedulesState.isLoading,
  ].some(Boolean)

  return useMemo(() => ({
    reservations: reservationsState.records,
    rooms: roomsState.records,
    buildings: buildingsState.records,
    memberships: membershipsState.records,
    invitations: invitationsState.records,
    isInvitationsLoading: invitationsState.isLoading,
    invitationsError: invitationsState.error,
    users: usersState.records,
    departments: departmentsState.records,
    schedules: schedulesState.records,
    errors,
    isLoading,
  }), [
    reservationsState.records,
    roomsState.records,
    buildingsState.records,
    membershipsState.records,
    invitationsState.records,
    invitationsState.isLoading,
    invitationsState.error,
    usersState.records,
    departmentsState.records,
    schedulesState.records,
    errors.join('|'),
    isLoading,
  ])
}
