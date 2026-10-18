import { collection, getDocs, onSnapshot, query, where, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../firebase'
import { deserializeWorkbookState } from '../utils/excelWorkbookState'
import { extractWorkbookScheduleRows, type ScheduleDirectory, type WorkbookScheduleRow } from '../utils/excelScheduleRows'
import { departmentFacultyNames } from '../utils/excelFacultySuggestions'
import { assertDepartmentScheduleRows, extractDepartmentTemplateRows, findDepartmentTemplateSheets } from '../utils/departmentScheduleTemplates'
import { extractDepartmentScheduleImportRows } from '../utils/departmentScheduleImportRows'
import type { DepartmentScheduleImportSheet } from '../utils/departmentScheduleImport'
import type { WorkbookEditSnapshot } from '../utils/excelWorkbookState'
import { workbookTermPaths, type DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { scheduleMeetingRecords } from '../utils/scheduleMeetings'
import { previousScheduleTerm, scheduleMatchesDepartment, scheduleMatchesTerm } from '../utils/roomSchedule'
import { departmentExternalRoomAssignments, facultyScheduleRowKey, type FacultySubjectAssignment } from '../utils/ScheduleValidation'

function departmentRoomScheduleQueries(term: DepartmentWorkbookTerm) {
  return [query(collection(db, 'schedules'), where('academicYearId', '==', term.academicYearId)),
    query(collection(db, 'schedules'), where('academicYear', '==', term.academicYear))]
}

function externalRoomAssignments(documents: readonly QueryDocumentSnapshot<DocumentData>[], term: DepartmentWorkbookTerm, rooms: ScheduleDirectory['rooms']) {
  return departmentExternalRoomAssignments(scheduleMeetingRecords([...new Map(documents.map(document => [document.id, document])).values()]), term, rooms)
}

function departmentRowStatuses(documents: readonly QueryDocumentSnapshot<DocumentData>[], term: DepartmentWorkbookTerm): ReadonlyMap<string, string> {
  const paths = workbookTermPaths(term)
  const sourcePaths = [paths.document, paths.previousDocument, paths.namedLegacyDocument, paths.legacyDocument]
  const unique = [...new Map(documents.map(document => [document.id, document])).values()]
  const statuses = new Map<string, string>()
  for (const path of sourcePaths) for (const document of unique) {
    const row: Record<string, unknown> = document.data()
    if (row.sourceWorkbook !== path || row.departmentId !== term.departmentId || typeof row.sourceSheet !== 'string'
      || typeof row.sourceRow !== 'number' || !Number.isSafeInteger(row.sourceRow) || row.sourceRow < 1
      || typeof row.status !== 'string' || !row.status.trim()) continue
    const key = facultyScheduleRowKey(row.sourceSheet, row.sourceRow)
    if (!statuses.has(key)) statuses.set(key, row.status.trim())
  }
  return statuses
}

export function subscribeDepartmentRoomSchedules(term: DepartmentWorkbookTerm, rooms: ScheduleDirectory['rooms'],
  onAssignments: (assignments: readonly FacultySubjectAssignment[], statuses: ReadonlyMap<string, string>) => void, onError: (error: Error) => void) {
  const queries = departmentRoomScheduleQueries(term)
  const loaded = new Map<number, readonly QueryDocumentSnapshot<DocumentData>[]>()
  let failed = false
  const unsubscribes = queries.map((reference, index) => onSnapshot(reference, snapshot => {
    loaded.set(index, snapshot.docs)
    if (!failed && loaded.size === queries.length) {
      const documents = [...loaded.entries()].filter(([key]) => key !== index).flatMap(([, rows]) => rows).concat(snapshot.docs)
      onAssignments(externalRoomAssignments(documents, term, rooms), departmentRowStatuses(documents, term))
    }
  }, error => { failed = true; onError(error) }))
  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
}

/** Use the previous term only to rank buildings when this workbook has no room assignments. */
export async function loadPreviousDepartmentRoomAssignments(term: DepartmentWorkbookTerm): Promise<FacultySubjectAssignment[]> {
  const previous = previousScheduleTerm(term.academicYear, term.semester)
  if (!previous) return []
  const yearId = previous.academicYear === term.academicYear ? term.academicYearId : (await getDocs(collection(db, 'academicYears'))).docs
    .find(document => String(document.data().academicYear ?? '').replace(/\s/g, '').replace(/[–—]/g, '-')
      === previous.academicYear.replace(/\s/g, '').replace(/[–—]/g, '-'))?.id
  const references = [query(collection(db, 'schedules'), where('academicYear', '==', previous.academicYear))]
  if (yearId) references.push(query(collection(db, 'schedules'), where('academicYearId', '==', yearId)))
  const snapshots = await Promise.all(references.map(reference => getDocs(reference)))
  const documents = [...new Map(snapshots.flatMap(snapshot => snapshot.docs).map(document => [document.id, document])).values()]
  return scheduleMeetingRecords(documents).filter(meeting => {
    const savedSemester = typeof meeting.semesterKey === 'string' && meeting.semesterKey ? meeting.semesterKey : meeting.semester
    return Boolean((meeting.academicYearId || meeting.academicYear) && savedSemester && (meeting.roomId || meeting.room))
      && scheduleMatchesTerm(meeting, yearId ? { id: yearId, academicYear: previous.academicYear }
        : { academicYear: previous.academicYear }, previous.semester)
      && scheduleMatchesDepartment(meeting, term.departmentCode)
      && !['Return', 'Returned'].includes(meeting.status ?? '')
  }).map(meeting => ({ location: meeting.id, rowKey: String(meeting.sourceScheduleId || meeting.id), code: '', section: '',
    roomId: meeting.roomId, room: typeof meeting.room === 'string' ? meeting.room : '' }))
}

export async function prepareDepartmentScheduleRows(editorState: string, departmentCode: string, semester: 'sem1' | 'sem2' = 'sem1'): Promise<WorkbookScheduleRow[]> {
  const snapshot = deserializeWorkbookState(editorState, {})
  const hasTemplates = Boolean(findDepartmentTemplateSheets(snapshot))
  if (!snapshot.scheduleSetups.size && !hasTemplates) {
    assertDepartmentScheduleRows(snapshot, [])
    return []
  }
  const directory = await loadDepartmentScheduleDirectory(departmentCode)
  const rows = [...extractWorkbookScheduleRows(snapshot, directory), ...extractDepartmentTemplateRows(snapshot, directory, semester)]
  assertDepartmentScheduleRows(snapshot, rows)
  return rows
}

export async function loadDepartmentScheduleDirectory(departmentCode: string, term?: DepartmentWorkbookTerm): Promise<ScheduleDirectory> {
  const [members, users, rooms] = await Promise.all([
    getDocs(collection(db, 'memberships')), getDocs(collection(db, 'users')), getDocs(collection(db, 'rooms')),
  ])
  const profiles = new Map(users.docs.map(item => [item.id, item.data()]))
  const directory: ScheduleDirectory = {
    departmentCode,
    faculty: members.docs.flatMap(item => {
      const fullName = departmentFacultyNames([item.data()], profiles, departmentCode)[0]
      return fullName ? [{ id: item.id, fullName, department: departmentCode }] : []
    }),
    rooms: rooms.docs.map(item => { const data = item.data(); return { id: item.id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? ''), status: String(data.status ?? ''),
      floor: typeof data.floor === 'number' && Number.isFinite(data.floor) ? data.floor : undefined,
      capacity: typeof data.capacity === 'number' && Number.isFinite(data.capacity) ? data.capacity : undefined } }),
  }
  if (term) {
    const schedules = await Promise.all(departmentRoomScheduleQueries(term).map(reference => getDocs(reference)))
    directory.externalRoomAssignments = externalRoomAssignments(schedules.flatMap(snapshot => snapshot.docs), term, directory.rooms)
  }
  return directory
}

export async function prepareDepartmentScheduleImportRows(snapshot: WorkbookEditSnapshot, sheetNames: readonly string[],
  sheets: readonly DepartmentScheduleImportSheet[], departmentCode: string) {
  if (!sheets.some(sheet => sheet.rows.some(row => row.values.some(value => value.trim())))) return []
  return extractDepartmentScheduleImportRows(snapshot, sheetNames, sheets, await loadDepartmentScheduleDirectory(departmentCode))
}
