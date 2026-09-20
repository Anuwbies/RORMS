import { useState, useEffect } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot } from 'firebase/firestore'

export interface SemesterInfo {
  name?: string
  phase?: string
  startMonth?: string
  startYear?: number
  endMonth?: string
  endYear?: number
}

export interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: SemesterInfo
  sem2?: SemesterInfo
}

export const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
]

/**
 * Returns 0-11 index of a month name string (e.g. "January" -> 0, "Aug" -> 7).
 */
export function getMonthIndexByName(monthName?: string): number {
  if (!monthName) return -1
  const lower = monthName.toLowerCase().trim()
  return MONTH_NAMES.findIndex(m => m.startsWith(lower.slice(0, 3)))
}

/**
 * Resolves whether the current date falls into "1st Semester" or "2nd Semester"
 * based on the active academic year's sem1 and sem2 start/end months and years.
 */
export function resolveCurrentSemester(
  academicYear?: AcademicYearData | null,
  explicitInitialSem?: string,
  referenceDate: Date = new Date()
): string {
  if (explicitInitialSem) return explicitInitialSem
  if (!academicYear) return '1st Semester'

  const sem1 = academicYear.sem1
  const sem2 = academicYear.sem2

  const curYear = referenceDate.getFullYear()
  const curMonth = referenceDate.getMonth() // 0 - 11
  const curAbs = curYear * 12 + curMonth

  const parts = (academicYear.academicYear || '')
    .split(/[-–—/]/)
    .map(p => parseInt(p.trim()))
    .filter(n => !isNaN(n))
  const ayStart = parts[0] || curYear
  const ayEnd = parts[1] || ayStart + 1

  // 1. If sem2 has startMonth and endMonth, check if currently in 2nd Semester range
  if (sem2?.startMonth && sem2?.endMonth) {
    const startM2 = getMonthIndexByName(sem2.startMonth)
    const endM2 = getMonthIndexByName(sem2.endMonth)
    if (startM2 !== -1 && endM2 !== -1) {
      const startY2 = sem2.startYear || (startM2 < (getMonthIndexByName(sem1?.startMonth) || 0) ? ayEnd : ayStart)
      const endY2 = sem2.endYear || (endM2 < startM2 ? startY2 + 1 : startY2)
      const sem2StartAbs = startY2 * 12 + startM2
      const sem2EndAbs = endY2 * 12 + endM2

      if (curAbs >= sem2StartAbs && curAbs <= sem2EndAbs) {
        return '2nd Semester'
      }
    }
  }

  // 2. If sem1 has startMonth and endMonth, check if currently in 1st Semester range or after sem1
  if (sem1?.startMonth && sem1?.endMonth) {
    const startM = getMonthIndexByName(sem1.startMonth)
    const endM = getMonthIndexByName(sem1.endMonth)
    if (startM !== -1 && endM !== -1) {
      const startY = sem1.startYear || ayStart
      const endY = sem1.endYear || (endM < startM ? ayStart + 1 : ayStart)
      const sem1StartAbs = startY * 12 + startM
      const sem1EndAbs = endY * 12 + endM

      if (curAbs >= sem1StartAbs && curAbs <= sem1EndAbs) {
        return '1st Semester'
      }
      if (curAbs > sem1EndAbs) {
        return '2nd Semester'
      }
      return '1st Semester'
    }
  }

  return '1st Semester'
}

/**
 * Custom React Hook that subscribes to academic years in Firestore and provides:
 * - activeAcademicYear: the currently active AcademicYearData document
 * - currentSemester: dynamically computed '1st Semester' or '2nd Semester'
 * - academicYears: list of all academic years sorted descending
 * - isLoading: boolean
 */
export function useAcademicSemester() {
  const [academicYears, setAcademicYears] = useState<AcademicYearData[]>([])
  const [activeAcademicYear, setActiveAcademicYear] = useState<AcademicYearData | null>(null)
  const [currentSemester, setCurrentSemester] = useState<string>('1st Semester')
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const years = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearData))
      years.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))
      setAcademicYears(years)

      if (years.length > 0) {
        const activeYear = years.find(y => y.isActive) || years[0]
        setActiveAcademicYear(activeYear)
        const resolvedSem = resolveCurrentSemester(activeYear)
        setCurrentSemester(resolvedSem)
      } else {
        setActiveAcademicYear(null)
        setCurrentSemester('1st Semester')
      }
      setIsLoading(false)
    }, (err) => {
      console.error('Error fetching academic years:', err)
      setIsLoading(false)
    })

    return () => unsubscribe()
  }, [])

  return {
    academicYears,
    activeAcademicYear,
    currentSemester,
    isLoading
  }
}
