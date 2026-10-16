import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import { SummaryGraph } from '../../summary-graphs/SummaryGraph'
 
import { type TimeOfDay, type MoonPhaseKey, getAstronomicalMoonPhase } from '../../visualizations/WeatherOverlay'
import { BuildingBrowser } from '../../components/BuildingBrowser'
import { RoomInfoModal } from '../../components/RoomInfoModal'
import { RoomComments } from '../../components/RoomComments'
import { useRoomCommentNotices } from '../../hooks/useRoomCommentNotices'
import { RoomScheduleModal } from '../../components/RoomScheduleModal'
import { Button } from '../../components/Button'
import { IconOnlyButton } from '../../components/IconOnlyButton'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { NumberInput } from '../../components/NumberInput'
import { TextInput } from '../../components/TextInput'
import { TextAreaInput } from '../../components/TextAreaInput'
import { RoomAmenities } from '../../components/RoomAmenities'
import { SettingsIcon, DoorIcon, DotsVerticalIcon, EditIcon, TrashIcon, UserIcon, SearchIcon, BuildingIcon, LayersIcon, UsersIcon, ChevronDownIcon, PlusIcon, CameraIcon, UploadIcon, CheckIcon, ClockIcon, CalendarIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { TimePicker } from '../../components/TimePicker'
import { Snackbar } from '../../components/Snackbar'

import { auth, db, storage } from '../../firebase'
import { manageFacility, facilityActionError } from '../../services/facilityManagement'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  limit
} from 'firebase/firestore'
import { CropModal } from '../../components/CropModal'

type EntranceSide = 'top' | 'bottom' | 'left' | 'right'

interface MapBuilding {
  id: string
  buildingId: string
  x: number
  y: number
  w?: number
  h?: number
  entranceSide?: EntranceSide
  entranceSize?: number
  entrancePosition?: number
  colorIndex?: number
}

interface MapData {
  type: 'freeform'
  buildings: MapBuilding[]
}

type RoomStatus = 'Available' | 'Unavailable' | 'Maintenance'

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

const BOOKING_MINUTES_OPTIONS = ['30', '60', '90'] as const;

