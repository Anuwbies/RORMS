import type { WorkbookScheduleMeeting, WorkbookScheduleRow } from './excelScheduleRows'
import type { ScheduleMeetingRecord } from './scheduleMeetings'

export interface PlotRoom {
  id: string
  code: string
  name: string
  buildingId: string
  status: string
  availableDays: string[]
  startTime: string
  endTime: string
  capacity: number
  floor?: number
}

export interface PlottedRoom { key: string; roomId: string; room: string; buildingId: string }
export interface RegistrarPlot { version: 1; revisionId: string; assignments: PlottedRoom[]; savedBy: string; providedRoomKeys?: string[] }
export interface PlotAssignment {
  scheduleId: string
  meetingKey: string
  roomId: string
  expectedRoomId: string
  expectedRevision: string
  targetStatus?: 'Draft' | 'Plot'
  /** Local staging metadata; never persisted on the schedule document. */
  parallelGroupKey?: string
}

/** Keep a save batch in one direction: approve/assign rooms or return plotted schedules to Draft. */
export function plotSelectionActionMode(pending: ReadonlyMap<string, PlotAssignment>): 'plot' | 'unplot' | null {
  if ([...pending.values()].some(assignment => assignment.targetStatus === 'Draft')) return 'unplot'
  return pending.size ? 'plot' : null
}

/** A staged checkbox may cancel its own edit; only saved schedules are locked against the opposite action. */
export function plotSelectionDirectionLocked(actionMode: 'plot' | 'unplot' | null, checked: boolean, savedPlotted: boolean): boolean {
  return actionMode === 'plot' && checked && savedPlotted
    || actionMode === 'unplot' && !checked && !savedPlotted
}

export const plotScheduleRevision = (schedule: Record<string, unknown>) => JSON.stringify([
  schedule.workbookRevisionId ?? '', readRegistrarPlot(schedule.registrarPlot)?.revisionId ?? '',
])

export const schedulePlotSelectionKey = (meeting: ScheduleMeetingRecord) => JSON.stringify([
  meeting.sourceScheduleId || meeting.id, plotMeetingKey(meeting as Partial<WorkbookScheduleMeeting>),
])

/** The department workbook owns this list; older Registrar metadata remains readable. */
export function readProvidedRoomKeys(schedule: Record<string, unknown>): string[] | undefined {
  if (Array.isArray(schedule.providedRoomKeys) && schedule.providedRoomKeys.every(key => typeof key === 'string')) return schedule.providedRoomKeys as string[]
  const legacy = readRegistrarPlot(schedule.registrarPlot)?.providedRoomKeys
  if (legacy === undefined) return
  // Older Plot metadata did not include TBA. Protect those explicit labels until the workbook is saved again.
  const meetings: unknown[] = Array.isArray(schedule.meetings) ? schedule.meetings : [schedule]
  const tbaKeys = meetings.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const meeting = value as Partial<WorkbookScheduleMeeting>
    return typeof meeting.room === 'string' && meeting.room.trim().toUpperCase() === 'TBA' ? [plotMeetingKey(meeting)] : []
  })
  return [...new Set([...legacy, ...tbaKeys])]
}

export function isProvidedScheduleRoom(meeting: ScheduleMeetingRecord): boolean {
  const keys = readProvidedRoomKeys(meeting)
  return keys === undefined ? Boolean(meeting.roomId || typeof meeting.room === 'string' && meeting.room.trim())
    : keys.includes(plotMeetingKey(meeting as Partial<WorkbookScheduleMeeting>))
}

export function assignedSchedulePlotStatus(pending: ReadonlyMap<string, PlotAssignment>, meeting: ScheduleMeetingRecord): 'Draft' | 'Plot' {
  const selected = pending.get(schedulePlotSelectionKey(meeting))
  return selected?.targetStatus
    ?? (selected && selected.roomId !== selected.expectedRoomId ? 'Draft' : meeting.status === 'Plot' ? 'Plot' : 'Draft')
}

