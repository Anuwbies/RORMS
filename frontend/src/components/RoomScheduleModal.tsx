import { Fragment, useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { formatUserName } from '../utils/userName'
import { CalendarIcon, SpinnerIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { db, auth } from '../firebase'
import { roomScheduleInstructor, roomScheduleLabel, scheduleSectionLabel, scheduleMatchesTerm } from '../utils/roomSchedule'
import { subscribeRoomTimetable } from '../services/roomTimetable'
import { collection, onSnapshot } from 'firebase/firestore'
import type { Room } from '../types/room'
import { Button } from './Button'
import { ExtendedReservationBadge } from './ExtendedReservationBadge'
import { SingleSelectDropdown } from './SingleSelectDropdown'
import { DatePicker } from './DatePicker'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import { sizeSchedulePdfGrids } from '../utils/schedulePdfLayout'

export interface RoomScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onBack?: () => void
  room?: Room | null
  buildingName?: string
  initialAcademicYear?: string
  initialSemester?: string
  actionButton?: ReactNode
  hideFilters?: boolean
  showWeekCalendar?: boolean
  showStatusColors?: boolean
  forceFullDaySchedule?: boolean
  isInline?: boolean
  hideReturnedSchedules?: boolean
  scheduleStatuses?: readonly ('Draft' | 'Plot')[]
  hideReservationIdentity?: boolean
  onReserveFreeSlot?: (slot: { date: string; startTime: string }) => void
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

const STANDARD_CHECKPOINTS = [450, 540, 630, 720, 810, 900, 990, 1080] // 07:30, 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 18:00

const generateTimeSlots = (startTime: string, endTime: string): string[] => {
  const startMins = timeToMins(startTime)
  const endMins = timeToMins(endTime)
  if (startMins >= endMins) return []

  const boundaries = new Set<number>()
  boundaries.add(startMins)
  boundaries.add(endMins)

  STANDARD_CHECKPOINTS.forEach(cp => {
    if (cp > startMins && cp < endMins) {
      boundaries.add(cp)
    }
  })

  const sorted = Array.from(boundaries).sort((a, b) => a - b)
  const slots: string[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i]
    const e = sorted[i + 1]
    const startStr = `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
    const endStr = `${Math.floor(e / 60).toString().padStart(2, '0')}:${(e % 60).toString().padStart(2, '0')}`
    slots.push(`${startStr}-${endStr}`)
  }

  return slots
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

const scheduleCardLabel = (schedule: Parameters<typeof roomScheduleLabel>[0] & { college?: unknown }) => {
  const college = typeof schedule.college === 'string' ? schedule.college.trim() : ''
  return college || roomScheduleLabel(schedule)
}

export function RoomScheduleModal({
  isOpen,
  onClose,
  onBack,
  room,
  buildingName,
  initialAcademicYear,
  initialSemester,
  actionButton,
  hideFilters,
  showWeekCalendar,
  forceFullDaySchedule = false,
  isInline = false,
  hideReturnedSchedules = false,
  scheduleStatuses,
  hideReservationIdentity = false,
  onReserveFreeSlot,
}: RoomScheduleModalProps) {
  const isRoomMode = Boolean(room)
  const scheduleRoomId = room?.id

  const [schedules, setSchedules] = useState<any[]>([])
  const [reservations, setReservations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [scheduleLoadError, setScheduleLoadError] = useState('')
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester || '1st Semester')
  const [instructorsMap, setInstructorsMap] = useState<Map<string, string>>(new Map())
  const [userDepartmentMap, setUserDepartmentMap] = useState<Map<string, string>>(new Map())
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(() => getLocalIsoDate())
  const [selectedFreeSlot, setSelectedFreeSlot] = useState<{ date: string; startTime: string } | null>(null)

  // Reset to today when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedWeekDate(getLocalIsoDate())
      setSelectedFreeSlot(null)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedFreeSlot(null)
  }, [selectedWeekDate, scheduleRoomId])

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

  // 2. Fetch Users & Memberships (for Room mode)
  useEffect(() => {
    if (!isOpen || !isRoomMode) return

    let unsubscribeMemberships: (() => void) | null = null

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      unsubscribeMemberships?.()
      const usersDataMap = new Map<string, any>()
      usersSnap.forEach(uDoc => usersDataMap.set(uDoc.id, uDoc.data()))

      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (memSnap) => {
        const map = new Map<string, string>()
        const deptMap = new Map<string, string>()
        memSnap.forEach(mDoc => {
          const mem = mDoc.data()
          const user = usersDataMap.get(mem.userId)
          const name = formatUserName(user, mem) || user?.email || mem.email || 'Instructor'
          map.set(mDoc.id, name)
          if (mem.userId) {
            map.set(mem.userId, name)
            const dept = mem.department
            if (dept) deptMap.set(mem.userId, dept)
          }
        })
        usersDataMap.forEach((user, uid) => {
          if (!map.has(uid)) {
            map.set(uid, formatUserName(user) || user.email || 'Instructor')
          }
        })
        setInstructorsMap(map)
        setUserDepartmentMap(deptMap)
      })
    })

    return () => {
      unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
    }
  }, [isOpen, isRoomMode])

  // 4. Fetch Schedules in Real-Time
  useEffect(() => {
    setScheduleLoadError('')
    if (!isOpen) {
      setSchedules([])
      setIsLoading(false)
      return
    }

    if (isRoomMode && scheduleRoomId) {
      setIsLoading(true)
      setSchedules([])
      setReservations([])
      return subscribeRoomTimetable(scheduleRoomId, Boolean(showWeekCalendar), timetable => {
        setSchedules(timetable.schedules)
        setReservations(timetable.reservations)
        setScheduleLoadError('')
        setIsLoading(false)
      }, err => {
        console.error('Error loading room schedules:', err)
        setSchedules([])
        setReservations([])
        setScheduleLoadError('The room schedule could not be loaded. Close and reopen the schedule to retry.')
        setIsLoading(false)
      })
    }

    

    setSchedules([])
    setIsLoading(false)
  }, [isOpen, isRoomMode, scheduleRoomId, showWeekCalendar])

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

  const getMeetingStatus = (meeting: { status?: string; statusByDay?: Record<string, 'Draft' | 'Plot'> }, day?: string) =>
    day && meeting.statusByDay?.[day] || meeting.status || 'Draft'

  const getScheduleStatusClasses = (meeting: Parameters<typeof getMeetingStatus>[0], day: string) => {
    const s = getMeetingStatus(meeting, day)
    if (s === 'Plot') return 'bg-[var(--brand-color)]/15 border-[var(--brand-color)]/50'
    if (s === 'Revise' || s === 'Revised') return 'bg-amber-50 border-amber-300'
    if (s === 'Return' || s === 'Returned') return 'bg-rose-50 border-rose-300'
    return 'bg-slate-100 border-slate-300' // Draft
  }

  const getPdfStatusStyles = (meeting: Parameters<typeof getMeetingStatus>[0], day: string) => {
    const s = getMeetingStatus(meeting, day)
    if (s === 'Plot') return { backgroundColor: '#e7f0df', borderColor: '#a3c48b' }
    if (s === 'Revise' || s === 'Revised') return { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }
    if (s === 'Return' || s === 'Returned') return { backgroundColor: '#fff1f2', borderColor: '#fda4af' }
    return { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' } // Draft
  }

  const getReservationDepartment = (reservation: { department?: string; userId?: string }) => {
    return reservation.department?.trim()
      || (reservation.userId ? userDepartmentMap.get(reservation.userId) : '')
      || ('')
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

  // 6. Build Time Slots (Room start/end time if room mode without forceFullDaySchedule, or 07:30 - 18:00 standard whole day)
  const timeSlots = useMemo(() => {
    const baseSlots = isRoomMode && room && !forceFullDaySchedule
      ? generateTimeSlots(room.startTime || '07:30', room.endTime || '18:00')
      : STANDARD_TIME_SLOTS

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

    const roomStartMins = isRoomMode && room && !forceFullDaySchedule ? timeToMins(room.startTime || '07:30') : null
    const roomEndMins = isRoomMode && room && !forceFullDaySchedule ? timeToMins(room.endTime || '18:00') : null

    return Array.from(timeSlotSet)
      .filter(slot => {
        if (roomStartMins !== null && roomEndMins !== null) {
          const [s, e] = slot.split('-')
          const sMins = timeToMins(s)
          const eMins = timeToMins(e)
          return sMins >= roomStartMins && eMins <= roomEndMins
        }
        return true
      })
      .sort((a, b) => {
        const startA = a.split('-')[0]
        const startB = b.split('-')[0]
        if (startA !== startB) return startA.localeCompare(startB)
        return a.split('-')[1].localeCompare(b.split('-')[1])
      })
  }, [isRoomMode, room?.startTime, room?.endTime, forceFullDaySchedule, filteredSchedules, activeWeekReservations, showWeekCalendar])

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

  // Keep the room's time rows while rendering meetings that cross rows once.
  const slotGroupsByDay = useMemo(() => {
    const groups: Record<string, Array<{ endIndex: number; schedules: typeof scheduleGrid[string][string] } | null>> = {}

    DAYS.forEach(day => {
      const dayGroups = Array.from({ length: timeSlots.length }, () => null as { endIndex: number; schedules: typeof scheduleGrid[string][string] } | null)

      for (let startIndex = 0; startIndex < timeSlots.length;) {
        let endIndex = startIndex

        for (let index = startIndex; index <= endIndex; index++) {
          const schedules = scheduleGrid[timeSlots[index]]?.[day] || []
          schedules.forEach(schedule => {
            for (let nextIndex = endIndex + 1; nextIndex < timeSlots.length && isScheduleInSlot(schedule, timeSlots[nextIndex]); nextIndex++) {
              endIndex = nextIndex
            }
          })
        }

        const uniqueSchedules = new Map<string, typeof scheduleGrid[string][string][number]>()
        for (let index = startIndex; index <= endIndex; index++) {
          const schedules = scheduleGrid[timeSlots[index]]?.[day] || []
          schedules.forEach(schedule => {
            const identity = schedule.id ?? schedule.docId ?? `${schedule.subjectCode}-${schedule.startTime}-${schedule.endTime}-${scheduleSectionLabel(schedule)}`
            const key = `${schedule._itemType}:${identity}`
            if (!uniqueSchedules.has(key)) uniqueSchedules.set(key, schedule)
          })
        }

        dayGroups[startIndex] = { endIndex, schedules: Array.from(uniqueSchedules.values()) }
        startIndex = endIndex + 1
      }

      groups[day] = dayGroups
    })

    return groups
  }, [timeSlots, scheduleGrid])

  const busyIntervalsByDay = useMemo(() => {
    const intervals: Record<string, { start: number; end: number }[]> = {}
    DAYS.forEach(day => {
      intervals[day] = timeSlots.flatMap(slot => (scheduleGrid[slot]?.[day] || [])
        .filter(item => item.startTime && item.endTime)
        .map(item => ({ start: timeToMins(item.startTime), end: timeToMins(item.endTime) })))
    })
    return intervals
  }, [scheduleGrid, timeSlots])

  const renderFreeSlotButton = (date: string, startTime: string, dateLabel: string, gridRow?: number) => {
    const isSelected = selectedFreeSlot?.date === date && selectedFreeSlot.startTime === startTime
    return (
      <button
        key={startTime}
        type="button"
        style={gridRow ? { gridRow } : undefined}
        className="flex h-full w-full flex-1 items-center justify-center cursor-pointer hover:bg-[#f3f7ee] focus-visible:outline-2 focus-visible:outline-[var(--brand-color)]"
        aria-label={isSelected
          ? `Reserve room on ${dateLabel} at ${formatTime(startTime)}`
          : `Select free time on ${dateLabel} at ${formatTime(startTime)}`}
        onClick={() => {
          if (isSelected) onReserveFreeSlot?.({ date, startTime })
          else setSelectedFreeSlot({ date, startTime })
        }}
      >
        {isSelected && <span className="rounded-lg bg-[var(--brand-color)] px-3 py-2 text-xs font-semibold text-white shadow-sm">Reserve Room</span>}
      </button>
    )
  }

  const academicYearOptions = useMemo(() => {
    return academicYears.map(y => y.academicYear)
  }, [academicYears])

  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setIsGeneratingPdf(true)
    let restorePdfGridHeights = () => {}

    // Yield control to let React flush the state and paint the "Exporting PDF..." button immediately
    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const element = printRef.current
      restorePdfGridHeights = sizeSchedulePdfGrids(element)

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

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      })

      const margin = 20
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const scale = Math.min((pageWidth - margin * 2) / imgWidth, (pageHeight - margin * 2) / imgHeight)
      const printWidth = imgWidth * scale
      const printHeight = imgHeight * scale

      pdf.addImage(imgData, 'PNG', (pageWidth - printWidth) / 2, (pageHeight - printHeight) / 2, printWidth, printHeight)

      const targetName = room?.code || room?.name || 'Room'
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
      restorePdfGridHeights()
      setIsGeneratingPdf(false)
    }
  }

  if (!isOpen && !isInline) return null
  if (!room) return null

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
                  {`${room?.name} Schedule`}
                </h2>

              </div>
              <p style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: 500, margin: '4px 0 0 0' }}>
                {`${buildingName ? `${buildingName} • ` : ''}Floor ${room.floor} • ${room.type}`}
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
                {timeSlots.map((slot, slotIndex) => {
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
                        const slotGroup = slotGroupsByDay[day][slotIndex]
                        if (!slotGroup) return null
                        const daySchedules = slotGroup.schedules
                        const span = slotGroup.endIndex - slotIndex + 1
                        const isSelected = false
                        if (daySchedules.length === 0) {
                          return (
                            <td key={day} rowSpan={span} style={{ border: '1px solid #d1d5db', backgroundColor: isSelected ? '#f3f7ee' : '#ffffff', padding: '6px', verticalAlign: 'top', height: '103px' }}>
                              <div style={{ height: '100%' }} />
                            </td>
                          )
                        }

                        
                        const slotStartMins = timeToMins(start)
                        const slotEndMins = timeToMins(timeSlots[slotGroup.endIndex].split('-')[1])
                        const numSubRows = Math.max(1, Math.round((slotEndMins - slotStartMins) / 30))
                        return (
                          <td key={day} rowSpan={span} style={{ border: '1px solid #d1d5db', backgroundColor: isSelected ? '#f3f7ee' : '#ffffff', padding: '6px', verticalAlign: 'top' }}>
                            <div data-pdf-schedule-grid style={{ display: 'grid', gridTemplateRows: `repeat(${numSubRows}, minmax(0, 1fr))`, gap: '4px', width: '100%', height: '100%' }}>
                              {daySchedules.map((item, idx) => {
                                const itemStartMins = Math.max(slotStartMins, timeToMins(item.startTime))
                                const itemEndMins = Math.min(slotEndMins, timeToMins(item.endTime))

                                const startRow = Math.floor((itemStartMins - slotStartMins) / 30) + 1
                                const endRow = Math.max(startRow + 1, Math.ceil((itemEndMins - slotStartMins) / 30) + 1)
                                const gridRowStyle = `${startRow} / ${endRow}`

                                if (item._itemType === 'reservation') {
                                  const isApproved = item.status === 'Approved'
                                  const bgColor = isApproved ? '#d1fae5' : '#fef3c7'
                                  const borderColor = isApproved ? '#6ee7b7' : '#fcd34d'
                                  const textColor = isApproved ? '#065f46' : '#92400e'

                                  return (
                                    <div key={item.id || idx} style={{ gridRow: gridRowStyle, backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                        <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {item.subjectCode || 'Reservation'}
                                        </span>
                                        <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                          {item.status || 'Booked'}
                                        </span>
                                      </div>
                                      <ExtendedReservationBadge requestType={item.requestType} />
                                      <div style={{ marginTop: '4px', borderTop: `1px solid ${borderColor}`, paddingTop: '4px', fontSize: '10px', color: textColor, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <span style={{ color: '#1f2937' }}>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <span style={{ color: '#1f2937', fontWeight: 500 }}>{scheduleSectionLabel(item)}</span></div>
                                        {!hideReservationIdentity && (
                                          <>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563', fontWeight: 500 }}>{getReservationDepartment(item)}</span></div>
                                          </>
                                        )}
                                        {false}
                                      </div>
                                    </div>
                                  )
                                }

                                const pdfStyles = getPdfStatusStyles(item, day)
                                const instructorName = roomScheduleInstructor(item, instructorsMap)
                                return (
                                  <div key={item.id || idx} style={{ gridRow: gridRowStyle, backgroundColor: pdfStyles.backgroundColor, border: `1px solid ${pdfStyles.borderColor}`, borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subjectCode || 'TBA'}</span>
                                      <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                        {scheduleCardLabel(item)}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: '4px', borderTop: `1px solid ${pdfStyles.borderColor}`, paddingTop: '4px', fontSize: '10px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <span style={{ color: '#1f2937', fontWeight: 500 }}>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <span style={{ color: '#1f2937', fontWeight: 500 }}>{scheduleSectionLabel(item)}</span></div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Inst: <span style={{ color: '#1f2937', fontWeight: 500 }}>{instructorName}</span></div>
                                      {item.department && (
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563', fontWeight: 500 }}>{item.department}</span></div>
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
      >
        {/* Modal Header */}
        <div className="relative z-30 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-7 py-5 text-white rounded-t-2xl shrink-0 flex items-center justify-between gap-4 overflow-visible">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold tracking-tight text-white">
                {`${room?.name} Schedule`}
              </h3>

            </div>
            <p className="mt-0.5 text-xs text-white/80 font-medium">
              {`${buildingName ? `${buildingName} • ` : ''}Floor ${room.floor} • ${room.type}`}
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
                    isDisabled={false}
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
                  isDisabled={false}
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
                {timeSlots.map((slot, slotIndex) => {
                  const [start, end] = slot.split('-')
                  return (
                    <tr key={slot} className="contents group">
                      <td className="px-3 py-2 text-xs font-bold text-gray-700 border-b border-r border-gray-300 align-middle whitespace-nowrap bg-gray-50/60 group-hover:bg-gray-100/70 transition-colors h-full flex items-center justify-center" style={{ gridColumn: 1, gridRow: slotIndex + 2 }}>
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-gray-900 font-bold text-xs">{formatTime(start)}</span>
                          <span className="text-gray-900 font-bold text-xs">{formatTime(end)}</span>
                        </div>
                      </td>
                      {DAYS.map((day, dayIndex) => {
                        const slotGroup = slotGroupsByDay[day][slotIndex]
                        if (!slotGroup) return null
                        const daySchedules = slotGroup.schedules
                        const spansRows = slotGroup.endIndex > slotIndex
                        const cellPosition = { gridColumn: dayIndex + 2, gridRow: `${slotIndex + 2} / span ${slotGroup.endIndex - slotIndex + 1}` }
                        const columnBorder = dayIndex === DAYS.length - 1 ? 'border-r-0' : 'border-r'
                        const weekDay = weekInfo.weekDays.find(candidate => candidate.dayName === day)
                        const slotDate = weekDay?.isoString || ''
                        const slotStartMins = timeToMins(start)
                        const slotEndMins = timeToMins(timeSlots[slotGroup.endIndex].split('-')[1])
                        const numSubRows = Math.max(1, Math.round((slotEndMins - slotStartMins) / 30))
                        const minBookingMins = Math.max(30, room.minBookingMins || 30)
                        const now = new Date()
                        const earliestTodayStart = Math.ceil((now.getHours() * 60 + now.getMinutes() + 120) / 30) * 30
                        const canReserveOnDay = Boolean(onReserveFreeSlot && showWeekCalendar && slotDate
                          && slotDate >= getLocalIsoDate(now) && slotDate <= maxDate
                          && room.availableDays.some(availableDay => normalizeDay(availableDay) === day))
                        const freeStarts: { time: string; row: number }[] = []
                        if (canReserveOnDay) {
                          for (let minute = Math.ceil(slotStartMins / 30) * 30; minute < slotEndMins; minute += 30) {
                            const bookingEnd = minute + minBookingMins
                            if (minute < timeToMins(room.startTime || '07:30')
                              || bookingEnd > timeToMins(room.endTime || '18:00')
                              || (slotDate === getLocalIsoDate(now) && minute < earliestTodayStart)
                              || busyIntervalsByDay[day].some(interval => interval.start < bookingEnd && interval.end > minute)) continue
                            freeStarts.push({
                              time: `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`,
                              row: Math.floor((minute - slotStartMins) / 30) + 1,
                            })
                          }
                        }
                        const isSelected = freeStarts.some(candidate => selectedFreeSlot?.date === slotDate && selectedFreeSlot.startTime === candidate.time)

                        if (daySchedules.length === 0) {
                          return (
                            <td
                              key={day}
                              className={`px-2.5 py-2 border-b ${columnBorder} border-gray-300 align-top transition-colors h-full flex flex-col min-w-0 ${isSelected
                                  ? 'bg-[#f3f7ee]/90 group-hover:bg-[#e3edda]/60'
                                  : 'bg-white group-hover:bg-gray-50/50'
                                }`}
                              style={cellPosition}
                            >
                              {freeStarts.length > 0
                                ? renderFreeSlotButton(slotDate, freeStarts[0].time, weekDay?.formattedShort || slotDate)
                                : <div className="flex-1 h-full" />}
                            </td>
                          )
                        }

                        
                        const isSingleFullSlot = daySchedules.length === 1 &&
                          timeToMins(daySchedules[0].startTime) <= slotStartMins &&
                          timeToMins(daySchedules[0].endTime) >= slotEndMins;

                        const gridRowsStyle = daySchedules.length > 0
                          ? daySchedules.some(item => item.type === 'parallel')
                            ? `repeat(${numSubRows}, minmax(max-content, 1fr))`
                            : daySchedules.some(item => item._itemType === 'reservation')
                            ? `repeat(${numSubRows}, minmax(${isSingleFullSlot ? '0' : '4rem'}, 1fr))`
                            : (isSingleFullSlot ? `repeat(${numSubRows}, minmax(0, 1fr))` : `repeat(${numSubRows}, 4rem)`)
                          : 'auto';

                        return (
                          <Fragment key={day}>
                          {spansRows && (
                            <td
                              key={`${day}-grid`}
                              className={`px-2.5 py-2 border-b ${columnBorder} border-gray-300 align-top transition-colors h-full flex flex-col min-w-0 ${isSelected
                                  ? 'bg-[#f3f7ee]/90 group-hover:bg-[#e3edda]/60'
                                  : 'bg-white group-hover:bg-gray-50/50'
                                }`}
                              style={cellPosition}
                            >
                              <div className="flex-1 h-full" />
                            </td>
                          )}
                          <td
                            key={day}
                            className={`px-2.5 py-2 align-top transition-colors min-w-0 h-full grid gap-1 ${spansRows ? 'relative z-10' : `border-b ${columnBorder} border-gray-300`} ${isSelected && !spansRows
                                ? 'bg-[#f3f7ee]/90 group-hover:bg-[#e3edda]/60'
                                : spansRows ? '' : 'bg-white group-hover:bg-gray-50/50'
                              }`}
                            style={{ ...cellPosition, gridTemplateRows: gridRowsStyle }}
                          >
                            {freeStarts.map(candidate => renderFreeSlotButton(slotDate, candidate.time, weekDay?.formattedShort || slotDate, candidate.row))}
                            {daySchedules.map((item, idx) => {
                              const itemStartMins = Math.max(slotStartMins, timeToMins(item.startTime))
                              const itemEndMins = Math.min(slotEndMins, timeToMins(item.endTime))

                              const startRow = Math.floor((itemStartMins - slotStartMins) / 30) + 1
                              const endRow = Math.max(startRow + 1, Math.ceil((itemEndMins - slotStartMins) / 30) + 1)
                              const gridRowStyle = `${startRow} / ${endRow}`

                              if (item._itemType === 'reservation') {
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
                                      <span className="truncate text-gray-500 shrink-0">Time: <span className="text-gray-700 font-medium">{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></span>
                                      <span className="truncate text-gray-500 shrink-0" title={scheduleSectionLabel(item)}>Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(item)}</span></span>
                                      {!hideReservationIdentity && (
                                        <>
                                          <span className="truncate text-gray-500 shrink-0" title={getReservationDepartment(item)}>Dept: <span className="font-medium text-gray-600">{getReservationDepartment(item)}</span></span>
                                        </>
                                      )}
                                      {false}
                                    </div>
                                  </div>
                                )
                              }

                              const instructorName = roomScheduleInstructor(item, instructorsMap)
                              return (
                                <div key={item.id || idx} style={{ gridRow: gridRowStyle }} className={`flex flex-col p-2 border rounded text-sm shadow-sm hover:shadow transition-shadow min-w-0 ${item.type === 'parallel' ? 'min-h-max' : 'min-h-0'} overflow-hidden ${getScheduleStatusClasses(item, day)}`}>
                                  <div className="flex flex-row items-center gap-1.5 min-w-0">
                                    <span className="font-bold text-gray-900 uppercase truncate" title={item.subjectTitle}>{item.subjectCode || 'TBA'}</span>
                                    <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                      {scheduleCardLabel(item)}
                                    </span>
                                  </div>
                                  <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0 border-t border-[var(--brand-color)]/20 pt-1.5">
                                    <span className="truncate" title={`${formatTime(item.startTime)} - ${formatTime(item.endTime)}`}>Time: <span className="font-medium text-gray-700">{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></span>
                                    <span className="truncate" title={scheduleSectionLabel(item)}>Sec: <span className="font-medium text-gray-700 uppercase">{scheduleSectionLabel(item)}</span></span>                                    <span className="truncate" title={instructorName}>Inst: <span className="font-medium text-gray-700">{instructorName}</span></span>
                                    {item.department && (
                                      <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{item.department}</span></span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </td>
                          </Fragment>
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

          </div>
          <div className="flex items-center gap-3">
            {actionButton !== undefined ? (
              actionButton
            ) : (
              <Button
                type="button"
                variant="primary"
                onClick={handleDownloadPdf}
                disabled={isLoading || Boolean(scheduleLoadError) || isGeneratingPdf || (false)}
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
                disabled={isGeneratingPdf}
                className="px-5 text-sm"
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isGeneratingPdf}
              className="px-5 text-sm"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onClick={() => { onClose() }} />
    </div>
  )
}
