export type SemesterKey = 'sem1' | 'sem2'

export interface DepartmentWorkbookTerm {
  departmentId: string
  departmentCode: string
  academicYearId: string
  academicYear: string
  semester: SemesterKey
  membershipId: string
}

export function semesterKey(name: string): SemesterKey {
  if (name === '1st Semester') return 'sem1'
  if (name === '2nd Semester') return 'sem2'
  throw new Error('Choose the 1st or 2nd semester.')
}

export function schoolYearDocumentId(academicYear: string): string {
  const value = academicYear.replace(/\s/g, '')
  if (!/^\d{4}-\d{4}$/.test(value)) throw new Error('The school year must use YYYY-YYYY.')
  return value
}

export function workbookTermPaths(term: Pick<DepartmentWorkbookTerm, 'departmentId' | 'academicYearId' | 'academicYear' | 'semester'>) {
  if (![term.departmentId, term.academicYearId].every(value => /^[A-Za-z0-9_-]+$/.test(value)) || !['sem1', 'sem2'].includes(term.semester)) throw new Error('The department or academic term is invalid.')
  const year = schoolYearDocumentId(term.academicYear)
  return {
    document: `departments/${term.departmentId}/workbooks/${year}/semesters/${term.semester}`,
    previousDocument: `departments/${term.departmentId}/workbooks/${year}/${term.semester}/${term.semester}storage`,
    namedLegacyDocument: `departments/${term.departmentId}/scheduleYears/${year}/semesters/${term.semester}`,
    legacyDocument: `departments/${term.departmentId}/scheduleYears/${term.academicYearId}/semesters/${term.semester}`,
    storage: `department-workbooks/${term.departmentId}/${year}/${term.semester}/semesters`,
    previousStorage: `department-workbooks/${term.departmentId}/${year}/${term.semester}/workbooks`,
    namedLegacyStorage: `department-workbooks/${term.departmentId}/${year}/${term.semester}/revisions`,
    legacyStorage: `department-workbooks/${term.departmentId}/${term.academicYearId}/${term.semester}/revisions`,
  }
}
