import { collection, getDocs, onSnapshot, query, where, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore'
import { db } from '../firebase'
import { deserializeWorkbookState } from '../utils/excelWorkbookState'
import { extractWorkbookScheduleRows, type ScheduleDirectory, type WorkbookScheduleRow } from '../utils/excelScheduleRows'
import { departmentFacultyNames } from '../utils/excelFacultySuggestions'
import { assertDepartmentScheduleRows, extractDepartmentTemplateRows, findDepartmentTemplateSheets } from '../utils/departmentScheduleTemplates'
import { extractDepartmentScheduleImportRows } from '../utils/departmentScheduleImportRows'
import type { DepartmentScheduleImportSheet } from '../utils/departmentScheduleImport'
import type { WorkbookEditSnapshot } from '../utils/excelWorkbookState'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { scheduleMeetingRecords } from '../utils/scheduleMeetings'
import { departmentExternalRoomAssignments, type FacultySubjectAssignment } from '../utils/ScheduleValidation'

function departmentRoomScheduleQueries(term: DepartmentWorkbookTerm) {
  return [query(collection(db, 'schedules'), where('academicYearId', '==', term.academicYearId)),
    query(collection(db, 'schedules'), where('academicYear', '==', term.academicYear))]
}

function externalRoomAssignments(documents: readonly QueryDocumentSnapshot<DocumentData>[], term: DepartmentWorkbookTerm, rooms: ScheduleDirectory['rooms']) {
  return departmentExternalRoomAssignments(scheduleMeetingRecords([...new Map(documents.map(document => [document.id, document])).values()]), term, rooms)
}

export function subscribeDepartmentRoomSchedules(term: DepartmentWorkbookTerm, rooms: ScheduleDirectory['rooms'],
  onAssignments: (assignments: readonly FacultySubjectAssignment[]) => void, onError: (error: Error) => void) {
  const queries = departmentRoomScheduleQueries(term)
  const loaded = new Map<number, readonly QueryDocumentSnapshot<DocumentData>[]>()
  let failed = false
  const unsubscribes = queries.map((reference, index) => onSnapshot(reference, snapshot => {
    loaded.set(index, snapshot.docs)
    if (!failed && loaded.size === queries.length) onAssignments(externalRoomAssignments([...loaded.values()].flat(), term, rooms))
  }, error => { failed = true; onError(error) }))
  return () => unsubscribes.forEach(unsubscribe => unsubscribe())
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
    rooms: rooms.docs.map(item => { const data = item.data(); return { id: item.id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? ''),
      floor: typeof data.floor === 'number' && Number.isFinite(data.floor) ? data.floor : undefined } }),
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
