import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react'
import { 
  BuildingIcon, 
  CalendarIcon, 
  CheckIcon, 
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon, 
  CloseIcon, 
  DepartmentIcon, 
  DoorIcon, 
  EditIcon, 
  LayersIcon, 
  PlusIcon,
  SearchIcon, 
  SpinnerIcon, 
  TrashIcon, 
  UserIcon, 
  UsersIcon,
  DuplicateIcon,
  ExclamationIcon,
  QuestionIcon,
  AlertCircleIcon
} from '../../components/Icons'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { SectionHeader } from '../../components/SectionHeader'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown } from '../../components/FilterDropdown'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { SummaryCard } from '../../components/SummaryCard'
import { ScheduleModal } from '../../components/ScheduleModal'
import { db } from '../../firebase'
import { 
  collection, 
  onSnapshot, 
  query, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  serverTimestamp,
  where,
  getDocs,
  limit
} from 'firebase/firestore'

interface Department {
  id: string
  name: string
  code: string
  dean?: string
  logo?: string
}

interface Building {
  id: string
  name: string
  code: string
}

interface Room {
  id: string
  code: string
  name: string
  buildingId: string
  capacity?: number
  type?: string
  floor?: number
}

interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: { name?: string; phase?: string; startMonth?: string; endMonth?: string }
  sem2?: { name?: string; phase?: string; startMonth?: string; endMonth?: string }
}

interface Member {
  id: string
  membershipId: string
  name: string
  email: string
  role: string
  status: string
  department: string
  avatar?: string
  joinedDate?: string
  joinedAt?: Date | null
}

interface ScheduleRow {
  id: string
  docId?: string
  childDocId?: string
  groupId?: string
  parentId?: string
  orderIndex: number
  type: string
  format: string
  format2?: string
  subjectCode: string
  subjectTitle: string
  classSection: string
  instructorId: string
  instructorId2?: string
  startTime: string
  startTime2?: string
  endTime: string
  endTime2?: string
  days: string[]
  buildingId: string
  buildingId2?: string
  roomId: string
  roomId2?: string
  status?: string
  department?: string
  academicYear?: string
  semester?: string
}

const generateId = () => Math.random().toString(36).substring(2, 9)

const START_TIME_OPTIONS = [
  { value: '07:30', label: '07:30 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:30', label: '01:30 PM' },
  { value: '15:00', label: '03:00 PM' },
  { value: '16:30', label: '04:30 PM' },
]

const roleClasses: Record<string, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
  Member: 'bg-gray-100 text-gray-700',
  Registrar: 'bg-blue-100 text-blue-700'
}

const statusClasses: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700',
  Inactive: 'bg-gray-100 text-gray-700',
  Pending: 'bg-amber-100 text-amber-700',
}

const phaseClasses: Record<string, string> = {
  Drafting: 'bg-blue-50 text-blue-700 border-blue-200',
  Plotting: 'bg-amber-50 text-amber-700 border-amber-200',
  Revision: 'bg-purple-50 text-purple-700 border-purple-200',
  Final: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-gray-50 text-gray-600 border-gray-200'
}

const formatShortMonth = (dateStr?: string) => {
  if (!dateStr) return ''
  return dateStr
}

