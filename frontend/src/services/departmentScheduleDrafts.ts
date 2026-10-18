import type { DepartmentScheduleImportSheet } from '../utils/departmentScheduleImport'

const DATABASE_NAME = 'rorms-department-schedule-drafts'
const STORE_NAME = 'drafts'
const DATABASE_TIMEOUT = 5000

export interface DepartmentScheduleDraft {
  version: 1
  key: string
  baseRevision: number
  baseRevisionId: string | null
  basePersisted: boolean
  baseSheets: DepartmentScheduleImportSheet[]
  baseColumnWidths: number[] | null
  sheets: DepartmentScheduleImportSheet[]
  columnWidths: number[] | null
  selectedSheet: number
  importedFileName: string | null
  updatedAt: number
}

let databasePromise: Promise<IDBDatabase> | undefined
const pendingWrites = new Map<string, Promise<void>>()

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Local draft storage is unavailable in this browser.'))
  if (databasePromise) return databasePromise
  const opening: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    const finish = (database?: IDBDatabase, error?: Error) => {
      if (settled) { database?.close(); return }
      settled = true
      window.clearTimeout(timer)
      if (database) resolve(database)
      else reject(error ?? new Error('Local draft storage could not be opened.'))
    }
    const timer = window.setTimeout(() => finish(undefined, new Error('Local draft storage took too long to open.')), DATABASE_TIMEOUT)
    try {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME, { keyPath: 'key' }) }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => { database.close(); databasePromise = undefined }
        finish(database)
      }
      request.onerror = request.onblocked = () => finish()
    } catch (caught) { finish(undefined, caught instanceof Error ? caught : undefined) }
  }).catch(error => { databasePromise = undefined; throw error })
  databasePromise = opening
  return opening
}

function validWidths(value: unknown): value is number[] | null {
  return value === null || Array.isArray(value) && value.every(width => typeof width === 'number' && Number.isFinite(width) && width > 0)
}

function validSheets(value: unknown): value is DepartmentScheduleImportSheet[] {
  return Array.isArray(value) && value.every(sheet => sheet && typeof sheet.name === 'string'
    && Number.isSafeInteger(sheet.headerRow) && Array.isArray(sheet.rows)
    && sheet.rows.every((row: DepartmentScheduleImportSheet['rows'][number]) => Number.isSafeInteger(row.rowNumber)
      && Array.isArray(row.values) && row.values.every(cell => typeof cell === 'string'))
    && (sheet.yearSections === undefined || Array.isArray(sheet.yearSections)
      && sheet.yearSections.every((section: NonNullable<DepartmentScheduleImportSheet['yearSections']>[number]) =>
        typeof section.label === 'string' && Number.isSafeInteger(section.start) && Number.isSafeInteger(section.count))))
}

function validDraft(value: unknown, key: string): value is DepartmentScheduleDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as DepartmentScheduleDraft
  return draft.version === 1 && draft.key === key && Number.isSafeInteger(draft.baseRevision) && draft.baseRevision >= 0
    && (draft.baseRevisionId === null || typeof draft.baseRevisionId === 'string')
    && typeof draft.basePersisted === 'boolean' && validSheets(draft.baseSheets) && draft.baseSheets.length > 0
    && validSheets(draft.sheets) && draft.sheets.length > 0
    && validWidths(draft.baseColumnWidths) && validWidths(draft.columnWidths)
    && Number.isSafeInteger(draft.selectedSheet) && draft.selectedSheet >= 0 && draft.selectedSheet < draft.sheets.length
    && (draft.importedFileName === null || typeof draft.importedFileName === 'string')
}

export async function readDepartmentScheduleDraft(key: string): Promise<DepartmentScheduleDraft | null> {
  await pendingWrites.get(key)?.catch(() => {})
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(validDraft(request.result, key) ? request.result : null)
    request.onerror = transaction.onerror = transaction.onabort = () => reject(new Error('The local draft could not be read.'))
  })
}

function enqueue(key: string, operation: () => Promise<void>): Promise<void> {
  const next = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(operation)
  pendingWrites.set(key, next)
  void next.finally(() => { if (pendingWrites.get(key) === next) pendingWrites.delete(key) }).catch(() => {})
  return next
}

function changeDraft(key: string, draft?: DepartmentScheduleDraft): Promise<void> {
  return enqueue(key, async () => {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      if (draft) transaction.objectStore(STORE_NAME).put(draft)
      else transaction.objectStore(STORE_NAME).delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () => reject(new Error('The local draft could not be saved.'))
    })
  })
}

export function writeDepartmentScheduleDraft(draft: DepartmentScheduleDraft): Promise<void> {
  return changeDraft(draft.key, draft)
}

export function deleteDepartmentScheduleDraft(key: string): Promise<void> {
  return changeDraft(key)
}
