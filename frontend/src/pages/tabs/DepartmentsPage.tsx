import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { DepartmentIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, ChevronDownIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db, storage } from '../../firebase'
import { collection, serverTimestamp, onSnapshot, query, orderBy, doc, writeBatch, where, limit } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { CropModal } from '../../components/CropModal'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import type { Member } from '../../types/member'



interface Department {
  id: string
  code: string
  name: string
  deanUID: string
  deanName: string
  memberCount?: number
  createdDate: string
  logo: string
}

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}

function DepartmentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
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
            name: userData.fullName || '',
            email: userData.email || '',
            role: (mData.role as any) || 'Instructor',
            status: (userData.isActive !== false) ? 'Active' : 'Inactive',
            department: mData.departmentCode || '',
            joinedDate: userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric'
            }) : '—',
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

  const availableDeans = allUsers.filter(u => u.role === 'Dean')

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
      .filter((dept) =>
        [dept.name, dept.code, dept.deanName].some((val) =>
          val.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
  }, [departments, allUsers, searchTerm])

  const summaryStats = useMemo(() => {
    const totalDepartments = departments.length;
    const totalFacultyCount = allUsers.filter(u => u.department).length;
    const assignedDeansCount = departments.filter(d => d.deanUID).length;
    const avgDeptSize = totalDepartments ? Math.round(totalFacultyCount / totalDepartments) : 0;
    const deansPercentage = totalDepartments > 0 ? Math.round((assignedDeansCount / totalDepartments) * 100) : 0;

    return {
      totalDepartments,
      totalFacultyCount,
      assignedDeansCount,
      avgDeptSize,
      deansPercentage
    };
  }, [departments, allUsers]);

  const deptMembers = selectedDept 
    ? allUsers
        .filter(m => m.department === selectedDept.code)
        .sort((a, b) => {
          if (a.role === 'Dean') return -1
          if (b.role === 'Dean') return 1
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
              departmentCode: '',
              joinedAt: serverTimestamp()
            })
          }
        }

        if (newDeanUID) {
          const newDeanMember = allUsers.find(u => u.id === newDeanUID)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
          }
        } else if (oldDeanUID && oldCode !== finalCode) {
           const currentDeanMember = allUsers.find(u => u.id === oldDeanUID)
           if (currentDeanMember?.membershipId) {
             batch.update(doc(db, 'memberships', currentDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
           }
        }
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
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (newDeptDean) {
          const newDeanMember = allUsers.find(u => u.id === newDeptDean)
          if (newDeanMember?.membershipId) {
            batch.update(doc(db, 'memberships', newDeanMember.membershipId), {
              departmentCode: finalCode,
              joinedAt: serverTimestamp()
            })
          }
        }
      }

      await batch.commit()
      handleCloseFormModal()
    } catch (error) {
      console.error('Error saving department:', error)
      alert('Failed to save department.')
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
      const batch = writeBatch(db)
      batch.delete(doc(db, 'departments', deptToDelete.id))

      // Clear departmentCode for all members of this department
      const membersToUpdate = allUsers.filter(u => u.department === deptToDelete.code)
      membersToUpdate.forEach(member => {
        if (member.membershipId) {
          batch.update(doc(db, 'memberships', member.membershipId), {
            departmentCode: '',
            joinedAt: serverTimestamp()
          })
        }
      })

      await batch.commit()
      handleCloseDeleteModal()
    } catch (error) {
      console.error('Error deleting department:', error)
      alert('Failed to delete department.')
    } finally {
      setIsDeleting(false)
    }
  }

  const deanOptions = [
    'None',
    ...availableDeans
      .filter(dean => {
        const assignedDept = departments.find(d => d.deanUID === dean.id)
        return !(assignedDept && assignedDept.id !== editingDept?.id)
      })
      .map(dean => dean.name)
      .sort((a, b) => a.localeCompare(b))
  ]

  const deptMemberColumns: ColumnDef<Member>[] = [
    {
      header: 'Member Info',
      width: '50%',
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
      header: 'Assigned Role',
      width: '25%',
      render: (member) => (
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${roleClasses[member.role]?.split(' ')[0] || 'bg-gray-200'}`} />
          <span className={`text-[0.7rem] font-bold uppercase tracking-widest ${roleClasses[member.role]?.split(' ')[1] || 'text-gray-500'}`}>
            {member.role}
          </span>
        </div>
      )
    },
    {
      header: 'Current Status',
      width: '25%',
      render: (member) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${
          member.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
          member.status === 'Inactive' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {member.status}
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
              className="h-10 w-10 rounded-full border border-gray-300 object-cover"
              onError={() => setLogoErrors(prev => ({ ...prev, [dept.logo]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-gray-400">
              <DepartmentIcon className="h-6 w-6" />
            </div>
          )}
          <span className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
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
        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <IconButton
            label="Edit department"
            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
            onClick={() => handleOpenEdit(dept)}
          >
            <EditIcon className="h-4.5 w-4.5" />
          </IconButton>
          <IconButton
            label="Remove department"
            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
            onClick={() => handleOpenDelete(dept)}
          >
            <TrashIcon className="h-4.5 w-4.5" />
          </IconButton>
        </div>
      )
    }
  ];

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Create/Edit Department Modal */}
      {(isCreateModalOpen || editingDept) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
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
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Delete Department</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this department from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
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

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this department and unassign all its members. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                      To confirm, please type:
                    </label>
                    <p className="mt-0.5 text-sm font-bold text-rose-600">
                      "{deptToDelete.name}"
                    </p>
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder="Enter department name..."
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-sm"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseDeleteModal}
                    disabled={isDeleting}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeleting || deleteConfirmName !== deptToDelete.name}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
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
            className="w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white flex justify-between items-start shrink-0">
              <div className="flex items-center gap-4">
                {selectedDept.logo && !logoErrors[selectedDept.logo] ? (
                  <img
                    src={selectedDept.logo}
                    alt={selectedDept.name}
                    className="h-14 w-14 rounded-full border-2 border-white/20 object-cover bg-white/10"
                    onError={() => setLogoErrors(prev => ({ ...prev, [selectedDept.logo]: true }))}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-white/80">
                    <DepartmentIcon className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold leading-tight">{selectedDept.name}</h3>
                  <p className="mt-1 text-sm text-white/80">{selectedDept.code} • {selectedDept.memberCount} Members</p>
                </div>
              </div>
              <IconButton 
                label="Close modal" 
                onClick={() => setSelectedDept(null)}
                className="text-white/80 hover:text-white hover:bg-white/10"
              >
                <CloseIcon className="h-6 w-6" />
              </IconButton>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar bg-slate-50">
              <DataTable
                data={deptMembers}
                columns={deptMemberColumns}
                emptyTitle="No members found"
                emptyDescription="No members assigned to this department yet."
                emptyIcon={<UsersIcon className="h-12 w-12" />}
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

      <div className="space-y-6">
        <SectionHeader 
          title="Academic Departments" 
          description="Manage university departments, assign deans, and oversee faculty members." 
        />

        {/* ══ Department Overview ══ */}
        {(() => {
          const { totalDepartments, totalFacultyCount, avgDeptSize, assignedDeansCount, deansPercentage } = summaryStats
          const unassigned = totalDepartments - assignedDeansCount

          const R = 28
          const C = 2 * Math.PI * R
          const filled = C * (deansPercentage / 100)

          const facultyInDepts = allUsers.filter(u => u.department)
          const roleCounts = {
            Instructor: facultyInDepts.filter(u => u.role === 'Instructor').length,
            Dean: facultyInDepts.filter(u => u.role === 'Dean').length,
            'Program Head': facultyInDepts.filter(u => u.role === 'Program Head').length,
            Registrar: facultyInDepts.filter(u => u.role === 'Registrar').length,
            Admin: facultyInDepts.filter(u => u.role === 'Admin').length,
          }

          const roleRows = [
            { role: 'Instructor', count: roleCounts.Instructor, bg: 'bg-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50' },
            { role: 'Dean', count: roleCounts.Dean, bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-50' },
            { role: 'Program Head', count: roleCounts['Program Head'], bg: 'bg-rose-500', text: 'text-rose-600', light: 'bg-rose-50' },
            { role: 'Registrar', count: roleCounts.Registrar, bg: 'bg-blue-500', text: 'text-blue-600', light: 'bg-blue-50' },
          ]

          return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

              {/* ── TOP: Full-width gradient hero ── */}
              <div className="relative bg-[linear-gradient(135deg,var(--brand-color)_0%,#526f34_40%,#7b9d4f_80%,#a3c48b_100%)] px-6 py-5 overflow-hidden">
                <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
                <DepartmentIcon className="absolute -right-10 -top-10 h-52 w-52 text-white/[0.07] pointer-events-none" />

                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-0 justify-between">
                  {/* Left: headline */}
                  <div>
                    <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-white/60 mb-1">Academic Departments</p>
                    <div className="flex items-end gap-3">
                      <span className="text-[3.5rem] font-black leading-none tabular-nums text-white drop-shadow-lg">{totalDepartments}</span>
                      <div className="pb-1.5">
                        <p className="text-sm font-bold text-white/90 leading-tight">Total</p>
                        <p className="text-[0.65rem] text-white/50 font-medium">Registered</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: dept logo strip */}
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-3">
                      {departments.slice(0, 6).map((d, i) => (
                        <div
                          key={d.id}
                          className="h-10 w-10 rounded-full border-2 border-white/30 overflow-hidden bg-white/20 shadow-lg hover:-translate-y-1 transition-transform duration-200 cursor-default"
                          style={{ zIndex: 6 - i }}
                          title={d.name}
                        >
                          {d.logo && !logoErrors[d.logo] ? (
                            <img src={d.logo} alt={d.name} className="h-full w-full object-cover" onError={() => setLogoErrors(prev => ({ ...prev, [d.logo]: true }))} />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-white/10">
                              <DepartmentIcon className="h-5 w-5 text-white/70" />
                            </div>
                          )}
                        </div>
                      ))}
                      {departments.length > 6 && (
                        <div className="h-10 w-10 rounded-full border-2 border-white/30 bg-white/20 flex items-center justify-center text-white text-xs font-black shadow-lg" style={{ zIndex: 0 }}>
                          +{departments.length - 6}
                        </div>
                      )}
                    </div>
                    {departments.length === 0 && (
                      <span className="text-xs text-white/50 italic">No departments yet</span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── BOTTOM: 4 stat cards in a row ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 bg-slate-100 gap-px">

                {/* Card 1: Total Faculty */}
                <div className="group bg-white px-5 py-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400" />
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-slate-400">Faculty</span>
                    <UsersIcon className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-4xl font-black tabular-nums text-slate-900 leading-none mt-1">{totalFacultyCount}</span>
                  <p className="text-[0.65rem] text-slate-400 font-medium">enrolled members</p>
                  <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100 mt-3 shadow-inner">
                    {totalFacultyCount > 0 ? roleRows.map(({ role, count, bg }) => {
                      if (!count) return null
                      return <div key={role} className={`h-full ${bg}`} style={{ width: `${(count / totalFacultyCount) * 100}%` }} title={`${role}: ${count}`} />
                    }) : <div className="h-full w-full bg-slate-200" />}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1.5">
                    {roleRows.map(({ role, count, bg }) => count > 0 && (
                      <div key={role} className="flex items-center gap-1">
                        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${bg}`} />
                        <span className="text-[0.56rem] font-semibold text-slate-400 uppercase tracking-wider leading-none">{role.replace('Program Head', 'PH')} <span className="text-slate-600">{count}</span></span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card 2: Avg Dept Size */}
                <div className="group bg-white px-5 py-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-purple-400" />
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-slate-400">Avg. Size</span>
                    <UserIcon className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="text-4xl font-black tabular-nums text-slate-900 leading-none mt-1">{avgDeptSize}</span>
                  <p className="text-[0.65rem] text-slate-400 font-medium">members / department</p>
                  {/* Sparkline bars */}
                  <div className="flex items-end gap-0.5 h-10 mt-3 w-full">
                    {(() => {
                      const sizes = departments.map(d => allUsers.filter(u => u.department === d.code).length).sort((a, b) => a - b)
                      const maxBars = 12
                      const display = sizes.length > maxBars
                        ? Array.from({ length: maxBars }, (_, i) => sizes[Math.floor(i * (sizes.length - 1) / (maxBars - 1))])
                        : sizes.length > 0 ? sizes : [0]
                      const maxVal = Math.max(...display, 1)
                      return display.map((v, i) => (
                        <div key={i} className="flex-1 rounded-sm bg-purple-100 group-hover:bg-purple-200 transition-colors relative flex flex-col justify-end" style={{ height: '100%' }}>
                          <div className="rounded-sm bg-purple-400 group-hover:bg-purple-500 transition-colors w-full" style={{ height: `${Math.max(12, (v / maxVal) * 100)}%` }} title={`${v} members`} />
                        </div>
                      ))
                    })()}
                  </div>
                  <p className="text-[0.56rem] text-slate-400 font-bold uppercase tracking-[0.15em] mt-0.5">Size distribution</p>
                </div>

                {/* Card 3: Dean Coverage */}
                <div className="group bg-white px-5 py-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--brand-color)]" />
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-slate-400">Dean Coverage</span>
                    <UserIcon className="h-4 w-4 text-[var(--brand-color)]" />
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="relative shrink-0">
                      <svg width="60" height="60" viewBox="0 0 72 72" className="-rotate-90">
                        <circle cx="36" cy="36" r={R} fill="none" stroke="#f1f5f9" strokeWidth="7" />
                        <circle cx="36" cy="36" r={R} fill="none" stroke="var(--brand-color)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${filled} ${C}`} className="transition-all duration-1000 ease-out" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-base font-black text-slate-900 tabular-nums leading-none">{deansPercentage}<span className="text-[0.55rem] font-bold">%</span></span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-[0.58rem] text-slate-400 font-bold uppercase tracking-wider">Assigned</p>
                        <span className="text-xl font-black text-slate-900 tabular-nums leading-none">{assignedDeansCount}</span>
                      </div>
                      {unassigned > 0 ? (
                        <div>
                          <p className="text-[0.58rem] text-amber-500 font-bold uppercase tracking-wider">Unassigned</p>
                          <span className="text-xl font-black text-amber-500 tabular-nums leading-none">{unassigned}</span>
                        </div>
                      ) : totalDepartments > 0 ? (
                        <div className="flex items-center gap-1.5 bg-emerald-50 rounded-md px-2 py-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-[0.58rem] font-bold text-emerald-600 uppercase tracking-wider">Full Coverage</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Card 4: Role Breakdown */}
                <div className="group bg-white px-5 py-4 flex flex-col gap-1 hover:bg-slate-50 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-400" />
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-slate-400">Role Breakdown</span>
                    <UsersIcon className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="flex flex-col gap-2 mt-2">
                    {roleRows.map(({ role, count, bg, text, light }) => {
                      const pct = totalFacultyCount > 0 ? Math.round((count / totalFacultyCount) * 100) : 0
                      return (
                        <div key={role}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${bg}`} />
                              <span className="text-[0.6rem] font-bold text-slate-500 uppercase tracking-wider leading-none">{role}</span>
                            </div>
                            <span className={`text-[0.6rem] font-black tabular-nums ${text}`}>{count}</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full ${bg} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>
          )
        })()}

        <DataTable
          data={filteredDepartments}
          columns={deptColumns}
          searchPlaceholder="Search departments..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          primaryAction={
            <Button
              variant="brand"
              className="shrink-0 w-full lg:w-auto"
              onClick={() => setIsCreateModalOpen(true)}
              icon={<PlusIcon className="h-5 w-5" />}
            >
              Add Department
            </Button>
          }
          emptyTitle="No departments found"
          emptyDescription="Try adjusting your filters or search terms."
          emptyIcon={<DepartmentIcon className="h-12 w-12" />}
          onRowClick={(dept) => setSelectedDept(dept)}
        />
      </div>
    </section>
  )
}

export default DepartmentsPage
