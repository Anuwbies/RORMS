import { useState, useRef, useEffect, useCallback } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { BuildingBrowser } from '../../components/BuildingBrowser'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { Button } from '../../components/Button'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { NumberInput } from '../../components/NumberInput'
import { TextInput } from '../../components/TextInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { RoomAmenities } from '../../components/RoomAmenities'
import { DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'

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


function BuildingsRoomsPage() {

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



  return (
    <section 
      className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Create/Edit Building Modal */}
      {isBuildingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
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
                  <TextInput
                    id="building-name"
                    value={newBuildingName}
                    onChange={(val) => {
                      setNewBuildingName(val)
                      if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                    }}
                    placeholder="e.g. Administration Building"
                    error={errors.name}
                    autoFocus
                  />
                </div>

                <div className="col-span-1">
                  <label htmlFor="building-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Code <span className="text-rose-500">*</span>
                  </label>
                  <TextInput
                    id="building-code"
                    value={newBuildingCode}
                    onChange={(val) => {
                      setNewBuildingCode(val)
                      if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                    }}
                    placeholder="e.g. ADM"
                    error={errors.code}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModals}
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
                    ? (editingBuilding ? 'Saving Changes...' : 'Adding Building...') 
                    : (editingBuilding ? 'Save Changes' : 'Add Building')}
                </Button>
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
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-3xl">
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
                <div className="space-y-4 overflow-visible animate-in fade-in slide-in-from-right-4 duration-300">
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
                        <div className="flex justify-between items-end mb-2">
                          <label htmlFor="room-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                            Room Name <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomName.length >= 24 ? 'text-rose-500' : 'text-gray-400'}`}>
                            {newRoomName.length} / 24
                          </span>
                        </div>
                        <TextInput
                          id="room-name"
                          value={newRoomName}
                          maxLength={24}
                          onChange={(val) => {
                            setNewRoomName(val)
                            if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                          }}
                          placeholder="e.g. Registrar Receiving"
                          error={errors.name}
                          autoFocus
                        />
                      </div>
                      <div className="col-span-2 overflow-visible">
                        <div className="flex justify-between items-end mb-2">
                          <label htmlFor="room-code" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                            Code <span className="text-rose-500">*</span>
                          </label>
                          <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomCode.length >= 8 ? 'text-rose-500' : 'text-gray-400'}`}>
                            {newRoomCode.length} / 8
                          </span>
                        </div>
                        <TextInput
                          id="room-code"
                          value={newRoomCode}
                          maxLength={8}
                          onChange={(val) => {
                            setNewRoomCode(val)
                            if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                          }}
                          placeholder="e.g. ADM-101"
                          error={errors.code}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-5 gap-4 overflow-visible">
                        <div className="col-span-3 overflow-visible">
                          <div className="flex justify-between items-end mb-2">
                            <label htmlFor="room-name-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                              Name Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${roomNamePrefix.length >= 24 ? 'text-rose-500' : 'text-gray-400'}`}>
                              {roomNamePrefix.length} / 24
                            </span>
                          </div>
                          <TextInput
                            id="room-name-prefix"
                            value={roomNamePrefix}
                            maxLength={24}
                            onChange={(val) => {
                              setRoomNamePrefix(val)
                              if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                            }}
                            placeholder="e.g. PTC "
                            error={errors.name}
                            autoFocus
                          />
                        </div>
                        <div className="col-span-2 overflow-visible">
                          <div className="flex justify-between items-end mb-2">
                            <label htmlFor="room-code-prefix" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                              Code Prefix <span className="text-rose-500">*</span>
                            </label>
                            <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${roomCodePrefix.length >= 8 ? 'text-rose-500' : 'text-gray-400'}`}>
                              {roomCodePrefix.length} / 8
                            </span>
                          </div>
                          <TextInput
                            id="room-code-prefix"
                            value={roomCodePrefix}
                            maxLength={8}
                            onChange={(val) => {
                              setRoomCodePrefix(val)
                              if (errors.code) setErrors(prev => ({ ...prev, code: false }))
                            }}
                            placeholder="e.g. PTC-"
                            error={errors.code}
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
                              setRoomEndNumber(e.target.value)
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
                        <p className="text-[0.625rem] font-bold text-gray-500 uppercase tracking-widest shrink-0 mr-1">Preview:</p>
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
                      <NumberInput
                        id="room-floor"
                        value={newRoomFloor}
                        onChange={setNewRoomFloor}
                      />
                    </div>
                    <div className="overflow-visible">
                      <label htmlFor="room-capacity" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Capacity
                      </label>
                      <NumberInput
                        id="room-capacity"
                        value={newRoomCapacity}
                        onChange={setNewRoomCapacity}
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
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleRoomImageDrop}
                        className={`w-full aspect-square rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition-all group relative shadow-sm ${
                          isDraggingRoomImage 
                            ? 'border-[var(--brand-color)] bg-[var(--brand-color)]/5 ring-4 ring-[var(--brand-color)]/10 scale-[0.98]' 
                            : 'border-gray-200 bg-gray-50 hover:border-[var(--brand-color)]'
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
                          <div className="flex flex-col items-center gap-2">
                            <CameraIcon className="h-8 w-8 text-gray-400" />
                            <span className="text-[0.625rem] font-bold text-gray-400 uppercase tracking-tight text-center px-2">Upload Image</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                          <UploadIcon className="h-8 w-8 text-white" />
                        </div>
                      </button>
                    </div>

                    <div className="col-span-2 flex flex-col">
                      <div className="flex justify-between items-end mb-2">
                        <label htmlFor="room-description" className="block text-xs font-bold uppercase tracking-widest text-gray-500">
                          Description
                        </label>
                        <span className={`text-[0.625rem] font-bold uppercase tracking-tight ${newRoomDescription.length >= 200 ? 'text-rose-500' : 'text-gray-400'}`}>
                          {newRoomDescription.length} / 200
                        </span>
                      </div>
                      <TextAreaInput
                        id="room-description"
                        value={newRoomDescription}
                        maxLength={200}
                        onChange={setNewRoomDescription}
                        placeholder="Describe the room, equipment, and other details..."
                        className="flex-1"
                        inputClassName="h-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                      Room Amenities
                    </label>
                    <RoomAmenities
                      amenities={ROOM_AMENITIES_GROUPS.flat()}
                      selectedAmenities={newRoomAmenities}
                      onToggleAmenity={(amenity) => {
                        setNewRoomAmenities(prev => 
                          prev.includes(amenity) 
                            ? prev.filter(a => a !== amenity) 
                            : [...prev, amenity]
                        )
                      }}
                      maxHeightClass="max-h-[7.8rem]"
                    />
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
                          className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2 text-[0.625rem] font-bold uppercase transition cursor-pointer ${
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
                      <NumberInput
                        id="room-min-mins"
                        min="0"
                        step="15"
                        value={newRoomMinBookingMins}
                        onChange={setNewRoomMinBookingMins}
                      />
                    </div>
                    <div>
                      <label htmlFor="room-max-mins" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Max Booking (Mins)
                      </label>
                      <NumberInput
                        id="room-max-mins"
                        min="0"
                        step="15"
                        value={newRoomMaxBookingMins}
                        onChange={setNewRoomMaxBookingMins}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                {roomModalStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRoomModalStep(prev => prev - 1)}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModals}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                )}
                
                <Button
                  type="submit"
                  variant="brand"
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {roomModalStep < 3 
                    ? 'Next Step' 
                    : (isSubmitting 
                        ? (editingRoom ? 'Saving Changes...' : 'Adding Room...') 
                        : (editingRoom ? 'Save Changes' : 'Add Room'))}
                </Button>
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
      <RoomInfoModal
        isOpen={isRoomInfoModalOpen}
        room={selectedRoomInfo}
        onClose={handleCloseModals}
        actionButton={
          <Button
            variant="brand"
            icon={<EditIcon className="h-4 w-4" />}
            className="flex-1"
            onClick={() => {
              if (!selectedRoomInfo) return
              const buildingId = buildings.find(b => b.rooms.some(r => r.id === selectedRoomInfo.id))?.id
              if (buildingId) {
                handleOpenRoomModal(buildingId, selectedRoomInfo)
                setIsRoomInfoModalOpen(false)
              }
            }}
          >
            Edit Details
          </Button>
        }
      />

      {/* Delete Room Confirmation Modal */}
      {isDeleteRoomModalOpen && roomToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-3xl">
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
                    onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{roomToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{roomToDelete.type}</p>
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
            className="w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-3xl">
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
        <SectionHeader 
          title="Buildings & Rooms" 
          description="Manage campus facilities, view room capacities, and track utilization." 
        />
        <BuildingBrowser
          buildings={buildings}
          buildingOptions={Array.from(new Set(buildings.map(b => b.name))).sort()}
          expandedBuildingIds={expandedBuildingIds}
          onToggleBuilding={toggleBuilding}
          onRoomClick={handleOpenRoomInfoModal}
          isLoading={isInitialLoad.current}
          actionButton={
            <Button
              variant="brand"
              icon={<PlusIcon className="h-4 w-4" />}
              onClick={() => handleOpenBuildingModal()}
              className="w-full lg:w-auto"
            >
              Add Building
            </Button>
          }
          renderBuildingActions={(building) => (
            <div className="relative">
              <IconButton
                label="Building options"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuId(openMenuId === building.id ? null : building.id)
                }}
                className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 bg-white text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600 transition-all duration-300"
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
          )}
          renderRoomActions={(room, buildingId) => (
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
                      handleOpenRoomModal(buildingId, room)
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
          )}
        />    </div>
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