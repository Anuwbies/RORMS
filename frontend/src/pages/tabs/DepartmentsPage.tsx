import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { DepartmentIcon, PlusIcon, EditIcon, TrashIcon, UsersIcon, CloseIcon, UploadIcon, ChevronDownIcon, CheckIcon, UserIcon, SettingsIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { SearchFilters } from '../../components/SearchFilters'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { IconOnlyButton } from '../../components/IconOnlyButton'
import { FilterDropdown } from '../../components/FilterDropdown'
import { TextInput } from '../../components/TextInput'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { db, storage } from '../../firebase'
import { collection, serverTimestamp, onSnapshot, query, orderBy, doc, writeBatch, where, limit, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { CropModal } from '../../components/CropModal'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { SummaryCard } from '../../components/SummaryCard'
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
  roomStyle?: number
}

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
}

type PersonType = {
  id: string;
  direction: 'right' | 'left';
  duration: number;
  bottom: string;
  spawnTime: number;
  type: 'human' | 'crewmate' | 'imposter';
  colorClass?: string;
  stopPosition?: number;
};

const RoomHallwayForeground = () => {
  const [people, setPeople] = useState<PersonType[]>([]);
  const prevDirRef = useRef<'right' | 'left' | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const spawnPerson = () => {
      const rand = Math.random();
      let direction: 'right' | 'left';
      if (prevDirRef.current === 'right') {
        direction = rand < 0.75 ? 'left' : 'right';
      } else if (prevDirRef.current === 'left') {
        direction = rand < 0.75 ? 'right' : 'left';
      } else {
        direction = rand < 0.5 ? 'right' : 'left';
      }
      prevDirRef.current = direction;

      const randType = Math.random();
      const isImposter = randType < 0.005; // 0.5% chance (1 in 200)
      const isCrewmate = randType >= 0.005 && randType < 0.015; // 1% chance (1 in 100)
      const baseDuration = 6 + Math.random() * 11;
      const duration = isImposter ? baseDuration + 7 : baseDuration;
      const bottom = (2 + Math.random() * 5).toFixed(1) + '%';
      const id = Date.now().toString() + Math.random().toString();
      const spawnTime = Date.now();
      const colors = ['text-red-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-pink-500', 'text-cyan-400', 'text-orange-500', 'text-slate-800', 'text-slate-100'];
      const colorClass = (isCrewmate || isImposter) ? colors[Math.floor(Math.random() * colors.length)] : undefined;

      setPeople(prev => {
        // Clean up people whose animation finished
        const activePeople = prev.filter(p => spawnTime - p.spawnTime < (p.duration * 1000 + 500));
        return [...activePeople, { id, direction, duration, bottom, spawnTime, type: isImposter ? 'imposter' : (isCrewmate ? 'crewmate' : 'human'), colorClass, stopPosition: isImposter ? 20 + Math.random() * 60 : undefined }];
      });

      timeoutId = setTimeout(spawnPerson, 1500 + Math.random() * 3500);
    };

    const spawnSpecific = (type: 'crewmate' | 'imposter') => {
      const direction = Math.random() < 0.5 ? 'right' : 'left';
      const baseDuration = 4 + Math.random() * 5;
      const duration = type === 'imposter' ? baseDuration + 7 : baseDuration;
      const bottom = (2 + Math.random() * 5).toFixed(1) + '%';
      const id = Date.now().toString() + Math.random().toString();
      const spawnTime = Date.now();
      const colors = ['text-red-500', 'text-blue-500', 'text-emerald-500', 'text-amber-500', 'text-purple-500', 'text-pink-500', 'text-cyan-400', 'text-orange-500', 'text-slate-800', 'text-slate-100'];
      const colorClass = colors[Math.floor(Math.random() * colors.length)];
      setPeople(prev => {
        const activePeople = prev.filter(p => spawnTime - p.spawnTime < (p.duration * 1000 + 500));
        return [...activePeople, { id, direction, duration, bottom, spawnTime, type, colorClass, stopPosition: type === 'imposter' ? 20 + Math.random() * 60 : undefined }];
      });
    };

    const handleForceCrewmate = () => spawnSpecific('crewmate');
    const handleForceImposter = () => spawnSpecific('imposter');

    timeoutId = setTimeout(spawnPerson, Math.random() * 2000);
    window.addEventListener('spawn-crewmate', handleForceCrewmate);
    window.addEventListener('spawn-imposter', handleForceImposter);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('spawn-crewmate', handleForceCrewmate);
      window.removeEventListener('spawn-imposter', handleForceImposter);
    };
  }, []);

  return (
    <>
      {people.map(person => (
        person.type === 'imposter' ? (
          <AmongUsImposter
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
            color={person.colorClass}
            stopPosition={person.stopPosition}
          />
        ) : person.type === 'crewmate' ? (
          <AmongUsCrewmate
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
            color={person.colorClass}
          />
        ) : (
          <WalkingPerson 
            key={person.id}
            duration={`${person.duration}s`}
            direction={person.direction}
            bottom={person.bottom}
          />
        )
      ))}
    </>
  );
};

