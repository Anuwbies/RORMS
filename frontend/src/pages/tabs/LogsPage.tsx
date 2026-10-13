import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { Button } from '../../components/Button'
import { IconButton } from '../../components/IconButton'
import { DataTable, type ColumnDef } from '../../components/DataTable'
import { FilterDropdown, type FilterGroup } from '../../components/FilterDropdown'
import { SectionHeader } from '../../components/SectionHeader'
import { BuildingIcon, CalendarIcon, ClockIcon, DownloadIcon, EyeIcon, SpinnerIcon, UsersIcon } from '../../components/Icons'
import { downloadReportCsv } from '../../utils/reportCsv'
import { db } from '../../firebase'
import { ReservationLogDetailsModal, type ReservationLogSource } from '../../components/ReservationLogDetailsModal'
import { MemberLogDetailsModal } from '../../components/MemberLogDetailsModal'
import { FacilityLogDetailsModal } from '../../components/FacilityLogDetailsModal'
import { FACILITY_ACTIONS, facilityActivity } from '../../utils/facilityLog'
import { ScheduleLogDetailsModal } from '../../components/ScheduleLogDetailsModal'
import { scheduleActivity, type ScheduleLogSnapshot } from '../../utils/scheduleLog'
import { formatUserName } from '../../utils/userName'

type LogCategory = 'Reservations' | 'Scheduling' | 'Facilities' | 'Accounts'
type LogOutcome = 'Success' | 'Warning' | 'Failed'
type LogRole = 'Admin' | 'Registrar' | 'Dean' | 'Program Head' | 'Instructor' | 'Unknown'

interface LogEntry {
  id: string
  date: string
  time: string
  actor: string
  role: LogRole
  category: LogCategory
  action: string
  detail: string
  target: string
  outcome: LogOutcome
  actorId?: string
  newStatus?: string
  reservationSnapshot?: { date: string; department: string; beforeStatus: string; afterStatus: string }
  sourceId?: string
  sourcePath?: string
  sourceTitle?: string
  sourceDetail?: string
  requesterId?: string
  roomId?: string
  requesterName?: string
  roomName?: string
  targetDetail?: string
  memberSnapshot?: { email: string; role: string; department: string }
  memberChanges?: Array<{ field: string; label: string; before: string; after: string }>
  facilitySnapshot?: Record<string, unknown>
  facilityChanges?: Record<string, unknown>
  buildingName?: string
  deletedRooms?: Array<{ id: string; name: string; code: string }>
  scheduleSnapshot?: ScheduleLogSnapshot
}

const LOG_CATEGORIES = [
  { id: 'Reservations', description: 'Reservation status change history', icon: ClockIcon },
  { id: 'Facilities', description: 'Buildings, rooms, and comments', icon: BuildingIcon },
  { id: 'Scheduling', description: 'Schedule updates and room plotting', icon: CalendarIcon },
  { id: 'Accounts', description: 'Members, invitations, and access', icon: UsersIcon },
] as const

const LOG_CATEGORY_STORAGE_KEY = 'rorms-logs-selected-category'

function getStoredLogCategory(): LogCategory {
  try {
    const storedCategory = window.sessionStorage.getItem(LOG_CATEGORY_STORAGE_KEY)
    return LOG_CATEGORIES.find(option => option.id === storedCategory)?.id ?? 'Reservations'
  } catch {
    return 'Reservations'
  }
}

const OUTCOME_CLASSES: Record<LogOutcome, string> = {
  Success: 'text-emerald-700',
  Warning: 'text-amber-700',
  Failed: 'text-rose-700',
}

const ROLE_CLASSES: Record<LogRole, string> = {
  Admin: 'bg-purple-100 text-purple-700',
  Registrar: 'bg-blue-100 text-blue-700',
  Dean: 'bg-amber-100 text-amber-700',
  'Program Head': 'bg-rose-100 text-rose-700',
  Instructor: 'bg-emerald-100 text-emerald-700',
  Unknown: 'bg-slate-100 text-slate-600',
}

