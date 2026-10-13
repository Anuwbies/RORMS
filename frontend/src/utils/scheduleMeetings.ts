export interface ScheduleMeetingRecord extends Record<string, unknown> {
  id: string
  parentId?: string
  instructorId?: string
  roomId?: string
  buildingId?: string
  format?: string
  startTime?: string
  endTime?: string
  days?: string[]
  orderIndex?: number
  subjectCode?: string
  subjectTitle?: string
  classSection?: string
  academicYear?: string
  semester?: string
  status?: string
}

interface ScheduleDocument { id: string; data: () => Record<string, unknown> }
const text = (value: unknown) => typeof value === 'string' ? value : ''

// One stored row can supply multiple calendar/resource entries. Legacy documents remain supported.
export function scheduleMeetingRecords(documents: readonly ScheduleDocument[]): ScheduleMeetingRecord[] {
  return documents.flatMap(document => {
    const data = document.data()
    const row = { ...data, id: text(data.id) || document.id } as ScheduleMeetingRecord
    if (data.source !== 'workbook' || data.schemaVersion !== 2 || !Array.isArray(data.meetings) || !data.meetings.length) return [row]
    const meetings: unknown[] = data.meetings
    return meetings.filter((meeting): meeting is Record<string, unknown> => Boolean(meeting && typeof meeting === 'object' && !Array.isArray(meeting))).map((meeting, index) => ({
      ...row, ...meeting,
      id: index === 0 ? row.id : `${row.id}:meeting:${index}`, sourceScheduleId: document.id,
      parentId: index === 0 ? '' : row.id,
      orderIndex: (typeof row.orderIndex === 'number' ? row.orderIndex : 0) + index / 1000,
      instructorId: text(meeting.instructorId), roomId: text(meeting.roomId), buildingId: text(meeting.buildingId),
      startTime: text(meeting.startTime), endTime: text(meeting.endTime), format: text(meeting.format),
      days: Array.isArray(meeting.days) ? meeting.days.filter((day: unknown) => typeof day === 'string') : [],
    }))
  })
}
