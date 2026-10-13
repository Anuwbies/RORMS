import type { WorkbookScheduleMeeting, WorkbookScheduleRow } from './excelScheduleRows'

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
}

export interface PlottedRoom { key: string; roomId: string; room: string; buildingId: string }
export interface RegistrarPlot { version: 1; revisionId: string; assignments: PlottedRoom[]; savedBy: string }
export interface PlotAssignment {
  scheduleId: string
  meetingKey: string
  roomId: string
  expectedRoomId: string
  expectedRevision: string
}

export const plotScheduleRevision = (schedule: Record<string, unknown>) => JSON.stringify([
  schedule.workbookRevisionId ?? '', readRegistrarPlot(schedule.registrarPlot)?.revisionId ?? '',
])

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
  return { version: 1, revisionId: data.revisionId, assignments, savedBy: data.savedBy }
}

export function plottedScheduleFields(meetings: WorkbookScheduleMeeting[]) {
  const first = meetings[0]
  const physical = meetings.filter(m => !m.modality || m.modality === 'F2F' || m.modality === 'Unspecified')
  const resources = (format: WorkbookScheduleMeeting['format']) => physical.filter(m => m.format === format).map(m => m.room || 'TBA')
  return {
    meetings, status: meetings.length && (physical.length ? physical.every(m => m.roomId) : meetings.every(m => m.roomId)) ? 'Plot' as const : 'Draft' as const,
    roomId: first?.roomId ?? '', buildingId: first?.buildingId ?? '',
    roomIds: [...new Set(meetings.map(m => m.roomId).filter(Boolean))],
    f2fRoom: { lec: resources('Lec'), lab: resources('Lab'),
      ...(meetings.some(m => m.format === 'Flexible') ? { flexible: resources('Flexible') } : {}),
      ...(meetings.some(m => m.format === 'Unspecified') ? { unspecified: resources('Unspecified') } : {}) },
  }
}

/** Template TBA values must not erase rooms plotted by the Registrar. */
export function retainRegistrarRooms(row: WorkbookScheduleRow, previous?: Record<string, unknown>): WorkbookScheduleRow & { registrarPlot?: RegistrarPlot; plottedBy?: unknown; plottedAt?: unknown } {
  let plot = readRegistrarPlot(previous?.registrarPlot)
  // Preserve rooms assigned before the Registrar metadata was introduced too.
  // An explicit empty registrarPlot means the Registrar cleared the rooms.
  if (!plot && previous?.registrarPlot === undefined && !previous?.roomSourceSheet && Array.isArray(previous?.meetings)) {
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
  const assignments = plot.assignments.filter(assignment => row.meetings.some(m => plotMeetingKey(m) === assignment.key && (!m.roomId || m.roomId === assignment.roomId)))
  const meetings = row.meetings.map(meeting => {
    const assignment = assignments.find(item => item.key === plotMeetingKey(meeting))
    return assignment && !meeting.roomId && ['', 'TBA', 'N/A', '-'].includes(meeting.room.trim().toUpperCase())
      ? { ...meeting, roomId: assignment.roomId, room: assignment.room, buildingId: assignment.buildingId } : meeting
  })
  const fields = plottedScheduleFields(meetings)
  return { ...row, ...fields, registrarPlot: { ...plot, assignments },
    ...(previous?.plottedBy !== undefined ? { plottedBy: previous.plottedBy } : {}),
    ...(previous?.plottedAt !== undefined ? { plottedAt: previous.plottedAt } : {}),
    validationIssues: row.validationIssues.filter(issue => issue !== 'Room allocation is pending.' || fields.status !== 'Plot') }
}

const minutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  return match && +match[1] < 24 && +match[2] < 60 ? +match[1] * 60 + +match[2] : NaN
}

export function assertPlotRoom(meeting: WorkbookScheduleMeeting, room: PlotRoom, maxStudents: number | null): void {
  if (room.status !== 'Available') throw new Error(`${room.code || room.name} is not available for plotting.`)
  const start = minutes(meeting.startTime), end = minutes(meeting.endTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !meeting.days.length) throw new Error('This meeting has invalid days or times.')
  const available = room.availableDays.map(day => day.slice(0, 3).toLowerCase())
  if (meeting.days.some(day => !available.includes(day.slice(0, 3).toLowerCase()))
    || !Number.isFinite(minutes(room.startTime)) || !Number.isFinite(minutes(room.endTime))
    || start < minutes(room.startTime) || end > minutes(room.endTime)) throw new Error(`${room.code || room.name} is outside its available days or hours for this meeting.`)
  if (maxStudents !== null && maxStudents > room.capacity) throw new Error(`${room.code || room.name} does not have enough capacity for this class.`)
}

export function plotMeetingsOverlap(left: WorkbookScheduleMeeting, right: WorkbookScheduleMeeting): boolean {
  return Boolean(left.roomId && left.roomId === right.roomId && Array.isArray(left.days) && Array.isArray(right.days) && left.days.some(day => right.days.includes(day))
    && minutes(left.startTime) < minutes(right.endTime) && minutes(right.startTime) < minutes(left.endTime))
}
