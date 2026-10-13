import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { deserializeWorkbookState } from '../utils/excelWorkbookState'
import { extractWorkbookScheduleRows, type WorkbookScheduleRow } from '../utils/excelScheduleRows'
import { departmentFacultyNames } from '../utils/excelFacultySuggestions'
import { assertDepartmentScheduleRows, extractDepartmentTemplateRows, findDepartmentTemplateSheets } from '../utils/departmentScheduleTemplates'

export async function prepareDepartmentScheduleRows(editorState: string, departmentCode: string, semester: 'sem1' | 'sem2' = 'sem1'): Promise<WorkbookScheduleRow[]> {
  const snapshot = deserializeWorkbookState(editorState, {})
  const hasTemplates = Boolean(findDepartmentTemplateSheets(snapshot))
  if (!snapshot.scheduleSetups.size && !hasTemplates) {
    assertDepartmentScheduleRows(snapshot, [])
    return []
  }
  const [members, users, rooms] = await Promise.all([
    getDocs(collection(db, 'memberships')), getDocs(collection(db, 'users')), getDocs(collection(db, 'rooms')),
  ])
  const profiles = new Map(users.docs.map(item => [item.id, item.data()]))
  const directory = {
    departmentCode,
    faculty: members.docs.flatMap(item => {
      const fullName = departmentFacultyNames([item.data()], profiles, departmentCode)[0]
      return fullName ? [{ id: item.id, fullName, department: departmentCode }] : []
    }),
    rooms: rooms.docs.map(item => { const data = item.data(); return { id: item.id, code: String(data.code ?? ''), name: String(data.name ?? ''), buildingId: String(data.buildingId ?? '') } }),
  }
  const rows = [...extractWorkbookScheduleRows(snapshot, directory), ...extractDepartmentTemplateRows(snapshot, directory, semester)]
  assertDepartmentScheduleRows(snapshot, rows)
  return rows
}
