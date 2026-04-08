import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { UsersIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, ChevronDownIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

type MemberRole = 'Admin' | 'Registrar' | 'Dean' | 'Instructor'
type MemberStatus = 'Active' | 'Inactive' | 'Pending'

interface Member {
  id: string
  name: string
  email: string
  role: MemberRole
  status: MemberStatus
  joinedDate: string
  avatar: string
}

const members: Member[] = [
  {
    id: '1',
    name: 'Adrian Smith',
    email: 'adrian@example.com',
    role: 'Admin',
    status: 'Active',
    joinedDate: 'Oct 12, 2023',
    avatar: 'https://i.pravatar.cc/150?u=1',
  },
  {
    id: '2',
    name: 'Sarah Jenkins',
    email: 'sarah.j@example.com',
    role: 'Registrar',
    status: 'Active',
    joinedDate: 'Nov 05, 2023',
    avatar: 'https://i.pravatar.cc/150?u=2',
  },
  {
    id: '3',
    name: 'Michael Chen',
    email: 'm.chen@example.com',
    role: 'Dean',
    status: 'Inactive',
    joinedDate: 'Jan 20, 2024',
    avatar: 'https://i.pravatar.cc/150?u=3',
  },
  {
    id: '4',
    name: 'Elena Rodriguez',
    email: 'elena.r@example.com',
    role: 'Instructor',
    status: 'Active',
    joinedDate: 'Feb 15, 2024',
    avatar: 'https://i.pravatar.cc/150?u=4',
  },
  {
    id: '5',
    name: 'David Wilson',
    email: 'd.wilson@example.com',
    role: 'Registrar',
    status: 'Pending',
    joinedDate: 'Mar 02, 2024',
    avatar: 'https://i.pravatar.cc/150?u=5',
  },
]

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
}

function MultiSelectDropdown<T extends string>({ 
  label, 
  options, 
  selectedValues, 
  onChange, 
  className = '' 
}: MultiSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

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
}

function SingleSelectDropdown<T extends string>({ 
  options, 
  value, 
  onChange, 
  className = '' 
}: SingleSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

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
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-4 py-3 text-xs text-gray-900 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
      >
        <span className="whitespace-nowrap">{value}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
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
                  <span className="whitespace-nowrap">{option}</span>
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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<MemberRole[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<MemberStatus[]>([])
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('Instructor')
  const [inviteError, setInviteError] = useState('')

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

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inviteEmail.trim()) {
      setInviteError('Email address is required.')
      return
    }
    
    if (!inviteEmail.includes('@')) {
      setInviteError('Please enter a valid email address.')
      return
    }

    console.log('Inviting:', inviteEmail, 'as', inviteRole)
    // Add logic to invite member
    setIsInviteModalOpen(false)
    setInviteEmail('')
    setInviteRole('Instructor')
    setInviteError('')
  }

  const openInviteModal = () => {
    setIsInviteModalOpen(true)
    setInviteEmail('')
    setInviteRole('Instructor')
    setInviteError('')
  }

  return (
    <section className="relative h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsInviteModalOpen(false)} />
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
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Member
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500">
                    Joined Date
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No members found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.id} className="transition hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="h-10 w-10 rounded-full border border-gray-100 object-cover"
                          />
                          <div>
                            <p className="text-sm font-bold text-gray-900">{member.name}</p>
                            <p className="text-xs font-medium text-gray-500">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roleClasses[member.role]}`}>
                          {member.role}
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
                            onClick={() => console.log('Edit member:', member.id)}
                            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
                          >
                            <EditIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Remove member"
                            onClick={() => console.log('Remove member:', member.id)}
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
