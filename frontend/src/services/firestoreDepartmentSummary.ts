import { collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { summarizeScheduleFacultyLoads, type SummaryFacultyLoad } from '../utils/departmentSummaryAutofill'
import { departmentFacultyNames } from '../utils/excelFacultySuggestions'

export interface DepartmentSummaryState {
  rows: string[][]
  fileName: string
  sourceData: string
  columnWidths?: number[]
}

export interface SavedDepartmentSummary {
  state: DepartmentSummaryState
  revision: number
}

const SUMMARY_COLUMNS = 12
const MAX_SUMMARY_ROWS = 1000
const SUMMARY_DISPLAY_COLUMNS = 14

function summaryRef(term: DepartmentWorkbookTerm) {
  if (![term.departmentId, term.academicYearId].every(value => /^[A-Za-z0-9_-]+$/.test(value)) || !['sem1', 'sem2'].includes(term.semester)) {
    throw new Error('The department or academic term is invalid.')
  }
  return doc(db, 'departments', term.departmentId, 'summaryWorkbooks', `${term.academicYearId}_${term.semester}`)
}

export async function loadSummaryFacultyDirectory(departmentCode: string): Promise<string[]> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to load department instructors.')
  const [members, users] = await Promise.all([
    getDocsFromServer(query(collection(db, 'memberships'), where('department', '==', departmentCode))),
    getDocsFromServer(collection(db, 'users')),
  ])
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the workbook.')
  const profiles = new Map(users.docs.map(document => [document.id, document.data()]))
  return departmentFacultyNames(members.docs.map(document => document.data()), profiles, departmentCode)
}

export async function loadSummaryFacultyLoads(term: DepartmentWorkbookTerm): Promise<SummaryFacultyLoad[]> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to auto-fill Summary.')
  const [snapshot, departmentFaculty] = await Promise.all([
    getDocsFromServer(query(collection(db, 'schedules'), where('departmentId', '==', term.departmentId))),
    loadSummaryFacultyDirectory(term.departmentCode),
  ])
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the workbook.')
  const yearKey = (value: string) => value.replace(/\s/g, '').replace(/[–—]/g, '-').toUpperCase()
  const schedules = snapshot.docs.map(document => document.data()).filter(schedule => {
    const sameYear = schedule.academicYearId === term.academicYearId
      || !schedule.academicYearId && typeof schedule.academicYear === 'string'
        && yearKey(schedule.academicYear) === yearKey(term.academicYear)
    const semester = schedule.semesterKey ?? schedule.semester
    const sameSemester = semester === term.semester || semester === (term.semester === 'sem1' ? '1st Semester' : '2nd Semester')
    return sameYear && sameSemester && (schedule.status === 'Draft' || schedule.status === 'Plot') && !schedule.parentId
  })
  return summarizeScheduleFacultyLoads(schedules, term.departmentCode, departmentFaculty)
}

function validateState(value: unknown): DepartmentSummaryState {
  if (!value || typeof value !== 'object') throw new Error('The saved Summary workbook is invalid.')
  const state = value as DepartmentSummaryState
  if (!Array.isArray(state.rows) || state.rows.length < 2 || state.rows.length > MAX_SUMMARY_ROWS || state.rows.some(row =>
    !Array.isArray(row) || row.length !== SUMMARY_COLUMNS || row.some(cell => typeof cell !== 'string' || cell.length > 4096)
  ) || typeof state.fileName !== 'string' || state.fileName.length > 255 || !/\.xlsx$/i.test(state.fileName)
    || typeof state.sourceData !== 'string' || state.sourceData.length > 800000
    || state.sourceData !== '' && !/^[A-Za-z0-9+/]*={0,2}$/.test(state.sourceData)
    || state.columnWidths !== undefined && (!Array.isArray(state.columnWidths)
      || state.columnWidths.length !== SUMMARY_DISPLAY_COLUMNS
      || state.columnWidths.some(width => !Number.isFinite(width) || width < 24 || width > 2000))) {
    throw new Error('The saved Summary workbook is invalid.')
  }
  return state
}

function readStoredState(value: unknown): DepartmentSummaryState {
  if (!value || typeof value !== 'object') throw new Error('The saved Summary workbook is invalid.')
  const stored = value as Record<string, unknown>
  if (!Array.isArray(stored.rows)) throw new Error('The saved Summary workbook is invalid.')
  const rows = stored.rows.map(row => {
    if (Array.isArray(row)) return row
    if (!row || typeof row !== 'object' || !('cells' in row)) throw new Error('The saved Summary workbook is invalid.')
    return (row as { cells: unknown }).cells
  })
  const summaryRows = rows.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== SUMMARY_COLUMNS && row.length !== 17) {
      throw new Error('The saved Summary workbook is invalid.')
    }
    return row.slice(0, SUMMARY_COLUMNS)
  })
  const widths = stored.columnWidths
  if (widths !== undefined && (!Array.isArray(widths) || widths.length !== SUMMARY_DISPLAY_COLUMNS && widths.length !== 19)) {
    throw new Error('The saved Summary workbook is invalid.')
  }
  return validateState({ ...stored, rows: summaryRows,
    columnWidths: Array.isArray(widths) ? widths.slice(0, SUMMARY_DISPLAY_COLUMNS) : undefined })
}

export async function loadDepartmentSummary(term: DepartmentWorkbookTerm): Promise<SavedDepartmentSummary | null> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to open the Summary workbook.')
  const snapshot = await getDocFromServer(summaryRef(term))
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the workbook.')
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  if (data.schemaVersion !== 1 || data.departmentId !== term.departmentId || data.academicYearId !== term.academicYearId
    || data.semester !== term.semester || !Number.isSafeInteger(data.revision) || data.revision < 1) {
    throw new Error('The saved Summary workbook is invalid.')
  }
  return { state: readStoredState(data.state), revision: data.revision as number }
}

export async function saveDepartmentSummary(term: DepartmentWorkbookTerm, state: DepartmentSummaryState, previousRevision: number): Promise<number> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in again before saving Summary.')
  validateState(state)
  const reference = summaryRef(term)
  const revision = previousRevision + 1
  await runTransaction(db, async transaction => {
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the workbook.')
    const [current, membership, department, year] = await Promise.all([
      transaction.get(reference),
      transaction.get(doc(db, 'memberships', term.membershipId)),
      transaction.get(doc(db, 'departments', term.departmentId)),
      transaction.get(doc(db, 'academicYears', term.academicYearId)),
    ])
    const member = membership.data()
    const phase = year.data()?.[term.semester]?.phase
    const authorized = member?.userId === user.uid && member.status === 'accepted'
      && (member.role === 'Admin' && ['Drafting', 'Plotting', 'Revision', 'Final'].includes(phase)
        || ['Dean', 'Program Head'].includes(member.role) && member.department === department.data()?.code
          && ['Drafting', 'Revision'].includes(phase))
    if (!authorized) throw new Error('You do not have permission to save Summary in this term.')
    if ((current.exists() ? current.data().revision : 0) !== previousRevision) {
      throw new Error('A newer Summary workbook was saved. Reopen it before saving your changes.')
    }
    transaction.set(reference, {
      schemaVersion: 1, departmentId: term.departmentId, academicYearId: term.academicYearId,
      semester: term.semester, membershipId: term.membershipId, savedBy: user.uid,
      revision, state: { ...state, rows: state.rows.map(cells => ({ cells })) },
      createdAt: current.exists() ? current.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp(),
    })
  })
  return revision
}
