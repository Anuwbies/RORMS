import { useState, useEffect } from 'react'
import {
  ClockIcon,
  CheckIcon,
  CloseIcon,
  CheckCircleIcon,
  SpinnerIcon,
  CalendarIcon
} from './Icons'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { db } from '../firebase'
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteField,
  serverTimestamp
} from 'firebase/firestore'

export interface RevisedScheduleItem {
  id: string
  docId: string
  childDocId?: string
  parentId?: string
  subjectCode: string
  code?: string
  subjectTitle?: string
  classSection?: string
  format?: string
  format2?: string
  instructorId?: string
  instructorId2?: string
  days: string[]
  startTime?: string
  endTime?: string
  startTime2?: string
  endTime2?: string
  buildingId?: string
  buildingId2?: string
  roomId?: string
  roomId2?: string
  status: string
  orderIndex: number
  revisionChanges?: string[]
}

interface DepartmentMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  department?: string
  membershipId?: string
  fullName?: string
  displayName?: string
}

interface RevisedSchedulesModalProps {
  isOpen: boolean
  onClose: () => void
  onProceedToEdit?: () => void
  departmentInfo: { name: string; code: string; logo: string } | null
  selectedAcademicYear: { academicYear: string } | null
  selectedSemesterPhase: { name: string; phase: string } | null
  members: DepartmentMember[]
}

export function combineSessionChanges(changes: string[]): string[] {
  if (!changes || changes.length === 0) return []

  const sessionFields = ['Building', 'Room', 'Instructor', 'Time', 'Days', 'Format']
  const result: string[] = []
  const consumed = new Set<number>()

  for (let i = 0; i < changes.length; i++) {
    if (consumed.has(i)) continue

    const str = changes[i]
    let matched = false

    for (const field of sessionFields) {
      // Check if it's a 1st session change
      const prefix1 = `${field} 1st session revised from `
      if (str.startsWith(prefix1)) {
        const withoutPrefix = str.substring(prefix1.length)
        const lastToIdx = withoutPrefix.lastIndexOf(' to ')
        if (lastToIdx !== -1) {
          const from1 = withoutPrefix.substring(0, lastToIdx)
          const to1 = withoutPrefix.substring(lastToIdx + 4)

          // Look for corresponding 2nd session change
          const prefix2 = `${field} 2nd session revised from `
          const match2Idx = changes.findIndex((otherStr, j) => {
            if (j === i || consumed.has(j)) return false
            return otherStr.startsWith(prefix2)
          })

          if (match2Idx !== -1) {
            const otherStr = changes[match2Idx]
            const withoutPrefix2 = otherStr.substring(prefix2.length)
            const lastToIdx2 = withoutPrefix2.lastIndexOf(' to ')
            if (lastToIdx2 !== -1) {
              const from2 = withoutPrefix2.substring(0, lastToIdx2)
              const to2 = withoutPrefix2.substring(lastToIdx2 + 4)

              result.push(`${field} 1st and 2nd session revised from ${from1} / ${from2} to ${to1} / ${to2}`)
              consumed.add(i)
              consumed.add(match2Idx)
              matched = true
              break
            }
          }
        }
      }

      // Check if it's a 2nd session change
      const prefix2 = `${field} 2nd session revised from `
      if (str.startsWith(prefix2)) {
        const withoutPrefix = str.substring(prefix2.length)
        const lastToIdx = withoutPrefix.lastIndexOf(' to ')
        if (lastToIdx !== -1) {
          const from2 = withoutPrefix.substring(0, lastToIdx)
          const to2 = withoutPrefix.substring(lastToIdx + 4)

          // Look for corresponding 1st session change
          const prefix1 = `${field} 1st session revised from `
          const match1Idx = changes.findIndex((otherStr, j) => {
            if (j === i || consumed.has(j)) return false
            return otherStr.startsWith(prefix1)
          })

          if (match1Idx !== -1) {
            const otherStr = changes[match1Idx]
            const withoutPrefix1 = otherStr.substring(prefix1.length)
            const lastToIdx1 = withoutPrefix1.lastIndexOf(' to ')
            if (lastToIdx1 !== -1) {
              const from1 = withoutPrefix1.substring(0, lastToIdx1)
              const to1 = withoutPrefix1.substring(lastToIdx1 + 4)

              result.push(`${field} 1st and 2nd session revised from ${from1} / ${from2} to ${to1} / ${to2}`)
              consumed.add(i)
              consumed.add(match1Idx)
              matched = true
              break
            }
          }
        }
      }
    }

    if (!matched) {
      result.push(str)
      consumed.add(i)
    }
  }

  return result
}

