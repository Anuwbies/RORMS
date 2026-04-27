import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'
import { db } from '../../firebase'
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

type RoomStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance'

function createRoomImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="28" fill="#62853e" />
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

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
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
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
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-md border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm">
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex w-full items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
      >
        <span className="whitespace-nowrap">{value || 'None'}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isDisabled && (
        <div 
          className="absolute left-0 z-50 mt-2 min-w-full overflow-y-scroll custom-scrollbar rounded-md border border-gray-200 bg-white p-1.5 shadow-2xl"
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
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
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

function BuildingsRoomsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>([])

  const [rooms, setRooms] = useState<Room[]>([])

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

      // Auto-expand new buildings if they weren't already tracked
      setExpandedBuildingIds(prev => {
        const newIds = mergedBuildings.map(b => b.id).filter(id => !prev.includes(id))
        return [...prev, ...newIds]
      })
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
  const [newRoomImage, setNewRoomImage] = useState(createRoomImage())
  const [newRoomDescription, setNewRoomDescription] = useState('')
  const [newRoomAmenities, setNewRoomAmenities] = useState<string[]>([])
  const [newRoomAvailableDays, setNewRoomAvailableDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  const [newRoomStartTime, setNewRoomStartTime] = useState('07:30')
  const [newRoomEndTime, setNewRoomEndTime] = useState('18:00')
  const [newRoomMinBookingMins, setNewRoomMinBookingMins] = useState('30')
  const [newRoomMaxBookingMins, setNewRoomMaxBookingMins] = useState('90')

  const fileInputRef = useRef<HTMLInputElement>(null)
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
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      setNewRoomImage(reader.result as string)
    }
    reader.readAsDataURL(file)
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
      setNewRoomImage(createRoomImage())
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

  const handleDeleteRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomToDelete) return

    setIsDeletingRoom(true)
    try {
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
      } else {
        if (!newRoomName.trim() || !newRoomCode.trim()) {
          setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim(), start: false, end: false })
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
      if (editingRoom) {
        const roomRef = doc(db, 'rooms', editingRoom.id)
        await updateDoc(roomRef, {
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
          updatedAt: serverTimestamp()
        })
      } else if (isMultipleRooms) {
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        
        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        const roomPromises = []
        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          roomPromises.push(addDoc(collection(db, 'rooms'), {
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
          }))
        }
        await Promise.all(roomPromises)
      } else {
        await addDoc(collection(db, 'rooms'), {
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
  const totalCapacity = buildings.reduce((sum, building) => sum + building.capacity, 0)
  const totalFloors = buildings.reduce((sum, building) => sum + building.floor, 0)
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredBuildings = buildings
    .map((building) => {
      if (!normalizedSearch) {
        return building
      }

      const buildingMatches = [
        building.name,
        building.code,
        String(building.floor),
        String(building.rooms.length),
        String(building.capacity),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      if (buildingMatches) {
        return building
      }

      const matchingRooms = building.rooms.filter((room) =>
        [
          room.name,
          room.code,
          room.type,
          String(room.capacity),
          room.status,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      )

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
      className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Create/Edit Building Modal */}
      {isBuildingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">{editingBuilding ? 'Edit Building' : 'Add Building'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingBuilding ? 'Update building information.' : 'Register a new building in the system.'}
              </p>
            </div>
            
            <form onSubmit={handleBuildingSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label htmlFor="building-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                    className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                      errors.name 
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                        : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                    }`}
                    autoFocus
                  />
                </div>

                <div className="col-span-1">
                  <label htmlFor="building-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                    className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                      errors.code 
                        ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                        : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModals}
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
                    ? (editingBuilding ? 'Saving Changes...' : 'Adding Building...') 
                    : (editingBuilding ? 'Save Changes' : 'Add Building')}
                </button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onClick={() => {
              if (!isSubmitting) handleCloseModals()
            }} 
          />
        </div>
      )}

      {/* Create/Edit Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-md">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                  <p className="mt-1 text-xs text-white/80">
                    Step {roomModalStep} of 3: {roomModalStep === 1 ? 'General Info' : roomModalStep === 2 ? 'Media & Description' : 'Availability & Limits'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map((s) => (
                    <div 
                      key={s} 
                      className={`h-1.5 w-6 rounded-full transition-colors ${s <= roomModalStep ? 'bg-white' : 'bg-white/30'}`} 
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleRoomSubmit} className="p-6 space-y-5 overflow-visible">
              {roomModalStep === 1 && (
                <div className="space-y-4 overflow-visible">
                  {!editingRoom && (
                    <div className="flex p-1 bg-gray-100 rounded-md mb-6">
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(false)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${!isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Single Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(true)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Multiple Rooms
                      </button>
                    </div>
                  )}

                  {!isMultipleRooms ? (
                    <div className="grid grid-cols-5 gap-4 overflow-visible">
                      <div className="col-span-3 overflow-visible">
                        <label htmlFor="room-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                          Room Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="room-name"
                          type="text"
                          value={newRoomName}
                          onChange={(e) => {
                            setNewRoomName(e.target.value)
                            if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                          }}
                          placeholder="e.g. Registrar Receiving"
                          className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                            errors.name 
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                              : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                          }`}
                          autoFocus
                        />
                      </div>
                      <div className="col-span-2 overflow-visible">
                        <label htmlFor="room-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                          Code <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="room-code"
                          type="text"
                          value={newRoomCode}
                          onChange={(e) => {
                            setNewRoomCode(e.target.value)
                            if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                          }}
                          placeholder="e.g. ADM-101"
                          className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                            errors.code 
                              ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                              : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                          }`}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-5 gap-4 overflow-visible">
                        <div className="col-span-3 overflow-visible">
                          <label htmlFor="room-name-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            Name Prefix <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="room-name-prefix"
                            type="text"
                            value={roomNamePrefix}
                            onChange={(e) => {
                              setRoomNamePrefix(e.target.value)
                              if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                            }}
                            placeholder="e.g. PTC "
                            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                              errors.name 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                                : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                            }`}
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 overflow-visible">
                          <label htmlFor="room-code-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            Code Prefix <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="room-code-prefix"
                            type="text"
                            value={roomCodePrefix}
                            onChange={(e) => {
                              setRoomCodePrefix(e.target.value)
                              if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                            }}
                            placeholder="e.g. PTC-"
                            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                              errors.code 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                                : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="room-start-number" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 101"
                            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                              errors.start 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                                : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                            }`}
                          />
                        </div>
                        <div>
                          <label htmlFor="room-end-number" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            End Number <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="room-end-number"
                            type="number"
                            value={roomEndNumber}
                            onChange={(e) => {
                              setConfirmBuildingName(e.target.value)
                              if (errors.end) setErrors(prev => ({ ...prev, end: false }))
                            }}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 105"
                            className={`w-full rounded-md border px-4 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                              errors.end 
                                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                                : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                            }`}
                          />
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest shrink-0 mr-1">Preview:</p>
                        <p className="text-xs text-gray-700 truncate">
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
                  ) }

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-floor" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Floor
                      </label>
                      <input
                        id="room-floor"
                        type="number"
                        value={newRoomFloor}
                        onChange={(e) => setNewRoomFloor(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-capacity" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Capacity
                      </label>
                      <input
                        id="room-capacity"
                        type="number"
                        value={newRoomCapacity}
                        onChange={(e) => setNewRoomCapacity(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label htmlFor="room-type" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Type
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
                      <label htmlFor="room-status" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-1 flex flex-col">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                        className="w-full aspect-square rounded-md border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden transition-all hover:border-[var(--brand-color)] group relative shadow-sm"
                      >
                        {newRoomImage ? (
                          <img src={newRoomImage} alt="Preview" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <CameraIcon className="h-8 w-8 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight text-center px-2">Upload Image</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UploadIcon className="h-8 w-8 text-white" />
                        </div>
                      </button>
                    </div>

                    <div className="col-span-2 flex flex-col">
                      <label htmlFor="room-description" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Description
                      </label>
                      <textarea
                        id="room-description"
                        value={newRoomDescription}
                        onChange={(e) => setNewRoomDescription(e.target.value)}
                        placeholder="Describe the room, equipment, and other details..."
                        className="w-full flex-1 rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm resize-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                      Room Amenities
                    </label>
                    <div className="max-h-[145px] overflow-y-auto custom-scrollbar pr-1">
                      <div className="grid grid-cols-6 gap-2 grid-flow-dense">
                        {ROOM_AMENITIES_GROUPS.map((group, groupIndex) => {
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
                                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-bold whitespace-nowrap transition ${span} ${
                                  isSelected
                                    ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/10 text-[var(--brand-color)] shadow-sm'
                                    : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                                }`}                              >
                                {isSelected && <CheckIcon className="h-3 w-3 shrink-0" strokeWidth={4} />}
                                {amenity}
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
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                      Available Days
                    </label>
                    <div className="flex gap-1.5">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setNewRoomAvailableDays(prev => 
                              prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                            )
                          }}
                          className={`flex-1 flex flex-col items-center justify-center rounded-md border py-2 text-[10px] font-bold uppercase transition ${
                            newRoomAvailableDays.includes(day)
                              ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white shadow-sm'
                              : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                          }`}
                        >
                          {day.slice(0, 3).split('').map((char, index) => (
                            <span key={index} className="leading-tight">{char}</span>
                          ))}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Start Time
                      </label>
                      <TimePicker
                        value={newRoomStartTime}
                        onChange={setNewRoomStartTime}
                        onToggle={handleDropdownToggle}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
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
                      <label htmlFor="room-min-mins" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Min Booking (Mins)
                      </label>
                      <input
                        id="room-min-mins"
                        type="number"
                        min="0"
                        step="15"
                        value={newRoomMinBookingMins}
                        onChange={(e) => setNewRoomMinBookingMins(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="room-max-mins" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Max Booking (Mins)
                      </label>
                      <input
                        id="room-max-mins"
                        type="number"
                        min="0"
                        step="15"
                        value={newRoomMaxBookingMins}
                        onChange={(e) => setNewRoomMaxBookingMins(e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                {roomModalStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRoomModalStep(prev => prev - 1)}
                    disabled={isSubmitting}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCloseModals}
                    disabled={isSubmitting}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                )}
                
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {roomModalStep < 3 
                    ? 'Next Step' 
                    : (isSubmitting 
                        ? (editingRoom ? 'Saving Changes...' : 'Adding Room...') 
                        : (editingRoom ? 'Save Changes' : 'Add Room'))}
                </button>
              </div>
            </form>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={() => {
              if (activeDropdowns > 0 || isSubmitting) return
              handleCloseModals()
            }} 
          />
        </div>
      )}

      {/* Room Information Modal */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-md border border-gray-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="text-xs text-white/80 font-medium mt-0.5">Comprehensive details and availability schedule</p>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <div className="w-32 h-32 shrink-0 rounded-md border border-gray-200 bg-gray-50 overflow-hidden shadow-sm">
                    <img 
                      src={selectedRoomInfo.image} 
                      alt={selectedRoomInfo.name} 
                      className="h-full w-full object-cover grayscale-[0.2]" 
                    />
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-start gap-3">
                        <h4 className="text-lg font-bold text-gray-900 leading-tight">{selectedRoomInfo.name}</h4>
                        <span className="inline-flex items-center justify-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-600 border border-gray-200">
                          {selectedRoomInfo.code}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2 flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">Capacity</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="rounded-md border border-gray-100 bg-gray-50/50 p-2 flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 leading-none">Booking Limits</p>
                          <p className="text-xs font-bold text-gray-700 mt-1">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1.5">Description</h5>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {selectedRoomInfo.description || 'No description provided for this room.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Availability</h5>
                      <div className="flex gap-1 h-[30px]">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-sm text-[9px] font-bold transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white' : 'bg-gray-100 text-gray-300'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Schedule</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-xs font-bold text-gray-700 bg-gray-50 h-[30px] rounded-md border border-gray-100">
                        <ClockIcon className="h-3.5 w-3.5 text-[var(--brand-color)]" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2.5">Room Amenities</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRoomInfo.amenities.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-100 bg-white px-2 py-1 text-[10px] font-bold text-gray-600 shadow-sm"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-[10px] italic text-gray-400">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleCloseModals}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-2.5 text-xs font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 shadow-sm"
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
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-[#526f34]"
                  >
                    <EditIcon className="h-3.5 w-3.5" />
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Delete Room</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this room from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 overflow-hidden shrink-0">
                  <img 
                    src={roomToDelete.image} 
                    alt="" 
                    className="h-full w-full object-cover grayscale-[0.2]"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{roomToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{roomToDelete.code} • Floor {roomToDelete.floor}</p>
                </div>
              </div>

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this room and all its associated booking history. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteRoomSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteRoomModal}
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingRoom}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md">
              <h3 className="text-xl font-bold">Delete Building</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this building from the system?</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-md border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 shrink-0">
                  <BuildingIcon className="h-7 w-7 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{buildingToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{buildingToDelete.code} • {buildingToDelete.rooms.length} Rooms</p>
                </div>
              </div>

              <div className="rounded-md bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this building and all rooms associated with it. This action cannot be undone.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <label htmlFor="confirm-building-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                  To confirm, please type: <span className="text-rose-600">"{buildingToDelete.name}"</span>
                </label>
                <input
                  id="confirm-building-name"
                  type="text"
                  value={confirmBuildingName}
                  onChange={(e) => setConfirmBuildingName(e.target.value)}
                  placeholder="Enter building name"
                  className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-50 shadow-sm"
                  autoFocus
                />
              </div>

              <form onSubmit={handleDeleteBuildingSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseDeleteBuildingModal}
                    disabled={isDeletingBuilding}
                    className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingBuilding || confirmBuildingName !== buildingToDelete.name}
                    className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition enabled:hover:bg-rose-700 enabled:hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-8 text-white">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Buildings & Rooms
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
              Comprehensive directory of campus infrastructure and centralized room inventory management.
            </p>
          </div>

          <div className="p-6 bg-gray-50/50">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 border border-blue-100 shrink-0">
                  <BuildingIcon className="h-9 w-9 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total buildings</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{buildings.length}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 shrink-0">
                  <DoorIcon className="h-9 w-9 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Tracked rooms</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{allRooms.length}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                  <LayersIcon className="h-9 w-9 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total floors</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{totalFloors}</p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
                <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rose-50 border border-rose-100 shrink-0">
                  <UsersIcon className="h-9 w-9 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Total room capacity</p>
                  <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">{totalCapacity}</p>
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
                id="building-room-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by building name, room code, status, capacity..."
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
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#526f34] shrink-0"
              onClick={() => handleOpenBuildingModal()}
            >
              <PlusIcon className="h-5 w-5" />
              Add Building
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredBuildings.length === 0 ? (
            <div className="rounded-md border border-dashed border-[color:rgba(98,133,62,0.2)] bg-[var(--card-surface)] p-8 text-center shadow-[0_18px_45px_rgba(98,133,62,0.06)]">
              <p className="text-lg font-semibold text-[var(--brand-color)]">
                No matching buildings or rooms
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(98,133,62,0.78)]">
                Try a different building name, room code, status, or capacity.
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

            return (
              <article
                key={building.id}
                className="rounded-lg border border-gray-200 bg-gray-50/50 p-6 shadow-md sm:p-8"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-bold tracking-tight text-gray-900">
                          {building.name}
                        </h3>
                        <span className="inline-flex h-6 items-center justify-center rounded-full bg-white border border-gray-200 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-600 shadow-sm leading-none">
                          {building.code}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <IconButton
                          label="Building options"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === building.id ? null : building.id)
                          }}
                          className="h-10 w-10 shrink-0 rounded-md border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
                        >
                          <DotsVerticalIcon className="h-6 w-6" />
                        </IconButton>

                        {openMenuId === building.id && (
                          <div
                            className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-100 bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                              onClick={() => {
                                handleOpenRoomModal(building.id)
                                setOpenMenuId(null)
                              }}
                            >
                              <PlusIcon className="h-4 w-4 text-gray-400" />
                              Add Room
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                              onClick={() => {
                                handleOpenBuildingModal(building)
                                setOpenMenuId(null)
                              }}
                            >
                              <EditIcon className="h-4 w-4 text-gray-400" />
                              Edit Building
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                              onClick={() => {
                                handleOpenDeleteBuilding(building)
                                setOpenMenuId(null)
                              }}
                            >
                              <TrashIcon className="h-4 w-4 text-red-400" />
                              Delete Building
                            </button>
                          </div>
                        )}
                      </div>
                      <IconButton
                        label={isExpanded ? 'Collapse building' : 'Expand building'}
                        onClick={() => toggleBuilding(building.id)}
                        className="h-10 w-10 shrink-0 rounded-md border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
                      >
                        <ChevronDownIcon
                          className={`h-6 w-6 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-amber-50 border border-amber-100 shrink-0">
                        <LayersIcon className="h-9 w-9 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                          Floor
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.floor}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 shrink-0">
                        <DoorIcon className="h-9 w-9 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                          Rooms
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.rooms.length}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md bg-white border border-gray-200 p-4 flex items-center gap-4 shadow-sm transition-transform hover:scale-[1.02]">
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-rose-50 border border-rose-100 shrink-0">
                        <UsersIcon className="h-9 w-9 text-rose-600" />
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                          Capacity
                        </p>
                        <p className="mt-0.5 text-2xl font-bold text-gray-900 leading-none">
                          {building.capacity}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] mt-10 opacity-100' : 'grid-rows-[0fr] mt-0 opacity-0'}`}>
                  <div className="overflow-hidden px-4 -mx-4">
                    <div className="space-y-12 pb-4">
                      {building.rooms.length === 0 ? (
                        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 p-10 text-center">
                          <DoorIcon className="mx-auto h-12 w-12 text-gray-300" />
                          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-gray-400">
                            No rooms registered yet
                          </p>
                        </div>
                      ) : (
                        sortedFloors.map((floor) => (
                          <div key={floor} className="space-y-6">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2.5">
                                <span className="h-2 w-2 rounded-full bg-gray-400" />
                                <h4 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">
                                  Floor {floor}
                                </h4>
                              </div>
                              <div className="h-1 flex-1 bg-gray-200" />
                            </div>

                            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(min(100%,500px),1fr))]">
                              {roomsByFloor[floor]
                                ?.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                                .map((room) => (
                                <div
                                  key={room.id}
                                  onClick={() => handleOpenRoomInfoModal(room)}
                                  className="flex overflow-hidden rounded-md border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02] cursor-pointer"
                                >
                                  <img
                                    src={room.image}
                                    alt={room.name}
                                    className="aspect-square w-32 h-32 shrink-0 object-cover grayscale-[0.2] sm:w-40 sm:h-40"
                                  />

                                  <div className="flex flex-1 flex-col justify-between p-4">
                                    <div>
                                      <div className="flex items-start justify-between gap-2">
                                        <h5 className="text-lg font-bold leading-tight text-gray-900">
                                          {room.name}
                                        </h5>
                                        <div className="relative">
                                          <IconButton
                                            label="Room options"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setOpenMenuId(openMenuId === room.id ? null : room.id)
                                            }}
                                            className="h-8 w-8 shrink-0 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                          >
                                            <DotsVerticalIcon className="h-5 w-5" />
                                          </IconButton>

                                          {openMenuId === room.id && (
                                            <div
                                              className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-gray-100 bg-white shadow-2xl"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                                                onClick={() => {
                                                  handleOpenRoomModal(building.id, room)
                                                  setOpenMenuId(null)
                                                }}
                                              >
                                                <EditIcon className="h-4 w-4 text-gray-400" />
                                                Edit Room
                                              </button>
                                              <button
                                                type="button"
                                                className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                                                onClick={() => {
                                                  handleOpenDeleteRoom(room)
                                                  setOpenMenuId(null)
                                                }}
                                              >
                                                <TrashIcon className="h-4 w-4 text-red-400" />
                                                Delete Room
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-gray-400">
                                        {room.type}
                                      </p>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white border border-gray-200 shrink-0">
                                          <UserIcon className="h-6 w-6 text-gray-500" />
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 leading-tight">
                                            Capacity
                                          </span>
                                          <span className="text-sm font-bold text-gray-700 leading-none mt-0.5">
                                            {room.capacity} people
                                          </span>
                                        </div>
                                      </div>
                                      <span
                                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${roomStatusClasses[room.status]}`}
                                      >
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
    </section>
  )
}

export default BuildingsRoomsPage
