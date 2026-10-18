import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { formatUserName } from '../../utils/userName'
import { DepartmentIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { IconOnlyButton } from '../../components/IconOnlyButton'
import { FilterDropdown } from '../../components/FilterDropdown'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db, storage } from '../../firebase'
import { collection, serverTimestamp, onSnapshot, query, orderBy, doc, writeBatch, where, limit } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { CropModal } from '../../components/CropModal'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { Snackbar } from '../../components/Snackbar'
import type { Member } from '../../types/member'
import { ANOMALY_NAMES } from '../../visualizations/DeanBook'



interface Department {
  id: string
  code: string
  name: string
  deanUID: string
  deanName: string
  memberCount?: number
  createdDate: string
  logo: string
  roomStyle?: number
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
  Deactivated: 'bg-rose-100 text-rose-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function DepartmentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [deanStatusFilters, setDeanStatusFilters] = useState<string[]>([])
  const [deptSizeFilters, setDeptSizeFilters] = useState<string[]>([])
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [showEasterEggControls, setShowEasterEggControls] = useState(false)
  const [isEasterEggsEnabled, setIsEasterEggsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('rorms_easter_eggs_enabled');
      return stored ? stored === 'true' : true;
    } catch {
      return true;
    }
  })
  const [selectedAnomalies, setSelectedAnomalies] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('rorms_selected_anomalies');
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((id): id is number => typeof id === 'number' && id >= 1 && id <= ANOMALY_NAMES.length);
    } catch {
      return [];
    }
  })
  const [isGalleryModalOpen, setIsGalleryModalOpen] = useState(false)
  useEffect(() => {
    localStorage.setItem('rorms_easter_eggs_enabled', isEasterEggsEnabled.toString());
  }, [isEasterEggsEnabled])

  useEffect(() => {
    localStorage.setItem('rorms_selected_anomalies', JSON.stringify(selectedAnomalies));
  }, [selectedAnomalies])

  const [showAmongUsButton, setShowAmongUsButton] = useState(false)
  const [wheelTooltip, setWheelTooltip] = useState<{ visible: boolean, x: number, y: number, text: string } | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deptToDelete, setDeptToDelete] = useState<Department | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropModalData, setCropModalData] = useState<{ isOpen: boolean, imageSrc: string }>({
    isOpen: false,
    imageSrc: ''
  })
  const [pendingLogoBlob, setPendingLogoBlob] = useState<Blob | null>(null)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [newDeptDeanName, setNewDeptDeanName] = useState('None')
  const [isDeanDropdownOpen, setIsDeanDropdownOpen] = useState(false)
  const [newDeptLogo, setNewDeptLogo] = useState('')
  const [logoErrors, setLogoErrors] = useState<Record<string, boolean>>({})
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<{
    name: 'required' | 'exists' | null;
    code: 'required' | 'exists' | null;
  }>({ name: null, code: null })

  const [snackbar, setSnackbar] = useState<{
    isOpen: boolean
    message: string
    title?: string
    type: 'error' | 'warning' | 'info' | 'success' | 'brand'
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'success'
  })

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand' = 'success', title?: string) => {
    setSnackbar({
      isOpen: true,
      message,
      title,
      type
    })
  }

  // Fetch All Users joined with Memberships
  useEffect(() => {
    let unsubscribeUsers: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null

    unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))

      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (mSnap) => {
        const joinedData = mSnap.docs.map((mDoc) => {
          const mData = mDoc.data()
          const userData = usersMap.get(mData.userId) || {}
          return {
            id: mData.userId,
            membershipId: mDoc.id,
            name: formatUserName(userData, mData),
            email: userData.email || mData.email || '',
            role: (mData.role as any) || 'Instructor',
            status: (userData.isActive === false) ? 'Deactivated' : (mData.status === 'pending' ? 'Pending' : 'Active'),
            department: mData.department || '',
            joinedDate: mData.joinedAt?.toDate ? new Intl.DateTimeFormat('en-US', {
              month: 'short', day: '2-digit', year: 'numeric'
            }).format(mData.joinedAt.toDate()) : '— — — — —',
            avatar: userData.profilePicture || '',
          }
        }) as Member[]
        setAllUsers(joinedData)
      })
    })

    return () => {
      if (unsubscribeUsers) unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
    }
  }, [])

  const availableDeans = useMemo(() => {
    return allUsers.filter(u => u.role === 'Dean' && u.id && u.name && u.name.trim() !== '' && u.status !== 'Deactivated')
  }, [allUsers])

  // Fetch Departments
  useEffect(() => {
    const q = query(collection(db, 'departments'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const depts = snapshot.docs.map(doc => {
        const data = doc.data()
        let createdDate = 'N/A'
        if (data.createdAt) {
          const date = data.createdAt.toDate()
          createdDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        }

        // Map dean UID to Name for display
        const deanUID = data.dean || ''
        const deanUser = availableDeans.find(d => d.id === deanUID)
        const deanName = deanUser ? deanUser.name : (deanUID ? 'Unknown' : 'None')

        return {
          id: doc.id,
          ...data,
          deanUID,
          deanName,
          createdDate
        } as Department
      })
      setDepartments(depts)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [availableDeans])

  const filteredDepartments = useMemo(() => {
    return departments
      .map((dept) => ({
        ...dept,
        memberCount: allUsers.filter((u) => u.department === dept.code).length,
      }))
      .filter((dept) => {
        // 1. Search Filter
        const matchesSearch = [dept.name, dept.code, dept.deanName].some((val) =>
          val.toLowerCase().includes(searchTerm.toLowerCase())
        )
        if (!matchesSearch) return false

        // 2. Dean Status Filter
        if (deanStatusFilters.length > 0) {
          const status = (dept.deanUID && dept.deanUID !== '') ? 'Assigned' : 'Unassigned'
          if (!deanStatusFilters.includes(status)) return false
        }

        // 3. Department Size Filter
        if (deptSizeFilters.length > 0) {
          let size = 'Empty'
          if (dept.memberCount && dept.memberCount > 50) size = 'Large'
          else if (dept.memberCount && dept.memberCount >= 11) size = 'Medium'
          else if (dept.memberCount && dept.memberCount >= 1) size = 'Small'
          
          if (!deptSizeFilters.includes(size)) return false
        }

        return true
      })
      .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
  }, [departments, allUsers, searchTerm, deanStatusFilters, deptSizeFilters])

  const deptMembers = selectedDept 
    ? allUsers
        .filter(m => m.department === selectedDept.code)
        .sort((a, b) => {
          const roleOrder: Record<string, number> = {
            'Dean': 1,
            'Program Head': 2,
            'Instructor': 3,
            'Registrar': 4,
            'Admin': 5
          }
          const orderA = roleOrder[a.role] || 99
          const orderB = roleOrder[b.role] || 99
          if (orderA !== orderB) return orderA - orderB
          return a.name.localeCompare(b.name)
        })
    : []

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept)
    setNewDeptName(dept.name)
    setNewDeptCode(dept.code)
    const deanUser = availableDeans.find(d => d.id === dept.deanUID)
    setNewDeptDeanName(deanUser ? deanUser.name : 'None')
    setNewDeptLogo(dept.logo)
    setErrors({ name: null, code: null })
  }

  const handleCloseFormModal = () => {
    setIsCreateModalOpen(false)
    setEditingDept(null)
    setNewDeptName('')
    setNewDeptCode('')
    setNewDeptDeanName('None')
    setNewDeptLogo('')
    setPendingLogoBlob(null)
    setErrors({ name: null, code: null })
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCropModalData({ isOpen: true, imageSrc: reader.result })
        }
      }
      reader.readAsDataURL(file)
      e.target.value = ''
    }
  }

  const handleCropComplete = async (croppedImage: Blob) => {
    setPendingLogoBlob(croppedImage)
    const blobUrl = URL.createObjectURL(croppedImage)
    setNewDeptLogo(blobUrl)
    setLogoErrors(prev => ({ ...prev, [blobUrl]: false }))
    setCropModalData({ isOpen: false, imageSrc: '' })
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedName = newDeptName.trim()
    const trimmedCode = newDeptCode.trim().toUpperCase()

    const selectedDeanUser = availableDeans.find(d => d.name === newDeptDeanName)
    const newDeptDean = selectedDeanUser ? selectedDeanUser.id : ''

    const nameRequired = !trimmedName
    const codeRequired = !trimmedCode

    if (nameRequired || codeRequired) {
      setErrors({
        name: nameRequired ? 'required' : null,
        code: codeRequired ? 'required' : null
      })
      if (nameRequired && codeRequired) {
        showNotification('Department name and code are required.', 'error', 'Missing Information')
      } else if (nameRequired) {
        showNotification('Department name is required.', 'error', 'Missing Information')
      } else {
        showNotification('Department code is required.', 'error', 'Missing Information')
      }
      return
    }

    const nameExists = departments.some(dept => {
      if (editingDept && dept.id === editingDept.id) return false
      return dept.name.toLowerCase() === trimmedName.toLowerCase()
    })

    const codeExists = departments.some(dept => {
      if (editingDept && dept.id === editingDept.id) return false
      return dept.code.toLowerCase() === trimmedCode.toLowerCase()
    })

    if (nameExists || codeExists) {
      setErrors({
        name: nameExists ? 'exists' : null,
        code: codeExists ? 'exists' : null
      })
      if (nameExists && codeExists) {
        showNotification('A department with this name and code already exists.', 'warning', 'Duplicate Department')
      } else if (nameExists) {
        showNotification('A department with this name already exists.', 'warning', 'Duplicate Department')
      } else {
        showNotification('A department with this code already exists.', 'warning', 'Duplicate Department')
      }
      return
    }

    setIsSubmitting(true)
    const finalCode = trimmedCode

    try {
      const batch = writeBatch(db)

      if (editingDept) {
        const oldDeanUID = editingDept.deanUID
        const newDeanUID = newDeptDean
        const oldCode = editingDept.code
        let finalLogo = newDeptLogo || ''

        if (pendingLogoBlob) {
          const newFileName = `logo_${Date.now()}.png`
          const storageRef = ref(storage, `departments/${editingDept.id}/${newFileName}`)
          await uploadBytes(storageRef, pendingLogoBlob)
          finalLogo = await getDownloadURL(storageRef)

          const oldLogoUrlToDelete = editingDept.logo
          if (oldLogoUrlToDelete && oldLogoUrlToDelete.includes('firebasestorage.googleapis.com')) {
            try {
              const oldStorageRef = ref(storage, oldLogoUrlToDelete)
              await deleteObject(oldStorageRef)
            } catch (error: any) {
              if (error.code !== 'storage/object-not-found') {
                console.error('Error deleting old logo:', error)
              }
            }
          }
        }

        const deptRef = doc(db, 'departments', editingDept.id)
        batch.update(deptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeanUID,
          logo: finalLogo,
          updatedAt: serverTimestamp()
        })

        if (oldDeanUID && oldDeanUID !== newDeanUID) {
          const oldDeanMember = allUsers.find(u => u.id === oldDeanUID)
          if (oldDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', oldDeanMember.membershipId), {
              department: '',
              status: '',
              joinedAt: ''
            })
          }
        }

        if (newDeanUID) {
          const newDeanMember = allUsers.find(u => u.id === newDeanUID)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              department: finalCode,
              status: 'accepted',
              joinedAt: serverTimestamp()
            })
          }
        } else if (oldDeanUID && oldCode !== finalCode) {
           const currentDeanMember = allUsers.find(u => u.id === oldDeanUID)
           if (currentDeanMember?.membershipId) {
             batch.update(doc(db, 'memberships', currentDeanMember.membershipId), {
              department: finalCode,
              status: 'accepted',
              joinedAt: serverTimestamp()
            })
           }
        }

        await batch.commit()
        handleCloseFormModal()
        showNotification(`Department "${trimmedName}" updated successfully.`, 'success', 'Department Updated')
      } else {
        const newDeptRef = doc(collection(db, 'departments'))
        let creationLogo = newDeptLogo || ''

        if (pendingLogoBlob) {
          const newFileName = `logo_${Date.now()}.png`
          const storageRef = ref(storage, `departments/${newDeptRef.id}/${newFileName}`)
          await uploadBytes(storageRef, pendingLogoBlob)
          creationLogo = await getDownloadURL(storageRef)
        }

        batch.set(newDeptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeptDean,
          programHead: '',
          logo: creationLogo,
          roomStyle: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (newDeptDean) {
          const newDeanMember = allUsers.find(u => u.id === newDeptDean)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              department: finalCode,
              status: 'accepted',
              joinedAt: serverTimestamp()
            })
          }
        }

        await batch.commit()
        handleCloseFormModal()
        showNotification(`Department "${trimmedName}" created successfully.`, 'success', 'Department Created')
      }
    } catch (error) {
      console.error('Error saving department:', error)
      showNotification('Failed to save department. Please try again.', 'error', 'Error Saving Department')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDelete = (dept: Department) => {
    setDeptToDelete(dept)
    setIsDeleteModalOpen(true)
    setDeleteConfirmName('')
  }

  const handleCloseDeleteModal = () => {
    setIsDeleteModalOpen(false)
    setDeptToDelete(null)
    setDeleteConfirmName('')
  }

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deptToDelete || deleteConfirmName !== deptToDelete.name) return

    setIsDeleting(true)
    try {
      const deptName = deptToDelete.name
      const batch = writeBatch(db)
      batch.delete(doc(db, 'departments', deptToDelete.id))

      // Clear department for all members of this department
      const membersToUpdate = allUsers.filter(u => u.department === deptToDelete.code)
      membersToUpdate.forEach(member => {
        if (member.membershipId) {
          batch.update(doc(db, 'memberships', member.membershipId), {
            department: '',
            status: '',
            joinedAt: ''
          })
        }
      })

      await batch.commit()
      handleCloseDeleteModal()
      showNotification(`Department "${deptName}" deleted successfully.`, 'success', 'Department Deleted')
    } catch (error) {
      console.error('Error deleting department:', error)
      showNotification('Failed to delete department. Please try again.', 'error', 'Error Deleting Department')
    } finally {
      setIsDeleting(false)
    }
  }

  const deanOptions = useMemo(() => {
    const deanNames = availableDeans
      .filter(dean => {
        const assignedDept = departments.find(d => d.deanUID === dean.id)
        return !(assignedDept && assignedDept.id !== editingDept?.id)
      })
      .map(dean => dean.name)
      .filter(name => name && name.trim() !== '' && name !== 'None')
      .sort((a, b) => a.localeCompare(b))

    return ['None', ...Array.from(new Set(deanNames))]
  }, [availableDeans, departments, editingDept?.id])

  const deptMemberColumns: ColumnDef<Member>[] = [
    {
      header: 'Member Info',
      width: '45%',
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
      width: '25%',
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
        <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">
          {member.joinedDate}
        </span>
      )
    }
  ];

  const deptColumns: ColumnDef<Department>[] = [
    {
      header: 'Department',
      width: '35%',
      render: (dept) => (
        <div className="flex items-center gap-4">
          {dept.logo && !logoErrors[dept.logo] ? (
            <img
              src={dept.logo}
              alt={dept.name}
              className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={() => setLogoErrors(prev => ({ ...prev, [dept.logo]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
              <DepartmentIcon className="h-5 w-5" />
            </div>
          )}
          <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
            {dept.name}
          </span>
        </div>
      )
    },
    {
      header: 'Code',
      width: '16%',
      render: (dept) => <span className="text-sm font-medium text-gray-500">{dept.code}</span>
    },
    {
      header: 'Dean',
      width: '16%',
      render: (dept) => <span className="text-sm font-semibold text-gray-600">{dept.deanName}</span>
    },
    {
      header: 'Members',
      width: '16%',
      render: (dept) => (
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
          <UsersIcon className="h-4 w-4 text-gray-400" />
          {dept.memberCount}
        </div>
      )
    },
    {
      header: 'Created Date',
      width: '16%',
      render: (dept) => <span className="text-sm font-medium text-gray-500">{dept.createdDate}</span>
    },
    {
      header: 'Actions',
      width: '2%',
      align: 'right',
      render: (dept) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Edit department"
            className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
            onClick={() => handleOpenEdit(dept)}
          >
            <EditIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Remove department"
            className="h-8 w-8 rounded-lg bg-white text-rose-500 shadow-sm border border-slate-200 hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5 transition-all"
            onClick={() => handleOpenDelete(dept)}
          >
            <TrashIcon className="h-4 w-4" />
          </IconButton>
        </div>
      )
    }
  ];

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <style>{`
        @keyframes walkAcross_right {
          0% { left: -20%; }
          100% { left: 120%; }
        }
        @keyframes walkAcross_left {
          0% { left: 120%; }
          100% { left: -20%; }
        }
        @keyframes walkBob {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(3deg); }
          50% { transform: translateY(0) rotate(0deg); }
          75% { transform: translateY(-2px) rotate(-3deg); }
        }
        @keyframes walkIn_right {
          from { left: -20%; }
          to { left: var(--stop-pos, 40%); }
        }
        @keyframes walkOut_right {
          from { left: var(--stop-pos, 40%); }
          to { left: 120%; }
        }
        @keyframes walkIn_left {
          from { left: 120%; }
          to { left: var(--stop-pos, 40%); }
        }
        @keyframes walkOut_left {
          from { left: var(--stop-pos, 40%); }
          to { left: -20%; }
        }
        @keyframes imposterHingeOpen {
          from { transform: rotate(0deg); }
          to { transform: rotate(-55deg); }
        }
        @keyframes imposterHingeClose {
          from { transform: rotate(-55deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes imposterRevealOn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes imposterRevealOff {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes tongueWiggle {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(12deg); }
          40% { transform: rotate(-8deg); }
          60% { transform: rotate(10deg); }
          80% { transform: rotate(-6deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideRight {
          from { left: -20%; }
          to { left: 120%; }
        }
      `}</style>
      {/* Create/Edit Department Modal */}
      {(isCreateModalOpen || editingDept) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl overflow-hidden">
              <h3 className="text-xl font-bold">{editingDept ? 'Edit Department' : 'Create Department'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingDept ? 'Update the details of this university department.' : 'Add a new university department to the system.'}
              </p>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
              <div>
                <label htmlFor="dept-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Department Name <span className="text-rose-500">*</span>
                  {errors.name === 'exists' && (
                    <span className="ml-2 text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                      Name already exists
                    </span>
                  )}
                </label>
                <TextInput
                  id="dept-name"
                  value={newDeptName}
                  onChange={(val) => {
                    setNewDeptName(val)
                    if (errors.name) setErrors(prev => ({ ...prev, name: null }))
                  }}
                  placeholder="e.g. College of Information Technology"
                  error={!!errors.name}
                  autoFocus
                />
              </div>

              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <label className="block text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Logo
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`h-32 w-32 rounded-full border-2 bg-gray-50 flex items-center justify-center overflow-hidden transition-all duration-200 hover:border-[var(--brand-color)] hover:bg-gray-50 group relative shadow-md ${
                      newDeptLogo && !logoErrors[newDeptLogo] ? 'border-solid border-gray-300' : 'border-dashed border-gray-400'
                    }`}
                  >
                    {newDeptLogo && !logoErrors[newDeptLogo] ? (
                      <img 
                        src={newDeptLogo} 
                        alt="Logo preview"
                        className="h-full w-full object-cover"
                        onError={() => setLogoErrors(prev => ({ ...prev, [newDeptLogo]: true }))}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                        <DepartmentIcon className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                      <UploadIcon className="h-8 w-8 text-white" strokeWidth={3.5} />
                    </div>
                  </button>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <label htmlFor="dept-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Code <span className="text-rose-500">*</span>
                      {errors.code === 'exists' && (
                        <span className="ml-2 text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                          Code already exists
                        </span>
                      )}
                    </label>
                    <TextInput
                      id="dept-code"
                      value={newDeptCode}
                      onChange={(val) => {
                        setNewDeptCode(val)
                        if (errors.code) setErrors(prev => ({ ...prev, code: null }))
                      }}
                      placeholder="e.g. CITE"
                      error={!!errors.code}
                    />
                  </div>

                  <div>
                    <label htmlFor="dept-dean" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Assigned Dean
                    </label>
                    <SingleSelectDropdown
                      options={deanOptions}
                      value={newDeptDeanName}
                      onChange={setNewDeptDeanName}
                      onToggle={setIsDeanDropdownOpen}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseFormModal}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting 
                    ? (editingDept ? 'Saving Changes...' : 'Creating Department...') 
                    : (editingDept ? 'Save Changes' : 'Create Department')}
                </Button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isDeanDropdownOpen && !isSubmitting) {
                handleCloseFormModal()
              }
            }} 
          />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && deptToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-bold">Delete Department</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this department from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 overflow-hidden shrink-0">
                  {deptToDelete.logo && !logoErrors[deptToDelete.logo] ? (
                    <img 
                      src={deptToDelete.logo} 
                      alt="" 
                      className="h-full w-full object-cover"
                      onError={() => setLogoErrors(prev => ({ ...prev, [deptToDelete.logo]: true }))}
                    />
                  ) : (
                    <DepartmentIcon className="h-7 w-7 text-gray-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{deptToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{deptToDelete.code}</p>
                </div>
              </div>

              <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this department and unassign all its members. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="delete-dept-confirm" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
                      To confirm, please type:
                    </label>
                    <p className="text-sm font-bold text-rose-600 mb-2">
                      "{deptToDelete.name}"
                    </p>
                    <TextInput
                      id="delete-dept-confirm"
                      value={deleteConfirmName}
                      onChange={(val) => setDeleteConfirmName(val)}
                      placeholder="Enter department name..."
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDeleteModal}
                    disabled={isDeleting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isDeleting || deleteConfirmName !== deptToDelete.name}
                    className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isDeleting) {
                handleCloseDeleteModal()
              }
            }} 
          />
        </div>
      )}

      {/* Department Members Modal */}
      {selectedDept && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-4xl h-[65vh] min-h-[480px] max-h-[85vh] rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white shrink-0">
              <div className="flex items-center gap-4">
                {selectedDept.logo && !logoErrors[selectedDept.logo] ? (
                  <img
                    src={selectedDept.logo}
                    alt={selectedDept.name}
                    className="h-14 w-14 rounded-full border-2 border-white/20 object-cover bg-white/10 shrink-0"
                    onError={() => setLogoErrors(prev => ({ ...prev, [selectedDept.logo]: true }))}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-white/80 shrink-0">
                    <DepartmentIcon className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold leading-tight">{selectedDept.name}</h3>
                  <p className="mt-1 text-sm text-white/80">{selectedDept.code} • {deptMembers.length} {deptMembers.length === 1 ? 'Member' : 'Members'}</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden bg-white flex flex-col min-h-0">
              <DataTable
                className="h-full flex-1 border-none shadow-none rounded-none"
                data={deptMembers}
                columns={deptMemberColumns}
                emptyTitle="No members found"
                emptyDescription="No members assigned to this department yet."
              />
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setSelectedDept(null)} />
        </div>
      )}

      {/* Crop Modal */}
      {cropModalData.isOpen && (
        <CropModal
          imageSrc={cropModalData.imageSrc}
          onCropComplete={handleCropComplete}
          onClose={() => setCropModalData({ isOpen: false, imageSrc: '' })}
          isUploading={false}
          title="Adjust Department Logo"
          hideOverlay={true}
        />
      )}

      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="Academic Departments" 
          description="Manage university departments, assign deans, and oversee faculty members." 
        />


        <DataTable
          data={filteredDepartments}
          columns={deptColumns}
          searchPlaceholder="Search departments..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={
            <FilterDropdown
              label="Filters"
              className="w-full sm:w-auto"
              buttonClassName="w-full sm:w-auto"
              onClearAll={() => {
                setDeanStatusFilters([])
                setDeptSizeFilters([])
              }}
              groups={[
                {
                  id: 'deanStatus',
                  title: 'Dean Status',
                  options: [
                    { value: 'Assigned', label: 'Assigned' },
                    { value: 'Unassigned', label: 'Unassigned' }
                  ],
                  selectedValues: deanStatusFilters,
                  onChange: setDeanStatusFilters
                },
                {
                  id: 'size',
                  title: 'Department Size',
                  options: [
                    { value: 'Empty', label: 'Empty (0)' },
                    { value: 'Small', label: 'Small (1-10)' },
                    { value: 'Medium', label: 'Medium (11-50)' },
                    { value: 'Large', label: 'Large (51+)' }
                  ],
                  selectedValues: deptSizeFilters,
                  onChange: setDeptSizeFilters
                }
              ]}
            />
          }
          primaryAction={
            <div className="flex gap-2 w-full lg:w-auto">
              {showAmongUsButton && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-gray-500 animate-in fade-in zoom-in cursor-default"
                    onClick={() => window.dispatchEvent(new Event('spawn-crewmate'))}
                    icon={<span className="text-xl leading-none -mt-0.5">ඞ</span>}
                    label="Spawn Crewmate"
                    title="Spawn Crewmate"
                  />
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-red-400 hover:border-red-500 hover:bg-red-50 animate-in fade-in zoom-in cursor-default"
                    onClick={() => window.dispatchEvent(new Event('spawn-imposter'))}
                    icon={<span className="text-xl text-red-500 leading-none -mt-0.5">ඞ</span>}
                    label="Spawn Imposter"
                    title="Spawn Imposter"
                  />
                </>
              )}
              {showEasterEggControls && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-brand-color animate-in fade-in zoom-in"
                    onClick={() => setIsGalleryModalOpen(true)}
                    icon={<span className="text-xl leading-none">🖼️</span>}
                    label="Easter Egg Gallery"
                    title="Easter Egg Gallery"
                  />
                  <IconOnlyButton
                    variant="outline"
                    className="shrink-0 border-gray-400 hover:border-brand-color animate-in fade-in zoom-in"
                    onClick={() => setIsEasterEggsEnabled(p => !p)}
                    icon={<span className="text-xl leading-none">{isEasterEggsEnabled ? '👻' : '🚫'}</span>}
                    label={isEasterEggsEnabled ? "Disable Easter Eggs" : "Enable Easter Eggs"}
                    title={isEasterEggsEnabled ? "Disable Easter Eggs" : "Enable Easter Eggs"}
                  />
                </>
              )}
              <Button
                variant="brand"
                className="shrink-0 flex-1 lg:flex-none"
                onClick={() => setIsCreateModalOpen(true)}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Add Department
              </Button>
            </div>
          }
          emptyTitle="No departments found"
          emptyDescription="Try adjusting your filters or search terms."
          emptyIcon={<DepartmentIcon className="h-12 w-12" />}
          onRowClick={(dept) => setSelectedDept(dept)}
        />
      </div>

      {/* Easter Egg Gallery Modal */}
      {isGalleryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-7xl h-[90vh] rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white flex justify-between items-start shrink-0">
              <div>
                <h3 className="text-2xl font-bold leading-tight flex items-center gap-2"><span className="text-3xl">👻</span> Easter Egg Gallery</h3>
                <p className="mt-1 text-sm text-white/80">Selected: <strong className="text-white">{selectedAnomalies.length} / {departments.length}</strong> (Forced Spawns)</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedAnomalies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAnomalies([])}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/20 cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <IconOnlyButton 
                  label="Close gallery" 
                  onClick={() => setIsGalleryModalOpen(false)} 
                  icon={<CloseIcon className="h-6 w-6 text-white" />} 
                  className="hover:bg-white/20 text-white"
                />
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-transparent">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {Array.from({ length: ANOMALY_NAMES.length }, (_, i) => i + 1).map(eggNum => {
                  const isSelected = selectedAnomalies.includes(eggNum);
                  return (
                    <div 
                      key={eggNum} 
                      className="flex flex-col gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                      onClick={() => {
                        setSelectedAnomalies(prev => {
                          if (prev.includes(eggNum)) {
                            return prev.filter(n => n !== eggNum);
                          } else if (prev.length < departments.length) {
                            return [...prev, eggNum];
                          }
                          return prev;
                        });
                      }}
                    >
                      <div className={`w-full aspect-[8/11] @container relative rounded-lg overflow-hidden border-4 shadow-lg bg-transparent shrink-0 group transition-all duration-200 ${isSelected ? 'border-green-500 shadow-green-500/50 scale-[1.02]' : 'border-gray-200'}`}>
                        <></>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full shadow-lg z-10 animate-in zoom-in-50 duration-200">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <span className="inline-block px-2 py-1 rounded bg-white/50 backdrop-blur-sm text-xs font-bold text-gray-700 mb-1 border border-gray-200 shadow-sm uppercase">{ANOMALY_NAMES[eggNum - 1]}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => setIsGalleryModalOpen(false)} 
          />
        </div>
      )}

      {/* Custom Global Tooltip for the Wheel */}
      {wheelTooltip && wheelTooltip.visible && (
        <div 
          className="fixed z-50 pointer-events-none px-4 py-2 bg-slate-900/95 backdrop-blur-md border-[2px] border-amber-400/80 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_15px_rgba(245,158,11,0.2)] text-amber-50 text-sm font-bold tracking-wide transform -translate-x-1/2 -translate-y-full flex items-center justify-center whitespace-nowrap transition-all duration-75"
          style={{ left: wheelTooltip.x, top: wheelTooltip.y - 14 }}
        >
          {wheelTooltip.text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[8px] border-x-transparent border-t-[8px] border-t-amber-400/80"></div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-slate-900 -mt-[3px]"></div>
        </div>
      )}

      <Snackbar
        isOpen={snackbar.isOpen}
        onClose={() => setSnackbar(prev => ({ ...prev, isOpen: false }))}
        title={snackbar.title}
        message={snackbar.message}
        type={snackbar.type}
        position="top-center"
      />
    </section>
  )
}

export default DepartmentsPage