function logText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function logRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function reservationDateLabel(value: unknown): string {
  const date = logText(value)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(parsed.getTime()) ? date
    : parsed.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function reservationLogEntry(id: string, data: Record<string, unknown>): LogEntry {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null
  const status = logRecord(logRecord(data.changes).status)
  const actorRole = logText(data.actorRole)
  const role = Object.prototype.hasOwnProperty.call(ROLE_CLASSES, actorRole) ? actorRole as LogRole : 'Unknown'
  const reference = logText(data.targetId) || 'Unknown reservation'
  const before = logText(status.before) || 'Unknown'
  const after = logText(status.after) || 'Unknown'
  const actions: Record<string, string> = {
    Approved: 'Approved reservation',
    Declined: 'Declined reservation',
    Cancelled: 'Cancelled reservation',
    Completed: 'Marked reservation completed',
    Pending: 'Marked reservation pending',
  }
  return {
    id,
    date: createdAt?.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) || 'Date unavailable',
    time: createdAt?.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) || 'Time unavailable',
    actor: logText(data.actorName) || logText(data.actorId) || 'Unknown member',
    actorId: logText(data.actorId),
    role,
    category: 'Reservations',
    action: actions[after] || 'Changed reservation status',
    detail: `Changed status from ${before} to ${after}.`,
    newStatus: logText(status.after),
    reservationSnapshot: { date: logText(data.reservationDate), department: logText(data.department), beforeStatus: before, afterStatus: after },
    sourceId: logText(data.targetId),
    sourcePath: logText(data.targetId) ? `reservations/${reference}` : '',
    requesterId: logText(data.requesterId),
    roomId: logText(data.roomId),
    target: [logText(data.department), reservationDateLabel(data.reservationDate)].filter(Boolean).join(' · ') || 'Details unavailable',
    outcome: 'Success',
  }
}

const ACCOUNT_ACTIONS = [
  'account.invited', 'account.reinvited', 'account.member_updated', 'account.invitation_updated',
  'account.deactivated', 'account.invitation_cancelled', 'account.reinvitation_cancelled',
]

const MEMBER_ACTIVITY_LABELS: Record<string, string> = {
  'Invited member': 'Invited',
  'Re-invited deactivated member': 'Re-invited',
  'Deactivated member account': 'Deactivated',
  'Changed member role': 'Role changed',
  'Changed member department': 'Department changed',
  'Changed role and department': 'Role & dept. changed',
  'Updated member assignment': 'Assignment updated',
  'Edited pending invitation': 'Invite edited',
  'Edited pending re-invitation': 'Re-invite edited',
  'Cancelled invitation': 'Invite cancelled',
  'Cancelled re-invitation': 'Re-invite cancelled',
  'Updated member': 'Member updated',
}

function accountLogEntry(id: string, data: Record<string, unknown>): LogEntry {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null
  const changes = logRecord(data.changes)
  const labels: Record<string, string> = {
    role: 'Role', department: 'Department', membershipStatus: 'Department assignment',
    membership: 'Membership', invitationStatus: 'Invitation', isActive: 'Account access', pendingInvitations: 'Pending invitations',
  }
  const valueLabel = (field: string, value: unknown): string => {
    if (field === 'isActive') return value === true ? 'Active' : value === false ? 'Deactivated' : 'Unknown'
    if (field === 'membershipStatus') return value === 'accepted' ? 'Assigned' : value === 'pending' ? 'Pending' : value === 'declined' ? 'Declined' : 'Unassigned'
    if (field === 'department') return logText(value) || 'Unassigned'
    return value === null || value === undefined || value === '' ? 'Not set' : String(value)
  }
  const actions: Record<string, string> = {
    'account.invited': 'Invited member', 'account.reinvited': 'Re-invited deactivated member',
    'account.member_updated': changes.role && changes.department ? 'Changed role and department'
      : changes.role ? 'Changed member role' : changes.department ? 'Changed member department' : 'Updated member assignment',
    'account.invitation_updated': data.isReactivation ? 'Edited pending re-invitation' : 'Edited pending invitation',
    'account.deactivated': 'Deactivated member account', 'account.invitation_cancelled': 'Cancelled invitation',
    'account.reinvitation_cancelled': 'Cancelled re-invitation',
  }
  const actorRole = logText(data.actorRole)
  const path = [logText(data.targetCollection), logText(data.targetId)].filter(Boolean).join('/')
  const action = logText(data.action)
  return {
    id, category: 'Accounts', outcome: 'Success',
    date: createdAt?.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) || 'Date unavailable',
    time: createdAt?.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) || 'Time unavailable',
    actor: logText(data.actorName) || logText(data.actorId) || 'Unknown member', actorId: logText(data.actorId),
    role: Object.prototype.hasOwnProperty.call(ROLE_CLASSES, actorRole) ? actorRole as LogRole : 'Unknown',
    action: actions[logText(data.action)] || 'Updated member',
    detail: action === 'account.invited' ? 'Invitation queued for email delivery.'
      : action === 'account.reinvited' ? 'Reactivation invitation queued for email delivery.'
      : Object.entries(changes).map(([field, value]) => {
      const change = logRecord(value)
      return `${labels[field] || field}: ${valueLabel(field, change.before)} → ${valueLabel(field, change.after)}`
    }).join('\n'),
    target: logText(data.memberName) || logText(data.memberEmail) || 'Member unavailable',
    memberSnapshot: { email: logText(data.memberEmail), role: logText(data.memberRole), department: logText(data.department) },
    memberChanges: ['account.invited', 'account.reinvited'].includes(action) ? [] : Object.entries(changes).map(([field, value]) => {
      const change = logRecord(value)
      return { field, label: labels[field] || field, before: valueLabel(field, change.before), after: valueLabel(field, change.after) }
    }),
    targetDetail: [logText(data.memberEmail), logText(data.memberRole), logText(data.department) || 'Unassigned'].filter(Boolean).join(' · '),
    sourcePath: path,
  }
}

