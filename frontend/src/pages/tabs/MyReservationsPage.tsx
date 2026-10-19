import { useState, useEffect, useMemo } from 'react'
import { SectionHeader } from '../../components/SectionHeader'
import { ClockIcon, UserIcon, DoorIcon, SearchIcon, CalendarIcon, PlusIcon, HourglassIcon, TrashIcon, UploadIcon } from '../../components/Icons'
import { IconButton } from '../../components/IconButton'
import { Button } from '../../components/Button'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { ReservationInfoModal } from '../../components/ReservationInfoModal'
import { ReservationEvidenceGallery, type EvidenceGalleryItem } from '../../components/ReservationEvidenceGallery'
import { ReservationReviewIndicators } from '../../components/ReservationReviewIndicators'
import { reservationReviewStep, RESERVATION_REVIEW_STEPS } from '../../utils/reservationReviewStep'
import { ConfirmModal } from '../../components/ConfirmModal'
import { RoomScheduleModal } from '../../components/RoomScheduleModal'
import { useSnackbar } from '../../components/Snackbar'
import { db, auth, storage } from '../../firebase'
import { hasReservationEvidence, reservationDisplayStatus, reservationEvidenceFiles, type ReservationEvidenceFile } from '../../utils/reservationEvidence'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { 
  collection, 
  getDoc,
  onSnapshot, 
  query, 
  where,
  doc,
  updateDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'

type ReservationStatus = 'Pending' | 'Approved' | 'Declined' | 'Cancelled' | 'Completed'

interface Reservation {
  id: string
  roomId: string
  buildingId: string
  userId: string
  date: string
  startTime: string
  endTime: string
  duration: number
  attendees?: number
  attendeeNames?: string[]
  purpose: string
  requestType?: 'Standard' | 'Extended'
  subjectCode?: string
  classSection?: string
  department?: string
  status: ReservationStatus
  deanRecommend?: boolean
  registrarRecommend?: boolean
  universityAdministratorRecommend?: boolean
  declinedByRole?: string
  autoProcessed?: boolean
  evidencePath?: string
  evidenceType?: 'image' | 'video'
  evidenceFileName?: string
  evidenceSubmittedAt?: { toDate: () => Date }
  evidenceFiles?: ReservationEvidenceFile[]
  createdAt: any
  updatedAt: any
  isHidden?: boolean
}

type RoomStatus = 'Available' | 'Unavailable' | 'Maintenance'

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
  buildingId: string
}

interface Building {
  id: string
  name: string
  code: string
}

const roomStatusClasses: Record<RoomStatus, string> = {
  Available: 'bg-emerald-100 text-emerald-700',
  Unavailable: 'bg-amber-100 text-amber-700',
  Maintenance: 'bg-rose-100 text-rose-700',
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
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

const EVIDENCE_TYPES: Record<string, { kind: 'image' | 'video'; extension: string }> = {
  'image/jpeg': { kind: 'image', extension: 'jpg' },
  'image/png': { kind: 'image', extension: 'png' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/webm': { kind: 'video', extension: 'webm' },
  'video/quicktime': { kind: 'video', extension: 'mov' },
}
const MAX_EVIDENCE_BYTES = 100 * 1024 * 1024
const evidenceFileKey = (file: File) => `${file.name}\0${file.size}\0${file.lastModified}\0${file.type}`

const reservationTimeInManila = (date: string, time: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) return NaN
  return Date.parse(`${date}T${time.slice(0, 5)}:00+08:00`)
}

const formatReservationDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
  timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric'
})