/** A checkbox stages one meeting status; identical calendar copies share its selection key. */
export function toggleAssignedSchedulePlot(pending: ReadonlyMap<string, PlotAssignment>, meeting: ScheduleMeetingRecord): Map<string, PlotAssignment> {
  const next = new Map(pending)
  const key = schedulePlotSelectionKey(meeting)
  const selected = pending.get(key)
  const roomId = selected?.roomId ?? meeting.roomId ?? ''
  if (!roomId || !['Draft', 'Plot'].includes(meeting.status || 'Draft')) return next
  const targetStatus = assignedSchedulePlotStatus(pending, meeting) === 'Plot' ? 'Draft' : 'Plot'
  if (targetStatus === (meeting.status === 'Plot' ? 'Plot' : 'Draft')) {
    if (selected?.roomId !== selected?.expectedRoomId) {
      const { targetStatus: _status, ...roomChoice } = selected!
      next.set(key, roomChoice)
    } else next.delete(key)
    return next
  }
  next.set(key, { scheduleId: String(meeting.sourceScheduleId || meeting.id), targetStatus,
    meetingKey: plotMeetingKey(meeting as Partial<WorkbookScheduleMeeting>), roomId,
    expectedRoomId: selected?.expectedRoomId ?? meeting.roomId ?? '', expectedRevision: selected?.expectedRevision ?? plotScheduleRevision(meeting) })
  return next
}

/** A room belongs to this instructor/time/day meeting, not its array position. */
export function plotMeetingKey(meeting: Partial<WorkbookScheduleMeeting>): string {
  return JSON.stringify([meeting.instructorId || meeting.faculty || '', meeting.startTime || '', meeting.endTime || '',
    [...(meeting.days ?? [])].sort(), meeting.format || '', meeting.modality || ''])
}

export function readRegistrarPlot(value: unknown): RegistrarPlot | undefined {
  if (!value || typeof value !== 'object') return
  const data = value as Record<string, unknown>
  if (data.version !== 1 || typeof data.revisionId !== 'string' || typeof data.savedBy !== 'string' || !Array.isArray(data.assignments)) return
  const assignments: PlottedRoom[] = []
  for (const item of data.assignments) {
    if (!item || typeof item !== 'object') return
    const room = item as Record<string, unknown>
    if (![room.key, room.roomId, room.room, room.buildingId].every(field => typeof field === 'string')) return
    assignments.push({ key: String(room.key), roomId: String(room.roomId), room: String(room.room), buildingId: String(room.buildingId) })
  }
  if (data.providedRoomKeys !== undefined && (!Array.isArray(data.providedRoomKeys) || data.providedRoomKeys.some(key => typeof key !== 'string'))) return
  return { version: 1, revisionId: data.revisionId, assignments, savedBy: data.savedBy,
    ...(Array.isArray(data.providedRoomKeys) ? { providedRoomKeys: data.providedRoomKeys as string[] } : {}) }
}

export function hasPendingRoomAllocation(meetings: readonly WorkbookScheduleMeeting[]): boolean {
  const physical = meetings.filter(m => !m.modality || m.modality === 'F2F' || m.modality === 'Unspecified')
  return !meetings.length || (physical.length ? physical : meetings).some(m => !m.roomId)
}

export function plottedScheduleFields(meetings: WorkbookScheduleMeeting[]) {
  const first = meetings[0]
  const physical = meetings.filter(m => !m.modality || m.modality === 'F2F' || m.modality === 'Unspecified')
  const resources = (format: WorkbookScheduleMeeting['format']) => physical.filter(m => m.format === format).map(m => m.room)
  return {
    meetings, status: meetings.some(m => m.roomId) ? 'Plot' as const : 'Draft' as const,
    roomId: first?.roomId ?? '', buildingId: first?.buildingId ?? '',
    roomIds: [...new Set(meetings.map(m => m.roomId).filter(Boolean))],
    f2fRoom: { lec: resources('Lec'), lab: resources('Lab'),
      ...(meetings.some(m => m.format === 'Flexible') ? { flexible: resources('Flexible') } : {}),
      ...(meetings.some(m => m.format === 'Unspecified') ? { unspecified: resources('Unspecified') } : {}) },
  }
}