const LIQUID_OPTIONS = ['Water', 'Coffee', 'Blood', 'Mud', 'Slime', 'Random'] as const;
type DropdownLiquidType = typeof LIQUID_OPTIONS[number];
const LIQUID_ICONS: Record<DropdownLiquidType, string> = {
  Water: '💧',
  Coffee: '☕',
  Blood: '🩸',
  Mud: '🟤',
  Slime: '🦠',
  Random: '🎲'
};
type LiquidType = Exclude<DropdownLiquidType, 'Random'>;

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
  Unavailable: 'bg-amber-100 text-amber-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ROOM_AMENITIES = [
  'WiFi', 'Computer', 'Television', 'Projector', 'Whiteboard',
  'Air Conditioning', 'Sound System', 'Printer', 'Webcam',
  'Microphone', 'Ethernet', 'Speakers', 'HDMI Cable',
  'Charging Station', 'Video Conferencing'
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
  const { unreadRoomIds, markCommentsSeen, markCommentSeen, isCommentUnread } = useRoomCommentNotices(buildings.flatMap(building => building.rooms.map(room => room.id)))
  const [waterKey, setWaterKey] = useState(0)
  const [dismissedJars, setDismissedJars] = useState<Set<number>>(new Set())
  const [jars, setJars] = useState<Array<{ id: number, position: number, fillStatus: 'empty' | 'filling' | 'full' | 'labeled', buildingIndex: number, liquidType?: LiquidType }>>(() => {
    const saved = sessionStorage.getItem('rorms-jars');
    if (saved) {
      let parsed = JSON.parse(saved);
      let needsShift = false;

      parsed = parsed.map((j: any) => {
        if (j.fillStatus === 'filling') return { ...j, fillStatus: 'full' }; // instantly finish filling
        if (j.fillStatus === 'labeled' && j.position === 0) {
          needsShift = true; // instantly finish labeling/moving
        }
        return j;
      });

      if (needsShift) {
        parsed = parsed.map((j: any) => ({ ...j, position: j.position - 1 }));

        let buildingIdx = 40;
        const savedIdx = sessionStorage.getItem('rorms-nextBuildingIndex');
        if (savedIdx) buildingIdx = parseInt(savedIdx, 10);

        parsed.push({
          id: Date.now() + Math.random(),
          position: 19,
          fillStatus: 'empty',
          buildingIndex: buildingIdx
        });

        // Update sessionStorage so nextBuildingIndex initializes correctly on the next line
        sessionStorage.setItem('rorms-nextBuildingIndex', (buildingIdx + 1).toString());
      }

      return parsed;
    }
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i + 1,
      position: i,
      fillStatus: 'empty',
      buildingIndex: i + 20
    }));
  });

  const [nextBuildingIndex, setNextBuildingIndex] = useState(() => {
    const saved = sessionStorage.getItem('rorms-nextBuildingIndex');
    return saved ? parseInt(saved, 10) : 40;
  });

  const [isJarsMoving, setIsJarsMoving] = useState(false);
  const [hoveredJarId, setHoveredJarId] = useState<number | null>(null);
  const [isHoveringTooltipBlock, setIsHoveringTooltipBlock] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimeoutsRef = useRef<{ fill?: ReturnType<typeof setTimeout>, move?: ReturnType<typeof setTimeout>, stop?: ReturnType<typeof setTimeout> }>({});

  const [weatherData, setWeatherData] = useState<{ temp: number; code: number } | null>(null)
  const [timeOfDayOverride, setTimeOfDayOverride] = useState<TimeOfDay>('auto')
  const [moonPhaseOverride, setMoonPhaseOverride] = useState<MoonPhaseKey>('auto')
  const [supermanKey, setSupermanKey] = useState<number>(0)
  const [showTestButtons, setShowTestButtons] = useState(false)
  const [showFactoryControls, setShowFactoryControls] = useState<boolean>(() => JSON.parse(sessionStorage.getItem('rorms-factoryControls') || 'false'))
  const [isAutoMode, setIsAutoMode] = useState<boolean>(() => JSON.parse(sessionStorage.getItem('rorms-autoMode') || 'false'))
  const [selectedLiquid, setSelectedLiquid] = useState<DropdownLiquidType>(() => (sessionStorage.getItem('rorms-selectedLiquid') as DropdownLiquidType) || 'Random')

  const cycleTimeOfDay = () => {
    setTimeOfDayOverride(prev => {
      if (prev === 'auto') return 'dawn';
      if (prev === 'dawn') return 'day';
      if (prev === 'day') return 'sunset';
      if (prev === 'sunset') return 'night';
      return 'auto';
    });
  };

  const MOON_PHASE_SEQUENCE: MoonPhaseKey[] = [
    'auto',
    'new',
    'waxing_crescent',
    'first_quarter',
    'waxing_gibbous',
    'full',
    'waning_gibbous',
    'last_quarter',
    'waning_crescent'
  ];

  const cycleMoonPhase = () => {
    setMoonPhaseOverride(prev => {
      const idx = MOON_PHASE_SEQUENCE.indexOf(prev);
      const nextIdx = (idx + 1) % MOON_PHASE_SEQUENCE.length;
      return MOON_PHASE_SEQUENCE[nextIdx];
    });
  };

  const currentMoonInfo = useMemo(() => {
    const realMoon = getAstronomicalMoonPhase();
    if (moonPhaseOverride === 'auto') {
      return { name: realMoon.phaseName, emoji: realMoon.emoji };
    }
    const names: Record<MoonPhaseKey, { name: string; emoji: string }> = {
      auto: { name: realMoon.phaseName, emoji: realMoon.emoji },
      new: { name: 'New Moon', emoji: '🌑' },
      waxing_crescent: { name: 'Waxing Crescent', emoji: '🌒' },
      first_quarter: { name: 'First Quarter', emoji: '🌓' },
      waxing_gibbous: { name: 'Waxing Gibbous', emoji: '🌔' },
      full: { name: 'Full Moon', emoji: '🌕' },
      waning_gibbous: { name: 'Waning Gibbous', emoji: '🌖' },
      last_quarter: { name: 'Last Quarter', emoji: '🌗' },
      waning_crescent: { name: 'Waning Crescent', emoji: '🌘' }
    };
    return names[moonPhaseOverride];
  }, [moonPhaseOverride]);

  // Save state to sessionStorage
  useEffect(() => { sessionStorage.setItem('rorms-jars', JSON.stringify(jars)); }, [jars]);
  useEffect(() => { sessionStorage.setItem('rorms-nextBuildingIndex', nextBuildingIndex.toString()); }, [nextBuildingIndex]);
  useEffect(() => { sessionStorage.setItem('rorms-factoryControls', JSON.stringify(showFactoryControls)); }, [showFactoryControls]);
  useEffect(() => { sessionStorage.setItem('rorms-autoMode', JSON.stringify(isAutoMode)); }, [isAutoMode]);
  useEffect(() => { sessionStorage.setItem('rorms-selectedLiquid', selectedLiquid); }, [selectedLiquid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoTimeoutsRef.current.fill) clearTimeout(autoTimeoutsRef.current.fill);
      if (autoTimeoutsRef.current.move) clearTimeout(autoTimeoutsRef.current.move);
      if (autoTimeoutsRef.current.stop) clearTimeout(autoTimeoutsRef.current.stop);
    };
  }, []);

  // Auto Mode Logic
  useEffect(() => {
    if (!isAutoMode) {
      return;
    }

    if (isJarsMoving) return;

    const centerJar = jars.find(j => j.position === 0);
    if (!centerJar) return;

    if (centerJar.fillStatus === 'empty') {
      const actualLiquid: LiquidType = selectedLiquid === 'Random'
        ? ['Water', 'Coffee', 'Blood', 'Mud', 'Slime'][Math.floor(Math.random() * 5)] as LiquidType
        : selectedLiquid as LiquidType;

      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'filling', liquidType: actualLiquid } : j));
      setWaterKey(prev => prev + 1);

      autoTimeoutsRef.current.fill = setTimeout(() => {
        setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'full' } : j));
      }, 13500);
    }
    else if (centerJar.fillStatus === 'full') {
      setJars(prev => prev.map(j => j.id === centerJar.id ? { ...j, fillStatus: 'labeled' } : j));

      autoTimeoutsRef.current.move = setTimeout(() => {
        setIsJarsMoving(true);
        autoTimeoutsRef.current.stop = setTimeout(() => setIsJarsMoving(false), 2667);

        const newId = Date.now() + Math.random();
        setJars(prev => {
          const nextJars = prev.map(j => ({ ...j, position: j.position - 1 }));

          nextJars.push({
            id: newId,
            position: 19,
            fillStatus: 'empty',
            buildingIndex: nextBuildingIndex
          });

          setNextBuildingIndex(prev => prev + 1);

          return nextJars.filter(j => j.position >= -15);
        });
      }, 1000);
    }
  }, [isAutoMode, jars, isJarsMoving, nextBuildingIndex, selectedLiquid]);
  const [expandedBuildingIds, setExpandedBuildingIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('rorms_buildings_expanded')
    return saved ? JSON.parse(saved) : []
  })
  const isInitialLoad = useRef(true)
  const knownBuildingIds = useRef<Set<string>>(new Set())

  const [rooms, setRooms] = useState<Room[]>([])
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState('')

  const cycleWeather = () => {
    setWeatherData(prev => {
      if (!prev) return { temp: 28, code: 0 };
      if (prev.code === 0) return { temp: 26, code: 2 }; // Sunny -> Cloudy
      if (prev.code === 2) return { temp: 24, code: 61 }; // Cloudy -> Rain
      if (prev.code === 61) return { temp: 22, code: 95 }; // Rain -> Thunder
      return { temp: 32, code: 0 }; // Thunder -> Sunny
    });
  };

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=16.0433&longitude=120.3333&current_weather=true');
        const data = await res.json();
        if (data && data.current_weather) {
          setWeatherData({
            temp: data.current_weather.temperature,
            code: data.current_weather.weathercode
          });
        }
      } catch (err) {
        console.error("Failed to fetch weather", err);
      }
    };
    fetchWeather();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'campusMap'), (snap) => {
      if (snap.exists()) {
        setMapData(snap.data() as MapData)
      } else {
        setMapData(null)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    localStorage.setItem('rorms_buildings_expanded', JSON.stringify(expandedBuildingIds))
  }, [expandedBuildingIds])

  useEffect(() => {
    let unsubscribeMembership: (() => void) | undefined

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeMembership?.()

      if (!user) {
        setCurrentUserRole('')
        return
      }

      const membershipQuery = query(
        collection(db, 'memberships'),
        where('userId', '==', user.uid),
        limit(1)
      )

      unsubscribeMembership = onSnapshot(membershipQuery, (snapshot) => {
        setCurrentUserRole(snapshot.empty ? '' : snapshot.docs[0].data().role || '')
      })
    })

    return () => {
      unsubscribeAuth()
      unsubscribeMembership?.()
    }
  }, [])

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
  const [isRoomScheduleModalOpen, setIsRoomScheduleModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)
  const [selectedRoomForSchedule, setSelectedRoomForSchedule] = useState<Room | null>(null)
  const [isMultipleRooms, setIsMultipleRooms] = useState(false)
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null)
  const [roomModalStep, setRoomModalStep] = useState(1)

  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomCode, setNewRoomCode] = useState('')
  const [roomNamePrefix, setRoomNamePrefix] = useState('')
  const [roomCodePrefix, setRoomCodePrefix] = useState('')
  const formattedRoomNamePrefix = roomNamePrefix.trim() ? `${roomNamePrefix.trim()} ` : ''
  const [roomStartNumber, setRoomStartNumber] = useState('')
  const [roomEndNumber, setRoomEndNumber] = useState('')
  const [newRoomType, setNewRoomType] = useState('Lecture')
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

  const [bulkDeleteBuildingId, setBulkDeleteBuildingId] = useState<string | null>(null)
  const [selectedRoomIdsToDelete, setSelectedRoomIdsToDelete] = useState<Set<string>>(new Set())
  const [isBulkDeleteConfirmation, setIsBulkDeleteConfirmation] = useState(false)
  const [isDeletingRooms, setIsDeletingRooms] = useState(false)
  const bulkDeleteBuilding = buildings.find(building => building.id === bulkDeleteBuildingId)
  const selectedRoomsToDelete = bulkDeleteBuilding?.rooms.filter(room => selectedRoomIdsToDelete.has(room.id)) ?? []
  const bulkDeleteRoomsByFloor = (isBulkDeleteConfirmation ? selectedRoomsToDelete : bulkDeleteBuilding?.rooms ?? [])
    .reduce((groups, room) => {
      const floorRooms = groups.get(room.floor) ?? []
      floorRooms.push(room)
      groups.set(room.floor, floorRooms)
      return groups
    }, new Map<number, Room[]>())
  const bulkDeleteFloorGroups = Array.from(bulkDeleteRoomsByFloor).sort(([a], [b]) => a - b)

  const [isDeleteBuildingModalOpen, setIsDeleteBuildingModalOpen] = useState(false)
  const [buildingToDelete, setBuildingToDelete] = useState<Building | null>(null)
  const [isDeletingBuilding, setIsDeletingBuilding] = useState(false)
  const [confirmBuildingName, setConfirmBuildingName] = useState('')

  const [snackbar, setSnackbar] = useState<{
    isOpen: boolean
    message: string
    title?: string
    type: 'error' | 'warning' | 'info' | 'success' | 'brand'
  }>({
    isOpen: false,
    message: '',
    title: '',
    type: 'success'
  })

  const showNotification = (message: string, type: 'error' | 'warning' | 'info' | 'success' | 'brand' = 'success', title?: string) => {
    setSnackbar({
      isOpen: true,
      message,
      title,
      type
    })
  }

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
      const initialMin = String(room.minBookingMins || '30')
      setNewRoomMinBookingMins(BOOKING_MINUTES_OPTIONS.includes(initialMin as any) ? initialMin : '30')
      const initialMax = String(room.maxBookingMins || '90')
      setNewRoomMaxBookingMins(BOOKING_MINUTES_OPTIONS.includes(initialMax as any) ? initialMax : '90')
    } else {
      setEditingRoom(null)
      setIsMultipleRooms(false)
      setNewRoomName('')
      setNewRoomCode('')
      setRoomNamePrefix('')
      setRoomCodePrefix('')
      setRoomStartNumber('')
      setRoomEndNumber('')
      setNewRoomType('Lecture')
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
    setIsRoomScheduleModalOpen(false)
    setEditingBuilding(null)
    setEditingRoom(null)
    setSelectedRoomInfo(null)
    setSelectedRoomForSchedule(null)
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
      const roomName = roomToDelete.name
      const result = await manageFacility({ action: 'delete_room', targetId: roomToDelete.id })
      await Promise.all(result.deletedRooms
        .filter(deleted => !rooms.some(room => room.id !== deleted.id && room.image === deleted.image))
        .map(deleted => deleteImageFromStorage(deleted.image)))
      handleCloseDeleteRoomModal()
      showNotification(`Room "${roomName}" deleted successfully.`, 'success', 'Room Deleted')
    } catch (error) {
      console.error('Error deleting room:', error)
      showNotification(facilityActionError(error, 'Failed to delete room. Please try again.'), 'error', 'Error Deleting Room')
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
      const buildingName = buildingToDelete.name
      const result = await manageFacility({ action: 'delete_building', targetId: buildingToDelete.id })
      const deletedIds = new Set(result.deletedRooms.map(room => room.id))
      await Promise.all([...new Set(result.deletedRooms.map(room => room.image))]
        .filter(image => !rooms.some(room => !deletedIds.has(room.id) && room.image === image))
        .map(deleteImageFromStorage))
      handleCloseDeleteBuildingModal()
      showNotification(`Building "${buildingName}" and its rooms deleted successfully.`, 'success', 'Building Deleted')
    } catch (error) {
      console.error('Error deleting building:', error)
      showNotification(facilityActionError(error, 'Failed to delete building. Please try again.'), 'error', 'Error Deleting Building')
    } finally {
      setIsDeletingBuilding(false)
    }
  }

  const handleBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBuildingName.trim() || !newBuildingCode.trim()) {
      setErrors({ name: !newBuildingName.trim(), code: !newBuildingCode.trim(), start: false, end: false })
      if (!newBuildingName.trim() && !newBuildingCode.trim()) {
        showNotification('Building name and code are required.', 'error', 'Missing Information')
      } else if (!newBuildingName.trim()) {
        showNotification('Building name is required.', 'error', 'Missing Information')
      } else {
        showNotification('Building code is required.', 'error', 'Missing Information')
      }
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
      if (isDuplicateName && isDuplicateCode) {
        showNotification('A building with this name and code already exists.', 'warning', 'Duplicate Building')
      } else if (isDuplicateName) {
        showNotification('A building with this name already exists.', 'warning', 'Duplicate Building')
      } else {
        showNotification('A building with this code already exists.', 'warning', 'Duplicate Building')
      }
      return
    }

    setIsSubmitting(true)
    try {
      if (editingBuilding) {
        const result = await manageFacility({
          action: 'update_building', targetId: editingBuilding.id, data: { name: newBuildingName, code: newBuildingCode },
        })
        if (!result.changed) {
          handleCloseModals()
          showNotification('No building details changed.', 'info', 'No Changes')
          return
        }
        handleCloseModals()
        showNotification(`Building "${newBuildingName}" updated successfully.`, 'success', 'Building Updated')
      } else {
        const savedBuildingName = newBuildingName
        const docRef = doc(collection(db, 'buildings'))
        await manageFacility({ action: 'create_building', targetId: docRef.id, data: { name: newBuildingName, code: newBuildingCode } })

        // Close building modal first
        setIsBuildingModalOpen(false)
        setEditingBuilding(null)

        // Automatically open room modal for the new building
        handleOpenRoomModal(docRef.id)
        showNotification(`Building "${savedBuildingName}" created successfully. Add rooms to complete setup.`, 'success', 'Building Created')
      }
    } catch (error) {
      console.error("Error saving building: ", error)
      showNotification(facilityActionError(error, 'Failed to save building. Please try again.'), 'error', 'Error Saving Building')
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
          showNotification('Please fill in all required room fields.', 'error', 'Missing Information')
          return
        }

        // Check for uniqueness in range
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        const count = Math.abs(endNum - startNum) + 1
        const step = startNum <= endNum ? 1 : -1

        for (let i = 0; i < count; i++) {
          const currentNum = startNum + (i * step)
          const targetName = `${formattedRoomNamePrefix}${currentNum}`.trim().toLowerCase()
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
            showNotification(
              isDuplicateName
                ? `Room name "${formattedRoomNamePrefix}${currentNum}" already exists.`
                : `Room code "${roomCodePrefix}${currentNum}" already exists.`,
              'warning',
              'Duplicate Room'
            )
            return
          }
        }
      } else {
        if (!newRoomName.trim() || !newRoomCode.trim()) {
          setErrors({ name: !newRoomName.trim(), code: !newRoomCode.trim(), start: false, end: false })
          if (!newRoomName.trim() && !newRoomCode.trim()) {
            showNotification('Room name and code are required.', 'error', 'Missing Information')
          } else if (!newRoomName.trim()) {
            showNotification('Room name is required.', 'error', 'Missing Information')
          } else {
            showNotification('Room code is required.', 'error', 'Missing Information')
          }
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
          if (isDuplicateName && isDuplicateCode) {
            showNotification('A room with this name and code already exists.', 'warning', 'Duplicate Room')
          } else if (isDuplicateName) {
            showNotification('A room with this name already exists.', 'warning', 'Duplicate Room')
          } else {
            showNotification('A room with this code already exists.', 'warning', 'Duplicate Room')
          }
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
      showNotification('Maximum booking minutes must be greater than minimum booking minutes.', 'warning', 'Invalid Booking Limits')
      return
    }

    const [startH, startM] = (newRoomStartTime || '07:30').split(':').map(Number)
    const [endH, endM] = (newRoomEndTime || '18:00').split(':').map(Number)
    const startTotalMins = (startH || 0) * 60 + (startM || 0)
    const endTotalMins = (endH || 0) * 60 + (endM || 0)

    if (startTotalMins >= endTotalMins) {
      showNotification('Start time must be earlier than end time.', 'warning', 'Invalid Schedule Time')
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

      const roomData = {
        buildingId: activeBuildingId || '', type: newRoomType,
        floor: parseInt(newRoomFloor) || 0, capacity: parseInt(newRoomCapacity) || 0,
        status: newRoomStatus, description: newRoomDescription,
        amenities: newRoomAmenities, availableDays: newRoomAvailableDays,
        startTime: newRoomStartTime, endTime: newRoomEndTime,
        minBookingMins: min, maxBookingMins: max,
      }

      if (editingRoom) {
        const imageUrl = await uploadImage(editingRoom.id)
        const result = await manageFacility({
          action: 'update_room', targetId: editingRoom.id,
          data: { ...roomData, name: newRoomName, code: newRoomCode, image: imageUrl },
        })
        // Keep the old image until both the room update and its log have committed.
        if (isNewUpload && editingRoom.image !== imageUrl && !rooms.some(room => room.id !== editingRoom.id && room.image === editingRoom.image)) {
          await deleteImageFromStorage(editingRoom.image)
        }
        handleCloseModals()
        showNotification(result.changed ? `Room "${newRoomName}" updated successfully.` : 'No room details changed.', result.changed ? 'success' : 'info', result.changed ? 'Room Updated' : 'No Changes')
      } else {
        const savedRoomName = newRoomName
        const startNum = parseInt(roomStartNumber) || 0
        const endNum = parseInt(roomEndNumber) || 0
        const count = isMultipleRooms ? Math.abs(endNum - startNum) + 1 : 1
        const step = startNum <= endNum ? 1 : -1
        for (let i = 0; i < count; i++) {
          const currentNum = startNum + i * step
          const roomRef = doc(collection(db, 'rooms'))
          // Upload first so the creation event captures the final image in one record.
          const imageUrl = await uploadImage(roomRef.id)
          await manageFacility({
            action: 'create_room', targetId: roomRef.id,
            data: { ...roomData, image: imageUrl,
              name: isMultipleRooms ? `${formattedRoomNamePrefix}${currentNum}` : newRoomName,
              code: isMultipleRooms ? `${roomCodePrefix}${currentNum}` : newRoomCode,
            },
          })
        }
        handleCloseModals()
        showNotification(isMultipleRooms ? `Successfully added ${count} rooms.` : `Room "${savedRoomName}" added successfully.`, 'success', isMultipleRooms ? 'Rooms Added' : 'Room Added')
      }
    } catch (error) {
      console.error("Error saving room: ", error)
      showNotification(facilityActionError(error, 'Failed to save room. Please try again.'), 'error', 'Error Saving Room')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenBulkDeleteRooms = (building: Building) => {
    setBulkDeleteBuildingId(building.id)
    setSelectedRoomIdsToDelete(new Set())
    setIsBulkDeleteConfirmation(false)
  }

  const handleCloseBulkDeleteRooms = () => {
    setBulkDeleteBuildingId(null)
    setSelectedRoomIdsToDelete(new Set())
    setIsBulkDeleteConfirmation(false)
  }

  const handleBulkDeleteRoomsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageBuildings || !bulkDeleteBuilding || selectedRoomsToDelete.length === 0 || isDeletingRooms) return

    if (!isBulkDeleteConfirmation) {
      setIsBulkDeleteConfirmation(true)
      return
    }

    setIsDeletingRooms(true)
    const deletedRooms: Array<{ id: string; image: string }> = []
    try {
      for (let offset = 0; offset < selectedRoomsToDelete.length; offset += 200) {
        const chunk = selectedRoomsToDelete.slice(offset, offset + 200)
        const result = await manageFacility({ action: 'delete_rooms', buildingId: bulkDeleteBuilding.id, roomIds: chunk.map(room => room.id) })
        deletedRooms.push(...result.deletedRooms)
        setSelectedRoomIdsToDelete(prev => {
          const remaining = new Set(prev)
          chunk.forEach(room => remaining.delete(room.id))
          return remaining
        })
      }

      handleCloseBulkDeleteRooms()
      showNotification(`${deletedRooms.length} rooms deleted from "${bulkDeleteBuilding.name}".`, 'success', 'Rooms Deleted')
    } catch (error) {
      console.error('Error deleting rooms:', error)
      setIsBulkDeleteConfirmation(false)
      showNotification(
        deletedRooms.length > 0
          ? `${deletedRooms.length} rooms deleted. The remaining selected rooms could not be deleted. Please try again.`
          : 'Failed to delete the selected rooms. Please try again.',
        'error',
        'Error Deleting Rooms'
      )
    } finally {
      // Clean up images only after their room records were successfully deleted.
      const deletedIds = new Set(deletedRooms.map(room => room.id))
      const imageUrls = new Set(deletedRooms.map(room => room.image))
      await Promise.all(Array.from(imageUrls)
        .filter(imageUrl => !rooms.some(room => !deletedIds.has(room.id) && room.image === imageUrl))
        .map(deleteImageFromStorage))
      setIsDeletingRooms(false)
    }
  }

  const canManageBuildings = currentUserRole === 'Admin' || currentUserRole === 'Registrar' || currentUserRole === 'University Administrator'


  const availableRoomsCount = rooms.filter(room => room.status === 'Available').length
  const totalCapacity = buildings.reduce((sum, building) => sum + (building.capacity || 0), 0)

  return (
    <section
      className="h-screen overflow-y-scroll overflow-x-hidden custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8"
      onClick={() => setOpenMenuId(null)}
    >
      {/* Create/Edit Building Modal */}
      {isBuildingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
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
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-visible"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white rounded-t-2xl">
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
                    <div className="flex p-1 bg-gray-100 rounded-xl mb-6">
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(false)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${!isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Single Room
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMultipleRooms(true)}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${isMultipleRooms ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                              setRoomNamePrefix(val.toUpperCase())
                              if (errors.name) setErrors(prev => ({ ...prev, name: false }))
                            }}
                            placeholder="e.g. PTC"
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
                              setRoomCodePrefix(val.toUpperCase())
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
                          <NumberInput
                            id="room-start-number"
                            value={roomStartNumber}
                            onChange={(val) => {
                              setRoomStartNumber(val)
                              if (errors.start) setErrors(prev => ({ ...prev, start: false }))
                            }}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 101"
                            error={errors.start}
                          />
                        </div>
                        <div>
                          <label htmlFor="room-end-number" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                            End Number <span className="text-rose-500">*</span>
                          </label>
                          <NumberInput
                            id="room-end-number"
                            value={roomEndNumber}
                            onChange={(val) => {
                              setRoomEndNumber(val)
                              if (errors.end) setErrors(prev => ({ ...prev, end: false }))
                            }}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="e.g. 105"
                            error={errors.end}
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
                              if (s === e) return `${formattedRoomNamePrefix}${s}`
                              const diff = Math.abs(e - s)
                              const step = s < e ? 1 : -1
                              const next = s + step
                              if (diff === 1) return `${formattedRoomNamePrefix}${s}, ${formattedRoomNamePrefix}${e}`
                              return <>{formattedRoomNamePrefix}{s}, {formattedRoomNamePrefix}{next}, ..., {formattedRoomNamePrefix}{e}</>
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
                        options={['Lecture', 'Laboratory', 'Meeting Room', 'Studio', 'Administrative']}
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
                        options={['Available', 'Unavailable', 'Maintenance']}
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
                        className={`w-full aspect-square rounded-md border-2 border-dashed flex items-center justify-center overflow-hidden transition-all group relative shadow-sm ${isDraggingRoomImage
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
                          className={`flex-1 flex flex-col items-center justify-center rounded-xl border py-2 text-[0.625rem] font-bold uppercase transition cursor-pointer ${newRoomAvailableDays.includes(day)
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
                        onChange={(val) => {
                          setNewRoomStartTime(val)
                          if (val && newRoomEndTime) {
                            const [sh, sm] = val.split(':').map(Number)
                            const [eh, em] = newRoomEndTime.split(':').map(Number)
                            const sMins = (sh || 0) * 60 + (sm || 0)
                            const eMins = (eh || 0) * 60 + (em || 0)
                            if (sMins >= eMins) {
                              const nextEndMins = Math.min(1080, sMins + 30)
                              const endHour = Math.floor(nextEndMins / 60).toString().padStart(2, '0')
                              const endMin = (nextEndMins % 60).toString().padStart(2, '0')
                              setNewRoomEndTime(`${endHour}:${endMin}`)
                            }
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        minuteStep={30}
                        hideClear
                        minTime="07:30"
                        maxTime={(() => {
                          if (!newRoomEndTime) return '17:30'
                          const [eh, em] = newRoomEndTime.split(':').map(Number)
                          const maxStartMins = Math.max(450, ((eh || 0) * 60 + (em || 0)) - 30)
                          const h = Math.floor(maxStartMins / 60).toString().padStart(2, '0')
                          const m = (maxStartMins % 60).toString().padStart(2, '0')
                          return `${h}:${m}`
                        })()}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        End Time
                      </label>
                      <TimePicker
                        value={newRoomEndTime}
                        onChange={(val) => {
                          setNewRoomEndTime(val)
                          if (val && newRoomStartTime) {
                            const [sh, sm] = newRoomStartTime.split(':').map(Number)
                            const [eh, em] = val.split(':').map(Number)
                            const sMins = (sh || 0) * 60 + (sm || 0)
                            const eMins = (eh || 0) * 60 + (em || 0)
                            if (eMins <= sMins) {
                              const nextStartMins = Math.max(450, eMins - 30)
                              const startHour = Math.floor(nextStartMins / 60).toString().padStart(2, '0')
                              const startMin = (nextStartMins % 60).toString().padStart(2, '0')
                              setNewRoomStartTime(`${startHour}:${startMin}`)
                            }
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        minuteStep={30}
                        hideClear
                        defaultPlacement="latest"
                        minTime={(() => {
                          if (!newRoomStartTime) return '08:00'
                          const [sh, sm] = newRoomStartTime.split(':').map(Number)
                          const minEndMins = Math.min(1080, ((sh || 0) * 60 + (sm || 0)) + 30)
                          const h = Math.floor(minEndMins / 60).toString().padStart(2, '0')
                          const m = (minEndMins % 60).toString().padStart(2, '0')
                          return `${h}:${m}`
                        })()}
                        maxTime="18:00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 overflow-visible">
                    <div className="overflow-visible">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Min Booking (Mins)
                      </label>
                      <SingleSelectDropdown
                        options={BOOKING_MINUTES_OPTIONS}
                        value={newRoomMinBookingMins}
                        onChange={(val) => {
                          setNewRoomMinBookingMins(val)
                          if (parseInt(newRoomMaxBookingMins) < parseInt(val)) {
                            setNewRoomMaxBookingMins(val)
                          }
                        }}
                        onToggle={handleDropdownToggle}
                        className="w-full"
                      />
                    </div>
                    <div className="overflow-visible">
                      <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                        Max Booking (Mins)
                      </label>
                      <SingleSelectDropdown
                        options={BOOKING_MINUTES_OPTIONS.filter(o => parseInt(o) >= parseInt(newRoomMinBookingMins))}
                        value={newRoomMaxBookingMins}
                        onChange={setNewRoomMaxBookingMins}
                        onToggle={handleDropdownToggle}
                        className="w-full"
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
        hasUnreadComments={selectedRoomInfo ? unreadRoomIds.has(selectedRoomInfo.id) : false}
        comments={selectedRoomInfo ? isVisible => <RoomComments key={selectedRoomInfo.id} roomId={selectedRoomInfo.id} isVisible={isVisible} onCommentsSeen={markCommentsSeen} onCommentSeen={markCommentSeen} isCommentUnread={isCommentUnread} canModerateComments={currentUserRole === 'Admin' || currentUserRole === 'Registrar' || currentUserRole === 'University Administrator'} /> : undefined}
        actionButton={
          <Button
            variant="brand"
            icon={<CalendarIcon className="h-4 w-4" />}
            className="flex-1"
            onClick={() => {
              if (!selectedRoomInfo) return
              setSelectedRoomForSchedule(selectedRoomInfo)
              setIsRoomScheduleModalOpen(true)
              setIsRoomInfoModalOpen(false)
            }}
          >
            Room Schedule
          </Button>
        }
      />

      {/* Room Schedule Timetable Modal */}
      <RoomScheduleModal
        key={selectedRoomForSchedule?.id ?? 'room-schedule'}
        isOpen={isRoomScheduleModalOpen}
        room={rooms.find(room => room.id === selectedRoomForSchedule?.id) ?? selectedRoomForSchedule}
        buildingName={
          buildings.find(b => b.rooms.some(r => r.id === selectedRoomForSchedule?.id))?.name
        }
        forceFullDaySchedule={true}
        onClose={handleCloseModals}
        onBack={() => {
          setIsRoomScheduleModalOpen(false)
          if (selectedRoomForSchedule) {
            setSelectedRoomInfo(selectedRoomForSchedule)
            setIsRoomInfoModalOpen(true)
          }
        }}
      />

      {/* Delete Room Confirmation Modal */}
      {isDeleteRoomModalOpen && roomToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-bold">Delete Room</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this room from the system?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
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

              <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this room and all its associated booking history. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteRoomSubmit} className="space-y-4 pt-2">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDeleteRoomModal}
                    disabled={isDeletingRoom}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isDeletingRoom}
                    className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                  >
                    {isDeletingRoom ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
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

      {bulkDeleteBuilding && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingRooms) handleCloseBulkDeleteRooms()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-rooms-title"
            className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !isDeletingRooms) handleCloseBulkDeleteRooms()
            }}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 id="bulk-delete-rooms-title" className="text-xl font-bold">Delete Rooms</h3>
              <p className="mt-1 text-sm text-white/80">
                {isBulkDeleteConfirmation ? 'Confirm the rooms you want to delete.' : 'Select rooms to delete from this building.'}
              </p>
            </div>

            <form onSubmit={handleBulkDeleteRoomsSubmit} className="p-6 space-y-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-bold text-gray-900 truncate">{bulkDeleteBuilding.name}</p>
                <p className="mt-1 text-xs font-medium text-gray-500">
                  {selectedRoomsToDelete.length} of {bulkDeleteBuilding.rooms.length} rooms selected
                </p>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                {bulkDeleteFloorGroups.map(([floor, floorRooms]) => {
                  const selectedCount = floorRooms.filter(room => selectedRoomIdsToDelete.has(room.id)).length
                  return (
                    <div key={floor} className="divide-y divide-gray-100">
                      <label className="flex items-center gap-3 p-3 text-sm font-semibold text-gray-700 bg-gray-50">
                        {!isBulkDeleteConfirmation && (
                          <input
                            type="checkbox"
                            aria-label={`Select all rooms on Floor ${floor}`}
                            checked={selectedCount === floorRooms.length}
                            ref={(element) => {
                              if (element) element.indeterminate = selectedCount > 0 && selectedCount < floorRooms.length
                            }}
                            disabled={isDeletingRooms}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setSelectedRoomIdsToDelete(prev => {
                                const next = new Set(prev)
                                floorRooms.forEach(room => {
                                  if (checked) next.add(room.id)
                                  else next.delete(room.id)
                                })
                                return next
                              })
                            }}
                            className="h-4 w-4 shrink-0 accent-[var(--brand-color)]"
                          />
                        )}
                        <span className="min-w-0 flex-1">Floor {floor}</span>
                        <span className="text-xs font-medium text-gray-500">
                          {selectedCount} / {floorRooms.length}
                        </span>
                      </label>
                      {floorRooms.map(room => (
                        <label key={room.id} className="flex items-center gap-3 p-3 text-sm text-gray-700">
                          {!isBulkDeleteConfirmation && (
                            <input
                              type="checkbox"
                              checked={selectedRoomIdsToDelete.has(room.id)}
                              disabled={isDeletingRooms}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setSelectedRoomIdsToDelete(prev => {
                                  const next = new Set(prev)
                                  if (checked) next.add(room.id)
                                  else next.delete(room.id)
                                  return next
                                })
                              }}
                              className="h-4 w-4 shrink-0 accent-[var(--brand-color)]"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block font-semibold truncate">{room.name}</span>
                            <span className="block text-xs text-gray-500 truncate">{room.type}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )
                })}
                {bulkDeleteBuilding.rooms.length === 0 && (
                  <p className="p-4 text-sm text-gray-500">This building has no rooms to delete.</p>
                )}
              </div>

              {isBulkDeleteConfirmation && (
                <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                  <p className="text-xs leading-relaxed text-rose-700">
                    This will permanently delete the {selectedRoomsToDelete.length} selected rooms. The building will be kept. This action cannot be undone.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDeletingRooms}
                  onClick={() => {
                    if (isBulkDeleteConfirmation) setIsBulkDeleteConfirmation(false)
                    else handleCloseBulkDeleteRooms()
                  }}
                  className="flex-1"
                >
                  {isBulkDeleteConfirmation ? 'Back' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  disabled={isDeletingRooms || selectedRoomsToDelete.length === 0}
                  className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                >
                  {isDeletingRooms ? 'Deleting...' : isBulkDeleteConfirmation ? 'Confirm Delete' : 'Delete Selected'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Building Confirmation Modal */}
      {isDeleteBuildingModalOpen && buildingToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white">
              <h3 className="text-xl font-bold">Delete Building</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to delete this building from the system?</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 shrink-0">
                  <BuildingIcon className="h-7 w-7 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{buildingToDelete.name}</p>
                  <p className="text-xs font-medium text-gray-500">{buildingToDelete.code} • {buildingToDelete.rooms.length} Rooms</p>
                </div>
              </div>

              <div className="rounded-xl bg-rose-50 p-4 border border-rose-100">
                <p className="text-xs leading-relaxed text-rose-700">
                  <span className="font-bold uppercase tracking-wider">Warning:</span> This action will permanently delete this building and all rooms associated with it. This action cannot be undone.
                </p>
              </div>

              <form onSubmit={handleDeleteBuildingSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="confirm-building-name" className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
                      To confirm, please type:
                    </label>
                    <p className="text-sm font-bold text-rose-600 mb-2">
                      "{buildingToDelete.name}"
                    </p>
                    <TextInput
                      id="confirm-building-name"
                      value={confirmBuildingName}
                      onChange={(val) => setConfirmBuildingName(val)}
                      placeholder="Enter building name"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseDeleteBuildingModal}
                    disabled={isDeletingBuilding}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isDeletingBuilding || confirmBuildingName !== buildingToDelete.name}
                    className="flex-1 !bg-rose-600 hover:!bg-rose-700 !text-white shadow-md shadow-rose-600/20 hover:shadow-lg"
                  >
                    {isDeletingBuilding ? 'Deleting...' : 'Confirm Delete'}
                  </Button>
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

      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="Buildings & Rooms"
          description="Manage campus facilities, view room capacities, and track utilization."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
          <SummaryCard
            className="animate-in"
            title="Available Rooms"
            subtitle={`${availableRoomsCount} currently ready to book`}
            icon={<DoorIcon className="w-5 h-5 text-emerald-600" />}
            gradientClasses="from-emerald-200 to-emerald-100"
            outlineClasses="bg-emerald-500"
            blobClasses="bg-emerald-500/5"
          >
            <SummaryGraph variant="pie" total={availableRoomsCount} points={[
              { label: 'Available', value: availableRoomsCount },
              { label: 'Unavailable', value: rooms.filter(room => room.status === 'Unavailable').length },
              { label: 'Maintenance', value: rooms.filter(room => room.status === 'Maintenance').length },
            ]} tone="emerald" />
          </SummaryCard>

          <SummaryCard
            className="animate-in"
            title="Total Buildings"
            subtitle={`${buildings.length} campus facilities managed`}
            icon={<BuildingIcon className="w-5 h-5 text-amber-600" />}
            gradientClasses="from-amber-200 to-amber-100"
            outlineClasses="bg-amber-500"
            blobClasses="bg-amber-500/5"
          >
            <SummaryGraph variant="bar" total={buildings.length} points={buildings.map(building => ({ label: building.code || building.name, value: building.rooms.length, tooltipLabel: 'Rooms' }))} unit="buildings" tone="amber" />
          </SummaryCard>

          <SummaryCard
            className="animate-in"
            title="Total Capacity"
            subtitle={`${totalCapacity} maximum campus seats`}
            icon={<UsersIcon className="w-5 h-5 text-sky-600" />}
            gradientClasses="from-sky-200 to-sky-100"
            outlineClasses="bg-sky-500"
            blobClasses="bg-sky-500/5"
          >
            <SummaryGraph variant="line" total={totalCapacity} points={buildings.map(building => ({ label: building.code || building.name, value: building.capacity, tooltipLabel: 'Capacity' }))} unit="seats" tone="sky" />
          </SummaryCard>
        </div>



        <BuildingBrowser
          buildings={buildings}
          unreadCommentRoomIds={unreadRoomIds}
          buildingOptions={Array.from(new Set(buildings.map(b => b.code).filter(Boolean))).sort()}
          expandedBuildingIds={expandedBuildingIds}
          onToggleBuilding={toggleBuilding}
          onRoomClick={handleOpenRoomInfoModal}
          isLoading={isInitialLoad.current}
          actionButton={
            <div className="flex gap-2 w-full lg:w-auto">
              {showTestButtons && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    onClick={() => setSupermanKey(prev => prev + 1)}
                    className="shrink-0 text-slate-500 hover:text-blue-600 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">🦸‍♂️</span>}
                    label="Test Superman"
                    title="Test Superman"
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleWeather}
                    className="shrink-0 text-slate-500 hover:text-amber-500 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">🌤️</span>}
                    label="Test Weather"
                    title="Test Weather"
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleTimeOfDay}
                    className="shrink-0 text-slate-500 hover:text-indigo-600 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">{timeOfDayOverride === 'night' ? '🌙' : timeOfDayOverride === 'sunset' ? '🌇' : timeOfDayOverride === 'dawn' ? '🌅' : timeOfDayOverride === 'day' ? '☀️' : '🕒'}</span>}
                    label={`Time: ${timeOfDayOverride}`}
                    title={`Cycle Time of Day (Current: ${timeOfDayOverride})`}
                  />
                  <IconOnlyButton
                    variant="outline"
                    onClick={cycleMoonPhase}
                    className="shrink-0 text-slate-500 hover:text-amber-500 border-slate-200 shadow-sm bg-white"
                    icon={<span className="text-xl leading-none">{currentMoonInfo.emoji}</span>}
                    label={`Moon: ${currentMoonInfo.name}`}
                    title={`Cycle Moon Phase (Current: ${currentMoonInfo.name}${moonPhaseOverride === 'auto' ? ' [Real Date]' : ''})`}
                  />
                </>
              )}
              {showFactoryControls && (
                <>
                  <IconOnlyButton
                    variant="outline"
                    onClick={() => {
                      const currentIndex = LIQUID_OPTIONS.indexOf(selectedLiquid);
                      const nextIndex = (currentIndex + 1) % LIQUID_OPTIONS.length;
                      setSelectedLiquid(LIQUID_OPTIONS[nextIndex]);
                    }}
                    className="shrink-0 text-slate-500 hover:text-slate-700 border-slate-200 shadow-sm bg-white z-20"
                    icon={<span className="text-xl leading-none">{LIQUID_ICONS[selectedLiquid]}</span>}
                    label={`Liquid: ${selectedLiquid}`}
                    title={`Selected Liquid: ${selectedLiquid}`}
                  />
                  <IconOnlyButton
                    variant={isAutoMode ? "brand" : "outline"}
                    onClick={() => setIsAutoMode(!isAutoMode)}
                    className={`shrink-0 shadow-sm ${isAutoMode ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-white text-slate-500 hover:text-emerald-600'}`}
                    icon={<span className="text-xl leading-none">{isAutoMode ? '⏸️' : '▶️'}</span>}
                    label={isAutoMode ? 'Stop Auto' : 'Auto Fill'}
                    title={isAutoMode ? 'Stop Auto' : 'Auto Fill'}
                  />
                </>
              )}
              {canManageBuildings && (
                <Button
                  variant="brand"
                  icon={<PlusIcon className="h-4 w-4" />}
                  onClick={() => handleOpenBuildingModal()}
                  className="w-full lg:w-auto"
                >
                  Add Building
                </Button>
              )}
            </div>
          }
          renderBuildingActions={canManageBuildings ? (building) => (
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
                  className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
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
                    disabled={building.rooms.length === 0}
                    className="flex w-full items-center gap-2 border-t border-gray-50 px-4 py-3 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 disabled:cursor-default"
                    onClick={() => {
                      handleOpenBulkDeleteRooms(building)
                      setOpenMenuId(null)
                    }}
                  >
                    <TrashIcon className="h-4 w-4 text-rose-400" />
                    Delete Rooms
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
          ) : undefined}
          renderRoomActions={canManageBuildings ? (room, buildingId) => (
            <div className="relative">
              <IconButton
                label="Room options"
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenuId(openMenuId === room.id ? null : room.id)
                }}
                className="h-8 w-8 shrink-0 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all duration-200"
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </IconButton>

              {openMenuId === room.id && (
                <div
                  className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
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
          ) : undefined}
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

      <Snackbar
        isOpen={snackbar.isOpen}
        onClose={() => setSnackbar(prev => ({ ...prev, isOpen: false }))}
        title={snackbar.title}
        message={snackbar.message}
        type={snackbar.type}
        position="top-center"
      />
    </section>
  )
}

export default BuildingsRoomsPage
