import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'
import { SearchFilters } from '../../components/SearchFilters'
import { FilterDropdown } from '../../components/FilterDropdown'
import { db, storage } from '../../firebase'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  writeBatch,
  serverTimestamp, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore'
import { CropModal } from '../../components/CropModal'

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

function createRoomImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="28" fill="#f3f4f6" />
      <g transform="translate(225, 88) scale(8)" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M6 20V5.8c0-.64.43-1.2 1.04-1.36l7-1.84a1.4 1.4 0 0 1 1.76 1.35V20" />
        <path d="M6 20h11.5" />
        <path d="M11.95 12.15h.1" />
        <path d="M15.8 20V4.1" />
      </g>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const DEFAULT_ROOM_IMAGE = createRoomImage()

interface Room {
  id: string
  image: string
  code: string
  name: string
  type: string
  floor: number
  capacity: number
  status: RoomStatus
  description: string
  amenities: string[]
  availableDays: string[]
  startTime: string
  endTime: string
  minBookingMins: number
  maxBookingMins: number
}

interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100/90 text-emerald-800 border border-emerald-200/80',
  Occupied: 'bg-amber-100/90 text-amber-800 border border-amber-200/80',
  Reserved: 'bg-sky-100/90 text-sky-800 border border-sky-200/80',
  Maintenance: 'bg-rose-100/90 text-rose-800 border border-rose-200/80',
}

const roomStatusDots: Record<RoomStatus, string> = {
  Available: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse',
  Occupied: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
  Reserved: 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.7)]',
  Maintenance: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ROOM_AMENITIES = [
  'WiFi', 'Computer', 'Television', 'Projector', 'Whiteboard', 
  'Air Conditioning', 'Sound System', 'Printer', 'Webcam', 
  'Microphone', 'Ethernet', 'Speakers', 'HDMI Cable', 
  'Charging Station', 'Coffee Machine', 'Water Dispenser',
  'Digital Signage', 'Video Conferencing'
]

const shortAmenities = ROOM_AMENITIES.filter(a => a.length <= 10)
const longAmenities = ROOM_AMENITIES.filter(a => a.length > 10)

const shortGroups: string[][] = []
for (let i = 0; i < shortAmenities.length; i += 3) {
  shortGroups.push(shortAmenities.slice(i, i + 3))
}

const longGroups: string[][] = []
for (let i = 0; i < longAmenities.length; i += 2) {
  longGroups.push(longAmenities.slice(i, i + 2))
}

const ROOM_AMENITIES_GROUPS: string[][] = []
const maxGroups = Math.max(shortGroups.length, longGroups.length)

