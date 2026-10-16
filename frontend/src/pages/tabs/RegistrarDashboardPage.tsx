import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { formatUserName } from '../../utils/userName'
import { dashboardScheduleDays, dashboardScheduleMeetings, dashboardScheduleRows, dashboardScheduleStats, type DashboardScheduleMeeting } from '../../utils/dashboardSchedules'
import type { ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { scheduleMatchesTerm } from '../../utils/roomSchedule'
import { SectionHeader } from '../../components/SectionHeader'
import {
  BuildingIcon, DoorIcon, CalendarIcon, ChevronRightIcon,
  ClockIcon, ClipboardIcon, UsersIcon, CheckCircleIcon, BookIcon
} from '../../components/Icons'
import { db } from '../../firebase'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { useAcademicSemester } from '../../utils/academicSemester'

interface RoomItem {
  id: string
  name: string
  code: string
  buildingId: string
  type: string
  floor?: number
  capacity?: number
  status: 'Available' | 'Occupied' | 'Maintenance'
}

interface BuildingItem {
  id: string
  name: string
  code: string
}

interface ReservationItem {
  id: string
  roomId: string
  buildingId: string
  userId: string
  date: string
  startTime: string
  endTime: string
  purpose: string
  status: 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'
  registrarRecommend?: boolean
  roomName?: string
  buildingName?: string
  requesterName?: string
}

type ScheduleItem = DashboardScheduleMeeting

const statusBadgeClasses: Record<string, string> = {
  Approved: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Declined: 'bg-rose-100 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-700',
  Completed: 'bg-blue-100 text-blue-700',
}

const roomStatusBadgeClasses: Record<string, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const phaseInfo: Record<string, { badge: string; label: string; desc: string }> = {
  Plotting: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    label: 'Room Plotting',
    desc: 'Registrar is allocating campus classrooms & labs to proposed department schedules.'
  },
  Drafting: {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    label: 'Department Drafting',
    desc: 'Academic deans & program heads are drafting subject loads and course timings.'
  },
  Revision: {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    label: 'Schedule Revision',
    desc: 'Departments are adjusting schedules and addressing room conflict notices.'
  },
  Final: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    label: 'Finalized Schedule',
    desc: 'Master university timetable is confirmed and published across departments.'
  },
  Closed: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    label: 'Term Inactive',
    desc: 'Scheduling operations for this academic semester are currently closed.'
  }
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

interface RegistrarDashboardPageProps {
  headerAction?: ReactNode
}

