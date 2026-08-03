import { useState, useEffect } from 'react'
import { DepartmentIcon, PlusIcon, SearchIcon, UsersIcon, TrashIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, updateDoc, limit, addDoc, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore'

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

const InnerDropdown = ({ value, onChange, options, disabled = false, placeholder = "Select" }: { value: string, onChange: (val: string) => void, options: {value: string, label: string}[], disabled?: boolean, placeholder?: string }) => {
  return (
    <details className="relative w-full group">
      <summary 
        onClick={(e) => {
          if (disabled) e.preventDefault();
          else {
            const summary = e.currentTarget;
            const rect = summary.getBoundingClientRect();
            const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement;
            if (dropdown) {
              if (window.innerHeight - rect.bottom < 200) {
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
        }}
        className={`w-full p-2 border border-gray-300 rounded text-sm focus:outline-none bg-white list-none [&::-webkit-details-marker]:hidden flex items-center justify-between ${disabled ? 'bg-gray-100 cursor-default text-gray-500' : 'focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] cursor-pointer'}`}>
        <span className="truncate">{options.find(o => o.value === value)?.label || placeholder}</span>
      </summary>
      {!disabled && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
          <div className="absolute top-full mt-1 left-0 z-[70] bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded w-full max-h-[200px] overflow-y-auto">
            <button
              type="button"
              onClick={(e) => {
                onChange('');
                e.stopPropagation();
                e.currentTarget.closest('details')?.removeAttribute('open');
              }}
              className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate text-gray-500 italic shrink-0"
            >
              {placeholder}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  onChange(opt.value);
                  e.stopPropagation();
                  e.currentTarget.closest('details')?.removeAttribute('open');
                }}
                className={`text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate shrink-0 ${value === opt.value ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-medium' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </details>
  );
};

const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-gray-100 text-gray-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function MyDepartmentPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [memberSchedules, setMemberSchedules] = useState<any[]>([])
  const [isMemberScheduleLoading, setIsMemberScheduleLoading] = useState(false)
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  const [removeError, setRemoveError] = useState('')
  
  const [rooms, setRooms] = useState<{id: string, code: string, name: string, buildingId: string}[]>([])
  const [buildings, setBuildings] = useState<{id: string, name: string}[]>([])
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false)
  const [pendingTypeChange, setPendingTypeChange] = useState<{index: number, newType: string} | null>(null)
  
  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
  
  const createDefaultSchedule = () => ({
    id: generateId(),
    instructorId: '',
    instructorId2: '',
    type: 'normal',
    subjectCode: '',
    subjectTitle: '',
    classSection: '',
    faculty: 'Lec',
    faculty2: '',
    startTime: '',
    startTime2: '',
    endTime: '',
    endTime2: '',
    days: [] as string[],
    buildingId: '',
    buildingId2: '',
    roomId: '',
    roomId2: '',
    parentId: undefined as string | undefined,
    orderIndex: 0
  })
  const [schedules, setSchedules] = useState([createDefaultSchedule()])
  const [isSubmittingSchedules, setIsSubmittingSchedules] = useState(false)
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<string[]>([])
  const [isRemoveMode, setIsRemoveMode] = useState(false)
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([])

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

  // Fetch existing schedules when modal opens
  useEffect(() => {
    if (isAddScheduleModalOpen && departmentInfo?.code) {
      const fetchSchedules = async () => {
        const q = query(collection(db, 'schedule'), where('department', '==', departmentInfo.code))
        const snapshot = await getDocs(q)
        if (!snapshot.empty) {
          const rawFetched = snapshot.docs.map(doc => {
            const data = doc.data()
            return {
              ...createDefaultSchedule(),
              ...data,
              session: data.session || 'Combine',
              isSplitSession: data.isSplitSession || false,
              days: data.days || [],
              classSection: data.classSection || '',
              type: data.type || 'normal',
              subjectCode: data.subjectCode || '',
              subjectTitle: data.subjectTitle || '',
              faculty: data.faculty || 'Lec',
              startTime: data.startTime || '',
              endTime: data.endTime || '',
              buildingId: data.buildingId || '',
              roomId: data.roomId || '',
              instructorId: data.instructorId || '',
              id: data.id || (!data.parentId && data.groupId ? data.groupId : doc.id),
              docId: doc.id,
              orderIndex: data.orderIndex !== undefined ? data.orderIndex : 0
            }
          })
          
          const parentMap = new Map();
          const children: any[] = [];
          
          const allDocs = new Map(rawFetched.map(item => [item.id, item]));
          
          rawFetched.forEach(item => {
            const parentDoc = item.parentId ? allDocs.get(item.parentId) : null;
            if (parentDoc && parentDoc.orderIndex === item.orderIndex) {
              children.push(item);
            } else {
              parentMap.set(item.id, item);
            }
          });
          
          children.forEach(child => {
            const parent = parentMap.get(child.parentId);
            if (parent) {
              parent.instructorId2 = child.instructorId === parent.instructorId ? '' : child.instructorId;
              parent.faculty2 = child.faculty === parent.faculty ? '' : child.faculty;
              parent.startTime2 = child.startTime === parent.startTime ? '' : child.startTime;
              parent.endTime2 = child.endTime === parent.endTime ? '' : child.endTime;
              
              if (child.days && child.days.length > 0) {
                const combinedDays = [...(parent.days || []), ...child.days];
                const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                parent.days = Array.from(new Set(combinedDays)).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
              }

              parent.buildingId2 = child.buildingId === parent.buildingId ? '' : child.buildingId;
              parent.roomId2 = child.roomId === parent.roomId ? '' : child.roomId;
              parent.childDocId = child.docId;
            }
          });
          
          const fetched = Array.from(parentMap.values());
          fetched.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))

          setSchedules(fetched)
        } else {
          setSchedules([])
        }
      }
      fetchSchedules()
    } else {
      setSchedules([])
      setDeletedScheduleIds([])
    }
  }, [isAddScheduleModalOpen, departmentInfo])

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

  const handleRowClick = async (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
    setIsMemberScheduleLoading(true)
    
    try {
      const q = query(collection(db, 'schedule'), where('instructorId', '==', member.membershipId))
      const snapshot = await getDocs(q)
      const fetchedSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      fetchedSchedules.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
      setMemberSchedules(fetchedSchedules)
    } catch (e) {
      console.error(e)
    } finally {
      setIsMemberScheduleLoading(false)
    }
  }

  const handleScheduleChange = (index: number, field: string, value: any) => {
    if (field === 'type') {
      const currentType = schedules[index].type
      if ((value === 'parallel' && currentType !== 'parallel') ||
          (value !== 'parallel' && currentType === 'parallel')) {
        setPendingTypeChange({ index, newType: value })
        return
      }
    }

    setSchedules(prev => {
      let updated = [...prev]
      const current = updated[index]
      updated[index] = { ...current, [field]: value }


      if (field === 'type') {
        if (value === 'open lab') {
          updated[index].faculty = 'Flexible'
        } else if (current.type === 'open lab' && value !== 'open lab') {
          updated[index].faculty = 'Lec'
        }
      }

      if (!current.parentId && current.type === 'parallel') {
        const fieldsToCopy = [
          'instructorId', 'instructorId2', 
          'subjectCode', 'subjectTitle', 
          'faculty', 'faculty2', 
          'startTime', 'startTime2', 
          'endTime', 'endTime2', 
          'days', 
          'buildingId', 'buildingId2'
        ]
        if (fieldsToCopy.includes(field)) {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], [field]: value }
              if (field === 'buildingId') {
                updated[i] = { ...updated[i], roomId: '' }
              } else if (field === 'buildingId2') {
                updated[i] = { ...updated[i], roomId2: '' }
              }
            }
          }
        } else if (field === 'roomId') {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], roomId: '' }
            }
          }
        } else if (field === 'roomId2') {
          for (let i = 0; i < updated.length; i++) {
            if (updated[i].parentId === current.id) {
              updated[i] = { ...updated[i], roomId2: '' }
            }
          }
        }
      }

      return updated
    })
  }

  const handleToggleDay = (index: number, day: string) => {
    setSchedules(prev => {
      const updated = [...prev]
      const current = updated[index]
      const currentDays = current.days
      const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      
      let newDays;
      if (currentDays.includes(day)) {
        newDays = currentDays.filter((d: string) => d !== day)
      } else {
        if (currentDays.length >= 2) {
          return updated;
        }
        newDays = [...currentDays, day].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
      }
      
      updated[index] = { ...current, days: newDays }

      if (!current.parentId && current.type === 'parallel') {
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].parentId === current.id) {
            updated[i] = { ...updated[i], days: newDays }
          }
        }
      }
      return updated
    })
  }

  const confirmTypeChange = () => {
    if (!pendingTypeChange) return;
    const { index, newType } = pendingTypeChange;
    
    setSchedules(prev => {
      const updated = [...prev];
      const current = updated[index];
      
      if (newType === 'parallel') {
        updated[index] = { ...current, type: 'parallel' };
        if (current.type === 'open lab') {
          updated[index].faculty = 'Lec';
        }
        const parentId = current.id || generateId();
        if (!current.id) updated[index].id = parentId;
        
        const children = Array.from({ length: 3 }).map(() => ({
          ...createDefaultSchedule(),
          parentId,
          type: 'parallel',
          instructorId: current.instructorId,
          instructorId2: (current as any).instructorId2 || '',
          subjectCode: current.subjectCode,
          subjectTitle: current.subjectTitle,
          faculty: updated[index].faculty,
          faculty2: (updated[index] as any).faculty2 || '',
          startTime: current.startTime,
          startTime2: (current as any).startTime2 || '',
          endTime: current.endTime,
          endTime2: (current as any).endTime2 || '',
          days: current.days,
          buildingId: current.buildingId,
          buildingId2: (current as any).buildingId2 || ''
        }));
        updated.splice(index + 1, 0, ...children);
      } else {
        updated[index] = { ...current, type: newType };
        if (newType === 'open lab') {
          updated[index].faculty = 'Flexible';
        } else if (current.type === 'open lab') {
          updated[index].faculty = 'Lec';
        }
        return updated.filter(s => s.parentId !== current.id);
      }
      return updated;
    });
    setPendingTypeChange(null);
  };

  const executeBulkRemove = () => {
    if (selectedScheduleIds.length === 0) {
      setIsRemoveMode(false);
      return;
    }
    setSchedules(prev => {
      const removedSchedules = prev.filter(s => selectedScheduleIds.includes(s.id) || (s.parentId && selectedScheduleIds.includes(s.parentId)));
      const removedDocIds = removedSchedules.map(s => (s as any).docId).filter(Boolean);
      if (removedDocIds.length > 0) {
        setDeletedScheduleIds(current => [...current, ...removedDocIds]);
      }
      return prev.filter(s => !selectedScheduleIds.includes(s.id) && (!s.parentId || !selectedScheduleIds.includes(s.parentId)));
    });
    setSelectedScheduleIds([]);
    setIsRemoveMode(false);
  }

  const handleDropdownPosition = (e: React.MouseEvent<HTMLElement>) => {
    const summary = e.currentTarget;
    const rect = summary.getBoundingClientRect();
    const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement;
    if (dropdown) {
      if (window.innerHeight - rect.bottom < 350) {
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

  const handleSaveSchedules = async () => {
    const validSchedules = schedules.filter(s => s.type || s.subjectCode || (s as any).docId)
    if (validSchedules.length === 0 && deletedScheduleIds.length === 0) {
      setIsAddScheduleModalOpen(false)
      return
    }

    setIsSubmittingSchedules(true)
    try {
      const savePromises = validSchedules.flatMap((schedule, index) => {
        if (!(schedule as any).docId && !schedule.subjectCode && !schedule.type) return [];

        const isParallel = schedule.type === 'parallel';
        const groupId = isParallel ? (schedule.parentId || schedule.id) : null;
        
        const hasSecondDay = schedule.days.length === 2;
        const hasExplicitSecondSessionFields = !!(schedule as any).startTime2 || 
          !!(schedule as any).endTime2 || 
          !!(schedule as any).faculty2 || 
          !!(schedule as any).instructorId2 || 
          !!(schedule as any).buildingId2 || 
          !!(schedule as any).roomId2;
        const isSplit = hasSecondDay || hasExplicitSecondSessionFields;

        const data1 = {
          department: departmentInfo?.code || null,
          session: null,
          isSplitSession: isSplit,
          classSection: schedule.classSection || null,
          type: schedule.type || null,
          subjectCode: schedule.subjectCode || null,
          subjectTitle: schedule.subjectTitle || null,
          faculty: schedule.faculty || null,
          startTime: schedule.startTime || null,
          endTime: schedule.endTime || null,
          days: schedule.days.length > 0 ? (hasSecondDay ? [schedule.days[0]] : schedule.days) : null,
          buildingId: schedule.buildingId || null,
          roomId: schedule.roomId || null,
          instructorId: schedule.instructorId || null,
          groupId: groupId,
          parentId: schedule.parentId || null,
          orderIndex: index,
          updatedAt: serverTimestamp()
        };

        const promises = [];
        const parentDocId = (schedule as any).docId;

        if (parentDocId) {
          promises.push(updateDoc(doc(db, 'schedule', parentDocId), { ...data1, id: schedule.id }));
        } else {
          promises.push(addDoc(collection(db, 'schedule'), { ...data1, id: schedule.id, createdAt: serverTimestamp() }));
        }

        if (isSplit) {
          const data2 = {
            department: departmentInfo?.code || null,
            session: null,
            isSplitSession: true,
            classSection: schedule.classSection || null,
            type: schedule.type || null,
            subjectCode: schedule.subjectCode || null,
            subjectTitle: schedule.subjectTitle || null,
            faculty: (schedule as any).faculty2 || schedule.faculty || null,
            startTime: (schedule as any).startTime2 || schedule.startTime || null,
            endTime: (schedule as any).endTime2 || schedule.endTime || null,
            days: hasSecondDay ? [schedule.days[1]] : (schedule.days.length > 0 ? schedule.days : null),
            buildingId: (schedule as any).buildingId2 || schedule.buildingId || null,
            roomId: (schedule as any).roomId2 || schedule.roomId || null,
            instructorId: (schedule as any).instructorId2 || schedule.instructorId || null,
            groupId: groupId,
            parentId: schedule.id,
            orderIndex: index,
            updatedAt: serverTimestamp()
          };

          const childDocId = (schedule as any).childDocId;
          if (childDocId) {
            promises.push(updateDoc(doc(db, 'schedule', childDocId), { ...data2, id: generateId() }));
          } else {
            promises.push(addDoc(collection(db, 'schedule'), { ...data2, id: generateId(), createdAt: serverTimestamp() }));
          }
        } else {
          const childDocId = (schedule as any).childDocId;
          if (childDocId) {
            promises.push(deleteDoc(doc(db, 'schedule', childDocId)));
          }
        }

        return promises;
      })

      const deletePromises = deletedScheduleIds.map(id => deleteDoc(doc(db, 'schedule', id)))
      
      await Promise.all([...savePromises, ...deletePromises])
      
      setIsAddScheduleModalOpen(false)
      setSchedules([createDefaultSchedule()])
      setDeletedScheduleIds([])
    } catch (error) {
      console.error("Error saving schedules:", error)
    } finally {
      setIsSubmittingSchedules(false)
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
            className="w-fit min-w-[700px] max-w-[90vw] min-h-[500px] max-h-[85vh] flex flex-col rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md relative shrink-0">
              <button 
                onClick={() => setIsScheduleModalOpen(false)}
                className="absolute right-4 top-4 text-white/70 hover:text-white transition-colors"
              >
                <PlusIcon className="h-6 w-6 rotate-45" />
              </button>
              <h3 className="text-xl font-bold">{selectedMember.name}'s Schedule</h3>
              <p className="mt-1 text-sm text-white/80">{selectedMember.role} • {selectedMember.email}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50/50 overscroll-none [scrollbar-gutter:stable] flex flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
              {isMemberScheduleLoading ? (
                <div className="flex-1 flex items-center justify-center text-center text-gray-500">Loading schedule...</div>
              ) : memberSchedules.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
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
              ) : (
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-separate border-spacing-0">
                    <thead className="bg-gray-50 sticky top-0 z-20 text-gray-700 font-bold text-base shadow-sm">
                      <tr>
                        <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-32">Time</th>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <th key={day} className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[180px] last:border-r-0">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {(() => {
                        const timeSlotSet = new Set<string>();
                        memberSchedules.forEach(schedule => {
                          if (schedule.startTime && schedule.endTime && schedule.days && schedule.days.length > 0) {
                            timeSlotSet.add(`${schedule.startTime}-${schedule.endTime}`);
                          }
                        });

                        const timeSlots = Array.from(timeSlotSet).sort((a, b) => {
                          const startA = a.split('-')[0];
                          const startB = b.split('-')[0];
                          if (startA !== startB) return startA.localeCompare(startB);
                          return a.split('-')[1].localeCompare(b.split('-')[1]);
                        });

                        const grid: Record<string, Record<string, any[]>> = {};
                        timeSlots.forEach(slot => {
                          grid[slot] = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
                        });

                        memberSchedules.forEach(schedule => {
                          if (schedule.startTime && schedule.endTime && schedule.days) {
                            const slot = `${schedule.startTime}-${schedule.endTime}`;
                            schedule.days.forEach((day: string) => {
                              if (grid[slot] && grid[slot][day]) {
                                grid[slot][day].push(schedule);
                              }
                            });
                          }
                        });

                        const formatTime = (time: string) => {
                          if (!time) return '';
                          const [h, m] = time.split(':');
                          const hours = parseInt(h, 10);
                          const suffix = hours >= 12 ? 'PM' : 'AM';
                          const displayHours = hours % 12 || 12;
                          return `${displayHours}:${m} ${suffix}`;
                        };

                        if (timeSlots.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">
                                Schedules found but missing time or day data.
                              </td>
                            </tr>
                          );
                        }

                        return timeSlots.map(slot => {
                          const [start, end] = slot.split('-');
                          return (
                            <tr key={slot} className="transition hover:bg-gray-50/50">
                              <td className="px-3 py-3 text-sm font-bold text-gray-700 border-b border-r border-gray-300 align-top whitespace-nowrap bg-gray-50/30">
                                <div className="flex flex-col items-center justify-center h-full gap-1 pt-2">
                                  <span>{formatTime(start)}</span>
                                  <span className="text-gray-400 font-normal">to</span>
                                  <span>{formatTime(end)}</span>
                                </div>
                              </td>
                              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                                const daySchedules = grid[slot][day];
                                const grouped: { parent: any, children: any[] }[] = [];
                                
                                daySchedules.forEach(cls => {
                                  if (cls.type === 'parallel') {
                                    if (cls.groupId) {
                                      const existingGroup = grouped.find(g => g.parent.groupId === cls.groupId);
                                      if (existingGroup) {
                                        existingGroup.children.push(cls);
                                      } else {
                                        grouped.push({ parent: cls, children: [] });
                                      }
                                    } else {
                                      grouped.push({ parent: cls, children: [] });
                                    }
                                  } else if (cls.parentId) {
                                    const parentGroup = grouped.find(g => g.parent.id === cls.parentId || g.parent.docId === cls.parentId);
                                    if (parentGroup) {
                                      parentGroup.children.push(cls);
                                    } else {
                                      grouped.push({ parent: cls, children: [] });
                                    }
                                  } else {
                                    grouped.push({ parent: cls, children: [] });
                                  }
                                });

                                return (
                                  <td key={day} className="px-2 py-2 border-b border-r border-gray-300 last:border-r-0 align-top">
                                    <div className="flex flex-col gap-2">
                                      {grouped.map((group, idx) => (
                                        group.parent.type === 'parallel' ? (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm">
                                            <span className="font-bold text-gray-900">{group.parent.subjectCode || 'TBA'}</span>
                                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mt-0.5">
                                              {group.parent.type || 'N/A'}
                                            </span>
                                            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2">
                                              {[group.parent, ...group.children].map((item, iIdx) => (
                                                <div key={iIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30">
                                                  <div className="flex flex-col gap-0.5 text-gray-500">
                                                    <span>Sec: <span className="font-medium text-gray-700">{item.classSection || 'TBA'}</span></span>
                                                    <span className="text-[var(--brand-color)] font-medium truncate" title={item.roomId ? rooms.find(r => r.id === item.roomId)?.code || 'TBA' : 'TBA'}>
                                                      {item.roomId ? rooms.find(r => r.id === item.roomId)?.code || 'TBA' : 'TBA'}
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : group.children.length > 0 ? (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm">
                                            <span className="font-bold text-gray-900">{group.parent.subjectCode || 'TBA'}</span>
                                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mt-0.5">
                                              {group.parent.type || 'N/A'}
                                            </span>
                                            <div className="mt-1 flex flex-col gap-0.5 text-gray-500">
                                              <span>Sec: <span className="font-medium text-gray-700">{group.parent.classSection || 'TBA'}</span></span>
                                              <span className="text-[var(--brand-color)] font-medium truncate" title={group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}>
                                                {group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}
                                              </span>
                                            </div>
                                            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2">
                                              {group.children.map((child, cIdx) => (
                                                <div key={cIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30">
                                                  <span className="font-bold text-gray-900">{child.subjectCode || 'TBA'}</span>
                                                  <div className="mt-0.5 flex flex-col gap-0.5 text-gray-500">
                                                    <span>Sec: <span className="font-medium text-gray-700">{child.classSection || 'TBA'}</span></span>
                                                    <span className="text-[var(--brand-color)] font-medium truncate" title={child.roomId ? rooms.find(r => r.id === child.roomId)?.code || 'TBA' : 'TBA'}>
                                                      {child.roomId ? rooms.find(r => r.id === child.roomId)?.code || 'TBA' : 'TBA'}
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 rounded text-sm shadow-sm">
                                            <span className="font-bold text-gray-900">{group.parent.subjectCode || 'TBA'}</span>
                                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mt-0.5">
                                              {group.parent.type || 'N/A'}
                                            </span>
                                            <div className="mt-1.5 flex flex-col gap-0.5 text-gray-500">
                                              <span>Sec: <span className="font-medium text-gray-700">{group.parent.classSection || 'TBA'}</span></span>
                                              <span className="text-[var(--brand-color)] font-medium truncate" title={group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}>
                                                {group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}
                                              </span>
                                            </div>
                                          </div>
                                        )
                                      ))}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
              )}
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setIsScheduleModalOpen(false)} />
        </div>
      )}

      {/* Confirm Type Change Modal */}
      {pendingTypeChange && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setPendingTypeChange(null)}>
          <div 
            className="w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-4 text-white rounded-t-md">
              <h3 className="text-lg font-bold">Confirm Type Change</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                {pendingTypeChange.newType === 'parallel' 
                  ? 'Are you sure you want to select Parallel? This will create 3 additional rows for the child classes.'
                  : 'Are you sure you want to deselect Parallel? This will remove the 3 additional child rows.'}
              </p>
              
              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setPendingTypeChange(null)}
                  className="flex-1 rounded-md border border-gray-300 bg-white py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={confirmTypeChange}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-2 text-sm font-bold text-white shadow-md transition hover:opacity-90"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {isAddScheduleModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-4 text-white rounded-t-md shrink-0">
              <h3 className="text-xl font-bold">Add Schedule</h3>
              <p className="mt-1 text-sm text-white/80">Add multiple schedules and assign them to instructors in your department.</p>
            </div>
            
            <div className="py-0 flex-1 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-max border-separate border-spacing-0">
                <thead className="bg-gray-50 sticky top-0 z-20 text-gray-700 font-bold text-base shadow-sm">
                  <tr>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[90px]">Type</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[90px]">Code</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[240px]">Title</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[100px]">Section</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[120px]">Faculty</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[260px]">Instructor</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[240px]">Time</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[140px]">Days</th>
                    <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[210px]">Building</th>
                    <th className="p-2 border-b-2 text-center border-gray-300 bg-gray-50 min-w-[180px]">Room</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-sm font-medium">No schedules yet.</p>
                        <button type="button" onClick={() => setSchedules([createDefaultSchedule()])} className="text-[var(--brand-color)] hover:underline text-sm font-bold">
                          Click here to add the first row.
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  schedules.map((schedule, index) => {
                    const isChild = !!schedule.parentId;
                    const isParallelChild = isChild;
                    
                    let childAvailableRooms = rooms;
                    if (schedule.buildingId) {
                      childAvailableRooms = rooms.filter(r => r.buildingId === schedule.buildingId);
                    }
                    
                    if (isParallelChild) {
                      const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId);
                      const selectedRoomCodes = groupRows
                        .filter(s => s.id !== schedule.id && s.roomId)
                        .map(s => {
                          const r = rooms.find(room => room.id === s.roomId);
                          return r ? r.code : null;
                        })
                        .filter(Boolean) as string[];

                      if (selectedRoomCodes.length > 0) {
                        const selectedNums = selectedRoomCodes.map(code => {
                          const match = code.match(/\d+/);
                          return match ? parseInt(match[0], 10) : null;
                        }).filter(n => n !== null) as number[];
                        
                        childAvailableRooms = childAvailableRooms.filter(room => {
                          if (selectedRoomCodes.includes(room.code)) return false;
                          
                          const roomNumMatch = room.code.match(/\d+/);
                          if (!roomNumMatch) return false;
                          const roomNum = parseInt(roomNumMatch[0], 10);
                          
                          const allNums = [...selectedNums, roomNum];
                          const min = Math.min(...allNums);
                          const max = Math.max(...allNums);
                          
                          return max - min === allNums.length - 1;
                        });
                      } else {
                        childAvailableRooms = [];
                      }
                    }

                    const availableRooms = childAvailableRooms.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));

                    let childAvailableRooms2 = rooms;
                    const bId2 = (schedule as any).buildingId2 || schedule.buildingId;
                    if (bId2) {
                      childAvailableRooms2 = rooms.filter(r => r.buildingId === bId2 && r.id !== schedule.roomId);
                    } else {
                      childAvailableRooms2 = [];
                    }

                    if (isParallelChild) {
                      const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId);
                      const selectedRoomCodes2 = groupRows
                        .filter(s => s.id !== schedule.id && (s as any).roomId2)
                        .map(s => {
                          const r = rooms.find(room => room.id === (s as any).roomId2);
                          return r ? r.code : null;
                        })
                        .filter(Boolean) as string[];

                      if (selectedRoomCodes2.length > 0) {
                        const selectedNums2 = selectedRoomCodes2.map(code => {
                          const match = code.match(/\d+/);
                          return match ? parseInt(match[0], 10) : null;
                        }).filter(n => n !== null) as number[];
                        
                        childAvailableRooms2 = childAvailableRooms2.filter(room => {
                          if (selectedRoomCodes2.includes(room.code)) return false;
                          
                          const roomNumMatch = room.code.match(/\d+/);
                          if (!roomNumMatch) return false;
                          const roomNum = parseInt(roomNumMatch[0], 10);
                          
                          const allNums = [...selectedNums2, roomNum];
                          const min = Math.min(...allNums);
                          const max = Math.max(...allNums);
                          
                          return max - min === allNums.length - 1;
                        });
                      } else {
                        childAvailableRooms2 = [];
                      }
                    }

                    const availableRooms2 = childAvailableRooms2.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' }));
                    
                    const isSelected = selectedScheduleIds.includes(schedule.id) || (!!schedule.parentId && selectedScheduleIds.includes(schedule.parentId));

                    return (
                    <tr 
                      key={index} 
                      className={`${isSelected ? 'bg-red-100 hover:bg-red-200' : 'hover:bg-gray-50'} ${isRemoveMode ? 'cursor-pointer [&>td>*]:pointer-events-none' : ''}`}
                      onClickCapture={(e) => {
                        if (isRemoveMode) {
                          e.preventDefault();
                          e.stopPropagation();
                          const targetId = schedule.parentId || schedule.id;
                          setSelectedScheduleIds(prev => 
                            prev.includes(targetId) ? prev.filter(id => id !== targetId) : [...prev, targetId]
                          );
                        }
                      }}
                    >

                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium text-left cursor-default">----</div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.type ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate">{schedule.type ? schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1) : 'Select'}</span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded w-full`}>
                              {['normal', 'open lab', 'parallel'].map(opt => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={(e) => {
                                    handleScheduleChange(index, 'type', opt)
                                    e.currentTarget.closest('details')?.removeAttribute('open')
                                  }}
                                  className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate"
                                >
                                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                </button>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        <input 
                          type="text" 
                          placeholder="ITE 298"
                          disabled={isChild}
                          value={schedule.subjectCode}
                          onChange={(e) => handleScheduleChange(index, 'subjectCode', e.target.value)}
                          onBlur={(e) => { e.target.scrollLeft = 0; }}
                          className={`h-full w-full min-h-[44px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.subjectCode ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        <input 
                          type="text" 
                          placeholder="IT Project Mgmt"
                          disabled={isChild}
                          value={schedule.subjectTitle}
                          onChange={(e) => handleScheduleChange(index, 'subjectTitle', e.target.value)}
                          onBlur={(e) => { e.target.scrollLeft = 0; }}
                          className={`h-full w-full min-h-[44px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.subjectTitle ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        <input 
                          type="text" 
                          placeholder="BSIT 3-1"
                          value={schedule.classSection}
                          onChange={(e) => handleScheduleChange(index, 'classSection', e.target.value)}
                          className={`h-full w-full min-h-[44px] px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] transition-colors bg-transparent ${schedule.classSection ? 'text-gray-900 font-medium' : 'text-gray-500 placeholder:text-gray-400'}`}
                        />
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                            {schedule.faculty || '----'}
                            {(schedule as any).faculty2 ? ` / ${(schedule as any).faculty2}` : ''}
                          </div>
                        ) : schedule.type === 'open lab' ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                            Flexible
                          </div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${(schedule.faculty || (schedule as any).faculty2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate">
                                {schedule.faculty || 'Select'}
                                {(schedule as any).faculty2 ? ` / ${(schedule as any).faculty2}` : ''}
                              </span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full`}>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                <InnerDropdown
                                  value={schedule.faculty || ''}
                                  onChange={(val) => {
                                    handleScheduleChange(index, 'faculty', val);
                                    if (!val) handleScheduleChange(index, 'faculty2', '');
                                  }}
                                  options={[{value: 'Lec', label: 'Lec'}, {value: 'Lab', label: 'Lab'}]}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                <InnerDropdown
                                  value={(schedule as any).faculty2 || ''}
                                  disabled={!schedule.faculty}
                                  onChange={(val) => handleScheduleChange(index, 'faculty2', val)}
                                  options={(() => {
                                    const opts = [];
                                    if (schedule.faculty !== 'Lec') opts.push({value: 'Lec', label: 'Lec'});
                                    if (schedule.faculty !== 'Lab') opts.push({value: 'Lab', label: 'Lab'});
                                    return opts;
                                  })()}
                                />
                              </div>
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                            {members.find(m => m.membershipId === schedule.instructorId)?.name || '----'}
                            {(schedule as any).instructorId2 ? ` / ${members.find(m => m.membershipId === (schedule as any).instructorId2)?.name || '?'}` : ''}
                          </div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${(schedule.instructorId || (schedule as any).instructorId2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate">
                                {members.find(m => m.membershipId === schedule.instructorId)?.name || 'Select'}
                                {(schedule as any).instructorId2 ? ` / ${members.find(m => m.membershipId === (schedule as any).instructorId2)?.name || '?'}` : ''}
                              </span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full`}>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                <InnerDropdown
                                  value={schedule.instructorId || ''}
                                  onChange={(val) => {
                                    handleScheduleChange(index, 'instructorId', val);
                                    if (!val) handleScheduleChange(index, 'instructorId2', '');
                                  }}
                                  options={members.filter(m => m.role === 'Instructor').map(m => ({value: m.membershipId || '', label: m.name}))}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                <InnerDropdown
                                  value={(schedule as any).instructorId2 || ''}
                                  disabled={!schedule.instructorId}
                                  onChange={(val) => handleScheduleChange(index, 'instructorId2', val)}
                                  options={members.filter(m => m.role === 'Instructor' && m.membershipId !== schedule.instructorId).map(m => ({value: m.membershipId || '', label: m.name}))}
                                />
                              </div>
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                            {(() => {
                              const time1 = (schedule.startTime || schedule.endTime) ? `${schedule.startTime || '?'} - ${schedule.endTime || '?'}` : '';
                              const time2 = ((schedule as any).startTime2 || (schedule as any).endTime2) ? `${(schedule as any).startTime2 || '?'} - ${(schedule as any).endTime2 || '?'}` : '';
                              return time1 ? (time2 ? `${time1} / ${time2}` : time1) : '----';
                            })()}
                          </div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${(schedule.startTime || schedule.endTime || (schedule as any).startTime2 || (schedule as any).endTime2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate">
                                {(() => {
                                  const time1 = (schedule.startTime || schedule.endTime) ? `${schedule.startTime || '?'} - ${schedule.endTime || '?'}` : '';
                                  const time2 = ((schedule as any).startTime2 || (schedule as any).endTime2) ? `${(schedule as any).startTime2 || '?'} - ${(schedule as any).endTime2 || '?'}` : '';
                                  return time1 ? (time2 ? `${time1} / ${time2}` : time1) : 'Select Time';
                                })()}
                              </span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-4 rounded w-full`}>
                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session Time</label>
                                <div className="flex items-center gap-2">
                                  <input type="time" value={schedule.startTime || ''} onChange={(e) => {
                                    handleScheduleChange(index, 'startTime', e.target.value);
                                    if (!e.target.value) handleScheduleChange(index, 'startTime2', '');
                                  }} className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] bg-white [&::-webkit-calendar-picker-indicator]:hidden cursor-text" />
                                  <span className="text-gray-500 text-sm">to</span>
                                  <input type="time" value={schedule.endTime || ''} onChange={(e) => {
                                    handleScheduleChange(index, 'endTime', e.target.value);
                                    if (!e.target.value) handleScheduleChange(index, 'endTime2', '');
                                  }} className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] bg-white [&::-webkit-calendar-picker-indicator]:hidden cursor-text" />
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session Time</label>
                                <div className="flex items-center gap-2">
                                  <input type="time" disabled={!schedule.startTime} value={(schedule as any).startTime2 || ''} onChange={(e) => handleScheduleChange(index, 'startTime2', e.target.value)} className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] bg-white [&::-webkit-calendar-picker-indicator]:hidden cursor-text disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-default" />
                                  <span className="text-gray-500 text-sm">to</span>
                                  <input type="time" disabled={!schedule.endTime} value={(schedule as any).endTime2 || ''} onChange={(e) => handleScheduleChange(index, 'endTime2', e.target.value)} className="flex-1 p-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] bg-white [&::-webkit-calendar-picker-indicator]:hidden cursor-text disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-default" />
                                </div>
                              </div>
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium flex items-center cursor-default">
                            <span className="truncate max-w-[100px]">
                              {schedule.days.length > 0 ? schedule.days.join(', ') : '----'}
                            </span>
                          </div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${schedule.days.length > 0 ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate max-w-[100px]">
                                {schedule.days.length > 0 ? schedule.days.join(', ') : 'Select'}
                              </span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-2 rounded w-full`}>
                              {[
                                { short: 'Mon', full: 'Monday' },
                                { short: 'Tue', full: 'Tuesday' },
                                { short: 'Wed', full: 'Wednesday' },
                                { short: 'Thu', full: 'Thursday' },
                                { short: 'Fri', full: 'Friday' },
                                { short: 'Sat', full: 'Saturday' },
                                { short: 'Sun', full: 'Sunday' }
                              ].map(day => {
                                const isChecked = schedule.days.includes(day.short);
                                const isMaxReached = schedule.days.length >= 2;
                                const isDisabled = !isChecked && isMaxReached;
                                return (
                                <label key={day.short} className={`flex items-center gap-2 text-sm font-medium relative z-50 shrink-0 ${isDisabled ? 'text-gray-400 cursor-default' : 'cursor-pointer'}`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isChecked}
                                    disabled={isDisabled}
                                    onChange={() => handleToggleDay(index, day.short)} 
                                    className={`rounded text-[var(--brand-color)] focus:ring-[var(--brand-color)] ${isDisabled ? 'cursor-default' : 'cursor-pointer'}`}
                                  />
                                  {day.full}
                                </label>
                              )})}
                              {schedule.days.length === 2 && (
                                <div className="mt-2 text-xs text-[var(--brand-color)] font-medium">
                                  1st: {schedule.days[0]} / 2nd: {schedule.days[1]}
                                </div>
                              )}
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-r border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : (isChild ? 'bg-gray-50/50' : '')}`}>
                        {isChild ? (
                          <div className="px-3 py-3 text-sm text-gray-900 font-medium truncate cursor-default">
                            {buildings.find(b => b.id === schedule.buildingId)?.name || '----'}
                            {(schedule as any).buildingId2 ? ` / ${buildings.find(b => b.id === (schedule as any).buildingId2)?.name || '?'}` : ''}
                          </div>
                        ) : (
                          <details className="w-full relative h-full group">
                            <summary onClick={handleDropdownPosition} className={`h-full min-h-[44px] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset focus:ring-2 focus:ring-[var(--brand-color)] flex items-center justify-between transition-colors bg-transparent ${(schedule.buildingId || (schedule as any).buildingId2) ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                              <span className="truncate">
                                {buildings.find(b => b.id === schedule.buildingId)?.name || 'Select'}
                                {(schedule as any).buildingId2 ? ` / ${buildings.find(b => b.id === (schedule as any).buildingId2)?.name || '?'}` : ''}
                              </span>
                            </summary>
                            <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                            <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full`}>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                <InnerDropdown
                                  value={schedule.buildingId || ''}
                                  onChange={(val) => {
                                    handleScheduleChange(index, 'buildingId', val)
                                    handleScheduleChange(index, 'roomId', '')
                                    if (!val) {
                                      handleScheduleChange(index, 'buildingId2', '')
                                      handleScheduleChange(index, 'roomId2', '')
                                    }
                                  }}
                                  options={buildings.map(b => ({value: b.id, label: b.name}))}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                <InnerDropdown
                                  value={(schedule as any).buildingId2 || ''}
                                  disabled={!schedule.buildingId}
                                  onChange={(val) => {
                                    handleScheduleChange(index, 'buildingId2', val)
                                    handleScheduleChange(index, 'roomId2', '')
                                  }}
                                  options={buildings.filter(b => b.id !== schedule.buildingId).map(b => ({value: b.id, label: b.name}))}
                                />
                              </div>
                            </div>
                          </details>
                        )}
                      </td>
                      <td className={`p-0 border-b border-gray-300 relative align-middle ${isSelected ? 'bg-red-100' : ''}`}>
                        <details 
                          className="w-full relative h-full group"
                          onClick={(e) => {
                            if (!schedule.buildingId || (isChild && availableRooms.length === 0)) e.preventDefault();
                          }}
                        >
                          <summary onClick={(e) => { handleDropdownPosition(e); }} className={`h-full min-h-[44px] list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-inset flex items-center justify-between transition-colors bg-transparent ${(!schedule.buildingId || (isChild && availableRooms.length === 0)) ? 'cursor-default text-gray-400' : 'cursor-pointer focus:ring-2 focus:ring-[var(--brand-color)] ' + ((schedule.roomId || (schedule as any).roomId2) ? 'text-gray-900 font-medium' : 'text-gray-500')}`}>
                            <span className="truncate">
                              {schedule.buildingId ? (rooms.find(r => r.id === schedule.roomId)?.code || 'Select') : 'Select'}
                              {(schedule as any).roomId2 ? ` / ${rooms.find(r => r.id === (schedule as any).roomId2)?.code || '?'}` : ''}
                            </span>
                          </summary>
                          {schedule.buildingId && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}></div>
                              <div className={`absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full`}>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                  <InnerDropdown
                                    value={schedule.roomId || ''}
                                    onChange={(val) => {
                                      handleScheduleChange(index, 'roomId', val);
                                      if (!val) handleScheduleChange(index, 'roomId2', '');
                                    }}
                                    options={availableRooms.map(room => ({value: room.id, label: room.code || ''}))}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                  <InnerDropdown
                                    value={(schedule as any).roomId2 || ''}
                                    disabled={!schedule.roomId}
                                    onChange={(val) => handleScheduleChange(index, 'roomId2', val)}
                                    options={availableRooms2.map(room => ({value: room.id, label: room.code || ''}))}
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </details>
                      </td>
                    </tr>
                  );
                })
              )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t border-gray-200 bg-white flex justify-between gap-3 shrink-0 rounded-b-md">
              <div className="flex items-center gap-4">
                {isRemoveMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedScheduleIds.length === 0) {
                          setIsRemoveMode(false);
                        } else {
                          executeBulkRemove();
                        }
                      }}
                      className={`rounded border px-4 py-2 text-sm font-bold transition-colors flex items-center justify-center gap-1 shrink-0 ${
                        selectedScheduleIds.length > 0 
                          ? 'border-rose-500 bg-rose-500 text-white hover:bg-rose-600'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {selectedScheduleIds.length > 0 && <TrashIcon className="h-4 w-4" />}
                      {selectedScheduleIds.length > 0 ? `Delete Selected (${selectedScheduleIds.length})` : 'Cancel Remove'}
                    </button>
                    {selectedScheduleIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRemoveMode(false);
                          setSelectedScheduleIds([]);
                        }}
                        className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
                      >
                        Cancel Remove
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRemoveMode(true)}
                    className="rounded border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-500 hover:border-rose-500 hover:text-rose-600 transition-colors flex items-center justify-center gap-1 shrink-0"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  disabled={isRemoveMode}
                  onClick={() => setSchedules([...schedules, createDefaultSchedule()])}
                  className="rounded border border-dashed border-gray-400 bg-white px-4 py-2 text-sm font-bold text-gray-500 hover:border-[var(--brand-color)] hover:text-[var(--brand-color)] transition-colors flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Row
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Rows: {schedules.length}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddScheduleModalOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSchedules}
                  onClick={handleSaveSchedules}
                  className="rounded-md bg-[var(--brand-color)] px-6 py-2 text-sm font-bold text-white shadow-sm transition enabled:hover:bg-[var(--brand-color-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingSchedules ? 'Saving...' : `Save All`}
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => !isSubmittingSchedules && setIsAddScheduleModalOpen(false)} />
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
        </div>

        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search members..."
          primaryButton={currentUserRole === 'Dean' ? {
            label: "Add Instructor",
            onClick: () => setIsAddModalOpen(true)
          } : undefined}
          secondaryButton={(currentUserRole === 'Dean' || currentUserRole === 'Admin') ? {
            label: "Add Schedule",
            onClick: () => setIsAddScheduleModalOpen(true)
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
