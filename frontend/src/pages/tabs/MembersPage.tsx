import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, onSnapshot, orderBy, writeBatch, doc } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { UsersIcon, UserIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, ChevronDownIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

type MemberRole = 'Admin' | 'Registrar' | 'Dean' | 'Instructor'
type MemberStatus = 'Active' | 'Inactive' | 'Pending'

interface Department {
  id: string
  name: string
  code: string
  dean: string
}

interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  department?: string
  joinedDate: string
  avatar: string
  membershipId?: string
}

const rolePriority: Record<MemberRole, number> = {
  Admin: 0,
  Registrar: 1,
  Dean: 2,
  Instructor: 3,
}

const roleClasses: Record<MemberRole, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}

const statusClasses: Record<MemberStatus, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-gray-100 text-gray-700',
  Pending: 'bg-amber-100 text-amber-700',
}

interface MultiSelectDropdownProps<T extends string> {
  label: string
  options: T[]
  selectedValues: T[]
  onChange: (values: T[]) => void
  className?: string
  onToggle?: (isOpen: boolean) => void
}

function MultiSelectDropdown<T extends string>({ 
  label, 
  options, 
  selectedValues, 
  onChange, 
  className = '',
  onToggle
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleOption = (option: T) => {
    const nextValues = selectedValues.includes(option)
      ? selectedValues.filter((v) => v !== option)
      : [...selectedValues, option]
    onChange(nextValues)
  }

  const displayText = selectedValues.length === 0 
    ? label 
    : selectedValues.length === 1 
      ? selectedValues[0] 
      : `${selectedValues[0]} +${selectedValues.length - 1}`

  const longestOption = options.reduce((a, b) => (a.length > b.length ? a : b), label)
  const widestTriggerText = [label, longestOption, `${longestOption} +${Math.max(options.length - 1, 0)}`]
    .reduce((a, b) => (a.length > b.length ? a : b))

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
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold">
          <span className="h-4 w-4 shrink-0 rounded border border-transparent" />
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-3 rounded-md border border-gray-200 bg-white pl-4 pr-3 py-3 text-sm font-bold text-gray-600 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
      >
        <div className="relative flex items-center">
          <span className="invisible h-0 overflow-hidden whitespace-nowrap font-bold" aria-hidden="true">
            {widestTriggerText}
          </span>
          <span className="absolute left-0 whitespace-nowrap text-gray-900">{displayText}</span>
        </div>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 z-20 mt-2 min-w-full overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)]' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)] border-[var(--brand-color)]' 
                      : 'border-gray-300 bg-white group-hover:border-gray-400'
                  }`}>
                    {isSelected && <CheckIcon className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className="whitespace-nowrap">{option}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface SingleSelectDropdownProps<T extends string> {
  options: T[]
  value: T
  onChange: (value: T) => void
  className?: string
  isDisabled?: boolean
  onToggle?: (isOpen: boolean) => void
}

function SingleSelectDropdown<T extends string>({ 
  options, 
  value, 
  onChange, 
  className = '',
  isDisabled = false,
  onToggle
}: SingleSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option: T) => {
    onChange(option)
    setIsOpen(false)
  }

  const longestOption = options.reduce((a, b) => (a.length > b.length ? a : b), '')

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
        disabled={isDisabled}
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-xs text-gray-900 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
      >
        <span className="whitespace-nowrap">{value || 'None'}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isDisabled && (
        <div className="absolute left-0 z-20 mt-2 min-w-full overflow-hidden rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = value === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs transition-colors ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-semibold' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="whitespace-nowrap">{option || 'None'}</span>
                  {isSelected && <CheckIcon className="ml-auto h-4 w-4 text-[var(--brand-color)]" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MembersPage() {
  const [users, setUsers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Member[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<MemberStatus[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('Instructor')
  const [inviteError, setInviteError] = useState('')
  const [isInviting, setIsInviting] = useState(false)

  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editRole, setEditRole] = useState<MemberRole>('Instructor')
  const [editDept, setEditDept] = useState('')
  const [editError, setEditError] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null)
  const [isRemovingMember, setIsRemovingMember] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [removeConfirmText, setRemoveConfirmText] = useState('')

  const [activeDropdowns, setActiveDropdowns] = useState(0)

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  useEffect(() => {
    // 1. Fetch all users to have a local map for joining
    let unsubscribeUsers: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeInvites: (() => void) | null = null
    let unsubscribeDepts: (() => void) | null = null

    unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))

      // 2. Fetch memberships and join with users
      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (mSnap) => {
        const membersData = mSnap.docs.map(mDoc => {
          const mData = mDoc.data()
          const userData = usersMap.get(mData.userId) || {}
          
          return {
            id: mData.userId,
            membershipId: mDoc.id,
            name: userData.fullName || 'No Name',
            email: userData.email || '',
            role: (mData.role as MemberRole) || 'Instructor',
            status: (userData.isActive !== false) ? 'Active' : 'Inactive',
            department: mData.departmentCode || '',
            joinedDate: userData.createdAt ? userData.createdAt.toDate().toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }) : '—',
            avatar: userData.profilePicture || '',
          }
        }) as Member[]
        setUsers(membersData)
      })
    })

    // 3. Listener for pending invitations
    const invitesQuery = query(
      collection(db, 'invitations'), 
      where('status', '==', 'pending')
    )
    unsubscribeInvites = onSnapshot(invitesQuery, (snapshot) => {
      const invitesData = snapshot.docs.map((doc) => {
        const data = doc.data()
        // Check if invite is expired
        const now = new Date()
        const isExpired = data.expiresAt && data.expiresAt.toDate() < now
        if (isExpired) return null

        return {
          id: doc.id,
          name: '', // No name for pending invites
          email: data.email || '',
          role: (data.role as MemberRole) || 'Instructor',
          status: 'Pending',
          department: '',
          joinedDate: '—', // No joined date for pending invites
          avatar: '',
        }
      }).filter(Boolean) as Member[]
      setInvites(invitesData)
    })

    // 4. Listener for departments
    const deptsQuery = query(collection(db, 'departments'), orderBy('code'))
    unsubscribeDepts = onSnapshot(deptsQuery, (snapshot) => {
      const deptsData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          name: data.name || '',
          code: data.code || '',
          dean: data.dean || ''
        }
      }) as Department[]
      setDepartments(deptsData)
    })

    return () => {
      if (unsubscribeUsers) unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
      if (unsubscribeInvites) unsubscribeInvites()
      if (unsubscribeDepts) unsubscribeDepts()
    }
  }, [])

  const members = useMemo(() => [...users, ...invites], [users, invites])

  const filteredMembers = members
    .filter((member) => {
      const matchesSearch = [member.name, member.email].some((val) =>
        val.toLowerCase().includes(searchTerm.toLowerCase())
      )
      const matchesRole = selectedRoles.length === 0 || selectedRoles.includes(member.role)
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(member.status)

      return matchesSearch && matchesRole && matchesStatus
    })
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inviteEmail.trim()) {
      setInviteError('Email address is required.')
      return
    }
    
    if (!inviteEmail.includes('@')) {
      setInviteError('Please enter a valid email address.')
      return
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase()
    setIsInviting(true)
    setInviteError('')

    try {
      console.log('Checking for existing user with email:', normalizedEmail)
      // 1. Check if user already exists in 'users' collection
      const userQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail))
      const userSnapshot = await getDocs(userQuery)
      console.log('User search result size:', userSnapshot.size)
      
      if (!userSnapshot.empty) {
        setInviteError('This user is already a member.')
        setIsInviting(false)
        return
      }

      // 2. Check for existing active invitations
      console.log('Checking for existing invitations for email:', normalizedEmail)
      const inviteQuery = query(
        collection(db, 'invitations'), 
        where('email', '==', normalizedEmail),
        where('status', '==', 'pending')
      )
      const inviteSnapshot = await getDocs(inviteQuery)
      console.log('Invitation search result size:', inviteSnapshot.size)
      
      const now = new Date()
      const activeInvite = inviteSnapshot.docs.find(doc => {
        const data = doc.data()
        const isNotExpired = data.expiresAt.toDate() > now
        console.log('Checking invitation', doc.id, '- Status:', data.status, '- Not Expired:', isNotExpired)
        return isNotExpired
      })

      if (activeInvite) {
        setInviteError('An active invitation already exists.')
        setIsInviting(false)
        return
      }

      console.log('Validation passed. Starting invitation process for:', normalizedEmail)
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7)

      // 3. Create the invitation tracking document
      const inviteRef = await addDoc(collection(db, 'invitations'), {
        email: normalizedEmail,
        role: inviteRole,
        status: 'pending',
        invitedBy: auth.currentUser?.uid || 'system',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(expiresAt),
      })
      console.log('Invitation document created with ID:', inviteRef.id)

      // 4. Create the mail document to trigger the extension
      const signupLink = `http://localhost:5173/signup?token=${inviteRef.id}`
      console.log('Attempting to create mail document...')
      
      const mailRef = await addDoc(collection(db, 'mail'), {
        to: normalizedEmail,
        message: {
          subject: 'Invitation to join RORMS',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #62853e; margin: 0;">Welcome to RORMS</h2>
                <p style="color: #666;">University Room & Resource Management System</p>
              </div>
              <p>Hello,</p>
              <p>You have been invited to join the <strong>RORMS</strong> system as a <strong>${inviteRole}</strong>.</p>
              <p>Please click the button below to complete your account registration:</p>
              <div style="text-align: center; margin: 35px 0;">
                <a href="${signupLink}" style="background-color: #62853e; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Accept Invitation & Sign Up
                </a>
              </div>
              <p style="font-size: 13px; color: #888; line-height: 1.5;">
                <strong>Note:</strong> This invitation link is unique to your email and will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
              </p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;" />
              <p style="font-size: 12px; color: #b9b9b9; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br />
                <span style="color: #62853e;">${signupLink}</span>
              </p>
            </div>
          `,
        },
      })
      console.log('Mail document created with ID:', mailRef.id)

      setIsInviteModalOpen(false)
      setInviteEmail('')
      setInviteRole('Instructor')
      setInviteError('')
    } catch (error) {
      console.error('Error sending invitation:', error)
      setInviteError('Failed to send invitation. Please try again.')
    } finally {
      setIsInviting(false)
    }
  }

  const openInviteModal = () => {
    setIsInviteModalOpen(true)
    setInviteEmail('')
    setInviteRole('Instructor')
    setInviteError('')
  }

  const openEditModal = (member: Member) => {
    if (member.status === 'Pending') return // Cannot edit pending invites here
    setEditingMember(member)
    setEditRole(member.role)
    setEditDept(member.department || '')
    setEditError('')
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember) return

    setEditError('')
    const wasDean = editingMember.role === 'Dean'
    const isNowDean = editRole === 'Dean'
    const oldDeptCode = editingMember.department || ''
    const newDeptCode = editDept

    // 1. Validation for Dean assignment
    if (isNowDean && newDeptCode) {
      const targetDept = departments.find(d => d.code === newDeptCode)
      // Check if another user is already assigned as dean for this department
      if (targetDept && targetDept.dean && targetDept.dean !== editingMember.id) {
        setEditError(`Dean exists for ${newDeptCode}.`)
        return
      }
    }

    setIsSavingEdit(true)
    try {
      const batch = writeBatch(db)

      const canHaveDept = editRole === 'Dean' || editRole === 'Instructor'
      const finalDept = canHaveDept ? editDept : ''

      if (wasDean && (!isNowDean || oldDeptCode !== finalDept)) {
        // Clear old department's dean field
        const oldDept = departments.find(d => d.code === oldDeptCode)
        if (oldDept) {
          batch.update(doc(db, 'departments', oldDept.id), {
            dean: '',
            updatedAt: serverTimestamp()
          })
        }
      }

      if (isNowDean && finalDept) {
        const newDept = departments.find(d => d.code === finalDept)
        if (newDept) {
          // Set new department's dean field
          batch.update(doc(db, 'departments', newDept.id), {
            dean: editingMember.id,
            updatedAt: serverTimestamp()
          })
        }
      }

      // 2. Update membership document
      if (editingMember.membershipId) {
        batch.update(doc(db, 'memberships', editingMember.membershipId), {
          role: editRole,
          departmentCode: finalDept,
          // We don't update joinedAt as they already joined
        })
      }

      await batch.commit()
      setEditingMember(null)
    } catch (error) {
      console.error('Error updating member:', error)
      setEditError('Failed to update member.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleRemoveSubmit = async () => {
    if (!memberToRemove) return

    setIsRemovingMember(true)
    setRemoveError('')
    try {
      const batch = writeBatch(db)

      // 1. If member is a dean, clear the department's dean field
      if (memberToRemove.role === 'Dean' && memberToRemove.department) {
        const dept = departments.find(d => d.code === memberToRemove.department)
        if (dept && dept.dean === memberToRemove.id) {
          batch.update(doc(db, 'departments', dept.id), {
            dean: '',
            updatedAt: serverTimestamp()
          })
        }
      }

      // 2. Delete the user document
      batch.delete(doc(db, 'users', memberToRemove.id))

      // 3. Delete all membership documents for this user
      const membershipsQuery = query(collection(db, 'memberships'), where('userId', '==', memberToRemove.id))
      const membershipsSnapshot = await getDocs(membershipsQuery)
      membershipsSnapshot.forEach((mDoc) => {
        batch.delete(doc(db, 'memberships', mDoc.id))
      })

      // Note: Deleting the user's Auth account requires Firebase Admin SDK (Cloud Functions).
      // Since this is a client-side implementation, we are performing the Firestore clean-up.
      // If a Cloud Function is configured to trigger on 'users' document deletion, 
      // it can handle the Auth account removal.

      await batch.commit()
      setMemberToRemove(null)
      setRemoveConfirmText('')
    } catch (error) {
      console.error('Error removing member:', error)
      setRemoveError('Failed to remove member.')
    } finally {
      setIsRemovingMember(false)
    }
  }

  return (
    <section className="relative h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Edit Member</h3>
              <p className="mt-1 text-sm text-white/80">Update role and department for {editingMember.name || editingMember.email}.</p>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-[40%]">
                  <label htmlFor="edit-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Role
                  </label>
                  <SingleSelectDropdown
                    options={['Admin', 'Registrar', 'Dean', 'Instructor']}
                    value={editRole}
                    onChange={(val) => {
                      setEditRole(val)
                      setEditError('')
                      if (val !== 'Dean' && val !== 'Instructor') {
                        setEditDept('')
                      }
                    }}
                    onToggle={handleDropdownToggle}
                    className="w-full"
                  />
                </div>

                <div className="sm:w-[60%]">
                  <label htmlFor="edit-dept" className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-2 transition-colors ${
                    (editRole === 'Dean' || editRole === 'Instructor') ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    <span>Department</span>
                    {editError && (
                      <span className="text-[10px] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                        {editError}
                      </span>
                    )}
                  </label>
                  <SingleSelectDropdown
                    options={['', ...departments.map(d => d.code)]}
                    value={(editRole === 'Dean' || editRole === 'Instructor') ? editDept : ''}
                    onChange={(val) => {
                      setEditDept(val)
                      setEditError('')
                    }}
                    onToggle={handleDropdownToggle}
                    isDisabled={editRole !== 'Dean' && editRole !== 'Instructor'}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  disabled={isSavingEdit}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (activeDropdowns > 0) return
              if (!isSavingEdit) setEditingMember(null)
            }} 
          />
        </div>
      )}

      {/* Remove Member Modal */}
      {memberToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Remove Member</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to remove this member from the system?</p>
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
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete their account, all membership records, and access to the system.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  To confirm, please type <span className="text-rose-600">"confirm"</span>
                </label>
                <input
                  type="text"
                  value={removeConfirmText}
                  onChange={(e) => setRemoveConfirmText(e.target.value)}
                  placeholder="Type confirm here..."
                  className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-sm"
                  autoFocus
                />
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
                    setMemberToRemove(null)
                    setRemoveConfirmText('')
                  }}
                  disabled={isRemovingMember}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveSubmit}
                  disabled={isRemovingMember || removeConfirmText.toLowerCase() !== 'confirm'}
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRemovingMember ? 'Removing...' : 'Confirm Remove'}
                </button>
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (!isRemovingMember) {
                setMemberToRemove(null)
                setRemoveConfirmText('')
              }
            }} 
          />
        </div>
      )}

      {/* Invite Member Modal Overlay */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Invite New Member</h3>
              <p className="mt-1 text-sm text-white/80">Send an invitation link to join the team.</p>
            </div>
            
            <form onSubmit={handleInvite} className="p-6 space-y-5" noValidate>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4">
                <div className="relative flex-1">
                  <label htmlFor="invite-email" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Email Address
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value)
                      if (inviteError) setInviteError('')
                    }}
                    placeholder="name@example.com"
                    className={`w-full rounded-md border bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                      inviteError 
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                        : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                    }`}
                    autoFocus
                  />
                  {inviteError && (
                    <p className="absolute left-0 top-[calc(100%+4px)] text-[11px] font-bold text-rose-600 animate-in fade-in slide-in-from-top-1">
                      {inviteError}
                    </p>
                  )}
                </div>

                <div className="w-full sm:w-36">
                  <label htmlFor="invite-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Assign Role
                  </label>
                  <SingleSelectDropdown
                    options={['Admin', 'Registrar', 'Dean', 'Instructor']}
                    value={inviteRole}
                    onChange={setInviteRole}
                    onToggle={handleDropdownToggle}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
          {/* Click outside to close */}
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (activeDropdowns > 0) return
              setIsInviteModalOpen(false)
            }} 
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Members
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Manage member accounts, role assignments, and registrar system access.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[
                { label: 'Total Members', count: members.length, color: 'rose' },
                { label: 'Admins', count: members.filter(m => m.role === 'Admin').length, color: 'purple' },
                { label: 'Registrars', count: members.filter(m => m.role === 'Registrar').length, color: 'blue' },
                { label: 'Deans', count: members.filter(m => m.role === 'Dean').length, color: 'amber' },
                { label: 'Instructors', count: members.filter(m => m.role === 'Instructor').length, color: 'emerald' },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-md bg-${item.color}-50 border border-${item.color}-100 shrink-0`}>
                    <UsersIcon className={`h-9 w-9 text-${item.color}-600`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-widest text-gray-500">{item.label}</p>
                    <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                      {item.count}
                    </p>
                  </div>
                </div>
              ))}
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
                id="member-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name or email..."
                className="w-full rounded-md border border-gray-200 bg-white pl-11 pr-24 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-1.5 right-1.5 rounded-md bg-gray-900 px-4 text-sm font-bold text-white transition hover:bg-gray-800"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <MultiSelectDropdown
                label="Roles"
                options={['Admin', 'Registrar', 'Dean', 'Instructor']}
                selectedValues={selectedRoles}
                onChange={setSelectedRoles}
                className="w-full sm:w-auto"
              />
              <MultiSelectDropdown
                label="Status"
                options={['Active', 'Inactive', 'Pending']}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
                className="w-full sm:w-auto"
              />
            </div>

            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
              onClick={openInviteModal}
            >
              <PlusIcon className="h-5 w-5" />
              Invite Member
            </button>
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
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Department
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Joined Date
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[14%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No members found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="transition hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-6 py-4">
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
                            {member.name && <p className="text-sm font-bold text-gray-900">{member.name}</p>}
                            <p className={member.name ? "text-xs font-medium text-gray-500" : "text-sm font-bold text-gray-900"}>
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roleClasses[member.role]}`}>
                          {member.role}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="text-sm font-semibold text-gray-700">
                          {member.department || (
                            member.role === 'Admin' ? 'Administrative Office' :
                            member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned'
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${statusClasses[member.status]}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-600">
                        {member.joinedDate}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <IconButton
                            label="Edit member"
                            onClick={() => openEditModal(member)}
                            className={`h-8 w-8 rounded-md bg-white shadow-sm transition-all border border-gray-100 ${
                              member.status === 'Pending' 
                                ? 'text-gray-200 cursor-not-allowed' 
                                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                            }`}
                            disabled={member.status === 'Pending'}
                          >
                            <EditIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Remove member"
                            onClick={() => setMemberToRemove(member)}
                            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
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

export default MembersPage
