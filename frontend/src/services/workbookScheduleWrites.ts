import { collection, doc, getDocs, query, serverTimestamp, where, type Transaction } from 'firebase/firestore'
import { db } from '../firebase'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import type { WorkbookScheduleRow } from '../utils/excelScheduleRows'
import type { WorkbookAuditChange } from '../utils/workbookAudit'
import { plotMeetingKey, readRegistrarPlot, retainRegistrarRooms } from '../utils/schedulePlotting'

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
  }
  return false
}

function classIdentity(row: { subjectCode?: unknown; classSection?: unknown; course?: unknown; yearLevel?: unknown; meetings?: unknown }): string {
  const normalize = (value: unknown) => typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '') : value
  const instructors = Array.isArray(row.meetings) ? row.meetings.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object') return []
    const meeting = value as Record<string, unknown>
    return [normalize(meeting.instructorId || meeting.faculty || '')]
  }) : []
  return JSON.stringify([normalize(row.subjectCode), normalize(row.classSection), normalize(row.course), row.yearLevel, [...new Set(instructors)].sort()])
}

/** Keep the schedule projection in the same commit as its workbook revision. */
export async function prepareWorkbookScheduleWrites(term: DepartmentWorkbookTerm, rows: readonly WorkbookScheduleRow[], sourceWorkbook: string, sourcePaths: readonly string[], collectionName: 'schedule' | 'schedules' = 'schedule', statusOverride?: 'Draft') {
  const snapshots = await Promise.all([...new Set(sourcePaths)].map(path => getDocs(query(collection(db, collectionName), where('sourceWorkbook', '==', path)))))
  const existing = new Map(snapshots.flatMap(snapshot => snapshot.docs).map(row => [row.id, row]))
  const existingClasses = new Map<string, Record<string, unknown>[]>()
  for (const document of existing.values()) {
    const data = document.data(), key = classIdentity(data)
    existingClasses.set(key, [...(existingClasses.get(key) ?? []), data])
  }
  const rowId = (sheet: string, row: number, sourceKey?: string) => `workbook_${encodeURIComponent(JSON.stringify([term.departmentId, term.academicYearId, term.semester, sheet, sourceKey ?? row]))}`
  const documents = rows.map((sourceRow, index) => {
    const matches = existingClasses.get(classIdentity(sourceRow))
    const savedRow = existing.get(rowId(sourceRow.sourceSheet, sourceRow.sourceRow, sourceRow.sourceKey))?.data()
    const previous = savedRow ?? (matches?.length === 1 ? matches[0] : undefined)
    // Compact workbook room cells are authoritative, including explicit clears.
    const row = retainRegistrarRooms(sourceRow, previous, collectionName !== 'schedules')
    // Approval belongs to this saved row's authored content, not recalculated
    // directory links, validation warnings, row order or workbook presentation.
    const keepPlot = collectionName === 'schedules' && statusOverride === 'Draft' && savedRow?.status === 'Plot'
      && sourceRow.rawValues.length === 21 && Array.isArray(savedRow.rawValues) && savedRow.rawValues.length === 21
      && sameValue(sourceRow.rawValues, savedRow.rawValues)
      && sourceRow.yearLevel === savedRow.yearLevel && sourceRow.course === savedRow.course
    const savedMeetingStatuses = new Map<string, 'Draft' | 'Plot'>()
    if (keepPlot && Array.isArray(savedRow?.meetings)) for (const value of savedRow.meetings) {
      if (!value || typeof value !== 'object') continue
      const meeting = value as Record<string, unknown>
      savedMeetingStatuses.set(plotMeetingKey(meeting as Parameters<typeof plotMeetingKey>[0]), meeting.status === 'Plot' ? 'Plot'
        : meeting.status === 'Draft' ? 'Draft' : savedRow.status === 'Plot' ? 'Plot' : 'Draft')
    }
    const previousMeetings = Array.isArray(savedRow?.meetings) ? savedRow.meetings : []
    const meetings = collectionName === 'schedules' ? row.meetings.map((meeting, meetingIndex) => {
      const previousMeeting = previousMeetings.length === row.meetings.length ? previousMeetings[meetingIndex] : undefined
      const previousStatus = previousMeeting && typeof previousMeeting === 'object' ? (previousMeeting as Record<string, unknown>).status : undefined
      return { ...meeting, status: keepPlot
        ? savedMeetingStatuses.get(plotMeetingKey(meeting))
          ?? (previousStatus === 'Plot' || previousStatus === 'Draft' ? previousStatus : savedRow?.status === 'Plot' ? 'Plot' as const : 'Draft' as const)
        : 'Draft' as const }
    }) : row.meetings
    const first = meetings[0]
    return { ...row, meetings, id: rowId(row.sourceSheet, row.sourceRow, row.sourceKey), source: 'workbook', schemaVersion: 2, sourceWorkbook,
      // Explicit workbook room text, including TBA and unresolved room labels, is provided.
      // An empty room cell leaves assignment to the Registrar.
      ...(collectionName === 'schedules' ? { membershipId: term.membershipId,
        providedRoomKeys: [...new Set(sourceRow.meetings.filter(meeting => meeting.room.trim()).map(plotMeetingKey))] } : {}),
      departmentId: term.departmentId, department: term.departmentCode, academicYearId: term.academicYearId,
      academicYear: term.academicYear, semester: term.semester === 'sem1' ? '1st Semester' : '2nd Semester', semesterKey: term.semester,
      orderIndex: index, status: keepPlot && meetings.some(meeting => meeting.status === 'Plot') ? 'Plot' as const : statusOverride ?? row.status,
      type: row.sourceKey ? first?.format === 'Flexible' ? 'open lab' : 'normal' : row.parallelSourceRow !== null ? 'parallel' : row.college.toLowerCase() || 'normal',
      groupId: row.parallelSourceRow !== null ? rowId(row.sourceSheet, row.parallelSourceRow) : '',
      isSplitSession: meetings.length > 1, parentId: '',
      format: first?.format ?? '', startTime: first?.startTime ?? '', endTime: first?.endTime ?? '', days: first?.days ?? [],
      instructorId: first?.instructorId ?? '', roomId: first?.roomId ?? '', buildingId: first?.buildingId ?? '',
      instructorIds: [...new Set(meetings.map(meeting => meeting.instructorId).filter(Boolean))],
      roomIds: [...new Set(meetings.map(meeting => meeting.roomId).filter(Boolean))],
    }
  })
  const retained = new Set(documents.map(row => row.id))
  const removed = [...existing.values()].filter(row => !retained.has(row.id))
  const changed = documents.filter(row => {
    const previous = existing.get(row.id)?.data()
    return !previous || (Object.hasOwn(row, 'credits') && !Object.hasOwn(row, 'units') && Object.hasOwn(previous, 'units'))
      || Object.entries(row).some(([key, value]) => !sameValue(value, previous[key]))
  })
  const samples: WorkbookAuditChange[] = []
  let descriptions = 0, added = 0, updated = 0
  const label = (row: Record<string, unknown>) => [row.subjectCode, row.subjectTitle, row.classSection].filter(Boolean).join(' · ') || 'Schedule row'
  const value = (input: unknown): string | null => {
    if (input == null) return null
    const text = typeof input === 'string' ? input : JSON.stringify(input)
    return text.length > 400 ? `${text.slice(0, 399)}…` : text
  }
  const rowSummary = (row: Record<string, unknown>) => [label(row),
    ...Object.entries({ status: 'Status', faculty: 'Faculty', f2fRoom: 'Rooms', f2fTime: 'Times', f2fDays: 'Days' })
      .filter(([field]) => row[field] != null).map(([field, title]) => `${title}: ${value(row[field])}`),
  ].join('\n')
  const sample = (row: Record<string, unknown>, field: string, before: unknown, after: unknown) => {
    descriptions++
    if (samples.length < 80) samples.push({ kind: 'schedule', sheet: String(row.sourceSheet || '').slice(0, 500), location: `Row ${row.sourceRow}`, field: field.slice(0, 500), before: value(before), after: value(after) })
  }
  const fields = {
    status: 'Status', yearLevel: 'Year level', yearLevelLabel: 'Year level label', subjectCode: 'Subject code', subjectTitle: 'Subject title',
    course: 'Course', classSection: 'Section', faculty: 'Faculty', f2fRoom: 'Rooms', f2fTime: 'Meeting times', f2fDays: 'Meeting days',
    college: 'College', subjectArea: 'Subject area', credits: 'Credits', units: 'Units', hours: 'Hours', maxStudents: 'Maximum students',
  }
  // Audit authored schedule fields. Meetings, links, parallel groups and validation
  // are recalculated for every save; rawValues duplicates the workbook cell audit.
  // Keep refreshing those projection fields without reporting them as member edits.
  for (const row of changed) {
    const before = existing.get(row.id)?.data()
    if (!before) { added++; sample(row, 'Schedule added', null, rowSummary(row)); continue }
    let edited = false
    for (const [field, title] of Object.entries(fields)) {
      if (!sameValue(before[field], (row as Record<string, unknown>)[field])) {
        edited = true
        sample(row, `${label(row)} · ${title}`, before[field], (row as Record<string, unknown>)[field])
      }
    }
    if (edited) updated++
  }
  for (const row of removed) sample(row.data(), 'Schedule removed', rowSummary(row.data()), null)
  return {
    count: changed.length + removed.length,
    audit: { added, updated, removed: removed.length, samples, omittedSamples: descriptions - samples.length },
    async validate(transaction: Transaction) {
      // A room may have been plotted after projection preparation. Retry the Save
      // rather than replacing that concurrent assignment with an older snapshot.
      const ids = [...new Set([...changed.map(row => row.id), ...removed.map(row => row.id)])]
      const latest = await Promise.all(ids.map(id => transaction.get(doc(db, collectionName, id))))
      for (const row of latest) {
        if (readRegistrarPlot(row.data()?.registrarPlot)?.revisionId !== readRegistrarPlot(existing.get(row.id)?.data().registrarPlot)?.revisionId) {
          throw new Error('Room assignments changed while saving. Click Save again to keep the latest plotted rooms.')
        }
      }
    },
    apply(transaction: Transaction, revision: number, revisionId: string, savedBy: string) {
      for (const row of changed) transaction.set(doc(db, collectionName, row.id), {
        ...row, workbookRevision: revision, workbookRevisionId: revisionId, savedBy,
        createdAt: existing.get(row.id)?.data().createdAt ?? serverTimestamp(), updatedAt: serverTimestamp(),
      })
      for (const row of removed) transaction.delete(row.ref)
    },
  }
}