export function RevisedSchedulesModal({
  isOpen,
  onClose,
  onProceedToEdit,
  departmentInfo,
  selectedAcademicYear,
  selectedSemesterPhase,
  members
}: RevisedSchedulesModalProps) {
  const [schedules, setSchedules] = useState<RevisedScheduleItem[]>([])
  const [rooms, setRooms] = useState<{ id: string; name?: string; code?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedScheduleForChanges, setSelectedScheduleForChanges] = useState<RevisedScheduleItem | null>(null)

  // Fetch rooms for resolving room names
  useEffect(() => {
    if (!isOpen) return
    const qRooms = query(collection(db, 'rooms'))
    const unsubscribe = onSnapshot(qRooms, (snapshot) => {
      const roomList: { id: string; name?: string; code?: string }[] = []
      snapshot.forEach(docSnap => {
        roomList.push({ id: docSnap.id, ...docSnap.data() })
      })
      setRooms(roomList)
    })
    return () => unsubscribe()
  }, [isOpen])

  // Fetch revised schedules for this department & semester
  useEffect(() => {
    if (!isOpen || !departmentInfo?.code || !selectedAcademicYear?.academicYear || !selectedSemesterPhase?.name) {
      setSchedules([])
      setLoading(false)
      return
    }

    setLoading(true)
    const qSchedules = query(
      collection(db, 'schedule'),
      where('department', '==', departmentInfo.code),
      where('academicYear', '==', selectedAcademicYear.academicYear),
      where('semester', '==', selectedSemesterPhase.name)
    )

    const unsubscribe = onSnapshot(qSchedules, (snapshot) => {
      const STATUS_ORDER: Record<string, number> = {
        'Draft': 0,
        'Drafted': 0,
        'Return': 1,
        'Returned': 1,
        'Removed': 1,
        'Revising': 2,
        'Revise': 2,
        'Revised': 2,
        'Plot': 3,
        'Plotted': 3,
      }

      const getStatusRank = (status?: string): number => {
        if (!status) return 0
        return STATUS_ORDER[status] ?? 0
      }

      const parseOrderIndex = (val: any): number => {
        if (typeof val === 'number' && !isNaN(val)) return val
        if (typeof val === 'string' && !isNaN(Number(val))) return Number(val)
        return 999999
      }

      const rawList: RevisedScheduleItem[] = []
      snapshot.forEach((docSnap) => {
        const data = docSnap.data()
        rawList.push({
          id: data.id || (!data.parentId && data.groupId ? data.groupId : docSnap.id),
          docId: docSnap.id,
          parentId: data.parentId,
          subjectCode: data.subjectCode || data.code || '',
          code: data.code,
          subjectTitle: data.subjectTitle,
          classSection: data.classSection,
          format: data.format,
          format2: data.format2,
          instructorId: data.instructorId,
          instructorId2: data.instructorId2,
          days: Array.isArray(data.days) ? data.days : [],
          startTime: data.startTime,
          endTime: data.endTime,
          startTime2: data.startTime2,
          endTime2: data.endTime2,
          buildingId: data.buildingId,
          buildingId2: data.buildingId2,
          roomId: data.roomId,
          roomId2: data.roomId2,
          status: data.status || 'Draft',
          orderIndex: parseOrderIndex(data.orderIndex),
          revisionChanges: combineSessionChanges(Array.isArray(data.revisionChanges) ? data.revisionChanges : [])
        })
      })

      // Pair parent and child rows (e.g. parallel schedules)
      const parentMap = new Map<string, RevisedScheduleItem>()
      const childList: RevisedScheduleItem[] = []
      const allDocs = new Map(rawList.map(item => [item.id, item]))

      rawList.forEach(item => {
        const parentDoc = item.parentId ? allDocs.get(item.parentId) : null
        if (parentDoc && parentDoc.orderIndex === item.orderIndex) {
          childList.push(item)
        } else {
          parentMap.set(item.id, { ...item, days: Array.isArray(item.days) ? item.days : [] })
        }
      })

      // Attach child info to parent
      childList.forEach(child => {
        if (child.parentId && parentMap.has(child.parentId)) {
          const parent = parentMap.get(child.parentId)!
          parent.childDocId = child.docId
          if (child.revisionChanges && child.revisionChanges.length > 0) {
            parent.revisionChanges = combineSessionChanges(Array.from(new Set([...(parent.revisionChanges || []), ...child.revisionChanges])))
          }
        } else {
          parentMap.set(child.id, { ...child, days: Array.isArray(child.days) ? child.days : [] })
        }
      })

      const fetched = Array.from(parentMap.values())
      fetched.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))

      // Stable sort schedules by status: Draft (0) -> Return (1) -> Revise (2) -> Plot (3)
      const sortSchedulesByStatus = (list: RevisedScheduleItem[]): RevisedScheduleItem[] => {
        if (!list || list.length === 0) return list
        const groups: RevisedScheduleItem[][] = []
        const visited = new Set<number>()

        for (let i = 0; i < list.length; i++) {
          if (visited.has(i)) continue
          const s = list[i]
          const parentIdx = s.parentId
            ? list.findIndex(sc => sc.id === s.parentId)
            : i
          const parent = list[parentIdx]
          const indices = [parentIdx >= 0 ? parentIdx : i]
          if (parent) {
            for (let j = (parentIdx >= 0 ? parentIdx : i) + 1; j < list.length; j++) {
              if (list[j].parentId === parent.id) indices.push(j)
              else break
            }
          }
          indices.forEach(idx => visited.add(idx))
          groups.push(indices.map(idx => list[idx]))
        }

        groups.sort((a, b) => {
          const rankA = getStatusRank(a[0]?.status)
          const rankB = getStatusRank(b[0]?.status)
          return rankA - rankB
        })

        const result: RevisedScheduleItem[] = []
        for (const g of groups) {
          for (const item of g) {
            result.push(item)
          }
        }
        return result
      }

      // Assign calculated row index based on the full sorted list
      const sortedWithRowIndex = sortSchedulesByStatus(fetched).map((s, idx) => ({
        ...s,
        orderIndex: idx
      }))

      // Filter only revise status schedules
      const revisedOnly = sortedWithRowIndex.filter(s =>
        ['Revise', 'Revised', 'Revising'].includes(s.status)
      )

      setSchedules(revisedOnly)
      setLoading(false)
    }, (err) => {
      console.error('Error fetching revised schedules:', err)
      setSchedules([])
      setLoading(false)
    })

    return () => unsubscribe()
  }, [isOpen, departmentInfo?.code, selectedAcademicYear?.academicYear, selectedSemesterPhase?.name])

  // Handle Accept (Plot)
  const handleAccept = async (schedule: RevisedScheduleItem) => {
    setProcessingId(schedule.id)
    try {
      const updates = [
        updateDoc(doc(db, 'schedule', schedule.docId), {
          status: 'Plot',
          revisionChanges: deleteField(),
          updatedAt: serverTimestamp()
        })
      ]
      if (schedule.childDocId) {
        updates.push(
          updateDoc(doc(db, 'schedule', schedule.childDocId), {
            status: 'Plot',
            revisionChanges: deleteField(),
            updatedAt: serverTimestamp()
          })
        )
      }
      await Promise.all(updates)
    } catch (err) {
      console.error('Error accepting schedule revision:', err)
    } finally {
      setProcessingId(null)
    }
  }

  // Handle Decline (Return)
  const handleDecline = async (schedule: RevisedScheduleItem) => {
    setProcessingId(schedule.id)
    try {
      const updates = [
        updateDoc(doc(db, 'schedule', schedule.docId), {
          status: 'Return',
          revisionChanges: deleteField(),
          updatedAt: serverTimestamp()
        })
      ]
      if (schedule.childDocId) {
        updates.push(
          updateDoc(doc(db, 'schedule', schedule.childDocId), {
            status: 'Return',
            revisionChanges: deleteField(),
            updatedAt: serverTimestamp()
          })
        )
      }
      await Promise.all(updates)
    } catch (err) {
      console.error('Error declining schedule revision:', err)
    } finally {
      setProcessingId(null)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
        <div
          className="w-full max-w-4xl min-h-[22rem] max-h-[78vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-[linear-gradient(135deg,var(--brand-color),#7b9d4f)] px-6 py-4 text-white rounded-t-2xl shrink-0">
            <h3 className="text-xl font-bold tracking-tight text-white">
              Review Revised Schedules
            </h3>
            <p className="mt-0.5 text-xs text-white/80 font-medium">
              {departmentInfo?.code} &bull; {selectedAcademicYear?.academicYear} - {selectedSemesterPhase?.name}
            </p>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-0 bg-white">
            {loading ? (
              <div className="flex h-64 flex-col items-center justify-center">
                <SpinnerIcon className="h-8 w-8 animate-spin text-[var(--brand-color)]" />
                <p className="mt-3 text-sm font-semibold text-slate-500">Loading revised schedules...</p>
              </div>
            ) : schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-dashed border-gray-200 bg-white shadow-xs">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-4 border border-emerald-100">
                  <CheckCircleIcon className="h-9 w-9" />
                </div>
                <h4 className="text-lg font-bold text-slate-900">All Revisions Reviewed!</h4>
                <p className="mt-1 text-sm text-slate-500 max-w-md">
                  There are no pending revised schedules remaining for {departmentInfo?.code}. You can now proceed to the schedule editor.
                </p>
                <div className="mt-6 flex gap-3">
                  <Button
                    type="button"
                    variant="brand"
                    onClick={onProceedToEdit}
                    className="px-6 py-2.5 text-sm font-bold shadow-md hover:shadow-lg transition-all"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {schedules.map((schedule, idx) => {
                  const isItemProcessing = processingId === schedule.id
                  const displayName = schedule.subjectCode?.trim()
                    ? schedule.subjectCode
                    : (schedule.code?.trim()
                      ? schedule.code
                      : `Row #${schedule.orderIndex !== undefined ? schedule.orderIndex + 1 : idx + 1}`)
                  const changesCount = schedule.revisionChanges?.length || 0

                  return (
                    <div
                      key={schedule.id}
                      onClick={() => {
                        if (changesCount > 1) {
                          setSelectedScheduleForChanges(schedule)
                        }
                      }}
                      className={`py-3 px-3 -mx-3 rounded-xl transition-colors flex items-center justify-between gap-3 group ${
                        changesCount > 1 ? 'cursor-pointer hover:bg-slate-50/80' : ''
                      }`}
                    >
                      {/* Left: Code/Row# & single change or changes count */}
                      <div className="flex items-center gap-4 min-w-0 flex-1 mr-2">
                        <span className={`w-28 min-w-[7rem] shrink-0 font-bold text-sm text-slate-900 truncate ${changesCount > 1 ? 'group-hover:text-[var(--brand-color)] transition-colors' : ''}`}>
                          {displayName}
                        </span>
                        {changesCount === 1 ? (
                          <span className="text-xs text-slate-600 font-medium truncate" title={schedule.revisionChanges?.[0]}>
                            {schedule.revisionChanges?.[0]}
                          </span>
                        ) : changesCount > 1 ? (
                          <span
                            className="text-xs text-slate-600 font-medium truncate"
                            title={schedule.revisionChanges?.join('\n')}
                          >
                            <span>{schedule.revisionChanges?.[0]}</span>
                            <span className="text-slate-500 font-normal">
                              {`, and ${changesCount - 1} more ${changesCount - 1 === 1 ? 'change' : 'changes'}`}
                            </span>
                          </span>
                        ) : null}
                      </div>

                      {/* Right: Accept / Decline Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          label="Accept revision"
                          disabled={isItemProcessing}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAccept(schedule)
                          }}
                          className="h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 text-emerald-500 hover:border-emerald-300 hover:text-emerald-600 hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {isItemProcessing ? (
                            <SpinnerIcon className="h-4 w-4 animate-spin text-emerald-500" />
                          ) : (
                            <CheckIcon className="h-4 w-4" />
                          )}
                        </IconButton>
                        <IconButton
                          label="Decline revision"
                          disabled={isItemProcessing}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDecline(schedule)
                          }}
                          className="h-8 w-8 rounded-lg bg-white shadow-sm border border-slate-200 text-rose-500 hover:border-rose-300 hover:text-rose-600 hover:shadow hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                          {isItemProcessing ? (
                            <SpinnerIcon className="h-4 w-4 animate-spin text-rose-500" />
                          ) : (
                            <CloseIcon className="h-4 w-4" />
                          )}
                        </IconButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-white border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 rounded-b-2xl">
            <div className="text-sm font-medium text-gray-500">
              Rows: {schedules.length}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1 sm:flex-initial"
              >
                Close
              </Button>
              <Button
                type="button"
                variant="brand"
                onClick={onProceedToEdit}
                className="flex-1 sm:flex-initial shadow-md hover:shadow-lg"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Separate Revision Changes Details Modal */}
      {selectedScheduleForChanges && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedScheduleForChanges(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Changes List */}
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
              {selectedScheduleForChanges.revisionChanges && selectedScheduleForChanges.revisionChanges.length > 0 ? (
                <ul className="space-y-2.5">
                  {selectedScheduleForChanges.revisionChanges.map((change, cIdx) => (
                    <li key={cIdx} className="text-xs text-slate-700 font-medium flex items-center gap-2.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full bg-[var(--brand-color)] shrink-0" />
                      <span className="leading-relaxed">{change}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-1">
                  No revision changes recorded for this schedule.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
