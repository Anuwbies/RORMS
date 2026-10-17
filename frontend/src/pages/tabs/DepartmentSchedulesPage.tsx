import { useState, useEffect, useMemo } from 'react'
import { formatUserName } from '../../utils/userName'
import {
  CalendarIcon,
  UserIcon,
  UsersIcon,
  DoorIcon,
  CheckCircleIcon
} from '../../components/Icons'
import { Button } from '../../components/Button'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { SummaryCard } from '../../components/SummaryCard'
import { SummaryGraph } from '../../summary-graphs/SummaryGraph'
import { PlotScheduleModal } from '../../components/PlotScheduleModal'
import { DepartmentScheduleImportModal } from '../../components/DepartmentScheduleImportModal'
import { SelectSemesterModal } from '../../components/SelectSemesterModal'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { canEditDepartmentWorkbook, workbookEditablePhases, type WorkbookMembership } from '../../utils/departmentWorkbookPermissions'
import { scheduleMeetingRecords, type ScheduleMeetingRecord } from '../../utils/scheduleMeetings'
import { semesterKey } from '../../utils/departmentWorkbookPaths'
import {
  collection,
  onSnapshot,
  query,
  where
} from 'firebase/firestore'

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
  sem1?: { name?: string; phase?: string; startMonth?: string; endMonth?: string }
  sem2?: { name?: string; phase?: string; startMonth?: string; endMonth?: string }
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


