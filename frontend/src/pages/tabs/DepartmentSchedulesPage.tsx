import { useState, useEffect, useMemo } from 'react'
import {
  CalendarIcon,
  ClockIcon,
  EditIcon,
  UserIcon,
  CheckCircleIcon
} from '../../components/Icons'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { SummaryCard } from '../../components/SummaryCard'
import { ScheduleModal } from '../../components/ScheduleModal'
import { DepartmentEditScheduleModal } from '../../components/DepartmentEditScheduleModal'
import { SelectSemesterModal } from '../../components/SelectSemesterModal'
import { db } from '../../firebase'
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
  Inactive: 'bg-rose-100 text-rose-700',
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
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: string; phase: string }>({
    name: '1st Semester',
    phase: 'Drafting'
  })

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
  const [deptSchedules, setDeptSchedules] = useState<any[]>([])

  useEffect(() => {
    if (!selectedDepartment?.code) {
      setDeptSchedules([])
      return
    }

    const q = query(
      collection(db, 'schedule'),
      where('department', '==', selectedDepartment.code)
    )

    const unsub = onSnapshot(q, (snap) => {
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
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
    const plotted = parentOrSingle.filter(s => s.status === 'Plot' || s.status === 'Plotted').length
    const drafted = parentOrSingle.filter(s => !s.status || s.status === 'Draft' || s.status === 'Drafted').length
    const revised = parentOrSingle.filter(s => s.status === 'Revise' || s.status === 'Revised').length
    const returned = parentOrSingle.filter(s => s.status === 'Return' || s.status === 'Returned' || s.status === 'Removed').length
    const total = parentOrSingle.length

    return { plotted, drafted, revised, returned, total }
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
          if (!prev) return fetched[0]
          const stillExists = fetched.find(d => d.id === prev.id)
          return stillExists || fetched[0]
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

    setLoadingMembers(true)
    const qMembers = query(
      collection(db, 'memberships'),
      where('departmentCode', '==', selectedDepartment.code)
    )

    const unsubMembers = onSnapshot(qMembers, (snapMembers) => {
      const memberDocs = snapMembers.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      const userIds = Array.from(new Set(memberDocs.map(m => m.userId).filter(Boolean)))

      if (userIds.length === 0) {
        setMembers([])
        setLoadingMembers(false)
        return
      }

      const unsubUsers = onSnapshot(collection(db, 'users'), (snapUsers) => {
        const usersMap = new Map()
        snapUsers.docs.forEach(doc => {
          usersMap.set(doc.id, { id: doc.id, ...doc.data() })
        })

        const fetched: Member[] = memberDocs.map(data => {
          const u = usersMap.get(data.userId) || {}
          return {
            id: data.userId || data.id,
            membershipId: data.id,
            name: u.fullName || 'No Name',
            email: u.email || '',
            role: data.role || 'Instructor',
            status: u.isActive === false ? 'Inactive' : 'Active',
            department: data.departmentCode || '',
            avatar: u.profilePicture || '',
            joinedDate: data.joinedAt?.toDate
              ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(data.joinedAt.toDate())
              : 'N/A',
            joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate() : null
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
    return members.filter(member => {
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
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest ${roleClasses[member.role] || 'bg-gray-100 text-gray-700'}`}>
          {member.role}
        </span>
      )
    },
    {
      header: 'Status',
      width: '23%',
      render: (member) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest ${statusClasses[member.status] || 'bg-gray-100 text-gray-700'}`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '23%',
      render: (member) => (
        <span className="text-sm font-semibold text-gray-600">
          {member.joinedDate}
        </span>
      )
    },
    {
      header: 'Actions',
      width: '1%',
      align: 'right',
      render: (_member) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Edit member"
            onClick={() => { }}
            className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
          >
            <EditIcon className="h-4 w-4" />
          </IconButton>
        </div>
      )
    }
  ], [avatarErrors])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader
          title="Department Schedules"
          description="Overview of department members, schedules, and room allocations across colleges."
        />

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            title="Plot Schedules"
            subtitle={scheduleCounts.total > 0 ? `${scheduleCounts.plotted} of ${scheduleCounts.total} plot` : 'No schedules created yet'}
            icon={<CheckCircleIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{scheduleCounts.plotted}</span>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Finalized
              </span>
            </div>
          </SummaryCard>
          <SummaryCard
            title="Drafted Proposals"
            subtitle={scheduleCounts.drafted > 0 ? `${scheduleCounts.drafted} pending Registrar review` : 'No pending drafts'}
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-500 to-indigo-600"
            blobClasses="bg-blue-500/8 group-hover:bg-blue-500/14"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{scheduleCounts.drafted}</span>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                Drafts
              </span>
            </div>
          </SummaryCard>
          <SummaryCard
            title="Revised & Returned"
            subtitle={scheduleCounts.revised > 0 ? `${scheduleCounts.revised} awaiting Dean acceptance` : (scheduleCounts.returned > 0 ? `${scheduleCounts.returned} returned` : 'No revisions pending')}
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{scheduleCounts.revised + scheduleCounts.returned}</span>
              {scheduleCounts.revised > 0 && (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {scheduleCounts.revised} Revise
                </span>
              )}
              {scheduleCounts.returned > 0 && (
                <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {scheduleCounts.returned} Return
                </span>
              )}
            </div>
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
                    options: ['Active', 'Inactive', 'Pending'],
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
                    if (dept) setSelectedDepartment(dept)
                  }}
                  className="w-full sm:w-34 min-w-[12rem]"
                />
                <Button
                  type="button"
                  variant="brand"
                  icon={<CalendarIcon className="h-5 w-5" />}
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
          subtitle={`Choose the academic term to review and plot schedules for ${selectedDepartment?.code}.`}
          editablePhases={['Drafting', 'Plotting', 'Revision', 'Final']}
        />

      </div>

      {/* Full Department Edit Schedule Modal Component */}
      <DepartmentEditScheduleModal
        isOpen={isAddScheduleModalOpen}
        onClose={() => setIsAddScheduleModalOpen(false)}
        departmentInfo={selectedDepartment ? { name: selectedDepartment.name, code: selectedDepartment.code, logo: selectedDepartment.logo || '' } : null}
        members={members}
        selectedAcademicYear={selectedAcademicYear}
        selectedSemesterPhase={selectedSemesterPhase}
        editablePhases={['Drafting', 'Plotting', 'Revision', 'Final']}
        hideTitleColumn={true}
        hideAddRemoveButtons={true}
      />

      {/* Instructor Schedule Modal (Opened when clicking a member in DataTable) */}
      <ScheduleModal
        isOpen={isScheduleModalOpen}
        member={selectedMember}
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
