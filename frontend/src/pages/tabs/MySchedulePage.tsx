import { useState, useEffect, useMemo, useRef } from 'react'
import { formatUserName } from '../../utils/userName'
import { scheduleMeetingRecords } from '../../utils/scheduleMeetings'
import { scheduleMatchesDepartment } from '../../utils/roomSchedule'
import { SectionHeader } from '../../components/SectionHeader'
import { Button } from '../../components/Button'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import { PersonalScheduleModal } from '../../components/PersonalScheduleModal'
import { resolveCurrentSemester } from '../../utils/academicSemester'
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
const SCHEDULE_STATUSES = ['Draft', 'Plot'] as const

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
  const [departmentName, setDepartmentName] = useState<string>('')
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
          
          const activeYear = years.find(y => y.isActive) || years[0]
          // When we resolve a new active year, also dynamically resolve its current semester
          setSelectedSemester(resolveCurrentSemester(activeYear))
          return activeYear
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

  // 2.5 Fetch Department Name
  useEffect(() => {
    if (currentMembership?.department) {
      const q = query(collection(db, 'departments'), where('code', '==', currentMembership.department), limit(1))
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setDepartmentName(snap.docs[0].data().name)
        } else {
          setDepartmentName(currentMembership.department)
        }
      })
      return () => unsub()
    }
  }, [currentMembership?.department])

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
              const fetched = scheduleMeetingRecords(snapshot.docs).filter(item => Boolean(item.instructorId && validIds.includes(item.instructorId))
                && scheduleMatchesDepartment(item, memData.department))
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
      if (!scheduleMatchesDepartment(s, currentMembership?.department)) return false
      if (selectedAcademicYear?.academicYear && s.academicYear) {
        if (s.academicYear !== selectedAcademicYear.academicYear) return false
      }
      if (selectedSemester && s.semester) {
        if (s.semester !== selectedSemester) return false
      }
      const status = s.status || 'Draft'
      if (!SCHEDULE_STATUSES.some(allowed => allowed === status)) return false
      return true
    })
  }, [schedules, currentMembership?.department, selectedAcademicYear?.academicYear, selectedSemester])

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

      const targetName = formatUserName(currentUserDoc) || currentUser?.displayName || 'My_Schedule'
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
                {formatUserName(currentUserDoc) || currentUser?.displayName || 'My Schedule'}
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

      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader 
          title="My Schedule" 
          description={userRole === 'Dean'
            ? 'View your weekly room reservations.'
            : `View and manage your assigned classes, weekly timetable, and room schedule for ${selectedAcademicYear?.academicYear || 'Academic Year'} • ${selectedSemester}.`}
        />


        {/* Main Weekly Schedule Timetable Card */}
          <PersonalScheduleModal
            isOpen={true}
            onClose={() => {}}
            member={{
              id: currentUser?.uid,
              membershipId: membershipId,
              userId: currentUser?.uid,
              name: formatUserName(currentUserDoc) || currentUser?.displayName || 'Instructor',
              email: currentUser?.email || '',
              role: userRole || currentMembership?.role || 'Instructor',
              department: currentMembership?.department || '',
              departmentName: departmentName || currentMembership?.departmentName || ''
            }}
            showWeekCalendar={true}
            showStatusColors={true}
            isInline={true}
            scheduleStatuses={SCHEDULE_STATUSES}
            hideReservationIdentity={true}
            initialAcademicYear={selectedAcademicYear?.academicYear}
            initialSemester={selectedSemester}
          />
      </div>
    </section>
  )
}

export default MySchedulePage
