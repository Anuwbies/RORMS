import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { dashboardInstructorMeetings, dashboardScheduleDays, dashboardScheduleMeetings, type DashboardScheduleMeeting } from '../../utils/dashboardSchedules'
import { roomScheduleRoom, roomScheduleSection, scheduleMatchesTerm } from '../../utils/roomSchedule'
import { SectionHeader } from '../../components/SectionHeader'
import {
  UserIcon, CalendarIcon, ClockIcon, DoorIcon, ArrowRightIcon, ChevronRightIcon, BookIcon, BuildingIcon, UsersIcon, DepartmentIcon
} from '../../components/Icons'
import { db, auth } from '../../firebase'
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { useAcademicSemester } from '../../utils/academicSemester'

interface FacultyDashboardProps {
  userRole?: string
  headerAction?: ReactNode
}

type ScheduleItem = DashboardScheduleMeeting

interface ReservationItem {
  id: string
  roomId: string
  buildingId: string
  roomName?: string
  buildingName?: string
  date: string
  startTime: string
  endTime: string
  purpose: string
  status: string
  isHidden?: boolean
}

interface RoomItem {
  id: string
  buildingId: string
  status: string
  capacity: number
}

interface DepartmentData {
  id?: string
  name: string
  code: string
  logo?: string
  memberCount?: number
  deanCount?: number
  programHeadCount?: number
  instructorCount?: number
}

const statusBadgeClasses: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

const formatTimeTo12Hour = (timeStr?: string) => {
  if (!timeStr) return ''
  const clean = timeStr.trim()
  if (clean.includes('AM') || clean.includes('PM')) return clean
  const [h, m] = clean.split(':')
  if (!h) return timeStr
  const hourNum = parseInt(h, 10)
  if (isNaN(hourNum)) return timeStr
  const suffix = hourNum >= 12 ? 'PM' : 'AM'
  const displayHour = hourNum % 12 || 12
  const minute = m ? m.padStart(2, '0') : '00'
  return `${displayHour}:${minute} ${suffix}`
}

const timeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 0
  const clean = timeStr.trim()
  const isPM = clean.toUpperCase().includes('PM')
  const isAM = clean.toUpperCase().includes('AM')
  const parts = clean.replace(/[^\d:]/g, '').split(':')
  let hours = parseInt(parts[0] || '0', 10)
  const mins = parseInt(parts[1] || '0', 10)
  if (isPM && hours < 12) hours += 12
  if (isAM && hours === 12) hours = 0
  return hours * 60 + (mins || 0)
}