function facilityLogEntry(id: string, data: Record<string, unknown>): LogEntry {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null
  const snapshot = logRecord(data.targetSnapshot)
  const actorRole = logText(data.actorRole)
  const deletedRooms = Array.isArray(data.deletedRooms) ? data.deletedRooms.map(value => {
    const room = logRecord(value)
    return { id: logText(room.id), name: logText(room.name), code: logText(room.code) }
  }) : []
  const comment = data.action === 'facility.comment_deleted'
  const roomSource = comment || data.targetCollection === 'rooms'
  const roomName = comment ? logText(data.roomName) || logText(data.roomCode) : logText(snapshot.name) || logText(snapshot.code)
  return {
    id, category: 'Facilities', outcome: 'Success',
    date: createdAt?.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) || 'Date unavailable',
    time: createdAt?.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) || 'Time unavailable',
    actor: logText(data.actorName) || logText(data.actorId) || 'Unknown member', actorId: logText(data.actorId),
    role: Object.prototype.hasOwnProperty.call(ROLE_CLASSES, actorRole) ? actorRole as LogRole : 'Unknown',
    ...facilityActivity(logText(data.action), logRecord(data.changes), snapshot, deletedRooms.length),
    target: comment ? logText(data.roomName) || logText(data.roomCode) || 'Room comment' : logText(snapshot.name) || logText(snapshot.code) || 'Record unavailable',
    targetDetail: comment ? [logText(data.buildingName), logText(data.roomType)].filter(Boolean).join(' · ')
      : (data.targetCollection === 'rooms' ? [logText(data.buildingName), logText(snapshot.type)] : [logText(snapshot.code), 'Building']).filter(Boolean).join(' · '),
    sourcePath: [logText(data.targetCollection), logText(data.targetId)].filter(Boolean).join('/'),
    sourceTitle: roomSource ? logText(data.buildingName) || logText(data.buildingCode) || 'Building unavailable' : undefined,
    sourceDetail: roomSource ? [roomName || 'Room unavailable', comment ? logText(data.roomType) : logText(snapshot.type)].filter(Boolean).join(' · ') : undefined,
    facilitySnapshot: snapshot, facilityChanges: logRecord(data.changes), buildingName: logText(data.buildingName), deletedRooms,
  }
}