const WalkingPerson = ({ duration, direction = 'right', bottom = '6%', delay = '0s' }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string }) => {
  const bobDur = (parseFloat(duration) / 16).toFixed(2);
  
  return (
  <div 
    className="absolute h-[45%] aspect-square pointer-events-none drop-shadow-md"
    style={{
      bottom,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `walkAcross_${direction} ${duration} linear forwards ${delay}`,
      left: direction === 'right' ? '-20%' : '120%'
    }}
  >
    <svg 
      viewBox="0 0 24 24" 
      preserveAspectRatio="xMidYMax meet"
      fill="currentColor" 
      className={`w-full h-full text-slate-700/60 ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out infinite ${delay}` }}
    >
      <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
    </svg>
  </div>
)};

const AmongUsCrewmate = ({ duration, direction = 'right', bottom = '6%', delay = '0s', color = 'text-red-500' }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string, color?: string }) => {
  const bobDur = (parseFloat(duration) / 16).toFixed(2);
  
  return (
  <div 
    className={`absolute h-[25%] aspect-[0.7] pointer-events-none drop-shadow-md ${color}`}
    style={{
      bottom: `calc(${bottom} + 2.5%)`,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `walkAcross_${direction} ${duration} linear forwards ${delay}`,
      left: direction === 'right' ? '-20%' : '120%'
    }}
  >
    <svg 
      viewBox="18 18 79 74" 
      preserveAspectRatio="xMidYMax meet"
      className={`w-full h-full ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out infinite ${delay}` }}
    >
      {/* Backpack */}
      <path d="M 25 35 Q 20 35 20 40 L 20 70 Q 20 75 25 75 L 30 75 L 30 35 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      {/* Body */}
      <path d="M 30 50 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      {/* Visor */}
      <rect x="50" y="28" width="45" height="27" rx="13.5" fill="#90e0ef" stroke="#1e293b" strokeWidth="4"/>
      {/* Visor Shine */}
      <rect x="62" y="32" width="22" height="7" rx="3.5" fill="#ffffff" opacity="0.8"/>
    </svg>
  </div>
)};

