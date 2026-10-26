import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { SectionHeader } from '../../components/SectionHeader'
import { ScheduleUsageBar } from '../../components/ScheduleUsageBar'
import { TodayScheduleCard } from '../../components/TodayScheduleCard'
import { WeekReservationsCard, type DashboardReservation } from '../../components/WeekReservationsCard'
import { DepartmentScheduleOverviewCard } from '../../components/DepartmentScheduleOverviewCard'
import { ChevronRightIcon, DepartmentIcon } from '../../components/Icons'
import { useAcademicSemester } from '../../utils/academicSemester'
import { buildingScheduleUsage, type BuildingScheduleUsage } from '../../utils/buildingScheduleUsage'
import { dashboardInstructorMeetings, dashboardScheduleMeetings, type DashboardScheduleMeeting } from '../../utils/dashboardSchedules'
import { scheduleMatchesDepartment, scheduleMatchesTerm } from '../../utils/roomSchedule'
import { scheduleMeetingRecords, type ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { reportingScheduleMeetings } from '../../utils/scheduleReporting'
import type { ScheduleReportRecord } from '../../utils/reportingData'
import type { Building, Room } from '../../types/room'

interface DepartmentDashboardPageProps {
  userRole: string
  headerAction?: ReactNode
}

interface DepartmentInfo {
  name: string
  code: string
  logo: string
  memberCount?: number
  deanCount?: number
  programHeadCount?: number
  instructorCount?: number
}

const departmentUsage = (usage: BuildingScheduleUsage | undefined, code: string): BuildingScheduleUsage | undefined => {
  const department = usage?.departments.find(item => item.name === code.trim().toUpperCase())
  return department ? { totalPercent: department.percent, departments: [department] } : undefined
}

export function DepartmentDashboardPage({ userRole, headerAction }: DepartmentDashboardPageProps) {
  const [departmentCode, setDepartmentCode] = useState('')
  const [membershipRole, setMembershipRole] = useState(userRole)
  const [instructorIds, setInstructorIds] = useState<string[]>([])
  const [membershipLoaded, setMembershipLoaded] = useState(false)
  const [departmentInfo, setDepartmentInfo] = useState<DepartmentInfo | null>(null)
  const [logoError, setLogoError] = useState(false)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleMeetingRecord[]>([])
  const [legacyScheduleRows, setLegacyScheduleRows] = useState<ScheduleMeetingRecord[]>([])
  const [teachingRows, setTeachingRows] = useState<DashboardScheduleMeeting[]>([])
  const [legacyTeachingRows, setLegacyTeachingRows] = useState<DashboardScheduleMeeting[]>([])
  const [scheduleSourcesLoaded, setScheduleSourcesLoaded] = useState(0)
  const [buildingsLoaded, setBuildingsLoaded] = useState(false)
  const [roomsLoaded, setRoomsLoaded] = useState(false)
  const [usageError, setUsageError] = useState(false)
  const [scheduleError, setScheduleError] = useState(false)
  const [reservations, setReservations] = useState<DashboardReservation[]>([])
  const [reservationsLoading, setReservationsLoading] = useState(true)
  const [reservationsError, setReservationsError] = useState(false)
  const { activeAcademicYear, currentSemester, isLoading: isAcademicLoading } = useAcademicSemester()

  useEffect(() => {
    let unsubscribeMembership: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeMembership?.()
      if (!user) {
        setDepartmentCode('')
        setInstructorIds([])
        setMembershipLoaded(true)
        return
      }
      setInstructorIds([user.uid])
      setMembershipLoaded(false)
      unsubscribeMembership = onSnapshot(
        query(collection(db, 'memberships'), where('userId', '==', user.uid)),
        snapshot => {
          const memberships = snapshot.docs.map(document => document.data())
          const membership = memberships.find(item => item.role === userRole && item.status === 'accepted')
            || memberships.find(item => item.status === 'accepted')
          const ids = new Set([user.uid])
          snapshot.docs.forEach(document => {
            ids.add(document.id)
            const data = document.data()
            for (const key of ['membershipId', 'id']) {
              if (typeof data[key] === 'string') ids.add(data[key])
            }
          })
          setInstructorIds([...ids])
          setMembershipLoaded(true)
          setMembershipRole(membership?.role || userRole)
          setDepartmentCode(typeof membership?.department === 'string' ? membership.department : '')
        },
        error => {
          console.error('Unable to load dashboard membership:', error)
          setDepartmentCode('')
          setMembershipLoaded(true)
        },
      )
    })
    return () => {
      unsubscribeAuth()
      unsubscribeMembership?.()
    }
  }, [userRole])

  useEffect(() => {
    let unsubscribeReservations: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeReservations?.()
      setReservations([])
      setReservationsError(false)
      if (!user) {
        setReservationsLoading(false)
        return
      }
      setReservationsLoading(true)
      unsubscribeReservations = onSnapshot(
        query(collection(db, 'reservations'), where('userId', '==', user.uid)),
        snapshot => {
          setReservations(snapshot.docs.map(document => {
            const data = document.data()
            return {
              id: document.id,
              roomId: typeof data.roomId === 'string' ? data.roomId : '',
              date: typeof data.date === 'string' ? data.date : '',
              startTime: typeof data.startTime === 'string' ? data.startTime : '',
              endTime: typeof data.endTime === 'string' ? data.endTime : '',
              purpose: typeof data.purpose === 'string' ? data.purpose : '',
              status: typeof data.status === 'string' ? data.status : 'Pending',
              isHidden: data.isHidden === true,
            }
          }))
          setReservationsLoading(false)
        },
        error => {
          console.error('Unable to load dashboard reservations:', error)
          setReservationsError(true)
          setReservationsLoading(false)
        },
      )
    })
    return () => {
      unsubscribeAuth()
      unsubscribeReservations?.()
    }
  }, [])

  useEffect(() => {
    setDepartmentInfo(null)
    setLogoError(false)
    if (!departmentCode) return

    const unsubscribeDepartment = onSnapshot(
      query(collection(db, 'departments'), where('code', '==', departmentCode), limit(1)),
      snapshot => {
        const data = snapshot.docs[0]?.data()
        setDepartmentInfo(previous => ({
          name: typeof data?.name === 'string' ? data.name : departmentCode,
          code: typeof data?.code === 'string' ? data.code : departmentCode,
          logo: typeof data?.logo === 'string' ? data.logo : '',
          memberCount: previous?.memberCount,
          deanCount: previous?.deanCount,
          programHeadCount: previous?.programHeadCount,
          instructorCount: previous?.instructorCount,
        }))
        setLogoError(false)
      },
      error => console.error('Unable to load dashboard department:', error),
    )
    const unsubscribeMembers = onSnapshot(
      query(collection(db, 'memberships'), where('department', '==', departmentCode)),
      snapshot => {
        const members = snapshot.docs.map(document => document.data())
          .filter(member => member.userId && member.status === 'accepted')
        const count = (role: string) => members.filter(member => member.role === role).length
        setDepartmentInfo(previous => ({
          name: previous?.name || departmentCode,
          code: previous?.code || departmentCode,
          logo: previous?.logo || '',
          memberCount: members.length,
          deanCount: count('Dean'),
          programHeadCount: count('Program Head'),
          instructorCount: count('Instructor'),
        }))
      },
      error => console.error('Unable to load dashboard department members:', error),
    )
    return () => {
      unsubscribeDepartment()
      unsubscribeMembers()
    }
  }, [departmentCode])

  useEffect(() => {
    const unsubscribeBuildings = onSnapshot(collection(db, 'buildings'), snapshot => {
      setBuildings(snapshot.docs.map(document => {
        const data = document.data()
        return {
          ...data,
          id: document.id,
          code: typeof data.code === 'string' ? data.code : '',
          name: typeof data.name === 'string' ? data.name : 'Building',
          floor: 0,
          capacity: 0,
          rooms: [],
        } as Building
      }))
      setBuildingsLoaded(true)
    }, error => {
      console.error('Unable to load dashboard buildings:', error)
      setUsageError(true)
    })
    const unsubscribeRooms = onSnapshot(collection(db, 'rooms'), snapshot => {
      setRooms(snapshot.docs.map(document => ({
        ...document.data(), id: document.id,
      } as Room)))
      setRoomsLoaded(true)
    }, error => {
      console.error('Unable to load dashboard rooms:', error)
      setUsageError(true)
    })
    const unsubscribeSchedules = onSnapshot(collection(db, 'schedules'), snapshot => {
      setScheduleRows(scheduleMeetingRecords(snapshot.docs))
      setTeachingRows(dashboardScheduleMeetings(snapshot.docs))
      setScheduleSourcesLoaded(loaded => loaded | 1)
    }, error => {
      console.error('Unable to load dashboard schedules:', error)
      setUsageError(true)
      setScheduleError(true)
    })
    const unsubscribeLegacySchedules = onSnapshot(collection(db, 'schedule'), snapshot => {
      setLegacyScheduleRows(scheduleMeetingRecords(snapshot.docs))
      setLegacyTeachingRows(dashboardScheduleMeetings(snapshot.docs))
      setScheduleSourcesLoaded(loaded => loaded | 2)
    }, error => {
      console.error('Unable to load dashboard legacy schedules:', error)
      setUsageError(true)
      setScheduleError(true)
    })
    return () => {
      unsubscribeBuildings()
      unsubscribeRooms()
      unsubscribeSchedules()
      unsubscribeLegacySchedules()
    }
  }, [])

  const buildingsWithRooms = useMemo(() => buildings.map(building => ({
    ...building,
    rooms: rooms.filter(room => room.buildingId === building.id),
  })), [buildings, rooms])
  const usage = useMemo(() => buildingScheduleUsage(
    buildingsWithRooms,
    reportingScheduleMeetings([...scheduleRows, ...legacyScheduleRows] as ScheduleReportRecord[]) as unknown as ScheduleMeetingRecord[],
    activeAcademicYear,
    currentSemester,
  ), [buildingsWithRooms, scheduleRows, legacyScheduleRows, activeAcademicYear, currentSemester])
  const usedBuildings = useMemo(() => buildingsWithRooms
    .map(building => ({
      building,
      usage: departmentUsage(usage.buildings[building.id], departmentCode),
    }))
    .filter(item => item.usage && item.usage.totalPercent > 0)
    .sort((a, b) => a.building.name.localeCompare(b.building.name)),
  [buildingsWithRooms, usage, departmentCode])
  const usageLoading = isAcademicLoading || !buildingsLoaded || !roomsLoaded || scheduleSourcesLoaded !== 3
  const personalMeetings = useMemo(() => dashboardInstructorMeetings(
    [...teachingRows, ...legacyTeachingRows], instructorIds,
  ).filter(meeting => scheduleMatchesTerm(meeting, activeAcademicYear, currentSemester)),
  [teachingRows, legacyTeachingRows, instructorIds, activeAcademicYear, currentSemester])
  const roomsById = useMemo(() => new Map(rooms.map(room => [room.id, room.name || room.code])), [rooms])
  const scheduleLoading = isAcademicLoading || !membershipLoaded || scheduleSourcesLoaded !== 3
  const departmentSchedule = useMemo(() => {
    const counts = { total: 0, plotted: 0, drafted: 0 }
    if (!activeAcademicYear || !departmentCode) return counts
    const seen = new Set<string>()
    const sources = [scheduleRows, legacyScheduleRows]
    sources.forEach((source, sourceIndex) => source.forEach(meeting => {
      if (!scheduleMatchesDepartment(meeting, departmentCode) || !scheduleMatchesTerm(meeting, activeAcademicYear, currentSemester)) return
      const status = (meeting.status || 'Draft').toLowerCase()
      if (!['draft', 'drafted', 'plot', 'plotted', 'revise', 'revised'].includes(status)) return
      const rowId = typeof meeting.sourceScheduleId === 'string' ? meeting.sourceScheduleId : meeting.parentId || meeting.id
      const key = `${sourceIndex}:${rowId}`
      if (seen.has(key)) return
      seen.add(key)
      counts.total += 1
      if (status === 'plot' || status === 'plotted') counts.plotted += 1
      else counts.drafted += 1
    }))
    return counts
  }, [scheduleRows, legacyScheduleRows, departmentCode, activeAcademicYear, currentSemester])
  const navigateToDepartment = () => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'myDepartment' }))
  const navigateToSchedule = () => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'mySchedule' }))
  const navigateToBuildings = () => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'buildingsRooms' }))
  const navigateToReservations = () => window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'myReservations' }))
  const term = activeAcademicYear ? `${activeAcademicYear.academicYear} · ${currentSemester}` : 'No academic year'

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <SectionHeader
        title={`${membershipRole} Dashboard`}
        description="Your department and its scheduled building usage."
        action={headerAction}
      />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-100 bg-gray-50/50 px-5 sm:px-6 py-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight truncate">My Department</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">Academic unit & affiliation</p>
              </div>
              <button type="button" onClick={navigateToDepartment} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
                <span>Department Hub</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 flex-1 flex flex-col justify-center">
              {departmentInfo ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                      {departmentInfo.logo && !logoError ? (
                        <img src={departmentInfo.logo} alt={departmentInfo.code} className="w-full h-full object-cover" onError={() => setLogoError(true)} />
                      ) : <DepartmentIcon className="w-6 h-6 text-[var(--brand-color)]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--brand-color)] text-white text-xs font-black tracking-wide">{departmentInfo.code}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${membershipRole === 'Dean' ? 'bg-amber-100 text-amber-700' : membershipRole === 'Program Head' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{membershipRole}</span>
                      </div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-1 leading-snug line-clamp-2">{departmentInfo.name}</h4>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                      <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Total Faculty</span>
                      <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5">{departmentInfo.memberCount ?? '—'}<span className="text-[0.7rem] font-medium text-slate-400 ml-1">members</span></p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 sm:p-3 flex flex-col justify-between">
                      <span className="text-[0.65rem] uppercase tracking-wider font-semibold text-slate-400 truncate">Active Term</span>
                      <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{currentSemester}</p>
                      <span className="text-[0.62rem] text-slate-400 font-medium truncate">{activeAcademicYear?.academicYear || 'Current Academic Year'}</span>
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
                  <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-[var(--brand-color)] mb-2.5"><DepartmentIcon className="h-5 w-5" /></div>
                  <p className="text-sm font-bold text-slate-700">Department Affiliation</p>
                  <p className="text-xs text-slate-400 mt-0.5">{departmentCode ? 'Loading department details...' : 'No department assigned.'}</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <TodayScheduleCard
              meetings={personalMeetings}
              roomsById={roomsById}
              isLoading={scheduleLoading}
              hasError={scheduleError}
              onViewTimetable={navigateToSchedule}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <div className="h-[340px] rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 leading-tight">Buildings</h3>
                <p className="text-xs text-gray-500 mt-0.5">Your department's scheduled building use · {term}</p>
              </div>
              <button type="button" onClick={navigateToBuildings} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
                <span>Buildings & Rooms</span>
                <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
              {!departmentCode ? (
                <p className="text-sm text-slate-500">No department assigned.</p>
              ) : usageError ? (
                <p className="text-sm text-rose-600">Schedule usage is unavailable.</p>
              ) : usageLoading ? (
                <p className="text-sm text-slate-500">Loading building usage…</p>
              ) : usedBuildings.length === 0 ? (
                <p className="text-sm text-slate-500">No buildings are scheduled for this department in the active term.</p>
              ) : usedBuildings.map(({ building, usage: buildingUsage }) => (
                <div key={building.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{building.name}</p>
                      <p className="text-xs text-slate-500">{building.code}</p>
                    </div>
                    <span className="shrink-0 text-xl font-semibold text-slate-800">{Math.round(buildingUsage?.totalPercent || 0)}%</span>
                  </div>
                  <ScheduleUsageBar usage={buildingUsage} isLoading={false} hasError={false} colorIndexes={{ [departmentCode.toUpperCase()]: 0 }} label={`Scheduled usage for ${departmentCode} in ${building.name}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="lg:min-h-0 lg:flex-1">
            <WeekReservationsCard
              reservations={reservations}
              roomsById={roomsById}
              isLoading={reservationsLoading}
              hasError={reservationsError}
              onViewAll={navigateToReservations}
            />
          </div>
        </div>
        <div className="lg:col-span-12">
          <DepartmentScheduleOverviewCard
            term={term}
            total={departmentSchedule.total}
            plotted={departmentSchedule.plotted}
            drafted={departmentSchedule.drafted}
            isLoading={scheduleLoading}
            hasError={scheduleError}
            onOpenDepartment={navigateToDepartment}
          />
        </div>
      </div>
    </section>
  )
}

export default DepartmentDashboardPage
