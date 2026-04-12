import { useState, useEffect } from 'react'
import { DepartmentIcon, PlusIcon, SearchIcon, UsersIcon, TrashIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc, limit } from 'firebase/firestore'

interface Member {
  id: string
  name: string
  email: string
  role: string
  status: string
  department: string
  joinedDate: string
  avatar: string
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
  
  const [currentUserData, setCurrentUserData] = useState<any>(null)
  const [departmentInfo, setDepartmentInfo] = useState<{ name: string; code: string; logo: string } | null>(null)
  const [logoError, setLogoError] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [availableInstructors, setAvailableInstructors] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Fetch current user and their department info
  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null
    let unsubscribeMembers: (() => void) | null = null
    let unsubscribeDept: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (userSnap) => {
          if (userSnap.exists()) {
            const userData = userSnap.data()
            setCurrentUserData({ id: userSnap.id, ...userData })
            
            if (userData.department) {
              // Fetch department details
              const deptQuery = query(collection(db, 'departments'), where('code', '==', userData.department), limit(1))
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

              // Fetch department members
              const membersQuery = query(collection(db, 'users'), where('department', '==', userData.department))
              unsubscribeMembers = onSnapshot(membersQuery, (membersSnap) => {
                const fetchedMembers = membersSnap.docs.map(doc => {
                  const data = doc.data()
                  return {
                    id: doc.id,
                    name: data.fullName || 'No Name',
                    email: data.email || '',
                    role: data.role || 'Instructor',
                    status: data.isActive === false ? 'Inactive' : 'Active',
                    department: data.department || '',
                    joinedDate: data.createdAt?.toDate ? 
                      new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(data.createdAt.toDate()) : 
                      'N/A',
                    avatar: data.profilePicture || ''
                  }
                })
                setMembers(fetchedMembers)
                setLoading(false)
              })
            } else {
              setMembers([])
              setDepartmentInfo(null)
              setLoading(false)
            }
          }
        })
      } else {
        setCurrentUserData(null)
        setMembers([])
        setDepartmentInfo(null)
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeUser) unsubscribeUser()
      if (unsubscribeMembers) unsubscribeMembers()
      if (unsubscribeDept) unsubscribeDept()
    }
  }, [])

  // Fetch available instructors (those without a department)
  useEffect(() => {
    if (!isAddModalOpen) return

    const q = query(
      collection(db, 'users'), 
      where('role', '==', 'Instructor'),
      where('department', '==', '')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const instructors = snapshot.docs.map(doc => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.fullName || 'No Name',
          email: data.email || '',
          role: data.role || 'Instructor',
          status: data.isActive === false ? 'Inactive' : 'Active',
          department: data.department || '',
          joinedDate: data.createdAt?.toDate ? 
            new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(data.createdAt.toDate()) : 
            'N/A',
          avatar: data.profilePicture || ''
        }
      })
      setAvailableInstructors(instructors)
    })

    return () => unsubscribe()
  }, [isAddModalOpen])

  const filteredMembers = members.filter((member) =>
    [member.name, member.email, member.role, member.status].some((val) =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const toggleInstructorSelection = (id: string) => {
    setSelectedInstructorIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleAddInstructors = async () => {
    if (!currentUserData?.department) return

    setIsAdding(true)
    try {
      const promises = selectedInstructorIds.map(id => 
        updateDoc(doc(db, 'users', id), {
          department: currentUserData.department,
          updatedAt: new Date()
        })
      )
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
    try {
      await updateDoc(doc(db, 'users', memberToRemove.id), {
        department: '',
        updatedAt: new Date()
      })
      setIsRemoveModalOpen(false)
      setMemberToRemove(null)
    } catch (error) {
      console.error('Error removing member:', error)
    } finally {
      setIsRemoving(false)
    }
  }

  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--brand-surface)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-color)] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Remove Member Confirmation Modal */}
      {isRemoveModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md relative">
              <button 
                onClick={() => !isRemoving && setIsRemoveModalOpen(false)}
                disabled={isRemoving}
                className={`absolute right-4 top-4 text-white/70 hover:text-white transition-colors ${isRemoving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <PlusIcon className="h-6 w-6 rotate-45" />
              </button>
              <h3 className="text-xl font-bold">Remove Member</h3>
              <p className="mt-1 text-sm text-white/80">Confirm removal of member from {departmentInfo?.code || 'the'} department.</p>
            </div>
            
            <div className="p-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  {memberToRemove.avatar ? (
                    <img
                      src={memberToRemove.avatar}
                      alt={memberToRemove.name}
                      className={`h-20 w-20 rounded-full border-4 border-gray-100 object-cover shadow-sm ${isRemoving ? 'opacity-50' : ''}`}
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-gray-400 border-4 border-gray-50 shadow-sm">
                      <UserIcon className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">{memberToRemove.name}</h4>
                  <p className="text-sm text-gray-500 font-medium">{memberToRemove.email}</p>
                </div>
                <div className="w-full rounded-md bg-rose-50 p-4 border border-rose-100">
                  <p className="text-sm text-rose-700 font-medium">
                    Are you sure you want to remove this member from the <strong>{departmentInfo?.code}</strong> department? This action can be undone by adding them back later.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={() => setIsRemoveModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRemoving}
                  onClick={confirmRemoveMember}
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-600 flex items-center justify-center gap-2"
                >
                  {isRemoving ? 'Removing...' : 'Remove Member'}
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => !isRemoving && setIsRemoveModalOpen(false)} />
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
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--brand-color)] flex items-center justify-center gap-2"
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
                    {departmentInfo?.name || 'No Department Assigned'}
                  </p>
                  {departmentInfo?.code && (
                    <span className="flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[16px] font-black uppercase tracking-widest text-gray-500 shadow-sm">
                      <span className="mr-[-0.1em]">{departmentInfo.code}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-green-50 border border-green-100 shrink-0">
                  <UsersIcon className="h-9 w-9 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Department Members</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{members.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-gray-200 bg-gray-50/50 p-5 shadow-md">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search members..."
                className="w-full rounded-md border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
              />
            </div>

            {currentUserData?.role === 'Dean' && (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
              >
                <PlusIcon className="h-5 w-5" />
                Add Instructor
              </button>
            )}
          </div>
        </div>

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
                  {currentUserData?.role === 'Dean' && (
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={currentUserData?.role === 'Dean' ? 5 : 4} className="px-6 py-12 text-center text-gray-500">
                      No members found matching your search.
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
                      {currentUserData?.role === 'Dean' && (
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
