import { useState, useEffect } from 'react'
import { CalendarIcon, ClockIcon, BuildingIcon, LayersIcon, SearchIcon } from '../../components/Icons'
import { SectionHeader } from '../../components/SectionHeader'
import { auth, db } from '../../firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore'

function MySchedulePage() {
  const [memberSchedules, setMemberSchedules] = useState<any[]>([])
  const [rooms, setRooms] = useState<{id: string, code: string, name: string}[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Stats Calculation
  const totalSessions = memberSchedules.length
  
  const daysActive = new Set<string>()
  const roomsUtilized = new Set<string>()
  let totalMinutes = 0

  memberSchedules.forEach(schedule => {
    if (schedule.days && Array.isArray(schedule.days)) {
      schedule.days.forEach((day: string) => daysActive.add(day))
    }
    if (schedule.roomId) {
      roomsUtilized.add(schedule.roomId)
    }
    if (schedule.startTime && schedule.endTime) {
      const [startH, startM] = schedule.startTime.split(':').map(Number)
      const [endH, endM] = schedule.endTime.split(':').map(Number)
      
      const startTotal = startH * 60 + startM
      const endTotal = endH * 60 + endM
      
      if (endTotal > startTotal) {
        const daysCount = schedule.days?.length || 1;
        totalMinutes += (endTotal - startTotal) * daysCount
      }
    }
  })

  const totalWeeklyHours = (totalMinutes / 60).toFixed(1)

  useEffect(() => {
    const unsubscribeRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const fetchedRooms = snapshot.docs.map(doc => ({
        id: doc.id,
        code: doc.data().code,
        name: doc.data().name
      }))
      setRooms(fetchedRooms)
    })
    return () => unsubscribeRooms()
  }, [])

  useEffect(() => {
    let unsubscribeMemberships: (() => void) | null = null
    let unsubscribeSchedule: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid), limit(1))
        unsubscribeMemberships = onSnapshot(membershipQuery, (mSnap) => {
          if (!mSnap.empty) {
            const mId = mSnap.docs[0].id
            const q = query(collection(db, 'schedule'), where('instructorId', '==', mId))
            unsubscribeSchedule = onSnapshot(q, (snapshot) => {
              const fetchedSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
              fetchedSchedules.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0))
              setMemberSchedules(fetchedSchedules)
              setIsLoading(false)
            })
          } else {
            setMemberSchedules([])
            setIsLoading(false)
          }
        })
      } else {
        setMemberSchedules([])
        setIsLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeMemberships) unsubscribeMemberships()
      if (unsubscribeSchedule) unsubscribeSchedule()
    }
  }, [])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6">
        <SectionHeader 
          title="My Schedule" 
          description="View and manage your upcoming room bookings and scheduled activities." 
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              
              <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm flex items-center gap-4 transition-transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100 shrink-0">
                  <LayersIcon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Total Sessions">Total Sessions</p>
                  <p className="mt-0.5 text-2xl font-black text-gray-900 leading-none">{totalSessions}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm flex items-center gap-4 transition-transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100 shrink-0">
                  <CalendarIcon className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Days Active">Days Active</p>
                  <p className="mt-0.5 text-2xl font-black text-gray-900 leading-none">{daysActive.size}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm flex items-center gap-4 transition-transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 border border-amber-100 shrink-0">
                  <BuildingIcon className="h-8 w-8 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Rooms Utilized">Rooms Utilized</p>
                  <p className="mt-0.5 text-2xl font-black text-gray-900 leading-none">{roomsUtilized.size}</p>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm flex items-center gap-4 transition-transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 border border-purple-100 shrink-0">
                  <ClockIcon className="h-8 w-8 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-widest text-gray-500 truncate" title="Weekly Hours">Weekly Hours</p>
                  <p className="mt-0.5 text-2xl font-black text-gray-900 leading-none">{totalWeeklyHours}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto bg-gray-50/50 overscroll-none flex flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-button]:hidden">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 text-gray-500">Loading schedule...</div>
                ) : memberSchedules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="h-16 w-16 rounded-full bg-gray-50 flex items-center justify-center border border-gray-300">
                      <SearchIcon className="h-8 w-8 text-gray-300" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-gray-900">No Schedule Data</h4>
                      <p className="text-sm text-gray-500 max-w-xs mx-auto">
                        You are not currently assigned to any classes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <table className="grid w-full text-left text-sm whitespace-nowrap min-w-max" style={{ gridTemplateColumns: '6rem repeat(7, minmax(10rem, 1fr))' }}>
                    <thead className="contents text-gray-700 font-bold text-base">
                      <tr className="contents">
                        <th className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 sticky top-0 z-20">Time</th>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                          <th key={day} className="p-2 border-b-2 border-r text-center border-gray-300 bg-gray-50 last:border-r-0 sticky top-0 z-20">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="contents">
                      {(() => {
                        const timeSlotSet = new Set<string>();
                        memberSchedules.forEach(schedule => {
                          if (schedule.startTime && schedule.endTime && schedule.days && schedule.days.length > 0) {
                            timeSlotSet.add(`${schedule.startTime}-${schedule.endTime}`);
                          }
                        });

                        const timeSlots = Array.from(timeSlotSet).sort((a, b) => {
                          const startA = a.split('-')[0];
                          const startB = b.split('-')[0];
                          if (startA !== startB) return startA.localeCompare(startB);
                          return a.split('-')[1].localeCompare(b.split('-')[1]);
                        });

                        const grid: Record<string, Record<string, any[]>> = {};
                        timeSlots.forEach(slot => {
                          grid[slot] = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
                        });

                        memberSchedules.forEach(schedule => {
                          if (schedule.startTime && schedule.endTime && schedule.days) {
                            const slot = `${schedule.startTime}-${schedule.endTime}`;
                            schedule.days.forEach((day: string) => {
                              if (grid[slot] && grid[slot][day]) {
                                grid[slot][day].push(schedule);
                              }
                            });
                          }
                        });

                        const formatTime = (time: string) => {
                          if (!time) return '';
                          const [h, m] = time.split(':');
                          const hours = parseInt(h, 10);
                          const suffix = hours >= 12 ? 'PM' : 'AM';
                          const displayHours = hours % 12 || 12;
                          return `${displayHours}:${m} ${suffix}`;
                        };

                        if (timeSlots.length === 0) {
                          return (
                            <tr>
                              <td colSpan={8} className="px-6 py-12 text-center text-gray-500 text-sm">
                                Schedules found but missing time or day data.
                              </td>
                            </tr>
                          );
                        }

                        return timeSlots.map(slot => {
                          const [start, end] = slot.split('-');
                          return (
                            <tr key={slot} className="contents group">
                              <td className="px-3 py-3 text-sm font-bold text-gray-700 border-b border-r border-gray-300 align-top whitespace-nowrap bg-gray-50/30 group-hover:bg-gray-50/50 transition-colors">
                                <div className="flex flex-col items-center justify-center h-full gap-1 pt-2">
                                  <span>{formatTime(start)}</span>
                                  <span>{formatTime(end)}</span>
                                </div>
                              </td>
                              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                                const daySchedules = grid[slot][day];
                                const grouped: { parent: any, children: any[] }[] = [];
                                
                                daySchedules.forEach(cls => {
                                  if (cls.type === 'parallel') {
                                    if (cls.groupId) {
                                      const existingGroup = grouped.find(g => g.parent.groupId === cls.groupId);
                                      if (existingGroup) {
                                        existingGroup.children.push(cls);
                                      } else {
                                        grouped.push({ parent: cls, children: [] });
                                      }
                                    } else {
                                      grouped.push({ parent: cls, children: [] });
                                    }
                                  } else if (cls.parentId) {
                                    const parentGroup = grouped.find(g => g.parent.id === cls.parentId || g.parent.docId === cls.parentId);
                                    if (parentGroup) {
                                      parentGroup.children.push(cls);
                                    } else {
                                      grouped.push({ parent: cls, children: [] });
                                    }
                                  } else {
                                    grouped.push({ parent: cls, children: [] });
                                  }
                                });

                                return (
                                  <td key={day} className="px-2 py-2 border-b border-r border-gray-300 last:border-r-0 align-top bg-white group-hover:bg-gray-50/50 transition-colors">
                                    <div className="flex flex-col gap-2">
                                      {grouped.map((group, idx) => (
                                        group.parent.type === 'parallel' ? (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm transition-all">
                                            <div className="flex flex-col focus:outline-none">
                                              <div className="flex flex-row items-center gap-1.5">
                                                <span className="font-bold text-gray-900 uppercase">{group.parent.subjectCode || 'TBA'}</span>
                                                <span className="font-bold text-gray-600 uppercase tracking-wider">
                                                  {group.parent.format || 'N/A'}
                                                </span>
                                              </div>
                                            </div>
                                            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2 cursor-default" onClick={e => e.stopPropagation()}>
                                              {[group.parent, ...group.children].map((item, iIdx) => (
                                                <div key={iIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30">
                                                  <div className="flex flex-col gap-0.5 text-gray-500">
                                                    <span>Sec: <span className="font-medium text-gray-700 uppercase">{item.classSection || 'TBA'}</span></span>
                                                    <span className="text-[var(--brand-color)] font-medium truncate" title={item.roomId ? rooms.find(r => r.id === item.roomId)?.code || 'TBA' : 'TBA'}>
                                                      {item.roomId ? rooms.find(r => r.id === item.roomId)?.code || 'TBA' : 'TBA'}
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : group.children.length > 0 ? (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/5 border border-[var(--brand-color)]/30 rounded text-sm shadow-sm">
                                            <div className="flex flex-row items-center gap-1.5">
                                              <span className="font-bold text-gray-900 uppercase">{group.parent.subjectCode || 'TBA'}</span>
                                              <span className="font-bold text-gray-600 uppercase tracking-wider">
                                                {group.parent.format || 'N/A'}
                                              </span>
                                            </div>
                                            <div className="mt-1 flex flex-col gap-0.5 text-gray-500">
                                              <span>Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                              <span className="text-[var(--brand-color)] font-medium truncate" title={group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}>
                                                {group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}
                                              </span>
                                            </div>
                                            <div className="mt-2 flex flex-col gap-2 border-t border-[var(--brand-color)]/20 pt-2">
                                              {group.children.map((child, cIdx) => (
                                                <div key={cIdx} className="flex flex-col pl-2 border-l-2 border-[var(--brand-color)]/30">
                                                  <span className="font-bold text-gray-900 uppercase">{child.subjectCode || 'TBA'}</span>
                                                  <div className="mt-0.5 flex flex-col gap-0.5 text-gray-500">
                                                    <span>Sec: <span className="font-medium text-gray-700 uppercase">{child.classSection || 'TBA'}</span></span>
                                                    <span className="text-[var(--brand-color)] font-medium truncate" title={child.roomId ? rooms.find(r => r.id === child.roomId)?.code || 'TBA' : 'TBA'}>
                                                      {child.roomId ? rooms.find(r => r.id === child.roomId)?.code || 'TBA' : 'TBA'}
                                                    </span>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <div key={idx} className="flex flex-col p-2 bg-[var(--brand-color)]/10 border border-[var(--brand-color)]/20 rounded text-sm shadow-sm">
                                            <div className="flex flex-row items-center gap-1.5">
                                              <span className="font-bold text-gray-900 uppercase">{group.parent.subjectCode || 'TBA'}</span>
                                              <span className="font-bold text-gray-600 uppercase tracking-wider">
                                                {group.parent.format || 'N/A'}
                                              </span>
                                            </div>
                                            <div className="mt-1.5 flex flex-col gap-0.5 text-gray-500">
                                              <span>Sec: <span className="font-medium text-gray-700 uppercase">{group.parent.classSection || 'TBA'}</span></span>
                                              <span className="text-[var(--brand-color)] font-medium truncate" title={group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}>
                                                {group.parent.roomId ? rooms.find(r => r.id === group.parent.roomId)?.code || 'TBA' : 'TBA'}
                                              </span>
                                            </div>
                                          </div>
                                        )
                                      ))}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
      </div>
    </section>
  )
}

export default MySchedulePage
