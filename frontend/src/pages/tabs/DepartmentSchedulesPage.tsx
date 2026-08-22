import { useState, useEffect, useMemo } from 'react'
import { 
  CalendarIcon, 
  ChevronRightIcon,
  ClockIcon, 
  EditIcon, 
  UserIcon, 
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

const phaseClasses: Record<string, string> = {
  Drafting: 'bg-blue-50 text-blue-700 border-blue-200',
  Plotting: 'bg-amber-50 text-amber-700 border-amber-200',
  Revision: 'bg-purple-50 text-purple-700 border-purple-200',
  Final: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-gray-50 text-gray-600 border-gray-200'
}

const formatShortMonth = (dateStr?: string) => {
  if (!dateStr) return ''
  return dateStr
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
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: '1st Semester' | '2nd Semester'; phase: string }>({
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
            const stillExists = fetched.find(d => d.id === prev.id || d.code === prev.code)
            if (stillExists) return stillExists
          }
          const citeDept = fetched.find(d => d.code?.toUpperCase() === 'CITE')
          return citeDept || fetched[0]
        })
      }
    })

    return () => {
      unsubDepts()
    }
  }, [])

  // 3. Fetch Members for Selected Department
  useEffect(() => {
    if (!selectedDepartment?.code) {
      setMembers([])
      setLoadingMembers(false)
      return
    }

    setLoadingMembers(true)
    const qMemberships = query(
      collection(db, 'memberships'),
      where('departmentCode', '==', selectedDepartment.code)
    )

    const unsubUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(u => usersMap.set(u.id, u.data()))

      onSnapshot(qMemberships, (mSnap) => {
        const fetched = mSnap.docs.map(doc => {
          const data = doc.data()
          const u = usersMap.get(data.userId) || {}
          return {
            id: data.userId,
            membershipId: doc.id,
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
    })

    return () => unsubUsers()
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
            onClick={() => {}}
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
            title="Card 1"
            subtitle="Subtitle 1"
            icon={<UserIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          />
          <SummaryCard
            title="Card 2"
            subtitle="Subtitle 2"
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          />
          <SummaryCard
            title="Card 3"
            subtitle="Subtitle 3"
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-400 to-indigo-500"
            blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
          />
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
                  className="w-full sm:w-48 min-w-[12rem]"
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
        {isSchoolYearModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div
              className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
                <h3 className="text-xl font-bold">Select School Year & Semester</h3>
                <p className="mt-1 text-sm text-white/80">
                  Choose the academic term to review and plot schedules for {selectedDepartment?.code}.
                </p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    School Year <span className="text-rose-500">*</span>
                  </label>
                  <SingleSelectDropdown
                    value={selectedAcademicYear?.academicYear || ''}
                    options={[...academicYears].sort((a: any, b: any) => {
                      if (a.isActive && !b.isActive) return -1
                      if (!a.isActive && b.isActive) return 1
                      return (b.academicYear || '').localeCompare(a.academicYear || '')
                    }).map(y => y.academicYear)}
                    onChange={(val) => setSelectedAcademicYear(academicYears.find(y => y.academicYear === val) || null)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">
                    Select Semester <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1st Semester Card */}
                    {(() => {
                      const sem1Phase = selectedAcademicYear?.sem1?.phase || 'Closed'
                      const sem1Start = selectedAcademicYear?.sem1?.startMonth
                      const sem1End = selectedAcademicYear?.sem1?.endMonth
                      const sem1Dates = sem1Start && sem1End ? `${formatShortMonth(sem1Start)} - ${formatShortMonth(sem1End)}` : ''

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSemesterPhase({ name: '1st Semester', phase: sem1Phase })
                            setIsSchoolYearModalOpen(false)
                            setIsAddScheduleModalOpen(true)
                          }}
                          disabled={!selectedAcademicYear}
                          className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-[var(--brand-color)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                                  <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                                    1st Semester
                                  </h4>
                                  {sem1Dates && (
                                    <p className="text-xs font-medium text-gray-500">{sem1Dates}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                                <ChevronRightIcon className="h-4 w-4" />
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem1Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {sem1Phase}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Plot Rooms
                            </span>
                          </div>
                        </button>
                      )
                    })()}

                    {/* 2nd Semester Card */}
                    {(() => {
                      const sem2Phase = selectedAcademicYear?.sem2?.phase || 'Closed'
                      const sem2Start = selectedAcademicYear?.sem2?.startMonth
                      const sem2End = selectedAcademicYear?.sem2?.endMonth
                      const sem2Dates = sem2Start && sem2End ? `${formatShortMonth(sem2Start)} - ${formatShortMonth(sem2End)}` : ''

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSemesterPhase({ name: '2nd Semester', phase: sem2Phase })
                            setIsSchoolYearModalOpen(false)
                            setIsAddScheduleModalOpen(true)
                          }}
                          disabled={!selectedAcademicYear}
                          className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-[var(--brand-color)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                                  <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                                    2nd Semester
                                  </h4>
                                  {sem2Dates && (
                                    <p className="text-xs font-medium text-gray-500">{sem2Dates}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                                <ChevronRightIcon className="h-4 w-4" />
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem2Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {sem2Phase}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Plot Rooms
                            </span>
                          </div>
                        </button>
                      )
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsSchoolYearModalOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 -z-10" onMouseDown={() => setIsSchoolYearModalOpen(false)} />
          </div>
        )}

      </div>

      {/* Full Department Edit Schedule Modal Component */}
      <DepartmentEditScheduleModal
        isOpen={isAddScheduleModalOpen}
        onClose={() => setIsAddScheduleModalOpen(false)}
        departmentInfo={selectedDepartment ? { name: selectedDepartment.name, code: selectedDepartment.code, logo: selectedDepartment.logo || '' } : null}
        members={members}
        selectedAcademicYear={selectedAcademicYear}
        selectedSemesterPhase={selectedSemesterPhase}
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
