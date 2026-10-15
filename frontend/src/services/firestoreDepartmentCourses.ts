import { collection, doc, getDocFromServer, getDocs, query, runTransaction, serverTimestamp, where, writeBatch, type DocumentReference } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { canEditDepartmentCourses, decodeDepartmentCoursesWorkbook, departmentCourseBatchRanges, departmentCourseDocuments, encodeDepartmentCoursesWorkbook,
  type DepartmentCoursesContext, type DepartmentCoursesWorkbookState } from '../utils/departmentCoursesWorkbookState'
import type { DepartmentCourseSuggestion } from '../utils/departmentCourseSuggestions'

export interface SavedDepartmentCoursesWorkbook {
  revision: number
  fileName: string
  generation: string
  cleanupWarning?: string
}

function workbookRef(context: Pick<DepartmentCoursesContext, 'departmentId'>) {
  if (!/^[A-Za-z0-9_-]+$/.test(context.departmentId)) throw new Error('Choose a department before saving courses.')
  return doc(db, 'departments', context.departmentId, 'courseWorkbooks', 'current')
}

export async function loadDepartmentCourseSuggestions(context: Pick<DepartmentCoursesContext, 'departmentId' | 'departmentCode'>): Promise<DepartmentCourseSuggestion[]> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to load department courses.')
  const reference = workbookRef(context)
  const workbook = await getDocFromServer(reference)
  if (!workbook.exists()) return []
  const current = workbook.data()
  if (current.departmentId !== context.departmentId || current.departmentCode !== context.departmentCode
    || typeof current.generation !== 'string' || !Number.isSafeInteger(current.courseCount) || current.courseCount < 0) {
    throw new Error('The saved department course directory is invalid.')
  }
  const documents = await getDocs(query(collection(db, 'courses'), where('generation', '==', current.generation)))
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the workbook.')
  const courses = documents.docs.filter(item => {
    const data = item.data()
    return data.departmentId === context.departmentId && data.departmentCode === context.departmentCode && data.sourceWorkbook === reference.path
  })
  if (courses.length !== current.courseCount) throw new Error('The department course directory is incomplete. Reopen the workbook to retry.')
  return courses.map(item => {
    const data = item.data()
    const semester = /^Y(\d+)S([12])$/i.exec(String(data.semester ?? '').replace(/\s/g, ''))
    const credits = String(data.credits ?? '').trim()
    return { code: String(data.code ?? '').trim().toUpperCase(), title: String(data.course ?? '').trim(),
      yearLevel: Number(semester?.[1] ?? 0), semester: Number(semester?.[2] ?? 0),
      type: String(data.type ?? ''), session: String(data.session ?? ''),
      credits: credits && Number.isFinite(Number(credits)) ? Number(credits) : null, sourceCell: item.id }
  }).filter(course => course.code || course.title)
}

export async function loadDepartmentCoursesWorkbook(context: DepartmentCoursesContext) {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in to open the saved courses workbook.')
  const document = await getDocFromServer(workbookRef(context))
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the courses workbook.')
  if (!document.exists()) return null
  const data = document.data()
  if (data.schemaVersion !== 1 || data.encoding !== 'gzip-base64' || data.departmentId !== context.departmentId
    || typeof data.data !== 'string' || !Number.isSafeInteger(data.jsonByteLength)
    || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.fileName !== 'string'
    || typeof data.generation !== 'string' || !Number.isSafeInteger(data.courseCount) || data.courseCount < 0) {
    throw new Error('The saved courses workbook is invalid. Saving is blocked to preserve the stored data.')
  }
  const state = await decodeDepartmentCoursesWorkbook(data.data, data.jsonByteLength)
  if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the courses workbook.')
  if (departmentCourseDocuments(state).length !== data.courseCount) throw new Error('The saved courses workbook has an invalid row count.')
  return { state, saved: { revision: data.revision as number, fileName: data.fileName as string, generation: data.generation as string } }
}

async function deleteCourseDocuments(references: DocumentReference[]) {
  for (let start = 0; start < references.length; start += 400) {
    const batch = writeBatch(db)
    references.slice(start, start + 400).forEach(reference => batch.delete(reference))
    await batch.commit()
  }
}

