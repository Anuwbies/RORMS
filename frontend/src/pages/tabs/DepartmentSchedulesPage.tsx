import { useState, useEffect, useMemo } from 'react'
import { formatUserName } from '../../utils/userName'
import { CalendarIcon, UserIcon } from '../../components/Icons'
import { Button } from '../../components/Button'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { PlotScheduleModal } from '../../components/PlotScheduleModal'
import { SectionScheduleModal, type SectionScheduleSelection } from '../../components/SectionScheduleModal'
import { WorkbookModal } from '../../components/WorkbookModal'
import { SelectSemesterModal } from '../../components/SelectSemesterModal'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import type { WorkbookMembership } from '../../utils/departmentWorkbookPermissions'
import { scheduleMeetingRecords, type ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { savedMeetingPlotStatus } from '../../utils/schedulePlotting'
import { resolveCurrentSemester } from '../../utils/academicSemester'
import { semesterKey } from '../../utils/departmentWorkbookPaths'
import { scheduleMatchesTerm, scheduleSectionLabel } from '../../utils/roomSchedule'
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where
} from 'firebase/firestore'

const SEMESTER_PHASES = ['Closed', 'Drafting', 'Plotting', 'Revision', 'Final', 'Ended'] as const
const YEAR_LEVELS = [
  { year: 1, label: '1st Year' },
  { year: 2, label: '2nd Year' },
  { year: 3, label: '3rd Year' },
  { year: 4, label: '4th Year' },
] as const

interface Department {
  id: string
  name: string
  code: string
  dean?: string
  logo?: string
}

interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: { name?: string; phase?: string; startDate?: string; endDate?: string; startMonth?: string; startYear?: number; endMonth?: string; endYear?: number }
  sem2?: { name?: string; phase?: string; startDate?: string; endDate?: string; startMonth?: string; startYear?: number; endMonth?: string; endYear?: number }
}

interface DepartmentScheduleSummary extends ScheduleMeetingRecord {
  status: 'Draft' | 'Plot'
}

interface Member {
  id: string
  membershipId: string
  name: string
  email: string
  role: string
  status: string
  department: string
  avatar?: string
  joinedDate?: string
  joinedAt?: Date | null
}

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
  Member: 'bg-gray-100 text-gray-700',
  Registrar: 'bg-blue-100 text-blue-700'
}

const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Deactivated: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

const phaseClasses: Record<string, string> = {
  Closed: 'bg-slate-100 text-slate-600',
  Drafting: 'bg-amber-100 text-amber-700',
  Plotting: 'bg-blue-100 text-blue-700',
  Revision: 'bg-purple-100 text-purple-700',
  Final: 'bg-emerald-100 text-emerald-700',
  Ended: 'bg-rose-100 text-rose-700',
}