export function RegistrarDashboardPage({ headerAction }: RegistrarDashboardPageProps = {}) {
  const { activeAcademicYear, currentSemester } = useAcademicSemester()

  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [buildings, setBuildings] = useState<BuildingItem[]>([])
  const [allSchedules, setAllSchedules] = useState<ScheduleItem[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleMeetingRecord[]>([])
  const [weeklyReservations, setWeeklyReservations] = useState<ReservationItem[]>([])
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map())

  // Date and Week resolution
  const now = useMemo(() => new Date(), [])
  const dayNamesShort = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], [])
  const todayDayShort = dayNamesShort[now.getDay()]

  const todayDateStr = useMemo(() => {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [now])

  // 7-day current week range
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

  // Lookup maps
  const roomsMap = useMemo(() => {
    const map = new Map<string, string>()
    rooms.forEach(r => map.set(r.id, r.name || r.code || 'Room'))
    return map
  }, [rooms])

  const buildingsMap = useMemo(() => {
    const map = new Map<string, string>()
    buildings.forEach(b => map.set(b.id, b.name || b.code || 'Building'))
    return map
  }, [buildings])

  // Subscriptions
  useEffect(() => {
    // 1. Fetch Rooms
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as RoomItem[])
    })

    // 2. Fetch Buildings
    const unsubBuildings = onSnapshot(collection(db, 'buildings'), (snap) => {
      setBuildings(snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BuildingItem[])
    })

    // 3. Fetch User Profiles for Reservation requesters
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const map = new Map<string, string>()
      snap.docs.forEach(doc => {
        const data = doc.data()
        map.set(doc.id, formatUserName(data) || data.email || 'Faculty Member')
      })
      setUserNames(map)
    })

    // 4. Fetch Campus-Wide Schedules
    const unsubSchedule = onSnapshot(collection(db, 'schedule'), (snap) => {
      setScheduleRows(snap.docs.map(document => ({ ...document.data(), id: document.id })))
      setAllSchedules(dashboardScheduleMeetings(snap.docs))
    })

    // 5. Fetch Reservations for current week
    const unsubReservations = onSnapshot(
      query(collection(db, 'reservations'), orderBy('date', 'asc')),
      (snap) => {
        const list: ReservationItem[] = []
        snap.docs.forEach(doc => {
          const data = doc.data()
          // Keep reservations occurring within the current 7-day window
          if (data.date && data.date >= weekStartStr && data.date <= weekEndStr) {
            list.push({
              id: doc.id,
              ...data
            } as ReservationItem)
          }
        })
        setWeeklyReservations(list)
      }
    )

    return () => {
      unsubRooms()
      unsubBuildings()
      unsubUsers()
      unsubSchedule()
      unsubReservations()
    }
  }, [weekStartStr, weekEndStr])

  // Current semester details & phase
  const activeSemesterDetails = useMemo(() => {
    if (!activeAcademicYear) return null
    if (currentSemester === '2nd Semester') {
      return activeAcademicYear.sem2 || null
    }
    return activeAcademicYear.sem1 || null
  }, [activeAcademicYear, currentSemester])

  const currentPhase = activeSemesterDetails?.phase || 'Plotting'
  const currentPhaseMeta = phaseInfo[currentPhase] || {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    label: currentPhase,
    desc: 'Current scheduling status for this academic semester.'
  }

  const semesterSchedules = useMemo(() => allSchedules.filter(item =>
    scheduleMatchesTerm(item, activeAcademicYear, currentSemester)
  ), [allSchedules, currentSemester, activeAcademicYear])

  const scheduleStats = useMemo(() => dashboardScheduleStats(
    dashboardScheduleRows(scheduleRows, activeAcademicYear, currentSemester)
  ), [scheduleRows, activeAcademicYear, currentSemester])

  const weeklyDayMap = useMemo(() => dashboardScheduleDays(semesterSchedules), [semesterSchedules])

  // Room Status Stats
  const roomStats = useMemo(() => {
    let available = 0
    let occupied = 0
    let maintenance = 0
    rooms.forEach(r => {
      if (r.status === 'Available') available++
      else if (r.status === 'Occupied') occupied++
      else if (r.status === 'Maintenance') maintenance++
      else available++
    })
    const total = rooms.length
    const availablePercent = total > 0 ? Math.round((available / total) * 100) : 0
    const occupiedPercent = total > 0 ? Math.round((occupied / total) * 100) : 0
    const maintenancePercent = total > 0 ? Math.round((maintenance / total) * 100) : 0

    return {
      total,
      available,
      occupied,
      maintenance,
      availablePercent,
      occupiedPercent,
      maintenancePercent
    }
  }, [rooms])

  // Requests awaiting the Registrar's recommendation
  const pendingReservationsCount = useMemo(() => {
    return weeklyReservations.filter(r => r.status === 'Pending' && r.registrarRecommend !== true).length
  }, [weeklyReservations])

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

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="Registrar Dashboard" 
          description="Campus-wide scheduling status, weekly timetable allocations, room inventories, and booking approvals." 
          action={headerAction}
        />

        {/* Row 2: Academic Calendar Term & Phase + Weekly Master Timetable At-A-Glance */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
          {/* Card 1: Academic Calendar & Term Phase (matches 'academicCalendar' tab) */}
          <div className="animate-in lg:col-span-4 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-100 bg-gray-50/50 px-5 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight truncate">Academic Term & Phase</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">Active academic year milestones</p>
              </div>
              <button 
                onClick={() => navigateTo('academicCalendar')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:text-[var(--brand-color)] hover:border-[var(--brand-color)]/30 hover:bg-[var(--brand-color)]/5 shadow-2xs transition-all duration-200 cursor-pointer group shrink-0"
              >
                <span>Open Calendar</span>
                <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-[var(--brand-color)] transition-all duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
              {/* Term Banner */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 flex items-center justify-center shrink-0 shadow-2xs">
                  <CalendarIcon className="w-6 h-6 text-[var(--brand-color)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--brand-color)] text-white text-xs font-black tracking-wide">
                      {activeAcademicYear?.academicYear || 'Academic Year'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${currentPhaseMeta.badge}`}>
                      {currentPhaseMeta.label}
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug">
                    {currentSemester}
                  </h4>
                </div>
              </div>

              {/* Phase Explanatory Card */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-1">
                <p className="text-[0.68rem] uppercase font-bold tracking-wider text-slate-400">Scheduling Directive</p>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {currentPhaseMeta.desc}
                </p>
              </div>

              {/* Key Phase & Milestone Dates */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                  <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Term Period</span>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 mt-0.5 truncate">
                    {activeSemesterDetails?.startMonth && activeSemesterDetails?.endMonth
                      ? `${activeSemesterDetails.startMonth.slice(0, 3)} – ${activeSemesterDetails.endMonth.slice(0, 3)}`
                      : 'Active Term'}
                  </p>
                  <span className="text-[0.62rem] text-slate-400 font-medium truncate mt-0.5">
                    {activeAcademicYear?.academicYear || 'Current Year'}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                  <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Plot Schedules</span>
                  <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                    {scheduleStats.plotted}
                    <span className="text-[0.7rem] font-medium text-slate-400 ml-1">rows</span>
                  </p>
                  <span className="text-[0.62rem] text-[var(--brand-color)] font-semibold truncate mt-0.5">
                    Campus-wide
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Weekly Master Timetable At-A-Glance (matches 'departmentSchedules' tab) */}
          <div className="animate-in lg:col-span-8 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 leading-tight">Weekly Master Timetable At-A-Glance</h3>
                <p className="text-xs text-gray-500 mt-0.5">Campus-wide class allocations &middot; {currentSemester}</p>
              </div>
              <button 
                onClick={() => navigateTo('departmentSchedules')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:text-[var(--brand-color)] hover:border-[var(--brand-color)]/30 hover:bg-[var(--brand-color)]/5 shadow-2xs transition-all duration-200 cursor-pointer group shrink-0"
              >
                <span>Department Schedules</span>
                <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-[var(--brand-color)] transition-all duration-200 group-hover:translate-x-0.5" />
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
                      onClick={() => navigateTo('departmentSchedules')}
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
                              <p className="text-[0.68rem] font-bold text-slate-800 leading-tight truncate">
                                {sched.subjectCode}
                              </p>
                              <p className="text-[0.62rem] text-slate-400 truncate">
                                {formatTimeTo12Hour(sched.startTime)}
                              </p>
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

        {/* Row 3: Campus Room Status & Utilization + Campus Reservations This Week */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Card 3: Campus Room Status & Availability (matches 'buildingsRooms' tab) */}
          <div className="animate-in rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[24rem]">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 leading-tight">Campus Room Status & Readiness</h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-slate-100 text-slate-700">
                    {roomStats.total} Total
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Live room inventories & maintenance states this week
                </p>
              </div>
              <button 
                onClick={() => navigateTo('buildingsRooms')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:text-[var(--brand-color)] hover:border-[var(--brand-color)]/30 hover:bg-[var(--brand-color)]/5 shadow-2xs transition-all duration-200 cursor-pointer group shrink-0"
              >
                <span>View Rooms</span>
                <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-[var(--brand-color)] transition-all duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Metric Pills & Utilization Progress Bar */}
            <div className="p-4 sm:px-6 bg-slate-50/30 border-b border-gray-100 shrink-0 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-2 text-center">
                  <span className="text-[0.65rem] font-bold text-emerald-800 uppercase tracking-wider block">Available</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700">{roomStats.available}</span>
                </div>
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 p-2 text-center">
                  <span className="text-[0.65rem] font-bold text-amber-800 uppercase tracking-wider block">Occupied</span>
                  <span className="text-sm sm:text-base font-black text-amber-700">{roomStats.occupied}</span>
                </div>
                <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-2 text-center">
                  <span className="text-[0.65rem] font-bold text-rose-800 uppercase tracking-wider block">Maintenance</span>
                  <span className="text-sm sm:text-base font-black text-rose-700">{roomStats.maintenance}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden flex">
                <div style={{ width: `${roomStats.availablePercent}%` }} className="bg-emerald-500 h-full transition-all duration-500" title={`Available: ${roomStats.availablePercent}%`} />
                <div style={{ width: `${roomStats.occupiedPercent}%` }} className="bg-amber-400 h-full transition-all duration-500" title={`Occupied: ${roomStats.occupiedPercent}%`} />
                <div style={{ width: `${roomStats.maintenancePercent}%` }} className="bg-rose-500 h-full transition-all duration-500" title={`Maintenance: ${roomStats.maintenancePercent}%`} />
              </div>
            </div>

            {/* Scrollable Room List */}
            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto custom-scrollbar">
              {rooms.length > 0 ? (
                rooms.map(room => {
                  const bldgName = buildingsMap.get(room.buildingId) || 'Campus Building'
                  const isMaintenance = room.status === 'Maintenance'

                  return (
                    <div 
                      key={room.id}
                      onClick={() => navigateTo('buildingsRooms')}
                      className={`p-3.5 sm:px-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer group ${
                        isMaintenance ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <div className="shrink-0 min-w-[6.5rem] sm:min-w-[7.5rem]">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight group-hover:text-[var(--brand-color)] transition-colors">
                          {room.code || room.name}
                        </p>
                        <p className="text-[0.7rem] font-medium text-slate-400 truncate mt-0.5">
                          {bldgName}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1 px-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700 truncate">
                            {room.name}
                          </span>
                          {room.type && (
                            <span className="text-[0.65rem] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {room.type}
                            </span>
                          )}
                        </div>
                        {room.capacity ? (
                          <p className="text-[0.68rem] text-slate-400 mt-0.5">
                            Capacity: <span className="font-semibold text-slate-600">{room.capacity} seats</span>
                          </p>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider ${
                          roomStatusBadgeClasses[room.status] || 'bg-slate-100 text-slate-700'
                        }`}>
                          {room.status}
                        </span>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center justify-center flex-1 h-full">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-[var(--brand-color)] mb-3">
                    <DoorIcon className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">No rooms configured</p>
                  <p className="text-xs text-slate-400 mt-1">Visit Buildings & Rooms to add campus classroom inventories.</p>
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Campus Reservations This Week (matches 'manageReservations' tab) */}
          <div className="animate-in rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[24rem]">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 leading-tight">Campus Reservations This Week</h3>
                  {pendingReservationsCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-bold bg-amber-100 text-amber-800 animate-pulse">
                      {pendingReservationsCount} Awaiting Registrar
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Weekly bookings &middot; {weekRangeFormatted}</p>
              </div>
              <button 
                onClick={() => navigateTo('manageReservations')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200/90 bg-white text-xs font-semibold text-slate-700 hover:text-[var(--brand-color)] hover:border-[var(--brand-color)]/30 hover:bg-[var(--brand-color)]/5 shadow-2xs transition-all duration-200 cursor-pointer group shrink-0"
              >
                <span>Manage Reservations</span>
                <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-[var(--brand-color)] transition-all duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto custom-scrollbar">
              {weeklyReservations.length > 0 ? (
                weeklyReservations.map(res => {
                  const roomName = roomsMap.get(res.roomId) || 'Room'
                  const bldgName = buildingsMap.get(res.buildingId) || ''
                  const requester = userNames.get(res.userId) || 'Faculty Requester'

                  return (
                    <div 
                      key={res.id} 
                      onClick={() => navigateTo('manageReservations')}
                      className="p-4 sm:px-6 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer group"
                    >
                      <div className="space-y-0.5 shrink-0 min-w-[7.5rem] sm:min-w-[9rem]">
                        <p className="font-bold text-slate-900 text-sm leading-tight group-hover:text-[var(--brand-color)] transition-colors">
                          {roomName}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                          {formatTimeTo12Hour(res.startTime)} - {formatTimeTo12Hour(res.endTime)}
                        </p>
                        {bldgName && (
                          <p className="text-[0.65rem] text-slate-400 truncate">
                            {bldgName}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 px-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {res.purpose || 'Faculty Reservation'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500 font-medium">
                            {formatReservationDate(res.date)}
                          </span>
                          <span className="text-slate-300">&middot;</span>
                          <span className="text-xs text-slate-500 truncate">
                            {requester}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wider ${
                          statusBadgeClasses[res.status] || 'bg-slate-100 text-slate-700'
                        }`}>
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
                  <p className="text-sm font-bold text-slate-700">No campus reservations this week</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">There are currently no room bookings requested or approved for the next 7 days.</p>
                  <button 
                    onClick={() => navigateTo('manageReservations')}
                    className="px-4 py-2 rounded-xl bg-[var(--brand-color)] text-white text-xs font-bold hover:bg-[var(--brand-color-hover)] transition-colors shadow-sm flex items-center gap-1.5 mx-auto"
                  >
                    <BookIcon className="h-3.5 w-3.5" />
                    Manage Reservations
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

export default RegistrarDashboardPage
