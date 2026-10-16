import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { deserializeWorkbookState } from '../utils/excelWorkbookState'
import { extractWorkbookScheduleRows, type WorkbookScheduleRow } from '../utils/excelScheduleRows'
import { departmentFacultyNames } from '../utils/excelFacultySuggestions'
import { assertDepartmentScheduleRows, extractDepartmentTemplateRows, findDepartmentTemplateSheets } from '../utils/departmentScheduleTemplates'
import { extractDepartmentScheduleImportRows } from '../utils/departmentScheduleImportRows'
import type { DepartmentScheduleImportSheet } from '../utils/departmentScheduleImport'
import type { WorkbookEditSnapshot } from '../utils/excelWorkbookState'

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

export async function loadDepartmentScheduleDirectory(departmentCode: string) {
  const [members, users, rooms] = await Promise.all([
    getDocs(collection(db, 'memberships')), getDocs(collection(db, 'users')), getDocs(collection(db, 'rooms')),
  ])
  const profiles = new Map(users.docs.map(item => [item.id, item.data()]))
  return {
    departmentCode,
    faculty: members.docs.flatMap(item => {
      const fullName = departmentFacultyNames([item.data()], profiles, departmentCode)[0]
      return fullName ? [{ id: item.id, fullName, department: departmentCode }] : []
    }),
    rooms: rooms.docs.map(item => { const data = item.data(); return { id: item.id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? ''),
      floor: typeof data.floor === 'number' && Number.isFinite(data.floor) ? data.floor : undefined } }),
  }
}

export async function prepareDepartmentScheduleImportRows(snapshot: WorkbookEditSnapshot, sheetNames: readonly string[],
  sheets: readonly DepartmentScheduleImportSheet[], departmentCode: string) {
  if (!sheets.some(sheet => sheet.rows.some(row => row.values.some(value => value.trim())))) return []
  return extractDepartmentScheduleImportRows(snapshot, sheetNames, sheets, await loadDepartmentScheduleDirectory(departmentCode))
}
