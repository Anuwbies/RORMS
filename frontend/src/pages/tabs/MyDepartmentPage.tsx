import { useState, useEffect } from 'react'
import { DepartmentIcon, PlusIcon, SearchIcon, UsersIcon, TrashIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc, limit, addDoc, serverTimestamp } from 'firebase/firestore'

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
  Instructor: 'bg-emerald-100 text-emerald-700',
}

const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-gray-100 text-gray-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function MyDepartmentPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  const [removeError, setRemoveError] = useState('')
  
  const [rooms, setRooms] = useState<{id: string, code: string, name: string, buildingId: string}[]>([])
  const [buildings, setBuildings] = useState<{id: string, name: string}[]>([])
  const [isBulkScheduleModalOpen, setIsBulkScheduleModalOpen] = useState(false)
  
  const defaultSchedule = {
    instructorId: '',
    type: 'normal',
    subjectCode: '',
    subjectTitle: '',
    classSection: '',
    faculty: 'Lec',
    startTime: '',
    endTime: '',
    days: [] as string[],
    buildingId: '',
    roomId: ''
  }
  const [bulkSchedules, setBulkSchedules] = useState([defaultSchedule])
  const [isSubmittingBulkSchedules, setIsSubmittingBulkSchedules] = useState(false)

  const [currentUserData, setCurrentUserData] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [departmentInfo, setDepartmentInfo] = useState<{ name: string; code: string; logo: string } | null>(null)
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
        name: doc.data().name
      }))
      setBuildings(fetchedBuildings)
    })
    return () => unsubscribe()
  }, [])

  const filteredMembers = members
    .filter((member) =>
      [member.name, member.email, member.role, member.status].some((val) =>
        val.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
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
        await updateDoc(doc(db, 'memberships', mId), {
          departmentCode: '',
          joinedAt: new Date()
        })
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

  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }

  const handleBulkScheduleChange = (index: number, field: string, value: any) => {
    setBulkSchedules(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleBulkToggleDay = (index: number, day: string) => {
    setBulkSchedules(prev => {
      const updated = [...prev]
      const currentDays = updated[index].days
      updated[index] = { 
        ...updated[index], 
        days: currentDays.includes(day) ? currentDays.filter(d => d !== day) : [...currentDays, day] 
      }
      return updated
    })
  }

  const handleRemoveBulkSchedule = (index: number) => {
    setBulkSchedules(prev => prev.filter((_, i) => i !== index))
  }

  const handleDropdownPosition = (e: React.MouseEvent<HTMLElement>) => {
    const summary = e.currentTarget;
    const rect = summary.getBoundingClientRect();
    const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement;
    if (dropdown) {
      if (window.innerHeight - rect.bottom < 300) {
        dropdown.style.top = 'auto';
        dropdown.style.bottom = '100%';
        dropdown.style.marginTop = '0';
        dropdown.style.marginBottom = '4px';
      } else {
        dropdown.style.top = '100%';
        dropdown.style.bottom = 'auto';
        dropdown.style.marginTop = '4px';
        dropdown.style.marginBottom = '0';
      }
    }
  }

  const handleSaveBulkSchedules = async () => {
    const validSchedules = bulkSchedules.filter(s => s.instructorId && s.roomId && s.days.length > 0 && s.subjectCode)
    if (validSchedules.length === 0) return

    setIsSubmittingBulkSchedules(true)
    try {
      const promises = validSchedules.map((schedule) => {
        return addDoc(collection(db, 'schedule'), {
          ...schedule,
          department: departmentInfo?.code || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      })
      await Promise.all(promises)
      setIsBulkScheduleModalOpen(false)
      setBulkSchedules([defaultSchedule])
    } catch (error) {
      console.error("Error saving bulk schedules:", error)
    } finally {
      setIsSubmittingBulkSchedules(false)
    }
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Remove Member Modal */}
      {isRemoveModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Remove Member</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to remove this member from the {departmentInfo?.code || 'the'} department?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
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

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
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
                <button
                  type="button"
                  onClick={() => {
                    setIsRemoveModalOpen(false)
                    setMemberToRemove(null)
                  }}
                  disabled={isRemoving}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmRemoveMember}
                  disabled={isRemoving}
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRemoving ? 'Removing...' : 'Confirm Remove'}
                </button>
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

      {/* Schedule Modal */}
      {isScheduleModalOpen && selectedMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-2xl rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md relative">
              <button 
                onClick={() => setIsScheduleModalOpen(false)}
                className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
              >
                <PlusIcon className="h-6 w-6 rotate-45" />
              </button>
              <h3 className="text-xl font-bold">{selectedMember.name}'s Schedule</h3>
              <p className="mt-1 text-sm text-white/80">Instructor schedule overview and availability.</p>
            </div>
            
            <div className="p-6">
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center border border-gray-300">
                  <SearchIcon className="h-8 w-8 text-gray-300" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">No Schedule Data</h4>
                  <p className="text-sm text-gray-500 max-w-xs mx-auto">
                    The schedule for this instructor is currently empty or has not been set yet.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setIsScheduleModalOpen(false)} />
        </div>
      )}

      {/* Bulk Add Schedule Modal */}
      {isBulkScheduleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-[95vw] max-w-[95vw] max-h-[90vh] min-h-[60vh] flex flex-col rounded-md border border-gray-200 bg-gray-50 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-4 text-white rounded-t-md shrink-0">
              <button 
                onClick={() => setIsBulkScheduleModalOpen(false)}
                className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
              >
                <PlusIcon className="h-6 w-6 rotate-45" />
              </button>
              <h3 className="text-xl font-bold">Bulk Add Schedules</h3>
              <p className="mt-1 text-sm text-white/80">Add multiple schedules and assign them to instructors in your department.</p>
            </div>
            
            <div className="px-4 py-0 flex-1 overflow-scroll">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-collapse">
                <thead className="bg-white sticky top-0 z-20 border-b-2 border-gray-200 text-gray-700 font-bold">
                  <tr>
                    <th className="p-2 border-b border-r border-gray-200">Instructor <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200">Type</th>
                    <th className="p-2 border-b border-r border-gray-200">Faculty</th>
                    <th className="p-2 border-b border-r border-gray-200 w-32">Subject Code <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200 w-32">Section</th>
                    <th className="p-2 border-b border-r border-gray-200 w-48">Subject Title</th>
                    <th className="p-2 border-b border-r border-gray-200 w-24">Start Time <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200 w-24">End Time <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200 w-40">Days <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200">Building <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b border-r border-gray-200">Room <span className="text-rose-500">*</span></th>
                    <th className="p-2 border-b text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {bulkSchedules.map((schedule, index) => {
                    const availableRooms = schedule.buildingId ? rooms.filter(r => r.buildingId === schedule.buildingId) : rooms;
                    
                    return (
                    <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details className="w-full min-w-[160px] relative h-full group">
                          <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.instructorId ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate">{members.find(m => m.membershipId === schedule.instructorId)?.name || '\u00A0'}</span>
                          </summary>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                          <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded min-w-full max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full`}>
                            {members.map(m => (
                              <button
                                key={m.membershipId}
                                type="button"
                                onClick={(e) => {
                                  handleBulkScheduleChange(index, 'instructorId', m.membershipId)
                                  e.currentTarget.closest('details')?.removeAttribute('open')
                                }}
                                className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate"
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details className="w-full min-w-[90px] relative h-full group">
                          <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.type ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate">{schedule.type ? schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1) : '\u00A0'}</span>
                          </summary>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                          <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded min-w-full`}>
                            {['normal', 'open lab', 'parallel'].map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={(e) => {
                                  handleBulkScheduleChange(index, 'type', opt)
                                  e.currentTarget.closest('details')?.removeAttribute('open')
                                }}
                                className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate"
                              >
                                {opt.charAt(0).toUpperCase() + opt.slice(1)}
                              </button>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details className="w-full min-w-[70px] relative h-full group">
                          <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.faculty ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate">{schedule.faculty || '\u00A0'}</span>
                          </summary>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                          <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded min-w-full`}>
                            {['Lec', 'Lab'].map(opt => (
                              <button
                                key={opt}
                                type="button"
                                onClick={(e) => {
                                  handleBulkScheduleChange(index, 'faculty', opt)
                                  e.currentTarget.closest('details')?.removeAttribute('open')
                                }}
                                className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate"
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="p-0 border-r border-gray-200 relative">
                        <input 
                          type="text" 
                          placeholder="ITE 298"
                          value={schedule.subjectCode}
                          onChange={(e) => handleBulkScheduleChange(index, 'subjectCode', e.target.value)}
                          className={`h-full w-full min-h-[44px] min-w-[100px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.subjectCode ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className="p-0 border-r border-gray-200 relative">
                        <input 
                          type="text" 
                          placeholder="BSIT 3-1"
                          value={schedule.classSection}
                          onChange={(e) => handleBulkScheduleChange(index, 'classSection', e.target.value)}
                          className={`h-full w-full min-h-[44px] min-w-[90px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.classSection ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className="p-0 border-r border-gray-200 relative">
                        <input 
                          type="text" 
                          placeholder="IT Project Mgmt"
                          value={schedule.subjectTitle}
                          onChange={(e) => handleBulkScheduleChange(index, 'subjectTitle', e.target.value)}
                          className={`h-full w-full min-h-[44px] min-w-[150px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.subjectTitle ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className="p-0 border-r border-gray-200 relative">
                        <input 
                          type="time" 
                          value={schedule.startTime}
                          onChange={(e) => handleBulkScheduleChange(index, 'startTime', e.target.value)}
                          className={`h-full w-full min-h-[44px] min-w-[90px] [&::-webkit-calendar-picker-indicator]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.startTime ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                        />
                      </td>
                      <td className="p-0 border-r border-gray-200 relative">
                        <input 
                          type="time" 
                          value={schedule.endTime}
                          onChange={(e) => handleBulkScheduleChange(index, 'endTime', e.target.value)}
                          className={`h-full w-full min-h-[44px] min-w-[90px] [&::-webkit-calendar-picker-indicator]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.endTime ? 'text-gray-900 font-medium' : 'text-gray-500'}`}
                        />
                      </td>
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details className="w-full min-w-[140px] relative h-full group">
                          <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.days.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate max-w-[100px]">
                              {schedule.days.length > 0 ? schedule.days.join(', ') : '\u00A0'}
                            </span>
                          </summary>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                          <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-2 flex flex-col gap-2 rounded min-w-full`}>
                            {[
                              { short: 'Mon', full: 'Monday' },
                              { short: 'Tue', full: 'Tuesday' },
                              { short: 'Wed', full: 'Wednesday' },
                              { short: 'Thu', full: 'Thursday' },
                              { short: 'Fri', full: 'Friday' },
                              { short: 'Sat', full: 'Saturday' },
                              { short: 'Sun', full: 'Sunday' }
                            ].map(day => (
                              <label key={day.short} className="flex items-center gap-2 text-sm font-medium cursor-pointer relative z-50 shrink-0">
                                <input 
                                  type="checkbox" 
                                  checked={schedule.days.includes(day.short)}
                                  onChange={() => handleBulkToggleDay(index, day.short)} 
                                  className="rounded text-[var(--brand-color)] focus:ring-[var(--brand-color)]"
                                />
                                {day.full}
                              </label>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details className="w-full min-w-[120px] relative h-full group">
                          <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.buildingId ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate">{buildings.find(b => b.id === schedule.buildingId)?.name || '\u00A0'}</span>
                          </summary>
                          <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                          <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded min-w-full max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full`}>
                            {buildings.map(b => (
                                <button
                                key={b.id}
                                type="button"
                                onClick={(e) => {
                                  handleBulkScheduleChange(index, 'buildingId', b.id)
                                  handleBulkScheduleChange(index, 'roomId', '')
                                  e.currentTarget.closest('details')?.removeAttribute('open')
                                }}
                                className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate shrink-0"
                              >
                                {b.name}
                              </button>
                            ))}
                          </div>
                        </details>
                      </td>
                      <td className="p-0 border-r border-gray-200 relative align-middle">
                        <details 
                          className="w-full min-w-[120px] relative h-full group"
                          onClick={(e) => {
                            if (!schedule.buildingId) e.preventDefault();
                          }}
                        >
                          <summary onClick={(e) => { handleDropdownPosition(e); }} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${!schedule.buildingId ? 'opacity-50 cursor-not-allowed text-gray-400' : schedule.roomId ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                            <span className="truncate">{schedule.buildingId ? (rooms.find(r => r.id === schedule.roomId)?.code || '\u00A0') : 'Select Building'}</span>
                          </summary>
                          {schedule.buildingId && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded min-w-full max-h-48 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full`}>
                                {availableRooms.length === 0 ? (
                                  <div className="px-2 py-1.5 text-sm text-gray-400">No rooms</div>
                                ) : (
                                  availableRooms.map(room => (
                                    <button
                                      key={room.id}
                                      type="button"
                                      onClick={(e) => {
                                        handleBulkScheduleChange(index, 'roomId', room.id)
                                        e.currentTarget.closest('details')?.removeAttribute('open')
                                      }}
                                      className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate shrink-0"
                                    >
                                      {room.code}
                                    </button>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </details>
                      </td>
                      <td className="p-2 text-center relative">
                        {bulkSchedules.length > 1 && (
                          <button 
                            type="button"
                            onClick={() => handleRemoveBulkSchedule(index)}
                            className="text-gray-400 hover:text-rose-500 transition-colors p-1"
                            title="Remove Row"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between gap-3 shrink-0 rounded-b-md">
              <button
                type="button"
                onClick={() => setBulkSchedules([...bulkSchedules, defaultSchedule])}
                className="rounded border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-500 hover:border-[var(--brand-color)] hover:text-[var(--brand-color)] transition-colors flex items-center justify-center gap-1"
              >
                <PlusIcon className="h-4 w-4" />
                Add Row
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsBulkScheduleModalOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingBulkSchedules}
                  onClick={handleSaveBulkSchedules}
                  className="rounded-md bg-[var(--brand-color)] px-6 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:bg-[var(--brand-color-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingBulkSchedules ? 'Saving...' : `Save All`}
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => !isSubmittingBulkSchedules && setIsBulkScheduleModalOpen(false)} />
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md relative">
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
              <div className="max-h-[352px] overflow-y-auto custom-scrollbar space-y-2 pr-2">
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
                        className={`group flex w-full items-center gap-4 rounded-md border p-3 text-left transition-all ${
                          isSelected 
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
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected 
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
                <button
                  type="button"
                  disabled={isAdding}
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedInstructorIds.length === 0 || isAdding}
                  onClick={handleAddInstructors}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[var(--brand-color-hover)] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--brand-color)] flex items-center justify-center gap-2"
                >
                  {isAdding ? 'Adding...' : `Add ${selectedInstructorIds.length > 0 ? `(${selectedInstructorIds.length})` : ''} to Dept`}
                </button>
              </div>
            </div>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => !isAdding && setIsAddModalOpen(false)} />
        </div>
      )}

      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              My Department
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Overview of your department's members, rooms, and activity.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2 rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className={`flex h-14 w-14 items-center justify-center overflow-hidden border border-gray-200 shrink-0 ${departmentInfo?.logo && !logoError ? 'rounded-full' : 'rounded-md'}`}>
                  {departmentInfo?.logo && !logoError ? (
                    <img 
                      src={departmentInfo.logo} 
                      alt={departmentInfo.name}
                      className="h-full w-full object-cover"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-blue-50 border border-blue-100">
                      <DepartmentIcon className="h-9 w-9 text-blue-600" />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-3xl font-bold text-gray-900 leading-tight">
                    {loading ? 'Loading...' : (departmentInfo?.name || 'No Department Assigned')}
                  </p>
                  {departmentInfo?.code && (
                    <span className="flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[16px] font-black uppercase tracking-widest text-gray-500 shadow-sm">
                      <span className="mr-[-0.1em]">{departmentInfo.code}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <UsersIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Department Members</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{members.length}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-green-50 border border-green-100 shrink-0">
                  <PlusIcon className="h-9 w-9 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">New (Last 7D)</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{newMembersCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end mb-[-1rem]">
          <h3 className="text-xl font-bold text-gray-900"></h3>
          {(currentUserRole === 'Dean' || currentUserRole === 'Admin') && (
            <button
              onClick={() => setIsBulkScheduleModalOpen(true)}
              className="rounded-md bg-[var(--brand-color)] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[var(--brand-color-hover)] transition"
            >
              Add Schedules
            </button>
          )}
        </div>

        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search members..."
          primaryButton={currentUserRole === 'Dean' ? {
            label: "Add Instructor",
            onClick: () => setIsAddModalOpen(true)
          } : undefined}
        />

        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[30%]">
                    Member
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Joined Date
                  </th>
                  {currentUserRole === 'Dean' && (
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={currentUserRole === 'Dean' ? 5 : 4} className="px-6 py-12 text-center text-gray-500">
                      {loading ? 'Loading members...' : 'No members found matching your search.'}
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr 
                      key={member.id} 
                      onClick={() => handleRowClick(member)}
                      className="transition hover:bg-gray-50/50 cursor-pointer"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-4">
                          {member.avatar ? (
                            <img
                              src={member.avatar}
                              alt={member.name}
                              className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-100 text-secondary-500 border border-gray-300">
                              <UserIcon className="h-6 w-6" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-bold text-gray-900">{member.name}</p>
                            <p className="text-xs font-medium text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roleClasses[member.role] || 'bg-gray-100 text-gray-700'}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClasses[member.status] || 'bg-gray-100 text-gray-700'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-600">
                        {member.joinedDate}
                      </td>
                      {currentUserRole === 'Dean' && (
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <IconButton
                              label="Remove member"
                              disabled={member.id === currentUserData?.id}
                              className={`h-8 w-8 rounded-md bg-white shadow-sm transition-all border border-gray-100 ${
                                member.id === currentUserData?.id 
                                  ? 'text-gray-300 cursor-not-allowed opacity-50' 
                                  : 'text-rose-400 hover:bg-rose-50 hover:text-rose-600'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveMember(member)
                              }}
                            >
                              <TrashIcon className="h-4.5 w-4.5" />
                            </IconButton>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MyDepartmentPage