export function DepartmentSchedulesPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const departmentCodeOptions = useMemo(() => {
    return Array.from(new Set(departments.map(d => d.code).filter(Boolean)))
  }, [departments])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: string; phase: string } | null>(null)
  const [workbookMembership, setWorkbookMembership] = useState<(WorkbookMembership & { id: string }) | null>(null)

  useEffect(() => {
    let unsubscribeMembership: (() => void) | undefined
    const unsubscribeAuth = onAuthStateChanged(auth, user => {
      unsubscribeMembership?.()
      setWorkbookMembership(null)
      if (!user) return
      unsubscribeMembership = onSnapshot(query(collection(db, 'memberships'), where('userId', '==', user.uid)), snapshot => {
        const manager = snapshot.docs.find(document => {
          const data = document.data()
          return data.status === 'accepted' && (data.role === 'Admin' || data.role === 'Registrar')
        })
        setWorkbookMembership(manager ? { id: manager.id, userId: user.uid, role: manager.data().role, status: 'accepted', department: manager.data().department } : null)
      }, () => setWorkbookMembership(null))
    })
    return () => { unsubscribeAuth(); unsubscribeMembership?.() }
  }, [])

  // Modals & Navigation state
  const [isSchoolYearModalOpen, setIsSchoolYearModalOpen] = useState(false)
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})

  // DataTable filtering & search
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Department Schedule statistics
  const [deptSchedules, setDeptSchedules] = useState<DepartmentScheduleSummary[]>([])

  useEffect(() => {
    if (!selectedDepartment?.code) {
      setDeptSchedules([])
      return
    }

    const q = query(
      collection(db, 'schedules'),
      where('department', '==', selectedDepartment.code)
    )

    const unsub = onSnapshot(q, (snap) => {
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
      // Filter by selected academic year and semester if available
      const filtered = allDocs.filter(item => {
        const matchesYear = !selectedAcademicYear?.academicYear || item.academicYear === selectedAcademicYear.academicYear
        const matchesSem = !selectedSemesterPhase?.name || item.semester === selectedSemesterPhase.name
        return matchesYear && matchesSem
      })
      setDeptSchedules(filtered)
    })

    return () => unsub()
  }, [selectedDepartment?.code, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  const scheduleCounts = useMemo(() => {
    const parentOrSingle = deptSchedules.filter(s => !s.parentId)
    const plot = parentOrSingle.filter(s => s.status === 'Plot').length
    const draft = parentOrSingle.filter(s => s.status === 'Draft').length
    const total = parentOrSingle.length

    return { plot, draft, total }
  }, [deptSchedules])

  const facultyCounts = useMemo(() => {
    const points = ['Instructor', 'Program Head', 'Dean'].map(role => ({
      label: role,
      value: members.filter(member => member.role === role).length,
    }))
    return { points, total: points.reduce((sum, point) => sum + point.value, 0) }
  }, [members])

  const roomAssignments = useMemo(() => {
    // Workbook rows can contain several independent Lec/Lab room assignments.
    const sessions = scheduleMeetingRecords(deptSchedules
      .filter(row => row.source !== 'workbook' || row.schemaVersion !== 2 || (Array.isArray(row.meetings) && row.meetings.length > 0))
      .map(row => ({ id: row.id, data: () => row })))
    const assigned = sessions.filter(session => Boolean(session.roomId?.trim())).length
    return { assigned, unassigned: sessions.length - assigned, total: sessions.length }
  }, [deptSchedules])

  // 1. Fetch Academic Years
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'academicYears'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AcademicYearData[]
      fetched.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(fetched)

      if (fetched.length > 0 && !selectedAcademicYear) {
        const active = fetched.find(y => y.isActive) || fetched[0]
        setSelectedAcademicYear(active)
      }
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
      width: '30%',
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
      width: '23%',
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
      width: '23%',
      render: (member) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[member.status] || 'bg-gray-100 text-gray-700'}`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '1%',
      align: 'right',
      render: (member) => (
        <span className="text-sm font-semibold text-gray-600">
          {member.joinedDate}
        </span>
      )
    }
  ], [avatarErrors])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="Department Schedules"
          description="Overview of department members, schedules, and room allocations across colleges."
        />

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            className="animate-in"
            title="Plot Schedules"
            subtitle={`${scheduleCounts.plot} of ${scheduleCounts.total} schedules plotted`}
            icon={<CheckCircleIcon className="w-4.5 h-4.5 text-[var(--brand-color)]" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          >
            <SummaryGraph variant="bar" total={scheduleCounts.plot} points={[
              { label: 'Plot', value: scheduleCounts.plot },
              { label: 'Draft', value: scheduleCounts.draft },
            ]} />
          </SummaryCard>
          <SummaryCard
            className="animate-in"
            title="Department Faculty"
            subtitle={`${facultyCounts.total} faculty members in the department`}
            icon={<UsersIcon className="w-4.5 h-4.5 text-blue-600" />}
            gradientClasses="from-blue-500 to-indigo-600"
            blobClasses="bg-blue-500/8 group-hover:bg-blue-500/14"
          >
            <SummaryGraph variant="pie" total={facultyCounts.total} points={facultyCounts.points} tone="sky" />
          </SummaryCard>
          <SummaryCard
            className="animate-in"
            title="Room Assignments"
            subtitle={`${roomAssignments.assigned} of ${roomAssignments.total} sessions assigned a room`}
            icon={<DoorIcon className="w-4.5 h-4.5 text-amber-600" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          >
            <SummaryGraph variant="bar" total={roomAssignments.total} points={[
              { label: 'Assigned', value: roomAssignments.assigned },
              { label: 'Unassigned', value: roomAssignments.unassigned },
            ]} tone="amber" />
          </SummaryCard>
        </div>

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
            setIsAddScheduleModalOpen(true)
          }}
          subtitle={`Choose the academic term to open the saved workbook for ${selectedDepartment?.code}.`}
          editablePhases={[...workbookEditablePhases(workbookMembership?.role)]}
        />

      </div>

      {/* Open the same saved department/year/semester workbook as My Department. */}
      {isAddScheduleModalOpen && selectedDepartment && selectedAcademicYear?.id && selectedAcademicYear.academicYear && selectedSemesterPhase && <DepartmentScheduleImportModal
        key={`${selectedDepartment.id}:${selectedAcademicYear.id}:${selectedSemesterPhase.name}`}
        onClose={() => setIsAddScheduleModalOpen(false)}
        departmentName={selectedDepartment.name}
        term={{ departmentId: selectedDepartment.id, departmentCode: selectedDepartment.code,
          academicYearId: selectedAcademicYear.id, academicYear: selectedAcademicYear.academicYear,
          semester: semesterKey(selectedSemesterPhase.name), membershipId: workbookMembership?.id || '' }}
        readOnly={!canEditDepartmentWorkbook(workbookMembership || undefined, auth.currentUser?.uid || '', selectedDepartment.code, selectedSemesterPhase.phase)}
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
    </section>
  )
}

export default DepartmentSchedulesPage
