import { useState } from 'react'
import { BuildingIcon, PlusIcon, SearchIcon, UsersIcon, EditIcon, TrashIcon, CheckIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

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

const members: Member[] = [
  {
    id: '3',
    name: 'Michael Chen',
    email: 'm.chen@example.com',
    role: 'Dean',
    status: 'Inactive',
    department: 'CITE',
    joinedDate: 'Jan 20, 2024',
    avatar: 'https://i.pravatar.cc/150?u=3',
  },
  {
    id: '4',
    name: 'Elena Rodriguez',
    email: 'elena.r@example.com',
    role: 'Instructor',
    status: 'Active',
    department: 'CITE',
    joinedDate: 'Feb 15, 2024',
    avatar: 'https://i.pravatar.cc/150?u=4',
  },
  // Adding more mock members for CITE
  {
    id: '8',
    name: 'Marcus Thorne',
    email: 'm.thorne@example.com',
    role: 'Instructor',
    status: 'Active',
    department: 'CITE',
    joinedDate: 'Jun 12, 2024',
    avatar: 'https://i.pravatar.cc/150?u=8',
  },
  {
    id: '9',
    name: 'Sophia Lee',
    email: 's.lee@example.com',
    role: 'Instructor',
    status: 'Active',
    department: 'CITE',
    joinedDate: 'Jul 05, 2024',
    avatar: 'https://i.pravatar.cc/150?u=9',
  },
]

// Mock available instructors (those without a department)
const availableInstructors: Member[] = [
  {
    id: '10',
    name: 'James Wilson',
    email: 'j.wilson@example.com',
    role: 'Instructor',
    status: 'Active',
    department: '',
    joinedDate: 'Aug 10, 2024',
    avatar: 'https://i.pravatar.cc/150?u=10',
  },
  {
    id: '11',
    name: 'Maria Garcia',
    email: 'm.garcia@example.com',
    role: 'Instructor',
    status: 'Active',
    department: '',
    joinedDate: 'Sep 05, 2024',
    avatar: 'https://i.pravatar.cc/150?u=11',
  },
  {
    id: '12',
    name: 'Robert Chen',
    email: 'r.chen@example.com',
    role: 'Instructor',
    status: 'Active',
    department: '',
    joinedDate: 'Oct 01, 2024',
    avatar: 'https://i.pravatar.cc/150?u=12',
  },
]

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
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedInstructorIds, setSelectedInstructorIds] = useState<string[]>([])

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

  const handleAddInstructors = () => {
    console.log('Adding instructors to department:', selectedInstructorIds)
    // Add logic to save changes
    setIsAddModalOpen(false)
    setSelectedInstructorIds([])
  }

  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Add Instructors</h3>
              <p className="mt-1 text-sm text-white/80">Select instructors to add to the CITE department.</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-2 pr-2">
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
                        onClick={() => toggleInstructorSelection(instructor.id)}
                        className={`group flex w-full items-center gap-4 rounded-md border p-3 text-left transition-all ${
                          isSelected 
                            ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 shadow-sm' 
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-md'
                        }`}
                      >
                        <div className="relative">
                          <img
                            src={instructor.avatar}
                            alt={instructor.name}
                            className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                          />
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
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedInstructorIds.length === 0}
                  onClick={handleAddInstructors}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--brand-color)]"
                >
                  Add {selectedInstructorIds.length > 0 ? `(${selectedInstructorIds.length})` : ''} to Dept
                </button>
              </div>
            </div>
          </div>
          {/* Click outside to close */}
          <div className="absolute inset-0 -z-10" onClick={() => setIsAddModalOpen(false)} />
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
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <BuildingIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-3xl font-bold text-gray-900 leading-tight">College of Information Technology</p>
                  <span className="flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[16px] font-black uppercase tracking-widest text-gray-500 shadow-sm">
                    <span className="mr-[-0.1em]">{/* Offset for tracking-widest */}CITE</span>
                  </span>
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

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
            >
              <PlusIcon className="h-5 w-5" />
              Add Instructor
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
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Role
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[20%]">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Joined Date
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest text-gray-500 w-[15%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
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
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="h-10 w-10 rounded-full border border-gray-300 object-cover"
                          />
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
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <IconButton
                            label="Edit member"
                            className="h-8 w-8 rounded-md bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all border border-gray-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              console.log('Edit member:', member.id)
                            }}
                          >
                            <EditIcon className="h-4.5 w-4.5" />
                          </IconButton>
                          <IconButton
                            label="Remove member"
                            className="h-8 w-8 rounded-md bg-white text-rose-400 shadow-sm hover:bg-rose-50 hover:text-rose-600 transition-all border border-gray-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              console.log('Remove member:', member.id)
                            }}
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

export default MyDepartmentPage
