import { useState, useEffect } from 'react'
import { formatUserName } from '../../utils/userName'
import { SectionHeader } from '../../components/SectionHeader'
import { PersonalScheduleModal } from '../../components/PersonalScheduleModal'
import { resolveCurrentSemester } from '../../utils/academicSemester'
import { auth, db } from '../../firebase'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { collection, query, where, onSnapshot, limit, doc } from 'firebase/firestore'

interface AcademicYearData {
  id: string
  academicYear: string
  isActive?: boolean
  sem1?: { name?: string; phase?: string }
  sem2?: { name?: string; phase?: string }
}

const SCHEDULE_STATUSES = ['Draft', 'Plot'] as const

function MySchedulePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentUserDoc, setCurrentUserDoc] = useState<any>(null)
  const [currentMembership, setCurrentMembership] = useState<any>(null)
  const [departmentName, setDepartmentName] = useState<string>('')
  const [membershipId, setMembershipId] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<AcademicYearData | null>(null)
  const [selectedSemester, setSelectedSemester] = useState<string>('1st Semester')
  const reservationsOnly = userRole === 'Admin' || userRole === 'Registrar' || userRole === 'University Administrator'

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'academicYears'), (snapshot) => {
      const years = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AcademicYearData))
      years.sort((a, b) => (b.academicYear || '').localeCompare(a.academicYear || ''))

      if (years.length > 0) {
        setSelectedAcademicYear(prev => {
          if (prev && years.some(y => y.id === prev.id)) return prev

          const activeYear = years.find(y => y.isActive) || years[0]
          setSelectedSemester(resolveCurrentSemester(activeYear))
          return activeYear
        })
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (currentMembership?.department) {
      const q = query(collection(db, 'departments'), where('code', '==', currentMembership.department), limit(1))
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setDepartmentName(snap.docs[0].data().name)
        } else {
          setDepartmentName(currentMembership.department)
        }
      })
      return () => unsub()
    }
  }, [currentMembership?.department])

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null
    let unsubscribeMemberships: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (user) {
        unsubscribeUserDoc = onSnapshot(doc(db, 'users', user.uid), (uSnap) => {
          if (uSnap.exists()) {
            setCurrentUserDoc(uSnap.data())
          }
        })

        const membershipQuery = query(collection(db, 'memberships'), where('userId', '==', user.uid), limit(1))
        unsubscribeMemberships = onSnapshot(membershipQuery, (mSnap) => {
          if (!mSnap.empty) {
            const mDoc = mSnap.docs[0]
            const memData = mDoc.data()
            setMembershipId(mDoc.id)
            setCurrentMembership(memData)
            setUserRole(memData.role || '')
          } else {
            setUserRole('')
            setMembershipId('')
            setCurrentMembership(null)
          }
        }, (err) => {
          console.error('Error loading membership:', err)
        })
      } else {
        setCurrentUserDoc(null)
        setCurrentMembership(null)
        setMembershipId('')
        setUserRole('')
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeUserDoc) unsubscribeUserDoc()
      if (unsubscribeMemberships) unsubscribeMemberships()
    }
  }, [])

  return (
    <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
      <div className="space-y-6 [&>*:not(:first-child)]:animate-in [&>*:not(:first-child)]:fade-in [&>*:not(:first-child)]:zoom-in-95 [&>*:not(:first-child)]:duration-300">
        <SectionHeader
          title="My Schedule"
          description={userRole === 'Dean' || reservationsOnly
            ? 'View your weekly room reservations.'
            : `View and manage your assigned classes, weekly timetable, and room schedule for ${selectedAcademicYear?.academicYear || 'Academic Year'} • ${selectedSemester}.`}
        />

        <PersonalScheduleModal
          isOpen={true}
          onClose={() => {}}
          member={{
            id: currentUser?.uid,
            membershipId: membershipId,
            userId: currentUser?.uid,
            name: formatUserName(currentUserDoc) || currentUser?.displayName || 'Instructor',
            email: currentUser?.email || '',
            role: userRole || currentMembership?.role || 'Instructor',
            department: currentMembership?.department || '',
            departmentName: departmentName || currentMembership?.departmentName || ''
          }}
          showWeekCalendar={true}
          showStatusColors={true}
          isInline={true}
          scheduleStatuses={SCHEDULE_STATUSES}
          hideReservationIdentity={true}
          initialAcademicYear={selectedAcademicYear?.academicYear}
          initialSemester={selectedSemester}
          reservationsOnly={reservationsOnly}
        />
      </div>
    </section>
  )
}

export default MySchedulePage
