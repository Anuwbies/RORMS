import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { DepartmentIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, ChevronDownIcon, CheckIcon, UserIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { db, storage } from '../../firebase'
import { collection, serverTimestamp, onSnapshot, query, orderBy, doc, writeBatch, where, limit } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { CropModal } from '../../components/CropModal'

interface Member {
  id: string
  membershipId: string
  name: string
  email: string
  role: string
  status: string
  department?: string
  joinedDate: string
  avatar: string
}

interface DropdownOption {
  label: string
  value: string
  isDisabled?: boolean
  subLabel?: string
}

interface SingleSelectDropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  onOpenChange?: (open: boolean) => void
  className?: string
}

function SingleSelectDropdown({ 
  options, 
  value, 
  onChange, 
  onOpenChange,
  className = '' 
}: SingleSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option: DropdownOption) => {
    if (option.isDisabled) return
    onChange(option.value)
    setIsOpen(false)
  }

  const longestOption = options.reduce((a, b) => (a.label.length > b.label.length ? a : b), { label: '', value: '' }).label
  const selectedOption = options.find(o => o.value === value)

  useLayoutEffect(() => {
    if (!menuWidthRef.current) {
      return
    }
    setMenuMinWidth(menuWidthRef.current.offsetWidth)
  }, [longestOption])

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
      style={menuMinWidth ? { minWidth: `${menuMinWidth}px` } : undefined}
    >
      <div
        ref={menuWidthRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-md border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-xs">
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-xs text-gray-900 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
      >
        <span className="whitespace-nowrap">{selectedOption?.label || 'None'}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-20 mt-2 min-w-full overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
            {options.map((option) => {
              const isSelected = value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.isDisabled}
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-semibold' 
                      : option.isDisabled
                        ? 'text-gray-500 cursor-not-allowed italic'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {isSelected && <CheckIcon className="ml-auto h-4 w-4 text-[var(--brand-color)]" strokeWidth={3} />}
                  {option.subLabel && <span className="ml-auto text-[10px] font-bold uppercase opacity-50">{option.subLabel}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [newDeptDean, setNewDeptDean] = useState('') // Storing Dean UID
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
            role: mData.role || 'Instructor',
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
    setNewDeptDean(dept.deanUID)
    setNewDeptLogo(dept.logo)
    setErrors({ name: null, code: null })
  }

  const handleCloseFormModal = () => {
    setIsCreateModalOpen(false)
    setEditingDept(null)
    setNewDeptName('')
    setNewDeptCode('')
    setNewDeptDean('')
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

  const deanOptions: DropdownOption[] = [
    { label: 'None', value: '', isDisabled: false },
    ...availableDeans.map(dean => {
      const assignedDept = departments.find(d => d.deanUID === dean.id)
      const isTaken = assignedDept && assignedDept.id !== editingDept?.id
      return {
        label: dean.name,
        value: dean.id,
        isDisabled: isTaken,
        subLabel: isTaken ? assignedDept.code : undefined
      }
    }).sort((a, b) => {
      if (a.isDisabled && !b.isDisabled) return 1
      if (!a.isDisabled && b.isDisabled) return -1
      return a.label.localeCompare(b.label)
    })
  ]

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Create/Edit Department Modal */}
      {(isCreateModalOpen || editingDept) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
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
                    <span className="ml-2 text-[10px] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                      Name already exists
                    </span>
                  )}
                </label>
                <input
                  id="dept-name"
                  type="text"
                  value={newDeptName}
                  onChange={(e) => {
                    setNewDeptName(e.target.value)
                    if (errors.name) setErrors(prev => ({ ...prev, name: null }))
                  }}
                  placeholder="e.g. College of Information Technology"
                  className={`w-full rounded-md border px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                    errors.name 
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                      : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                  }`}
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
                        <span className="ml-2 text-[10px] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                          Code already exists
                        </span>
                      )}
                    </label>
                    <input
                      id="dept-code"
                      type="text"
                      value={newDeptCode}
                      onChange={(e) => {
                        setNewDeptCode(e.target.value)
                        if (errors.code) setErrors(prev => ({ ...prev, code: null }))
                      }}
                      placeholder="e.g. CITE"
                      className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                        errors.code 
                          ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                          : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                      }`}
                    />
                  </div>

                  <div>
                    <label htmlFor="dept-dean" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Assigned Dean
                    </label>
                    <SingleSelectDropdown
                      options={deanOptions}
                      value={newDeptDean}
                      onChange={setNewDeptDean}
                      onOpenChange={setIsDeanDropdownOpen}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  disabled={isSubmitting}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting 
                    ? (editingDept ? 'Saving Changes...' : 'Creating Department...') 
                    : (editingDept ? 'Save Changes' : 'Create Department')}
                </button>
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
              <p className="mt-1 text-sm text-white/80">
                This action cannot be undone. All data associated with this department will be permanently removed.
              </p>
            </div>
            
            <form onSubmit={handleDeleteSubmit} className="p-6 space-y-5">
              <div>
                <p className="mb-4 text-sm text-gray-600">
                  To confirm deletion, please type <span className="font-bold text-gray-900">"{deptToDelete.name}"</span> below:
                </p>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder="Enter department name"
                  className="w-full rounded-md border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-50 shadow-sm"
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
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Department'}
                </button>
              </div>
            </form>
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
            className="w-full max-w-2xl rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white flex justify-between items-start">
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
            
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {deptMembers.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  No members assigned to this department yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {deptMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        {member.avatar && !avatarErrors[member.avatar] ? (
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                            onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar]: true }))}
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-300 bg-gray-50 text-gray-400">
                            <UserIcon className="h-6 w-6" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-gray-900">{member.name}</p>
                          <p className="text-xs font-medium text-gray-500">
                            {member.department || (
                              member.role === 'Admin' ? 'Administrative Office' :
                              member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned'
                            )}
                          </p>
                        </div>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roleClasses[member.role] || 'bg-gray-100 text-gray-700'}`}>
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Departments
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Manage university departments, assigned deans, and resource allocation.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <DepartmentIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total Departments</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{departments.length}</p>
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
                placeholder="Search departments..."
                className="w-full rounded-md border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
            >
              <PlusIcon className="h-5 w-5" />
              Add Department
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[30%]">
                    Department
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Code
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Dean
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Members
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Created Date
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      Loading departments...
                    </td>
                  </tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No departments found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredDepartments.map((dept) => (
                    <tr 
                      key={dept.id} 
                      className="transition hover:bg-gray-50/50 cursor-pointer group"
                      onClick={() => setSelectedDept(dept)}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
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
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-500">
                        {dept.code}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-600">
                        {dept.deanName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                          <UsersIcon className="h-4 w-4 text-gray-400" />
                          {dept.memberCount}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-500">
                        {dept.createdDate}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
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
                      </td>
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

export default DepartmentsPage