export async function saveDepartmentCoursesWorkbook(context: DepartmentCoursesContext, fileName: string,
  state: DepartmentCoursesWorkbookState, previous: SavedDepartmentCoursesWorkbook | null): Promise<SavedDepartmentCoursesWorkbook> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in again before saving courses.')
  if (!/^[A-Za-z0-9_-]+$/.test(context.membershipId)) throw new Error('An accepted department membership is required to save courses.')
  if (!/\.xlsx$/i.test(fileName) || fileName.length > 255) throw new Error('Use an .xlsx filename of no more than 255 characters.')
  const reference = workbookRef(context)
  const encoded = await encodeDepartmentCoursesWorkbook(state)
  const rows = departmentCourseDocuments(state)
  const revision = (previous?.revision ?? 0) + 1
  const generation = crypto.randomUUID()
  const references = rows.map((_, index) => doc(db, 'courses', `${generation}_${index}`))
  const assertPermission = (member: Parameters<typeof canEditDepartmentCourses>[0], code: unknown) => {
    if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the courses workbook.')
    if (code !== context.departmentCode || !canEditDepartmentCourses(member, user.uid, context.departmentCode)) {
      throw new Error('Only an accepted Admin, Dean, or Program Head for this department can save courses.')
    }
  }
  const [membership, department] = await Promise.all([
    getDocFromServer(doc(db, 'memberships', context.membershipId)), getDocFromServer(doc(db, 'departments', context.departmentId)),
  ])
  assertPermission(membership.data(), department.data()?.code)
  try {
    // Stage a complete generation before publishing its pointer with the workbook.
    for (const { start, count } of departmentCourseBatchRanges(rows)) {
      if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the courses workbook.')
      const batch = writeBatch(db)
      rows.slice(start, start + count).forEach((row, offset) => batch.set(references[start + offset], {
        ...row, departmentId: context.departmentId, departmentCode: context.departmentCode,
        sourceWorkbook: reference.path, generation, revision, membershipId: context.membershipId,
        savedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }))
      await batch.commit()
    }
    await runTransaction(db, async transaction => {
      if (auth.currentUser?.uid !== user.uid) throw new Error('Your account changed. Reopen the courses workbook.')
      const [current, membership, department] = await Promise.all([
        transaction.get(reference), transaction.get(doc(db, 'memberships', context.membershipId)),
        transaction.get(doc(db, 'departments', context.departmentId)),
      ])
      assertPermission(membership.data(), department.data()?.code)
      if ((current.exists() ? current.data().revision : 0) !== (previous?.revision ?? 0)) {
        throw new Error('A newer courses workbook was saved. Reopen it before saving your changes.')
      }
      transaction.set(reference, { schemaVersion: 1, encoding: 'gzip-base64', ...encoded,
        departmentId: context.departmentId, departmentCode: context.departmentCode,
        membershipId: context.membershipId, savedBy: user.uid, fileName, revision,
        generation, courseCount: rows.length,
        createdAt: current.exists() ? current.data().createdAt : serverTimestamp(), updatedAt: serverTimestamp() })
    })
  } catch (caught) {
    // A lost response may hide a successful commit. Never delete its active rows.
    let current
    try { current = await getDocFromServer(reference) } catch {
      throw new Error('The save could not be confirmed. Reopen the courses workbook to check its saved version before retrying.')
    }
    if (current.data()?.generation !== generation) {
      try { await deleteCourseDocuments(references) } catch { /* Unpublished generations are ignored by readers. */ }
      throw caught
    }
  }
  let cleanupWarning: string | undefined
  if (previous?.generation && previous.generation !== generation) {
    try {
      const oldRows = await getDocs(query(collection(db, 'courses'), where('generation', '==', previous.generation)))
      await deleteCourseDocuments(oldRows.docs.filter(document => document.data().sourceWorkbook === reference.path).map(document => document.ref))
    } catch { cleanupWarning = 'Some older course records could not be removed.' }
  }
  return { revision, fileName, generation, cleanupWarning }
}
