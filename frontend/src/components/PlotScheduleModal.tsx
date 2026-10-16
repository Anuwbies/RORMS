import { useState, useEffect, useMemo, useRef, type ReactNode, type PointerEvent, type FocusEvent, type KeyboardEvent } from 'react'
import { CalendarIcon, SpinnerIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, CheckIcon } from './Icons'
import { db, auth } from '../firebase'
import { scheduleMeetingRecords, type ScheduleMeetingRecord } from '../utils/scheduleMeetings'
import { useScheduleRoomPlotting, type SchedulePlottingOptions } from '../hooks/useScheduleRoomPlotting'
import { roomScheduleInstructor, roomScheduleLabel, roomScheduleRoom, roomScheduleSection, scheduleMatchesTerm } from '../utils/roomSchedule'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { Button } from './Button'
import { ExtendedReservationBadge } from './ExtendedReservationBadge'
import { SingleSelectDropdown } from './SingleSelectDropdown'
import { DatePicker } from './DatePicker'
import { ExcelValidationTooltip } from './ExcelValidationTooltip'
import { scheduleRoomOverlapMessages } from '../utils/scheduleRoomOverlaps'
import { isProvidedScheduleRoom, schedulePlotSelectionKey } from '../utils/schedulePlotting'
import { plotParallelRoomGroupRecommendations, plotRoomRecommendations, type PlotParallelRoomGroupOption } from '../utils/plotRoomRecommendations'
import { parallelPlotCheckboxState, plotParallelGroup, plotParallelRoomMessages } from '../utils/plotParallelRooms'
import { scheduleRoomStatusIssue } from '../utils/ScheduleValidation'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

import type { ScheduleMemberInfo } from '../types/scheduleMember'

export interface PlotScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onBack?: () => void
  member?: ScheduleMemberInfo | null
  initialAcademicYear?: string
  initialSemester?: string
  actionButton?: ReactNode
  hideFilters?: boolean
  showWeekCalendar?: boolean
  showStatusColors?: boolean
  isInline?: boolean
  hideReturnedSchedules?: boolean
  scheduleStatuses?: readonly ('Draft' | 'Plot')[]
  hideReservationIdentity?: boolean
  plotting?: SchedulePlottingOptions
}

import {
  resolveCurrentSemester,
  getMonthIndexByName,
  type AcademicYearData,
  type SemesterInfo,
  MONTH_NAMES
} from '../utils/academicSemester'


const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// Standard 1h 30mins whole day schedule intervals (07:30 to 18:00)
const STANDARD_TIME_SLOTS = [
  '07:30-09:00',
  '09:00-10:30',
  '10:30-12:00',
  '12:00-13:30',
  '13:30-15:00',
  '15:00-16:30',
  '16:30-18:00',
]

function getLocalIsoDate(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function computeWeekInfo(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const baseDate = new Date(y, m - 1, d)
  baseDate.setHours(0, 0, 0, 0)

  const dayOfWeek = baseDate.getDay()
  const diffToSun = -dayOfWeek

  const sunday = new Date(baseDate)
  sunday.setDate(baseDate.getDate() + diffToSun)

  const todayIso = getLocalIsoDate(new Date())

  const weekDays = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const).map((dayName, idx) => {
    const current = new Date(sunday)
    current.setDate(sunday.getDate() + idx)
    const isoString = getLocalIsoDate(current)
    const monthShort = current.toLocaleDateString('en-US', { month: 'short' })
    const dayNum = current.getDate()
    return {
      dayName,
      date: current,
      isoString,
      formattedShort: `${monthShort} ${dayNum}`,
      isToday: isoString === todayIso
    }
  })

  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)

  const isCurrentWeek = weekDays.some(d => d.isToday)
  const label = `${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${saturday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return {
    sunday,
    saturday,
    monday: sunday,
    weekDays,
    isCurrentWeek,
    label
  }
}

const normalizeDay = (day: string): string => {
  if (!day) return ''
  const trimmed = day.trim()
  if (trimmed.startsWith('Mon')) return 'Mon'
  if (trimmed.startsWith('Tue')) return 'Tue'
  if (trimmed.startsWith('Wed')) return 'Wed'
  if (trimmed.startsWith('Thu')) return 'Thu'
  if (trimmed.startsWith('Fri')) return 'Fri'
  if (trimmed.startsWith('Sat')) return 'Sat'
  if (trimmed.startsWith('Sun')) return 'Sun'
  return trimmed
}

const padTime = (t: string) => {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${h.padStart(2, '0')}:${m ? m.padStart(2, '0') : '00'}`
}