const getDurationMins = (start: string, end: string) => {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

const calculateEndTime = (start: string, durationMins: number) => {
  if (!start || !durationMins || isNaN(durationMins)) return ''
  const [h, m] = start.split(':').map(Number)
  const totalMins = h * 60 + m + durationMins
  const endH = Math.floor(totalMins / 60).toString().padStart(2, '0')
  const endM = (totalMins % 60).toString().padStart(2, '0')
  return `${endH}:${endM}`
}

const resolveBuildingCode = (building?: { code?: string; name: string }, roomsList: Room[] = []) => {
  if (!building) return ''
  if (building.code) return building.code
  const bRooms = roomsList.filter(r => r.buildingId === (building as any).id)
  if (bRooms.length > 0 && bRooms[0].code) {
    const parts = bRooms[0].code.split('-')
    if (parts.length > 1) return parts[0]
  }
  return building.name
}

const createDefaultSchedule = (): ScheduleRow => ({
  id: generateId(),
  type: 'normal',
  format: 'Lec',
  format2: '',
  subjectCode: '',
  subjectTitle: '',
  classSection: '',
  instructorId: '',
  instructorId2: '',
  startTime: '',
  startTime2: '',
  endTime: '',
  endTime2: '',
  days: [],
  buildingId: '',
  buildingId2: '',
  roomId: '',
  roomId2: '',
  parentId: undefined,
  orderIndex: 0,
  status: 'Drafted'
})

const InnerDropdown = ({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Select"
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
  placeholder?: string
}) => {
  return (
    <details className="relative w-full group">
      <summary
        onClick={(e) => {
          if (disabled) e.preventDefault()
          else {
            const summary = e.currentTarget
            const rect = summary.getBoundingClientRect()
            const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement
            if (dropdown) {
              if (window.innerHeight - rect.bottom < 200) {
                dropdown.style.top = 'auto'
                dropdown.style.bottom = '100%'
                dropdown.style.marginTop = '0'
                dropdown.style.marginBottom = '4px'
              } else {
                dropdown.style.top = '100%'
                dropdown.style.bottom = 'auto'
                dropdown.style.marginTop = '4px'
                dropdown.style.marginBottom = '0'
              }
            }
          }
        }}
        className={`w-full p-2 border border-gray-300 rounded text-sm focus:outline-none bg-white list-none [&::-webkit-details-marker]:hidden flex items-center justify-between ${
          disabled ? 'bg-gray-100 cursor-default text-gray-500' : 'focus:border-[var(--brand-color)] focus:ring-1 focus:ring-[var(--brand-color)] cursor-pointer'
        }`}
      >
        <span className="truncate">{options.find(o => o.value === value)?.label || placeholder}</span>
      </summary>
      {!disabled && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.closest('details')?.removeAttribute('open')
            }}
          />
          <div className="absolute top-full mt-1 left-0 z-[70] bg-white border border-gray-300 shadow-xl p-1 flex flex-col gap-1 rounded w-full max-h-[12.5rem] overflow-y-auto">
            <button
              type="button"
              onClick={(e) => {
                onChange('')
                e.stopPropagation()
                e.currentTarget.closest('details')?.removeAttribute('open')
              }}
              className="text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate text-gray-500 italic shrink-0 cursor-pointer"
            >
              {placeholder}
            </button>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  onChange(opt.value)
                  e.stopPropagation()
                  e.currentTarget.closest('details')?.removeAttribute('open')
                }}
                className={`text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded truncate shrink-0 cursor-pointer ${
                  value === opt.value ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-medium' : ''
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </details>
  )
}

export function DepartmentSchedulesPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemesterPhase, setSelectedSemesterPhase] = useState<{ name: '1st Semester' | '2nd Semester'; phase: string }>({
    name: '1st Semester',
    phase: 'Drafting'
  })

  // Modals & Navigation state
  const [isSchoolYearModalOpen, setIsSchoolYearModalOpen] = useState(false)
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  
  // Schedules for the full schedule table modal
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [allCampusSchedules, setAllCampusSchedules] = useState<any[]>([])
  const [originalSchedulesSnapshot, setOriginalSchedulesSnapshot] = useState<string>('')
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false)
  const [isSubmittingSchedules, setIsSubmittingSchedules] = useState(false)
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<string[]>([])
  const [avatarErrors, setAvatarErrors] = useState<Record<string, boolean>>({})

  // DataTable filtering & search
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])

  // Tooltip
  const [customTooltip, setCustomTooltip] = useState<{
    visible: boolean
    targetX: number
    targetY: number
    targetBottomY: number
    lines: string[]
    type?: 'danger' | 'warning' | 'purple' | 'info' | 'dark'
  } | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number; arrowLeft: number; isBelow: boolean }>({
    left: 0,
    top: 0,
    arrowLeft: 50,
    isBelow: false
  })

  useLayoutEffect(() => {
    if (customTooltip?.visible && tooltipRef.current) {
      const el = tooltipRef.current
      const rect = el.getBoundingClientRect()
      const tooltipWidth = rect.width
      const halfWidth = tooltipWidth / 2
      const viewportWidth = window.innerWidth
      let left = customTooltip.targetX - halfWidth
      let arrowLeft = 50

      if (left < 16) {
        const offset = 16 - left
        left = 16
        arrowLeft = Math.max(10, Math.min(90, ((halfWidth - offset) / tooltipWidth) * 100))
      } else if (left + tooltipWidth > viewportWidth - 16) {
        const overflow = left + tooltipWidth - (viewportWidth - 16)
        left = left - overflow
        arrowLeft = Math.max(10, Math.min(90, ((halfWidth + overflow) / tooltipWidth) * 100))
      }

      const tooltipHeight = rect.height
      let top = customTooltip.targetY - tooltipHeight - 8
      let isBelow = false

      if (top < 16) {
        top = customTooltip.targetBottomY + 8
        isBelow = true
      }

      setTooltipPos({ left, top, arrowLeft, isBelow })
    }
  }, [customTooltip])

  const showCustomTooltip = (
    e: React.MouseEvent,
    text: string | string[],
    type: 'danger' | 'warning' | 'purple' | 'info' | 'dark' = 'dark'
  ) => {
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const lines = Array.isArray(text) ? text : [text]
    setCustomTooltip({
      visible: true,
      targetX: rect.left + rect.width / 2,
      targetY: rect.top,
      targetBottomY: rect.bottom,
      lines,
      type
    })
  }

  const hideCustomTooltip = () => {
    setCustomTooltip(null)
  }

  const handleDropdownPosition = (e: React.MouseEvent<HTMLElement>) => {
    const summary = e.currentTarget
    const rect = summary.getBoundingClientRect()
    const dropdown = summary.nextElementSibling?.nextElementSibling as HTMLElement
    if (dropdown) {
      if (window.innerHeight - rect.bottom < 240) {
        dropdown.style.top = 'auto'
        dropdown.style.bottom = '100%'
        dropdown.style.marginTop = '0'
        dropdown.style.marginBottom = '4px'
      } else {
        dropdown.style.top = '100%'
        dropdown.style.bottom = 'auto'
        dropdown.style.marginTop = '4px'
        dropdown.style.marginBottom = '0'
      }
    }
  }

  // 1. Fetch Academic Years
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'academicYears'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AcademicYearData[]
      fetched.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(fetched)

      if (fetched.length > 0 && !selectedAcademicYear) {
        const active = fetched.find(y => y.isActive) || fetched[0]
        setSelectedAcademicYear(active)
      }
    })
    return () => unsub()
  }, [])

  // 2. Fetch Departments, Buildings, Rooms
  useEffect(() => {
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Department[]
      fetched.sort((a, b) => a.name.localeCompare(b.name))
      setDepartments(fetched)
      if (fetched.length > 0 && !selectedDepartment) {
        setSelectedDepartment(fetched[0])
      }
    })

    const unsubBuildings = onSnapshot(collection(db, 'buildings'), (snap) => {
      setBuildings(snap.docs.map(d => ({ id: d.id, name: d.data().name, code: d.data().code || d.data().name || '' })))
    })

    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snap) => {
      setRooms(snap.docs.map(d => ({
        id: d.id,
        code: d.data().code,
        name: d.data().name,
        buildingId: d.data().buildingId || '',
        capacity: d.data().capacity,
        type: d.data().type,
        floor: d.data().floor
      })))
    })

    return () => {
      unsubDepts()
      unsubBuildings()
      unsubRooms()
    }
  }, [])

  // 3. Fetch Members for Selected Department
  useEffect(() => {
    if (!selectedDepartment?.code) {
      setMembers([])
      setLoadingMembers(false)
      return
    }

    setLoadingMembers(true)
    const qMemberships = query(
      collection(db, 'memberships'),
      where('departmentCode', '==', selectedDepartment.code)
    )

    const unsubUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersMap = new Map()
      usersSnap.forEach(u => usersMap.set(u.id, u.data()))

      onSnapshot(qMemberships, (mSnap) => {
        const fetched = mSnap.docs.map(doc => {
          const data = doc.data()
          const u = usersMap.get(data.userId) || {}
          return {
            id: data.userId,
            membershipId: doc.id,
            name: u.fullName || 'No Name',
            email: u.email || '',
            role: data.role || 'Instructor',
            status: u.isActive === false ? 'Inactive' : 'Active',
            department: data.departmentCode || '',
            avatar: u.profilePicture || '',
            joinedDate: data.joinedAt?.toDate
              ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(data.joinedAt.toDate())
              : 'N/A',
            joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate() : null
          } as Member
        })

        setMembers(fetched)
        setLoadingMembers(false)
      })
    })

    return () => unsubUsers()
  }, [selectedDepartment?.code])

  // 4. Fetch Schedules for Full Schedule Modal
  useEffect(() => {
    if (isAddScheduleModalOpen && selectedDepartment?.code && selectedAcademicYear?.academicYear && selectedSemesterPhase?.name) {
      setIsLoadingSchedules(true)
      const fetchSchedules = async () => {
        try {
          const q = query(
            collection(db, 'schedule'),
            where('department', '==', selectedDepartment.code),
            where('academicYear', '==', selectedAcademicYear.academicYear),
            where('semester', '==', selectedSemesterPhase.name)
          )
          const snap = await getDocs(q)
          if (!snap.empty) {
            const rawFetched = snap.docs.map(doc => {
              const data = doc.data()
              return {
                ...createDefaultSchedule(),
                ...data,
                id: data.id || (!data.parentId && data.groupId ? data.groupId : doc.id),
                docId: doc.id,
                orderIndex: data.orderIndex !== undefined ? data.orderIndex : 0,
                days: data.days || []
              } as ScheduleRow
            })

            const parentMap = new Map<string, any>()
            const children: any[] = []
            const allDocs = new Map(rawFetched.map(item => [item.id, item]))

            rawFetched.forEach(item => {
              const parentDoc = item.parentId ? allDocs.get(item.parentId) : null
              if (parentDoc && parentDoc.orderIndex === item.orderIndex) {
                children.push(item)
              } else {
                parentMap.set(item.id, item)
              }
            })

            children.forEach(child => {
              const parent = parentMap.get(child.parentId)
              if (parent) {
                parent.instructorId2 = parent.instructorId2 || (child.instructorId === parent.instructorId ? '' : child.instructorId)
                parent.format2 = parent.format2 || (child.format === parent.format ? '' : child.format)
                parent.startTime2 = parent.startTime2 || (child.startTime === parent.startTime ? '' : child.startTime)
                parent.endTime2 = parent.endTime2 || (child.endTime === parent.endTime ? '' : child.endTime)
                if (child.days && child.days.length > 0) {
                  const combinedDays = [...(parent.days || []), ...child.days]
                  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                  parent.days = Array.from(new Set(combinedDays)).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
                }
                parent.buildingId2 = parent.buildingId2 || (child.buildingId === parent.buildingId ? '' : child.buildingId)
                parent.roomId2 = parent.roomId2 || (child.roomId === parent.roomId ? '' : child.roomId)
                parent.childDocId = child.docId
              }
            })

            const fetched = Array.from(parentMap.values())
            fetched.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
            setSchedules(fetched)
            setOriginalSchedulesSnapshot(JSON.stringify(fetched))
          } else {
            setSchedules([])
            setOriginalSchedulesSnapshot(JSON.stringify([]))
          }
        } catch (err) {
          console.error('Error fetching schedules:', err)
          setSchedules([])
        } finally {
          setIsLoadingSchedules(false)
        }
      }
      fetchSchedules()
    }
  }, [isAddScheduleModalOpen, selectedDepartment?.code, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  // 5. Fetch all campus schedules for cross-department conflict validation
  useEffect(() => {
    if (!isAddScheduleModalOpen || !selectedAcademicYear?.academicYear || !selectedSemesterPhase?.name) {
      setAllCampusSchedules([])
      return
    }
    const q = query(
      collection(db, 'schedule'),
      where('academicYear', '==', selectedAcademicYear.academicYear),
      where('semester', '==', selectedSemesterPhase.name)
    )
    const unsub = onSnapshot(q, (snap) => {
      setAllCampusSchedules(snap.docs.map(doc => ({ docId: doc.id, ...doc.data() })))
    })
    return () => unsub()
  }, [isAddScheduleModalOpen, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  // Row change handler in modal table
  const handleScheduleChange = (index: number, field: keyof ScheduleRow, value: any) => {
    setSchedules(prev => {
      const next = [...prev]
      const current = { ...next[index], [field]: value }

      if (field === 'buildingId' && !value) current.roomId = ''
      if (field === 'buildingId2' && !value) current.roomId2 = ''

      if (current.type === 'parallel' && !current.parentId) {
        next.forEach((s, idx) => {
          if (s.parentId === current.id) {
            next[idx] = { ...next[idx], [field]: value }
          }
        })
      }

      next[index] = current
      return next
    })
  }

  // Conflict engine
  const timeRangesOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
    if (!startA || !endA || !startB || !endB) return false
    return startA < endB && startB < endA
  }

  const scheduleConflicts = useMemo(() => {
    interface ConflictInfo {
      hasRoomConflict1: boolean
      hasRoomConflict2: boolean
      hasInstructorConflict1: boolean
      hasInstructorConflict2: boolean
      hasSectionConflict: boolean
      roomConflictDetails1: string[]
      roomConflictDetails2: string[]
      instructorConflictDetails1: string[]
      instructorConflictDetails2: string[]
      sectionConflictDetails: string[]
    }

    const conflictsMap: Record<number, ConflictInfo> = {}
    schedules.forEach((_, idx) => {
      conflictsMap[idx] = {
        hasRoomConflict1: false,
        hasRoomConflict2: false,
        hasInstructorConflict1: false,
        hasInstructorConflict2: false,
        hasSectionConflict: false,
        roomConflictDetails1: [],
        roomConflictDetails2: [],
        instructorConflictDetails1: [],
        instructorConflictDetails2: [],
        sectionConflictDetails: []
      }
    })

    interface TableSession {
      rowId: string
      rowIndex: number
      sessionNum: 1 | 2
      parentId?: string
      docId?: string
      subjectCode: string
      classSection: string
      instructorId: string
      startTime: string
      endTime: string
      days: string[]
      roomId: string
    }

    const inTableSessions: TableSession[] = []

    schedules.forEach((schedule, index) => {
      const hasSecondDay = schedule.days && schedule.days.length === 2
      const hasExplicitSecondSession = !!schedule.startTime2 || !!schedule.endTime2 || !!schedule.format2 || !!schedule.instructorId2 || !!schedule.buildingId2 || !!schedule.roomId2
      const isSplit = hasSecondDay || hasExplicitSecondSession

      const days1 = hasSecondDay ? (schedule.days[0] ? [schedule.days[0]] : []) : (schedule.days || [])
      inTableSessions.push({
        rowId: schedule.id,
        rowIndex: index,
        sessionNum: 1,
        parentId: schedule.parentId,
        docId: schedule.docId,
        subjectCode: schedule.subjectCode || '',
        classSection: schedule.classSection || '',
        instructorId: schedule.instructorId || '',
        startTime: schedule.startTime || '',
        endTime: schedule.endTime || '',
        days: days1,
        roomId: schedule.roomId || ''
      })

      if (isSplit) {
        const days2 = hasSecondDay ? (schedule.days[1] ? [schedule.days[1]] : []) : (schedule.days || [])
        inTableSessions.push({
          rowId: schedule.id,
          rowIndex: index,
          sessionNum: 2,
          parentId: schedule.parentId,
          docId: schedule.childDocId,
          subjectCode: schedule.subjectCode || '',
          classSection: schedule.classSection || '',
          instructorId: schedule.instructorId2 || schedule.instructorId || '',
          startTime: schedule.startTime2 || schedule.startTime || '',
          endTime: schedule.endTime2 || schedule.endTime || '',
          days: days2,
          roomId: schedule.roomId2 || schedule.roomId || ''
        })
      }
    })

    const editingDocIds = new Set(schedules.flatMap(s => [s.docId, s.childDocId, s.id]).filter(Boolean))
    const externalSessions = allCampusSchedules
      .filter(d => !editingDocIds.has(d.docId) && !editingDocIds.has(d.id))
      .map(d => ({
        docId: d.docId || d.id,
        department: d.department || '',
        subjectCode: d.subjectCode || '',
        classSection: d.classSection || '',
        instructorId: d.instructorId || '',
        startTime: d.startTime || '',
        endTime: d.endTime || '',
        days: Array.isArray(d.days) ? d.days : [],
        roomId: d.roomId || ''
      }))

    const getRoomName = (rId: string) => rooms.find(r => r.id === rId)?.name || rooms.find(r => r.id === rId)?.code || 'Room'

    for (let i = 0; i < inTableSessions.length; i++) {
      const sessA = inTableSessions[i]
      if (sessA.days.length === 0 || !sessA.startTime || !sessA.endTime) continue

      for (let j = i + 1; j < inTableSessions.length; j++) {
        const sessB = inTableSessions[j]
        if (sessA.rowIndex === sessB.rowIndex) continue
        if (sessB.days.length === 0 || !sessB.startTime || !sessB.endTime) continue

        const commonDays = sessA.days.filter(d => sessB.days.includes(d))
        if (commonDays.length === 0) continue
        if (!timeRangesOverlap(sessA.startTime, sessA.endTime, sessB.startTime, sessB.endTime)) continue

        if (sessA.roomId && sessB.roomId && sessA.roomId === sessB.roomId) {
          const roomCode = getRoomName(sessA.roomId)
          const daysStr = commonDays.join(', ')
          const timeA = `${sessA.startTime}–${sessA.endTime}`
          const timeB = `${sessB.startTime}–${sessB.endTime}`
          const secStrA = sessA.classSection ? ` (Sec ${sessA.classSection})` : ''
          const secStrB = sessB.classSection ? ` (Sec ${sessB.classSection})` : ''
          const msgA = `Room ${roomCode} is also booked by Row #${sessB.rowIndex + 1}${secStrB} on ${daysStr} (${timeB})`
          const msgB = `Room ${roomCode} is also booked by Row #${sessA.rowIndex + 1}${secStrA} on ${daysStr} (${timeA})`

          if (sessA.sessionNum === 1) {
            conflictsMap[sessA.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails1.includes(msgA)) conflictsMap[sessA.rowIndex].roomConflictDetails1.push(msgA)
          } else {
            conflictsMap[sessA.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails2.includes(msgA)) conflictsMap[sessA.rowIndex].roomConflictDetails2.push(msgA)
          }

          if (sessB.sessionNum === 1) {
            conflictsMap[sessB.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessB.rowIndex].roomConflictDetails1.includes(msgB)) conflictsMap[sessB.rowIndex].roomConflictDetails1.push(msgB)
          } else {
            conflictsMap[sessB.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessB.rowIndex].roomConflictDetails2.includes(msgB)) conflictsMap[sessB.rowIndex].roomConflictDetails2.push(msgB)
          }
        }
      }

      for (const extSess of externalSessions) {
        if (extSess.days.length === 0 || !extSess.startTime || !extSess.endTime) continue
        const commonDays = sessA.days.filter(d => extSess.days.includes(d))
        if (commonDays.length === 0) continue
        if (!timeRangesOverlap(sessA.startTime, sessA.endTime, extSess.startTime, extSess.endTime)) continue

        if (sessA.roomId && extSess.roomId && sessA.roomId === extSess.roomId) {
          const roomCode = getRoomName(sessA.roomId)
          const daysStr = commonDays.join(', ')
          const timeStr = `${extSess.startTime}–${extSess.endTime}`
          const deptStr = extSess.department || 'Other Dept'
          const msg = `Room ${roomCode} is already booked by ${deptStr} on ${daysStr} (${timeStr})`

          if (sessA.sessionNum === 1) {
            conflictsMap[sessA.rowIndex].hasRoomConflict1 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails1.includes(msg)) conflictsMap[sessA.rowIndex].roomConflictDetails1.push(msg)
          } else {
            conflictsMap[sessA.rowIndex].hasRoomConflict2 = true
            if (!conflictsMap[sessA.rowIndex].roomConflictDetails2.includes(msg)) conflictsMap[sessA.rowIndex].roomConflictDetails2.push(msg)
          }
        }
      }
    }

    return { conflictsMap }
  }, [schedules, allCampusSchedules, rooms])

  // Save allocations in full modal
  const handleSaveModalAllocations = async () => {
    if (!selectedDepartment?.code || !selectedAcademicYear) return
    setIsSubmittingSchedules(true)

    try {
      const savePromises = schedules.map(async (schedule, index) => {
        const hasSecondDay = schedule.days && schedule.days.length === 2
        const hasExplicitSecondSession = !!schedule.startTime2 || !!schedule.endTime2 || !!schedule.format2 || !!schedule.instructorId2 || !!schedule.buildingId2 || !!schedule.roomId2
        const isSplit = hasSecondDay || hasExplicitSecondSession

        const data1 = {
          department: selectedDepartment.code,
          session: null,
          isSplitSession: isSplit,
          classSection: schedule.classSection || null,
          type: schedule.type || null,
          subjectCode: schedule.subjectCode || null,
          subjectTitle: schedule.subjectTitle || null,
          format: schedule.format || null,
          startTime: schedule.startTime || null,
          endTime: schedule.endTime || null,
          days: schedule.days.length > 0 ? (hasSecondDay ? [schedule.days[0]] : schedule.days) : null,
          buildingId: schedule.buildingId || null,
          roomId: schedule.roomId || null,
          instructorId: schedule.instructorId || null,
          format2: schedule.format2 || null,
          startTime2: schedule.startTime2 || null,
          endTime2: schedule.endTime2 || null,
          buildingId2: schedule.buildingId2 || null,
          roomId2: schedule.roomId2 || null,
          instructorId2: schedule.instructorId2 || null,
          groupId: schedule.groupId || schedule.id,
          parentId: schedule.parentId || null,
          orderIndex: index,
          academicYear: selectedAcademicYear.academicYear,
          semester: selectedSemesterPhase.name,
          status: schedule.roomId ? 'Plotted' : (schedule.status || 'Drafted'),
          updatedAt: serverTimestamp()
        }

        const promises = []
        const parentDocId = schedule.docId

        if (parentDocId) {
          promises.push(updateDoc(doc(db, 'schedule', parentDocId), { ...data1, id: schedule.id }))
        } else {
          promises.push(addDoc(collection(db, 'schedule'), { ...data1, id: schedule.id, createdAt: serverTimestamp() }))
        }

        if (isSplit) {
          const data2 = {
            department: selectedDepartment.code,
            session: null,
            isSplitSession: true,
            classSection: schedule.classSection || null,
            type: schedule.type || null,
            subjectCode: schedule.subjectCode || null,
            subjectTitle: schedule.subjectTitle || null,
            format: schedule.format2 || schedule.format || null,
            startTime: schedule.startTime2 || schedule.startTime || null,
            endTime: schedule.endTime2 || schedule.endTime || null,
            days: hasSecondDay ? [schedule.days[1]] : (schedule.days.length > 0 ? schedule.days : null),
            buildingId: schedule.buildingId2 || schedule.buildingId || null,
            roomId: schedule.roomId2 || schedule.roomId || null,
            instructorId: schedule.instructorId2 || schedule.instructorId || null,
            groupId: schedule.groupId || schedule.id,
            parentId: schedule.id,
            orderIndex: index,
            academicYear: selectedAcademicYear.academicYear,
            semester: selectedSemesterPhase.name,
            status: schedule.roomId2 ? 'Plotted' : (schedule.status || 'Drafted'),
            updatedAt: serverTimestamp()
          }

          const childDocId = schedule.childDocId
          if (childDocId) {
            promises.push(updateDoc(doc(db, 'schedule', childDocId), { ...data2, id: generateId() }))
          } else {
            promises.push(addDoc(collection(db, 'schedule'), { ...data2, id: generateId(), createdAt: serverTimestamp() }))
          }
        }

        return promises
      })

      await Promise.all(savePromises.flat())
      setIsAddScheduleModalOpen(false)
    } catch (err) {
      console.error('Error saving allocations:', err)
      alert('Failed to save room allocations.')
    } finally {
      setIsSubmittingSchedules(false)
    }
  }

  // Row click in DataTable opens instructor schedule
  const handleRowClick = (member: Member) => {
    setSelectedMember(member)
    setIsScheduleModalOpen(true)
  }

  // Filtered members for DataTable
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      if (selectedRoles.length > 0 && !selectedRoles.includes(member.role)) return false
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(member.status)) return false

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const match = [member.name, member.email, member.role, member.status].some(
          val => val?.toLowerCase().includes(term)
        )
        if (!match) return false
      }
      return true
    })
  }, [members, selectedRoles, selectedStatuses, searchTerm])

  // Member columns for DataTable
  const memberColumns: ColumnDef<Member>[] = useMemo(() => [
    {
      header: 'Member Info',
      width: '32%',
      render: (member) => (
        <div className="flex items-center gap-4">
          {member.avatar && !avatarErrors[member.avatar] ? (
            <img
              src={member.avatar}
              alt={member.name}
              className="h-10 w-10 rounded-full object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={() => setAvatarErrors(prev => ({ ...prev, [member.avatar!]: true }))}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300">
              <UserIcon className="h-5 w-5" />
            </div>
          )}
          <div className="flex flex-col">
            {member.name ? (
              <>
                <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                  {member.name}
                </span>
                <span className="text-xs font-medium text-slate-500">{member.email}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                {member.email}
              </span>
            )}
          </div>
        </div>
      )
    },
    {
      header: 'Role',
      width: '24%',
      render: (member) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest ${roleClasses[member.role] || 'bg-gray-100 text-gray-700'}`}>
          {member.role}
        </span>
      )
    },
    {
      header: 'Status',
      width: '22%',
      render: (member) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest ${statusClasses[member.status] || 'bg-gray-100 text-gray-700'}`}>
          {member.status}
        </span>
      )
    },
    {
      header: 'Joined Date',
      width: '22%',
      render: (member) => (
        <span className="text-sm font-semibold text-gray-600">
          {member.joinedDate}
        </span>
      )
    }
  ], [avatarErrors])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader 
          title="Department Schedules" 
          description="Overview of department members, schedules, and room allocations across colleges." 
        />

        {/* 3 Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            title="Card 1"
            subtitle="Subtitle 1"
            icon={<UserIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          />
          <SummaryCard
            title="Card 2"
            subtitle="Subtitle 2"
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          />
          <SummaryCard
            title="Card 3"
            subtitle="Subtitle 3"
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-400 to-indigo-500"
            blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
          />
        </div>

        {/* Department Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 ml-1">
            Department:
          </span>
          {departments.map(dept => {
            const isSelected = selectedDepartment?.code === dept.code
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDepartment(dept)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--brand-color)] text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {dept.code} • {dept.name}
              </button>
            )
          })}
        </div>

        {/* Members DataTable for Selected Department */}
        <div className="relative z-10">
          <DataTable<Member>
            data={filteredMembers}
            columns={memberColumns}
            onRowClick={handleRowClick}
            searchPlaceholder={`Search ${selectedDepartment?.code || ''} members...`}
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={
              <FilterDropdown
                groups={[
                  {
                    id: 'role',
                    title: 'Role',
                    options: ['Dean', 'Program Head', 'Instructor'],
                    selectedValues: selectedRoles,
                    onChange: setSelectedRoles
                  },
                  {
                    id: 'status',
                    title: 'Status',
                    options: ['Active', 'Inactive', 'Pending'],
                    selectedValues: selectedStatuses,
                    onChange: setSelectedStatuses
                  }
                ]}
                onClearAll={() => {
                  setSelectedRoles([])
                  setSelectedStatuses([])
                }}
              />
            }
            emptyTitle={loadingMembers ? "Loading members..." : `No members in ${selectedDepartment?.code || 'Department'}`}
            emptyDescription={loadingMembers ? "Retrieving department personnel records..." : "No members found matching your search filters."}
            primaryAction={
              <Button
                type="button"
                variant="brand"
                icon={<CalendarIcon className="h-5 w-5" />}
                onClick={() => {
                  const active = academicYears.find((y: any) => y.isActive) || academicYears[0]
                  if (active) setSelectedAcademicYear(active)
                  setIsSchoolYearModalOpen(true)
                }}
              >
                Manage Schedule
              </Button>
            }
          />
        </div>

        {/* School Year & Semester Selection Modal */}
        {isSchoolYearModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div
              className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
                <h3 className="text-xl font-bold">Select School Year & Semester</h3>
                <p className="mt-1 text-sm text-white/80">
                  Choose the academic term to review and plot schedules for {selectedDepartment?.code}.
                </p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    School Year <span className="text-rose-500">*</span>
                  </label>
                  <SingleSelectDropdown
                    value={selectedAcademicYear?.academicYear || ''}
                    options={[...academicYears].sort((a: any, b: any) => {
                      if (a.isActive && !b.isActive) return -1
                      if (!a.isActive && b.isActive) return 1
                      return (b.academicYear || '').localeCompare(a.academicYear || '')
                    }).map(y => y.academicYear)}
                    onChange={(val) => setSelectedAcademicYear(academicYears.find(y => y.academicYear === val) || null)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2.5">
                    Select Semester <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1st Semester Card */}
                    {(() => {
                      const sem1Phase = selectedAcademicYear?.sem1?.phase || 'Closed'
                      const sem1Start = selectedAcademicYear?.sem1?.startMonth
                      const sem1End = selectedAcademicYear?.sem1?.endMonth
                      const sem1Dates = sem1Start && sem1End ? `${formatShortMonth(sem1Start)} - ${formatShortMonth(sem1End)}` : ''

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSemesterPhase({ name: '1st Semester', phase: sem1Phase })
                            setIsSchoolYearModalOpen(false)
                            setIsAddScheduleModalOpen(true)
                          }}
                          disabled={!selectedAcademicYear}
                          className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-[var(--brand-color)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                                  <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                                    1st Semester
                                  </h4>
                                  {sem1Dates && (
                                    <p className="text-xs font-medium text-gray-500">{sem1Dates}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                                <ChevronRightIcon className="h-4 w-4" />
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem1Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {sem1Phase}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Plot Rooms
                            </span>
                          </div>
                        </button>
                      )
                    })()}

                    {/* 2nd Semester Card */}
                    {(() => {
                      const sem2Phase = selectedAcademicYear?.sem2?.phase || 'Closed'
                      const sem2Start = selectedAcademicYear?.sem2?.startMonth
                      const sem2End = selectedAcademicYear?.sem2?.endMonth
                      const sem2Dates = sem2Start && sem2End ? `${formatShortMonth(sem2Start)} - ${formatShortMonth(sem2End)}` : ''

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSemesterPhase({ name: '2nd Semester', phase: sem2Phase })
                            setIsSchoolYearModalOpen(false)
                            setIsAddScheduleModalOpen(true)
                          }}
                          disabled={!selectedAcademicYear}
                          className="group relative flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-[var(--brand-color)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-color)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand-color)]/10 text-[var(--brand-color)] group-hover:bg-[var(--brand-color)] group-hover:text-white transition-colors shrink-0">
                                  <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-[var(--brand-color)] transition-colors">
                                    2nd Semester
                                  </h4>
                                  {sem2Dates && (
                                    <p className="text-xs font-medium text-gray-500">{sem2Dates}</p>
                                  )}
                                </div>
                              </div>
                              <div className="text-gray-400 group-hover:text-[var(--brand-color)] group-hover:translate-x-0.5 transition-all mt-1 shrink-0">
                                <ChevronRightIcon className="h-4 w-4" />
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider border ${phaseClasses[sem2Phase] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {sem2Phase}
                            </span>
                            <span className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Plot Rooms
                            </span>
                          </div>
                        </button>
                      )
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setIsSchoolYearModalOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 -z-10" onMouseDown={() => setIsSchoolYearModalOpen(false)} />
          </div>
        )}

        {/* Full Department Schedule Modal */}
        {isAddScheduleModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div
              className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white rounded-t-2xl shrink-0 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white">
                    {selectedDepartment?.code} • {selectedAcademicYear?.academicYear} - {selectedSemesterPhase?.name} Schedules
                  </h3>
                  <p className="mt-0.5 text-xs text-white/80 font-medium">
                    Review and plot room allocations for this department timetable.
                  </p>
                </div>
                <IconButton
                  label="Close"
                  className="text-white hover:bg-white/10"
                  onClick={() => setIsAddScheduleModalOpen(false)}
                >
                  <CloseIcon className="h-5 w-5" />
                </IconButton>
              </div>

              {/* Table Container */}
              <div className="py-0 flex-1 overflow-auto flex flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
                <table className={`w-full text-left text-sm whitespace-nowrap min-w-max border-separate border-spacing-0 ${(isLoadingSchedules || schedules.length === 0) ? 'h-full flex-1' : ''}`}>
                  <thead className="bg-gray-50 sticky top-0 z-20 text-gray-700 font-bold text-base shadow-sm">
                    <tr>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-12 min-w-[3rem]">#</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[5.625rem]">Type</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[7.5rem]">Format</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[5.625rem]">Code</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[15rem]">Title</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[6.25rem]">Section</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[16.25rem] max-w-[16.25rem]">Instructor</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[15rem]">Time</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 w-[8.5rem]">Days</th>
                      <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 min-w-[8rem]">Building</th>
                      <th className="p-2 border-b-2 text-center border-gray-300 bg-gray-50 min-w-[11.25rem]">Room</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-gray-100 bg-white ${(isLoadingSchedules || schedules.length === 0) ? 'h-full' : ''}`}>
                    {isLoadingSchedules ? (
                      <tr className="h-full">
                        <td colSpan={11} className="p-0 border-none bg-white h-full align-middle">
                          <div className="sticky left-0 w-full h-full min-h-[30rem] flex flex-col items-center justify-center p-8 text-center">
                            <SpinnerIcon className="h-9 w-9 text-[var(--brand-color)] animate-spin" />
                            <p className="text-sm font-bold text-slate-700 mt-3">Loading Department Schedules...</p>
                          </div>
                        </td>
                      </tr>
                    ) : schedules.length === 0 ? (
                      <tr className="h-full">
                        <td colSpan={11} className="p-0 border-none bg-white h-full align-middle">
                          <div className="sticky left-0 w-full h-full min-h-[30rem] flex flex-col items-center justify-center p-8 text-center">
                            <CalendarIcon className="h-12 w-12 text-slate-300 mb-3" />
                            <h4 className="text-base font-extrabold text-slate-700 tracking-tight">
                              No Schedules Created Yet for {selectedDepartment?.code}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1 max-w-md">
                              There are no schedules drafted for {selectedAcademicYear?.academicYear} - {selectedSemesterPhase?.name}.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      schedules.map((schedule, index) => {
                        const conflict = scheduleConflicts.conflictsMap[index]
                        const isChild = !!schedule.parentId
                        const isParallelChild = isChild

                        const hasRoomConflict = !!(conflict?.hasRoomConflict1 || conflict?.hasRoomConflict2)
                        const rawHasInstructorConflict = !!(conflict?.hasInstructorConflict1 || conflict?.hasInstructorConflict2)
                        const hasInstructorConflict = isChild ? (rawHasInstructorConflict && hasRoomConflict) : rawHasInstructorConflict

                        const isParallelSameTime = !!schedule.startTime2 && schedule.startTime === schedule.startTime2 && !!schedule.instructorId2
                        const missingRoom1 = !!schedule.buildingId && !schedule.roomId
                        const isSecondSessionUnlocked = !!schedule.format2 || schedule.type === 'open lab'
                        const missingRoom2 = (!!schedule.buildingId2 && !schedule.roomId2) || (isParallelSameTime && schedule.days.length === 1 && !!schedule.buildingId && !schedule.roomId2)

                        let childAvailableRooms = rooms
                        if (schedule.buildingId) {
                          childAvailableRooms = rooms.filter(r => r.buildingId === schedule.buildingId)
                        }

                        if (isParallelChild) {
                          const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId)
                          const selectedRoomCodes = groupRows
                            .filter(s => s.id !== schedule.id && s.roomId)
                            .map(s => {
                              const r = rooms.find(room => room.id === s.roomId)
                              return r ? r.code : null
                            })
                            .filter(Boolean) as string[]

                          if (selectedRoomCodes.length > 0) {
                            const selectedNums = selectedRoomCodes.map(code => {
                              const match = code.match(/\d+/)
                              return match ? parseInt(match[0], 10) : null
                            }).filter(n => n !== null) as number[]

                            childAvailableRooms = childAvailableRooms.filter(room => {
                              if (selectedRoomCodes.includes(room.code)) return false
                              const roomNumMatch = room.code.match(/\d+/)
                              if (!roomNumMatch) return false
                              const roomNum = parseInt(roomNumMatch[0], 10)
                              const allNums = [...selectedNums, roomNum]
                              const min = Math.min(...allNums)
                              const max = Math.max(...allNums)
                              return max - min === allNums.length - 1
                            })
                          } else {
                            childAvailableRooms = []
                          }
                        }

                        const availableRooms = childAvailableRooms.sort((a, b) => (a.name || a.code || '').localeCompare(b.name || b.code || '', undefined, { numeric: true, sensitivity: 'base' }))

                        let childAvailableRooms2 = rooms
                        const bId2 = schedule.buildingId2 || schedule.buildingId
                        if (bId2) {
                          childAvailableRooms2 = rooms.filter(r => r.buildingId === bId2 && r.id !== schedule.roomId)
                        } else {
                          childAvailableRooms2 = []
                        }

                        if (isParallelChild) {
                          const groupRows = schedules.filter(s => s.id === schedule.parentId || s.parentId === schedule.parentId)
                          const selectedRoomCodes2 = groupRows
                            .filter(s => s.id !== schedule.id && s.roomId2)
                            .map(s => {
                              const r = rooms.find(room => room.id === s.roomId2)
                              return r ? r.code : null
                            })
                            .filter(Boolean) as string[]

                          if (selectedRoomCodes2.length > 0) {
                            const selectedNums2 = selectedRoomCodes2.map(code => {
                              const match = code.match(/\d+/)
                              return match ? parseInt(match[0], 10) : null
                            }).filter(n => n !== null) as number[]

                            childAvailableRooms2 = childAvailableRooms2.filter(room => {
                              if (selectedRoomCodes2.includes(room.code)) return false
                              const roomNumMatch = room.code.match(/\d+/)
                              if (!roomNumMatch) return false
                              const roomNum = parseInt(roomNumMatch[0], 10)
                              const allNums = [...selectedNums2, roomNum]
                              const min = Math.min(...allNums)
                              const max = Math.max(...allNums)
                              return max - min === allNums.length - 1
                            })
                          } else {
                            childAvailableRooms2 = []
                          }
                        }

                        const availableRooms2 = childAvailableRooms2.sort((a, b) => (a.name || a.code || '').localeCompare(b.name || b.code || '', undefined, { numeric: true, sensitivity: 'base' }))

                        return (
                          <tr key={index} onMouseDownCapture={hideCustomTooltip} className="hover:bg-gray-50">
                            {/* 1. # */}
                            <td className={`p-2 border-b border-r border-gray-300 text-center text-xs font-semibold text-gray-500 align-middle ${isChild ? 'bg-gray-50/50' : ''}`}>
                              {index + 1}
                            </td>

                            {/* 2. Type */}
                            <td className={`p-2 border-b border-r border-gray-300 text-center text-sm font-medium text-gray-900 align-middle ${isChild ? 'bg-gray-50/50' : ''}`}>
                              {isChild ? '----' : (schedule.type ? schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1) : 'Normal')}
                            </td>

                            {/* 3. Format */}
                            <td className={`p-2 border-b border-r border-gray-300 text-center text-sm font-medium text-gray-900 align-middle ${isChild ? 'bg-gray-50/50' : ''}`}>
                              {isChild ? (
                                !schedule.format ? '----' : (
                                  schedule.format === schedule.format2 ? (
                                    <>{schedule.format}<sup>2</sup></>
                                  ) : (
                                    <>{schedule.format} / {schedule.format2 || '----'}</>
                                  )
                                )
                              ) : schedule.type === 'open lab' ? (
                                'Flexible'
                              ) : (
                                !schedule.format ? '----' : (
                                  schedule.format === schedule.format2 ? (
                                    <>{schedule.format}<sup>2</sup></>
                                  ) : (
                                    <>{schedule.format} / {schedule.format2 || '----'}</>
                                  )
                                )
                              )}
                            </td>

                            {/* 4. Code */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm font-bold text-gray-900 align-middle">
                              {schedule.subjectCode || 'TBA'}
                            </td>

                            {/* 5. Title */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm text-gray-700 align-middle truncate max-w-[15rem]" title={schedule.subjectTitle}>
                              {schedule.subjectTitle || 'No Title'}
                            </td>

                            {/* 6. Section */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm font-bold text-gray-900 uppercase text-center align-middle">
                              {schedule.classSection || 'TBA'}
                            </td>

                            {/* 7. Instructor */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm text-gray-800 align-middle">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium truncate">
                                  {members.find(m => m.membershipId === schedule.instructorId || m.id === schedule.instructorId)?.name || 'TBA'}
                                </span>
                                {schedule.instructorId2 && (
                                  <span className="text-gray-400 font-normal truncate">
                                    {' / '}{members.find(m => m.membershipId === schedule.instructorId2 || m.id === schedule.instructorId2)?.name || '?'}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 8. Time */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm text-gray-800 align-middle">
                              {schedule.startTime && schedule.endTime ? (
                                <span>
                                  {schedule.startTime} - {schedule.endTime}
                                  {schedule.startTime2 && schedule.endTime2 && (
                                    <span className="text-gray-500"> / {schedule.startTime2} - {schedule.endTime2}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">TBA</span>
                              )}
                            </td>

                            {/* 9. Days */}
                            <td className="p-2 border-b border-r border-gray-300 text-sm text-gray-800 text-center align-middle">
                              {schedule.days && schedule.days.length > 0 ? (
                                <span className="font-semibold text-gray-900">
                                  {schedule.days.join(' / ')}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">TBA</span>
                              )}
                            </td>

                            {/* 10. Building (Editable Dropdown) */}
                            <td
                              className={`p-0 relative align-middle ${
                                hasRoomConflict
                                  ? 'bg-rose-50 focus-within:!bg-[#e3edda] border-b border-rose-400 border-r border-rose-200 shadow-[inset_0_1px_0_0_#fb7185]'
                                  : (!isChild && !schedule.buildingId)
                                  ? 'bg-amber-50 focus-within:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]'
                                  : 'border-b border-r border-gray-300 focus-within:bg-[#e3edda]'
                              }`}
                              onMouseEnter={(e) => {
                                const details = [...(conflict?.roomConflictDetails1 || []), ...(conflict?.roomConflictDetails2 || [])]
                                if (details.length > 0) {
                                  showCustomTooltip(e, details, 'danger')
                                } else if (!isChild && !schedule.buildingId) {
                                  showCustomTooltip(e, 'Missing Building', 'warning')
                                }
                              }}
                              onMouseLeave={hideCustomTooltip}
                            >
                              <details className="w-full relative h-full group">
                                <summary
                                  onClick={handleDropdownPosition}
                                  className={`h-full min-h-[2.75rem] cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between transition-colors bg-transparent ${
                                    (schedule.buildingId || schedule.buildingId2) ? 'text-gray-900 font-medium' : 'text-gray-500'
                                  }`}
                                >
                                  <span className="truncate">
                                    {resolveBuildingCode(buildings.find(b => b.id === schedule.buildingId), rooms) || (
                                      <span className="text-amber-500 font-bold inline-block">?</span>
                                    )}
                                    {schedule.buildingId2 && (
                                      <>
                                        {' / '}
                                        <span>
                                          {resolveBuildingCode(buildings.find(b => b.id === schedule.buildingId2), rooms) || '?'}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                </summary>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}
                                />
                                <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full">
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">1st Session</label>
                                    <InnerDropdown
                                      value={schedule.buildingId || ''}
                                      onChange={(val) => {
                                        handleScheduleChange(index, 'buildingId', val)
                                        handleScheduleChange(index, 'roomId', '')
                                        if (!val) {
                                          handleScheduleChange(index, 'buildingId2', '')
                                          handleScheduleChange(index, 'roomId2', '')
                                        }
                                      }}
                                      options={buildings.map(b => ({
                                        value: b.id,
                                        label: resolveBuildingCode(b, rooms) || ''
                                      }))}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">2nd Session</label>
                                    <InnerDropdown
                                      value={schedule.buildingId2 || ''}
                                      disabled={!isSecondSessionUnlocked || !schedule.buildingId}
                                      onChange={(val) => {
                                        handleScheduleChange(index, 'buildingId2', val)
                                        handleScheduleChange(index, 'roomId2', '')
                                      }}
                                      options={buildings.filter(b => b.id !== schedule.buildingId).map(b => ({
                                        value: b.id,
                                        label: resolveBuildingCode(b, rooms) || ''
                                      }))}
                                    />
                                  </div>
                                </div>
                              </details>
                            </td>

                            {/* 11. Room (Editable Dropdown) */}
                            <td
                              className={`p-0 relative align-middle ${
                                hasRoomConflict
                                  ? 'bg-rose-50 focus-within:!bg-[#e3edda] border-b border-rose-400 border-r border-rose-400 shadow-[inset_0_1px_0_0_#fb7185]'
                                  : (!isChild && (!schedule.roomId || missingRoom2))
                                  ? 'bg-amber-50 focus-within:!bg-[#e3edda] border-b border-amber-400 border-r border-amber-400 shadow-[inset_1px_1px_0_0_#fbbf24]'
                                  : 'border-b border-gray-300 focus-within:bg-[#e3edda]'
                              }`}
                              onMouseEnter={(e) => {
                                const details = [...(conflict?.roomConflictDetails1 || []), ...(conflict?.roomConflictDetails2 || [])]
                                if (details.length > 0) {
                                  showCustomTooltip(e, details, 'danger')
                                } else if (!schedule.roomId) {
                                  showCustomTooltip(e, 'Missing Room', 'warning')
                                } else if (missingRoom2) {
                                  showCustomTooltip(e, 'Missing 2nd Session Room', 'warning')
                                }
                              }}
                              onMouseLeave={hideCustomTooltip}
                            >
                              <details
                                className="w-full relative h-full group"
                                onClick={(e) => {
                                  if (!schedule.buildingId || (isChild && availableRooms.length === 0)) e.preventDefault()
                                }}
                              >
                                <summary
                                  onClick={handleDropdownPosition}
                                  className={`h-full min-h-[2.75rem] list-none [&::-webkit-details-marker]:hidden px-3 py-3 text-sm focus:outline-none focus:ring-0 flex items-center justify-between gap-1.5 transition-colors bg-transparent ${
                                    (!schedule.buildingId || (isChild && availableRooms.length === 0))
                                      ? 'cursor-default text-gray-400'
                                      : 'cursor-pointer ' + ((schedule.roomId || schedule.roomId2) ? 'text-gray-900 font-medium' : 'text-gray-500')
                                  }`}
                                >
                                  <span className="truncate leading-none">
                                    {rooms.find(r => r.id === schedule.roomId)?.name || rooms.find(r => r.id === schedule.roomId)?.code || (
                                      <span className="text-amber-500 font-bold inline-block leading-none">?</span>
                                    )}
                                    {schedule.roomId2 && (
                                      <>
                                        <span className="shrink-0 whitespace-pre leading-none">{' / '}</span>
                                        <span className="leading-none">
                                          {rooms.find(r => r.id === schedule.roomId2)?.name || rooms.find(r => r.id === schedule.roomId2)?.code || '?'}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                  {(conflict?.hasRoomConflict1 || conflict?.hasRoomConflict2) && (
                                    <ExclamationIcon className="h-4 w-4 text-rose-500 shrink-0 ml-auto" />
                                  )}
                                </summary>
                                {schedule.buildingId && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-40"
                                      onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open') }}
                                    />
                                    <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-300 shadow-xl p-3 flex flex-col gap-3 rounded w-full">
                                      <div className="flex flex-col gap-1.5">
                                        <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingRoom1 ? 'text-amber-600' : 'text-gray-500'}`}>
                                          1st Session Room
                                        </label>
                                        <InnerDropdown
                                          value={schedule.roomId || ''}
                                          onChange={(val) => {
                                            handleScheduleChange(index, 'roomId', val)
                                            if (!val) handleScheduleChange(index, 'roomId2', '')
                                          }}
                                          options={availableRooms.map(room => ({ value: room.id, label: `${room.name || room.code} (${room.type || 'Room'} • ${room.capacity || 0} pax)` }))}
                                        />
                                      </div>
                                      <div className="flex flex-col gap-1.5">
                                        <label className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${missingRoom2 ? 'text-amber-600' : 'text-gray-500'}`}>
                                          2nd Session Room
                                        </label>
                                        <InnerDropdown
                                          value={schedule.roomId2 || ''}
                                          disabled={!isSecondSessionUnlocked || !schedule.roomId}
                                          onChange={(val) => handleScheduleChange(index, 'roomId2', val)}
                                          options={availableRooms2.map(room => ({ value: room.id, label: `${room.name || room.code} (${room.type || 'Room'} • ${room.capacity || 0} pax)` }))}
                                        />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </details>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 shrink-0 rounded-b-2xl">
                <Button
                  variant="outline"
                  onClick={() => setIsAddScheduleModalOpen(false)}
                >
                  Close
                </Button>

                <Button
                  variant="brand"
                  onClick={handleSaveModalAllocations}
                  disabled={isSubmittingSchedules || schedules.length === 0}
                >
                  {isSubmittingSchedules ? 'Saving Allocations...' : 'Save Room Allocations'}
                </Button>
              </div>
            </div>
            <div className="absolute inset-0 -z-10" onMouseDown={() => setIsAddScheduleModalOpen(false)} />
          </div>
        )}

        {/* Instructor Schedule Modal (Opened when clicking a member in DataTable) */}
        <ScheduleModal
          isOpen={isScheduleModalOpen}
          member={selectedMember}
          initialAcademicYear={selectedAcademicYear?.academicYear}
          initialSemester={selectedSemesterPhase?.name}
          onClose={() => {
            setIsScheduleModalOpen(false)
            setSelectedMember(null)
          }}
        />

        {/* Floating Tooltip */}
        {customTooltip && customTooltip.visible && (
          <div
            ref={tooltipRef}
            style={{
              position: 'fixed',
              left: `${tooltipPos.left}px`,
              top: `${tooltipPos.top}px`,
              zIndex: 9999,
              pointerEvents: 'none'
            }}
            className={`px-3 py-2 rounded-xl shadow-2xl text-xs font-bold transition-opacity duration-150 max-w-sm ${
              customTooltip.type === 'danger'
                ? 'bg-rose-900/95 text-rose-100 border border-rose-700 backdrop-blur-md'
                : customTooltip.type === 'warning'
                ? 'bg-amber-900/95 text-amber-100 border border-amber-700 backdrop-blur-md'
                : customTooltip.type === 'purple'
                ? 'bg-purple-900/95 text-purple-100 border border-purple-700 backdrop-blur-md'
                : 'bg-slate-900/95 text-white border border-slate-700 backdrop-blur-md'
            }`}
          >
            <div className="flex flex-col gap-1">
              {customTooltip.lines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="opacity-75">•</span>
                  <span className="leading-snug">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default DepartmentSchedulesPage
