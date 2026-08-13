import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { collection, addDoc, serverTimestamp, Timestamp, query, where, getDocs, onSnapshot, orderBy, writeBatch, doc } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { UsersIcon, UserIcon, EditIcon, TrashIcon, ChevronDownIcon, CheckIcon, SearchIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, FilterIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'

import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import type { MemberRole, MemberStatus, Department, Member } from '../../types/member'
import { Button } from '../../components/Button'
import { FilterDropdown } from '../../components/FilterDropdown'
import { DataTable, type ColumnDef } from '../../components/DataTable'
const rolePriority: Record<MemberRole, number> = {
  Admin: 0,
  Registrar: 1,
  Dean: 2,
  'Program Head': 3,
  Instructor: 4,
}

const roleClasses: Record<MemberRole, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}

const statusClasses: Record<MemberStatus, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-gray-100 text-gray-700',
  Pending: 'bg-amber-100 text-amber-700',
}

function MembersPage() {
  const [users, setUsers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Member[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<MemberStatus[]>([])
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})
  
  // Pagination state is now handled internally by DataTable
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('Instructor')
  const [inviteDepartment, setInviteDepartment] = useState('None')
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

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // 1. Fetch all users to have a local map for joining
    let unsubscribeUsers: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeInvites: (() => void) | null = null
    let unsubscribeDepts: (() => void) | null = null

    let usersLoaded = false
    let membershipsLoaded = false
    let invitesLoaded = false
    let deptsLoaded = false

    const checkFinishedLoading = () => {
      if (usersLoaded && (membershipsLoaded || usersSnapEmpty) && invitesLoaded && deptsLoaded) {
        setIsLoading(false)
      }
    }
    let usersSnapEmpty = false

    unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(uDoc => usersMap.set(uDoc.id, uDoc.data()))
      usersLoaded = true
      if (usersSnap.empty) {
        usersSnapEmpty = true
        setIsLoading(false)
      }

      // 2. Fetch memberships and join with users
      if (unsubscribeMemberships) unsubscribeMemberships()
      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (mSnap) => {
        const membersData = mSnap.docs.map(mDoc => {
          const mData = mDoc.data()
          const userData = usersMap.get(mData.userId) || {}
          
          return {
            id: mData.userId,
            membershipId: mDoc.id,
            name: userData.fullName || '',
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
        membershipsLoaded = true
        checkFinishedLoading()
      }, () => {
        membershipsLoaded = true
        checkFinishedLoading()
      })
    }, () => {
      usersLoaded = true
      checkFinishedLoading()
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
      invitesLoaded = true
      checkFinishedLoading()
    }, () => {
      invitesLoaded = true
      checkFinishedLoading()
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
          dean: data.dean || '',
          programHead: data.programHead || ''
        }
      }) as Department[]
      setDepartments(deptsData)
      deptsLoaded = true
      checkFinishedLoading()
    }, () => {
      deptsLoaded = true
      checkFinishedLoading()
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
      
      const memberDept = member.department || (member.role === 'Admin' ? 'Administrative Office' : member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned')
      const matchesDepartment = selectedDepartments.length === 0 || selectedDepartments.includes(memberDept)

      return matchesSearch && matchesRole && matchesStatus && matchesDepartment
    })
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inviteEmail.trim()) {
      setInviteError('Email address is required.')
      return
    }

    const emailList = inviteEmail
      .split(/[\s,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0)

    if (emailList.length === 0) {
      setInviteError('Please enter at least one valid email address.')
      return
    }

    const invalidEmails = emailList.filter(e => !e.includes('@'))
    if (invalidEmails.length > 0) {
      setInviteError(`Invalid format: ${invalidEmails.slice(0, 2).join(', ')}${invalidEmails.length > 2 ? '...' : ''}`)
      return
    }

    setIsInviting(true)
    setInviteError('')

    try {
      const results = {
        sent: [] as string[],
        exists: [] as string[],
        pending: [] as string[],
      }

      for (const normalizedEmail of emailList) {
        // 1. Check if user already exists in 'users' collection
        const userQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail))
        const userSnapshot = await getDocs(userQuery)
        
        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data()
          if (userData.isActive !== false) {
            results.exists.push(normalizedEmail)
            continue
          } else {
            // User exists but is INACTIVE. Create a reactivation invite.
            const expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + 7)

            const inviteRef = await addDoc(collection(db, 'invitations'), {
              email: normalizedEmail,
              role: inviteRole,
              department: (inviteRole === 'Instructor' || inviteRole === 'Dean' || inviteRole === 'Program Head') ? (inviteDepartment === 'None' ? '' : inviteDepartment) : '',
              status: 'pending',
              isReactivation: true,
              invitedBy: auth.currentUser?.uid || 'system',
              createdAt: serverTimestamp(),
              expiresAt: Timestamp.fromDate(expiresAt),
            })

            const signupLink = `${window.location.origin}/signup?token=${inviteRef.id}`
            
            await addDoc(collection(db, 'mail'), {
              to: normalizedEmail,
              message: {
                subject: `Welcome back to RORMS - ${normalizedEmail}`,
                html: `
                  <div style="background-color: #f4f7f6; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                      <!-- Brand Header -->
                      <div style="background-color: #62853e; padding: 30px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">RORMS</h1>
                        <p style="color: #e0ead6; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Registrar Office Room Management System</p>
                      </div>
                      <!-- Email Body -->
                      <div style="padding: 40px 30px;">
                        <h2 style="color: #333333; margin-top: 0; font-size: 22px;">Welcome Back!</h2>
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                          Hello,<br><br>
                          Your account has been officially invited back to the <strong>RORMS</strong> platform as a <strong>${inviteRole}</strong>.
                        </p>
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 40px 0;">
                          <a href="${signupLink}" style="background-color: #62853e; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(98, 133, 62, 0.25);">
                            Accept & Reactivate Account
                          </a>
                        </div>
                        <!-- Security Callout -->
                        <div style="background-color: #f9f9f9; border-left: 4px solid #e0e0e0; padding: 15px; margin-bottom: 30px;">
                          <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                            <strong>Security Note:</strong> This reactivation link is strictly tied to your email address and will automatically expire in <strong>7 days</strong>.
                          </p>
                        </div>
                      </div>
                      <!-- Footer -->
                      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                        <p style="color: #aaaaaa; font-size: 12px; margin: 0;">
                          &copy; ${new Date().getFullYear()} PHINMA University of Pangasinan. All rights reserved.
                        </p>
                      </div>
                    </div>
                  </div>
                `,
              },
            })
            
            results.sent.push(normalizedEmail)
            continue
          }
        }

        // 2. Check for existing active invitations
        const inviteQuery = query(
          collection(db, 'invitations'), 
          where('email', '==', normalizedEmail),
          where('status', '==', 'pending')
        )
        const inviteSnapshot = await getDocs(inviteQuery)
        
        const now = new Date()
        const activeInvite = inviteSnapshot.docs.find(doc => {
          const data = doc.data()
          return data.expiresAt.toDate() > now
        })

        if (activeInvite) {
          results.pending.push(normalizedEmail)
          continue
        }

        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        // 3. Create the invitation tracking document
        const inviteRef = await addDoc(collection(db, 'invitations'), {
          email: normalizedEmail,
          role: inviteRole,
          department: (inviteRole === 'Instructor' || inviteRole === 'Dean' || inviteRole === 'Program Head') ? (inviteDepartment === 'None' ? '' : inviteDepartment) : '',
          status: 'pending',
          invitedBy: auth.currentUser?.uid || 'system',
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromDate(expiresAt),
        })

        // 4. Create the mail document to trigger the extension
        const signupLink = `${window.location.origin}/signup?token=${inviteRef.id}`
        
        await addDoc(collection(db, 'mail'), {
          to: normalizedEmail,
          message: {
            subject: `Invitation to join RORMS - ${normalizedEmail}`,
            html: `
                  <div style="background-color: #f4f7f6; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                      <!-- Brand Header -->
                      <div style="background-color: #62853e; padding: 30px 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px;">RORMS</h1>
                        <p style="color: #e0ead6; margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Registrar Office Room Management System</p>
                      </div>
                      <!-- Email Body -->
                      <div style="padding: 40px 30px;">
                        <h2 style="color: #333333; margin-top: 0; font-size: 22px;">You've been invited!</h2>
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
                          Hello,<br><br>
                          You have been officially invited to join the <strong>RORMS</strong> platform as a <strong>${inviteRole}</strong>. 
                          Through this system, you will be able to seamlessly manage and track university resources.
                        </p>
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 40px 0;">
                          <a href="${signupLink}" style="background-color: #62853e; color: #ffffff; padding: 16px 36px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(98, 133, 62, 0.25);">
                            Accept Invitation & Sign Up
                          </a>
                        </div>
                        <!-- Security Callout -->
                        <div style="background-color: #f9f9f9; border-left: 4px solid #e0e0e0; padding: 15px; margin-bottom: 30px;">
                          <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.5;">
                            <strong>Security Note:</strong> This invitation is strictly tied to your email address and will automatically expire in <strong>7 days</strong>.
                          </p>
                        </div>
                        <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
                        <!-- Fallback Link -->
                        <p style="color: #999999; font-size: 13px; text-align: center; line-height: 1.5; margin: 0;">
                          If the button above doesn't work, copy and paste the following URL into your browser:<br>
                          <a href="${signupLink}" style="color: #62853e; word-break: break-all;">${signupLink}</a>
                        </p>
                      </div>
                      <!-- Footer -->
                      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #eeeeee;">
                        <p style="color: #aaaaaa; font-size: 12px; margin: 0;">
                          &copy; ${new Date().getFullYear()} PHINMA University of Pangasinan. All rights reserved.
                        </p>
                      </div>
                    </div>
                  </div>
                `,
          },
        })
        results.sent.push(normalizedEmail)
      }

      if (results.sent.length === emailList.length) {
        setIsInviteModalOpen(false)
        setInviteEmail('')
        setInviteRole('Instructor')
        setInviteDepartment('None')
        setInviteError('')
      } else {
        const parts = []
        if (results.sent.length > 0) parts.push(`Sent ${results.sent.length}`)
        if (results.exists.length > 0) parts.push(`${results.exists.length} already members`)
        if (results.pending.length > 0) parts.push(`${results.pending.length} already invited`)
        setInviteError(parts.join(', '))
        
        // Filter out successfully sent emails from the textarea
        const remainingEmails = emailList.filter(e => !results.sent.includes(e))
        setInviteEmail(remainingEmails.join(', '))
      }
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
    setInviteDepartment('None')
    if (inviteError) setInviteError('')
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
    const wasProgramHead = editingMember.role === 'Program Head'
    const isNowProgramHead = editRole === 'Program Head'
    const oldDeptCode = editingMember.department || ''
    const newDeptCode = editDept

    // 1. Validation for Dean and Program Head assignment
    if (isNowDean && newDeptCode) {
      const existingDean = members.find(m => m.role === 'Dean' && m.department === newDeptCode && m.id !== editingMember.id && m.status !== 'Inactive')
      if (existingDean) {
        setEditError(`Dean exists for ${newDeptCode}.`)
        return
      }
    }

    if (isNowProgramHead && newDeptCode) {
      const existingProgramHead = members.find(m => m.role === 'Program Head' && m.department === newDeptCode && m.id !== editingMember.id && m.status !== 'Inactive')
      if (existingProgramHead) {
        setEditError(`Program Head exists for ${newDeptCode}.`)
        return
      }
    }

    setIsSavingEdit(true)
    try {
      const batch = writeBatch(db)

      const canHaveDept = editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head'
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

      if (wasProgramHead && (!isNowProgramHead || oldDeptCode !== finalDept)) {
        // Clear old department's programHead field
        const oldDept = departments.find(d => d.code === oldDeptCode)
        if (oldDept) {
          batch.update(doc(db, 'departments', oldDept.id), {
            programHead: '',
            updatedAt: serverTimestamp()
          })
        }
      }

      if (isNowProgramHead && finalDept) {
        const newDept = departments.find(d => d.code === finalDept)
        if (newDept) {
          // Set new department's programHead field
          batch.update(doc(db, 'departments', newDept.id), {
            programHead: editingMember.id,
            updatedAt: serverTimestamp()
          })
        }
      }

      // 2. Update membership document
      if (editingMember.membershipId) {
        const updateData: any = {
          role: editRole,
          departmentCode: finalDept,
        }

        // Update joinedAt only if the department has changed (including unassigned to department or vice versa)
        if (oldDeptCode !== finalDept) {
          updateData.joinedAt = serverTimestamp()
        }

        batch.update(doc(db, 'memberships', editingMember.membershipId), updateData)
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

      if (memberToRemove.status === 'Pending') {
        // 1. Delete the invitation document
        batch.delete(doc(db, 'invitations', memberToRemove.id))
        
        // 2. Delete the associated mail document (find by email)
        const mailQuery = query(collection(db, 'mail'), where('to', '==', memberToRemove.email))
        const mailSnapshot = await getDocs(mailQuery)
        mailSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'mail', mDoc.id))
        })
      } else {
        // 1. If member is a dean or program head, clear the department's respective field
        if (memberToRemove.role === 'Dean' && memberToRemove.department) {
          const dept = departments.find(d => d.code === memberToRemove.department)
          if (dept && dept.dean === memberToRemove.id) {
            batch.update(doc(db, 'departments', dept.id), {
              dean: '',
              updatedAt: serverTimestamp()
            })
          }
        } else if (memberToRemove.role === 'Program Head' && memberToRemove.department) {
          const dept = departments.find(d => d.code === memberToRemove.department)
          if (dept && dept.programHead === memberToRemove.id) {
            batch.update(doc(db, 'departments', dept.id), {
              programHead: '',
              updatedAt: serverTimestamp()
            })
          }
        }

        // 2. Soft delete the user document (do not completely delete from Firestore)
        batch.update(doc(db, 'users', memberToRemove.id), {
          isActive: false,
          updatedAt: serverTimestamp()
        })

        // 3. Delete all membership documents for this user
        const membershipsQuery = query(collection(db, 'memberships'), where('userId', '==', memberToRemove.id))
        const membershipsSnapshot = await getDocs(membershipsQuery)
        membershipsSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'memberships', mDoc.id))
        })

        // 4. Clean up any lingering mail and invitations
        const mailQuery = query(collection(db, 'mail'), where('to', '==', memberToRemove.email))
        const mailSnapshot = await getDocs(mailQuery)
        mailSnapshot.forEach((mDoc) => {
          batch.delete(doc(db, 'mail', mDoc.id))
        })
        
        const inviteQuery = query(collection(db, 'invitations'), where('email', '==', memberToRemove.email))
        const inviteSnapshot = await getDocs(inviteQuery)
        inviteSnapshot.forEach((iDoc) => {
          batch.delete(doc(db, 'invitations', iDoc.id))
        })
      }

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
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Decorative Background Elements */}
      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
              <h3 className="text-xl font-bold">Edit Member</h3>
              <p className="mt-1 text-sm text-white/80">Update role and department for {editingMember.name || editingMember.email}.</p>
            </div>
            
            <form onSubmit={handleEditSubmit} className="p-6 space-y-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4">
                <div className="sm:w-1/2">
                  <label htmlFor="edit-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Role
                  </label>
                  <SingleSelectDropdown
                    options={['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor']}
                    value={editRole}
                    onChange={(val) => {
                      setEditRole(val)
                      setEditError('')
                      if (val !== 'Dean' && val !== 'Instructor' && val !== 'Program Head') {
                        setEditDept('')
                      }
                    }}
                    onToggle={handleDropdownToggle}
                    className="w-full"
                  />
                </div>

                <div className="sm:w-1/2">
                  <label htmlFor="edit-dept" className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-2 transition-colors ${
                    (editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head') ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    <span>Department</span>
                    {editError && (
                      <span className="text-[0.625rem] font-bold lowercase text-rose-500 animate-in fade-in slide-in-from-left-1">
                        {editError}
                      </span>
                    )}
                  </label>
                  <SingleSelectDropdown
                    options={['', ...departments.map(d => d.code)]}
                    value={(editRole === 'Dean' || editRole === 'Instructor' || editRole === 'Program Head') ? editDept : ''}
                    onChange={(val) => {
                      setEditDept(val)
                      setEditError('')
                    }}
                    onToggle={handleDropdownToggle}
                    isDisabled={editRole !== 'Dean' && editRole !== 'Instructor' && editRole !== 'Program Head'}
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
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-bold">Remove Member</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to remove this member from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
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
                  {memberToRemove.name && <p className="text-sm font-bold text-gray-900">{memberToRemove.name}</p>}
                  <p className={memberToRemove.name ? "text-xs font-medium text-gray-500" : "text-sm font-bold text-gray-900"}>
                    {memberToRemove.email}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
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
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  value={removeConfirmText}
                  onChange={(e) => setRemoveConfirmText(e.target.value)}
                  placeholder="Type confirm here..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-xs"
                  autoFocus
                />
              </div>

              {removeError && (
                <p className="text-xs font-bold text-rose-600 text-center animate-in fade-in slide-in-from-top-1">
                  {removeError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMemberToRemove(null)
                    setRemoveConfirmText('')
                  }}
                  disabled={isRemovingMember}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <button
                  type="button"
                  onClick={handleRemoveSubmit}
                  disabled={isRemovingMember || removeConfirmText.toLowerCase() !== 'confirm'}
                  className="flex-1 h-12 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white shadow-md transition-all hover:bg-rose-700 active:scale-95 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-2xl border border-gray-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl overflow-hidden">
              <h3 className="text-xl font-bold">Invite New Member</h3>
              <p className="mt-1 text-sm text-white/80">Send an invitation link to join the team.</p>
            </div>
            
            <form onSubmit={handleInvite} className="p-6 space-y-5" noValidate>
              <div className="flex flex-col gap-5">
                <div className="relative flex-1">
                  <label htmlFor="invite-email" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Email Address
                  </label>
                  <TextInput
                    value={inviteEmail}
                    onChange={(val) => {
                      setInviteEmail(val);
                      if (inviteError) setInviteError('');
                    }}
                    error={!!inviteError && !inviteError.startsWith('Sent')}
                    placeholder="name@example.com, another"
                    inputClassName={`border ${
                      inviteError && !inviteError.startsWith('Sent')
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                        : 'border-gray-200 focus:border-gray-300'}
                    `}
                    className="w-full"
                    autoFocus
                  />
                  {inviteError && (
                    <p className={`absolute left-0 top-[calc(100%+4px)] text-[0.6875rem] font-bold animate-in fade-in slide-in-from-top-1 ${
                      inviteError.startsWith('Sent') ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {inviteError}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="w-full">
                    <label htmlFor="invite-role" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Assign Role
                    </label>
                    <SingleSelectDropdown
                      options={['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor']}
                      value={inviteRole}
                      onChange={setInviteRole}
                      onToggle={handleDropdownToggle}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="w-full">
                    <label htmlFor="invite-department" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Department
                    </label>
                    <div className={(inviteRole === 'Admin' || inviteRole === 'Registrar') ? 'opacity-50 pointer-events-none' : ''}>
                      <SingleSelectDropdown
                        options={['None', ...departments.map(d => d.code)]}
                        value={inviteDepartment}
                        onChange={setInviteDepartment}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isInviting || !inviteEmail.trim()}
                  className="flex-1"
                >
                  {isInviting ? 'Sending...' : 'Send Invitations'}
                </Button>
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
        <SectionHeader 
          title="User Directory"
          description="Manage system access, roles, and department assignments for all users in a centralized hub."
        />

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <SummaryCard title="Card 1" subtitle="Subtitle 1" icon={<UsersIcon className="h-4.5 w-4.5 text-blue-600" />} />
            <SummaryCard title="Card 2" subtitle="Subtitle 2" icon={<UsersIcon className="h-4.5 w-4.5 text-green-600" />} />
            <SummaryCard title="Card 3" subtitle="Subtitle 3" icon={<UsersIcon className="h-4.5 w-4.5 text-red-600" />} />
          </div>
        </div>        {/* Unified Table Container */}
        <div className="relative z-10">
          <DataTable
            isLoading={isLoading}
            data={filteredMembers}
            columns={[
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
                header: 'Assigned Role',
                width: '20%',
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
                header: 'Department',
                width: '16%',
                render: (member) => (
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                    {member.department || (
                      member.role === 'Admin' ? 'Administrative Office' :
                      member.role === 'Registrar' ? "Registrar's Office" : 'Unassigned'
                    )}
                  </span>
                )
              },
              {
                header: 'Status',
                width: '16%',
                render: (member) => (
                  <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${statusClasses[member.status]}`}>
                    {member.status}
                  </span>
                )
              },
              {
                header: 'Join Date',
                width: '16%',
                render: (member) => (
                  <span className="text-sm font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
                    {member.joinedDate}
                  </span>
                )
              },
              {
                header: 'Actions',
                width: '2%',
                align: 'right',
                render: (member) => (
                  <div className="flex justify-end gap-1.5">
                    <IconButton
                      label="Edit member"
                      onClick={() => openEditModal(member)}
                      className={`h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 transition-all ${
                        member.status === 'Pending' 
                          ? 'text-slate-300 cursor-not-allowed' 
                          : 'text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5'
                      }`}
                      disabled={member.status === 'Pending'}
                    >
                      <EditIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Remove member"
                      onClick={() => setMemberToRemove(member)}
                      className="h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 text-rose-500 transition-all hover:border-rose-200 hover:text-rose-600 hover:shadow hover:-translate-y-0.5"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </IconButton>
                  </div>
                )
              }
            ]}
            searchPlaceholder="Search by name or email..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={
              <FilterDropdown
                groups={[
                  {
                    id: 'role',
                    title: 'Role',
                    options: ['Admin', 'Registrar', 'Dean', 'Program Head', 'Instructor'],
                    selectedValues: selectedRoles,
                    onChange: (newSelected) => setSelectedRoles(newSelected as MemberRole[])
                  },
                  {
                    id: 'department',
                    title: 'Department',
                    options: ['Administrative Office', "Registrar's Office", 'Unassigned', ...departments.map(d => d.code)],
                    selectedValues: selectedDepartments,
                    onChange: setSelectedDepartments
                  },
                  {
                    id: 'status',
                    title: 'Status',
                    options: ['Active', 'Inactive', 'Pending'],
                    selectedValues: selectedStatuses,
                    onChange: (newSelected) => setSelectedStatuses(newSelected as MemberStatus[])
                  }
                ]}
                onClearAll={() => {
                  setSelectedRoles([])
                  setSelectedDepartments([])
                  setSelectedStatuses([])
                }}
              />
            }
            primaryAction={
              <Button
                variant="brand"
                className="w-full lg:w-auto"
                onClick={openInviteModal}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Invite Member
              </Button>
            }
            emptyTitle="No members found"
            emptyDescription="Try adjusting your filters or search terms."
            emptyIcon={<UsersIcon className="h-12 w-12" />}
          />
        </div>
      </div>
    </section>
  )
}

export default MembersPage