function scheduleLogEntry(id: string, data: Record<string, unknown>): LogEntry {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null
  const actorRole = logText(data.actorRole)
  const counts = Object.fromEntries(Object.entries(logRecord(data.counts)).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  return {
    id, category: 'Scheduling', outcome: 'Success',
    date: createdAt?.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }) || 'Date unavailable',
    time: createdAt?.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) || 'Time unavailable',
    actor: logText(data.actorName) || logText(data.actorId) || 'Unknown member', actorId: logText(data.actorId),
    role: Object.prototype.hasOwnProperty.call(ROLE_CLASSES, actorRole) ? actorRole as LogRole : 'Unknown',
    ...scheduleActivity(logText(data.kind), counts),
    target: logText(data.department) || 'Department schedule',
    targetDetail: [logText(data.academicYear), data.semester === 'sem1' ? '1st Semester' : '2nd Semester'].filter(Boolean).join(' · '),
    sourcePath: logText(data.sourcePath),
    scheduleSnapshot: {
      fileName: logText(data.fileName), revision: typeof data.revision === 'number' ? data.revision : 0, counts,
      sheetNames: Array.isArray(data.sheetNames) ? data.sheetNames.filter((name): name is string => typeof name === 'string') : [],
      samples: Array.isArray(data.samples) ? data.samples.map(value => {
        const sample = logRecord(value)
        return { kind: logText(sample.kind), sheet: logText(sample.sheet), location: logText(sample.location), field: logText(sample.field),
          before: typeof sample.before === 'string' ? sample.before : null, after: typeof sample.after === 'string' ? sample.after : null }
      }) : [],
      omittedSamples: typeof data.omittedSamples === 'number' ? data.omittedSamples : 0,
      baselineAvailable: data.baselineAvailable === true,
    },
  }
}

