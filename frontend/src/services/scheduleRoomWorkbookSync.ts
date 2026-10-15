import { doc, getDocFromServer, serverTimestamp, type Transaction } from 'firebase/firestore'
import { db } from '../firebase'
import { workbookTermPaths, type DepartmentWorkbookTerm } from '../utils/departmentWorkbookPaths'
import { scheduleRoomWorkbookLocation, scheduleRoomWorkbookTexts, type ScheduleRoomWorkbookRow } from '../utils/scheduleRoomWorkbookCells'
import type { WorkbookScheduleMeeting } from '../utils/excelScheduleRows'
import { loadFirestoreDepartmentWorkbook } from './firestoreDepartmentWorkbooks'

export async function prepareScheduleRoomWorkbookSync(term: DepartmentWorkbookTerm, rows: readonly ScheduleRoomWorkbookRow[], revisionId: string) {
  const path = workbookTermPaths(term).document
  if (rows.some(row => row.sourceWorkbook !== path)) throw new Error('These schedules belong to a different workbook. Reopen the schedule.')
  const saved = await loadFirestoreDepartmentWorkbook(term)
  if (!saved) throw new Error('The schedule workbook is missing. Open and save it before plotting.')
  const manifest = await getDocFromServer(doc(db, path))
  const baseline = manifest.data()
  if (!baseline || baseline.schemaVersion !== 3 || baseline.revision !== saved.revision || baseline.revisionId !== saved.revisionId
    || !Array.isArray(baseline.sheetNames) || !Array.isArray(baseline.sheetIds)) throw new Error('The workbook changed. Reopen the schedule before plotting.')
  const locations = rows.map(row => {
    const location = scheduleRoomWorkbookLocation(saved.editorState, row)
    const sheetIndex = baseline.sheetNames.indexOf(location.sheetName)
    if (sheetIndex < 0) throw new Error('The workbook sheet changed. Reopen the schedule before plotting.')
    const sheetId = baseline.sheetIds[sheetIndex] as string
    return { row, ...location, sheetIndex, sheetId, parentPath: `sheets/${baseline.workbookId}_${sheetId}` }
  })
  return {
    async read(transaction: Transaction) {
      const parentPaths = [...new Set(locations.map(location => location.parentPath))]
      const cellPaths = [...new Set(locations.flatMap(location => ['T', 'U'].map(column => `${location.parentPath}/cells/${column}${location.workbookRow}`)))]
      const [current, lock, parents, cells] = await Promise.all([
        transaction.get(doc(db, path)), transaction.get(doc(db, `${path}/saveLocks/current`)),
        Promise.all(parentPaths.map(parent => transaction.get(doc(db, parent)))),
        Promise.all(cellPaths.map(cell => transaction.get(doc(db, cell)))),
      ])
      const data = current.data()
      if (!data || data.revision !== saved.revision || data.revisionId !== saved.revisionId) throw new Error('The workbook changed while plotting. Reopen the schedule and try again.')
      const lease = lock.data()
      if (lease?.status === 'saving' && (!lease.createdAt?.toMillis || lease.createdAt.toMillis() > Date.now() - 10 * 60 * 1000)) {
        throw new Error('Someone is saving this workbook. Wait for that save to finish before plotting.')
      }
      const parentMap = new Map(parents.map((parent, index) => [parentPaths[index], parent.data()]))
      const cellMap = new Map(cells.map((cell, index) => [cellPaths[index], cell.data()]))
      const prepared = new Map(locations.map(location => {
        const parent = parentMap.get(location.parentPath)
        const slot = data.sheetSlots[location.sheetIndex]
        const baseRevisionId = parent?.slots?.[slot]?.revisionId
        if (!parent || typeof baseRevisionId !== 'string' || parent.sheetId !== location.sheetId || parent.sourceWorkbook !== path) {
          throw new Error('The saved workbook sheet is incomplete. Reopen its workbook before plotting.')
        }
        return [location.row.id, { ...location, baseRevisionId }]
      }))
      const patches: { cellPath: string; data: Record<string, unknown> }[] = []
      const cellCounts = [...data.cellCounts] as number[]
      const changedScheduleIds = new Set<string>()
      return {
        updateRow(id: string, after: WorkbookScheduleMeeting[]) {
          const location = prepared.get(id)
          if (!location) throw new Error('The saved workbook row could not be found.')
          const texts = scheduleRoomWorkbookTexts(location.row.meetings, after, location.values)
          const rawValues = [...location.row.rawValues]
          for (const [offset, column] of ['T', 'U'].entries()) {
            rawValues[19 + offset] = texts[offset]
            if (texts[offset] === location.values[19 + offset]) continue
            const cellPath = `${location.parentPath}/cells/${column}${location.workbookRow}`
            const previous = cellMap.get(cellPath)
            const active = previous?.baseRevisionId === location.baseRevisionId
            if (!active) cellCounts[location.sheetIndex]++
            patches.push({ cellPath, data: { schemaVersion: 3, workbookId: data.workbookId, sourceWorkbook: path,
              departmentId: term.departmentId, departmentCode: term.departmentCode, academicYearId: term.academicYearId, semester: term.semester,
              sheetId: location.sheetId, sheetIndex: location.sheetIndex, baseRevisionId: location.baseRevisionId,
              revision: data.revision + 1, revisionId, text: texts[offset], styleJson: active ? previous.styleJson ?? null : null,
              membershipId: term.membershipId, savedBy: '', updatedAt: serverTimestamp(), plotScheduleId: id } })
            changedScheduleIds.add(id)
          }
          return { rawValues, workbookRow: location.workbookRow, workbookSheetId: location.sheetId }
        },
        apply(savedBy: string) {
          if (!patches.length) return
          // Leave room for actor, year, manifest and lease reads in the rules' batch budget.
          if (changedScheduleIds.size + new Set(patches.map(patch => patch.data.sheetId)).size > 10) {
            throw new Error('Too many room changes selected for one workbook update. Plot a smaller group and repeat.')
          }
          for (const patch of patches) transaction.set(doc(db, patch.cellPath), { ...patch.data, savedBy })
          transaction.update(doc(db, path), { revision: data.revision + 1, revisionId, cellCounts, membershipId: term.membershipId,
            savedBy, updatedAt: serverTimestamp(), roomPlot: { version: 1, revisionId, scheduleIds: [...changedScheduleIds] } })
        },
      }
    },
  }
}