const AmongUsImposter = ({ duration, direction = 'right', bottom = '6%', delay = '0s', color = 'text-red-500', stopPosition = 40 }: { duration: string, direction?: 'right' | 'left', bottom?: string, delay?: string, color?: string, stopPosition?: number }) => {
  const totalDur = parseFloat(duration);
  const bobDur = ((totalDur > 7 ? totalDur - 7 : totalDur) / 16).toFixed(2);
  
  const walkHalf = ((totalDur - 7) / 2).toFixed(2);
  const waitBefore = 1;
  const mouthOpenDur = 5;
  const mouthCloseDur = 1;
  
  const hingeOpenDelay = parseFloat(walkHalf) + waitBefore;
  const hingeCloseDelay = hingeOpenDelay + mouthOpenDur;
  const walkOutDelay = hingeCloseDelay + mouthCloseDur;
  
  const walkInAnim = `walkIn_${direction} ${walkHalf}s linear forwards ${delay}`;
  const walkOutAnim = `walkOut_${direction} ${walkHalf}s linear forwards calc(${delay} + ${walkOutDelay}s)`;

  return (
  <div 
    className={`absolute h-[25%] aspect-[0.7] pointer-events-none drop-shadow-md ${color}`}
    style={{
      bottom: `calc(${bottom} + 2.5%)`,
      zIndex: Math.floor(100 - (parseFloat(bottom) * 10)),
      animation: `${walkInAnim}, ${walkOutAnim}`,
      left: direction === 'right' ? '-20%' : '120%',
      '--stop-pos': `${stopPosition}%`
    } as React.CSSProperties}
  >
    <svg 
      viewBox="18 18 79 74" 
      preserveAspectRatio="xMidYMax meet"
      className={`w-full h-full overflow-visible ${direction === 'left' ? 'scale-x-[-1]' : ''}`}
      style={{ animation: `walkBob ${bobDur}s ease-in-out 8 ${delay}, walkBob ${bobDur}s ease-in-out 8 calc(${delay} + ${walkOutDelay}s)` }}
    >
      <path d="M 25 35 Q 20 35 20 40 L 20 70 Q 20 75 25 75 L 30 75 L 30 35 Z" fill="currentColor" stroke="#1e293b" strokeWidth="4"/>
      <g className="imposter-bottom">
        <path d="M 30 54 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 54 Z" fill="currentColor" stroke="none"/>
        <path d="M 30 55 L 30 85 Q 30 90 35 90 L 45 90 Q 50 90 50 85 L 50 75 L 65 75 L 65 85 Q 65 90 70 90 L 80 90 Q 85 90 85 85 L 85 55" fill="none" stroke="#1e293b" strokeWidth="4"/>

        <path d="M 50 55 C 65 40, 85 20, 110 35 C 105 45, 75 40, 50 55 Z" fill="#e11d48" stroke="#1e293b" strokeWidth="2.5" opacity="0" style={{ transformOrigin: '50px 55px', animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s), tongueWiggle 0.6s ease-in-out calc(${delay} + ${hingeOpenDelay + 0.3}s) ${Math.floor((mouthOpenDur - 0.3) / 0.6)}` }} />
        <path d="M 31 55 L 35 43 L 39 55" fill="currentColor" stroke="none" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
        <path d="M 46 55 L 50 43 L 54 55 M 60 55 L 64 43 L 68 55 M 74 55 L 78 43 L 82 55" fill="#fff" stroke="#1e293b" strokeWidth="2" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
      </g>
      <g className="imposter-top" style={{ transformOrigin: '30px 55px', animation: `imposterHingeOpen 0.2s ease forwards calc(${delay} + ${hingeOpenDelay}s), imposterHingeClose 0.2s ease forwards calc(${delay} + ${hingeCloseDelay}s)` }}>
        <path d="M 30 56 L 85 56 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 Z" fill="currentColor" stroke="none"/>
        <path d="M 85 55 L 85 45 Q 85 20 57.5 20 Q 30 20 30 45 L 30 55" fill="none" stroke="#1e293b" strokeWidth="4"/>
        <path d="M 46 55 L 50 67 L 54 55 M 60 55 L 64 67 L 68 55 M 74 55 L 78 67 L 82 55" fill="#fff" stroke="#1e293b" strokeWidth="2" opacity="0" style={{ animation: `imposterRevealOn 0s forwards calc(${delay} + ${hingeOpenDelay}s), imposterRevealOff 0s forwards calc(${delay} + ${hingeCloseDelay}s)` }}/>
        <rect x="50" y="28" width="45" height="27" rx="13.5" fill="#90e0ef" stroke="#1e293b" strokeWidth="4"/>
        <rect x="62" y="32" width="22" height="7" rx="3.5" fill="#ffffff" opacity="0.8"/>
      </g>
    </svg>
  </div>
)};

function DepartmentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [deanStatusFilters, setDeanStatusFilters] = useState<string[]>([])
  const [deptSizeFilters, setDeptSizeFilters] = useState<string[]>([])
  const [selectedDept, setSelectedDept] = useState<Department | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [currentRoomPage, setCurrentRoomPage] = useState(0)
  const [showAmongUsButton, setShowAmongUsButton] = useState(false)

  useEffect(() => {
    setCurrentRoomPage(0)
  }, [searchTerm, deanStatusFilters, deptSizeFilters])

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
  }, [departments, allUsers, searchTerm, deanStatusFilters, deptSizeFilters])

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
          roomStyle: 0,
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
      width: '48%',
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
      width: '27%',
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
      header: 'Status',
      width: '23%',
      render: (member) => (
        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${
          member.status === 'Active' ? 'bg-emerald-100 text-emerald-700' :
          member.status === 'Inactive' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '2%',
      align: 'right',
      render: (member) => <span className="text-sm font-medium text-gray-500 whitespace-nowrap">{member.joinedDate}</span>
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
      `}</style>
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
            
            <div className="overflow-y-auto custom-scrollbar bg-slate-50">
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
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">


                {/* Card 0: Academic Departments */}
                <SummaryCard
                  title="Departments"
                  subtitle="Total registered"
                  icon={
                    <div 
                      onClick={() => setShowAmongUsButton(prev => !prev)} 
                      className="cursor-default hover:opacity-80 transition-opacity" 
                    >
                      <DepartmentIcon className="h-4.5 w-4.5 text-[var(--brand-color)]" />
                    </div>
                  }
                  gradientClasses="from-[var(--brand-color)]/20 to-[var(--brand-color)]/10"
                  outlineClasses="bg-[var(--brand-color)]"
                  blobClasses="bg-[var(--brand-color)]/5"
                >
                  <div className="absolute inset-0 group/pager">
                    <div className="absolute inset-0 bg-slate-300 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] shadow-inner border-[3px] border-slate-200">
                    {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).map((dept, idx) => {
                      const styleIdx = dept.roomStyle ?? 0;
                      const styles = [
                        { wall: 'bg-slate-50', frame: 'bg-slate-200 border-slate-300', door: 'from-[#d4a373] to-[#c8925a]', handle: 'bg-slate-300', floor: 'bg-[#b69a81]' }, // Wood/Beige Floor
                        { wall: 'bg-sky-50/50', frame: 'bg-sky-200 border-sky-300', door: 'from-slate-100 to-slate-200', handle: 'bg-slate-400', floor: 'bg-slate-200' }, // White/Grey Tile
                        { wall: 'bg-stone-50', frame: 'bg-stone-200 border-stone-300', door: 'from-[#475569] to-[#334155]', handle: 'bg-slate-300', floor: 'bg-stone-300' }, // Metal/Concrete
                        { wall: 'bg-emerald-50/50', frame: 'bg-emerald-200 border-emerald-300', door: 'from-emerald-700 to-emerald-800', handle: 'bg-amber-300', floor: 'bg-emerald-900/40' }, // Green/Dark Carpet
                        { wall: 'bg-[#f3f7ee]', frame: 'bg-[#c6dbb6] border-[#a3c48b]', door: 'from-[#62853e] to-[#41572a]', handle: 'bg-amber-400', floor: 'bg-[#e3edda]' }, // PHINMA Brand
                        { wall: 'bg-blue-50/50', frame: 'bg-blue-200 border-blue-300', door: 'from-blue-700 to-blue-900', handle: 'bg-slate-300', floor: 'bg-blue-900/30' }, // Royal Blue
                        { wall: 'bg-orange-50/50', frame: 'bg-orange-200 border-orange-300', door: 'from-[#9c3e21] to-[#702a15]', handle: 'bg-amber-200', floor: 'bg-[#e3b896]' }, // Warm Autumn Wood
                        { wall: 'bg-slate-100', frame: 'bg-slate-300 border-slate-400', door: 'from-slate-800 to-slate-950', handle: 'bg-slate-200', floor: 'bg-slate-400' } // Modern Charcoal
                      ][styleIdx % 8];

                      return (
                      <div key={dept.id} className={`relative w-full h-full group/room flex flex-col ${styles.wall} overflow-hidden`}>
                        {/* Settings Button */}
                        <button 
                          onClick={async (e) => { 
                            e.stopPropagation(); 
                            const nextStyle = ((dept.roomStyle ?? 0) + 1) % 8;
                            try {
                              await updateDoc(doc(db, 'departments', dept.id), { roomStyle: nextStyle });
                            } catch(err) {
                              console.error("Error updating room style", err);
                            }
                          }}
                          className="absolute top-2 left-2 z-[60] w-6 h-6 bg-white/80 hover:bg-white backdrop-blur-sm rounded flex items-center justify-center opacity-0 group-hover/room:opacity-100 transition-opacity shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-black/10 text-slate-500 hover:text-[var(--brand-color)] cursor-pointer"
                          title="Change Room Style"
                        >
                          <SettingsIcon className="w-4 h-4" />
                        </button>
                        
                          {/* Wall Space (contains Plaque and Door) */}
                          <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
                                              {/* Door Frame */}
                            <div className={`relative w-[28%] h-[70%] flex-shrink-0 ${styles.frame} rounded-t-sm border-x-4 border-t-4 flex justify-center shadow-inner z-10`}>
                              {/* Bright Interior (Visible when door opens) */}
                              <div className="absolute bottom-0 w-[96%] h-[98%] bg-amber-50 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden flex flex-col justify-end">
                                {/* Back Wall Poster/Window */}
                                <div className="absolute top-[20%] left-[20%] w-[30%] h-[20%] bg-blue-100 border border-blue-200/50" />
                                
                                {/* Front Desk */}
                                <div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]">
                                  {/* Back of Computer Monitor */}
                                  <div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end">
                                    {/* Monitor Screen (Back) */}
                                    <div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10">
                                      <div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" />
                                    </div>
                                    {/* Monitor Stand */}
                                    <div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" />
                                  </div>
                                </div>
                              </div>
                              
                              {/* The Door itself */}
                              <div className={`absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b ${styles.door} rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right group-hover/room:[transform:perspective(800px)_rotateY(-75deg)] group-hover/room:shadow-[inset_0_0_30px_rgba(0,0,0,0.5)] z-10`}>
                                {/* Door Handle */}
                                <div className={`w-1 h-3.5 rounded-full flex-shrink-0 ${styles.handle} border border-black/20 shadow-sm transition-transform duration-500 group-hover/room:scale-x-50`} />
                              </div>
                            </div>

                            {/* Detailed Corkboard (Bulletin Board) */}
                            <div className="flex-1 h-[55%] mb-[12%] z-10 transition-transform duration-300 group-hover/room:scale-[1.02]">
                              <div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden group/board">
                                {/* Cork texture (subtle dots) */}
                                <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" />
                                
                                {/* Single Paper - Code & Count */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[75%] bg-white shadow-[1px_1px_2px_rgba(0,0,0,0.15)] flex flex-col items-center justify-center -rotate-1 border border-slate-100 z-10 transition-transform group-hover/board:scale-105">
                                  {/* Red Pin */}
                                  <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-500 shadow-[0_1px_1px_rgba(0,0,0,0.4)] border-[0.5px] border-red-700" />
                                  <span 
                                    className="text-[9px] text-slate-800 text-center w-full leading-none truncate px-1"
                                    style={{ fontFamily: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', cursive" }}
                                  >
                                    {dept.code}: {allUsers.filter((u) => u.department === dept.code).length}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Baseboard */}
                            <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
                          </div>

                          {/* Floor */}
                          <div className={`w-full h-[12%] ${styles.floor} border-t border-black/20 shadow-[inset_0_3px_5px_rgba(0,0,0,0.05)] z-0`} />
                        </div>
                      )})}
                      
                      {/* Unassigned Spaces */}
                      {departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length < 4 && Array.from({ length: 4 - departments.slice(currentRoomPage * 4, (currentRoomPage + 1) * 4).length }).map((_, i) => (
                        <div key={`empty-${i}`} className="relative w-full h-full group/room flex flex-col bg-slate-100 overflow-hidden">
                           <div className="relative flex-1 w-full flex items-end justify-start pl-[8%] pr-[8%] gap-4">
                             
                             {/* Generic Closed Door */}
                             <div className="relative w-[28%] h-[70%] flex-shrink-0 bg-slate-300 rounded-t-sm border-x-4 border-t-4 border-slate-400 flex justify-center shadow-inner z-10">
                               {/* Bright Interior (Visible when door opens) */}
                               <div className="absolute bottom-0 w-[96%] h-[98%] bg-slate-200 shadow-[inset_0_5px_15px_rgba(0,0,0,0.05)] rounded-t-[1px] overflow-hidden">
                                 {/* Front Desk (Empty/Abandoned) */}
                                 <div className="absolute bottom-0 w-full h-[25%] bg-[#d4b483] border-t-2 border-[#e6cca3] shadow-[0_-3px_5px_rgba(0,0,0,0.05)] z-10 flex items-end justify-center pb-[2px]">
                                  {/* Back of Computer Monitor */}
                                  <div className="w-[55%] h-[140%] -translate-y-[85%] -translate-x-[20%] flex flex-col items-center justify-end">
                                    {/* Monitor Screen (Back) */}
                                    <div className="w-[85%] h-[100%] bg-slate-800 border border-slate-700 rounded-[2px] flex items-center justify-center shadow-sm z-10">
                                      <div className="w-[55%] h-[60%] rounded-[1px] bg-slate-600/80" />
                                    </div>
                                    {/* Monitor Stand */}
                                    <div className="w-[80%] h-[20%] bg-slate-700 rounded-t-[1px]" />
                                  </div>
                                 </div>
                               </div>
                               
                               {/* The Door itself */}
                               <div className="absolute bottom-0 w-[96%] h-[98%] bg-gradient-to-b from-slate-300 to-slate-400 rounded-t-[1px] border border-black/10 flex items-center pl-[12%] transition-all duration-500 ease-in-out origin-right group-hover/room:[transform:perspective(800px)_rotateY(-75deg)] group-hover/room:shadow-[inset_0_0_30px_rgba(0,0,0,0.3)] z-10">
                                 <div className="w-1 h-3.5 rounded-full flex-shrink-0 bg-slate-500 border border-black/10 shadow-[inset_0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-500 group-hover/room:scale-x-50" />
                               </div>
                             </div>

                             {/* Empty Room Corkboard */}
                             <div className="flex-1 h-[55%] mb-[12%] z-10 opacity-75">
                               <div className="w-full h-full bg-[#e3c39d] border-[3px] border-[#8b5a2b] shadow-[0_2px_4px_rgba(0,0,0,0.15)] relative overflow-hidden grayscale-[0.4]">
                                 {/* Cork texture */}
                                 <div className="absolute inset-0 opacity-[0.15] bg-[radial-gradient(#3e2723_1px,transparent_1px)] [background-size:4px_4px]" />
                                 
                                 {/* Vacant Sign */}
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[45%] bg-slate-100 shadow-[1px_2px_3px_rgba(0,0,0,0.2)] flex flex-col items-center justify-center rotate-2 border border-slate-200 z-10">
                                   {/* Top left pin */}
                                   <div className="absolute top-0.5 left-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" />
                                   {/* Top right pin */}
                                   <div className="absolute top-0.5 right-1 w-1 h-1 rounded-full bg-slate-400 shadow-[0_1px_1px_rgba(0,0,0,0.3)] border-[0.5px] border-slate-500" />
                                   <span className="text-[8px] font-black text-rose-800/50 uppercase tracking-widest text-center w-full leading-none">
                                     VACANT
                                   </span>
                                 </div>
                               </div>
                             </div>
                             
                             {/* Baseboard */}
                             <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/5 border-t border-black/10 z-0" />
                           </div>
                           {/* Floor */}
                           <div className="w-full h-[12%] bg-slate-200 border-t border-slate-300/50 shadow-[inset_0_3px_5px_rgba(0,0,0,0.02)] z-0" />
                        </div>
                      ))}
                    </div>
                    
                    {/* Permanent Walkers Overlay (Decoupled from page state) */}
                    <div className="absolute inset-0 rounded-xl overflow-hidden grid grid-cols-2 grid-rows-2 gap-[2px] pointer-events-none z-[50]">
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground /></div>
                      <div className="relative w-full h-full overflow-hidden"><RoomHallwayForeground /></div>
                    </div>
                  
                    {/* Pagination Controls */}
                    {departments.length > 4 && (
                      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover/pager:opacity-100 transition-opacity duration-300 z-[60]">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p === 0 ? Math.ceil(departments.length / 4) - 1 : p - 1) }}
                          className="pointer-events-auto absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"
                        >
                          <ChevronDownIcon className="w-4 h-4 rotate-90" />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setCurrentRoomPage(p => p >= Math.ceil(departments.length / 4) - 1 ? 0 : p + 1) }}
                          className="pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md border border-slate-200 text-slate-700 hover:bg-white hover:text-[var(--brand-color)] transition-all"
                        >
                          <ChevronDownIcon className="w-4 h-4 -rotate-90" />
                        </button>
                        
                        {/* Dots Indicator */}
                        <div className="pointer-events-auto absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 bg-black/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                          {Array.from({ length: Math.ceil(departments.length / 4) }).map((_, i) => (
                             <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === currentRoomPage ? 'bg-white' : 'bg-white/40'}`} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SummaryCard>

                {/* Card 1: Total Faculty */}
                <SummaryCard
                  title="Faculty"
                  subtitle="Enrolled members"
                  icon={<UsersIcon className="h-4.5 w-4.5 text-sky-600" />}
                  gradientClasses="from-sky-200 to-sky-100"
                  outlineClasses="bg-sky-500"
                  blobClasses="bg-sky-500/5"
                />

                {/* Card 2: Dean Coverage */}
                <SummaryCard
                  title="Dean Coverage"
                  subtitle="Assigned deans"
                  icon={<UserIcon className="h-4.5 w-4.5 text-amber-600" />}
                  gradientClasses="from-amber-200 to-amber-100"
                  outlineClasses="bg-amber-500"
                  blobClasses="bg-amber-500/5"
                />



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
    </section>
  )
}

export default DepartmentsPage
