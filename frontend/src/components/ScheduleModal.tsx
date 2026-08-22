import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { CalendarIcon, SpinnerIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons'
import { db } from '../firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import type { Room } from '../types/room'
import { Button } from './Button'
import { SingleSelectDropdown } from './SingleSelectDropdown'
import { DatePicker } from './DatePicker'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

export interface ScheduleMemberInfo {
  id?: string
  membershipId?: string
  userId?: string
  name: string
  email?: string
  role?: string
}

export interface ScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onBack?: () => void
  // Target: provide either room or member (or both)
  room?: Room | null
  buildingName?: string
  member?: ScheduleMemberInfo | null
  initialAcademicYear?: string
  initialSemester?: string
  actionButton?: ReactNode
  hideFilters?: boolean
  showWeekCalendar?: boolean
}

interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: { name?: string; phase?: string }
  sem2?: { name?: string; phase?: string }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

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
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() + diffToMon)

  const todayIso = getLocalIsoDate(new Date())

  const weekDays = (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((dayName, idx) => {
    const current = new Date(monday)
    current.setDate(monday.getDate() + idx)
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

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const isCurrentWeek = weekDays.some(d => d.isToday)
  const label = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return {
    monday,
    sunday,
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

export function ScheduleModal({
  isOpen,
  onClose,
  onBack,
  room,
  buildingName,
  member,
  initialAcademicYear,
  initialSemester,
  actionButton,
  hideFilters,
  showWeekCalendar
}: ScheduleModalProps) {
  const isRoomMode = Boolean(room)
  const isInstructorMode = Boolean(member && !room)

  const [schedules, setSchedules] = useState<any[]>([])
  const [reservations, setReservations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester || '1st Semester')
  const [instructorsMap, setInstructorsMap] = useState<Map<string, string>>(new Map())
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map())
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

  // 1. Fetch Academic Years
  useEffect(() => {
    if (!isOpen) return

    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const years = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearData))
      years.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(years)

      if (years.length > 0) {
        setSelectedAcademicYear(prev => {
          if (initialAcademicYear) {
            const matched = years.find(y => y.academicYear === initialAcademicYear)
            if (matched) return matched
          }
          if (prev && years.some(y => y.id === prev.id)) return prev
          return years.find(y => y.isActive) || years[0]
        })
      }
    })

    return () => unsubscribe()
  }, [isOpen, initialAcademicYear])

  // 2. Fetch Users & Memberships (for Room mode)
  useEffect(() => {
    if (!isOpen || !isRoomMode) return

    let unsubscribeMemberships: (() => void) | null = null

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersDataMap = new Map<string, any>()
      usersSnap.forEach(uDoc => usersDataMap.set(uDoc.id, uDoc.data()))

      unsubscribeMemberships = onSnapshot(collection(db, 'memberships'), (memSnap) => {
        const map = new Map<string, string>()
        memSnap.forEach(mDoc => {
          const mem = mDoc.data()
          const user = usersDataMap.get(mem.userId)
          const name = user?.fullName || user?.email || 'Instructor'
          map.set(mDoc.id, name)
          if (mem.userId) map.set(mem.userId, name)
        })
        usersDataMap.forEach((user, uid) => {
          if (!map.has(uid)) {
            map.set(uid, user.fullName || user.email || 'Instructor')
          }
        })
        setInstructorsMap(map)
      })
    })

    return () => {
      unsubscribeUsers()
      if (unsubscribeMemberships) unsubscribeMemberships()
    }
  }, [isOpen, isRoomMode])

  // 3. Fetch Rooms (for Instructor mode)
  useEffect(() => {
    if (!isOpen || !isInstructorMode) return

    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snap) => {
      const map = new Map<string, string>()
      snap.forEach(doc => {
        const data = doc.data()
        map.set(doc.id, data.code || data.name || 'Room')
      })
      setRoomsMap(map)
    })

    return () => unsubscribe()
  }, [isOpen, isInstructorMode])

  // 4. Fetch Schedules in Real-Time
  useEffect(() => {
    if (!isOpen) {
      setSchedules([])
      setIsLoading(false)
      return
    }

    if (isRoomMode && room?.id) {
      setIsLoading(true)
      const qSchedule = query(collection(db, 'schedule'), where('roomId', '==', room.id))
      const qReservations = query(collection(db, 'reservations'), where('roomId', '==', room.id))

      let schedulesLoaded = false
      let reservationsLoaded = !showWeekCalendar

      const unsubscribeSchedule = onSnapshot(qSchedule, (snapshot) => {
        const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        fetched.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
        setSchedules(fetched)
        schedulesLoaded = true
        if (reservationsLoaded) setIsLoading(false)
      }, (err) => {
        console.error('Error loading room schedules:', err)
        setSchedules([])
        schedulesLoaded = true
        if (reservationsLoaded) setIsLoading(false)
      })

      let unsubscribeReservations: (() => void) | null = null
      if (showWeekCalendar) {
        unsubscribeReservations = onSnapshot(qReservations, (snapshot) => {
          const fetched = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((r: any) => r.status === 'Approved' || r.status === 'Pending')
          setReservations(fetched)
          reservationsLoaded = true
          if (schedulesLoaded) setIsLoading(false)
        }, (err) => {
          console.error('Error loading room reservations:', err)
          setReservations([])
          reservationsLoaded = true
          if (schedulesLoaded) setIsLoading(false)
        })
      } else {
        setReservations([])
      }

      return () => {
        unsubscribeSchedule()
        if (unsubscribeReservations) unsubscribeReservations()
      }
    }

    if (isInstructorMode && member) {
      if (member.role === 'Dean') {
        setSchedules([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      const validInstructorIds = [member.membershipId, member.id, member.userId].filter(Boolean) as string[]

      const q = query(collection(db, 'schedule'))

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched: any[] = []
        snapshot.docs.forEach(d => {
          const data = d.data()
          if (validInstructorIds.includes(data.instructorId)) {
            fetched.push({ id: d.id, ...data })
          }
        })
        fetched.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
        setSchedules(fetched)
        setIsLoading(false)
      }, (err) => {
        console.error('Error loading instructor schedules:', err)
        setSchedules([])
        setIsLoading(false)
      })

      return () => unsubscribe()
    }

    setSchedules([])
    setIsLoading(false)
  }, [isOpen, isRoomMode, isInstructorMode, room?.id, member])

  // 5. Filter Schedules by Academic Year & Semester
  const filteredSchedules = useMemo(() => {
    if (!schedules.length) return []
    return schedules.filter(s => {
      if (selectedAcademicYear?.academicYear && s.academicYear) {
        if (s.academicYear !== selectedAcademicYear.academicYear) return false
      }
      if (selectedSemester && s.semester) {
        if (s.semester !== selectedSemester) return false
      }
      return true
    })
  }, [schedules, selectedAcademicYear?.academicYear, selectedSemester])

  const getInstructorName = (instructorId?: string) => {
    if (!instructorId) return 'TBA'
    return instructorsMap.get(instructorId) || 'TBA'
  }

  const getRoomCode = (roomId?: string) => {
    if (!roomId) return 'TBA'
    return roomsMap.get(roomId) || 'TBA'
  }

  const getUserName = (uid?: string) => {
    if (!uid) return 'User'
    return instructorsMap.get(uid) || 'User'
  }

  const activeWeekReservations = useMemo(() => {
    if (!isRoomMode || !showWeekCalendar || !reservations.length) return []
    const weekIsoSet = new Set(weekInfo.weekDays.map(w => w.isoString))
    return reservations.filter(r => r.date && weekIsoSet.has(r.date))
  }, [isRoomMode, showWeekCalendar, reservations, weekInfo.weekDays])

  // 6. Build Time Slots (Standard whole day 07:30 - 18:00, 1h 30m each + any custom slots)
  const timeSlots = useMemo(() => {
    const timeSlotSet = new Set<string>(STANDARD_TIME_SLOTS)

    filteredSchedules.forEach(schedule => {
      if (schedule.startTime && schedule.endTime) {
        const formatted = `${padTime(schedule.startTime)}-${padTime(schedule.endTime)}`
        if (!STANDARD_TIME_SLOTS.some(slot => isScheduleInSlot(schedule, slot))) {
          timeSlotSet.add(formatted)
        }
      }
    })

    if (showWeekCalendar) {
      activeWeekReservations.forEach(res => {
        if (res.startTime && res.endTime) {
          const formatted = `${padTime(res.startTime)}-${padTime(res.endTime)}`
          if (!STANDARD_TIME_SLOTS.some(slot => isScheduleInSlot(res, slot))) {
            timeSlotSet.add(formatted)
          }
        }
      })
    }

    return Array.from(timeSlotSet).sort((a, b) => {
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
      grid[slot] = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] }
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
                  grid[slot][d].push({ ...res, _itemType: 'reservation' })
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

      const targetName = isRoomMode ? (room?.code || room?.name || 'Room') : (member?.name || 'Instructor')
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

  if (!isOpen) return null
  if (!room && !member) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
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
                  {isRoomMode ? `${room?.name} Schedule` : `${member?.name}'s Schedule`}
                </h2>

              </div>
              <p style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: 500, margin: '4px 0 0 0' }}>
                {isRoomMode && room
                  ? `${buildingName ? `${buildingName} • ` : ''}Floor ${room.floor} • ${room.type}`
                  : `${member?.role || 'Instructor'} • ${member?.email || ''}`}
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
                    return (
                      <th key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#f9fafb', padding: '6px 4px', fontSize: '12px', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>
                        <div>{day}</div>
                        {wDay && (
                          <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 'normal' }}>{wDay.formattedShort}</div>
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
                        if (daySchedules.length === 0) {
                          return (
                            <td key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#ffffff', padding: '6px', verticalAlign: 'top', height: '103px' }}>
                              <div style={{ height: '100%' }} />
                            </td>
                          )
                        }

                        if (isRoomMode) {
                          return (
                            <td key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#ffffff', padding: '6px', verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', height: '100%' }}>
                                {daySchedules.map((item, idx) => {
                                  if (item._itemType === 'reservation') {
                                    return (
                                      <div key={item.id || idx} style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '3px' }}>
                                          <span style={{ fontWeight: 'bold', color: '#92400e', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {getUserName(item.userId)}
                                          </span>
                                          <span style={{ fontWeight: 'bold', color: '#b45309', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                            {item.status || 'Reserved'}
                                          </span>
                                        </div>
                                        <div style={{ marginTop: '4px', borderTop: '1px solid #fde68a', paddingTop: '4px', fontSize: '10px', color: '#78350f', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Time: <strong style={{ color: '#1f2937' }}>{formatTime(item.startTime)} - {formatTime(item.endTime)}</strong></div>
                                        </div>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div key={item.id || idx} style={{ backgroundColor: '#f3f7ee', border: '1px solid #c6dbb6', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                        <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subjectCode || 'TBA'}</span>
                                        <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                          {item.format || 'N/A'}
                                        </span>
                                      </div>
                                      <div style={{ marginTop: '4px', borderTop: '1px solid #c6dbb6', paddingTop: '4px', fontSize: '10px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <strong style={{ color: '#1f2937' }}>{item.classSection || 'TBA'}</strong></div>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Inst: <strong style={{ color: '#62853e' }}>{getInstructorName(item.instructorId)}</strong></div>
                                        {item.department && (
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563' }}>{item.department}</span></div>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
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

                        return (
                          <td key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#ffffff', padding: '6px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', height: '100%' }}>
                              {grouped.map((group, idx) => (
                                group.parent.type === 'parallel' ? (
                                  <div key={idx} style={{ backgroundColor: '#f3f7ee', border: '1px solid #c6dbb6', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.parent.subjectCode || 'TBA'}</span>
                                      <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                        {group.parent.format || 'N/A'}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #c6dbb6', paddingTop: '4px' }}>
                                      {[group.parent, ...group.children].map((item, iIdx) => (
                                        <div key={iIdx} style={{ display: 'flex', flexDirection: 'column', paddingLeft: '6px', borderLeft: '2px solid #62853e', fontSize: '10px', color: '#4b5563' }}>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <strong style={{ color: '#1f2937' }}>{item.classSection || 'TBA'}</strong></div>
                                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Room: <strong style={{ color: '#62853e' }}>{getRoomCode(item.roomId)}</strong></div>
                                          {item.department && (
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563' }}>{item.department}</span></div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div key={idx} style={{ backgroundColor: '#f3f7ee', border: '1px solid #c6dbb6', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '6px', marginBottom: '3px' }}>
                                      <span style={{ fontWeight: 'bold', color: '#111827', textTransform: 'uppercase', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.parent.subjectCode || 'TBA'}</span>
                                      <span style={{ fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase', fontSize: '9px', flexShrink: 0 }}>
                                        {group.parent.format || 'N/A'}
                                      </span>
                                    </div>
                                    <div style={{ marginTop: '4px', borderTop: '1px solid #c6dbb6', paddingTop: '4px', fontSize: '10px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Sec: <strong style={{ color: '#1f2937' }}>{group.parent.classSection || 'TBA'}</strong></div>
                                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Room: <strong style={{ color: '#62853e' }}>{getRoomCode(group.parent.roomId)}</strong></div>
                                      {group.parent.department && (
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dept: <span style={{ color: '#4b5563' }}>{group.parent.department}</span></div>
                                      )}
                                    </div>
                                  </div>
                                )
                              ))}
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
        className="w-[85vw] max-w-[85vw] h-[88vh] max-h-[88vh] flex flex-col rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="relative z-30 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-7 py-5 text-white rounded-t-3xl shrink-0 flex items-center justify-between gap-4 overflow-visible">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold tracking-tight text-white">
                {isRoomMode ? `${room?.name} Schedule` : `${member?.name}'s Schedule`}
              </h3>

            </div>
            <p className="mt-0.5 text-xs text-white/80 font-medium">
              {isRoomMode && room
                ? `${buildingName ? `${buildingName} • ` : ''}Floor ${room.floor} • ${room.type}`
                : `${member?.role || 'Instructor'} • ${member?.email || ''}`}
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
                  className="h-11 px-3.5 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  This Week
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const prev = new Date(weekInfo.monday)
                  prev.setDate(prev.getDate() - 7)
                  setSelectedWeekDate(getLocalIsoDate(prev))
                }}
                title="Previous Week"
                className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <ChevronLeftIcon className="h-5 w-5" />
              </button>

              <div className="w-56">
                <DatePicker
                  value={selectedWeekDate}
                  onChange={(date) => setSelectedWeekDate(date)}
                  align="right"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = new Date(weekInfo.monday)
                  next.setDate(next.getDate() + 7)
                  setSelectedWeekDate(getLocalIsoDate(next))
                }}
                title="Next Week"
                className="h-11 w-11 flex items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <ChevronRightIcon className="h-5 w-5" />
              </button>
            </div>
          ) : !hideFilters ? (
            <div className="flex items-center gap-3 shrink-0">
              {/* Academic Year & Semester SingleSelectDropdowns */}
              {academicYearOptions.length > 0 && (
                <div className="w-52">
                  <SingleSelectDropdown
                    options={academicYearOptions}
                    value={selectedAcademicYear?.academicYear || ''}
                    onChange={(val) => {
                      const found = academicYears.find(y => y.academicYear === val)
                      if (found) setSelectedAcademicYear(found)
                    }}
                    className="[&>button]:!rounded-xl [&>button]:!bg-white [&>button]:!border-white/30 [&>button]:!shadow-sm"
                  />
                </div>
              )}

              <div className="w-52">
                <SingleSelectDropdown
                  options={['1st Semester', '2nd Semester'] as const}
                  value={selectedSemester as '1st Semester' | '2nd Semester'}
                  onChange={(val) => setSelectedSemester(val)}
                  className="[&>button]:!rounded-xl [&>button]:!bg-white [&>button]:!border-white/30 [&>button]:!shadow-sm"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto overflow-x-auto bg-gray-50/50 overscroll-none flex flex-col relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
              <SpinnerIcon className="h-9 w-9 text-[var(--brand-color)] animate-spin" />
              <p className="text-sm font-bold text-slate-700">Loading schedule...</p>
              <p className="text-xs text-slate-400">Retrieving timetable assignments.</p>
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
                gridTemplateColumns: '6rem repeat(7, minmax(11.25rem, 1fr))',
                gridTemplateRows: `auto repeat(${timeSlots.length}, minmax(7.5rem, auto))`
              }}
            >
              <thead className="contents text-gray-700 font-bold text-base">
                <tr className="contents">
                  <th className="p-2 h-14 flex items-center justify-center border-b-2 border-r text-center border-gray-300 bg-gray-50 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold text-gray-700">Time</th>
                  {DAYS.map((day, dIdx) => {
                    const wDay = showWeekCalendar ? weekInfo.weekDays[dIdx] : null
                    return (
                      <th key={day} className="p-2 h-14 flex flex-col items-center justify-center border-b-2 border-r text-center border-gray-300 bg-gray-50 last:border-r-0 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold text-gray-700">
                        <span className="text-sm font-bold text-gray-800">{day}</span>
                        {wDay && (
                          <span className={`text-[0.625rem] font-bold mt-0.5 px-1.5 py-0.2 rounded-md ${wDay.isToday ? 'bg-[var(--brand-color)] text-white' : 'text-gray-400 bg-gray-100'}`}>
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

                        if (daySchedules.length === 0) {
                          return (
                            <td key={day} className="px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top bg-white group-hover:bg-gray-50/50 transition-colors h-full flex flex-col min-w-0">
                              <div className="flex-1 h-full" />
                            </td>
                          )
                        }

                        if (isRoomMode) {
                          return (
                            <td key={day} className="px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top bg-white group-hover:bg-gray-50/50 transition-colors h-full flex flex-col justify-start min-w-0">
                              <div className="flex flex-col gap-2 w-full h-full flex-1">
                                {daySchedules.map((item, idx) => {
                                  if (item._itemType === 'reservation') {
                                    const isApproved = item.status === 'Approved'
                                    return (
                                      <div
                                        key={item.id || idx}
                                        className={`flex flex-col p-2 rounded text-sm shadow-sm transition-shadow h-full flex-1 min-w-0 border ${
                                          isApproved
                                            ? 'bg-amber-500/10 border-amber-500/30'
                                            : 'bg-sky-500/10 border-sky-500/30'
                                        }`}
                                      >
                                        <div className="flex flex-row items-center justify-between gap-1.5 min-w-0">
                                          <span className="font-bold text-gray-900 truncate text-xs">
                                            {getUserName(item.userId)}
                                          </span>
                                          <span
                                            className={`font-black uppercase tracking-wider text-[0.5625rem] px-1.5 py-0.5 rounded-full shrink-0 ${
                                              isApproved
                                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                : 'bg-sky-100 text-sky-800 border border-sky-300'
                                            }`}
                                          >
                                            {item.status || 'Reserved'}
                                          </span>
                                        </div>
                                        <div className={`mt-1.5 flex flex-col gap-0.5 text-xs min-w-0 border-t pt-1.5 ${
                                          isApproved ? 'border-amber-500/20 text-amber-900/80' : 'border-sky-500/20 text-sky-900/80'
                                        }`}>
                                          <span className="truncate">Time: <span className="font-semibold text-gray-800">{formatTime(item.startTime)} - {formatTime(item.endTime)}</span></span>
                                        </div>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div key={item.id || idx} className="flex flex-col p-2 bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 rounded text-sm shadow-sm hover:shadow transition-shadow h-full flex-1 min-w-0">
                                      <div className="flex flex-row items-center gap-1.5 min-w-0">
                                        <span className="font-bold text-gray-900 uppercase truncate">{item.subjectCode || 'TBA'}</span>
                                        <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                          {item.format || 'N/A'}
                                        </span>
                                      </div>
                                      <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0 border-t border-[var(--brand-color)]/20 pt-1.5">
                                        <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{item.classSection || 'TBA'}</span></span>
                                        <span className="truncate">Inst: <span className="text-[var(--brand-color)] font-medium truncate" title={getInstructorName(item.instructorId)}>
                                          {getInstructorName(item.instructorId)}
                                        </span></span>
                                        {item.department && (
                                          <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{item.department}</span></span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
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

                        return (
                          <td key={day} className="px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top bg-white group-hover:bg-gray-50/50 transition-colors h-full flex flex-col justify-start min-w-0">
                            <div className="flex flex-col gap-2 w-full h-full flex-1">
                              {grouped.map((group, idx) => (
                                group.parent.type === 'parallel' ? (
                                  <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm transition-all h-full flex-1 min-w-0">
                                    <div className="flex flex-col focus:outline-none min-w-0">
                                      <div className="flex flex-row items-center gap-1.5 min-w-0">
                                        <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                        <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                          {group.parent.format || 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2 cursor-default min-w-0" onClick={e => e.stopPropagation()}>
                                      {[group.parent, ...group.children].map((item, iIdx) => (
                                        <div key={iIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30 min-w-0">
                                          <div className="flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                            <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{item.classSection || 'TBA'}</span></span>
                                            <span className="truncate">Room: <span className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(item.roomId)}>
                                              {getRoomCode(item.roomId)}
                                            </span></span>
                                            {item.department && (
                                              <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{item.department}</span></span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : group.children.length > 0 ? (
                                  <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm h-full flex-1 min-w-0">
                                    <div className="flex flex-row items-center gap-1.5 min-w-0">
                                      <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                      <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                        {group.parent.format || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                      <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                      <span className="truncate">Room: <span className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(group.parent.roomId)}>
                                        {getRoomCode(group.parent.roomId)}
                                      </span></span>
                                      {group.parent.department && (
                                        <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{group.parent.department}</span></span>
                                      )}
                                    </div>
                                    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2 min-w-0">
                                      {group.children.map((child, cIdx) => (
                                        <div key={cIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30 min-w-0">
                                          <span className="font-bold text-gray-900 uppercase truncate">{child.subjectCode || 'TBA'}</span>
                                          <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                            <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{child.classSection || 'TBA'}</span></span>
                                            <span className="truncate">Room: <span className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(child.roomId)}>
                                              {getRoomCode(child.roomId)}
                                            </span></span>
                                            {child.department && (
                                              <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{child.department}</span></span>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 rounded text-sm shadow-sm hover:shadow transition-shadow h-full flex-1 min-w-0">
                                    <div className="flex flex-row items-center gap-1.5 min-w-0">
                                      <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                      <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                        {group.parent.format || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0 border-t border-[var(--brand-color)]/20 pt-1.5">
                                      <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                      <span className="truncate">Room: <span className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(group.parent.roomId)}>
                                        {getRoomCode(group.parent.roomId)}
                                      </span></span>
                                      {group.parent.department && (
                                        <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{group.parent.department}</span></span>
                                      )}
                                    </div>
                                  </div>
                                )
                              ))}
                            </div>
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
        <div className="bg-gray-50/80 px-7 py-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 rounded-b-3xl relative z-30">
          <div className="text-xs text-gray-500 font-medium">
            {showWeekCalendar ? (
              <>Showing schedule for <span className="font-bold text-gray-700">{weekInfo.label}</span></>
            ) : (
              <>Showing schedule for <span className="font-bold text-gray-700">{selectedAcademicYear?.academicYear || 'Academic Year'} • {selectedSemester}</span></>
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
                disabled={isLoading || isGeneratingPdf || (isInstructorMode && member?.role === 'Dean')}
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
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  )
}