for (let i = 0; i < maxGroups; i++) {
  if (i < shortGroups.length) ROOM_AMENITIES_GROUPS.push(shortGroups[i])
  if (i < longGroups.length) ROOM_AMENITIES_GROUPS.push(longGroups[i])
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
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-xl border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-[2.875rem] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 outline-none transition-all duration-200 hover:border-slate-300 hover:shadow-sm focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
      >
        <span className="whitespace-nowrap">{value || 'None'}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[var(--brand-color)]' : ''}`} />
      </button>

      {isOpen && !isDisabled && (
        <div 
          className="absolute left-0 z-50 mt-2 min-w-full overflow-y-scroll custom-scrollbar rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150"
          style={{ height: options.length > 4 ? '203px' : 'auto' }}
        >
          <div className="space-y-1">
            {options.map((option) => {
              const isSelected = value === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                  }`}
                >
                  <span className="whitespace-nowrap">{option || 'None'}</span>
                  {isSelected && <CheckIcon className="ml-auto h-4 w-4 text-[var(--brand-color)] shrink-0" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function BuildingsRoomsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRoomStatuses, setSelectedRoomStatuses] = useState<RoomStatus[]>([])
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([])
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('rorms_buildings_expanded')
    return saved ? JSON.parse(saved) : []
  })
  const isInitialLoad = useRef(true)
  const knownBuildingIds = useRef<Set<string>>(new Set())

  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    localStorage.setItem('rorms_buildings_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

  useEffect(() => {
    const buildingsQuery = query(collection(db, 'buildings'), orderBy('createdAt', 'desc'))
    const roomsQuery = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'))

    let buildingsList: any[] = []
    let roomsList: any[] = []

    const updateState = () => {
      const mergedBuildings = buildingsList.map(building => {
        const buildingRooms = roomsList.filter(room => room.buildingId === building.id)
        const capacity = buildingRooms.reduce((sum, room) => sum + (room.capacity || 0), 0)
        const floor = buildingRooms.length > 0 
          ? Math.max(...buildingRooms.map(room => room.floor || 0)) 
          : 0

        return {
          ...building,
          rooms: buildingRooms,
          floor,
          capacity,
        }
      }) as Building[]
      
      setBuildings(mergedBuildings)
      setRooms(roomsList)

      const currentIds = mergedBuildings.map(b => b.id)

      // Auto-expand ONLY for buildings added after the initial data fetch
      if (!isInitialLoad.current) {
        const newIds = currentIds.filter(id => !knownBuildingIds.current.has(id))
        if (newIds.length > 0) {
          setExpandedBuildingIds(prev => [...prev, ...newIds])
        }
      } else if (mergedBuildings.length > 0) {
        isInitialLoad.current = false
      }

      // Update known IDs for next time
      knownBuildingIds.current = new Set(currentIds)
    }

    const unsubscribeBuildings = onSnapshot(buildingsQuery, (snapshot) => {
      buildingsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateState()
    })

    const unsubscribeRooms = onSnapshot(roomsQuery, (snapshot) => {
      roomsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      updateState()
    })

    return () => {
      unsubscribeBuildings()
      unsubscribeRooms()
    }
  }, [])

  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newBuildingCode, setNewBuildingCode] = useState('')

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false)
  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
  const [isMultipleRooms, setIsMultipleRooms] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [roomModalStep, setRoomModalStep] = useState(1)
  
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomCode, setNewRoomCode] = useState('')
  const [roomNamePrefix, setRoomNamePrefix] = useState('')
  const [roomCodePrefix, setRoomCodePrefix] = useState('')
  const [roomStartNumber, setRoomStartNumber] = useState('')
  const [roomEndNumber, setRoomEndNumber] = useState('')
  const [newRoomType, setNewRoomType] = useState('Lecture Room')
  const [newRoomFloor, setNewRoomFloor] = useState<string>('1')
  const [newRoomCapacity, setNewRoomCapacity] = useState<string>('50')
  const [newRoomStatus, setNewRoomStatus] = useState<RoomStatus>('Available')
  const [newRoomImage, setNewRoomImage] = useState(DEFAULT_ROOM_IMAGE)
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [newRoomAmenities, setNewRoomAmenities] = useState<string[]>([])
  const [newRoomAvailableDays, setNewRoomAvailableDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [newRoomStartTime, setNewRoomStartTime] = useState('07:30')
  const [newRoomEndTime, setNewRoomEndTime] = useState('18:00')
  const [newRoomMinBookingMins, setNewRoomMinBookingMins] = useState('30')
  const [newRoomMaxBookingMins, setNewRoomMaxBookingMins] = useState('90')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cropModalData, setCropModalData] = useState<{ isOpen: boolean, imageSrc: string }>({
    isOpen: false,
    imageSrc: ''
  })
  const [isDraggingRoomImage, setIsDraggingRoomImage] = useState(false)
  const [pendingRoomImageBlob, setPendingRoomImageBlob] = useState<Blob | null>(null)
  const [errors, setErrors] = useState({ name: false, code: false, start: false, end: false })
  const [activeDropdowns, setActiveDropdowns] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteRoomModalOpen, setIsDeleteRoomModalOpen] = useState(false)
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null)
  const [isDeletingRoom, setIsDeletingRoom] = useState(false)

  const [isDeleteBuildingModalOpen, setIsDeleteBuildingModalOpen] = useState(false)
  const [buildingToDelete, setBuildingToDelete] = useState<Building | null>(null)
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false)
  const [confirmBuildingName, setConfirmBuildingName] = useState('')

  const handleDropdownToggle = useCallback((isOpen: boolean) => {
    setActiveDropdowns(prev => isOpen ? prev + 1 : Math.max(0, prev - 1))
  }, [])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(false)
  }

  const handleRoomImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRoomImage(false)
    
    // Check for files
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCropModalData({ isOpen: true, imageSrc: reader.result })
        }
      }
      reader.readAsDataURL(file)
      return
    }

    // Check for dragged URL (e.g. from Google Images)
    const imageUrl = e.dataTransfer.getData('text/uri-list') || 
                   e.dataTransfer.getData('text/plain') ||
                   e.dataTransfer.getData('url')
    
    if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
      setCropModalData({ isOpen: true, imageSrc: imageUrl })
    }
  }

  const handleCropComplete = async (croppedImage: Blob) => {
    setPendingRoomImageBlob(croppedImage)
    const blobUrl = URL.createObjectURL(croppedImage)
    setNewRoomImage(blobUrl)
    setCropModalData({ isOpen: false, imageSrc: '' })
  }

  const toggleBuilding = (id: string) => {
    setExpandedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleOpenBuildingModal = (building?: Building) => {
    if (building) {
      setEditingBuilding(building)
      setNewBuildingName(building.name)
      setNewBuildingCode(building.code)
    } else {
      setEditingBuilding(null)
      setNewBuildingName('')
      setNewBuildingCode('')
    }
    setErrors({ name: false, code: false, start: false, end: false })
    setIsBuildingModalOpen(true)
  }

  const handleOpenRoomModal = (buildingId: string, room?: Room) => {
    setActiveBuildingId(buildingId)
    setRoomModalStep(1)
    if (room) {
      setEditingRoom(room)
      setIsMultipleRooms(false)
      setNewRoomName(room.name)
      setNewRoomCode(room.code)
      setNewRoomType(room.type)
      setNewRoomFloor(String(room.floor))
      setNewRoomCapacity(String(room.capacity))
      setNewRoomStatus(room.status)
      setNewRoomImage(room.image)
      setNewRoomDescription(room.description || '')
      setNewRoomAmenities(room.amenities || [])
      setNewRoomAvailableDays(room.availableDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      setNewRoomStartTime(room.startTime || '07:30')
      setNewRoomEndTime(room.endTime || '18:00')
      setNewRoomMinBookingMins(String(room.minBookingMins || '30'))
      setNewRoomMaxBookingMins(String(room.maxBookingMins || '90'))
    } else {
      setEditingRoom(null)
      setIsMultipleRooms(false)
      setNewRoomName('')
      setNewRoomCode('')
      setRoomNamePrefix('')
      setRoomCodePrefix('')
      setRoomStartNumber('')
      setRoomEndNumber('')
      setNewRoomType('Lecture Room')
      setNewRoomFloor('1')
      setNewRoomCapacity('50')
      setNewRoomStatus('Available')
      setNewRoomImage(DEFAULT_ROOM_IMAGE)
      setNewRoomDescription('')
      setNewRoomAmenities([])
      setNewRoomAvailableDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
      setNewRoomStartTime('07:30')
      setNewRoomEndTime('18:00')
      setNewRoomMinBookingMins('30')
      setNewRoomMaxBookingMins('90')
    }
    setErrors({ name: false, code: false, start: false, end: false })
    setIsRoomModalOpen(true)
  }

  const handleCloseModals = () => {
    setIsBuildingModalOpen(false)
    setIsRoomModalOpen(false)
    setIsRoomInfoModalOpen(false)
    setEditingBuilding(null)
    setEditingRoom(null)
    setSelectedRoomInfo(null)
    setActiveBuildingId(null)
    setRoomModalStep(1)
    setPendingRoomImageBlob(null)
    setErrors({ name: false, code: false, start: false, end: false })
  }

  const handleOpenDeleteRoom = (room: Room) => {
    setRoomToDelete(room)
    setIsDeleteRoomModalOpen(true)
  }

  const handleCloseDeleteRoomModal = () => {
    setIsDeleteRoomModalOpen(false)
    setRoomToDelete(null)
  }

  const deleteImageFromStorage = async (imageUrl: string) => {
    if (!imageUrl || !imageUrl.includes('firebasestorage.googleapis.com')) return
    try {
      const imageRef = ref(storage, imageUrl)
      await deleteObject(imageRef)
    } catch (error) {
      console.error("Error deleting image from storage:", error)
    }
  }

  const handleDeleteRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomToDelete) return

    setIsDeletingRoom(true)
    try {
      // Delete image from storage first
      await deleteImageFromStorage(roomToDelete.image)
      
      await deleteDoc(doc(db, 'rooms', roomToDelete.id))
      handleCloseDeleteRoomModal()
    } catch (error) {
      console.error('Error deleting room:', error)
      alert('Failed to delete room. Please try again.')
    } finally {
      setIsDeletingRoom(false)
    }
  }

  const handleOpenDeleteBuilding = (building: Building) => {
    setBuildingToDelete(building)
    setConfirmBuildingName('')
    setIsDeleteBuildingModalOpen(true)
  }

  const handleCloseDeleteBuildingModal = () => {
    setIsDeleteBuildingModalOpen(false)
    setBuildingToDelete(null)
    setConfirmBuildingName('')
  }

  const handleDeleteBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buildingToDelete) return

    setIsDeletingBuilding(true)
    try {
      // Delete all room images from storage
      await Promise.all(buildingToDelete.rooms.map(room => deleteImageFromStorage(room.image)))

      const batch = writeBatch(db)
      
      // Delete all rooms associated with the building
      buildingToDelete.rooms.forEach(room => {
        batch.delete(doc(db, 'rooms', room.id))
      })
      
      // Delete the building itself
      batch.delete(doc(db, 'buildings', buildingToDelete.id))
      
      await batch.commit()
      handleCloseDeleteBuildingModal()
    } catch (error) {
      console.error('Error deleting building:', error)
      alert('Failed to delete building. Please try again.')
    } finally {
      setIsDeletingBuilding(false)
    }
  }

  const handleBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuildingName.trim() || !newBuildingCode.trim()) {
      setErrors({ name: !newBuildingName.trim(), code: !newBuildingCode.trim(), start: false, end: false })
      return
    }

    // Check for uniqueness
    const normalizedName = newBuildingName.trim().toLowerCase()
    const normalizedCode = newBuildingCode.trim().toLowerCase()

    const isDuplicateName = buildings.some(b => 
      b.name.trim().toLowerCase() === normalizedName && 
      (!editingBuilding || b.id !== editingBuilding.id)
    )
    const isDuplicateCode = buildings.some(b => 
      b.code.trim().toLowerCase() === normalizedCode && 
      (!editingBuilding || b.id !== editingBuilding.id)
    )

    if (isDuplicateName || isDuplicateCode) {
      setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
      return
    }

    setIsSubmitting(true)
    try {
      if (editingBuilding) {
        const buildingRef = doc(db, 'buildings', editingBuilding.id)
        await updateDoc(buildingRef, {
          name: newBuildingName,
          code: newBuildingCode,
          updatedAt: serverTimestamp()
        })
        handleCloseModals()
      } else {
        const docRef = await addDoc(collection(db, 'buildings'), {
          name: newBuildingName,
          code: newBuildingCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        
        // Close building modal first
        setIsBuildingModalOpen(false)
        setEditingBuilding(null)
        
        // Automatically open room modal for the new building
        handleOpenRoomModal(docRef.id)
      }
    } catch (error) {
      console.error("Error saving building: ", error)
      alert("Error saving building. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (roomModalStep === 1) {
      if (isMultipleRooms) {
        if (!roomNamePrefix.trim() || !roomCodePrefix.trim() || !roomStartNumber.trim() || !roomEndNumber.trim()) {
          setErrors({ 
            name: !roomNamePrefix.trim(), 
            code: !roomCodePrefix.trim(),
            start: !roomStartNumber.trim(),
            end: !roomEndNumber.trim()
          })
          return
        }

        // Check for uniqueness in range
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          const targetName = `${roomNamePrefix}${currentNum}`.trim().toLowerCase()
          const targetCode = `${roomCodePrefix}${currentNum}`.trim().toLowerCase()

          const isDuplicateName = rooms.some(r => 
            r.name.trim().toLowerCase() === targetName && 
            (!editingRoom || r.id !== editingRoom.id)
          )
          const isDuplicateCode = rooms.some(r => 
            r.code.trim().toLowerCase() === targetCode && 
            (!editingRoom || r.id !== editingRoom.id)
          )

          if (isDuplicateName || isDuplicateCode) {
            setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
            return
          }
        }
      } else {
        if (!newRoomName.trim() || !newRoomCode.trim()) {
          setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim(), start: false, end: false })
          return
        }

        // Check for uniqueness
        const normalizedName = newRoomName.trim().toLowerCase()
        const normalizedCode = newRoomCode.trim().toLowerCase()

        const isDuplicateName = rooms.some(r => 
          r.name.trim().toLowerCase() === normalizedName && 
          (!editingRoom || r.id !== editingRoom.id)
        )
        const isDuplicateCode = rooms.some(r => 
          r.code.trim().toLowerCase() === normalizedCode && 
          (!editingRoom || r.id !== editingRoom.id)
        )

        if (isDuplicateName || isDuplicateCode) {
          setErrors({ name: isDuplicateName, code: isDuplicateCode, start: false, end: false })
          return
        }
      }
    }

    if (roomModalStep < 3) {
      setRoomModalStep(prev => prev + 1)
      return
    }

    const min = parseInt(newRoomMinBookingMins) || 0
    const max = parseInt(newRoomMaxBookingMins) || 0

    if (min >= max && max !== 0) {
      alert('Maximum booking minutes must be greater than minimum booking minutes.')
      return
    }

    setIsSubmitting(true)
    try {
      let imageBlob: Blob | null = pendingRoomImageBlob;
      const isNewUpload = !!pendingRoomImageBlob || (newRoomImage.startsWith('data:') && newRoomImage !== DEFAULT_ROOM_IMAGE);
      
      if (!imageBlob && isNewUpload) {
        const response = await fetch(newRoomImage);
        imageBlob = await response.blob();
      }

      const uploadImage = async (roomId: string) => {
        if (!imageBlob) return newRoomImage;
        const storageRef = ref(storage, `rooms/${roomId}/image_${Date.now()}`);
        await uploadBytesResumable(storageRef, imageBlob);
        return await getDownloadURL(storageRef);
      };

      if (editingRoom) {
        const roomRef = doc(db, 'rooms', editingRoom.id)
        const oldImageUrl = editingRoom.image
        const imageUrl = await uploadImage(editingRoom.id)

        // Delete old image if a new one was uploaded and the old one was in storage
        if (isNewUpload && oldImageUrl && oldImageUrl.includes('firebasestorage.googleapis.com')) {
          console.log("Deleting old image from storage:", oldImageUrl)
          await deleteImageFromStorage(oldImageUrl)
        }

        await updateDoc(roomRef, {
          name: newRoomName,
          code: newRoomCode,
          type: newRoomType,
          floor: parseInt(newRoomFloor) || 0,
          capacity: parseInt(newRoomCapacity) || 0,
          status: newRoomStatus,
          image: imageUrl,
          description: newRoomDescription,
          amenities: newRoomAmenities,
          availableDays: newRoomAvailableDays,
          startTime: newRoomStartTime,
          endTime: newRoomEndTime,
          minBookingMins: min,
          maxBookingMins: max,
          updatedAt: serverTimestamp()
        })
      } else if (isMultipleRooms) {
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        
        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          const roomRef = await addDoc(collection(db, 'rooms'), {
            buildingId: activeBuildingId,
            name: `${roomNamePrefix}${currentNum}`,
            code: `${roomCodePrefix}${currentNum}`,
            type: newRoomType,
            floor: parseInt(newRoomFloor) || 0,
            capacity: parseInt(newRoomCapacity) || 0,
            status: newRoomStatus,
            image: newRoomImage,
            description: newRoomDescription,
            amenities: newRoomAmenities,
            availableDays: newRoomAvailableDays,
            startTime: newRoomStartTime,
            endTime: newRoomEndTime,
            minBookingMins: min,
            maxBookingMins: max,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })

          if (isNewUpload) {
            const imageUrl = await uploadImage(roomRef.id)
            await updateDoc(roomRef, { image: imageUrl })
          }
        }
      } else {
        const roomRef = await addDoc(collection(db, 'rooms'), {
          buildingId: activeBuildingId,
          name: newRoomName, 
          code: newRoomCode,
          type: newRoomType,
          floor: parseInt(newRoomFloor) || 0,
          capacity: parseInt(newRoomCapacity) || 0,
          status: newRoomStatus,
          image: newRoomImage,
          description: newRoomDescription,
          amenities: newRoomAmenities,
          availableDays: newRoomAvailableDays,
          startTime: newRoomStartTime,
          endTime: newRoomEndTime,
          minBookingMins: min,
          maxBookingMins: max,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })

        if (isNewUpload) {
          const imageUrl = await uploadImage(roomRef.id)
          await updateDoc(roomRef, { image: imageUrl })
        }
      }
      handleCloseModals()
    } catch (error) {
      console.error("Error saving room: ", error)
      alert("Error saving room. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const allRooms = buildings.flatMap((building) => building.rooms)
  const availableRoomsCount = allRooms.filter(r => r.status === 'Available').length
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredBuildings = buildings
    .map((building) => {
      const buildingMatchesSearch = !normalizedSearch || [
        building.name,
        building.code,
        String(building.floor),
        String(building.rooms.length),
        String(building.capacity),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      const matchingRooms = building.rooms.filter((room) => {
        const matchesSearch = !normalizedSearch || buildingMatchesSearch || [
          room.name,
          room.code,
          room.type,
          String(room.capacity),
          room.status,
        ].some((value) => value.toLowerCase().includes(normalizedSearch))

        const matchesStatus = selectedRoomStatuses.length === 0 || selectedRoomStatuses.includes(room.status)
        const matchesType = selectedRoomTypes.length === 0 || selectedRoomTypes.includes(room.type)

        return matchesSearch && matchesStatus && matchesType
      })

      if (matchingRooms.length === 0) {
        return null
      }

      return {
        ...building,
        rooms: matchingRooms,
      }
    })
    .filter((building): building is Building => building !== null)

  return (
    <section 
      className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-8 sm:px-6 lg:px-8 lg:pb-10"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Create/Edit Building Modal */}
      {isBuildingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white relative">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">{editingBuilding ? 'Edit Building' : 'Add New Building'}</h3>
                  <p className="mt-1 text-xs text-white/90 font-medium">
                    {editingBuilding ? 'Update building details and identifiers.' : 'Register a new building facility in the system.'}
                  </p>
                </div>
                <button
                  onClick={handleCloseModals}
                  className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <form onSubmit={handleBuildingSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label htmlFor="building-name" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Building Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="building-name"
                    type="text"
                    value={newBuildingName}
                    onChange={(e) => {
                      setNewBuildingName(e.target.value)
                      if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                    }}
                    placeholder="e.g. Administration Building"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs ${
                      errors.name 
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                        : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                    }`}
                    autoFocus
                  />
                </div>

                <div className="col-span-1">
                  <label htmlFor="building-code" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                    Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="building-code"
                    type="text"
                    value={newBuildingCode}
                    onChange={(e) => {
                      setNewBuildingCode(e.target.value)
                      if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                    }}
                    placeholder="e.g. ADM"
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs uppercase ${
                      errors.code 
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                        : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModals}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[var(--brand-color-hover)] hover:shadow-lg focus:ring-4 focus:ring-[var(--brand-color)]/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {isSubmitting 
                    ? (editingBuilding ? 'Saving...' : 'Adding...') 
                    : (editingBuilding ? 'Save Changes' : 'Add Building')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create/Edit Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-visible animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                  <p className="mt-1 text-xs text-white/90 font-medium">
                    Step {roomModalStep} of 3: {roomModalStep === 1 ? 'General Information' : roomModalStep === 2 ? 'Media & Amenities' : 'Schedule & Limits'}
                  </p>
                </div>
                <div className="flex gap-1.5 items-center">
                  {[1, 2, 3].map((s) => (
                    <div 
                      key={s} 
                      className={`h-2 rounded-full transition-all duration-300 ${s === roomModalStep ? 'w-6 bg-white' : s < roomModalStep ? 'w-2 bg-white/80' : 'w-2 bg-white/30'}`} 
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleRoomSubmit} className="p-6 space-y-5 overflow-visible">
              {roomModalStep === 1 && (
                <div className="space-y-4 overflow-visible animate-in fade-in duration-200">
                  {!editingRoom && (
                    <div className="flex p-1 bg-slate-100/80 rounded-xl mb-4 border border-slate-200/60">
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(false)}
                        className={`flex-1 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all ${!isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Single Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(true)}
                        className={`flex-1 py-2 text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all ${isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Batch / Multi
                      </button>
                    </div>
                  )}

                  {!isMultipleRooms ? (
                    <div className="grid grid-cols-5 gap-4 overflow-visible">
                      <div className="col-span-3 overflow-visible">
                        <div className="flex justify-between items-end mb-1.5">
                          <label htmlFor="room-name" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                            Room Name <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.65rem] font-bold ${newRoomName.length >= 24 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {newRoomName.length}/24
                          </span>
                        </div>
                        <input
                          id="room-name"
                          type="text"
                          value={newRoomName}
                          maxLength={24}
                          onChange={(e) => {
                            setNewRoomName(e.target.value)
                            if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                          }}
                          placeholder="e.g. Science Lab 1"
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs ${
                            errors.name 
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                              : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                          }`}
                          autoFocus
                        />
                      </div>
                      <div className="col-span-2 overflow-visible">
                        <div className="flex justify-between items-end mb-1.5">
                          <label htmlFor="room-code" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                            Code <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.65rem] font-bold ${newRoomCode.length >= 8 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {newRoomCode.length}/8
                          </span>
                        </div>
                        <input
                          id="room-code"
                          type="text"
                          value={newRoomCode}
                          maxLength={8}
                          onChange={(e) => {
                            setNewRoomCode(e.target.value)
                            if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                          }}
                          placeholder="e.g. ADM-101"
                          className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs uppercase ${
                            errors.code 
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                              : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                          }`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-5 gap-4 overflow-visible">
                        <div className="col-span-3 overflow-visible">
                          <div className="flex justify-between items-end mb-1.5">
                            <label htmlFor="room-name-prefix" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                              Name Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.65rem] font-bold ${roomNamePrefix.length >= 24 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {roomNamePrefix.length}/24
                            </span>
                          </div>
                          <input
                            id="room-name-prefix"
                            type="text"
                            value={roomNamePrefix}
                            maxLength={24}
                            onChange={(e) => {
                              setRoomNamePrefix(e.target.value)
                              if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                            }}
                            placeholder="e.g. PTC Room "
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs ${
                              errors.name 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                                : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                            }`}
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 overflow-visible">
                          <div className="flex justify-between items-end mb-1.5">
                            <label htmlFor="room-code-prefix" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                              Code Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.65rem] font-bold ${roomCodePrefix.length >= 8 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {roomCodePrefix.length}/8
                            </span>
                          </div>
                          <input
                            id="room-code-prefix"
                            type="text"
                            value={roomCodePrefix}
                            maxLength={8}
                            onChange={(e) => {
                              setRoomCodePrefix(e.target.value)
                              if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                            }}
                            placeholder="e.g. PTC-"
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs uppercase ${
                              errors.code 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                                : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="room-start-number" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                            Start Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="room-start-number"
                            type="number"
                            value={roomStartNumber}
                            onChange={(e) => {
                              setRoomStartNumber(e.target.value)
                              if (errors.start) setErrors(prev => ({ ...prev, start: false }))
                            }}
                            placeholder="e.g. 101"
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs ${
                              errors.start 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                                : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                            }`}
                          />
                        </div>
                        <div>
                          <label htmlFor="room-end-number" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                            End Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="room-end-number"
                            type="number"
                            value={roomEndNumber}
                            onChange={(e) => {
                              setRoomEndNumber(e.target.value)
                              if (errors.end) setErrors(prev => ({ ...prev, end: false }))
                            }}
                            placeholder="e.g. 105"
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:ring-4 shadow-xs ${
                              errors.end 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 bg-rose-50/30' 
                                : 'border-slate-200 bg-slate-50/60 focus:bg-white focus:border-[var(--brand-color)] focus:ring-[var(--brand-color)]/10'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center">
                        <p className="text-[0.65rem] font-black text-slate-500 uppercase tracking-widest shrink-0 mr-2">Preview:</p>
                        <p className="text-xs font-semibold text-slate-700 truncate">
                          {roomStartNumber && roomEndNumber ? (
                            (() => {
                              const s = parseInt(roomStartNumber)
                              const e = parseInt(roomEndNumber)
                              if (isNaN(s) || isNaN(e)) return "Enter range to see preview"
                              if (s === e) return `${roomNamePrefix}${s}`
                              const diff = Math.abs(e - s)
                              const step = s < e ? 1 : -1
                              const next = s + step
                              if (diff === 1) return `${roomNamePrefix}${s}, ${roomNamePrefix}${e}`
                              return <>{roomNamePrefix}{s}, {roomNamePrefix}{next}, ..., {roomNamePrefix}{e}</>
                            })()
                          ) : (
                            "Enter range to see preview"
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-floor" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Floor Number
                      </label>
                      <input
                        id="room-floor"
                        type="number"
                        value={newRoomFloor}
                        onChange={(e) => setNewRoomFloor(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-capacity" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Capacity (Pax)
                      </label>
                      <input
                        id="room-capacity"
                        type="number"
                        value={newRoomCapacity}
                        onChange={(e) => setNewRoomCapacity(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-type" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Room Type
                      </label>
                      <SingleSelectDropdown
                        options={['Lecture Room', 'Laboratory', 'Office', 'Meeting Room', 'Studio', 'Administrative']}
                        value={newRoomType}
                        onChange={setNewRoomType}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-status" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Status
                      </label>
                      <SingleSelectDropdown
                        options={['Available', 'Occupied', 'Reserved', 'Maintenance']}
                        value={newRoomStatus}
                        onChange={(val) => setNewRoomStatus(val as RoomStatus)}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              )}

              {roomModalStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1 flex flex-col">
                      <label className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Room Photo
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleRoomImageDrop}
                        className={`w-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center overflow-hidden transition-all group relative shadow-xs ${
                          isDraggingRoomImage 
                            ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 ring-4 ring-[var(--brand-color)]/10 scale-[0.98]' 
                            : 'border-slate-200 bg-slate-50 hover:border-[var(--brand-color)]'
                        }`}
                      >
                        {newRoomImage ? (
                          <img 
                            src={newRoomImage} 
                            alt="Preview" 
                            className="h-full w-full object-cover" 
                            onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 p-2">
                            <CameraIcon className="h-7 w-7 text-slate-400" />
                            <span className="text-[0.625rem] font-extrabold text-slate-500 uppercase tracking-tight text-center">Upload Photo</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UploadIcon className="h-7 w-7 text-white" />
                        </div>
                      </button>
                    </div>

                    <div className="col-span-2 flex flex-col">
                      <div className="flex justify-between items-end mb-1.5">
                        <label htmlFor="room-description" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                          Description
                        </label>
                        <span className={`text-[0.65rem] font-bold ${newRoomDescription.length >= 200 ? 'text-rose-500' : 'text-slate-400'}`}>
                          {newRoomDescription.length}/200
                        </span>
                      </div>
                      <textarea
                        id="room-description"
                        value={newRoomDescription}
                        maxLength={200}
                        onChange={(e) => setNewRoomDescription(e.target.value)}
                        placeholder="Describe room layout, available equipment, or notes..."
                        className="w-full flex-1 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs resize-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Room Amenities
                    </label>
                    <div className="max-h-[9.5rem] overflow-y-auto custom-scrollbar pr-1">
                      <div className="grid grid-cols-6 gap-2 grid-flow-dense">
                        {ROOM_AMENITIES_GROUPS.map((group) => {
                          const span = group.length === 3 ? 'col-span-2' : 'col-span-3'
                          
                          return group.map((amenity) => {
                            const isSelected = newRoomAmenities.includes(amenity)
                            
                            return (
                              <button
                                key={amenity}
                                type="button"
                                onClick={() => {
                                  setNewRoomAmenities(prev => {
                                    if (prev.includes(amenity)) {
                                      return prev.filter(a => a !== amenity)
                                    } else {
                                      return [...prev, amenity]
                                    }
                                  })
                                }}
                                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${span} ${
                                  isSelected
                                    ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/10 text-[var(--brand-color)] shadow-xs scale-[1.02]'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-color)]" strokeWidth={3} />}
                                <span className="truncate">{amenity}</span>
                              </button>
                            )
                          })
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {roomModalStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Available Days
                    </label>
                    <div className="flex gap-1.5">
                      {DAYS_OF_WEEK.map((day) => {
                        const isAvailable = newRoomAvailableDays.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              setNewRoomAvailableDays(prev => 
                                prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                              )
                            }}
                            className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2.5 text-[0.65rem] font-black uppercase tracking-wider transition-all ${
                              isAvailable
                                ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white shadow-xs'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            <span>{day.slice(0, 3)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Start Time
                      </label>
                      <TimePicker
                        value={newRoomStartTime}
                        onChange={setNewRoomStartTime}
                        onToggle={handleDropdownToggle}
                      />
                    </div>
                    <div>
                      <label className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        End Time
                      </label>
                      <TimePicker
                        value={newRoomEndTime}
                        onChange={setNewRoomEndTime}
                        onToggle={handleDropdownToggle}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="room-min-mins" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Min Booking (Mins)
                      </label>
                      <input
                        id="room-min-mins"
                        type="number"
                        min="0"
                        step="15"
                        value={newRoomMinBookingMins}
                        onChange={(e) => setNewRoomMinBookingMins(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="room-max-mins" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                        Max Booking (Mins)
                      </label>
                      <input
                        id="room-max-mins"
                        type="number"
                        min="0"
                        step="15"
                        value={newRoomMaxBookingMins}
                        onChange={(e) => setNewRoomMaxBookingMins(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-[var(--brand-color)] focus:ring-4 focus:ring-[var(--brand-color)]/10 shadow-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                {roomModalStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRoomModalStep(prev => prev - 1)}
                    disabled={isSubmitting}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.98]"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCloseModals}
                    disabled={isSubmitting}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                )}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[var(--brand-color-hover)] hover:shadow-lg focus:ring-4 focus:ring-[var(--brand-color)]/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {roomModalStep < 3 
                    ? 'Next Step' 
                    : (isSubmitting 
                        ? (editingRoom ? 'Saving...' : 'Adding...') 
                        : (editingRoom ? 'Save Changes' : 'Add Room'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Room Information Modal */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white relative">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight">Room Information</h3>
                  <p className="text-xs text-white/90 font-medium mt-0.5">Facility details, schedule & availability</p>
                </div>
                <button
                  onClick={handleCloseModals}
                  className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex flex-col sm:flex-row gap-5">
                  <div className="w-full sm:w-40 h-40 shrink-0 rounded-2xl border border-slate-200/80 bg-slate-100 overflow-hidden shadow-xs relative">
                    <img 
                      src={selectedRoomInfo.image} 
                      alt={selectedRoomInfo.name} 
                      className="h-full w-full object-cover" 
                      onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                    />
                    <span className="absolute top-2 left-2 rounded-lg bg-slate-900/80 backdrop-blur-md px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-white border border-white/20">
                      {selectedRoomInfo.code}
                    </span>
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xl font-extrabold text-slate-900 leading-tight">{selectedRoomInfo.name}</h4>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          <span className={`h-2 w-2 rounded-full ${roomStatusDots[selectedRoomInfo.status]}`} />
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200/60">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="space-y-1">
                        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400">Capacity</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                          <p className="text-sm font-bold text-slate-800">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400">Booking Range</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <ClockIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                          <p className="text-sm font-bold text-slate-800">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h5 className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400 mb-1.5">Description</h5>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <p className="text-sm text-slate-600 leading-relaxed font-medium">
                        {selectedRoomInfo.description || 'No description provided for this room.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400 mb-1.5">Availability Days</h5>
                      <div className="flex gap-1 h-9">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-lg text-xs font-black transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white shadow-xs' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400 mb-1.5">Operating Hours</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-800 bg-slate-50/80 h-9 rounded-xl border border-slate-200/80">
                        <ClockIcon className="h-4 w-4 text-[var(--brand-color)] shrink-0" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400 mb-2">Room Amenities</h5>
                    <div className="flex flex-wrap gap-2 max-h-[7.5rem] overflow-y-auto custom-scrollbar pr-1">
                      {selectedRoomInfo.amenities.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs"
                          >
                            <CheckIcon className="h-3.5 w-3.5 text-[var(--brand-color)]" strokeWidth={3} />
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-xs italic text-slate-400 font-medium">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={handleCloseModals}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-xs active:scale-[0.98]"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      const buildingId = buildings.find(b => b.rooms.some(r => r.id === selectedRoomInfo.id))?.id
                      if (buildingId) {
                        handleOpenRoomModal(buildingId, selectedRoomInfo)
                        setIsRoomInfoModalOpen(false)
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-[var(--brand-color-hover)] hover:shadow-lg active:scale-[0.98]"
                  >
                    <EditIcon className="h-4 w-4" />
                    Edit Details
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={handleCloseModals} />
        </div>
      )}

      {/* Delete Room Confirmation Modal */}
      {isDeleteRoomModalOpen && roomToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-extrabold tracking-tight">Delete Room</h3>
              <p className="mt-1 text-xs text-white/90 font-medium">Are you sure you want to delete this room?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white overflow-hidden shrink-0 shadow-xs">
                  <img 
                    src={roomToDelete.image} 
                    alt="" 
                    className="h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{roomToDelete.name}</p>
                  <p className="text-xs font-semibold text-slate-500">{roomToDelete.code} • {roomToDelete.type}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-800 font-medium">
                  <span className="font-extrabold uppercase tracking-wider">Warning:</span> This action will permanently delete this room and all associated schedule history. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteRoomSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteRoomModal}
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-xs active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-rose-700 hover:shadow-lg disabled:opacity-50 active:scale-[0.98]"
                  >
                    {isDeletingRoom ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onClick={() => {
              if (!isDeletingRoom) handleCloseDeleteRoomModal()
            }} 
          />
        </div>
      )}

      {/* Delete Building Confirmation Modal */}
      {isDeleteBuildingModalOpen && buildingToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-md rounded-3xl border border-slate-100 bg-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-extrabold tracking-tight">Delete Building</h3>
              <p className="mt-1 text-xs text-white/90 font-medium">Are you sure you want to delete this building facility?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-rose-600 shrink-0 shadow-xs">
                  <BuildingIcon className="h-6 w-6 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{buildingToDelete.name}</p>
                  <p className="text-xs font-semibold text-slate-500">{buildingToDelete.code} • {buildingToDelete.rooms.length} Rooms</p>
                </div>
              </div>

              <div className="rounded-2xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-800 font-medium">
                  <span className="font-extrabold uppercase tracking-wider">Warning:</span> This action will permanently delete this building and all rooms contained inside it.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <label htmlFor="confirm-building-name" className="block text-[0.7rem] font-black uppercase tracking-widest text-slate-500">
                  Type <span className="text-rose-600">"{buildingToDelete.name}"</span> to confirm:
                </label>
                <input
                  id="confirm-building-name"
                  type="text"
                  value={confirmBuildingName}
                  onChange={(e) => setConfirmBuildingName(e.target.value)}
                  placeholder="Enter building name"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-100 shadow-xs"
                  autoFocus
                />
              </div>

              <form onSubmit={handleDeleteBuildingSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteBuildingModal}
                    disabled={isDeletingBuilding}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 shadow-xs active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingBuilding || confirmBuildingName !== buildingToDelete.name}
                    className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition-all enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                  >
                    {isDeletingBuilding ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onClick={() => {
              if (!isDeletingBuilding) handleCloseDeleteBuildingModal()
            }} 
          />
        </div>
      )}

      <div className="space-y-6">
        <SectionHeader 
          title="Buildings & Rooms" 
          description="Manage campus facilities, view room capacities, and track utilization." 
        />
        
        {/* Filter Bar */}
        <SearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder="Search by building name, room code, status, capacity..."
          dropdowns={
            <FilterDropdown
              groups={[
                {
                  id: 'status',
                  title: 'Room Status',
                  options: ['Available', 'Occupied', 'Reserved', 'Maintenance'],
                  selectedValues: selectedRoomStatuses,
                  onChange: (newVals) => setSelectedRoomStatuses(newVals as RoomStatus[]),
                },
                {
                  id: 'type',
                  title: 'Room Type',
                  options: Array.from(new Set(buildings.flatMap(b => b.rooms.map(r => r.type)))).filter(Boolean).sort(),
                  selectedValues: selectedRoomTypes,
                  onChange: (newVals) => setSelectedRoomTypes(newVals),
                },
              ]}
              onClearAll={() => {
                setSelectedRoomStatuses([])
                setSelectedRoomTypes([])
              }}
            />
          }
          primaryButton={{
            label: "Add Building",
            onClick: () => handleOpenBuildingModal()
          }}
        />

        {/* Buildings & Rooms Container */}
        <div className="space-y-6">
          {filteredBuildings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[color:rgba(98,133,62,0.25)] bg-white p-12 text-center shadow-xs">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-[var(--brand-color)] border border-emerald-100">
                <BuildingIcon className="h-8 w-8" />
              </div>
              <p className="mt-4 text-lg font-bold text-slate-900">
                No matching buildings or rooms found
              </p>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto font-medium">
                Try searching for a different building name, room code, room type, or status filter.
              </p>
            </div>
          ) : filteredBuildings.map((building) => {
            const roomsByFloor = building.rooms.reduce((acc, room) => {
              if (!acc[room.floor]) {
                acc[room.floor] = []
              }
              acc[room.floor].push(room)
              return acc
            }, {} as Record<number, Room[]>)

            const sortedFloors = Object.keys(roomsByFloor)
              .map(Number)
              .sort((a, b) => a - b)

            const isExpanded = expandedBuildingIds.includes(building.id)

            // Room status breakdown counts for this building
            const availableCount = building.rooms.filter(r => r.status === 'Available').length
            const occupiedCount = building.rooms.filter(r => r.status === 'Occupied').length
            const reservedCount = building.rooms.filter(r => r.status === 'Reserved').length
            const maintenanceCount = building.rooms.filter(r => r.status === 'Maintenance').length

            return (
              <article
                key={building.id}
                className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 sm:p-8"
              >
                <div className="flex flex-col gap-6">
                  {/* Building Header Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[var(--brand-color)] border border-emerald-200/60 flex items-center justify-center shrink-0 shadow-xs">
                        <BuildingIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="text-2xl font-extrabold tracking-tight text-slate-900">
                            {building.name}
                          </h3>
                          <span className="inline-flex items-center justify-center rounded-full bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 px-3 py-0.5 text-xs font-black uppercase tracking-wider text-[var(--brand-color)] leading-none">
                            {building.code}
                          </span>
                        </div>
                        
                        {/* Status Summary Pills */}
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {availableCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold text-emerald-800 bg-emerald-100/80 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              {availableCount} Available
                            </span>
                          )}
                          {occupiedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold text-amber-800 bg-amber-100/80 border border-amber-200/60 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              {occupiedCount} Occupied
                            </span>
                          )}
                          {reservedCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold text-sky-800 bg-sky-100/80 border border-sky-200/60 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                              {reservedCount} Reserved
                            </span>
                          )}
                          {maintenanceCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold text-rose-800 bg-rose-100/80 border border-rose-200/60 px-2 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              {maintenanceCount} Maintenance
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="relative">
                        <IconButton
                          label="Building options"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === building.id ? null : building.id)
                          }}
                          className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
                        >
                          <DotsVerticalIcon className="h-5 w-5" />
                        </IconButton>

                        {openMenuId === building.id && (
                          <div
                            className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 p-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                              onClick={() => {
                                handleOpenRoomModal(building.id)
                                setOpenMenuId(null)
                              }}
                            >
                              <PlusIcon className="h-4 w-4 text-[var(--brand-color)]" />
                              Add Room
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                              onClick={() => {
                                handleOpenBuildingModal(building)
                                setOpenMenuId(null)
                              }}
                            >
                              <EditIcon className="h-4 w-4 text-slate-400" />
                              Edit Building
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-rose-600 transition hover:bg-rose-50"
                              onClick={() => {
                                handleOpenDeleteBuilding(building)
                                setOpenMenuId(null)
                              }}
                            >
                              <TrashIcon className="h-4 w-4 text-rose-500" />
                              Delete Building
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleBuilding(building.id)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                      >
                        <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                        <ChevronDownIcon
                          className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-[var(--brand-color)]' : ''}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Building Stat Summary Badges */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 flex items-center gap-4 hover:bg-white hover:border-amber-200 hover:shadow-xs transition-all">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100/70 border border-amber-200/60 text-amber-700 shrink-0">
                        <LayersIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 truncate">
                          Floors
                        </p>
                        <p className="mt-0.5 text-xl font-extrabold text-slate-900 leading-none">
                          {building.floor}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 flex items-center gap-4 hover:bg-white hover:border-emerald-200 hover:shadow-xs transition-all">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100/70 border border-emerald-200/60 text-[var(--brand-color)] shrink-0">
                        <DoorIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 truncate">
                          Total Rooms
                        </p>
                        <p className="mt-0.5 text-xl font-extrabold text-slate-900 leading-none">
                          {building.rooms.length}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 flex items-center gap-4 hover:bg-white hover:border-rose-200 hover:shadow-xs transition-all">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100/70 border border-rose-200/60 text-rose-700 shrink-0">
                        <UsersIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 truncate">
                          Total Capacity
                        </p>
                        <p className="mt-0.5 text-xl font-extrabold text-slate-900 leading-none">
                          {building.capacity} <span className="text-xs font-semibold text-slate-400">pax</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Collapsible Floor & Rooms Grid */}
                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] mt-8 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="space-y-8 pt-2 pb-2">
                      {building.rooms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                          <DoorIcon className="mx-auto h-10 w-10 text-slate-300" />
                          <p className="mt-3 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                            No rooms added yet for this building
                          </p>
                          <button
                            type="button"
                            onClick={() => handleOpenRoomModal(building.id)}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-color)] hover:underline"
                          >
                            <PlusIcon className="h-3.5 w-3.5" />
                            Add First Room
                          </button>
                        </div>
                      ) : (
                        sortedFloors.map((floor) => (
                          <div key={floor} className="space-y-4">
                            <div className="flex items-center gap-3">
                              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200/80 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-slate-600">
                                <span className="h-2 w-2 rounded-full bg-[var(--brand-color)]" />
                                Floor {floor}
                              </div>
                              <span className="text-xs font-bold text-slate-400">
                                ({roomsByFloor[floor]?.length} {roomsByFloor[floor]?.length === 1 ? 'room' : 'rooms'})
                              </span>
                              <div className="h-px flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-transparent" />
                            </div>

                            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]">
                              {roomsByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map((room) => (
                                <div
                                  key={room.id}
                                  onClick={() => handleOpenRoomInfoModal(room)}
                                  className="group/card rounded-2xl border border-slate-200/80 bg-white shadow-xs hover:shadow-xl hover:border-[var(--brand-color)]/40 hover:-translate-y-1 transition-all duration-300 flex flex-col sm:flex-row overflow-hidden cursor-pointer relative"
                                >
                                  {/* Room Photo */}
                                  <div className="w-full sm:w-36 h-36 shrink-0 relative overflow-hidden bg-slate-100">
                                    <img
                                      src={room.image}
                                      alt={room.name}
                                      className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                                      onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                                    />
                                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-900/80 backdrop-blur-md border border-white/20 text-[0.65rem] font-extrabold uppercase tracking-wider text-white shadow-xs">
                                      {room.code}
                                    </span>
                                  </div>

                                  {/* Room Information */}
                                  <div className="flex-1 flex flex-col justify-between p-3.5 min-w-0">
                                    <div>
                                      <div className="flex items-start justify-between gap-1.5">
                                        <h5 className="text-base font-extrabold leading-tight text-slate-900 truncate group-hover/card:text-[var(--brand-color)] transition-colors">
                                          {room.name}
                                        </h5>
                                        
                                        <div className="relative">
                                          <IconButton
                                            label="Room options"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setOpenMenuId(openMenuId === room.id ? null : room.id)
                                            }}
                                            className="h-7 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                          >
                                            <DotsVerticalIcon className="h-4 w-4" />
                                          </IconButton>

                                          {openMenuId === room.id && (
                                            <div
                                              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 p-1"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                                                onClick={() => {
                                                  handleOpenRoomModal(building.id, room)
                                                  setOpenMenuId(null)
                                                }}
                                              >
                                                <EditIcon className="h-3.5 w-3.5 text-slate-400" />
                                                Edit Room
                                              </button>
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50"
                                                onClick={() => {
                                                  handleOpenDeleteRoom(room)
                                                  setOpenMenuId(null)
                                                }}
                                              >
                                                <TrashIcon className="h-3.5 w-3.5 text-rose-400" />
                                                Delete Room
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <p className="text-[0.68rem] font-extrabold uppercase tracking-wider text-slate-400 mt-0.5">
                                        {room.type}
                                      </p>

                                      {/* Amenities Preview Chips */}
                                      {room.amenities && room.amenities.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {room.amenities.slice(0, 2).map((amenity, idx) => (
                                            <span 
                                              key={idx} 
                                              className="text-[0.625rem] font-bold text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-md truncate max-w-[90px]"
                                            >
                                              {amenity}
                                            </span>
                                          ))}
                                          {room.amenities.length > 2 && (
                                            <span className="text-[0.625rem] font-bold text-slate-400 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded-md">
                                              +{room.amenities.length - 2}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>

                                    {/* Footer details */}
                                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                        <UserIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                        <span>{room.capacity} pax</span>
                                      </div>
                                      
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-[0.625rem] font-black uppercase tracking-wider flex items-center gap-1 ${roomStatusClasses[room.status]}`}
                                      >
                                        <span className={`h-1.5 w-1.5 rounded-full ${roomStatusDots[room.status]}`} />
                                        {room.status}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {/* Crop Modal */}
      {cropModalData.isOpen && (
        <CropModal
          imageSrc={cropModalData.imageSrc}
          onCropComplete={handleCropComplete}
          onClose={() => setCropModalData({ isOpen: false, imageSrc: '' })}
          isUploading={false}
          title="Adjust Room Image"
          hideOverlay={true}
          cropShape="rect"
        />
      )}
    </section>
  )
}

export default BuildingsRoomsPage
