import { useState, useEffect, useMemo, useRef } from 'react'
import { CalendarIcon, ClockIcon, LayersIcon, SpinnerIcon, DownloadIcon } from '../../components/Icons'
import { SectionHeader } from '../../components/SectionHeader'
import { SummaryCard } from '../../components/SummaryCard'
import { Button } from '../../components/Button'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { auth, db } from '../../firebase'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, query, where, onSnapshot, limit, doc } from 'firebase/firestore'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: { name?: string; phase?: string }
  sem2?: { name?: string; phase?: string }
}

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

  if (`${schedStart}-${schedEnd}` === slot) return true

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

function MySchedulePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentUserDoc, setCurrentUserDoc] = useState<any>(null)
  const [currentMembership, setCurrentMembership] = useState<any>(null)
  const [membershipId, setMembershipId] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')
  const [schedules, setSchedules] = useState<any[]>([])
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map())
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string>('1st Semester')
  const [isLoading, setIsLoading] = useState(true)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // 1. Fetch Academic Years
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const years = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearData))
      years.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(years)

      if (years.length > 0) {
        setSelectedAcademicYear(prev => {
          if (prev && years.some(y => y.id === prev.id)) return prev
          return years.find(y => y.isActive) || years[0]
        })
      }
    })

    return () => unsubscribe()
  }, [])

  // 2. Fetch Rooms Map
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'rooms'), (snap) => {
      const map = new Map<string, string>()
      snap.forEach(d => {
        const data = d.data()
        map.set(d.id, data.code || data.name || 'Room')
      })
      setRoomsMap(map)
    })
    return () => unsubscribe()
  }, [])

  // 3. Fetch Current User, Membership, and Schedules
  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeSchedule: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (user) {
        setIsLoading(true)

        // Fetch User Doc
        unsubscribeUserDoc = onSnapshot(doc(db, 'users', user.uid), (uSnap) => {
          if (uSnap.exists()) {
            setCurrentUserDoc(uSnap.data())
          }
        })

        // Fetch Membership
        const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid), limit(1))
        unsubscribeMemberships = onSnapshot(membershipQuery, (mSnap) => {
          if (!mSnap.empty) {
            const mDoc = mSnap.docs[0]
            const memData = mDoc.data()
            const mId = mDoc.id
            setMembershipId(mId)
            setCurrentMembership(memData)
            const role = memData.role || ''
            setUserRole(role)

            if (role === 'Dean') {
              setSchedules([])
              setIsLoading(false)
              return
            }

            // Fetch Instructor schedules
            const q = query(collection(db, 'schedule'))
            unsubscribeSchedule = onSnapshot(q, (snapshot) => {
              const validIds = [mId, user.uid]
              const fetched: any[] = []
              snapshot.docs.forEach(d => {
                const data = d.data()
                if (validIds.includes(data.instructorId)) {
                  fetched.push({ id: d.id, ...data })
                }
              })
              fetched.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
              setSchedules(fetched)
              setIsLoading(false)
            }, (err) => {
              console.error('Error loading schedules:', err)
              setSchedules([])
              setIsLoading(false)
            })
          } else {
            setUserRole('')
            setMembershipId('')
            setCurrentMembership(null)
            setSchedules([])
            setIsLoading(false)
          }
        }, (err) => {
          console.error('Error loading membership:', err)
          setIsLoading(false)
        })
      } else {
        setCurrentUserDoc(null)
        setCurrentMembership(null)
        setMembershipId('')
        setUserRole('')
        setSchedules([])
        setIsLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeUserDoc) unsubscribeUserDoc()
      if (unsubscribeMemberships) unsubscribeMemberships()
      if (unsubscribeSchedule) unsubscribeSchedule()
    }
  }, [])

  const getRoomCode = (roomId?: string) => {
    if (!roomId) return 'TBA'
    return roomsMap.get(roomId) || 'TBA'
  }

  // Filter Schedules by Academic Year & Semester
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

  // Stats Calculation from filteredSchedules
  const totalSessions = filteredSchedules.length
  
  const daysActive = useMemo(() => {
    const days = new Set<string>()
    filteredSchedules.forEach(schedule => {
      if (schedule.days && Array.isArray(schedule.days)) {
        schedule.days.forEach((day: string) => days.add(normalizeDay(day)))
      }
    })
    return days
  }, [filteredSchedules])

  const totalWeeklyHours = useMemo(() => {
    let totalMinutes = 0
    filteredSchedules.forEach(schedule => {
      if (schedule.startTime && schedule.endTime) {
        const [startH, startM] = schedule.startTime.split(':').map(Number)
        const [endH, endM] = schedule.endTime.split(':').map(Number)
        
        const startTotal = (startH || 0) * 60 + (startM || 0)
        const endTotal = (endH || 0) * 60 + (endM || 0)
        
        if (endTotal > startTotal) {
          const daysCount = schedule.days?.length || 1
          totalMinutes += (endTotal - startTotal) * daysCount
        }
      }
    })
    return (totalMinutes / 60).toFixed(1)
  }, [filteredSchedules])

  // Build Time Slots
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

    return Array.from(timeSlotSet).sort((a, b) => {
      const startA = a.split('-')[0]
      const startB = b.split('-')[0]
      if (startA !== startB) return startA.localeCompare(startB)
      return a.split('-')[1].localeCompare(b.split('-')[1])
    })
  }, [filteredSchedules])

  // Build Schedule Grid
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
                  grid[slot][d].push(schedule)
                }
              }
            })
          }
        })
      }
    })

    return grid
  }, [timeSlots, filteredSchedules])

  const academicYearOptions = useMemo(() => {
    return academicYears.map(y => y.academicYear)
  }, [academicYears])

  // PDF Export
  const handleDownloadPdf = async () => {
    if (!printRef.current) return
    setIsGeneratingPdf(true)

    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const element = printRef.current

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
        orientation: imgWidth > imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth, imgHeight]
      })

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

      const targetName = currentUserDoc?.fullName || currentUser?.displayName || 'My_Schedule'
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

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      {/* Hidden Print Template for PDF Export */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div
          ref={printRef}
          style={{
            width: '1200px',
            backgroundColor: '#ffffff',
            padding: '2px'
          }}
          className="flex flex-col font-sans"
        >
          <div style={{ background: 'linear-gradient(135deg, #62853e, #7b9d4f)', padding: '20px 32px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', margin: 0 }}>
                {currentUserDoc?.fullName || currentUser?.displayName || 'My Schedule'}
              </h2>
              <p style={{ marginTop: '4px', fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: 500, margin: '4px 0 0 0' }}>
                {userRole || currentMembership?.role || 'Instructor'} • {currentUser?.email || ''}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.2)', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#ffffff', border: '1px solid rgba(255,255,255,0.3)' }}>
                {`${selectedAcademicYear?.academicYear || 'Academic Year'} • ${selectedSemester}`}
              </span>
            </div>
          </div>

          <div style={{ borderBottom: '1px solid #d1d5db' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', backgroundColor: '#ffffff', borderTop: '1px solid #d1d5db', borderLeft: '1px solid #d1d5db', borderRight: '1px solid #d1d5db' }}>
              <thead>
                <tr>
                  <th style={{ width: '95px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', padding: '8px 4px', fontSize: '12px', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>Time</th>
                  {DAYS.map(day => (
                    <th key={day} style={{ border: '1px solid #d1d5db', backgroundColor: '#f9fafb', padding: '6px 4px', fontSize: '12px', fontWeight: 'bold', color: '#374151', textAlign: 'center' }}>
                      {day}
                    </th>
                  ))}
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

                                return group.parent.type === 'parallel' ? (
                                  <div key={idx} style={{ gridRow: gridRowStyle, backgroundColor: '#f3f7ee', border: '1px solid #c6dbb6', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                                  <div key={idx} style={{ gridRow: gridRowStyle, backgroundColor: '#f3f7ee', border: '1px solid #c6dbb6', borderRadius: '6px', padding: '6px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      </div>

      <div className="space-y-6">
        <SectionHeader 
          title="My Schedule" 
          description="View and manage your assigned classes, weekly timetable, and room schedule."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 transition-all duration-300">
          <SummaryCard
            title={totalSessions.toString()}
            subtitle="Total Assigned Classes"
            icon={<LayersIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-[var(--brand-color)] to-[#7b9d4f]"
            blobClasses="bg-[var(--brand-color)]/8 group-hover:bg-[var(--brand-color)]/14"
          />
          <SummaryCard
            title={`${daysActive.size} Days`}
            subtitle="Active Teaching Days"
            icon={<CalendarIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-amber-400 to-orange-500"
            blobClasses="bg-amber-400/8 group-hover:bg-amber-400/14"
          />
          <SummaryCard
            title={`${totalWeeklyHours} hrs`}
            subtitle="Weekly Teaching Load"
            icon={<ClockIcon className="w-4.5 h-4.5 text-white" />}
            gradientClasses="from-blue-400 to-indigo-500"
            blobClasses="bg-blue-400/8 group-hover:bg-blue-400/14"
          />
        </div>

        {/* Main Weekly Schedule Timetable Card */}
        {userRole === 'Dean' ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm flex flex-col items-center justify-center">
            <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-200 shadow-sm mb-4">
              <CalendarIcon className="h-8 w-8 text-amber-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900">Dean Scheduling Not Handled</h4>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1.5 leading-relaxed">
              The system does not handle Dean scheduling at this time. This feature is coming soon.
            </p>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 mt-4 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              Coming Soon
            </span>
          </div>
        ) : (
          <div className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden min-h-[600px]">
            {/* Header with brand gradient and Dropdown Filters */}
            <div className="relative z-30 bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-7 py-5 text-white rounded-t-2xl shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white">
                  {currentUserDoc?.fullName || currentUser?.displayName || 'Weekly Timetable'}
                </h3>
                <p className="mt-0.5 text-xs text-white/80 font-medium">
                  {userRole || currentMembership?.role || 'Instructor'} • {currentUser?.email || ''}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
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
            </div>

            {/* Timetable Grid Body */}
            <div className="flex-1 overflow-y-auto overflow-x-auto bg-gray-50/50 overscroll-none flex flex-col relative z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
              {isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-16 text-center gap-3">
                  <SpinnerIcon className="h-9 w-9 text-[var(--brand-color)] animate-spin" />
                  <p className="text-sm font-bold text-slate-700">Loading schedule...</p>
                  <p className="text-xs text-slate-400">Retrieving timetable assignments.</p>
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
                      {DAYS.map(day => (
                        <th key={day} className="p-2 h-14 flex flex-col items-center justify-center border-b-2 border-r text-center border-gray-300 bg-gray-50 last:border-r-0 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.05)] font-bold text-gray-700">
                          <span className="text-sm font-bold text-gray-800">{day}</span>
                        </th>
                      ))}
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
                              ? (isSingleFullSlot ? `repeat(${numSubRows}, minmax(0, 1fr))` : `repeat(${numSubRows}, 4rem)`) 
                              : 'auto';

                            return (
                              <td key={day} className="px-2.5 py-2 border-b border-r border-gray-300 last:border-r-0 align-top bg-white group-hover:bg-gray-50/50 transition-colors min-w-0 h-full grid gap-1" style={{ gridTemplateRows: gridRowsStyle }}>
                                  {grouped.map((group, idx) => {
                                    const itemStartMins = Math.max(slotStartMins, timeToMins(group.parent.startTime))
                                    const itemEndMins = Math.min(slotEndMins, timeToMins(group.parent.endTime))
                                    
                                    const startRow = Math.floor((itemStartMins - slotStartMins) / 30) + 1
                                    const endRow = Math.max(startRow + 1, Math.ceil((itemEndMins - slotStartMins) / 30) + 1)
                                    const gridRowStyle = `${startRow} / ${endRow}`

                                    return group.parent.type === 'parallel' ? (
                                      <div key={idx} style={{ gridRow: gridRowStyle }} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm transition-all min-w-0 min-h-0 overflow-hidden">
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
                                                <span className="truncate">Room: <strong className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(item.roomId)}>
                                                  {getRoomCode(item.roomId)}
                                                </strong></span>
                                                {item.department && (
                                                  <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{item.department}</span></span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : group.children.length > 0 ? (
                                      <div key={idx} style={{ gridRow: gridRowStyle }} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm min-w-0 min-h-0 overflow-hidden">
                                        <div className="flex flex-row items-center gap-1.5 min-w-0">
                                          <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                          <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                            {group.parent.format || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="mt-1 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0">
                                          <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                          <span className="truncate">Room: <strong className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(group.parent.roomId)}>
                                            {getRoomCode(group.parent.roomId)}
                                          </strong></span>
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
                                                <span className="truncate">Room: <strong className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(child.roomId)}>
                                                  {getRoomCode(child.roomId)}
                                                </strong></span>
                                                {child.department && (
                                                  <span className="truncate">Dept: <span className="font-medium text-gray-600 truncate">{child.department}</span></span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div key={idx} style={{ gridRow: gridRowStyle }} className="flex flex-col p-2 bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 rounded text-sm shadow-sm hover:shadow transition-shadow min-w-0 min-h-0 overflow-hidden">
                                        <div className="flex flex-row items-center gap-1.5 min-w-0">
                                          <span className="font-bold text-gray-900 uppercase truncate">{group.parent.subjectCode || 'TBA'}</span>
                                          <span className="font-bold text-gray-600 uppercase tracking-wider text-xs shrink-0">
                                            {group.parent.format || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-gray-500 min-w-0 border-t border-[var(--brand-color)]/20 pt-1.5">
                                          <span className="truncate">Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                          <span className="truncate">Room: <strong className="text-[var(--brand-color)] font-medium truncate" title={getRoomCode(group.parent.roomId)}>
                                            {getRoomCode(group.parent.roomId)}
                                          </strong></span>
                                          {group.parent.department && (
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

            {/* Footer with Academic Term indicator & PDF Download */}
            <div className="bg-gray-50/80 px-7 py-4 border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 rounded-b-2xl relative z-30">
              <div className="text-xs text-gray-500 font-medium">
                Showing schedule for <span className="font-bold text-gray-700">{selectedAcademicYear?.academicYear || 'Academic Year'} • {selectedSemester}</span>
              </div>
              <Button
                type="button"
                variant="brand"
                onClick={handleDownloadPdf}
                disabled={isLoading || isGeneratingPdf}
                className="w-45 px-4 text-sm flex items-center justify-center gap-2 text-white shadow-sm disabled:opacity-50 cursor-pointer !h-10"
                icon={isGeneratingPdf ? undefined : <DownloadIcon className="h-4 w-4" />}
              >
                {isGeneratingPdf ? 'Exporting PDF' : 'Download PDF'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default MySchedulePage