/** Legacy templates preserve plotted rooms over TBA; authoritative room cells disable that fallback. */
export function retainRegistrarRooms(row: WorkbookScheduleRow, previous?: Record<string, unknown>, preserveUnassigned = true): WorkbookScheduleRow & { registrarPlot?: RegistrarPlot; plottedBy?: unknown; plottedAt?: unknown } {
  let plot = readRegistrarPlot(previous?.registrarPlot)
  // Preserve rooms assigned before the Registrar metadata was introduced too.
  // An explicit empty registrarPlot means the Registrar cleared the rooms.
  if (preserveUnassigned && !plot && previous?.registrarPlot === undefined && !previous?.roomSourceSheet && Array.isArray(previous?.meetings)) {
    const assignments = previous.meetings.flatMap((value: unknown): PlottedRoom[] => {
      if (!value || typeof value !== 'object') return []
      const meeting = value as Partial<WorkbookScheduleMeeting>
      if (typeof meeting.roomId !== 'string' || !meeting.roomId || !Array.isArray(meeting.days) || meeting.days.some(day => typeof day !== 'string')) return []
      const key = plotMeetingKey(meeting)
      if (!row.meetings.some(current => plotMeetingKey(current) === key && !current.roomId && ['', 'TBA', 'N/A', '-'].includes(current.room.trim().toUpperCase()))) return []
      return [{ key, roomId: meeting.roomId, room: typeof meeting.room === 'string' ? meeting.room : 'TBA', buildingId: typeof meeting.buildingId === 'string' ? meeting.buildingId : '' }]
    })
    if (assignments.length) plot = { version: 1, revisionId: `retained:${String(previous.workbookRevisionId ?? '')}`, savedBy: String(previous.plottedBy ?? previous.savedBy ?? ''), assignments }
  }
  if (!plot) return row
  const assignments = plot.assignments.filter(assignment => row.meetings.some(m => plotMeetingKey(m) === assignment.key && ((preserveUnassigned && !m.roomId) || m.roomId === assignment.roomId)))
  const meetings = row.meetings.map(meeting => {
    const assignment = assignments.find(item => item.key === plotMeetingKey(meeting))
    return assignment && !meeting.roomId && ['', 'TBA', 'N/A', '-'].includes(meeting.room.trim().toUpperCase())
      ? { ...meeting, roomId: assignment.roomId, room: assignment.room, buildingId: assignment.buildingId } : meeting
  })
  const fields = plottedScheduleFields(meetings)
  return { ...row, ...fields, registrarPlot: { ...plot, assignments },
    ...(previous?.plottedBy !== undefined ? { plottedBy: previous.plottedBy } : {}),
    ...(previous?.plottedAt !== undefined ? { plottedAt: previous.plottedAt } : {}),
    validationIssues: row.validationIssues.filter(issue => issue !== 'Room allocation is pending.' || hasPendingRoomAllocation(meetings)) }
}

const minutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : NaN
}

export function assertPlotRoom(meeting: Pick<WorkbookScheduleMeeting, 'startTime' | 'endTime' | 'days'>, room: PlotRoom, maxStudents: number | null): void {
  if (room.status !== 'Available') throw new Error(`${room.code || room.name} is not available for plotting.`)
  const start = minutes(meeting.startTime), end = minutes(meeting.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !meeting.days.length) throw new Error('This meeting has invalid days or times.')
  const available = room.availableDays.map(day => day.slice(0, 3).toLowerCase())
  if (meeting.days.some(day => !available.includes(day.slice(0, 3).toLowerCase()))
    || !Number.isFinite(minutes(room.startTime)) || !Number.isFinite(minutes(room.endTime))
    || start < minutes(room.startTime) || end > minutes(room.endTime)) throw new Error(`${room.code || room.name} is outside its available days or hours for this meeting.`)
  if (maxStudents !== null && maxStudents > room.capacity) throw new Error(`${room.code || room.name} does not have enough capacity for this class.`)
}

export function plotMeetingsOverlap(left: Pick<ScheduleMeetingRecord, 'roomId' | 'days' | 'startTime' | 'endTime'>,
  right: Pick<ScheduleMeetingRecord, 'roomId' | 'days' | 'startTime' | 'endTime'>): boolean {
  return Boolean(left.roomId && left.roomId === right.roomId && Array.isArray(left.days) && Array.isArray(right.days) && left.days.some(day => right.days?.includes(day))
    && minutes(left.startTime ?? '') < minutes(right.endTime ?? '') && minutes(right.startTime ?? '') < minutes(left.endTime ?? ''))
}