const timeToMins = (t: string) => {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const isScheduleInSlot = (schedule: any, slot: string) => {
  if (!schedule.startTime || !schedule.endTime) return false
  const [slotStart, slotEnd] = slot.split('-')
  const schedStart = padTime(schedule.startTime)
  const schedEnd = padTime(schedule.endTime)

  // Direct exact match
  if (`${schedStart}-${schedEnd}` === slot) return true

  // Overlap calculation: schedule starts before slot ends AND schedule ends after slot starts
  const schedStartMins = timeToMins(schedStart)
  const schedEndMins = timeToMins(schedEnd)
  const slotStartMins = timeToMins(slotStart)
  const slotEndMins = timeToMins(slotEnd)

  return schedStartMins < slotEndMins && schedEndMins > slotStartMins
}

const formatTime = (time: string) => {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hours = parseInt(h, 10)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${(m || '00').padStart(2, '0')} ${suffix}`
}

const scheduleSectionLabel = (schedule: { classSection?: string; course?: unknown; sourceKey?: unknown; yearLevel?: unknown }) => {
  const section = roomScheduleSection(schedule)
  const year = schedule.yearLevel
  if (typeof schedule.sourceKey !== 'string' || typeof year !== 'number' || !Number.isInteger(year) || year <= 0) return section
  const suffix = year % 100 >= 11 && year % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][year % 10] ?? 'th'
  return `${year}${suffix} Year - ${section}`
}

const scheduleCardLabel = (schedule: Parameters<typeof roomScheduleLabel>[0] & { college?: unknown }) => {
  const college = typeof schedule.college === 'string' ? schedule.college.trim() : ''
  return college || roomScheduleLabel(schedule)
}

export function PlotScheduleModal({
  isOpen,
  onClose,
  onBack,
  member,
  initialAcademicYear,
  initialSemester,
  actionButton,
  hideFilters,
  showWeekCalendar,
  isInline = false,
  hideReturnedSchedules = false,
  scheduleStatuses,
  hideReservationIdentity = false,
  plotting
}: PlotScheduleModalProps) {
  const isInstructorMode = Boolean(member)
  const memberId = member?.id
  const memberUserId = member?.userId
  const memberMembershipId = member?.membershipId
  const memberRole = member?.role

  const [schedules, setSchedules] = useState<any[]>([])
  const [allSchedules, setAllSchedules] = useState<ScheduleMeetingRecord[]>([])
  const [overlapHover, setOverlapHover] = useState<{ ids: string[]; anchor: { left: number; right: number; top: number; bottom: number } } | null>(null)
  const [reservations, setReservations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [scheduleLoadError, setScheduleLoadError] = useState('')
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester || '1st Semester')
  const [instructorsMap, setInstructorsMap] = useState<Map<string, string>>(new Map())
  const [userDepartmentMap, setUserDepartmentMap] = useState<Map<string, string>>(new Map())
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map())
  const roomPlot = useScheduleRoomPlotting(plotting, isOpen && isInstructorMode, selectedAcademicYear, selectedSemester,
    [memberMembershipId, memberId, memberUserId].filter((id): id is string => Boolean(id)), 'schedules')
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => getLocalIsoDate())

  // Reset to today when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedWeekDate(getLocalIsoDate())
    }
  }, [isOpen])

  const weekInfo = useMemo(() => {
    return computeWeekInfo(selectedWeekDate)
  }, [selectedWeekDate])

  // Limit week calendar to start from the current week up to the end of next month
  const { minDate, maxDate, currentWeekSundayIso } = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const diffToSun = -now.getDay()
    const currentWeekSunday = new Date(now)
    currentWeekSunday.setDate(now.getDate() + diffToSun)

    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)
    nextMonthEnd.setHours(23, 59, 59, 999)

    return {
      minDate: getLocalIsoDate(currentWeekSunday),
      maxDate: getLocalIsoDate(nextMonthEnd),
      currentWeekSundayIso: getLocalIsoDate(currentWeekSunday)
    }
  }, [])

  const isPrevDisabled = useMemo(() => {
    if (!currentWeekSundayIso) return false
    const prevDate = new Date(weekInfo.sunday)
    prevDate.setDate(prevDate.getDate() - 7)
    return getLocalIsoDate(prevDate) < currentWeekSundayIso
  }, [weekInfo.sunday, currentWeekSundayIso])

  const isNextDisabled = useMemo(() => {
    if (!maxDate) return false
    const nextDate = new Date(weekInfo.sunday)
    nextDate.setDate(nextDate.getDate() + 7)
    return getLocalIsoDate(nextDate) > maxDate
  }, [weekInfo.sunday, maxDate])

  const selectedDayName = useMemo(() => {
    if (!showWeekCalendar) return null
    const matched = weekInfo.weekDays.find(w => w.isoString === selectedWeekDate)
    return matched?.dayName || null
  }, [showWeekCalendar, weekInfo.weekDays, selectedWeekDate])

  // 1. Fetch Academic Years
  useEffect(() => {
    if (!isOpen) return

    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const years = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearData))
      years.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(years)

      if (years.length > 0) {
        let yearToSelect: AcademicYearData | null = null
        if (initialAcademicYear) {
          yearToSelect = years.find(y => y.academicYear === initialAcademicYear) || null
        }
        if (!yearToSelect) {
          yearToSelect = years.find(y => y.isActive) || years[0]
        }
        setSelectedAcademicYear(yearToSelect)

        if (!initialSemester) {
          setSelectedSemester(resolveCurrentSemester(yearToSelect))
        }
      }
    })

    return () => unsubscribe()
  }, [isOpen, initialAcademicYear, initialSemester])

  useEffect(() => {
    if (initialSemester) {
      setSelectedSemester(initialSemester)
    } else if (selectedAcademicYear) {
      setSelectedSemester(resolveCurrentSemester(selectedAcademicYear))
    }
  }, [initialSemester, selectedAcademicYear])

  // 3. Fetch Rooms (for Instructor mode)
  useEffect(() => {
    if (!isOpen || !isInstructorMode) return

    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snap) => {
      const map = new Map<string, string>()
      snap.forEach(doc => {
        const data = doc.data()
        map.set(doc.id, data.name || data.code || 'Room')
      })
      setRoomsMap(map)
    })

    return () => unsubscribe()
  }, [isOpen, isInstructorMode])

  // 4. Fetch Schedules in Real-Time
  useEffect(() => {
    setScheduleLoadError('')
    setAllSchedules([])
    if (!isOpen) {
      setSchedules([])
      setIsLoading(false)
      return
    }

    

    if (isInstructorMode) {
      if (memberRole === 'Dean') {
        setSchedules([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const validInstructorIds = [memberMembershipId, memberId, memberUserId].filter(Boolean) as string[]

      let schedulesLoaded = false
      let reservationsLoaded = !showWeekCalendar

      const q = query(collection(db, 'schedules'))

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const allMeetings = scheduleMeetingRecords(snapshot.docs)
        setAllSchedules(allMeetings)
        const fetched = allMeetings.filter(item => Boolean(item.instructorId && validInstructorIds.includes(item.instructorId)))
        fetched.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
        setSchedules(fetched)
        setScheduleLoadError('')
        schedulesLoaded = true
        if (reservationsLoaded) setIsLoading(false)
      }, (err) => {
        console.error('Error loading instructor schedules:', err)
        setAllSchedules([])
        setSchedules([])
        setScheduleLoadError('The instructor schedule could not be loaded. Close and reopen the schedule to retry.')
        schedulesLoaded = true
        if (reservationsLoaded) setIsLoading(false)
      })

      let unsubscribeReservations: (() => void) | null = null
      if (showWeekCalendar) {
        const qReservations = query(collection(db, 'reservations'))
        unsubscribeReservations = onSnapshot(qReservations, (snapshot) => {
          const fetched = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((r: any) => 
              (validInstructorIds.includes(r.userId) || validInstructorIds.includes(r.instructorId)) &&
              (r.status === 'Approved' || r.status === 'Pending' || r.status === 'Recommending Approval')
            )
          setReservations(fetched)
          reservationsLoaded = true
          if (schedulesLoaded) setIsLoading(false)
        }, (err) => {
          console.error('Error loading instructor reservations:', err)
          setReservations([])
          reservationsLoaded = true
          if (schedulesLoaded) setIsLoading(false)
        })
      } else {
        setReservations([])
        reservationsLoaded = true
        if (schedulesLoaded) setIsLoading(false)
      }

      return () => {
        unsubscribe()
        if (unsubscribeReservations) unsubscribeReservations()
      }
    }

    setSchedules([])
    setIsLoading(false)
  }, [isOpen, isInstructorMode, memberMembershipId, memberId, memberUserId, memberRole, showWeekCalendar])

  // 5. Filter Schedules by Academic Year & Semester
  const filteredSchedules = useMemo(() => {
    if (!schedules.length) return []
    return schedules.filter(s => {
      if (!scheduleMatchesTerm(s, selectedAcademicYear, selectedSemester)) return false
      const status = s.status || 'Draft'
      
      const allowedStatuses: readonly string[] = scheduleStatuses ?? (hideReturnedSchedules
        ? ['Draft', 'Drafted', 'Plot', 'Plotted', 'Revise', 'Revised']
        : ['Draft', 'Drafted', 'Plot', 'Plotted', 'Revise', 'Revised', 'Return', 'Returned'])
      
      if (!allowedStatuses.includes(status)) return false
      return true
    })
  }, [schedules, selectedAcademicYear?.id, selectedAcademicYear?.academicYear, selectedSemester, hideReturnedSchedules, scheduleStatuses])

  const getMeetingStatus = (meeting: { status?: string }) => meeting.status || 'Draft'

  const proposedMeetings = useMemo<ScheduleMeetingRecord[]>(() => allSchedules.filter(meeting => scheduleMatchesTerm(meeting, selectedAcademicYear, selectedSemester))
    .map(meeting => ({ ...meeting, roomId: roomPlot.pending.get(schedulePlotSelectionKey(meeting))?.roomId ?? meeting.roomId })),
  [allSchedules, selectedAcademicYear, selectedSemester, roomPlot.pending])
  const roomRecommendations = useMemo(() => roomPlot.enabled
    ? plotRoomRecommendations(proposedMeetings, roomPlot.rooms, filteredSchedules) : new Map<string, readonly string[]>(),
  [proposedMeetings, roomPlot.rooms, filteredSchedules, roomPlot.enabled])
  const parallelRoomRecommendations = useMemo(() => roomPlot.enabled
    ? plotParallelRoomGroupRecommendations(proposedMeetings, roomPlot.rooms, filteredSchedules) : new Map<string, readonly PlotParallelRoomGroupOption[]>(),
  [proposedMeetings, roomPlot.rooms, filteredSchedules, roomPlot.enabled])
  const parallelMessages = useMemo(() => plotParallelRoomMessages(proposedMeetings, roomPlot.rooms), [proposedMeetings, roomPlot.rooms])
  const roomStatusMessages = useMemo(() => {
    const rooms = new Map(roomPlot.rooms.map(room => [room.id, room]))
    const messages = new Map<string, string[]>()
    for (const meeting of proposedMeetings) {
      const room = rooms.get(meeting.roomId ?? '')
      const issue = room && scheduleRoomStatusIssue(room)
      if (issue) messages.set(meeting.id, [issue])
    }
    return messages
  }, [proposedMeetings, roomPlot.rooms])
  const overlapMessages = useMemo(() => {
    const messages = scheduleRoomOverlapMessages(proposedMeetings,
      meeting => roomPlot.labels.get(meeting.roomId ?? '') || roomScheduleRoom(meeting, roomsMap))
    for (const [id, issues] of parallelMessages) messages.set(id, [...(messages.get(id) ?? []), ...issues])
    for (const [id, issues] of roomStatusMessages) messages.set(id, [...(messages.get(id) ?? []), ...issues])
    return messages
  }, [proposedMeetings, roomPlot.labels, roomsMap, parallelMessages, roomStatusMessages])
  const parallelPlotError = proposedMeetings.find(meeting => parallelMessages.has(meeting.id)
    && [...roomPlot.pending.values()].some(assignment => assignment.scheduleId === String(meeting.sourceScheduleId || meeting.id)
      && assignment.targetStatus !== 'Draft'))
  const liveParallelError = parallelPlotError ? parallelMessages.get(parallelPlotError.id)?.[0] : undefined
  const statusPlotError = proposedMeetings.find(meeting => roomStatusMessages.has(meeting.id)
    && [...roomPlot.pending.values()].some(assignment => assignment.scheduleId === String(meeting.sourceScheduleId || meeting.id)
      && assignment.targetStatus !== 'Draft'))
  const liveRoomStatusError = statusPlotError ? roomStatusMessages.get(statusPlotError.id)?.[0] : undefined
  const livePlotError = liveRoomStatusError || liveParallelError

  useEffect(() => {
    const dismiss = () => setOverlapHover(null)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [])
  useEffect(() => { setOverlapHover(null) }, [isOpen, selectedAcademicYear, selectedSemester, roomPlot.pending, allSchedules])

  const groupOverlapMessages = (meetings: ScheduleMeetingRecord[]) => [...new Set(meetings.flatMap(meeting => overlapMessages.get(meeting.id) ?? []))]
  const overlapProps = (meetings: ScheduleMeetingRecord[]) => {
    const messages = groupOverlapMessages(meetings)
    const show = (element: HTMLElement) => {
      if (!messages.length) return
      const { left, right, top, bottom } = element.getBoundingClientRect()
      setOverlapHover({ ids: meetings.map(meeting => meeting.id), anchor: { left, right, top, bottom } })
    }
    return {
      tabIndex: messages.length ? 0 : undefined,
      'aria-label': messages.length ? messages.join('\n') : undefined,
      onPointerEnter: (event: PointerEvent<HTMLDivElement>) => show(event.currentTarget),
      onPointerLeave: () => setOverlapHover(null),
      onFocus: (event: FocusEvent<HTMLDivElement>) => show(event.currentTarget),
      onBlur: (event: FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setOverlapHover(null) },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Escape') setOverlapHover(null) },
    }
  }

  const getScheduleStatusClasses = (meeting: ScheduleMeetingRecord, children: ScheduleMeetingRecord[] = []) => {
    if (groupOverlapMessages([meeting, ...children]).length) return 'bg-rose-100 border-rose-500 ring-1 ring-rose-400'
    const s = getMeetingStatus(meeting)
    if (s === 'Plot') return 'bg-[var(--brand-color)]/15 border-[var(--brand-color)]/50'
    if (s === 'Revise' || s === 'Revised') return 'bg-amber-50 border-amber-300'
    if (s === 'Return' || s === 'Returned') return 'bg-rose-50 border-rose-300'
    return 'bg-slate-100 border-slate-300' // Draft
  }

  const getPdfStatusStyles = (meeting: Parameters<typeof getMeetingStatus>[0]) => {
    const s = getMeetingStatus(meeting)
    if (s === 'Plot') return { backgroundColor: '#e7f0df', borderColor: '#a3c48b' }
    if (s === 'Revise' || s === 'Revised') return { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }
    if (s === 'Return' || s === 'Returned') return { backgroundColor: '#fff1f2', borderColor: '#fda4af' }
    return { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' } // Draft
  }

  const getRoomName = (meeting: { roomId?: string; room?: unknown }) =>
    (meeting.roomId ? roomsMap.get(meeting.roomId) : '') || (typeof meeting.room === 'string' ? meeting.room.trim() : '')

  const renderPlotCheckbox = (meeting: ScheduleMeetingRecord, parallel = false) => {
    if (!roomPlot.enabled || meeting.source !== 'workbook' || meeting.schemaVersion !== 2) return null
    const termMeetings = allSchedules.filter(item => scheduleMatchesTerm(item, selectedAcademicYear, selectedSemester))
    const members = parallel ? plotParallelGroup(termMeetings, roomPlot.rooms, meeting)
      : termMeetings.filter(item => String(item.sourceScheduleId || item.id) === String(meeting.sourceScheduleId || meeting.id))
    const state = parallel ? parallelPlotCheckboxState(members, roomPlot.rooms, roomPlot.pending) : null
    const hasRoom = Boolean(roomPlot.selected(meeting))
    const marked = state ? state.checked : hasRoom && roomPlot.marked(meeting)
    const errors = groupOverlapMessages(members)
    const blocked = (state ? !state.valid : !hasRoom) || !marked && errors.length > 0
    const label = blocked ? errors[0] || (parallel ? 'Assign complete, connected rooms before plotting this parallel group' : 'Assign a room before plotting this schedule')
      : `${marked ? 'Return' : 'Mark'} ${meeting.subjectCode || 'schedule'}${parallel ? ' parallel group' : ''} ${marked ? 'to Draft' : 'for plotting'}`
    return <button type="button" role="checkbox" aria-checked={marked} aria-label={label} title={label}
      disabled={!roomPlot.permitted || !roomPlot.ready || roomPlot.saving || blocked}
      onClick={event => { event.stopPropagation(); if (blocked) return; if (parallel) roomPlot.toggleMarkedGroup(members, errors); else roomPlot.toggleMarked(meeting, errors) }}
      className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded border focus-visible:outline-2 focus-visible:outline-[var(--brand-color)] disabled:cursor-default ${marked ? 'border-[var(--brand-color)] bg-[var(--brand-color)] text-white' : 'border-gray-300 bg-white text-gray-500 enabled:hover:border-[var(--brand-color)]'}`}>
      {marked && <CheckIcon className="h-3.5 w-3.5" />}
    </button>
  }

  const renderMeetingRoom = (meeting: ScheduleMeetingRecord) => {
    if (!roomPlot.enabled || meeting.source !== 'workbook' || meeting.schemaVersion !== 2) return (
      <span className="truncate">Room: <span className="text-gray-700 font-medium truncate" title={getRoomName(meeting)}>{getRoomName(meeting)}</span></span>
    )
    if (isProvidedScheduleRoom(meeting)) {
      if (!meeting.roomId) return (
        <span className="truncate" title="Room provided by the department workbook. Update the workbook to change it.">Room: <span className="text-gray-700 font-medium truncate">{getRoomName(meeting)}</span></span>
      )
      return <div className="flex min-w-0 items-center gap-1" onClick={event => event.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate">Room: <span className="text-gray-700 font-medium" title={getRoomName(meeting)}>{getRoomName(meeting)}</span></span>
      </div>
    }
    const selected = roomPlot.selected(meeting)
    const recommended = roomRecommendations.get(schedulePlotSelectionKey(meeting)) ?? []
    const groupOptions = parallelRoomRecommendations.get(schedulePlotSelectionKey(meeting)) ?? []
    const groupById = new Map(groupOptions.map(option => [option.id, option]))
    return <div className="flex min-w-0 items-center gap-1" onClick={event => event.stopPropagation()}>
      <span className="shrink-0">Room:</span>
      <SingleSelectDropdown portal searchable retainValueOnOpen variant="meeting" menuAnchorSelector="[data-schedule-meeting]" ariaLabel={`Room for ${meeting.subjectCode || 'class'}, ${meeting.days?.join(', ')}, ${meeting.startTime}-${meeting.endTime}`}
        options={[...new Set([...groupOptions.map(option => option.id), ...recommended, ...roomPlot.roomOptions, ...(selected ? [selected] : [])])]}
        recommendedOptions={[...groupOptions.map(option => option.id), ...recommended]}
        value={selected} getOptionLabel={id => groupById.get(id)?.label || (id ? roomPlot.labels.get(id) || (id === meeting.roomId ? getRoomName(meeting) : 'Unnamed room') : '')}
        onChange={id => { const group = groupById.get(id); if (group) roomPlot.selectGroup(group.assignments); else roomPlot.select(meeting, id) }}
        isDisabled={!roomPlot.permitted || !roomPlot.ready || roomPlot.saving}
        className="w-0 min-w-0 flex-1 [&>input]:!h-7 [&>input]:!px-2 [&>input]:!text-xs" />
    </div>
  }

  const getUserName = (uid?: string) => {
    if (!uid) return 'User'
    if (isInstructorMode && member?.name) return member.name
    return instructorsMap.get(uid) || 'User'
  }

  const getReservationDepartment = (reservation: { department?: string; userId?: string }) => {
    return reservation.department?.trim()
      || (reservation.userId ? userDepartmentMap.get(reservation.userId) : '')
      || (isInstructorMode ? member?.department || member?.departmentName : '')
      || 'University'
  }

  const getUserDepartment = (uid?: string) => {
    if (auth.currentUser?.uid && uid === auth.currentUser.uid) {
      return 'Mine'
    }
    if (!uid) return 'University'
    return userDepartmentMap.get(uid) || 'University'
  }

  const activeWeekReservations = useMemo(() => {
    if (!showWeekCalendar || !reservations.length) return []
    const weekIsoSet = new Set(weekInfo.weekDays.map(w => w.isoString))
    return reservations.filter(r => r.date && weekIsoSet.has(r.date))
  }, [showWeekCalendar, reservations, weekInfo.weekDays])

  // Build whole-day time slots, including overlapping meetings and reservations.
  const timeSlots = useMemo(() => {
    const baseSlots = STANDARD_TIME_SLOTS

    const timeSlotSet = new Set<string>(baseSlots.length > 0 ? baseSlots : STANDARD_TIME_SLOTS)

    filteredSchedules.forEach(schedule => {
      if (schedule.startTime && schedule.endTime) {
        const formatted = `${padTime(schedule.startTime)}-${padTime(schedule.endTime)}`
        if (!Array.from(timeSlotSet).some(slot => isScheduleInSlot(schedule, slot))) {
          timeSlotSet.add(formatted)
        }
      }
    })

    if (showWeekCalendar) {
      activeWeekReservations.forEach(res => {
        if (res.startTime && res.endTime) {
          const formatted = `${padTime(res.startTime)}-${padTime(res.endTime)}`
          if (!Array.from(timeSlotSet).some(slot => isScheduleInSlot(res, slot))) {
            timeSlotSet.add(formatted)
          }
        }
      })
    }

    return Array.from(timeSlotSet)
      .sort((a, b) => {
        const startA = a.split('-')[0]
        const startB = b.split('-')[0]
        if (startA !== startB) return startA.localeCompare(startB)
        return a.split('-')[1].localeCompare(b.split('-')[1])
      })
  }, [filteredSchedules, activeWeekReservations, showWeekCalendar])

  // 7. Populate Grid
  const scheduleGrid = useMemo(() => {
    const grid: Record<string, Record<string, any[]>> = {}
    timeSlots.forEach(slot => {
      grid[slot] = { Sun: [], Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] }
    })

    filteredSchedules.forEach(schedule => {
      if (schedule.startTime && schedule.endTime && schedule.days) {
        timeSlots.forEach(slot => {
          if (isScheduleInSlot(schedule, slot)) {
            schedule.days.forEach((day: string) => {
              const d = normalizeDay(day)
              if (grid[slot] && grid[slot][d]) {
                if (!grid[slot][d].some(existing => existing.id === schedule.id)) {
                  grid[slot][d].push({ ...schedule, _itemType: 'departmentSchedule' })
                }
              }
            })
          }
        })
      }
    })

    if (showWeekCalendar) {
      activeWeekReservations.forEach(res => {
        const matchedWeekDay = weekInfo.weekDays.find(w => w.isoString === res.date)
        if (matchedWeekDay) {
          const d = matchedWeekDay.dayName
          timeSlots.forEach(slot => {
            if (isScheduleInSlot(res, slot)) {
              if (grid[slot] && grid[slot][d]) {
                if (!grid[slot][d].some(existing => existing.id === res.id)) {
                  grid[slot][d].push({
                    ...res,
                    subjectCode: typeof res.subjectCode === 'string' ? res.subjectCode.trim() || 'N/A' : 'N/A',
                    classSection: typeof res.classSection === 'string' ? res.classSection.trim() || 'N/A' : 'N/A',
                    _itemType: 'reservation'
                  })
                }
              }
            }
          })
        }
      })
    }

    return grid
  }, [timeSlots, filteredSchedules, activeWeekReservations, showWeekCalendar, weekInfo.weekDays])

  const academicYearOptions = useMemo(() => {
    return academicYears.map(y => y.academicYear)
  }, [academicYears])

  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setIsGeneratingPdf(true)

    // Yield control to let React flush the state and paint the "Exporting PDF..." button immediately
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const element = printRef.current

      // html-to-image captures the element exactly as the browser computes it.
      // Because the element is wrapped in an overflow:hidden container, 
      // the user never sees it, but the browser still computes its 1200px layout!
      const imgData = await toPng(element, {
        quality: 1.0,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true
      })

      const img = new Image()
      img.src = imgData
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      const imgWidth = img.width
      const imgHeight = img.height

      // Dynamically create the PDF to exactly match the image dimensions
      // This prevents the schedule from shrinking if it has many rows.
      const pdf = new jsPDF({
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight]
      })

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

      const targetName = (member?.name || 'Instructor')
      const safeName = targetName.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')

      let rawYear = (selectedAcademicYear?.academicYear || 'SY').trim()
      rawYear = rawYear.replace(/(\d{4})\s*-\s*(\d{4})/, '$1-$2')
      const safeYear = rawYear.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')

      const safeSem = (selectedSemester || 'Sem').trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')

      pdf.save(`${safeName}_Schedule_${safeYear}_${safeSem}.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  if (!isOpen && !isInline) return null
  if (!member) return null

  return (
    <div className={isInline ? "flex flex-col w-full h-full" : "fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"}>
      {/* Hidden Print Template for PDF Export */}
      {/* 
        This wrapper is 0x0 and hides overflow. 
        It sits at top-left, invisible to the user.
        But its children are still laid out by the browser for html-to-image to capture perfectly!
      */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          ref={printRef}
          style={{
            width: '1200px',
            backgroundColor: '#ffffff',
            padding: '2px' // Add padding so html-to-image doesn't clip the outer borders
          }}
          className="flex flex-col font-sans"
        >
          <div style={{ background: 'linear-gradient(135deg, #62853e, #7b9d4f)', padding: '20px 32px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
                  {`${member?.name}'s Schedule`}
                </h2>

              </div>
              <p style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: 500, margin: '4px 0 0 0' }}>
                {[member?.role || 'Instructor', member?.departmentName || member?.department || getUserDepartment(member?.userId || member?.id)].filter(Boolean).join(' • ')}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#ffffff', border: '1px solid rgba(255,255,255,0.3)' }}>
                {showWeekCalendar
                  ? weekInfo.label
                  : `${selectedAcademicYear?.academicYear || 'Academic Year'} • ${selectedSemester}`}
              </span>
            </div>
          </div>

          <div style={{ borderBottom: '1px solid #d1d5db' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', backgroundColor: '#ffffff', borderTop: '1px solid #d1d5db', borderLeft: '1px solid #d1d5db', borderRight: '1px solid #d1d5db' }}>
              <thead>
                <tr>
                  <th style={{ width: '95px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', padding: '8px 4px', fontSize: '12px', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>Time</th>
                  {DAYS.map((day, dIdx) => {
                    const wDay = showWeekCalendar ? weekInfo.weekDays[dIdx] : null
                    const isSelected = false
                    return (
                      <th key={day} style={{ border: '1px solid #d1d5db', backgroundColor: isSelected ? '#e3edda' : '#f9fafb', padding: '6px 4px', fontSize: '12px', fontWeight: 'bold', color: isSelected ? '#334322' : '#374151', textAlign: 'center' }}>
                        <div style={{ color: isSelected ? '#526f34' : '#374151', fontWeight: 'bold' }}>{day}</div>
                        {wDay && (
                          <div style={{ fontSize: '10px', color: isSelected ? '#41572a' : '#6b7280', fontWeight: isSelected ? 'bold' : 'normal' }}>{wDay.formattedShort}</div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map(slot => {
                  const [start, end] = slot.split('-')
                  return (
                    <tr key={slot}>
                      <td style={{ width: '95px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', padding: '8px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: '#111827', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                          <span style={{ color: '#111827', fontWeight: 'bold', fontSize: '11px' }}>{formatTime(start)}</span>
                          <span style={{ color: '#111827', fontWeight: 'bold', fontSize: '11px' }}>{formatTime(end)}</span>
                        </div>
                      </td>
                      {DAYS.map(day => {
                        const daySchedules = scheduleGrid[slot]?.[day] || []
                        const isSelected = false
                        if (daySchedules.length === 0) {
                          return (
                            <td key={day} style={{ border: '1px solid #d1d5db', backgroundColor: isSelected ? '#f3f7ee' : '#ffffff', padding: '6px', verticalAlign: 'top', height: '103px' }}>
                              <div style={{ height: '100%' }} />
                            </td>
                          )
                        }

                        

                        const grouped: { parent: any, children: any[] }[] = []
                        daySchedules.forEach(cls => {
                          if (cls.type === 'parallel') {
                            if (cls.groupId) {
                              const existingGroup = grouped.find(g => g.parent.groupId === cls.groupId)
                              if (existingGroup) {
                                existingGroup.children.push(cls)
                              } else {
                                grouped.push({ parent: cls, children: [] })
                              }
                            } else {
                              grouped.push({ parent: cls, children: [] })
                            }
                          } else if (cls.parentId) {
                            const parentGroup = grouped.find(g => g.parent.id === cls.parentId || g.parent.docId === cls.parentId)
                            if (parentGroup) {
                              parentGroup.children.push(cls)
                            } else {
                              grouped.push({ parent: cls, children: [] })
                            }
                          } else {
                            grouped.push({ parent: cls, children: [] })
                          }
                        })

                        const slotStartMins = timeToMins(start)
                        const slotEndMins = timeToMins(end)
                        const numSubRows = Math.max(1, Math.round((slotEndMins - slotStartMins) / 30))

                        return (
                          <td key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#ffffff', padding: '6px', verticalAlign: 'top' }}>
                            <div style={{ display: 'grid', gridTemplateRows: `repeat(${numSubRows}, minmax(0, 1fr))`, gap: '4px', width: '100%', height: '100%' }}>
                              {grouped.map((group, idx) => {
                                const itemStartMins = Math.max(slotStartMins, timeToMins(group.parent.startTime))
                                const itemEndMins = Math.min(slotEndMins, timeToMins(group.parent.endTime))

                                const startRow = Math.floor((itemStartMins - slotStartMins) / 30) + 1
                                const endRow = Math.max(startRow + 1, Math.ceil((itemEndMins - slotStartMins) / 30) + 1)
                                const gridRowStyle = `${startRow} / ${endRow}`

                                if (group.parent._itemType === 'reservation') {
                                  const item = group.parent
                                  const isApproved = item.status === 'Approved'
                                  const borderColor = isApproved ? '#6ee7b7' : '#fcd34d'
                                  return (
                                    <div key={item.id || idx} style={{ gridRow: gridRowStyle, backgroundColor: isApproved ? '#d1fae5' : '#fef3c7', border: `1px solid ${borderColor}`, borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                        <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subjectCode || 'Reservation'}</span>
                                        <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>{item.status || 'Booked'}</span>
                                      </div>
                                      <ExtendedReservationBadge requestType={item.requestType} />
                                      <div style={{ marginTop: '4px', borderTop: `1px solid ${borderColor}`, paddingTop: '4px', fontSize: '10px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <span style={{ color: '#1f2937', fontWeight: 500 }}>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <span style={{ color: '#1f2937', fontWeight: 500 }}>{scheduleSectionLabel(item)}</span></div>
                                        {!hideReservationIdentity && (
                                          <>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Inst: <span style={{ color: '#374151', fontWeight: 500 }}>{getUserName(item.userId)}</span></div>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563', fontWeight: 500 }}>{getReservationDepartment(item)}</span></div>
                                          </>
                                        )}
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Room: <span style={{ color: '#374151', fontWeight: 500 }}>{getRoomName(item)}</span></div>
                                      </div>
                                    </div>
                                  )
                                }

                                const pdfStyles = getPdfStatusStyles(group.parent)

                                return group.parent.type === 'parallel' ? (
                                  <div key={idx} style={{ gridRow: gridRowStyle, backgroundColor: pdfStyles.backgroundColor, border: `1px solid ${pdfStyles.borderColor}`, borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.parent.subjectCode || 'TBA'}</span>
                                      <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                        {scheduleCardLabel(group.parent)}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: `1px solid ${pdfStyles.borderColor}`, paddingTop: '4px' }}>
                                      {[group.parent, ...group.children].map((item, iIdx) => (
                                        <div key={iIdx} style={{ display: 'flex', flexDirection: 'column', paddingLeft: '6px', borderLeft: `2px solid ${pdfStyles.borderColor}`, fontSize: '10px', color: '#4b5563' }}>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <span style={{ color: '#1f2937', fontWeight: 500 }}>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></div>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <span style={{ color: '#1f2937', fontWeight: 500 }}>{scheduleSectionLabel(item)}</span></div>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Room: <span style={{ color: '#374151', fontWeight: 500 }}>{getRoomName(item)}</span></div>
                                          {!isInstructorMode && item.department && (
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563', fontWeight: 500 }}>{item.department}</span></div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div key={idx} style={{ gridRow: gridRowStyle, backgroundColor: pdfStyles.backgroundColor, border: `1px solid ${pdfStyles.borderColor}`, borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.parent.subjectCode || 'TBA'}</span>
                                      <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                        {scheduleCardLabel(group.parent)}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: '4px', borderTop: `1px solid ${pdfStyles.borderColor}`, paddingTop: '4px', fontSize: '10px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <span style={{ color: '#1f2937', fontWeight: 500 }}>{formatTime(group.parent.startTime)} - {formatTime(group.parent.endTime)}</span></div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <span style={{ color: '#1f2937', fontWeight: 500 }}>{scheduleSectionLabel(group.parent)}</span></div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Room: <span style={{ color: '#374151', fontWeight: 500 }}>{getRoomName(group.parent)}</span></div>
                                      {!isInstructorMode && group.parent.department && (
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563', fontWeight: 500 }}>{group.parent.department}</span></div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* End of Hidden Print Template wrapper */}
      </div>

      <div
        className={isInline 
          ? "flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden min-h-[600px] w-full"
          : "w-[85vw] max-w-[85vw] h-[88vh] max-h-[88vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
        }
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={event => {
          if (!roomPlot.enabled || !roomPlot.permitted || !roomPlot.ready || roomPlot.saving || !isOpen) return
          if (!(event.ctrlKey || event.metaKey) || event.altKey || event.nativeEvent.isComposing) return
          const key = event.key.toLowerCase()
          if (key !== 'z' && key !== 'y') return
          const target = event.target
          // Keep native text undo while typing a search; closed room pickers undo the staged choice.
          if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA'
            || target.tagName === 'INPUT' && !(target.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'false'))) return
          event.preventDefault()
          event.stopPropagation()
          if (key === 'y' || event.shiftKey) roomPlot.redo()
          else roomPlot.undo()
        }}
      >
        {/* Modal Header */}
        <div className="relative z-30 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-7 py-5 text-white rounded-t-2xl shrink-0 flex items-center justify-between gap-4 overflow-visible">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold tracking-tight text-white">
                {`${member?.name}'s Schedule`}
              </h3>

            </div>
            <p className="mt-0.5 text-xs text-white/80 font-medium">
              {[member?.role || 'Instructor', member?.departmentName || member?.department || getUserDepartment(member?.userId || member?.id)].filter(Boolean).join(' • ')}
            </p>
          </div>

          {showWeekCalendar ? (
            <div className="flex items-center gap-2 shrink-0">
              {!weekInfo.isCurrentWeek && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWeekDate(getLocalIsoDate())
                  }}
                  className="h-12 px-3.5 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  This Week
                </button>
              )}

              <div className="w-72">
                <DatePicker
                  value={selectedWeekDate}
                  onChange={(date) => setSelectedWeekDate(date)}
                  minDate={minDate}
                  maxDate={maxDate}
                  align="right"
                  hideClear
                  onPrev={() => {
                    if (isPrevDisabled) return
                    const prev = new Date(weekInfo.sunday)
                    prev.setDate(prev.getDate() - 7)
                    setSelectedWeekDate(getLocalIsoDate(prev))
                  }}
                  onNext={() => {
                    if (isNextDisabled) return
                    const next = new Date(weekInfo.sunday)
                    next.setDate(next.getDate() + 7)
                    setSelectedWeekDate(getLocalIsoDate(next))
                  }}
                  prevDisabled={isPrevDisabled}
                  nextDisabled={isNextDisabled}
                  prevTitle="Previous Week"
                  nextTitle="Next Week"
                />
              </div>
            </div>
          ) : !hideFilters ? (
            <div className="flex items-center gap-3 shrink-0">
              {/* Academic Year & Semester SingleSelectDropdowns */}
              {academicYearOptions.length > 0 && (
                <div className="w-52">
                  <SingleSelectDropdown
                    options={academicYearOptions}
                    isDisabled={roomPlot.saving}
                    value={selectedAcademicYear?.academicYear || ''}
                    onChange={(val) => {
                      const found = academicYears.find(y => y.academicYear === val)
                      if (found) {
                        setSelectedAcademicYear(found)
                        if (!initialSemester) {
                          setSelectedSemester(resolveCurrentSemester(found))
                        }
                      }
                    }}
                    className="[&>button]:!rounded-xl [&>button]:!bg-white [&>button]:!border-white/30 [&>button]:!shadow-sm"
                  />
                </div>
              )}

              <div className="w-52">
                <SingleSelectDropdown
                  options={['1st Semester', '2nd Semester'] as const}
                  isDisabled={roomPlot.saving}
                  value={selectedSemester as '1st Semester' | '2nd Semester'}
                  onChange={(val) => setSelectedSemester(val)}
                  className="[&>button]:!rounded-xl [&>button]:!bg-white [&>button]:!border-white/30 [&>button]:!shadow-sm"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Body */}
        <div className={`flex-1 overflow-y-auto overflow-x-auto bg-gray-50/50 ${isInline ? '' : 'overscroll-none'} flex flex-col relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden`}>
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <SpinnerIcon className="h-9 w-9 text-[var(--brand-color)] animate-spin" />
              <p className="text-sm font-bold text-slate-700">Loading schedule...</p>
              <p className="text-xs text-slate-400">Retrieving timetable assignments.</p>
            </div>
          ) : scheduleLoadError ? (
            <div role="alert" className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <p className="text-sm font-bold text-rose-700">{scheduleLoadError}</p>
            </div>
          ) : isInstructorMode && member?.role === 'Dean' ? (
            <div className="flex-1 min-h-[22rem] flex flex-col items-center justify-center p-8 text-center">
              <div className="flex flex-col items-center justify-center max-w-md mx-auto">
                <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 mb-3.5 border border-amber-200 shadow-sm">
                  <CalendarIcon className="h-7 w-7 text-amber-600" />
                </div>
                <h4 className="text-base font-extrabold text-slate-800 tracking-tight">
                  Dean Scheduling Not Handled
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                  The system does not handle Dean scheduling at this time. This feature is coming soon.
                </p>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 mt-3.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
                  Coming Soon
                </span>
              </div>
            </div>
          ) : (
            <table
              className="grid w-full text-left text-sm whitespace-nowrap min-w-max"
              style={{
                gridTemplateColumns: '6rem repeat(7, minmax(9.5rem, 1fr))',
                gridTemplateRows: `auto repeat(${timeSlots.length}, minmax(7.5rem, auto))`
              }}
            >
              <thead className="contents text-gray-700 font-bold text-base">
                <tr className="contents">
                  <th className="p-2 h-14 flex items-center justify-center border-b-2 border-r text-center border-gray-300 bg-gray-50 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold text-gray-700">Time</th>
                  {DAYS.map((day, dIdx) => {
                    const wDay = showWeekCalendar ? weekInfo.weekDays[dIdx] : null
                    const isSelected = false
                    return (
                      <th
                        key={day}
                        className={`p-2 h-14 flex flex-col items-center justify-center border-b-2 border-r text-center border-gray-300 last:border-r-0 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold transition-colors ${isSelected
                            ? 'bg-[#e3edda] text-[var(--brand-color)] border-b-2 border-b-[var(--brand-color)]'
                            : 'bg-gray-50 text-gray-700'
                          }`}
                      >
                        <span className={`text-sm font-bold ${isSelected ? 'text-[var(--brand-color)] font-extrabold' : 'text-gray-800'}`}>
                          {day}
                        </span>
                        {wDay && (
                          <span
                            className={`text-[0.625rem] font-bold mt-0.5 px-1.5 py-0.2 rounded-md transition-colors ${isSelected
                                ? 'bg-[var(--brand-color)] text-white font-extrabold shadow-xs'
                                : wDay.isToday
                                  ? 'bg-[var(--brand-color)] text-white'
                                  : 'text-gray-400 bg-gray-100'
                              }`}
                          >
                            {wDay.formattedShort}
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="contents">
                {timeSlots.map(slot => {
                  const [start, end] = slot.split('-')
                  return (
                    <tr key={slot} className="contents group">
                      <td className="px-3 py-2 text-xs font-bold text-gray-700 border-b border-r border-gray-300 align-middle whitespace-nowrap bg-gray-50/60 group-hover:bg-gray-100/70 transition-colors h-full flex items-center justify-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-gray-900 font-bold text-xs">{formatTime(start)}</span>
                          <span className="text-gray-900 font-bold text-xs">{formatTime(end)}</span>
                        </div>
                      </td>
                      {DAYS.map(day => {
                        const daySchedules = scheduleGrid[slot]?.[day] || []
                        const isSelected = false

                        if (daySchedules.length === 0) {
                          return (
                            <td
                              key={day}
                              className={`px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top transition-colors h-full flex flex-col min-w-0 ${isSelected
                                  ? 'bg-[#f3f7ee]/90 group-hover:bg-[#e3edda]/60'
                                  : 'bg-white group-hover:bg-gray-50/50'
                                }`}
                            >
                              <div className="flex-1 h-full" />
                            </td>
                          )
                        }

                        

                        const grouped: { parent: any, children: any[] }[] = []

                        daySchedules.forEach(cls => {
                          if (cls.type === 'parallel') {
                            if (cls.groupId) {
                              const existingGroup = grouped.find(g => g.parent.groupId === cls.groupId)
                              if (existingGroup) {
                                existingGroup.children.push(cls)
                              } else {
                                grouped.push({ parent: cls, children: [] })
                              }
                            } else {
                              grouped.push({ parent: cls, children: [] })
                            }
                          } else if (cls.parentId) {
                            const parentGroup = grouped.find(g => g.parent.id === cls.parentId || g.parent.docId === cls.parentId)
                            if (parentGroup) {
                              parentGroup.children.push(cls)
                            } else {
                              grouped.push({ parent: cls, children: [] })
                            }
                          } else {
                            grouped.push({ parent: cls, children: [] })
                          }
                        })

                        const slotStartMins = timeToMins(start)
                        const slotEndMins = timeToMins(end)
                        const numSubRows = Math.max(1, Math.round((slotEndMins - slotStartMins) / 30))

                        const isSingleFullSlot = grouped.length === 1 &&
                          timeToMins(grouped[0].parent.startTime) <= slotStartMins &&
                          timeToMins(grouped[0].parent.endTime) >= slotEndMins;

                        const gridRowsStyle = grouped.length > 0
                          ? grouped.some(group => group.parent._itemType === 'reservation')
                            ? `repeat(${numSubRows}, minmax(${isSingleFullSlot ? '0' : '4rem'}, 1fr))`
                            : (isSingleFullSlot ? `repeat(${numSubRows}, minmax(0, 1fr))` : `repeat(${numSubRows}, 4rem)`)
                          : 'auto';

                        return (
                          <td
                            key={day}
                            className={`px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top transition-colors min-w-0 h-full grid gap-1 ${isSelected
                                ? 'bg-[#f3f7ee]/90 group-hover:bg-[#e3edda]/60'
                                : 'bg-white group-hover:bg-gray-50/50'
                              }`}
                            style={{ gridTemplateRows: gridRowsStyle }}
                          >
                            {grouped.map((group, idx) => {
                              const itemStartMins = Math.max(slotStartMins, timeToMins(group.parent.startTime))
                              const itemEndMins = Math.min(slotEndMins, timeToMins(group.parent.endTime))

                              const startRow = Math.floor((itemStartMins - slotStartMins) / 30) + 1
                              const endRow = Math.max(startRow + 1, Math.ceil((itemEndMins - slotStartMins) / 30) + 1)
                              const gridRowStyle = `${startRow} / ${endRow}`

                              if (group.parent._itemType === 'reservation') {
                                const item = group.parent
                                const isApproved = item.status === 'Approved'
                                return (
                                  <div
                                    key={item.id || idx}
                                    style={{ gridRow: gridRowStyle }}
                                    className={`flex flex-col p-2 rounded text-sm shadow-sm transition-shadow min-w-0 min-h-max border overflow-hidden ${isApproved
                                        ? 'bg-emerald-500/10 border-emerald-500/30'
                                        : 'bg-amber-500/10 border-amber-500/30'
                                      }`}
                                  >
                                    <div className="flex flex-row items-center gap-1.5 min-w-0">
                                      <span className="font-bold text-gray-900 uppercase truncate">
                                        {item.subjectCode || 'Reservation'}
                                      </span>
                                      <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                        {item.status || 'Booked'}
                                      </span>
                                    </div>
                                    <ExtendedReservationBadge requestType={item.requestType} />
                                    <div className={`mt-1.5 flex flex-col gap-0.5 text-xs min-w-0 border-t pt-1.5 ${isApproved ? 'border-emerald-500/20 text-emerald-900/80' : 'border-amber-500/20 text-amber-900/80'
                                      }`}>
                                      <span className="truncate text-gray-500 shrink-0">Time: <span className="font-medium text-gray-700">{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></span>
                                        <span className="truncate text-gray-500 shrink-0" title={scheduleSectionLabel(item)}>Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(item)}</span></span>
                                      {!hideReservationIdentity && (
                                        <>
                                          <span className="truncate text-gray-500 shrink-0" title={getUserName(item.userId)}>Inst: <span className="font-medium text-gray-700">{getUserName(item.userId)}</span></span>
                                          <span className="truncate text-gray-500 shrink-0" title={getReservationDepartment(item)}>Dept: <span className="font-medium text-gray-600">{getReservationDepartment(item)}</span></span>
                                        </>
                                      )}
                                      {isInstructorMode && item.roomId && (
                                        <span className="truncate text-gray-500">Room: <span className="text-gray-700 font-medium">{getRoomName(item)}</span></span>
                                      )}
                                    </div>
                                  </div>
                                )
                              }

                              return group.parent.type === 'parallel' ? (
                                <div data-schedule-meeting {...overlapProps([group.parent, ...group.children])} key={idx} style={{ gridRow: gridRowStyle }} className={`flex flex-col p-2 border rounded text-sm shadow-sm hover:shadow transition-all min-w-0 min-h-0 overflow-hidden ${roomPlot.enabled ? 'w-full max-w-full' : ''} ${getScheduleStatusClasses(group.parent, group.children)}`}>
                                  <div className="flex flex-col focus:outline-none min-w-0">
                                    <div className="flex flex-row items-center gap-1.5 min-w-0">
                                      <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                      <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                        {scheduleCardLabel(group.parent)}
                                      </span>
                                      {renderPlotCheckbox(group.parent, true)}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2 cursor-default min-w-0" onClick={e => e.stopPropagation()}>
                                    {[group.parent, ...group.children].map((item, iIdx) => (
                                      <div key={iIdx} className={`flex flex-col pl-2 border-l-2 min-w-0 ${overlapMessages.has(item.id) ? 'border-rose-500 bg-rose-200/60' : 'border-[var(--brand-color)]/30'}`}>
                                        <div className="flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                          <span className="truncate">Time: <span className="font-medium text-gray-700">{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></span>
                                          <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(item)}</span></span>
                                          {renderMeetingRoom(item)}
                                          {!isInstructorMode && item.department && (
                                            <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{item.department}</span></span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : group.children.length > 0 ? (
                                <div data-schedule-meeting {...overlapProps([group.parent, ...group.children])} key={idx} style={{ gridRow: gridRowStyle }} className={`flex flex-col p-2 border rounded text-sm shadow-sm hover:shadow transition-all min-w-0 min-h-0 overflow-hidden ${roomPlot.enabled ? 'w-full max-w-full' : ''} ${getScheduleStatusClasses(group.parent, group.children)}`}>
                                  <div className="flex flex-row items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                    <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                      {scheduleCardLabel(group.parent)}
                                    </span>
                                    {renderPlotCheckbox(group.parent)}
                                  </div>
                                  <div className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                    <span className="truncate">Time: <span className="font-medium text-gray-700">{formatTime(group.parent.startTime)} - {formatTime(group.parent.endTime)}</span></span>
                                    <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(group.parent)}</span></span>
                                    {renderMeetingRoom(group.parent)}
                                    {!isInstructorMode && group.parent.department && (
                                      <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{group.parent.department}</span></span>
                                    )}
                                  </div>
                                  <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2 min-w-0">
                                    {group.children.map((child, cIdx) => (
                                      <div key={cIdx} className={`flex flex-col pl-2 border-l-2 min-w-0 ${overlapMessages.has(child.id) ? 'border-rose-500 bg-rose-200/60' : 'border-[var(--brand-color)]/30'}`}>
                                        <span className="font-bold text-gray-900 uppercase truncate">{child.subjectCode || 'TBA'}</span>
                                        <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                          <span className="truncate">Time: <span className="font-medium text-gray-700">{formatTime(child.startTime)} - {formatTime(child.endTime)}</span></span>
                                          <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(child)}</span></span>
                                          {renderMeetingRoom(child)}
                                          {!isInstructorMode && child.department && (
                                            <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{child.department}</span></span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div data-schedule-meeting {...overlapProps([group.parent])} key={idx} style={{ gridRow: gridRowStyle }} className={`flex flex-col p-2 border rounded text-sm shadow-sm hover:shadow transition-shadow min-w-0 min-h-0 overflow-hidden ${roomPlot.enabled ? 'w-full max-w-full' : ''} ${getScheduleStatusClasses(group.parent)}`}>
                                  <div className="flex flex-row items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                    <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                      {scheduleCardLabel(group.parent)}
                                    </span>
                                    {renderPlotCheckbox(group.parent)}
                                  </div>
                                  <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0 border-t border-[var(--brand-color)]/20 pt-1.5">
                                    <span className="truncate">Time: <span className="font-medium text-gray-700">{formatTime(group.parent.startTime)} - {formatTime(group.parent.endTime)}</span></span>
                                    <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(group.parent)}</span></span>
                                    {renderMeetingRoom(group.parent)}
                                    {!isInstructorMode && group.parent.department && (
                                      <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{group.parent.department}</span></span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50/80 px-7 py-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 rounded-b-2xl relative z-30">
          <div className="text-xs text-gray-500 font-medium">
            {showWeekCalendar ? (
              <span className="font-bold text-gray-700">{selectedAcademicYear?.academicYear || 'Academic Year'} • {selectedSemester} • {weekInfo.label}</span>
            ) : (
              <span className="font-bold text-gray-700">{selectedAcademicYear?.academicYear || 'Academic Year'} • {selectedSemester}</span>
            )}
            {roomPlot.enabled && <p role={roomPlot.error || livePlotError ? 'alert' : 'status'} className={`mt-1 max-w-xl whitespace-normal ${roomPlot.error || livePlotError ? 'text-rose-700' : 'text-gray-600'}`}>
              {roomPlot.error || livePlotError || roomPlot.message || (!roomPlot.permitted ? 'This semester is read only.' : roomPlot.needsParallelApproval ? 'Check the completed parallel group checkbox, then click Plot to approve the whole group.' : roomPlot.pendingCount ? `${roomPlot.pendingCount} schedules ready to ${roomPlot.hasDraftChanges ? 'update' : 'plot'}.` : 'Check or uncheck assigned rooms, or choose rooms, then save your changes.')}
            </p>}
          </div>
          <div className="flex items-center gap-3">
            {roomPlot.enabled ? (
              <Button type="button" variant="primary" onClick={() => { void roomPlot.save() }}
                disabled={isLoading || Boolean(scheduleLoadError) || !roomPlot.ready || !roomPlot.permitted || roomPlot.saving || !roomPlot.pendingCount || roomPlot.needsParallelApproval || Boolean(livePlotError) || memberRole === 'Dean'}
                className="w-45 px-4 text-sm flex items-center justify-center gap-2 !bg-[var(--brand-color)] hover:!bg-[var(--brand-color-hover)] text-white shadow-sm disabled:opacity-50 cursor-pointer"
                icon={roomPlot.saving ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}>
                {roomPlot.saving ? roomPlot.hasDraftChanges ? 'Saving…' : 'Plotting…' : roomPlot.hasDraftChanges ? 'Save Changes' : 'Plot'}
              </Button>
            ) : actionButton !== undefined ? (
              actionButton
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={handleDownloadPdf}
                disabled={isLoading || Boolean(scheduleLoadError) || isGeneratingPdf || (isInstructorMode && member?.role === 'Dean')}
                className="w-45 px-4 text-sm flex items-center justify-center gap-2 !bg-[var(--brand-color)] hover:!bg-[var(--brand-color-hover)] text-white shadow-sm disabled:opacity-50 cursor-pointer"
                icon={isGeneratingPdf ? undefined : <DownloadIcon className="h-4 w-4" />}
              >
                {isGeneratingPdf ? 'Exporting PDF' : 'Download PDF'}
              </Button>
            )}
            {onBack && (
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                disabled={isGeneratingPdf || roomPlot.saving}
                className="px-5 text-sm"
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isGeneratingPdf || roomPlot.saving}
              className="px-5 text-sm"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
      {overlapHover && !isGeneratingPdf && overlapHover.ids.some(id => overlapMessages.has(id)) && (
        <ExcelValidationTooltip anchor={overlapHover.anchor} tone="danger"
          messages={groupOverlapMessages(proposedMeetings.filter(meeting => overlapHover.ids.includes(meeting.id)))} />
      )}
      <div className="absolute inset-0 -z-10" onClick={() => { if (!roomPlot.saving) onClose() }} />
    </div>
  )
}
