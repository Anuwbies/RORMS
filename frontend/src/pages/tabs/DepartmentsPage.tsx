import { useState, useRef } from 'react'
import { DepartmentIcon, SearchIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, CameraIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

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
  {
    id: '5',
    name: 'David Wilson',
    email: 'd.wilson@example.com',
    role: 'Registrar',
    status: 'Pending',
    joinedDate: 'Mar 02, 2024',
    avatar: 'https://i.pravatar.cc/150?u=5',
  },
  {
    id: '6',
    name: 'Robert Fox',
    email: 'robert.fox@example.com',
    role: 'Instructor',
    status: 'Active',
    department: 'CEA',
    joinedDate: 'Apr 10, 2024',
    avatar: 'https://i.pravatar.cc/150?u=6',
  },
  {
    id: '7',
    name: 'Jane Cooper',
    email: 'jane.cooper@example.com',
    role: 'Instructor',
    status: 'Active',
    department: 'CAS',
    joinedDate: 'May 22, 2024',
    avatar: 'https://i.pravatar.cc/150?u=7',
  },
]

interface Department {
  id: string
  code: string
  name: string
  dean: string
  memberCount: number
  roomCount: number
  createdDate: string
  logo: string
}

const departments: Department[] = [
  {
    id: '1',
    code: 'CITE',
    name: 'College of Information Technology',
    dean: 'Michael Chen',
    memberCount: 2,
    roomCount: 12,
    createdDate: 'Oct 12, 2023',
    logo: 'https://ui-avatars.com/api/?name=CITE&background=0D8ABC&color=fff',
  },
  {
    id: '2',
    code: 'CEA',
    name: 'College of Engineering and Architecture',
    dean: 'Sarah Jenkins',
    memberCount: 1,
    roomCount: 18,
    createdDate: 'Nov 05, 2023',
    logo: 'https://ui-avatars.com/api/?name=CEA&background=E53E3E&color=fff',
  },
  {
    id: '3',
    code: 'CAS',
    name: 'College of Arts and Sciences',
    dean: 'Elena Rodriguez',
    memberCount: 1,
    roomCount: 22,
    createdDate: 'Jan 20, 2024',
    logo: 'https://ui-avatars.com/api/?name=CAS&background=38A169&color=fff',
  },
  {
    id: '4',
    code: 'CMA',
    name: 'College of Management and Accountancy',
    dean: 'David Wilson',
    memberCount: 0,
    roomCount: 15,
    createdDate: 'Feb 15, 2024',
    logo: 'https://ui-avatars.com/api/?name=CMA&background=805AD5&color=fff',
  },
]

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
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')
  const [newDeptDean, setNewDeptDean] = useState('')
  const [newDeptLogo, setNewDeptLogo] = useState('')
  const [errors, setErrors] = useState({ name: false, code: false })

  const filteredDepartments = departments.filter((dept) =>
    [dept.name, dept.code, dept.dean].some((val) =>
      val.toLowerCase().includes(searchTerm.toLowerCase())
    )
  )

  const deptMembers = selectedDept 
    ? members.filter(m => m.department === selectedDept.code)
    : []

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept)
    setNewDeptName(dept.name)
    setNewDeptCode(dept.code)
    setNewDeptDean(dept.dean)
    setNewDeptLogo(dept.logo)
    setErrors({ name: false, code: false })
  }

  const handleCloseFormModal = () => {
    setIsCreateModalOpen(false)
    setEditingDept(null)
    setNewDeptName('')
    setNewDeptCode('')
    setNewDeptDean('')
    setNewDeptLogo('')
    setErrors({ name: false, code: false })
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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors = {
      name: !newDeptName.trim(),
      code: !newDeptCode.trim()
    }

    if (newErrors.name || newErrors.code) {
      setErrors(newErrors)
      return
    }

    const finalLogo = newDeptLogo || `https://ui-avatars.com/api/?name=${newDeptCode || 'DEPT'}&background=random`

    if (editingDept) {
      console.log('Updating Department:', { id: editingDept.id, name: newDeptName, code: newDeptCode, dean: newDeptDean, logo: finalLogo })
    } else {
      console.log('Creating Department:', { name: newDeptName, code: newDeptCode, dean: newDeptDean, logo: finalLogo })
    }
    
    handleCloseFormModal()
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Create/Edit Department Modal */}
      {(isCreateModalOpen || editingDept) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold">{editingDept ? 'Edit Department' : 'Create Department'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingDept ? 'Update the details of this university department.' : 'Add a new university department to the system.'}
              </p>
            </div>
            
            <form onSubmit={handleFormSubmit} className="p-6 space-y-5">
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
                    </label>
                    <input
                      id="dept-code"
                      type="text"
                      value={newDeptCode}
                      onChange={(e) => {
                        setNewDeptCode(e.target.value)
                        if (errors.code) setErrors(prev => ({ ...prev, code: false }))
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
                    <input
                      id="dept-dean"
                      type="text"
                      value={newDeptDean}
                      onChange={(e) => setNewDeptDean(e.target.value)}
                      placeholder="e.g. Michael Chen"
                      className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="dept-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="dept-name"
                  type="text"
                  value={newDeptName}
                  onChange={(e) => {
                    setNewDeptName(e.target.value)
                    if (errors.name) setErrors(prev => ({ ...prev, name: false }))
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg"
                >
                  {editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
          <div className="absolute inset-0 -z-10" onClick={handleCloseFormModal} />
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
                          src={member.avatar}
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
                {filteredDepartments.length === 0 ? (
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
                        {dept.dean}
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
                            onClick={() => console.log('Remove department:', dept.id)}
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