const logColumns = (onViewSource: (row: LogEntry) => void, loadingSourceId: string): ColumnDef<LogEntry>[] => [
  { header: 'Date & time', render: row => <div className="whitespace-nowrap"><p className="text-sm font-bold text-slate-900">{row.date}</p><p className="mt-1 text-xs text-slate-400">{row.time} · PHT</p></div> },
  { header: 'Changed by', render: row => <div className="whitespace-nowrap"><p className="text-sm font-bold text-slate-900">{row.actor}</p><span className={`mt-1 inline-flex rounded-lg px-2 py-0.5 text-[0.65rem] font-bold ${ROLE_CLASSES[row.role]}`}>{row.role}</span></div> },
  { header: 'Activity', render: row => <div className="min-w-64"><p className="text-sm font-bold text-slate-900">{row.action}</p><p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">{row.detail}</p></div> },
  { header: 'Source record', render: row => row.sourceId
    ? <div className="min-w-44"><p className="text-sm font-bold text-slate-700">{row.requesterName || (row.requesterId ? 'Loading requester…' : 'Requester unavailable')}</p><p className="mt-1 text-xs text-slate-400">{row.roomName || (row.roomId ? 'Loading room…' : 'Room unavailable')}</p></div>
    : <div className="min-w-44" title={row.sourcePath}><p className="text-sm font-bold text-slate-700">{row.sourceTitle || row.target}</p>{(row.sourceDetail || row.targetDetail) && <p className="mt-1 text-xs text-slate-400">{row.memberSnapshot ? [row.memberSnapshot.role, row.memberSnapshot.department || 'Unassigned'].filter(Boolean).join(' · ') : row.sourceDetail || row.targetDetail}</p>}</div> },
  { header: 'Outcome', render: row => <span className={`text-xs font-bold ${OUTCOME_CLASSES[row.outcome]}`}>{row.outcome}</span> },
  { header: 'Details', align: 'right', width: '1%', render: row => row.sourceId || row.category === 'Accounts' || row.category === 'Facilities' || row.category === 'Scheduling'
    ? <IconButton label={row.category === 'Scheduling' ? `View schedule changes for ${row.target}` : row.category === 'Facilities' ? `View facility details for ${row.target}` : row.category === 'Accounts' ? `View member details for ${row.target}` : `View reservation details for ${row.requesterName || 'this reservation'}`} className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-700 hover:shadow" disabled={Boolean(loadingSourceId)} onClick={() => onViewSource(row)}>{loadingSourceId === row.id ? <SpinnerIcon className="h-4 w-4 animate-spin" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}</IconButton>
    : <span className="text-sm text-slate-400">—</span> },
]

function LogsPage() {
  const [category, setCategory] = useState<LogCategory>(getStoredLogCategory)
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomes, setOutcomes] = useState<string[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [logLimit, setLogLimit] = useState(100)
  const [hasOlderLogs, setHasOlderLogs] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [reservationSource, setReservationSource] = useState<ReservationLogSource | null>(null)
  const [reservationLog, setReservationLog] = useState<LogEntry | null>(null)
  const [memberLog, setMemberLog] = useState<LogEntry | null>(null)
  const [facilityLog, setFacilityLog] = useState<LogEntry | null>(null)
  const [scheduleLog, setScheduleLog] = useState<LogEntry | null>(null)
  const [loadingSourceId, setLoadingSourceId] = useState('')
  const [sourceError, setSourceError] = useState('')
  const sourceRequest = useRef(0)
  const isReservations = category === 'Reservations'
  const isAccounts = category === 'Accounts'
  const isFacilities = category === 'Facilities'
  const isScheduling = category === 'Scheduling'
  const isLive = true

  useEffect(() => () => { ++sourceRequest.current }, [])

  const viewSource = async (row: LogEntry) => {
    if (row.category === 'Scheduling') {
      setScheduleLog(row)
      return
    }
    if (row.category === 'Facilities') {
      setFacilityLog(row)
      return
    }
    if (row.category === 'Accounts') {
      setMemberLog(row)
      return
    }
    setReservationLog(row)
    setReservationSource(null)
    setSourceError('')
    if (!row.sourceId || row.sourceId.includes('/')) return
    const request = ++sourceRequest.current
    setLoadingSourceId(row.id)
    try {
      const snapshot = await getDoc(doc(db, 'reservations', row.sourceId))
      if (!snapshot.exists()) {
        throw new Error('The source reservation has been deleted. Its recorded status change is still preserved in this log.')
      }
      const data = snapshot.data()
      const status = logText(data.status)
      if (!['Pending', 'Approved', 'Declined', 'Cancelled', 'Completed'].includes(status)) {
        throw new Error('The source reservation has an unsupported status. Its recorded change is still available in the log.')
      }
      const readRelated = async (collectionName: string, id: unknown) => {
        const value = logText(id)
        if (!value || value.includes('/')) return undefined
        try { return (await getDoc(doc(db, collectionName, value))).data() }
        catch { return undefined }
      }
      const [room, requester] = await Promise.all([
        readRelated('rooms', data.roomId), readRelated('users', data.userId),
      ])
      if (sourceRequest.current !== request) return
      setReservationSource({
        reservation: {
          id: snapshot.id,
          date: logText(data.date), startTime: logText(data.startTime), endTime: logText(data.endTime),
          status,
          purpose: logText(data.purpose), subjectCode: logText(data.subjectCode),
          classSection: logText(data.classSection), department: logText(data.department),
          duration: typeof data.duration === 'number' ? data.duration : undefined,
          attendees: typeof data.attendees === 'number' ? data.attendees : undefined,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
        },
        roomName: logText(room?.name) || logText(room?.code) || logText(data.roomId) || 'Room unavailable',
        roomType: logText(room?.type),
        requester: {
          name: formatUserName(requester) || logText(data.userId) || 'Requester unavailable',
          email: logText(requester?.email),
        },
      })
    } catch (error) {
      if (sourceRequest.current === request) setSourceError(error instanceof Error && !('code' in error)
        ? error.message : 'Unable to load the source reservation. Check your connection and access permissions, then try again.')
    } finally {
      if (sourceRequest.current === request) setLoadingSourceId('')
    }
  }

  useEffect(() => {
    if (!isLive) return
    let active = true
    let revision = 0
    const relatedDocuments = new Map<string, Promise<Record<string, unknown> | undefined>>()
    const loadRelated = (collectionName: string, id: string) => {
      if (!id || id.includes('/')) return Promise.resolve(undefined)
      const path = `${collectionName}/${id}`
      if (!relatedDocuments.has(path)) {
        relatedDocuments.set(path, getDoc(doc(db, collectionName, id))
          .then(snapshot => snapshot.data())
          .catch(error => {
            console.error(`Error loading log source ${collectionName}:`, error)
            return undefined
          }))
      }
      return relatedDocuments.get(path)!
    }
    setIsLoading(true)
    setLoadError('')
    setLiveLogs([])
    setHasOlderLogs(false)
    const logsQuery = query(collection(db, 'logs'), isScheduling ? where('action', '==', 'schedule.workbook_saved') : isFacilities ? where('action', 'in', FACILITY_ACTIONS) : isAccounts ? where('action', 'in', ACCOUNT_ACTIONS) : where('action', '==', 'reservation.status_changed'), orderBy('createdAt', 'desc'), limit(logLimit))
    const unsubscribe = onSnapshot(logsQuery, snapshot => {
      if (!active) return
      const currentRevision = ++revision
      const entries = snapshot.docs.map(document => isScheduling ? scheduleLogEntry(document.id, document.data()) : isFacilities ? facilityLogEntry(document.id, document.data()) : isAccounts ? accountLogEntry(document.id, document.data()) : reservationLogEntry(document.id, document.data()))
      setLiveLogs(entries)
      setHasOlderLogs(snapshot.size === logLimit)
      setIsLoading(false)
      if (!isReservations) return
      void Promise.all(entries.map(async entry => {
        const [requester, room] = await Promise.all([
          loadRelated('users', entry.requesterId || ''),
          loadRelated('rooms', entry.roomId || ''),
        ])
        return {
          ...entry,
          requesterName: formatUserName(requester) || 'Requester unavailable',
          roomName: logText(room?.name) || logText(room?.code) || 'Room unavailable',
        }
      })).then(enriched => {
        if (active && currentRevision === revision) setLiveLogs(enriched)
      })
    }, error => {
      if (!active) return
      ++revision
      console.error(`Error loading ${category.toLowerCase()} logs:`, error)
      setLiveLogs([])
      setHasOlderLogs(false)
      setIsLoading(false)
      setLoadError(error.code === 'permission-denied'
        ? `You do not have permission to read ${category.toLowerCase()} logs. Check the deployed Firestore rules.`
        : error.code === 'failed-precondition'
          ? 'Activity logs need their Firestore index. Deploy firestore.indexes.json and wait for the index to finish building.'
          : `${category} logs could not be loaded. Check your connection and try again.`)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [category, isAccounts, isFacilities, isScheduling, isReservations, isLive, logLimit, retryCount])

  const categoryLogs = useMemo(() => liveLogs.filter(log => log.category === category), [liveLogs, category])

  const selectCategory = (nextCategory: (typeof LOG_CATEGORIES)[number]['id']) => {
    ++sourceRequest.current
    setLoadingSourceId('')
    setSourceError('')
    setReservationSource(null)
    setReservationLog(null)
    setMemberLog(null)
    setFacilityLog(null)
    setScheduleLog(null)
    setCategory(nextCategory)
    try {
      window.sessionStorage.setItem(LOG_CATEGORY_STORAGE_KEY, nextCategory)
    } catch {
      // Tab selection still works when browser storage is unavailable.
    }
    setSearchQuery('')
    setOutcomes([])
    setRoles([])
    setDates([])
  }

  const filteredLogs = useMemo(() => {
    const search = searchQuery.trim().toLowerCase()
    return categoryLogs.filter(log => (
      (outcomes.length === 0 || outcomes.includes(log.outcome))
      && (roles.length === 0 || roles.includes(log.role))
      && (dates.length === 0 || dates.includes(log.date))
      && (!search || Object.values(log).join(' ').toLowerCase().includes(search))
    ))
  }, [categoryLogs, searchQuery, outcomes, roles, dates])

  const metrics = [
    { label: 'Total events', value: filteredLogs.length, detail: 'Matching activity records' },
    { label: 'Successful', value: filteredLogs.filter(log => log.outcome === 'Success').length, detail: 'Actions completed successfully' },
    { label: 'Needs attention', value: filteredLogs.filter(log => log.outcome !== 'Success').length, detail: 'Warnings and failed actions' },
    { label: 'Active members', value: new Set(filteredLogs.map(log => log.actorId || log.actor)).size, detail: 'Members in these results' },
  ]

  const filterGroups: FilterGroup[] = [
    { id: 'outcome', title: 'Outcome', options: Object.keys(OUTCOME_CLASSES), selectedValues: outcomes, onChange: setOutcomes },
    { id: 'role', title: 'Role', options: [...new Set(categoryLogs.map(log => log.role))], selectedValues: roles, onChange: setRoles },
    { id: 'date', title: 'Date', options: [...new Set(categoryLogs.map(log => log.date))], selectedValues: dates, onChange: setDates },
  ]

  const activityBreakdown = [...new Set(filteredLogs.map(log => log.action))]
    .map(action => ({ id: action, count: filteredLogs.filter(log => log.action === action).length }))

  const exportCsv = () => {
    if (isScheduling) {
      downloadReportCsv('rorms-schedule-logs.csv', ['Reference', 'Date', 'Time (PHT)', 'Changed by', 'Role', 'Activity', 'Summary', 'Department', 'Term', 'Workbook', 'Revision', 'Recorded changes', 'Omitted descriptions', 'Source document', 'Outcome'], filteredLogs.map(log => [log.id, log.date, log.time, log.actor, log.role, log.action, log.detail, log.target, log.targetDetail || '', log.scheduleSnapshot?.fileName || '', String(log.scheduleSnapshot?.revision || 0), JSON.stringify(log.scheduleSnapshot?.samples || []), String(log.scheduleSnapshot?.omittedSamples || 0), log.sourcePath || '', log.outcome]))
      return
    }
    if (isFacilities) {
      downloadReportCsv('rorms-facility-logs.csv', ['Reference', 'Date', 'Time (PHT)', 'Changed by', 'Role', 'Activity', 'Changes', 'Source record', 'Record details', 'Source document', 'Outcome'], filteredLogs.map(log => [log.id, log.date, log.time, log.actor, log.role, log.action, log.detail, log.target, log.targetDetail || '', log.sourcePath || '', log.outcome]))
      return
    }
    if (isAccounts) {
      downloadReportCsv('rorms-account-logs.csv', ['Reference', 'Date', 'Time (PHT)', 'Changed by', 'Role', 'Activity', 'Changes', 'Affected member', 'Member details', 'Source document', 'Outcome'], filteredLogs.map(log => [log.id, log.date, log.time, log.actor, log.role, log.action, log.detail, log.target, log.targetDetail || '', log.sourcePath || '', log.outcome]))
      return
    }
    downloadReportCsv(isReservations ? 'rorms-reservation-logs.csv' : 'rorms-sample-logs.csv', ['Reference', 'Date', 'Time (PHT)', 'Changed by', 'Role', 'Activity', 'Changes', 'Reserved by', 'Room', 'Reservation details', 'Source document', 'Outcome'], filteredLogs.map(log => [log.id, log.date, log.time, log.actor, log.role, log.action, log.detail, log.requesterName || '', log.roomName || '', log.target, log.sourcePath || '', log.outcome]))
  }

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader title="Logs" description="Review system activity across reservations, schedules, facilities, and member accounts." />

        {isLive && loadError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><p className="flex-1">{loadError}</p><Button type="button" variant="outline" onClick={() => setRetryCount(count => count + 1)}>Retry</Button></div>}
        {sourceError && !reservationLog && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><p className="flex-1">{sourceError}</p><Button type="button" variant="outline" onClick={() => setSourceError('')}>Dismiss</Button></div>}

        <div className="animate-in grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:grid-cols-4" role="group" aria-label="Log categories">
          {LOG_CATEGORIES.map(option => {
            const CategoryIcon = option.icon
            const isActive = category === option.id
            return (
              <button key={option.id} type="button" aria-pressed={isActive} onClick={() => selectCategory(option.id)} className={`relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-color)] focus-visible:ring-offset-2 ${isActive ? 'bg-gradient-to-br from-[#e3edda] to-[#f3f7ee] text-[#41572a] shadow-sm ring-1 ring-[#c6dbb6]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${isActive ? 'bg-white text-[var(--brand-color)] shadow-sm' : 'bg-slate-100 text-slate-500'}`}><CategoryIcon className="h-4.5 w-4.5" /></span>
                <span className="min-w-0"><span className="block text-sm font-black">{option.id === 'Accounts' ? 'Members' : option.id === 'Scheduling' ? 'Schedules' : option.id === 'Facilities' ? 'Buildings and Rooms' : option.id}</span><span className="hidden truncate text-[0.65rem] leading-relaxed opacity-70 sm:block">{option.description}</span></span>
                {isActive && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[var(--brand-color)]" aria-hidden="true" />}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <article key={metric.label} className="animate-in relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">{metric.label}</p><p className="mt-1 truncate text-xs text-slate-500">{metric.detail}</p></div><p className="shrink-0 text-3xl font-black tracking-tight text-slate-900">{isLive && isLoading ? '—' : metric.value}</p></div>
            </article>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 xl:grid-cols-12">
          <aside className="animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-9">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700"><ClockIcon className="h-5 w-5" /></span><div><h2 className="font-black text-slate-900">Activity breakdown</h2><p className="text-xs text-slate-400">Within the current results</p></div></div>
            <div className="mt-5 flex gap-3 overflow-x-auto custom-scrollbar pb-1">
              {activityBreakdown.map(option => {
                const count = option.count
                const share = filteredLogs.length ? Math.round(count / filteredLogs.length * 100) : 0
                const activityLabel = isAccounts ? MEMBER_ACTIVITY_LABELS[option.id] || option.id : option.id
                return <div key={option.id} className={`${isAccounts ? 'min-w-80' : 'min-w-40'} flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm`}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="truncate text-sm font-black text-slate-700">{activityLabel}</span><span className="text-sm font-black text-slate-900">{count} · {share}%</span></div><progress aria-label={`${option.id} share of activity`} value={share} max={100} className="block h-2.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[var(--brand-color)] [&::-moz-progress-bar]:bg-[var(--brand-color)]" /></div>
              })}
            </div>
          </aside>

          <aside className="animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-3">
            <p className="text-sm font-bold text-slate-700">Log scope</p>
            <dl className="mt-3 space-y-2 text-sm">
              {[['Category', category], ['Date', dates.length ? dates.join(', ') : isLive ? 'All loaded dates' : 'All sample dates'], ['Outcome', outcomes.length ? outcomes.join(', ') : 'All'], ['Role', roles.length ? roles.join(', ') : 'All']].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="font-bold text-slate-600">{label}</dt><dd className="max-w-36 truncate text-right font-black text-slate-900" title={value}>{value}</dd></div>)}
            </dl>
          </aside>

          <section className="min-w-0 overflow-visible xl:col-span-12" aria-label="Activity records">
            <DataTable data={filteredLogs} columns={logColumns(viewSource, loadingSourceId)} searchPlaceholder="Search members, activities, or records..." searchValue={searchQuery} onSearchChange={setSearchQuery}
              isLoading={isLive && isLoading}
              filters={<FilterDropdown groups={filterGroups} buttonClassName="!h-11 px-4" />}
              primaryAction={<Button type="button" variant="brand" icon={<DownloadIcon className="h-4 w-4" />} onClick={exportCsv} disabled={filteredLogs.length === 0 || (isLive && isLoading)} className="!h-11 px-4">Export CSV</Button>}
              emptyTitle={isLive && loadError ? `${category} logs unavailable` : isLive && categoryLogs.length === 0 ? `No ${isScheduling ? 'schedule' : isFacilities ? 'facility' : isAccounts ? 'account' : 'reservation'} logs yet` : 'No matching activity'} emptyDescription={isLive && loadError ? 'Resolve the loading error above and retry.' : isLive && categoryLogs.length === 0 ? isScheduling ? 'Saved department workbook changes will appear here after schedule logging is deployed.' : isFacilities ? 'Building, room, and comment deletion actions will appear here after logging is enabled.' : isAccounts ? 'Member actions made after logging is enabled will appear here.' : 'Status changes made through Manage Reservations will appear here.' : 'Try changing the category, filters, or search terms.'} emptyIcon={<ClockIcon className="h-12 w-12" />} />
            {isLive && hasOlderLogs && <div className="mt-4 flex justify-center"><Button type="button" variant="outline" disabled={isLoading} onClick={() => setLogLimit(count => count + 100)}>{isLoading ? 'Loading...' : 'Load older logs'}</Button></div>}
          </section>
        </div>
      </div>
      {reservationLog && <ReservationLogDetailsModal event={reservationLog} source={reservationSource} isLoading={Boolean(loadingSourceId)} sourceNotice={sourceError} onClose={() => { ++sourceRequest.current; setReservationLog(null); setReservationSource(null); setLoadingSourceId(''); setSourceError('') }} />}
      {memberLog && <MemberLogDetailsModal event={memberLog} onClose={() => setMemberLog(null)} />}
      {facilityLog && <FacilityLogDetailsModal event={facilityLog} onClose={() => setFacilityLog(null)} />}
      {scheduleLog && <ScheduleLogDetailsModal event={scheduleLog} onClose={() => setScheduleLog(null)} />}
    </section>
  )
}

export default LogsPage
