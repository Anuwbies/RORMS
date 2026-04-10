import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { DepartmentIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, CameraIcon, ChevronDownIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { db } from '../../firebase'
import { collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, where, doc, updateDoc, writeBatch } from 'firebase/firestore'

interface Member {
  id: string
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
  memberCount: number
  roomCount: number
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
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [newDeptDean, setNewDeptDean] = useState('') // Storing Dean UID
  const [isDeanDropdownOpen, setIsDeanDropdownOpen] = useState(false)
  const [newDeptLogo, setNewDeptLogo] = useState('')
  const [errors, setErrors] = useState<{
    name: 'required' | 'exists' | null;
    code: 'required' | 'exists' | null;
  }>({ name: null, code: null })

  // Fetch All Users
  useEffect(() => {
    const q = query(collection(db, 'users'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.fullName || '',
          email: data.email || '',
          role: data.role || 'Instructor',
          status: (data.isActive !== false) ? 'Active' : 'Inactive',
          department: data.department || '',
          joinedDate: data.createdAt ? data.createdAt.toDate().toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
          }) : '—',
          avatar: data.profilePicture || '',
        }
      }) as Member[]
      setAllUsers(usersData)
    })
    return () => unsubscribe()
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

  const filteredDepartments = departments.filter((dept) =>
    [dept.name, dept.code, dept.deanName].some((val) =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const deptMembers = selectedDept 
    ? allUsers.filter(m => m.department === selectedDept.code)
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
    setErrors({ name: null, code: null })
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setNewDeptLogo(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
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

    // Uniqueness check (Case-insensitive)
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
    const finalLogo = newDeptLogo || `https://ui-avatars.com/api/?name=${trimmedCode || 'DEPT'}&background=random`
    const finalCode = trimmedCode

    try {
      const batch = writeBatch(db)

      if (editingDept) {
        // Handle changes for existing department
        const oldDeanUID = editingDept.deanUID
        const newDeanUID = newDeptDean
        const oldCode = editingDept.code

        // 1. Update department doc
        const deptRef = doc(db, 'departments', editingDept.id)
        batch.update(deptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeanUID,
          logo: finalLogo,
          updatedAt: serverTimestamp()
        })

        // 2. Handle Dean reassignment
        if (oldDeanUID && oldDeanUID !== newDeanUID) {
          // Clear old dean's department
          batch.update(doc(db, 'users', oldDeanUID), {
            department: '',
            updatedAt: serverTimestamp()
          })
        }

        if (newDeanUID) {
          // Update new dean's department
          batch.update(doc(db, 'users', newDeanUID), {
            department: finalCode,
            updatedAt: serverTimestamp()
          })
        } else if (oldDeanUID && oldCode !== finalCode) {
           // If dean didn't change but code did, update their department field
           batch.update(doc(db, 'users', oldDeanUID), {
            department: finalCode,
            updatedAt: serverTimestamp()
          })
        }
      } else {
        // Create new department
        const newDeptRef = doc(collection(db, 'departments'))
        batch.set(newDeptRef, {
          name: trimmedName,
          code: finalCode,
          dean: newDeptDean,
          logo: finalLogo,
          memberCount: 0,
          roomCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (newDeptDean) {
          batch.update(doc(db, 'users', newDeptDean), {
            department: finalCode,
            updatedAt: serverTimestamp()
          })
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

      // 1. Delete the department document
      batch.delete(doc(db, 'departments', deptToDelete.id))

      // 2. Clear dean's department field if assigned
      if (deptToDelete.deanUID) {
        batch.update(doc(db, 'users', deptToDelete.deanUID), {
          department: '',
          updatedAt: serverTimestamp()
        })
      }

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
      // Find which department this dean is assigned to
      const assignedDept = departments.find(d => d.deanUID === dean.id)
      // A dean is "taken" if they are assigned to any department OTHER than the one being edited
      const isTaken = assignedDept && assignedDept.id !== editingDept?.id
      
      return {
        label: dean.name,
        value: dean.id,
        isDisabled: isTaken,
        subLabel: isTaken ? assignedDept.code : undefined
      }
    }).sort((a, b) => {
      // Put disabled options at the end
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
                    <span className="ml-2 text-[12px] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
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
                      newDeptLogo || newDeptCode ? 'border-solid border-gray-300' : 'border-dashed border-gray-400'
                    }`}
                  >
                    {newDeptLogo ? (
                      <img 
                        src={newDeptLogo} 
                        alt="Logo preview"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${newDeptCode || 'DEPT'}&background=random`
                        }}
                      />
                    ) : newDeptCode ? (
                      <img 
                        src={`https://ui-avatars.com/api/?name=${newDeptCode}&background=random`} 
                        alt="New Department"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CameraIcon className="h-10 w-10 text-gray-500 group-hover:text-gray-600 transition-colors" />
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
                        <span className="ml-2 text-[12px] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
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
                <img
                  src={selectedDept.logo}
                  alt={selectedDept.name}
                  className="h-14 w-14 rounded-full border-2 border-white/20 object-cover bg-white/10"
                />
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
                        <img
                          src={member.avatar || `https://ui-avatars.com/api/?name=${member.name}&background=random`}
                          alt={member.name}
                          className="h-10 w-10 rounded-full border border-gray-100 object-cover"
                        />
                        <div>
                          <p className="text-sm font-bold text-gray-900">{member.name}</p>
                          <p className="text-xs font-medium text-gray-500">{member.email}</p>
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
                          <img
                            src={dept.logo}
                            alt={dept.name}
                            className="h-10 w-10 rounded-full border border-gray-100 object-cover"
                          />
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