function MyReservationsPage(_props: { userRole: string }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [reservationsLoading, setReservationsLoading] = useState(true)
  const [reservationsError, setReservationsError] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [rooms, setRooms] = useState<Record<string, Room>>({})
  const [buildings, setBuildings] = useState<Record<string, Building>>({})
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedReviewSteps, setSelectedReviewSteps] = useState<string[]>([])
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])

  const { showSnackbar } = useSnackbar()

  const [isRoomInfoModalOpen, setIsRoomInfoModalOpen] = useState(false)
  const [selectedRoomInfo, setSelectedRoomInfo] = useState<Room | null>(null)

  const [isRoomScheduleModalOpen, setIsRoomScheduleModalOpen] = useState(false)
  const [selectedRoomForSchedule, setSelectedRoomForSchedule] = useState<Room | null>(null)

  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [evidenceReservation, setEvidenceReservation] = useState<Reservation | null>(null)
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidencePreviews, setEvidencePreviews] = useState<EvidenceGalleryItem[]>([])
  const [evidenceInputKey, setEvidenceInputKey] = useState(0)
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false)
  const [evidenceUploadError, setEvidenceUploadError] = useState('')

  const currentSelectedReservation = reservations.find(item => item.id === selectedReservation?.id) || selectedReservation
  const latestEvidenceReservation = reservations.find(item => item.id === evidenceReservation?.id)
  const currentEvidenceReservation = latestEvidenceReservation && evidenceReservation
    && reservationEvidenceFiles(latestEvidenceReservation).length >= reservationEvidenceFiles(evidenceReservation).length
    ? latestEvidenceReservation : evidenceReservation

  useEffect(() => {
    const previews = evidenceFiles.map(file => ({
      path: '',
      previewUrl: URL.createObjectURL(file),
      type: EVIDENCE_TYPES[file.type].kind,
      fileName: file.name,
    }))
    setEvidencePreviews(previews)
    return () => { previews.forEach(preview => URL.revokeObjectURL(preview.previewUrl)) }
  }, [evidenceFiles])

  const openEvidenceUpload = (reservation: Reservation) => {
    setIsReservationModalOpen(false)
    setEvidenceReservation(reservation)
    setEvidenceFiles([])
    setEvidenceInputKey(key => key + 1)
    setEvidenceUploadError('')
  }

  const submitEvidence = async () => {
    if (!evidenceReservation || evidenceFiles.length === 0 || isUploadingEvidence) return
    if (evidenceFiles.length > 10 || evidenceFiles.some(file => !EVIDENCE_TYPES[file.type] || file.size === 0 || file.size > MAX_EVIDENCE_BYTES)) {
      setEvidenceUploadError('Choose up to 10 JPG, PNG, WebP, MP4, WebM, or MOV files, each up to 100 MB.')
      return
    }
    const userId = auth.currentUser?.uid
    if (!userId || userId !== evidenceReservation.userId) {
      setEvidenceUploadError('Sign in as the requester to upload evidence.')
      return
    }

    setIsUploadingEvidence(true)
    setEvidenceUploadError('')
    const uploadedFiles: ReservationEvidenceFile[] = []
    try {
      for (const file of evidenceFiles) {
        const fileType = EVIDENCE_TYPES[file.type]
        const path = `reservation-evidence/${evidenceReservation.id}/${crypto.randomUUID()}.${fileType.extension}`
        const upload = await uploadBytes(ref(storage, path), file, { contentType: file.type })
        uploadedFiles.push({ path, type: fileType.kind, fileName: file.name.slice(0, 255), uploadedAt: upload.metadata.timeCreated })
      }
      await runTransaction(db, async transaction => {
        const reservationRef = doc(db, 'reservations', evidenceReservation.id)
        const snapshot = await transaction.get(reservationRef)
        const record = snapshot.data()
        if (!record || record.userId !== auth.currentUser?.uid || record.status !== 'Completed') {
          throw new Error('This reservation can no longer accept evidence. Reload and try again.')
        }
        const existingFiles = Array.isArray(record.evidenceFiles) ? record.evidenceFiles : []
        transaction.update(reservationRef, {
          evidenceFiles: [...existingFiles, ...uploadedFiles],
          updatedAt: serverTimestamp(),
        })
      })
      setEvidenceReservation(previous => previous ? { ...previous, evidenceFiles: [...(previous.evidenceFiles || []), ...uploadedFiles] } : null)
      setEvidenceFiles([])
      setEvidenceInputKey(key => key + 1)
      showSnackbar({ message: `${uploadedFiles.length} evidence ${uploadedFiles.length === 1 ? 'file' : 'files'} uploaded.`, type: 'success' })
    } catch (error) {
      if (uploadedFiles.length > 0) {
        try {
          const saved = await getDoc(doc(db, 'reservations', evidenceReservation.id))
          const savedPaths = new Set(reservationEvidenceFiles(saved.data() || {}).map(file => file.path))
          await Promise.all(uploadedFiles.filter(file => !savedPaths.has(file.path)).map(file => deleteObject(ref(storage, file.path)).catch(() => undefined)))
        } catch {
          // Keep uploaded files if their database references cannot be checked.
        }
      }
      setEvidenceUploadError(error instanceof Error ? error.message : 'Could not upload evidence. Please try again.')
    } finally {
      setIsUploadingEvidence(false)
    }
  }

  const handleOpenRoomInfoModal = (room: Room) => {
    setSelectedRoomInfo(room)
    setIsRoomInfoModalOpen(true)
  }

  const handleCloseModals = () => {
    setIsRoomInfoModalOpen(false)
    setSelectedRoomInfo(null)
    setIsReservationModalOpen(false)
    setSelectedReservation(null)
    setIsRoomScheduleModalOpen(false)
    setSelectedRoomForSchedule(null)
  }

  useEffect(() => {
    const userId = auth.currentUser?.uid
    if (!userId) {
      setReservationsLoading(false)
      return
    }

    const reservationsQuery = query(
      collection(db, 'reservations'),
      where('userId', '==', userId)
    )

    const statusOrder: Record<ReservationStatus, number> = {
      Pending: 0,
      Approved: 1,
      Declined: 2,
      Cancelled: 3,
      Completed: 4,
    }

    const unsubscribeReservations = onSnapshot(reservationsQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reservation))
      // Sort by status, then date (asc), then startTime (asc)
      list.sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status]
        if (statusDiff !== 0) return statusDiff

        const dateDiff = a.date.localeCompare(b.date)
        if (dateDiff !== 0) return dateDiff

        return a.startTime.localeCompare(b.startTime)
      })
      setReservations(list)
      setSelectedReservation(previous => previous ? list.find(reservation => reservation.id === previous.id) ?? previous : null)
      setReservationsLoading(false)
      setReservationsError(false)
    }, () => {
      setReservations([])
      setReservationsLoading(false)
      setReservationsError(true)
    })

    const unsubscribeRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const map: Record<string, Room> = {}
      snapshot.docs.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() } as Room
      })
      setRooms(map)
    })

    const unsubscribeBuildings = onSnapshot(collection(db, 'buildings'), (snapshot) => {
      const map: Record<string, Building> = {}
      snapshot.docs.forEach(doc => {
        map[doc.id] = { id: doc.id, ...doc.data() } as Building
      })
      setBuildings(map)
    })

    return () => {
      unsubscribeReservations()
      unsubscribeRooms()
      unsubscribeBuildings()
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const buildingOptions = useMemo(() => {
    return Array.from(new Set(Object.values(buildings).map(b => b.code).filter(Boolean))).sort()
  }, [buildings])

  const visibleReservations = useMemo(() => (
    reservations.filter(reservation => !reservation.isHidden)
  ), [reservations])

  const pendingRequestCount = useMemo(() => (
    visibleReservations.filter(reservation => reservation.status === 'Pending').length
  ), [visibleReservations])

  const upcomingReservations = useMemo(() => (
    visibleReservations
      .filter(reservation => reservation.status === 'Approved' && reservationTimeInManila(reservation.date, reservation.endTime) > now)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 3)
  ), [visibleReservations, now])

  const filteredReservations = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    
    return visibleReservations.filter(res => {
      const room = rooms[res.roomId]
      const building = buildings[res.buildingId]
      
      // 1. Filter by status
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(reservationDisplayStatus(res.status, res))) {
        return false
      }

      if (selectedReviewSteps.length > 0 && !selectedReviewSteps.includes(reservationReviewStep(res))) {
        return false
      }

      // 2. Filter by building
      if (selectedBuildings.length > 0 && !selectedBuildings.includes(building?.code || '')) {
        return false
      }

      // 3. Filter by search term
      if (!normalizedSearch) return true

      return [
        room?.name || '',
        room?.code || '',
        building?.name || '',
        building?.code || '',
        res.purpose,
        reservationDisplayStatus(res.status, res),
        res.date
      ].some(val => val.toLowerCase().includes(normalizedSearch))
    })
  }, [visibleReservations, rooms, buildings, searchTerm, selectedStatuses, selectedReviewSteps, selectedBuildings])

  const columns: ColumnDef<Reservation>[] = [
    {
      header: 'Room',
      width: '20%',
      render: (res) => {
        const room = rooms[res.roomId]
        return (
          <div className="flex items-center gap-4">
            <img
              src={room?.image || DEFAULT_ROOM_IMAGE}
              alt={room?.name || 'Room'}
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-2 ring-transparent group-hover:ring-[var(--brand-color)]/20 transition-all duration-300"
              onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
                {room?.name || 'Unknown Room'}
              </span>
              <span className="text-xs font-medium text-slate-500">
                {room?.type || 'Unknown Room Type'}
              </span>
            </div>
          </div>
        )
      }
    },
    {
      header: 'Attendee',
      width: '20%',
      render: (res) => {
        const count = res.attendees || 1
        return (
          <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
            {count} {count === 1 ? 'Attendee' : 'Attendees'}
          </span>
        )
      }
    },
    {
      header: 'Date & Time',
      width: '20%',
      render: (res) => (
        <div className="flex flex-col">
          <span className="text-sm font-bold text-slate-900 group-hover:text-[var(--brand-color)] transition-colors">
            {new Date(res.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {res.startTime} - {res.endTime}
            {res.requestType === 'Extended' && <span className="ml-2 text-[0.625rem] font-bold text-sky-700" title="Extended reservation">EXTD</span>}
          </span>
        </div>
      )
    },
    {
      header: 'Requested Date',
      width: '20%',
      render: (res) => (
        <span className="text-sm font-semibold text-slate-500 group-hover:text-slate-700 transition-colors">
          {res.createdAt?.toDate 
            ? `${res.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'Just now'}
        </span>
      )
    },
    {
      header: 'Status',
      width: '20%',
      render: (res) => (
        <div className="relative w-40 max-w-full">
          <ReservationReviewIndicators
            registrarRecommend={res.registrarRecommend}
            deanRecommend={res.deanRecommend}
            universityAdministratorRecommend={res.universityAdministratorRecommend}
            status={reservationDisplayStatus(res.status, res)}
            declinedByRole={res.declinedByRole}
            autoProcessed={res.autoProcessed}
          />
          {(res.status === 'Cancelled' || res.status === 'Completed' || res.status === 'Declined' || res.status === 'Approved' || res.status === 'Pending') && <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
            <span className={`-rotate-6 whitespace-nowrap border-2 bg-white/85 px-1.5 py-0.5 text-[0.625rem] font-black uppercase tracking-widest shadow-sm ${res.status === 'Approved' ? 'border-emerald-600 text-emerald-700' : res.status === 'Completed' ? hasReservationEvidence(res) ? 'border-blue-600 text-blue-700' : 'border-amber-600 text-amber-700' : res.status === 'Declined' ? 'border-rose-600 text-rose-700' : res.status === 'Pending' ? 'border-amber-600 text-amber-700' : 'border-slate-500 text-slate-600'}`}>{reservationDisplayStatus(res.status, res)}</span>
          </span>}
        </div>
      )
    },
    {
      header: 'Actions',
      width: '1%',
      align: 'right',
      render: (res) => {
        const room = rooms[res.roomId]
        return (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton
              label={res.status === 'Completed' ? 'Upload Evidence' : 'View Room'}
              onClick={() => {
                if (res.status === 'Completed') openEvidenceUpload(res)
                else if (room) handleOpenRoomInfoModal(room)
              }}
              className="h-8 w-8 rounded-lg bg-white text-slate-500 shadow-sm border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:shadow hover:-translate-y-0.5 transition-all"
            >
              {res.status === 'Completed' ? <UploadIcon className="h-4 w-4" /> : <DoorIcon className="h-4 w-4" />}
            </IconButton>
            <IconButton
              label="Delete Record"
              disabled={!(res.status === 'Cancelled' || res.status === 'Declined' || (res.status === 'Completed' && hasReservationEvidence(res)))}
              onClick={() => handleDeleteReservation(res.id)}
              className={`h-8 w-8 rounded-lg bg-white transition-all border border-slate-200 ${
                (res.status === 'Cancelled' || res.status === 'Declined' || (res.status === 'Completed' && hasReservationEvidence(res)))
                  ? 'text-rose-500 hover:border-rose-300 hover:text-rose-600 hover:shadow hover:-translate-y-0.5'
                  : 'opacity-30 text-slate-400'
              }`}
            >
              <TrashIcon className="h-4 w-4" />
            </IconButton>
          </div>
        )
      }
    }
  ]

  const filterGroups: FilterGroup[] = [
    {
      id: 'building',
      title: 'Building',
      options: buildingOptions,
      selectedValues: selectedBuildings,
      onChange: setSelectedBuildings
    },
    {
      id: 'status',
      title: 'Status',
      options: ['Pending', 'Approved', 'Declined', 'Cancelled', 'Needs Evidence', 'Completed'],
      selectedValues: selectedStatuses,
      onChange: setSelectedStatuses
    },
    {
      id: 'reviewStep',
      title: 'Review Step',
      options: [...RESERVATION_REVIEW_STEPS],
      selectedValues: selectedReviewSteps,
      onChange: setSelectedReviewSteps
    }
  ]

  const [reservationToCancel, setReservationToCancel] = useState<string | null>(null)
  const [isCanceling, setIsCanceling] = useState(false)

  const handleCancelReservation = (reservationId: string) => {
    setReservationToCancel(reservationId)
  }

  const executeCancelReservation = async () => {
    if (!reservationToCancel) return
    
    const targetId = reservationToCancel
    setReservationToCancel(null)
    setIsCanceling(true)

    try {
      const resRef = doc(db, 'reservations', targetId)
      await updateDoc(resRef, {
        status: 'Cancelled',
        updatedAt: new Date()
      })
      
      setIsReservationModalOpen(false)
      setSelectedReservation(null)
      showSnackbar({
        message: 'Reservation cancelled successfully',
        type: 'success',
        action: {
          label: 'Delete Record',
          onClick: () => {
            // Directly trigger delete for the cancelled reservation
            handleDeleteReservation(targetId)
          }
        }
      })
    } catch (error) {
      console.error('Error cancelling reservation:', error)
      showSnackbar({
        message: 'Failed to cancel reservation',
        type: 'error'
      })
    } finally {
      setIsCanceling(false)
    }
  }

  const [reservationToDelete, setReservationToDelete] = useState<string | null>(null)
  
  const handleDeleteReservation = (reservationId: string) => {
    setReservationToDelete(reservationId)
  }

  const executeDeleteReservation = async () => {
    if (!reservationToDelete) return
    
    const targetId = reservationToDelete
    setReservationToDelete(null)
    setIsCanceling(true) // Reuse the same processing state for the button

    try {
      const resRef = doc(db, 'reservations', targetId)
      await updateDoc(resRef, {
        isHidden: true,
        updatedAt: new Date()
      })
      
      setIsReservationModalOpen(false)
      setSelectedReservation(null)
      showSnackbar({
        message: 'Reservation record removed',
        type: 'success'
      })
    } catch (error) {
      console.error('Error deleting reservation:', error)
      showSnackbar({
        message: 'Failed to delete reservation record',
        type: 'error'
      })
    } finally {
      setIsCanceling(false)
    }
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Room Information Modal (Read-only) */}
      {isRoomInfoModalOpen && selectedRoomInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] p-6 text-white">
              <h3 className="text-xl font-bold leading-tight">Room Information</h3>
              <p className="mt-1 text-sm text-white/80">Comprehensive details and availability schedule</p>
            </div>

            <div className="overflow-y-auto max-h-[85vh] custom-scrollbar">
              <div className="p-6 space-y-5">
                <div className="flex gap-5">
                  <div className="w-[9.5rem] h-[9.5rem] shrink-0 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shadow-sm">
                    <img 
                      src={selectedRoomInfo.image} 
                      alt={selectedRoomInfo.name} 
                      className="h-full w-full object-cover grayscale-[0.2]" 
                      onError={(e) => { e.currentTarget.src = DEFAULT_ROOM_IMAGE }}
                    />
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-center justify-start gap-3">
                        <h4 className="text-xl font-bold text-slate-900 leading-tight">{selectedRoomInfo.name}</h4>
                        <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-slate-600 border border-slate-200">
                          {selectedRoomInfo.code}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-widest ${roomStatusClasses[selectedRoomInfo.status]}`}>
                          {selectedRoomInfo.status}
                        </span>
                        <span className="text-sm text-slate-500 font-semibold">
                          {selectedRoomInfo.type} • Floor {selectedRoomInfo.floor}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Capacity</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-slate-500 shrink-0" />
                          <p className="text-sm font-bold text-slate-700">{selectedRoomInfo.capacity} pax</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Booking Limits</p>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 flex items-center gap-2">
                          <HourglassIcon className="h-4 w-4 text-slate-500 shrink-0" />
                          <p className="text-sm font-bold text-slate-700">
                            {selectedRoomInfo.minBookingMins}m - {selectedRoomInfo.maxBookingMins}m
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Description</h5>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {selectedRoomInfo.description || 'No description provided for this room.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Availability</h5>
                      <div className="flex gap-1 h-[2.125rem]">
                        {DAYS_OF_WEEK.map((day) => {
                          const isAvailable = selectedRoomInfo.availableDays?.includes(day)
                          return (
                            <div
                              key={day}
                              title={day}
                              className={`flex-1 flex items-center justify-center rounded-md text-[0.625rem] font-bold transition-colors ${
                                isAvailable ? 'bg-[var(--brand-color)] text-white' : 'bg-slate-200 text-slate-500'
                              }`}
                            >
                              {day.slice(0, 1)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Schedule</h5>
                      <div className="flex items-center justify-start px-3 gap-2 text-sm font-bold text-slate-700 bg-slate-50/80 h-[2.125rem] rounded-xl border border-slate-200/80">
                        <ClockIcon className="h-4 w-4 text-[var(--brand-color)]" />
                        <span>{selectedRoomInfo.startTime} - {selectedRoomInfo.endTime}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2.5">Room Amenities</h5>
                    <div className="flex flex-wrap gap-1.5 max-h-[7.5rem] overflow-y-auto custom-scrollbar pr-1">
                      {selectedRoomInfo.amenities?.length > 0 ? (
                        selectedRoomInfo.amenities.map((amenity, i) => (
                          <span 
                            key={i}
                            className="flex-1 min-w-[fit-content] flex items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm whitespace-nowrap"
                          >
                            {amenity}
                          </span>
                        ))
                      ) : (
                        <p className="text-sm italic text-slate-400">No amenities listed.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModals}
                    className="flex-1 h-12 text-base"
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    icon={<CalendarIcon className="h-4 w-4" />}
                    onClick={() => {
                      setSelectedRoomForSchedule(selectedRoomInfo)
                      setIsRoomScheduleModalOpen(true)
                      setIsRoomInfoModalOpen(false)
                    }}
                    className="flex-1 h-12 text-base"
                  >
                    Room Schedule
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <div 
            className="absolute inset-0 -z-10" 
            onMouseDown={handleCloseModals} 
          />
        </div>
      )}

      {/* Room Schedule Timetable Modal */}
      <RoomScheduleModal
        isOpen={isRoomScheduleModalOpen}
        room={selectedRoomForSchedule}
        buildingName={
          Object.values(buildings).find(b => b.id === selectedRoomForSchedule?.buildingId)?.name
        }
        hideFilters={true}
        showWeekCalendar={true}
        onClose={handleCloseModals}
        onBack={() => {
          setIsRoomScheduleModalOpen(false)
          if (selectedRoomForSchedule) {
            setSelectedRoomInfo(selectedRoomForSchedule)
            setIsRoomInfoModalOpen(true)
          }
        }}
        actionButton={null}
      />

      <ConfirmModal
        isOpen={!!reservationToCancel}
        title="Cancel Reservation"
        message="Are you sure you want to cancel?"
        confirmText="Yes, Cancel"
        cancelText="No, Keep It"
        onConfirm={executeCancelReservation}
        onCancel={() => setReservationToCancel(null)}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={!!reservationToDelete}
        title="Delete Record"
        message="Are you sure you want to remove?"
        confirmText="Yes, Delete"
        cancelText="Cancel"
        onConfirm={executeDeleteReservation}
        onCancel={() => setReservationToDelete(null)}
        isDestructive={true}
      />

      {evidenceReservation && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="evidence-upload-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl">
            <div className="rounded-t-2xl bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-5 py-4 text-white">
              <h3 id="evidence-upload-title" className="text-xl font-bold">Upload Room Evidence</h3>
              <p className="mt-1 text-sm text-white/80">Show that the room is clean and orderly after use.</p>
            </div>
            <div className="space-y-4 p-5">
              {currentEvidenceReservation && hasReservationEvidence(currentEvidenceReservation) && (
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Uploaded evidence</h4>
                  <ReservationEvidenceGallery files={reservationEvidenceFiles(currentEvidenceReservation)} />
                </div>
              )}
              <div>
                <label htmlFor="reservation-evidence-file" className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Add photos or videos</label>
                <input
                  key={evidenceInputKey}
                  id="reservation-evidence-file"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                  disabled={isUploadingEvidence}
                  onChange={event => {
                    const selected = Array.from(event.currentTarget.files || [])
                    if (selected.length === 0) return
                    const seen = new Set(evidenceFiles.map(evidenceFileKey))
                    const additions = selected.filter(file => {
                      const key = evidenceFileKey(file)
                      if (seen.has(key)) return false
                      seen.add(key)
                      return true
                    })
                    const combined = [...evidenceFiles, ...additions]
                    const valid = combined.length <= 10 && selected.every(file => EVIDENCE_TYPES[file.type] && file.size > 0 && file.size <= MAX_EVIDENCE_BYTES)
                    if (valid) {
                      setEvidenceFiles(combined)
                      setEvidenceUploadError('')
                    } else {
                      setEvidenceUploadError('Choose up to 10 JPG, PNG, WebP, MP4, WebM, or MOV files, each up to 100 MB.')
                    }
                    const transfer = new DataTransfer()
                    for (const file of valid ? combined : evidenceFiles) transfer.items.add(file)
                    event.currentTarget.files = transfer.files
                  }}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#e3edda] file:px-3 file:py-1.5 file:font-bold file:text-[#41572a]"
                />
                <p className="mt-2 text-xs text-slate-500">JPG, PNG, WebP, MP4, WebM, MOV · Max 10 files · 100 MB each.</p>
              </div>
              {evidencePreviews.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Ready to upload ({evidencePreviews.length})</h4>
                  <div className="-mr-5 max-h-[23.5rem] overflow-y-auto pr-5 custom-scrollbar focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e]" role="region" aria-label="Files ready to upload" tabIndex={evidencePreviews.length > 4 ? 0 : undefined}>
                    <ReservationEvidenceGallery files={evidencePreviews} />
                  </div>
                </div>
              )}
              {evidenceUploadError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{evidenceUploadError}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="outline" disabled={isUploadingEvidence} onClick={() => { setEvidenceReservation(null); setEvidenceFiles([]) }} className="flex-1">Close</Button>
                <Button type="button" variant="brand" disabled={evidenceFiles.length === 0 || isUploadingEvidence} onClick={submitEvidence} className="flex-1">
                  {isUploadingEvidence ? 'Uploading...' : 'Upload Evidence'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReservationInfoModal
        isOpen={isReservationModalOpen}
        onClose={() => {
          setIsReservationModalOpen(false)
          setSelectedReservation(null)
        }}
        onCancel={handleCancelReservation}
        onDelete={handleDeleteReservation}
        isCanceling={isCanceling}
        reservation={currentSelectedReservation as Reservation}
        onUploadEvidence={currentSelectedReservation?.status === 'Completed'
          ? () => openEvidenceUpload(currentSelectedReservation) : undefined}
        showReviewIndicators
        roomName={selectedReservation && rooms[selectedReservation.roomId] ? rooms[selectedReservation.roomId].name : 'Unknown Room'}
        roomType={(selectedReservation && rooms[selectedReservation.roomId]?.type) || 'Unknown Room Type'}
      />

      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="My Reservations" 
          description="Track your room bookings, check their status, and manage upcoming schedules." 
        />

        <section aria-label="Upcoming reservations" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f7ee] text-[#62853e]"><CalendarIcon className="h-5 w-5" /></span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Upcoming Reservations</h2>
                <p className="text-xs text-slate-500">Your next three approved room bookings</p>
              </div>
            </div>
            {!reservationsLoading && !reservationsError && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">{pendingRequestCount} pending {pendingRequestCount === 1 ? 'request' : 'requests'}</span>}
          </div>
          {reservationsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading your reservations...</p>
          ) : reservationsError ? (
            <p role="alert" className="mt-4 text-sm text-rose-700">Could not load your reservations. Please reload and try again.</p>
          ) : upcomingReservations.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No current or upcoming approved reservations.</p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {upcomingReservations.map(reservation => {
                const room = rooms[reservation.roomId]
                const building = buildings[reservation.buildingId]
                const inProgress = reservationTimeInManila(reservation.date, reservation.startTime) <= now
                return (
                  <button key={reservation.id} type="button" onClick={() => {
                    setSelectedReservation(reservation)
                    setIsReservationModalOpen(true)
                  }} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left transition-colors hover:border-[#c6dbb6] hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-[#41572a]">{formatReservationDate(reservation.date)}</span>
                      <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[0.625rem] font-bold ${inProgress ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>{inProgress ? 'In progress' : 'Approved'}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-slate-900">{room?.name || room?.code || 'Unknown room'}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{building?.name || 'Unknown building'}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-slate-700"><ClockIcon className="h-3.5 w-3.5 shrink-0" />{reservation.startTime} – {reservation.endTime}{reservation.requestType === 'Extended' && <span className="ml-1 text-[0.625rem] font-bold text-sky-700" title="Extended reservation">EXTD</span>}</p>
                    <p className="mt-1 truncate text-xs text-slate-500" title={reservation.purpose}>{reservation.purpose || 'No purpose provided'}</p>
                  </button>
                )
              })}
            </div>
          )}
        </section>


        <div className="relative z-10">
          <DataTable
            data={filteredReservations}
            columns={columns}
            searchPlaceholder="Search by room, building, purpose or status..."
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            filters={<FilterDropdown groups={filterGroups} />}
            primaryAction={
              <Button
                variant="brand"
                className="w-full lg:w-auto"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'reserveRoom' }))
                }}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Reserve Room
              </Button>
            }
            emptyTitle="No reservations found"
            emptyDescription="Try adjusting your filters or make a new reservation."
            emptyIcon={<CalendarIcon className="h-12 w-12" />}
            onRowClick={(res) => {
              setSelectedReservation(res)
              setIsReservationModalOpen(true)
            }}
          />
        </div>
      </div>
    </section>
  )
}

export default MyReservationsPage
