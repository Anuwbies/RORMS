import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { schedulePlottingPhases } from '../utils/departmentWorkbookPermissions'
import { semesterKey } from '../utils/departmentWorkbookPaths'
import type { AcademicYearData } from '../utils/academicSemester'
import type { ScheduleMeetingRecord } from '../utils/scheduleMeetings'
import { assignedSchedulePlotStatus, isProvidedScheduleRoom, plotSelectionActionMode, plotSelectionDirectionLocked, savedMeetingPlotStatus, schedulePlotSelectionKey, toggleAssignedSchedulePlot, type PlotAssignment, type PlotRoom } from '../utils/schedulePlotting'
import { plotScheduleRooms, readPlotRoom } from '../services/plotScheduleRooms'
import { createPlotSelectionHistory, movePlotSelectionHistory, recordPlotSelection } from '../utils/plotSelectionHistory'
import { parallelPlotCheckboxState, stagePlotRoomSelections, toggleParallelSchedulePlot } from '../utils/plotParallelRooms'

export interface SchedulePlottingOptions { membershipId: string; departmentCode: string }
export interface SchedulePlotSectionScope { departmentId: string; yearLevel: number; label: string }

export function useScheduleRoomPlotting(options: SchedulePlottingOptions | undefined, isOpen: boolean, year: AcademicYearData | null,
  semester: string, instructorIds: string[], scheduleCollection: 'schedule' | 'schedules' = 'schedule', sectionScope?: SchedulePlotSectionScope) {
  const [rooms, setRooms] = useState<PlotRoom[]>([])
  const [ready, setReady] = useState(false)
  const [history, setHistory] = useState(createPlotSelectionHistory)
  const pending = history.present
  const actionMode = plotSelectionActionMode(pending)
  const setPending = (update: (previous: Map<string, PlotAssignment>) => Map<string, PlotAssignment>) => {
    setHistory(previous => recordPlotSelection(previous, update(previous.present)))
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  const context = JSON.stringify([auth.currentUser?.uid, options?.membershipId, options?.departmentCode, isOpen, year?.id, semester, instructorIds, scheduleCollection, sectionScope])
  const currentContext = useRef(context)
  currentContext.current = context

  useEffect(() => { setHistory(createPlotSelectionHistory()); setError(''); setMessage('') }, [context])
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
  const roomChoices = useMemo(() => [...rooms].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), [rooms])
  const labels = useMemo(() => new Map(rooms.map(room => [room.id, room.name.trim() || 'Unnamed room'])), [rooms])
  const key = schedulePlotSelectionKey
  const selected = (meeting: ScheduleMeetingRecord) => pending.get(key(meeting))?.roomId ?? meeting.roomId ?? ''
  const selectGroup = (assignments: readonly { meeting: ScheduleMeetingRecord; roomId: string }[]) => {
    if (!permitted || busy.current || actionMode === 'unplot') return
    if (assignments.some(({ meeting }) => scheduleCollection === 'schedules' && isProvidedScheduleRoom(meeting))) return
    setError(''); setMessage('')
    setPending(previous => stagePlotRoomSelections(previous, assignments))
  }
  const select = (meeting: ScheduleMeetingRecord, roomId: string) => selectGroup([{ meeting, roomId }])
  const marked = (meeting: ScheduleMeetingRecord, day?: string) => assignedSchedulePlotStatus(pending, meeting, day) === 'Plot'
  const toggleMarked = (meeting: ScheduleMeetingRecord, validationErrors: readonly string[] = [], day?: string) => {
    if (!permitted || busy.current) return
    if (plotSelectionDirectionLocked(actionMode, marked(meeting, day), savedMeetingPlotStatus(meeting, day) === 'Plot')) return
    if (validationErrors.length && !marked(meeting, day) && !(actionMode === 'unplot' && savedMeetingPlotStatus(meeting, day) === 'Plot')) {
      setError(validationErrors[0]); return
    }
    setError(''); setMessage('')
    setPending(previous => toggleAssignedSchedulePlot(previous, meeting, day))
  }
  const toggleMarkedGroup = (meetings: readonly ScheduleMeetingRecord[], validationErrors: readonly string[] = [], day?: string) => {
    if (!permitted || !ready || busy.current) return
    const checked = parallelPlotCheckboxState(meetings, rooms, pending, day).checked
    const savedPlotted = meetings.every(meeting => savedMeetingPlotStatus(meeting, day) === 'Plot')
    if (plotSelectionDirectionLocked(actionMode, checked, savedPlotted)) return
    if (validationErrors.length && !checked && !(actionMode === 'unplot' && savedPlotted)) {
      setError(validationErrors[0]); return
    }
    setError(''); setMessage('')
    setPending(previous => toggleParallelSchedulePlot(previous, meetings, rooms, day))
  }
  const changeHistory = (redo: boolean) => {
    if (!options || !isOpen || !permitted || !ready || busy.current) return
    setError(''); setMessage('')
    setHistory(previous => movePlotSelectionHistory(previous, redo))
  }
  const needsParallelApproval = [...pending.values()].some(assignment => assignment.parallelGroupKey && !assignment.targetStatus)
  const needsPlotApproval = needsParallelApproval || scheduleCollection === 'schedules'
    && [...pending.values()].some(assignment => assignment.roomId && !assignment.targetStatus
      && ![...pending.values()].some(other => other.scheduleId === assignment.scheduleId && other.meetingKey === assignment.meetingKey && other.targetStatus))
  const save = async () => {
    if (!options || !year || !permitted || !pending.size || busy.current) return null
    if (needsParallelApproval) { setError('Check the completed parallel group checkbox before clicking Plot.'); return null }
    if (needsPlotApproval) { setError('Check each schedule checkbox before clicking Plot.'); return null }
    busy.current = true; setSaving(true); setError(''); setMessage('')
    const startedContext = context
    const returnedToDraft = [...pending.values()].some(assignment => assignment.targetStatus === 'Draft')
    const clearedRoom = [...pending.values()].some(assignment => !assignment.roomId)
    try {
      await plotScheduleRooms({ ...options, academicYearId: year.id, academicYear: year.academicYear, semester, instructorIds, assignments: [...pending.values()], scheduleCollection, sectionScope })
      if (currentContext.current === startedContext) {
        setHistory(createPlotSelectionHistory())
        setMessage(returnedToDraft || clearedRoom ? 'Schedules updated.' : 'Schedules plotted.')
        return returnedToDraft ? 'unplotted' as const : clearedRoom ? 'updated' as const : 'plotted' as const
      }
      return null
    } catch (caught) {
      if (currentContext.current === startedContext) setError(caught instanceof Error ? caught.message : 'Rooms could not be plotted. Try again.')
      return null
    } finally { busy.current = false; setSaving(false) }
  }
  return { enabled: Boolean(options), permitted, ready, saving, error, message,
    pendingCount: new Set([...pending.values()].map(assignment => assignment.scheduleId)).size, labels,
    pending, rooms, actionMode, needsParallelApproval, needsPlotApproval, hasDraftChanges: [...pending.values()].some(assignment => assignment.targetStatus === 'Draft' || !assignment.roomId),
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    undo: () => changeHistory(false), redo: () => changeHistory(true),
    roomOptions: [...roomChoices.map(room => room.id), ''], selected, select, selectGroup, marked, toggleMarked, toggleMarkedGroup, save }
}
