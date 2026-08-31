import { useState, useEffect, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader';
import { DepartmentIcon, PlusIcon, SearchIcon, UsersIcon, TrashIcon, EditIcon, CheckIcon, UserIcon, CalendarIcon, ChevronRightIcon, BuildingIcon, DoorIcon, ClockIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { ScheduleModal } from '../../components/ScheduleModal'
import { DepartmentEditScheduleModal } from '../../components/DepartmentEditScheduleModal'
import { RevisedSchedulesModal } from '../../components/RevisedSchedulesModal'
import { Button } from '../../components/Button'
import { FilterDropdown } from '../../components/FilterDropdown'
import { SummaryCard } from '../../components/SummaryCard'
import { SelectSemesterModal } from '../../components/SelectSemesterModal'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc, limit, getDocs } from 'firebase/firestore'

interface Member {
  id: string
  name: string
  email: string
  role: string
  status: string
  department: string
  joinedDate: string
  avatar: string
  joinedAt?: Date
  membershipId?: string
}

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}


const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function MyDepartmentPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [memberSchedules, setMemberSchedules] = useState<any[]>([])
  const [isMemberScheduleLoading, setIsMemberScheduleLoading] = useState(false)
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editError, setEditError] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  const [removeError, setRemoveError] = useState('')

  const [rooms, setRooms] = useState<{ id: string, code: string, name: string, buildingId: string }[]>([])
  const [buildings, setBuildings] = useState<{ id: string, name: string, code?: string }[]>([])
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false)
  const [isRevisedSchedulesModalOpen, setIsRevisedSchedulesModalOpen] = useState(false)
  // School Year and Semester Selection State
  const [academicYears, setAcademicYears] = useState<any[]>([])
  const [isSchoolYearModalOpen, setIsSchoolYearModalOpen] = useState(false)
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<any>(null)
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: string, phase: string } | null>(null)

  const [deptSchedules, setDeptSchedules] = useState<any[]>([])

  const [currentUserData, setCurrentUserData] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [departmentInfo, setDepartmentInfo] = useState<{ id: string; name: string; code: string; logo: string } | null>(null)
  const [logoError, setLogoError] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [availableInstructors, setAvailableInstructors] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Calculate new members (joined in last 7 days)
  const newMembersCount = members.filter(m => {
    if (!m.joinedAt) return false
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    return m.joinedAt > sevenDaysAgo
  }).length

  // Fetch current user and their department info
  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeDept: (() => void) | null = null
    let unsubscribeAllUsers: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 1. Get current user profile
        unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (userSnap) => {
          if (userSnap.exists()) {
            setCurrentUserData({ id: userSnap.id, ...userSnap.data() })
          }
        })

        // 2. Get current user's membership
        const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid), limit(1))
        unsubscribeMemberships = onSnapshot(membershipQuery, (mSnap) => {
          if (!mSnap.empty) {
            const mData = mSnap.docs[0].data()
            const deptCode = mData.departmentCode
            const role = mData.role
            setCurrentUserRole(role || '')

            if (deptCode) {
              // 3. Fetch department details
              const deptQuery = query(collection(db, 'departments'), where('code', '==', deptCode), limit(1))
              unsubscribeDept = onSnapshot(deptQuery, (deptSnap) => {
                if (!deptSnap.empty) {
                  const deptData = deptSnap.docs[0].data()
                  setDepartmentInfo({
                    id: deptSnap.docs[0].id,
                    name: deptData.name || '',
                    code: deptData.code || '',
                    logo: deptData.logo || ''
                  })
                  setLogoError(false)
                }
              })

              // 4. Fetch all memberships for this department
              const deptMembershipsQuery = query(collection(db, 'memberships'), where('departmentCode', '==', deptCode))

              // 5. Fetch all users to join data
              unsubscribeAllUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
                const usersMap = new Map()
                usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))

                onSnapshot(deptMembershipsQuery, (deptMSnap) => {
                  const fetchedMembers = deptMSnap.docs.map(mDoc => {
                    const memData = mDoc.data()
                    const userData = usersMap.get(memData.userId) || {}
                    return {
                      id: memData.userId,
                      membershipId: mDoc.id,
                      name: userData.fullName || 'No Name',
                      email: userData.email || '',
                      role: memData.role || 'Instructor',
                      status: userData.isActive === false ? 'Inactive' : 'Active',
                      department: memData.departmentCode || '',
                      joinedDate: memData.joinedAt?.toDate ?
                        new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(memData.joinedAt.toDate()) :
                        'N/A',
                      avatar: userData.profilePicture || '',
                      joinedAt: memData.joinedAt?.toDate ? memData.joinedAt.toDate() : null
                    }
                  })
                  setMembers(fetchedMembers)
                  setLoading(false)
                })
              })
            } else {
              setMembers([])
              setDepartmentInfo(null)
              setLoading(false)
            }
          } else {
            setMembers([])
            setDepartmentInfo(null)
            setLoading(false)
          }
        })
      } else {
        setCurrentUserData(null)
        setCurrentUserRole('')
        setMembers([])
        setDepartmentInfo(null)
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeUser) unsubscribeUser()
      if (unsubscribeMemberships) unsubscribeMemberships()
      if (unsubscribeDept) unsubscribeDept()
      if (unsubscribeAllUsers) unsubscribeAllUsers()
    }
  }, [])

  // Fetch available instructors (those without a department)
  useEffect(() => {
    if (!isAddModalOpen) return

    const q = query(
      collection(db, 'memberships'),
      where('role', '==', 'Instructor'),
      where('departmentCode', '==', '')
    )

    const unsubscribe = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))

      onSnapshot(q, (snapshot) => {
        const instructors = snapshot.docs.map(doc => {
          const memData = doc.data()
          const userData = usersMap.get(memData.userId) || {}
          return {
            id: memData.userId,
            membershipId: doc.id,
            name: userData.fullName || 'No Name',
            email: userData.email || '',
            role: memData.role || 'Instructor',
            status: userData.isActive === false ? 'Inactive' : 'Active',
            department: memData.departmentCode || '',
            joinedDate: memData.joinedAt?.toDate ?
              new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(memData.joinedAt.toDate()) :
              'N/A',
            avatar: userData.profilePicture || '',
            joinedAt: memData.joinedAt?.toDate ? memData.joinedAt.toDate() : null
          }
        })
        setAvailableInstructors(instructors)
      })
    })

    return () => unsubscribe()
  }, [isAddModalOpen])


  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const fetchedYears = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      fetchedYears.sort((a: any, b: any) => {
        if (a.isActive && !b.isActive) return -1
        if (!a.isActive && b.isActive) return 1
        return (b.academicYear || '').localeCompare(a.academicYear || '')
      })
      setAcademicYears(fetchedYears)
      const active = fetchedYears.find((y: any) => y.isActive)
      if (active) {
        setSelectedAcademicYear((prev: any) => prev || active)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const fetchedRooms = snapshot.docs.map(doc => ({
        id: doc.id,
        code: doc.data().code,
        name: doc.data().name,
        buildingId: doc.data().buildingId || ''
      }))
      setRooms(fetchedRooms)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'buildings'), (snapshot) => {
      const fetchedBuildings = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        code: doc.data().code || doc.data().name || ''
      }))
      setBuildings(fetchedBuildings)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!departmentInfo?.code) {
      setDeptSchedules([])
      return
    }
    const q = query(
      collection(db, 'schedule'),
      where('department', '==', departmentInfo.code)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => doc.data())
      setDeptSchedules(fetched)
    })
    return () => unsubscribe()
  }, [departmentInfo?.code])


  const filteredMembers = members
    .filter((member) => {
      const matchSearch = [member.name, member.email, member.role, member.status].some((val) =>
        val.toLowerCase().includes(searchTerm.toLowerCase())
      )
      const matchRole = selectedRoles.length === 0 || selectedRoles.includes(member.role)
      const matchStatus = selectedStatuses.length === 0 || selectedStatuses.includes(member.status)
      return matchSearch && matchRole && matchStatus
    })
    .sort((a, b) => {
      if (a.role === 'Dean') return -1
      if (b.role === 'Dean') return 1
      return a.name.localeCompare(b.name)
    })

  const toggleInstructorSelection = (id: string) => {
    setSelectedInstructorIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleAddInstructors = async () => {
    if (!departmentInfo?.code) return

    setIsAdding(true)
    try {
      const promises = availableInstructors
        .filter(i => selectedInstructorIds.includes(i.id))
        .map(i => {
          // Since we added membershipId to the Member interface
          const mId = (i as any).membershipId
          if (mId) {
            return updateDoc(doc(db, 'memberships', mId), {
              departmentCode: departmentInfo.code,
              joinedAt: new Date()
            })
          }
          return Promise.resolve()
        })
      await Promise.all(promises)

      setIsAddModalOpen(false)
      setSelectedInstructorIds([])
    } catch (error) {
      console.error('Error adding instructors:', error)
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemoveMember = (member: Member) => {
    if (member.role === 'Dean') {
      alert('You cannot remove the Dean from the department.')
      return
    }
    setMemberToRemove(member)
    setIsRemoveModalOpen(true)
  }

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return

    setIsRemoving(true)
    setRemoveError('')
    try {
      const mId = (memberToRemove as any).membershipId
      if (mId) {
        const membershipUpdate = updateDoc(doc(db, 'memberships', mId), {
          departmentCode: '',
          joinedAt: new Date()
        })

        const scheduleQuery = query(collection(db, 'schedule'), where('instructorId', '==', mId))
        const scheduleSnapshot = await getDocs(scheduleQuery)

        const scheduleUpdates = scheduleSnapshot.docs.map(scheduleDoc =>
          updateDoc(doc(db, 'schedule', scheduleDoc.id), {
            instructorId: null
          })
        )

        await Promise.all([membershipUpdate, ...scheduleUpdates])
      }
      setIsRemoveModalOpen(false)
      setMemberToRemove(null)
    } catch (error) {
      console.error('Error removing member:', error)
      setRemoveError('Failed to remove member.')
    } finally {
      setIsRemoving(false)
    }
  }

  const handleEditMember = (member: Member) => {
    setEditingMember(member)
    setEditRole(member.role)
    setEditError('')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember || !departmentInfo) return

    setEditError('')
    const isNowProgramHead = editRole === 'Program Head'

    setIsSavingEdit(true)
    try {
      const updates = []
      
      const wasProgramHead = editingMember.role === 'Program Head'

      const deptUpdates: any = {}
      if (wasProgramHead && !isNowProgramHead) deptUpdates.programHead = ''
      if (isNowProgramHead) deptUpdates.programHead = editingMember.id

      if (Object.keys(deptUpdates).length > 0) {
        updates.push(updateDoc(doc(db, 'departments', departmentInfo.id), deptUpdates))
      }

      // Demote current Program Head(s) to Instructor if there are any
      if (isNowProgramHead && !wasProgramHead) {
        const existingProgramHeads = members.filter(m => m.role === 'Program Head' && m.id !== editingMember.id)
        existingProgramHeads.forEach(existingProgramHead => {
          const existingPHId = (existingProgramHead as any).membershipId
          if (existingPHId) {
            updates.push(updateDoc(doc(db, 'memberships', existingPHId), { role: 'Instructor' }))
          }
        })
      }

      const mId = (editingMember as any).membershipId
      if (mId) {
        updates.push(updateDoc(doc(db, 'memberships', mId), { role: editRole }))
      }

      await Promise.all(updates)
      setEditingMember(null)
    } catch (error) {
      console.error(error)
      setEditError('Failed to update member.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }


  const memberColumns: ColumnDef<Member>[] = useMemo(() => {
    const cols: ColumnDef<Member>[] = [
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
                onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar]: true }))}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
                <UserIcon className="h-5 w-5" />
              </div>
            )}
            <div className="flex flex-col">
              {member.name ? (
                <>
                  <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.name}</span>
                  <span className="text-xs font-medium text-slate-500">{member.email}</span>
                </>
              ) : (
                <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">{member.email}</span>
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
        render: (member) => (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton
              label="Edit member"
              onClick={() => handleEditMember(member)}
              disabled={member.id === currentUserData?.id}
              className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${
                member.id === currentUserData?.id
                  ? 'opacity-30 cursor-default text-slate-400'
                  : 'text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5'
              }`}
            >
              <EditIcon className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Remove member"
              disabled={member.id === currentUserData?.id}
              className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${
                member.id === currentUserData?.id
                  ? 'opacity-30 cursor-default text-slate-400'
                  : 'text-rose-500 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5'
              }`}
              onClick={() => handleRemoveMember(member)}
            >
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          </div>
        )
      }
    ];

    return cols;
  }, [currentUserData, avatarErrors]);

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Remove Member Modal */}
      {isRemoveModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Remove Member</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to remove this member from the {departmentInfo?.code || 'the'} department?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden">
                  {memberToRemove.avatar && !avatarErrors[memberToRemove.avatar] ? (
                    <img
                      src={memberToRemove.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarErrors(prev => ({ ...prev, [memberToRemove.avatar]: true }))}
                    />
                  ) : (
                    <UserIcon className="h-7 w-7" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{memberToRemove.name || 'No Name'}</p>
                  <p className="text-xs font-medium text-gray-500">{memberToRemove.email}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will remove them from the <strong>{departmentInfo?.code}</strong> department. This can be undone by adding them back later.
                </p>
              </div>

              {removeError && (
                <p className="text-xs font-bold text-rose-600 text-center animate-in fade-in slide-in-from-top-1">
                  {removeError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsRemoveModalOpen(false)
                    setMemberToRemove(null)
                  }}
                  disabled={isRemoving}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white !border-none !shadow-md"
                  onClick={confirmRemoveMember}
                  disabled={isRemoving}
                >
                  {isRemoving ? 'Removing...' : 'Confirm Remove'}
                </Button>
              </div>
            </div>
          </div>
          <div
            className="absolute inset-0 -z-10"
            onMouseDown={() => {
              if (!isRemoving) {
                setIsRemoveModalOpen(false)
                setMemberToRemove(null)
              }
            }}
          />
        </div>
      )}

      {/* Instructor Schedule Modal */}
      <ScheduleModal
        isOpen={isScheduleModalOpen}
        member={selectedMember ? { ...selectedMember, departmentName: departmentInfo?.name || selectedMember.department } : null}
        initialAcademicYear={selectedAcademicYear?.academicYear}
        initialSemester={selectedSemesterPhase?.name}
        hideReturnedSchedules={true}
        onClose={() => {
          setIsScheduleModalOpen(false)
          setSelectedMember(null)
        }}
      />


      <SelectSemesterModal
        isOpen={isSchoolYearModalOpen}
        onClose={() => {
          setIsSchoolYearModalOpen(false)
          const active = academicYears.find((y: any) => y.isActive)
          if (active) setSelectedAcademicYear(active)
        }}
        academicYears={academicYears}
        selectedAcademicYear={selectedAcademicYear}
        setSelectedAcademicYear={setSelectedAcademicYear}
        onSelectSemester={async (semesterPhase) => {
          setSelectedSemesterPhase(semesterPhase)
          setIsSchoolYearModalOpen(false)

          if (departmentInfo?.code && selectedAcademicYear?.academicYear && semesterPhase?.name) {
            try {
              const qRevise = query(
                collection(db, 'schedule'),
                where('department', '==', departmentInfo.code),
                where('academicYear', '==', selectedAcademicYear.academicYear),
                where('semester', '==', semesterPhase.name)
              )
              const snap = await getDocs(qRevise)
              const hasReviseSchedules = snap.docs.some(d => {
                const data = d.data()
                return data.status === 'Revise' || data.status === 'Revised' || data.status === 'Revising'
              })

              if (hasReviseSchedules) {
                setIsRevisedSchedulesModalOpen(true)
                return
              }
            } catch (err) {
              console.error('Error checking revise schedules:', err)
            }
          }

          setIsAddScheduleModalOpen(true)
        }}
        editablePhases={['Drafting', 'Revision']}
      />

      {/* Revised Schedules Review Modal */}
      <RevisedSchedulesModal
        isOpen={isRevisedSchedulesModalOpen}
        onClose={() => {
          setIsRevisedSchedulesModalOpen(false)
        }}
        onProceedToEdit={() => {
          setIsRevisedSchedulesModalOpen(false)
          setIsAddScheduleModalOpen(true)
        }}
        departmentInfo={departmentInfo}
        members={members}
        selectedAcademicYear={selectedAcademicYear}
        selectedSemesterPhase={selectedSemesterPhase}
      />

      {/* Department Edit Schedule Modal */}
      <DepartmentEditScheduleModal
        isOpen={isAddScheduleModalOpen}
        onClose={() => setIsAddScheduleModalOpen(false)}
        departmentInfo={departmentInfo}
        members={members}
        selectedAcademicYear={selectedAcademicYear}
        selectedSemesterPhase={selectedSemesterPhase}
        editablePhases={['Drafting', 'Revision']}
        hideStatusColumn={true}
        hidePlotAllReadyButton={true}
        showStatusOnNumberColumn={true}
        onlyAllowDraftEditing={true}
      />


      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl relative">
              <button
                onClick={() => !isAdding && setIsAddModalOpen(false)}
                disabled={isAdding}
                className={`absolute right-4 top-4 text-white/70 hover:text-white transition-colors ${isAdding ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <PlusIcon className="h-6 w-6 rotate-45" />
              </button>
              <h3 className="text-xl font-bold">Add Instructors</h3>
              <p className="mt-1 text-sm text-white/80">Select instructors to add to the {departmentInfo?.code || 'your'} department.</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="max-h-[22rem] overflow-y-auto custom-scrollbar space-y-2 pr-2">
                {availableInstructors.length === 0 ? (
                  <p className="py-8 text-center text-sm font-medium text-gray-500">
                    No available instructors found without a department.
                  </p>
                ) : (
                  availableInstructors.map((instructor) => {
                    const isSelected = selectedInstructorIds.includes(instructor.id)
                    return (
                      <button
                        key={instructor.id}
                        type="button"
                        disabled={isAdding}
                        onClick={() => toggleInstructorSelection(instructor.id)}
                        className={`group flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-all ${isSelected
                          ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 shadow-sm'
                          : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-md'
                          } ${isAdding ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        <div className="relative">
                          {instructor.avatar ? (
                            <img
                              src={instructor.avatar}
                              alt={instructor.name}
                              className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-100 text-secondary-500 border border-gray-300">
                              <UserIcon className="h-6 w-6" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-color)] text-white shadow-sm ring-2 ring-white">
                              <CheckIcon className="h-3 w-3" strokeWidth={4} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className={`text-sm font-bold truncate ${isSelected ? 'text-[var(--brand-color)]' : 'text-gray-900'}`}>
                            {instructor.name}
                          </p>
                          <p className="text-xs font-medium text-gray-500 truncate">
                            {instructor.email}
                          </p>
                        </div>
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${isSelected
                          ? 'bg-[var(--brand-color)] border-[var(--brand-color)]'
                          : 'border-gray-300 bg-white group-hover:border-gray-400'
                          }`}>
                          {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={isAdding}
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  className="flex-1"
                  disabled={selectedInstructorIds.length === 0 || isAdding}
                  onClick={handleAddInstructors}
                >
                  {isAdding ? 'Adding...' : `Add ${selectedInstructorIds.length > 0 ? `(${selectedInstructorIds.length})` : ''} to Dept`}
                </Button>
              </div>
            </div>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => !isAdding && setIsAddModalOpen(false)} />
        </div>
      )}

      <div className="space-y-6">
        <SectionHeader
          title="My Department"
          description="Overview of your department's members, rooms, and activity."
        />
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mb-6">
          {(() => {
            const totalMembers = members.length;
            const activeCount = members.filter(m => m.status === 'Active').length;
            const deanCount = members.filter(m => m.role === 'Dean').length;
            const programHeadCount = members.filter(m => m.role === 'Program Head').length;
            const instructorCount = members.filter(m => m.role === 'Instructor').length;

            const roleStats = [
              { label: 'Dean', count: deanCount, color: 'bg-amber-400' },
              { label: 'Prog. Head', count: programHeadCount, color: 'bg-rose-400' },
              { label: 'Instructor', count: instructorCount, color: 'bg-emerald-400' },
            ];

            const DAY_FULL_NAMES: Record<string, string> = {
              Mon: 'Monday',
              Tue: 'Tuesday',
              Wed: 'Wednesday',
              Thu: 'Thursday',
              Fri: 'Friday',
              Sat: 'Saturday',
              Sun: 'Sunday'
            };

            const DAY_ORDER: Record<string, number> = {
              Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
            };

            const dayCounts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
            deptSchedules.forEach(s => {
              if (Array.isArray(s.days)) {
                s.days.forEach((day: string) => {
                  if (dayCounts[day] !== undefined) {
                    dayCounts[day] += 1;
                  }
                });
              }
            });

            const sortedDaysMonSun = Object.entries(dayCounts)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => (DAY_ORDER[a[0]] || 99) - (DAY_ORDER[b[0]] || 99));

            const topScheduleDays = sortedDaysMonSun.length > 0
              ? sortedDaysMonSun.slice(0, 3).map(([day, count]) => ({
                day,
                count,
                label: DAY_FULL_NAMES[day] || day
              }))
              : [
                { day: 'Mon', count: 0, label: 'Monday' },
                { day: 'Wed', count: 0, label: 'Wednesday' },
                { day: 'Fri', count: 0, label: 'Friday' }
              ];

            const deptBuildingIds = Array.from(new Set(
              deptSchedules.flatMap(s => {
                const bIds: string[] = []
                if (s.buildingId) bIds.push(s.buildingId)
                if (s.buildingId2) bIds.push(s.buildingId2)
                if (s.roomId) {
                  const r = rooms.find(room => room.id === s.roomId)
                  if (r?.buildingId) bIds.push(r.buildingId)
                }
                if (s.roomId2) {
                  const r = rooms.find(room => room.id === s.roomId2)
                  if (r?.buildingId) bIds.push(r.buildingId)
                }
                return bIds
              }).filter(Boolean)
            ))

            const deptBuildings = deptBuildingIds
              .map(bId => buildings.find(b => b.id === bId))
              .filter(Boolean) as { id: string; name: string }[]

            const displayBuildings = deptBuildings.length > 0 ? deptBuildings : buildings.slice(0, 2)

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
                <SummaryCard
                  title="Card 1"
                  subtitle="Subtitle 1"
                  icon={<UsersIcon className="w-4.5 h-4.5 text-white" />}
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
                  icon={<BuildingIcon className="w-4.5 h-4.5 text-white" />}
                  gradientClasses="from-blue-400 to-indigo-500"
                  blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
                />
              </div>
            );
          })()}
        </div>



        <DataTable<Member>
          data={filteredMembers}
          columns={memberColumns}
          onRowClick={handleRowClick}
          searchPlaceholder="Search members..."
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
          emptyTitle={loading ? "Loading..." : "No members found"}
          emptyDescription={loading ? 'Loading members...' : 'No members found matching your search.'}
          primaryAction={
            <div className="flex gap-2">
              {(currentUserRole === 'Dean' || currentUserRole === 'Admin' || currentUserRole === 'Program Head') && (
                <Button
                  type="button"
                  variant="outline"
                  icon={<CalendarIcon className="h-5 w-5" />}
                  onClick={() => {
                    const active = academicYears.find((y: any) => y.isActive)
                    if (active) setSelectedAcademicYear(active)
                    setIsSchoolYearModalOpen(true)
                  }}
                >
                  Manage Schedule
                </Button>
              )}
              <Button
                type="button"
                variant="brand"
                icon={<PlusIcon className="h-5 w-5" />}
                onClick={() => setIsAddModalOpen(true)}
              >
                Add Instructor
              </Button>
            </div>
          }
        />
      </div>
      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Edit Member</h3>
              <p className="mt-1 text-sm text-white/80">Update role for {editingMember.name || editingMember.email}.</p>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div className="flex flex-col gap-5">
                <div>
                  <label htmlFor="edit-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Role
                  </label>
                  {editError && (
                    <span className="text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1 block mb-2">
                      {editError}
                    </span>
                  )}
                  <SingleSelectDropdown
                    options={['Program Head', 'Instructor']}
                    value={editRole}
                    onChange={(val) => {
                      setEditRole(val)
                      setEditError('')
                    }}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMember(null)}
                  disabled={isSavingEdit}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSavingEdit}
                  className="flex-1"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isSavingEdit) setEditingMember(null)
            }} 
          />
        </div>
      )}

    </section>
  )
}

export default MyDepartmentPage