export function DepartmentSchedulesPage({ userRole }: { userRole: string }) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const departmentCodeOptions = useMemo(() => {
    return Array.from(new Set(departments.map(d => d.code).filter(Boolean)))
  }, [departments])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [academicYearsLoading, setAcademicYearsLoading] = useState(true)
  const [academicYearsError, setAcademicYearsError] = useState('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: string; phase: string } | null>(null)
  const activeAcademicYear = academicYears.find(year => year.isActive)
  const currentAcademicYear = activeAcademicYear ?? academicYears[0]
  const currentSemester = currentAcademicYear ? resolveCurrentSemester(currentAcademicYear) : ''
  const activeSemesterName = activeAcademicYear ? resolveCurrentSemester(activeAcademicYear) : ''
  const activeSemesterKey = activeSemesterName === '2nd Semester' ? 'sem2' : 'sem1'
  const activeSemester = activeAcademicYear?.[activeSemesterKey]
  const currentPhase = activeSemester?.phase || 'Closed'
  const [phaseDraft, setPhaseDraft] = useState<{ yearId: string; semester: 'sem1' | 'sem2'; basePhase: string; phase: string } | null>(null)
  const selectedPhase = phaseDraft && phaseDraft.yearId === activeAcademicYear?.id && phaseDraft.semester === activeSemesterKey && phaseDraft.basePhase === currentPhase
    ? phaseDraft.phase : currentPhase
  const [isPhaseSaving, setIsPhaseSaving] = useState(false)
  const [phaseError, setPhaseError] = useState('')
  const [workbookMembership, setWorkbookMembership] = useState<(WorkbookMembership & { id: string }) | null>(null)

  const saveCurrentSemesterPhase = async () => {
    const year = activeAcademicYear
    const membership = workbookMembership
    const uid = auth.currentUser?.uid
    if (!year || !membership || membership.role !== 'Registrar' || !uid || selectedPhase === currentPhase || !SEMESTER_PHASES.includes(selectedPhase as typeof SEMESTER_PHASES[number])) return

    setPhaseError('')
    setIsPhaseSaving(true)
    try {
      await runTransaction(db, async transaction => {
        const yearRef = doc(db, 'academicYears', year.id)
        const membershipRef = doc(db, 'memberships', membership.id)
        const profileRef = doc(db, 'users', uid)
        const yearSnapshot = await transaction.get(yearRef)
        const membershipSnapshot = await transaction.get(membershipRef)
        const profileSnapshot = await transaction.get(profileRef)
        const liveYear = yearSnapshot.exists() ? { ...yearSnapshot.data(), id: year.id } as AcademicYearData : null
        const liveMember = membershipSnapshot.data()
        if (!liveYear?.isActive || liveYear.academicYear !== year.academicYear) throw new Error('The active school year changed. Review the current term and try again.')
        if (!liveMember || liveMember.userId !== uid || liveMember.role !== 'Registrar' || liveMember.status !== 'accepted' || !profileSnapshot.exists() || profileSnapshot.data().isActive === false) {
          throw new Error('An active Registrar membership is required to change the semester phase.')
        }
        if ((resolveCurrentSemester(liveYear) === '2nd Semester' ? 'sem2' : 'sem1') !== activeSemesterKey) {
          throw new Error('The current semester changed. Review the term and try again.')
        }
        if ((liveYear[activeSemesterKey]?.phase || 'Closed') !== currentPhase) {
          throw new Error('The semester phase changed. Review the latest phase and try again.')
        }
        transaction.update(yearRef, { [`${activeSemesterKey}.phase`]: selectedPhase })
      })
    } catch (error) {
      setPhaseError(error instanceof Error ? error.message : 'Could not update the semester phase. Please try again.')
    } finally {
      setIsPhaseSaving(false)
    }
  }

  useEffect(() => {
    let unsubscribeMembership: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeMembership?.()
      setWorkbookMembership(null)
      if (!user) return
      unsubscribeMembership = onSnapshot(query(collection(db, 'memberships'), where('userId', '==', user.uid)), snapshot => {
        const eligibleManagers = snapshot.docs.filter(document => {
          const data = document.data()
          return data.status === 'accepted' && (data.role === 'Admin' || data.role === 'Registrar')
        })
        const manager = eligibleManagers.find(document => document.data().role === userRole) ?? eligibleManagers[0]
        setWorkbookMembership(manager ? { id: manager.id, userId: user.uid, role: manager.data().role, status: 'accepted', department: manager.data().department } : null)
      }, () => setWorkbookMembership(null))
    })
    return () => { unsubscribeAuth(); unsubscribeMembership?.() }
  }, [userRole])

  // Modals & Navigation state
  const [isSchoolYearModalOpen, setIsSchoolYearModalOpen] = useState(false)
  const [isWorkbookOpen, setIsWorkbookOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedSection, setSelectedSection] = useState<SectionScheduleSelection | null>(null)
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})

  // DataTable filtering & search
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Department Schedule statistics
  const [deptSchedules, setDeptSchedules] = useState<DepartmentScheduleSummary[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [sectionsError, setSectionsError] = useState(false)

  const sectionsByYear = useMemo(() => {
    const sections: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] }
    if (!activeAcademicYear || !activeSemesterName || !selectedDepartment) return sections

    const seen = new Set<string>()
    for (const schedule of deptSchedules) {
      if (schedule.departmentId !== selectedDepartment.id || !(schedule.academicYearId || schedule.academicYear)
        || !(schedule.semesterKey || schedule.semester) || !scheduleMatchesTerm(schedule, activeAcademicYear, activeSemesterName)) continue
      const year = schedule.yearLevel
      const section = typeof schedule.classSection === 'string' ? schedule.classSection.trim() : ''
      if (typeof year !== 'number' || !sections[year] || !section) continue

      const label = scheduleSectionLabel(schedule)
      const key = `${year}:${label.toLocaleUpperCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      sections[year].push(label)
    }

    for (const level of YEAR_LEVELS) sections[level.year].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    return sections
  }, [deptSchedules, selectedDepartment, activeAcademicYear, activeSemesterName])
  const sectionCount = YEAR_LEVELS.reduce((total, level) => total + sectionsByYear[level.year].length, 0)
  const yearPlotProgress = useMemo(() => {
    const progress: Record<number, { plot: number; total: number }> = Object.fromEntries(
      YEAR_LEVELS.map(level => [level.year, { plot: 0, total: 0 }])
    )
    if (!selectedDepartment || !activeAcademicYear || !activeSemesterName) return progress

    const meetings = scheduleMeetingRecords(deptSchedules.map(schedule => ({ id: schedule.id, data: () => schedule })))
    for (const meeting of meetings) {
      const year = meeting.yearLevel
      if (meeting.departmentId !== selectedDepartment.id || typeof year !== 'number' || !progress[year]
        || !meeting.startTime || !meeting.endTime || !scheduleMatchesTerm(meeting, activeAcademicYear, activeSemesterName)) continue
      for (const day of new Set(meeting.days ?? [])) {
        progress[year].total += 1
        if (savedMeetingPlotStatus(meeting, day) === 'Plot') progress[year].plot += 1
      }
    }
    return progress
  }, [deptSchedules, selectedDepartment, activeAcademicYear, activeSemesterName])
  const sectionPlotProgress = useMemo(() => {
    const progress = new Map<string, { plot: number; total: number }>()
    if (!selectedDepartment || !activeAcademicYear || !activeSemesterName) return progress

    const meetings = scheduleMeetingRecords(deptSchedules.map(schedule => ({ id: schedule.id, data: () => schedule })))
    for (const meeting of meetings) {
      const year = meeting.yearLevel
      if (meeting.departmentId !== selectedDepartment.id || typeof year !== 'number' || !meeting.startTime || !meeting.endTime
        || !scheduleMatchesTerm(meeting, activeAcademicYear, activeSemesterName)) continue
      const section = scheduleSectionLabel(meeting).trim().toLocaleUpperCase()
      const key = JSON.stringify([year, section])
      const counts = progress.get(key) ?? { plot: 0, total: 0 }
      for (const day of new Set(meeting.days ?? [])) {
        counts.total += 1
        if (savedMeetingPlotStatus(meeting, day) === 'Plot') counts.plot += 1
      }
      progress.set(key, counts)
    }
    return progress
  }, [deptSchedules, selectedDepartment, activeAcademicYear, activeSemesterName])

  useEffect(() => {
    if (!currentAcademicYear || !currentSemester) {
      setDeptSchedules([])
      setSectionsLoading(false)
      setSectionsError(false)
      return
    }

    setDeptSchedules([])
    setSectionsLoading(true)
    setSectionsError(false)

    const unsub = onSnapshot(collection(db, 'schedules'), (snap) => {
      const allDocs = snap.docs.map((document): DepartmentScheduleSummary => {
        const data = document.data()
        return {
          ...data,
          id: document.id,
          parentId: typeof data.parentId === 'string' ? data.parentId : undefined,
          academicYear: typeof data.academicYear === 'string' ? data.academicYear : undefined,
          semester: typeof data.semester === 'string' ? data.semester : undefined,
          status: data.status === 'Plot' ? 'Plot' : 'Draft',
        }
      })
      // The overview and member counters always describe the current term.
      const filtered = allDocs.filter(item => {
        const matchesYear = item.academicYear === currentAcademicYear.academicYear
          || item.academicYearId === currentAcademicYear.id
        const matchesSem = item.semester === currentSemester || item.semester === semesterKey(currentSemester)
          || item.semesterKey === semesterKey(currentSemester)
        return matchesYear && matchesSem
      })
      setDeptSchedules(filtered)
      setSectionsLoading(false)
    }, error => {
      console.error('Error loading department schedules:', error)
      setDeptSchedules([])
      setSectionsLoading(false)
      setSectionsError(true)
    })

    return () => unsub()
  }, [currentAcademicYear?.id, currentAcademicYear?.academicYear, currentSemester])

  const memberScheduleCounts = useMemo(() => {
    const meetingsByInstructor = new Map<string, Map<string, 'Draft' | 'Plot'>>()
    const meetings = scheduleMeetingRecords(deptSchedules.map(schedule => ({ id: schedule.id, data: () => schedule })))
    for (const meeting of meetings) {
      const instructorId = meeting.instructorId?.trim()
      if (!instructorId || !meeting.startTime || !meeting.endTime) continue
      const instructorMeetings = meetingsByInstructor.get(instructorId) ?? new Map<string, 'Draft' | 'Plot'>()
      for (const day of new Set(meeting.days ?? [])) {
        instructorMeetings.set(JSON.stringify([meeting.id, day]), savedMeetingPlotStatus(meeting, day))
      }
      meetingsByInstructor.set(instructorId, instructorMeetings)
    }
    return new Map(members.map(member => {
      const meetings = new Map<string, 'Draft' | 'Plot'>()
      for (const id of [member.membershipId, member.id]) {
        for (const [meetingDay, status] of meetingsByInstructor.get(id) ?? []) meetings.set(meetingDay, status)
      }
      return [member.membershipId, { plot: [...meetings.values()].filter(status => status === 'Plot').length, total: meetings.size }] as const
    }))
  }, [deptSchedules, members])

  // 1. Fetch Academic Years
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'academicYears'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AcademicYearData[]
      fetched.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(fetched)
      setAcademicYearsLoading(false)
      setAcademicYearsError('')

      if (fetched.length > 0 && !selectedAcademicYear) {
        const active = fetched.find(y => y.isActive) || fetched[0]
        setSelectedAcademicYear(active)
      }
    }, () => {
      setAcademicYearsLoading(false)
      setAcademicYearsError('Could not load the active school year. Please reload and try again.')
    })
    return () => unsub()
  }, [])

  // 2. Fetch Departments
  useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Department[]
      fetched.sort((a, b) => a.name.localeCompare(b.name))
      setDepartments(fetched)
      if (fetched.length > 0) {
        setSelectedDepartment(prev => {
          if (prev) {
            const stillExists = fetched.find(d => d.id === prev.id)
            if (stillExists) return stillExists
          }
          const savedCode = localStorage.getItem('rorms_selected_department_code')
          if (savedCode) {
            const savedDept = fetched.find(d => d.code === savedCode)
            if (savedDept) return savedDept
          }
          return fetched[0]
        })
      }
    })
    return () => unsubDepts()
  }, [])

  // 3. Fetch Members (instructors, deans, program heads)
  useEffect(() => {
    if (!selectedDepartment?.code) {
      setMembers([])
      setLoadingMembers(false)
      return
    }

    const unsubMembers = onSnapshot(collection(db, 'memberships'), (snapMembers) => {
      const allMemberDocs = snapMembers.docs.map(d => ({ id: d.id, ...d.data() }))

      const unsubUsers = onSnapshot(collection(db, 'users'), (snapUsers) => {
        const usersMap = new Map()
        snapUsers.docs.forEach(doc => {
          usersMap.set(doc.id, { id: doc.id, ...doc.data() })
        })

        const fetched: Member[] = allMemberDocs
          .filter((d: any) => {
            const isTargetDept = d.department === selectedDepartment.code
            const hasRegisteredUser = Boolean(d.userId && usersMap.has(d.userId))
            return isTargetDept && hasRegisteredUser
          })
          .map((data: any) => {
            const u = usersMap.get(data.userId) || {}
            const dateObj = data.joinedAt?.toDate ? data.joinedAt.toDate() : null
            
            let computedStatus = 'Active'
            if (u.isActive === false) {
              computedStatus = 'Deactivated'
            } else if (data.status === 'pending') {
              computedStatus = 'Pending'
            }

            return {
              id: data.userId || data.id,
              membershipId: data.id,
              name: formatUserName(u, data),
              email: u.email || data.email || '',
              role: data.role || 'Instructor',
              status: computedStatus,
              department: data.department || '',
              avatar: u.profilePicture || '',
              joinedDate: dateObj
                ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(dateObj)
                : '— — — — —',
              joinedAt: dateObj
            } as Member
          })

        setMembers(fetched)
        setLoadingMembers(false)
      })

      return () => unsubUsers()
    })

    return () => unsubMembers()
  }, [selectedDepartment?.code])

  // Row click in DataTable opens instructor schedule
  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }

  // Filtered members for DataTable
  const filteredMembers = useMemo(() => {
    return members
      .filter(member => {
        if (selectedRoles.length > 0 && !selectedRoles.includes(member.role)) return false
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(member.status)) return false

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase()
          const match = [member.name, member.email, member.role, member.status].some(
            val => val?.toLowerCase().includes(term)
          )
          if (!match) return false
        }
        return true
      })
      .sort((a, b) => {
        const roleOrder: Record<string, number> = { 'Dean': 1, 'Program Head': 2, 'Instructor': 3 }
        const statusOrder: Record<string, number> = { 'Active': 1, 'Pending': 2, 'Deactivated': 3 }
        
        const roleA = roleOrder[a.role] || 99
        const roleB = roleOrder[b.role] || 99
        if (roleA !== roleB) return roleA - roleB

        const statusA = statusOrder[a.status] || 99
        const statusB = statusOrder[b.status] || 99
        if (statusA !== statusB) return statusA - statusB

        return a.name.localeCompare(b.name)
      })
  }, [members, selectedRoles, selectedStatuses, searchTerm])

  // Member columns for DataTable
  const memberColumns: ColumnDef<Member>[] = useMemo(() => [
    {
      header: 'Member Info',
      width: '32%',
      render: (member) => (
        <div className="flex items-center gap-4">
          {member.avatar && !avatarErrors[member.avatar] ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar!]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
              <UserIcon className="h-5 w-5" />
            </div>
          )}
          <div className="flex flex-col">
            {member.name ? (
              <>
                <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                  {member.name}
                </span>
                <span className="text-xs font-medium text-slate-500">{member.email}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                {member.email}
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Role',
      width: '20%',
      render: (member) => (
        <div className={`flex items-center gap-2 ${roleClasses[member.role]?.split(' ')[1] || 'text-gray-500'}`}>
          <div className="h-2 w-2 rounded-full bg-current" />
          <span className="text-[0.7rem] font-bold uppercase tracking-widest">
            {member.role}
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      width: '16%',
      render: (member) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[member.status] || 'bg-gray-100 text-gray-700'}`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '16%',
      align: 'right',
      render: (member) => (
        <span className="text-sm font-semibold text-gray-600">
          {member.joinedDate}
        </span>
      )
    },
    {
      header: 'Plotted / Total',
      width: '16%',
      align: 'right',
      render: (member) => {
        const counts = memberScheduleCounts.get(member.membershipId) ?? { plot: 0, total: 0 }
        return <span className="text-sm font-semibold text-gray-600" title={`${counts.plot} plotted, ${counts.total - counts.plot} draft`}>
          {counts.plot} / {counts.total}
        </span>
      }
    }
  ], [avatarErrors, memberScheduleCounts])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="Department Schedules"
          description="Overview of department members, schedules, and room allocations across colleges."
        />

        {userRole === 'Registrar' && (
          <section aria-label="Current semester phase" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f3f7ee] text-[#62853e]">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Current semester phase</h2>
                  <p className="text-sm text-slate-500">Controls schedule editing and room plotting for the active term.</p>
                </div>
              </div>
              {activeAcademicYear && <span className="rounded-full bg-[#e3edda] px-3 py-1 text-xs font-bold text-[#41572a]">Active school year</span>}
            </div>
            {academicYearsLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading the active term...</p>
            ) : academicYearsError || !activeAcademicYear ? (
              <p role="alert" className="mt-4 text-sm text-amber-700">{academicYearsError || 'No active school year is set. Set one in Academic Calendar before changing its phase.'}</p>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                  <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-4 shadow-sm">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">School year</p>
                    <p className="flex h-12 items-center text-2xl font-bold text-slate-900">{activeAcademicYear.academicYear}</p>
                  </div>
                  <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-4 shadow-sm">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Current semester</p>
                    <p className="flex h-12 items-center text-xl font-bold text-slate-900">{activeSemesterName}</p>
                  </div>
                  <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-4 shadow-sm">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Current phase</p>
                    <div className="flex h-12 items-center">
                      <span className={`inline-flex rounded-lg px-2.5 py-1 text-lg font-bold ${phaseClasses[currentPhase] || phaseClasses.Closed}`}>{currentPhase}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center rounded-xl border border-slate-300 bg-slate-100/70 p-4 shadow-sm">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">Change phase</label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                    <SingleSelectDropdown value={selectedPhase} options={SEMESTER_PHASES} onChange={phase => {
                      setPhaseDraft({ yearId: activeAcademicYear.id, semester: activeSemesterKey, basePhase: currentPhase, phase })
                      setPhaseError('')
                    }} ariaLabel="New semester phase" isDisabled={isPhaseSaving} />
                    </div>
                    <Button type="button" variant="brand" disabled={isPhaseSaving || selectedPhase === currentPhase} onClick={saveCurrentSemesterPhase}>
                      {isPhaseSaving ? 'Saving...' : 'Save phase'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {phaseError && <p role="alert" className="mt-3 text-sm text-rose-700">{phaseError}</p>}
          </section>
        )}

        <section aria-label="Sections by year level" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Sections by Year Level</h2>
              <p className="text-xs font-medium text-slate-500">
                {activeAcademicYear ? `${activeAcademicYear.academicYear} • ${activeSemesterName}` : 'No active academic year'}
              </p>
            </div>
            <span className="rounded-lg bg-[#f3f7ee] px-2.5 py-1 text-xs font-bold text-[#41572a]">
              {sectionCount} {sectionCount === 1 ? 'section' : 'sections'}
            </span>
          </div>
          {sectionsError ? (
            <p role="alert" className="mt-5 border-t border-slate-300 pt-5 text-sm text-rose-700">Unable to load sections.</p>
          ) : (
            <div className="mt-5 grid gap-4 border-t border-slate-300 pt-5 sm:grid-cols-2 xl:grid-cols-4">
              {YEAR_LEVELS.map(level => (
                <div key={level.year} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div role="progressbar" aria-label={`${level.label} schedules plotted`}
                    aria-valuemin={0} aria-valuemax={100}
                    aria-valuenow={yearPlotProgress[level.year].total ? Math.round(yearPlotProgress[level.year].plot / yearPlotProgress[level.year].total * 100) : 0}
                    aria-valuetext={`${yearPlotProgress[level.year].plot} of ${yearPlotProgress[level.year].total} schedule meetings plotted`}
                    title={`${sectionsByYear[level.year].length} sections • ${yearPlotProgress[level.year].plot} of ${yearPlotProgress[level.year].total} schedule meetings plotted`}
                    className="relative isolate flex items-center justify-between gap-2 overflow-hidden rounded-lg bg-[#f3f7ee] px-2 py-1.5">
                    <span aria-hidden="true" className="absolute inset-y-0 left-0 z-0 bg-[#c6dbb6] transition-[width] duration-300"
                      style={{ width: `${yearPlotProgress[level.year].total ? yearPlotProgress[level.year].plot / yearPlotProgress[level.year].total * 100 : 0}%` }} />
                    <h3 className="relative z-10 text-sm font-bold text-slate-900">{level.label}</h3>
                    <span className="relative z-10 text-xs font-semibold text-[#41572a]">{yearPlotProgress[level.year].plot}/{yearPlotProgress[level.year].total} plotted</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {sectionsByYear[level.year].length ? sectionsByYear[level.year].map(section => {
                      const counts = sectionPlotProgress.get(JSON.stringify([level.year, section.trim().toLocaleUpperCase()])) ?? { plot: 0, total: 0 }
                      return (
                        <button
                          key={section}
                          type="button"
                          title={`${section}: ${counts.plot} plotted, ${counts.total - counts.plot} draft. View schedule`}
                          aria-label={`View ${section} schedule, ${counts.plot} of ${counts.total} meetings plotted`}
                          onClick={() => setSelectedSection({ label: section, yearLevel: level.year })}
                          className="relative isolate min-w-0 overflow-hidden rounded-lg bg-white px-0.5 py-1 text-center text-[9px] leading-tight font-semibold tracking-tight whitespace-nowrap text-[#41572a] ring-1 ring-[#c6dbb6] transition-colors hover:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e] cursor-pointer"
                        >
                          <span aria-hidden="true" className="absolute inset-y-0 left-0 z-0 bg-[#c6dbb6] transition-[width] duration-300"
                            style={{ width: `${counts.total ? counts.plot / counts.total * 100 : 0}%` }} />
                          <span className="relative z-10">{section}</span>
                        </button>
                      )
                    }) : (
                      <span className="col-span-3 text-xs text-slate-500">{sectionsLoading ? 'Loading sections...' : 'No sections'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>


        {/* Members DataTable for Selected Department */}
        <div className="relative z-10">
          <DataTable<Member>
            data={filteredMembers}
            columns={memberColumns}
            onRowClick={handleRowClick}
            searchPlaceholder={`Search ${selectedDepartment?.code || ''} members...`}
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={
              <FilterDropdown
                groups={[
                  {
                    id: 'role',
                    title: 'Role',
                    options: ['Dean', 'Program Head', 'Instructor'],
                    selectedValues: selectedRoles,
                    onChange: setSelectedRoles
                  },
                  {
                    id: 'status',
                    title: 'Status',
                    options: ['Active', 'Deactivated', 'Pending'],
                    selectedValues: selectedStatuses,
                    onChange: setSelectedStatuses
                  }
                ]}
                onClearAll={() => {
                  setSelectedRoles([])
                  setSelectedStatuses([])
                }}
              />
            }
            emptyTitle={loadingMembers ? "Loading members..." : `No members in ${selectedDepartment?.code || 'Department'}`}
            emptyDescription={loadingMembers ? "Retrieving department personnel records..." : "No members found matching your search filters."}
            primaryAction={
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                <SingleSelectDropdown
                  options={departmentCodeOptions}
                  value={selectedDepartment?.code || ''}
                  onChange={(code) => {
                    const dept = departments.find(d => d.code === code)
                    if (dept) {
                      setSelectedDepartment(dept)
                      localStorage.setItem('rorms_selected_department_code', code)
                    }
                  }}
                  className="w-full sm:w-34 min-w-[12rem]"
                />
                <Button
                  type="button"
                  variant="brand"
                  icon={<CalendarIcon className="h-5 w-5" />}
                  disabled={!selectedDepartment}
                  onClick={() => {
                    const active = academicYears.find((y: any) => y.isActive) || academicYears[0]
                    if (active) setSelectedAcademicYear(active)
                    setIsSchoolYearModalOpen(true)
                  }}
                >
                  Manage Schedule
                </Button>
              </div>
            }
          />
        </div>

        {/* School Year & Semester Selection Modal */}
        <SelectSemesterModal
          isOpen={isSchoolYearModalOpen}
          onClose={() => setIsSchoolYearModalOpen(false)}
          academicYears={academicYears}
          selectedAcademicYear={selectedAcademicYear}
          setSelectedAcademicYear={setSelectedAcademicYear}
          onSelectSemester={(semesterPhase) => {
            setSelectedSemesterPhase(semesterPhase)
            setIsSchoolYearModalOpen(false)
            setIsWorkbookOpen(true)
          }}
          subtitle={`Choose the academic term to open the saved workbook for ${selectedDepartment?.code}.`}
          editablePhases={[]}
        />

      </div>

      {/* Open the shared workbook for viewing across all three tabs. */}
      {isWorkbookOpen && selectedDepartment && selectedAcademicYear?.id && selectedAcademicYear.academicYear && selectedSemesterPhase && <WorkbookModal
        key={`${selectedDepartment.id}:${selectedAcademicYear.id}:${selectedSemesterPhase.name}`}
        onClose={() => setIsWorkbookOpen(false)}
        departmentName={selectedDepartment.name}
        term={{ departmentId: selectedDepartment.id, departmentCode: selectedDepartment.code,
          academicYearId: selectedAcademicYear.id, academicYear: selectedAcademicYear.academicYear,
          semester: semesterKey(selectedSemesterPhase.name), membershipId: workbookMembership?.id || '' }}
        department={{ departmentId: selectedDepartment.id, departmentCode: selectedDepartment.code, membershipId: workbookMembership?.id || '' }}
        scheduleReadOnly
        summaryReadOnly
        coursesReadOnly
        viewOnly
      />}

      {/* Instructor Schedule Modal (Opened when clicking a member in DataTable) */}
      <PlotScheduleModal
        isOpen={isScheduleModalOpen}
        plotting={workbookMembership ? { membershipId: workbookMembership.id, departmentCode: selectedDepartment?.code || '' } : undefined}
        member={selectedMember ? { ...selectedMember, departmentName: selectedDepartment?.name || selectedMember.department } : null}
        initialAcademicYear={selectedAcademicYear?.academicYear}
        initialSemester={selectedSemesterPhase?.name}
        onClose={() => {
          setIsScheduleModalOpen(false)
          setSelectedMember(null)
        }}
      />
      <SectionScheduleModal
        isOpen={Boolean(selectedSection)}
        onClose={() => setSelectedSection(null)}
        section={selectedSection}
        department={selectedDepartment}
        academicYear={activeAcademicYear?.academicYear}
        semester={activeSemesterName}
        plotting={workbookMembership ? { membershipId: workbookMembership.id, departmentCode: selectedDepartment?.code || '' } : undefined}
      />
    </section>
  )
}

export default DepartmentSchedulesPage