export function FacultyDashboardPage({ userRole: _userRole, headerAction }: FacultyDashboardProps = {}) {
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map())
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [buildingsMap, setBuildingsMap] = useState<Map<string, string>>(new Map())
  const [allSemesterSchedules, setAllSemesterSchedules] = useState<ScheduleItem[]>([])
  const [allReservations, setAllReservations] = useState<ReservationItem[]>([])
  const [upcomingReservations, setUpcomingReservations] = useState<ReservationItem[]>([])
  const [departmentInfo, setDepartmentInfo] = useState<DepartmentData | null>(null)
  const [userMembershipRole, setUserMembershipRole] = useState<string>('')
  const [logoError, setLogoError] = useState<boolean>(false)
  const { activeAcademicYear, currentSemester } = useAcademicSemester()
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Keep time updated every 60 seconds for live schedule indicators
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const currentMinutes = useMemo(() => {
    return currentTime.getHours() * 60 + currentTime.getMinutes()
  }, [currentTime])

  const effectiveRole = userMembershipRole || _userRole || 'Instructor'

  const roomStats = useMemo(() => {
    const available = rooms.filter(room => room.status.toLowerCase() === 'available').length
    const unavailable = rooms.filter(room => room.status.toLowerCase() === 'unavailable').length
    const maintenance = rooms.filter(room => room.status.toLowerCase() === 'maintenance').length
    const totalCapacity = rooms.reduce((total, room) => total + room.capacity, 0)
    const availablePercent = rooms.length > 0 ? Math.round(available / rooms.length * 100) : 0
    return { available, unavailable, maintenance, total: rooms.length, totalCapacity, availablePercent }
  }, [rooms])

  const reservationStats = useMemo(() => {
    const count = (status: string) => allReservations.filter(reservation => reservation.status.toLowerCase() === status).length
    return {
      pending: count('pending'),
      approved: count('approved'),
      declined: count('declined'),
      cancelled: count('cancelled'),
      completed: count('completed'),
      total: allReservations.length,
    }
  }, [allReservations])

  const getClassStatus = (startTimeStr?: string, endTimeStr?: string) => {
    if (!startTimeStr || !endTimeStr) return 'upcoming'
    const startMins = timeToMinutes(startTimeStr)
    const endMins = timeToMinutes(endTimeStr)
    if (currentMinutes >= startMins && currentMinutes < endMins) {
      return 'in-session'
    } else if (currentMinutes >= endMins) {
      return 'completed'
    } else {
      return 'upcoming'
    }
  }

  const semesterSchedules = useMemo(() => allSemesterSchedules.filter(item =>
    scheduleMatchesTerm(item, activeAcademicYear, currentSemester)
  ), [allSemesterSchedules, activeAcademicYear, currentSemester])

  const weeklyDayMap = useMemo(() => dashboardScheduleDays(semesterSchedules), [semesterSchedules])
  const todaySchedules = weeklyDayMap.get(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][currentTime.getDay()]) || []

  // Current Day & Date resolution
  const now = currentTime
  const dayNamesShort = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], [])
  const dayNamesFull = useMemo(() => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], [])
  const todayDayShort = dayNamesShort[now.getDay()]
  const todayDayFull = dayNamesFull[now.getDay()]

  const todayDateStr = useMemo(() => {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [now])

  const todayFormattedDate = useMemo(() => {
    return now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }, [now])

  // 7-day upcoming week range
  const { weekStartStr, weekEndStr, weekRangeFormatted } = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(start)
    end.setDate(end.getDate() + 7)

    const formatYMD = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    return {
      weekStartStr: formatYMD(start),
      weekEndStr: formatYMD(end),
      weekRangeFormatted: `${startFormatted} – ${endFormatted}`
    }
  }, [now])

  const navigateTo = (tabId: string) => {
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tabId }))
  }

  const formatReservationDate = (dateStr: string) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      const formatted = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      if (dateStr === todayDateStr) {
        return `Today · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      }
      return formatted
    }
    return dateStr
  }

  // 1. Fetch Rooms & Buildings maps for friendly naming
  useEffect(() => {
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      const map = new Map<string, string>()
      const roomList: RoomItem[] = []
      snap.forEach(d => {
        const data = d.data()
        map.set(d.id, data.name || data.code || 'Room')
        roomList.push({
          id: d.id,
          buildingId: data.buildingId || '',
          status: data.status || 'Available',
          capacity: Number(data.capacity) || 0,
        })
      })
      setRoomsMap(map)
      setRooms(roomList)
    })

    const unsubBuildings = onSnapshot(collection(db, 'buildings'), (snap) => {
      const map = new Map<string, string>()
      snap.forEach(d => {
        const data = d.data()
        map.set(d.id, data.name || data.code || 'Building')
      })
      setBuildingsMap(map)
    })

    return () => {
      unsubRooms()
      unsubBuildings()
    }
  }, [])

  // 2. Fetch User, Today's Schedule & Upcoming Reservations for the Week
  useEffect(() => {
    let unsubSchedule: (() => void) | null = null
    let unsubRes: (() => void) | null = null
    let unsubMembership: (() => void) | null = null
    let unsubDept: (() => void) | null = null
    let unsubDeptMembers: (() => void) | null = null

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setIsLoading(false)
        return
      }

      // Fetch User's Membership & Department
      const qMembership = query(collection(db, 'memberships'), where('userId', '==', user.uid))
      unsubMembership = onSnapshot(qMembership, (mSnap) => {
        const validInstructorIds: string[] = [user.uid]

        if (!mSnap.empty) {
          const mDocs = mSnap.docs
          const firstMData = mDocs[0].data()
          const deptCode = firstMData.department
          setUserMembershipRole(firstMData.role || '')

          mDocs.forEach(mDoc => {
            const mData = mDoc.data()
            if (mDoc.id) validInstructorIds.push(mDoc.id)
            if (mData.userId) validInstructorIds.push(mData.userId)
            if (mData.membershipId) validInstructorIds.push(mData.membershipId)
            if (mData.id) validInstructorIds.push(mData.id)
          })

          if (deptCode) {
            // Fetch Department Info
            if (unsubDept) unsubDept()
            const qDept = query(collection(db, 'departments'), where('code', '==', deptCode), limit(1))
            unsubDept = onSnapshot(qDept, (deptSnap) => {
              if (!deptSnap.empty) {
                const dData = deptSnap.docs[0].data()
                setDepartmentInfo(prev => ({
                  ...prev,
                  id: deptSnap.docs[0].id,
                  name: dData.name || deptCode,
                  code: dData.code || deptCode,
                  logo: dData.logo || '',
                }))
                setLogoError(false)
              } else {
                setDepartmentInfo(prev => ({
                  ...prev,
                  name: deptCode,
                  code: deptCode
                }))
              }
            })

            // Count members in this department
            if (unsubDeptMembers) unsubDeptMembers()
            const qDeptMembers = query(collection(db, 'memberships'), where('department', '==', deptCode))
            unsubDeptMembers = onSnapshot(qDeptMembers, (membersSnap) => {
              const activeMembers = membersSnap.docs
                .map(memberDoc => memberDoc.data())
                .filter(member => Boolean(member.userId) && member.status?.toLowerCase() !== 'pending')
              const roleCount = (role: string) => activeMembers.filter(member => member.role === role).length
              const memberStats = {
                memberCount: activeMembers.length,
                deanCount: roleCount('Dean'),
                programHeadCount: roleCount('Program Head'),
                instructorCount: roleCount('Instructor'),
              }
              setDepartmentInfo(prev => prev ? { ...prev, ...memberStats } : {
                name: deptCode,
                code: deptCode,
                ...memberStats,
              })
            })
          }
        }

        // Clean up previous schedule listener if membership changed
        if (unsubSchedule) unsubSchedule()

        // Fetch Schedules strictly for this instructor's personal schedule
        const qSchedule = query(collection(db, 'schedule'))
        unsubSchedule = onSnapshot(qSchedule, (snapshot) => {
          setAllSemesterSchedules(dashboardInstructorMeetings(dashboardScheduleMeetings(snapshot.docs), validInstructorIds))
          setIsLoading(false)
        })
      })

      // Fetch Upcoming Reservations for the week
      const qRes = query(
        collection(db, 'reservations'),
        where('userId', '==', user.uid)
      )
      unsubRes = onSnapshot(qRes, (snapshot) => {
        const resList: ReservationItem[] = []
        const visibleReservations: ReservationItem[] = []
        snapshot.docs.forEach(doc => {
          const d = doc.data()
          if (d.isHidden) return
          const reservation: ReservationItem = {
            id: doc.id,
            roomId: d.roomId || '',
            buildingId: d.buildingId || '',
            date: d.date || '',
            startTime: d.startTime || '',
            endTime: d.endTime || '',
            purpose: d.purpose || 'Class / Meeting',
            status: d.status || 'Pending',
            isHidden: false,
          }
          visibleReservations.push(reservation)
          if (reservation.date && reservation.date >= weekStartStr && reservation.date <= weekEndStr) {
            resList.push(reservation)
          }
        })
        // Sort chronologically: date ascending, then startTime ascending
        resList.sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date)
          return (a.startTime || '').localeCompare(b.startTime || '')
        })
        setAllReservations(visibleReservations)
        setUpcomingReservations(resList)
      })
    })

    return () => {
      unsubAuth()
      if (unsubSchedule) unsubSchedule()
      if (unsubRes) unsubRes()
      if (unsubMembership) unsubMembership()
      if (unsubDept) unsubDept()
      if (unsubDeptMembers) unsubDeptMembers()
    }
  }, [todayDateStr, todayDayShort, todayDayFull, weekStartStr, weekEndStr])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title={`${effectiveRole} Dashboard`}
          description={effectiveRole === 'Instructor'
            ? 'Your teaching schedule, department, room access, and reservation activity in one place.'
            : 'Department leadership, teaching schedule, room access, and reservation activity in one place.'}
          action={headerAction}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="animate-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-5">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><BuildingIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-black text-slate-900">Campus room availability</h2>
                  <p className="truncate text-xs text-slate-400">Live spaces available to reserve</p>
                </div>
              </div>
              <button type="button" onClick={() => navigateTo('buildingsRooms')} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
                Browse <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </header>

            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-black tracking-tight text-slate-900">{roomStats.available}</p>
                  <p className="text-xs font-bold text-emerald-700">of {roomStats.total} rooms available</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-slate-800">{roomStats.availablePercent}%</p>
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">Ready</p>
                </div>
              </div>

              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label={`${roomStats.availablePercent}% of rooms are available`}>
                <span className="bg-emerald-500" style={{ width: `${roomStats.total ? roomStats.available / roomStats.total * 100 : 0}%` }} />
                <span className="bg-amber-400" style={{ width: `${roomStats.total ? roomStats.unavailable / roomStats.total * 100 : 0}%` }} />
                <span className="bg-rose-500" style={{ width: `${roomStats.total ? roomStats.maintenance / roomStats.total * 100 : 0}%` }} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Available', value: roomStats.available, color: 'text-emerald-700', surface: 'border-emerald-100 bg-emerald-50' },
                  { label: 'Unavailable', value: roomStats.unavailable, color: 'text-amber-700', surface: 'border-amber-100 bg-amber-50' },
                  { label: 'Maintenance', value: roomStats.maintenance, color: 'text-rose-700', surface: 'border-rose-100 bg-rose-50' },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border px-3 py-2.5 ${item.surface}`}>
                    <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                    <p className="truncate text-[0.65rem] font-bold text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span><strong className="text-slate-700">{buildingsMap.size}</strong> buildings</span>
                <span><strong className="text-slate-700">{roomStats.totalCapacity.toLocaleString()}</strong> total seats</span>
                <button type="button" onClick={() => navigateTo('reserveRoom')} className="cursor-pointer font-black text-[var(--brand-color)] hover:text-[var(--brand-color-hover)]">Reserve a room</button>
              </div>
            </div>
          </section>

          <section className="animate-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-7">
            <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ClockIcon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <h2 className="font-black text-slate-900">My reservation activity</h2>
                  <p className="truncate text-xs text-slate-400">{reservationStats.total} visible request{reservationStats.total === 1 ? '' : 's'}</p>
                </div>
              </div>
              <button type="button" onClick={() => navigateTo('myReservations')} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
                View all <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </header>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {[
                  { label: 'Pending', value: reservationStats.pending, surface: 'border-amber-100 bg-amber-50', color: 'text-amber-700' },
                  { label: 'Approved', value: reservationStats.approved, surface: 'border-emerald-100 bg-emerald-50', color: 'text-emerald-700' },
                  { label: 'Completed', value: reservationStats.completed, surface: 'border-blue-100 bg-blue-50', color: 'text-blue-700' },
                  { label: 'Declined', value: reservationStats.declined, surface: 'border-rose-100 bg-rose-50', color: 'text-rose-700' },
                  { label: 'Cancelled', value: reservationStats.cancelled, surface: 'border-slate-200 bg-slate-50', color: 'text-slate-700' },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border px-3 py-3 ${item.surface}`}>
                    <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
                    <p className="mt-0.5 truncate text-[0.65rem] font-bold text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">Current request queue</p>
                    <p className="mt-0.5 text-xs text-slate-400">Approved and pending requests remain active in your reservation history.</p>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{reservationStats.approved + reservationStats.pending}</p>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-200">
                  <span className="bg-emerald-500" style={{ width: `${reservationStats.approved + reservationStats.pending > 0 ? reservationStats.approved / (reservationStats.approved + reservationStats.pending) * 100 : 0}%` }} />
                  <span className="bg-amber-400" style={{ width: `${reservationStats.approved + reservationStats.pending > 0 ? reservationStats.pending / (reservationStats.approved + reservationStats.pending) * 100 : 0}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-[0.65rem] font-bold text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Approved</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Row 2: My Department & Weekly Timetable At-A-Glance */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
          {/* Card: My Department (Compact width) */}
          <div className="animate-in lg:col-span-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-100 bg-gray-50/50 px-5 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight truncate">My Department</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">Academic unit & affiliation</p>
              </div>
              <button 
                onClick={() => navigateTo('myDepartment')}
                className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]"
              >
                <span>Department Hub</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 flex-1 flex flex-col justify-center">
              {departmentInfo ? (
                <div className="space-y-4">
                  {/* Department Banner Header */}
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                      {departmentInfo.logo && !logoError ? (
                        <img 
                          src={departmentInfo.logo} 
                          alt={departmentInfo.code} 
                          className="w-full h-full object-cover"
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <DepartmentIcon className="w-6 h-6 text-[var(--brand-color)]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--brand-color)] text-white text-xs font-black tracking-wide">
                          {departmentInfo.code}
                        </span>
                        {userMembershipRole && (
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                            userMembershipRole === 'Dean' 
                              ? 'bg-amber-100 text-amber-700' 
                              : userMembershipRole === 'Program Head' 
                              ? 'bg-rose-100 text-rose-700' 
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {userMembershipRole}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug line-clamp-2">
                        {departmentInfo.name}
                      </h4>
                    </div>
                  </div>

                  {/* Key Department Stats */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                      <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Total Faculty</span>
                      <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                        {departmentInfo.memberCount ?? '—'}
                        <span className="text-[0.7rem] font-medium text-slate-400 ml-1">members</span>
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                      <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Active Term</span>
                      <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                        {currentSemester}
                      </p>
                      <span className="text-[0.62rem] text-slate-400 font-medium truncate">
                        {activeAcademicYear?.academicYear || 'Current Academic Year'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Dean', value: departmentInfo.deanCount ?? 0, color: 'text-amber-700', surface: 'bg-amber-50' },
                      { label: 'Program Head', value: departmentInfo.programHeadCount ?? 0, color: 'text-rose-700', surface: 'bg-rose-50' },
                      { label: 'Instructor', value: departmentInfo.instructorCount ?? 0, color: 'text-emerald-700', surface: 'bg-emerald-50' },
                    ].map(item => (
                      <div key={item.label} className={`rounded-lg px-2 py-2 text-center ${item.surface}`}>
                        <p className={`text-sm font-black ${item.color}`}>{item.value}</p>
                        <p className="truncate text-[0.58rem] font-bold text-slate-500" title={item.label}>{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center flex flex-col items-center justify-center flex-1">
                  <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-[var(--brand-color)] mb-2.5">
                    <DepartmentIcon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">Department Affiliation</p>
                  <p className="text-xs text-slate-400 mt-0.5">Loading department details...</p>
                </div>
              )}
            </div>
          </div>

          {/* Card: Weekly Schedule Overview (Expanded width for 7 days) */}
          <div className="animate-in lg:col-span-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 leading-tight">Weekly Timetable At-A-Glance</h3>
                <p className="text-xs text-gray-500 mt-0.5">Day-by-day workload &middot; {currentSemester}</p>
              </div>
              <button 
                onClick={() => navigateTo('mySchedule')}
                className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]"
              >
                <span>Open Timetable</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 flex-1 flex flex-col justify-center">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map(day => {
                  const daySchedules = weeklyDayMap.get(day) || []
                  const isCurrentDay = todayDayShort === day
                  const hasClasses = daySchedules.length > 0

                  return (
                    <div 
                      key={day}
                      onClick={() => navigateTo('mySchedule')}
                      className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all cursor-pointer group ${
                        isCurrentDay 
                          ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 ring-2 ring-[var(--brand-color)]/20 shadow-xs' 
                          : 'border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-bold ${isCurrentDay ? 'text-[var(--brand-color)]' : 'text-slate-700'}`}>
                          {day}
                        </span>
                        {isCurrentDay && (
                          <span className="text-[0.55rem] font-bold px-1.5 py-0.2 rounded-full bg-[var(--brand-color)] text-white">
                            Today
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-h-[3.8rem]">
                        {hasClasses ? (
                          daySchedules.slice(0, 2).map((sched, idx) => (
                            <div key={idx} className="rounded-md bg-white p-1 border border-slate-100 shadow-2xs">
                              <p className="text-[0.68rem] font-bold text-slate-800 leading-tight truncate">{sched.subjectCode}</p>
                              <p className="text-[0.62rem] text-slate-400 truncate">{formatTimeTo12Hour(sched.startTime)}</p>
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex items-center justify-center text-[0.65rem] text-slate-400 italic">
                            No classes
                          </div>
                        )}
                        {daySchedules.length > 2 && (
                          <p className="text-[0.62rem] text-[var(--brand-color)] font-bold text-center">
                            +{daySchedules.length - 2} more
                          </p>
                        )}
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-slate-200/60 text-right">
                        <span className="text-[0.62rem] font-semibold text-slate-500">
                          {daySchedules.length} {daySchedules.length === 1 ? 'class' : 'classes'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Today's Schedule & Upcoming Reservations for the Week */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card: Today's Schedule */}
          <div className="animate-in rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[24rem]">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 leading-tight">Today's Schedule</h3>
                  {todaySchedules.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-[var(--brand-color)]/10 text-[var(--brand-color)]">
                      {todaySchedules.length} {todaySchedules.length === 1 ? 'class' : 'classes'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {todayFormattedDate} &middot; {todayDayFull} &middot; {currentSemester}
                </p>
              </div>
              <button 
                onClick={() => navigateTo('mySchedule')}
                className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]"
              >
                <span>Full Timetable</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto custom-scrollbar">
              {todaySchedules.length > 0 ? (
                todaySchedules.map(item => {
                  const roomName = roomScheduleRoom(item, roomsMap)
                  const bldgName = buildingsMap.get(item.buildingId) || ''
                  const status = getClassStatus(item.startTime, item.endTime)

                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 sm:px-6 transition-all duration-200 flex items-center justify-between gap-3 group ${
                        status === 'in-session' 
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/60 border-l-4 border-l-[var(--brand-color)]' 
                          : status === 'completed'
                          ? 'opacity-65 hover:opacity-90 hover:bg-slate-50/80 border-l-4 border-l-transparent'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      {/* Left: Time Block */}
                      <div className="shrink-0 min-w-[6.5rem] sm:min-w-[7.5rem]">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
                          {formatTimeTo12Hour(item.startTime)}
                        </p>
                        <p className="text-[0.7rem] font-medium text-slate-500 mt-0.5 flex items-center gap-1">
                          <span>to</span>
                          <span>{formatTimeTo12Hour(item.endTime)}</span>
                        </p>
                      </div>

                      {/* Middle: Subject Code, Status badge, Section */}
                      <div className="min-w-0 flex-1 px-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm group-hover:text-[var(--brand-color)] transition-colors">
                            {item.subjectCode}
                          </span>
                          {status === 'in-session' && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-emerald-100 text-emerald-800 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              In Session
                            </span>
                          )}
                          {status === 'completed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-slate-100 text-slate-500">
                              Done
                            </span>
                          )}
                        </div>
                        {item.classSection && (
                          <p className="text-xs text-slate-500 truncate mt-0.5 font-medium">
                            {roomScheduleSection(item)}
                          </p>
                        )}
                      </div>

                      {/* Right: Room Badge & Building */}
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold text-xs group-hover:bg-[var(--brand-color)] group-hover:text-white transition-all shadow-2xs">
                          <DoorIcon className="h-3.5 w-3.5" />
                          {roomName}
                        </span>
                        {bldgName && (
                          <p className="text-[0.65rem] text-slate-400 font-medium mt-1 truncate max-w-[6rem] sm:max-w-[8rem] ml-auto">
                            {bldgName}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center flex-1 h-full">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-[var(--brand-color)] mb-3 shadow-2xs">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">No classes scheduled for today</p>
                  <p className="text-xs text-slate-400 mt-1">You have no teaching meetings scheduled for {todayDayFull} ({currentSemester}).</p>
                </div>
              )}
            </div>
          </div>

          {/* Card: Upcoming Reservations for the Week */}
          <div className="animate-in rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[24rem]">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900 leading-tight">Upcoming Reservations</h3>
                <p className="text-xs text-gray-500 mt-0.5">This week &middot; {weekRangeFormatted}</p>
              </div>
              <button 
                onClick={() => navigateTo('myReservations')}
                className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]"
              >
                <span>View All</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto custom-scrollbar">
              {upcomingReservations.length > 0 ? (
                upcomingReservations.map(res => {
                  const roomName = res.roomName || roomsMap.get(res.roomId) || 'Room'
                  return (
                    <div key={res.id} className="p-4 sm:px-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                      <div className="space-y-0.5 shrink-0 min-w-[7.5rem] sm:min-w-[9rem]">
                        <p className="font-bold text-slate-900 text-sm leading-tight">{roomName}</p>
                        <p className="text-xs text-slate-500 font-medium">{res.startTime} - {res.endTime}</p>
                      </div>

                      <div className="min-w-0 flex-1 px-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{res.purpose}</p>
                        {res.date && (
                          <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                            {formatReservationDate(res.date)}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider ${statusBadgeClasses[res.status] || 'bg-slate-100 text-slate-700'}`}>
                          {res.status}
                        </span>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center flex-1 h-full">
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-3">
                    <ClockIcon className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">No upcoming reservations this week</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">You have no room or lab bookings scheduled for the next 7 days.</p>
                  <button 
                    onClick={() => navigateTo('reserveRoom')}
                    className="px-4 py-2 rounded-xl bg-[var(--brand-color)] text-white text-xs font-bold hover:bg-[var(--brand-color-hover)] transition-colors shadow-sm flex items-center gap-1.5 mx-auto"
                  >
                    <BookIcon className="h-3.5 w-3.5" />
                    Reserve a Room
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default FacultyDashboardPage
