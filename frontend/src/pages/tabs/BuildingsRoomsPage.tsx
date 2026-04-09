import { useState, useRef } from 'react'
import { DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'

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
}

interface Building {
  id: string
  code: string
  name: string
  floor: number
  capacity: number
  rooms: Room[]
}

const initialBuildings: Building[] = [
  {
    id: 'admin',
    code: 'ADM',
    name: 'Administration Building',
    floor: 3,
    capacity: 112,
    rooms: [
      {
        id: 'adm-101',
        image: createRoomImage(),
        code: 'ADM-101',
        name: 'Registrar Receiving',
        type: 'Administrative',
        floor: 1,
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'adm-102',
        image: createRoomImage(),
        code: 'ADM-102',
        name: 'Admissions Inquiry',
        type: 'Office',
        floor: 1,
        capacity: 10,
        status: 'Available',
      },
      {
        id: 'adm-103',
        image: createRoomImage(),
        code: 'ADM-103',
        name: 'Student Records Window',
        type: 'Service Counter',
        floor: 1,
        capacity: 4,
        status: 'Occupied',
      },
      {
        id: 'adm-104',
        image: createRoomImage(),
        code: 'ADM-104',
        name: 'Public Relations Hub',
        type: 'Office',
        floor: 1,
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'adm-105',
        image: createRoomImage(),
        code: 'ADM-105',
        name: 'Finance Office',
        type: 'Office',
        floor: 1,
        capacity: 8,
        status: 'Occupied',
      },
      {
        id: 'adm-204',
        image: createRoomImage(),
        code: 'ADM-204',
        name: 'Records Archive',
        type: 'Storage',
        floor: 2,
        capacity: 6,
        status: 'Occupied',
      },
      {
        id: 'adm-210',
        image: createRoomImage(),
        code: 'ADM-210',
        name: 'HR Interview Room',
        type: 'Meeting Room',
        floor: 2,
        capacity: 4,
        status: 'Available',
      },
      {
        id: 'adm-305',
        image: createRoomImage(),
        code: 'ADM-305',
        name: 'Curriculum Review Room',
        type: 'Meeting Room',
        floor: 3,
        capacity: 18,
        status: 'Reserved',
      },
      {
        id: 'adm-312',
        image: createRoomImage(),
        code: 'ADM-312',
        name: 'Executive Boardroom',
        type: 'Boardroom',
        floor: 3,
        capacity: 38,
        status: 'Available',
      },
    ],
  },
  {
    id: 'science',
    code: 'SCI',
    name: 'Science and Innovation Center',
    floor: 4,
    capacity: 198,
    rooms: [
      {
        id: 'sci-110',
        image: createRoomImage(),
        code: 'SCI-110',
        name: 'Chemistry Laboratory',
        type: 'Laboratory',
        floor: 1,
        capacity: 24,
        status: 'Occupied',
      },
      {
        id: 'sci-115',
        image: createRoomImage(),
        code: 'SCI-115',
        name: 'Bio-Safety Level 2 Lab',
        type: 'Laboratory',
        floor: 1,
        capacity: 12,
        status: 'Maintenance',
      },
      {
        id: 'sci-201',
        image: createRoomImage(),
        code: 'SCI-201',
        name: 'Organic Chem Lab',
        type: 'Laboratory',
        floor: 2,
        capacity: 20,
        status: 'Available',
      },
      {
        id: 'sci-202',
        image: createRoomImage(),
        code: 'SCI-202',
        name: 'Analytical Lab',
        type: 'Laboratory',
        floor: 2,
        capacity: 20,
        status: 'Occupied',
      },
      {
        id: 'sci-212',
        image: createRoomImage(),
        code: 'SCI-212',
        name: 'Physics Demo Room',
        type: 'Lecture Room',
        floor: 2,
        capacity: 32,
        status: 'Available',
      },
      {
        id: 'sci-220',
        image: createRoomImage(),
        code: 'SCI-220',
        name: 'Optics Research Darkroom',
        type: 'Specialized Lab',
        floor: 2,
        capacity: 6,
        status: 'Occupied',
      },
      {
        id: 'sci-318',
        image: createRoomImage(),
        code: 'SCI-318',
        name: 'Research Collaboration Hub',
        type: 'Collaboration Space',
        floor: 3,
        capacity: 20,
        status: 'Reserved',
      },
      {
        id: 'sci-325',
        image: createRoomImage(),
        code: 'SCI-325',
        name: 'Postgrad Study Lounge',
        type: 'Study Area',
        floor: 3,
        capacity: 30,
        status: 'Available',
      },
      {
        id: 'sci-402',
        image: createRoomImage(),
        code: 'SCI-402',
        name: 'Microscopy Suite',
        type: 'Laboratory',
        floor: 4,
        capacity: 10,
        status: 'Maintenance',
      },
      {
        id: 'sci-410',
        image: createRoomImage(),
        code: 'SCI-410',
        name: 'Data Analysis Center',
        type: 'Computer Lab',
        floor: 4,
        capacity: 24,
        status: 'Available',
      },
    ],
  },
  {
    id: 'learning',
    code: 'LLC',
    name: 'Learning Commons',
    floor: 2,
    capacity: 218,
    rooms: [
      {
        id: 'llc-102',
        image: createRoomImage(),
        code: 'LLC-102',
        name: 'Peer Tutoring Room',
        type: 'Study Room',
        floor: 1,
        capacity: 14,
        status: 'Available',
      },
      {
        id: 'llc-110',
        image: createRoomImage(),
        code: 'LLC-110',
        name: 'Group Media Pod 1',
        type: 'Media Room',
        floor: 1,
        capacity: 6,
        status: 'Reserved',
      },
      {
        id: 'llc-115',
        image: createRoomImage(),
        code: 'LLC-115',
        name: 'Digital Learning Lab',
        type: 'Laboratory',
        floor: 1,
        capacity: 28,
        status: 'Occupied',
      },
      {
        id: 'llc-201',
        image: createRoomImage(),
        code: 'LLC-201',
        name: 'Silent Thesis Zone',
        type: 'Quiet Study',
        floor: 2,
        capacity: 20,
        status: 'Available',
      },
      {
        id: 'llc-202',
        image: createRoomImage(),
        code: 'llc-202',
        name: 'Reference Library Room',
        type: 'Library',
        floor: 2,
        capacity: 50,
        status: 'Available',
      },
      {
        id: 'llc-203',
        image: createRoomImage(),
        code: 'llc-203',
        name: 'Creative Media Studio',
        type: 'Studio',
        floor: 2,
        capacity: 30,
        status: 'Available',
      },
      {
        id: 'llc-210',
        image: createRoomImage(),
        code: 'LLC-210',
        name: 'Quiet Reading Hall',
        type: 'Study Hall',
        floor: 2,
        capacity: 40,
        status: 'Available',
      },
      {
        id: 'llc-225',
        image: createRoomImage(),
        code: 'LLC-225',
        name: 'Tech Commons Lounge',
        type: 'Lounge',
        floor: 2,
        capacity: 30,
        status: 'Available',
      },
    ],
  },
  {
    id: 'engineering',
    code: 'ENG',
    name: 'Engineering Building',
    floor: 5,
    capacity: 216,
    rooms: [
      {
        id: 'eng-120',
        image: createRoomImage(),
        code: 'ENG-120',
        name: 'CAD Drafting Studio',
        type: 'Studio',
        floor: 1,
        capacity: 30,
        status: 'Reserved',
      },
      {
        id: 'eng-125',
        image: createRoomImage(),
        code: 'ENG-125',
        name: 'Civil Models Workshop',
        type: 'Workshop',
        floor: 1,
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'eng-233',
        image: createRoomImage(),
        code: 'ENG-233',
        name: 'Materials Testing Lab',
        type: 'Laboratory',
        floor: 2,
        capacity: 16,
        status: 'Occupied',
      },
      {
        id: 'eng-240',
        image: createRoomImage(),
        code: 'ENG-240',
        name: 'Hydrodynamics Tank Room',
        type: 'Specialized Lab',
        floor: 2,
        capacity: 10,
        status: 'Maintenance',
      },
      {
        id: 'eng-301',
        image: createRoomImage(),
        code: 'eng-301',
        name: 'Mechanical Systems Lab',
        type: 'Laboratory',
        floor: 3,
        capacity: 25,
        status: 'Available',
      },
      {
        id: 'eng-302',
        image: createRoomImage(),
        code: 'eng-302',
        name: 'Thermodynamics Lab',
        type: 'Laboratory',
        floor: 3,
        capacity: 20,
        status: 'Occupied',
      },
      {
        id: 'eng-341',
        image: createRoomImage(),
        code: 'ENG-341',
        name: 'Design Review Room',
        type: 'Meeting Room',
        floor: 3,
        capacity: 12,
        status: 'Available',
      },
      {
        id: 'eng-345',
        image: createRoomImage(),
        code: 'eng-345',
        name: 'Project Studio A',
        type: 'Studio',
        floor: 3,
        capacity: 15,
        status: 'Available',
      },
      {
        id: 'eng-350',
        image: createRoomImage(),
        code: 'ENG-350',
        name: 'Renewable Energy Lab',
        type: 'Laboratory',
        floor: 3,
        capacity: 22,
        status: 'Occupied',
      },
      {
        id: 'eng-502',
        image: createRoomImage(),
        code: 'ENG-502',
        name: 'Robotics Workshop',
        type: 'Workshop',
        floor: 5,
        capacity: 34,
        status: 'Available',
      },
      {
        id: 'eng-515',
        image: createRoomImage(),
        code: 'ENG-515',
        name: 'AI & Neural Systems Hub',
        type: 'Computer Lab',
        floor: 5,
        capacity: 20,
        status: 'Available',
      },
    ],
  },
]

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Occupied: 'bg-amber-100 text-amber-700',
  Reserved: 'bg-sky-100 text-sky-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

function BuildingsRoomsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [buildings] = useState<Building[]>(initialBuildings)
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(
    buildings.map((b) => b.id)
  )

  const [isBuildingModalOpen, setIsBuildingModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newBuildingCode, setNewBuildingCode] = useState('')
  const [newBuildingFloors, setNewBuildingFloors] = useState<string>('1')
  const [newBuildingCapacity, setNewBuildingCapacity] = useState<string>('0')

  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [, setActiveBuildingId] = useState<string | null>(null)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomCode, setNewRoomCode] = useState('')
  const [newRoomType, setNewRoomType] = useState('Lecture Room')
  const [newRoomFloor, setNewRoomFloor] = useState<string>('1')
  const [newRoomCapacity, setNewRoomCapacity] = useState<string>('20')
  const [newRoomStatus, setNewRoomStatus] = useState<RoomStatus>('Available')
  const [newRoomImage, setNewRoomImage] = useState(createRoomImage())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState({ name: false, code: false })

  const toggleBuilding = (id: string) => {
    setExpandedBuildingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleOpenBuildingModal = (building?: Building) => {
    if (building) {
      setEditingBuilding(building)
      setNewBuildingName(building.name)
      setNewBuildingCode(building.code)
      setNewBuildingFloors(String(building.floor))
      setNewBuildingCapacity(String(building.capacity))
    } else {
      setEditingBuilding(null)
      setNewBuildingName('')
      setNewBuildingCode('')
      setNewBuildingFloors('1')
      setNewBuildingCapacity('0')
    }
    setErrors({ name: false, code: false })
    setIsBuildingModalOpen(true)
  }

  const handleOpenRoomModal = (buildingId: string, room?: Room) => {
    setActiveBuildingId(buildingId)
    if (room) {
      setEditingRoom(room)
      setNewRoomName(room.name)
      setNewRoomCode(room.code)
      setNewRoomType(room.type)
      setNewRoomFloor(String(room.floor))
      setNewRoomCapacity(String(room.capacity))
      setNewRoomStatus(room.status)
      setNewRoomImage(room.image)
    } else {
      setEditingRoom(null)
      setNewRoomName('')
      setNewRoomCode('')
      setNewRoomType('Lecture Room')
      setNewRoomFloor('1')
      setNewRoomCapacity('20')
      setNewRoomStatus('Available')
      setNewRoomImage(createRoomImage())
    }
    setErrors({ name: false, code: false })
    setIsRoomModalOpen(true)
  }

  const handleCloseModals = () => {
    setIsBuildingModalOpen(false)
    setIsRoomModalOpen(false)
    setEditingBuilding(null)
    setEditingRoom(null)
    setActiveBuildingId(null)
    setErrors({ name: false, code: false })
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setNewRoomImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleBuildingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuildingName.trim() || !newBuildingCode.trim()) {
      setErrors({ name: !newBuildingName.trim(), code: !newBuildingCode.trim() })
      return
    }
    console.log('Building Submit:', { 
      name: newBuildingName, 
      code: newBuildingCode, 
      floor: parseInt(newBuildingFloors) || 0,
      capacity: parseInt(newBuildingCapacity) || 0
    })
    handleCloseModals()
  }

  const handleRoomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoomName.trim() || !newRoomCode.trim()) {
      setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim() })
      return
    }
    console.log('Room Submit:', { 
      name: newRoomName, 
      code: newRoomCode,
      floor: parseInt(newRoomFloor) || 0,
      capacity: parseInt(newRoomCapacity) || 0
    })
    handleCloseModals()
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
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold">{editingBuilding ? 'Edit Building' : 'Add Building'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingBuilding ? 'Update building information.' : 'Register a new building in the system.'}
              </p>
            </div>
            
            <form onSubmit={handleBuildingSubmit} className="p-6 space-y-5">
              <div>
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
                  className={`w-full rounded-md border px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                    errors.name 
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                      : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                  }`}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
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
                <div>
                  <label htmlFor="building-floors" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Floors
                  </label>
                  <input
                    id="building-floors"
                    type="number"
                    min="1"
                    value={newBuildingFloors}
                    onChange={(e) => setNewBuildingFloors(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModals}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg"
                >
                  {editingBuilding ? 'Save Changes' : 'Add Building'}
                </button>
              </div>
            </form>
          </div>
          <div className="absolute inset-0 -z-10" onClick={handleCloseModals} />
        </div>
      )}

      {/* Create/Edit Room Modal */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-md rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
              <p className="mt-1 text-sm text-white/80">
                {editingRoom ? 'Update room details.' : 'Add a new room to this building.'}
              </p>
            </div>
            
            <form onSubmit={handleRoomSubmit} className="p-6 space-y-5">
              <div>
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
                  className={`w-full rounded-md border px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:ring-4 shadow-sm ${
                    errors.name 
                      ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-50' 
                      : 'border-gray-200 focus:border-gray-300 focus:ring-gray-50'
                  }`}
                  autoFocus
                />
              </div>

              <div className="flex gap-6 items-start">
                <div className="shrink-0">
                  <label className="block text-center text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Photo
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
                    className="h-28 w-28 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden transition-all hover:border-[var(--brand-color)] group relative"
                  >
                    {newRoomImage ? (
                      <img src={newRoomImage} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                      <CameraIcon className="h-8 w-8 text-gray-400" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      <UploadIcon className="h-6 w-6 text-white" />
                    </div>
                  </button>
                </div>

                <div className="flex-1 space-y-4">
                  <div>
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
                  <div>
                    <label htmlFor="room-type" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Type
                    </label>
                    <select
                      id="room-type"
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
                    >
                      <option>Lecture Room</option>
                      <option>Laboratory</option>
                      <option>Office</option>
                      <option>Meeting Room</option>
                      <option>Studio</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
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
                <div>
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
                <div>
                  <label htmlFor="room-status" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Status
                  </label>
                  <select
                    id="room-status"
                    value={newRoomStatus}
                    onChange={(e) => setNewRoomStatus(e.target.value as RoomStatus)}
                    className="w-full rounded-md border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none shadow-sm"
                  >
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModals}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-[var(--brand-color)] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg"
                >
                  {editingRoom ? 'Save Changes' : 'Add Room'}
                </button>
              </div>
            </form>
          </div>
          <div className="absolute inset-0 -z-10" onClick={handleCloseModals} />
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
                      <button
                        type="button"
                        className="flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-4 h-10 text-xs font-bold text-white shadow-sm transition hover:bg-[#526f34] shrink-0"
                        onClick={() => handleOpenRoomModal(building.id)}
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add Room
                      </button>
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
                      {sortedFloors.map((floor) => (
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
                            {roomsByFloor[floor].map((room) => (
                              <div
                                key={room.id}
                                className="flex overflow-hidden rounded-md border border-gray-100 bg-white shadow-md transition-transform hover:scale-[1.02]"
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
                                                console.log('Delete room:', room.id)
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
                      ))}
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
