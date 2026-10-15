import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { schedulePlottingPhases } from '../utils/departmentWorkbookPermissions'
import { semesterKey } from '../utils/departmentWorkbookPaths'
import type { AcademicYearData } from '../utils/academicSemester'
import type { ScheduleMeetingRecord } from '../utils/scheduleMeetings'
import { plotMeetingKey, plotScheduleRevision, schedulePlotSelectionKey, toggleAssignedSchedulePlot, type PlotAssignment, type PlotRoom } from '../utils/schedulePlotting'
import { plotScheduleRooms, readPlotRoom } from '../services/plotScheduleRooms'

export interface SchedulePlottingOptions { membershipId: string; departmentCode: string }

export function useScheduleRoomPlotting(options: SchedulePlottingOptions | undefined, isOpen: boolean, year: AcademicYearData | null,
  semester: string, instructorIds: string[], scheduleCollection: 'schedule' | 'schedules' = 'schedule') {
  const [rooms, setRooms] = useState<PlotRoom[]>([])
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<Map<string, PlotAssignment>>(new Map())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const context = JSON.stringify([options?.membershipId, options?.departmentCode, isOpen, year?.id, semester, instructorIds, scheduleCollection])
  const currentContext = useRef(context)
  currentContext.current = context

  useEffect(() => { setPending(new Map()); setError(''); setMessage('') }, [context])
  useEffect(() => {
    setReady(false)
    if (!options || !isOpen) return
    return onSnapshot(collection(db, 'rooms'), snapshot => {
      setRooms(snapshot.docs.map(room => readPlotRoom(room.id, room.data())))
      setReady(true)
    }, () => { setReady(false); setError('Rooms could not be loaded. Close and reopen the schedule to retry.') })
  }, [options?.membershipId, Boolean(options), isOpen])

  const phase = year?.[semesterKey(semester)]?.phase ?? 'Closed'
  const permitted = Boolean(options?.membershipId && auth.currentUser && schedulePlottingPhases('Registrar').includes(phase))
  const availableRooms = useMemo(() => rooms.filter(room => room.status === 'Available').sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [rooms])
  const labels = new Map(rooms.map(room => [room.id, room.name.trim() || 'Unnamed room']))
  const key = schedulePlotSelectionKey
  const selected = (meeting: ScheduleMeetingRecord) => pending.get(key(meeting))?.roomId ?? meeting.roomId ?? ''
  const select = (meeting: ScheduleMeetingRecord, roomId: string) => {
    if (!permitted || busy.current) return
    if (meeting.status === 'Draft' && meeting.roomId) return
    setError(''); setMessage('')
    setPending(previous => {
      const next = new Map(previous)
      const id = key(meeting)
      const existing = next.get(id)
      const expectedRoomId = existing?.expectedRoomId ?? meeting.roomId ?? ''
      if (roomId === expectedRoomId) next.delete(id)
      else next.set(id, { scheduleId: String(meeting.sourceScheduleId || meeting.id), meetingKey: plotMeetingKey(meeting as Parameters<typeof plotMeetingKey>[0]), roomId,
        expectedRoomId, expectedRevision: existing?.expectedRevision ?? plotScheduleRevision(meeting) })
      return next
    })
  }
  const marked = (meeting: ScheduleMeetingRecord) => meeting.status === 'Plot' || pending.has(key(meeting))
  const toggleMarked = (meeting: ScheduleMeetingRecord) => {
    if (!permitted || busy.current) return
    setError(''); setMessage('')
    setPending(previous => toggleAssignedSchedulePlot(previous, meeting))
  }
  const save = async () => {
    if (!options || !year || !permitted || !pending.size || busy.current) return
    busy.current = true; setSaving(true); setError(''); setMessage('')
    const startedContext = context
    try {
      await plotScheduleRooms({ ...options, academicYearId: year.id, academicYear: year.academicYear, semester, instructorIds, assignments: [...pending.values()], scheduleCollection })
      if (currentContext.current === startedContext) { setPending(new Map()); setMessage('Schedules plotted.') }
    } catch (caught) {
      if (currentContext.current === startedContext) setError(caught instanceof Error ? caught.message : 'Rooms could not be plotted. Try again.')
    } finally { busy.current = false; setSaving(false) }
  }
  return { enabled: Boolean(options), permitted, ready, saving, error, message,
    pendingCount: new Set([...pending.values()].map(assignment => assignment.scheduleId)).size, labels,
    roomOptions: ['', ...availableRooms.map(room => room.id)], selected, select, marked, toggleMarked, save }
}
