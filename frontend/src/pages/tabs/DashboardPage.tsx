import { useState, useEffect } from 'react'
import { auth, db } from '../../firebase'
import { collection, query, where, onSnapshot, limit, getDocs, doc, updateDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { SingleSelectDropdown } from '../../components/SingleSelectDropdown'
import AdminDashboardPage from './AdminDashboardPage'
import UniversityAdministratorDashboardPage from './UniversityAdministratorDashboardPage'
import DepartmentDashboardPage from './DepartmentDashboardPage'

interface DashboardPageProps {
  userRole?: string | null
}

const ROLE_SWITCHER_EMAILS = ['llme.rodas.up@phinmaed.com']
const ROLE_OPTIONS = ['Admin', 'Registrar', 'University Administrator', 'Dean', 'Program Head', 'Instructor'] as const
type DashboardRole = typeof ROLE_OPTIONS[number]

const ROLE_DEPARTMENTS: Record<DashboardRole, string> = {
  'University Administrator': 'General Service Department',
  Admin: 'Administrative Office',
  Registrar: "Registrar's Office",
  Dean: 'CITE',
  'Program Head': 'CITE',
  Instructor: 'CITE',
}

export function DashboardPage({ userRole }: DashboardPageProps = {}) {
  const [role, setRole] = useState<string | null>(userRole || null)
  const [isLoading, setIsLoading] = useState(!userRole)
  const [userEmail, setUserEmail] = useState(auth.currentUser?.email || '')
  const [isRoleUpdating, setIsRoleUpdating] = useState(false)

  useEffect(() => (
    onAuthStateChanged(auth, user => setUserEmail(user?.email || ''))
  ), [])

  useEffect(() => {
    if (userRole) {
      setRole(userRole)
      setIsLoading(false)
      return
    }
    let unsubscribeMembership: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const q = query(
          collection(db, 'memberships'),
          where('userId', '==', user.uid),
          limit(1)
        )
        unsubscribeMembership = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const userRole = snapshot.docs[0].data().role || 'Instructor'
            setRole(userRole)
          } else {
            // Default fallback if no membership record yet
            setRole('Instructor')
          }
          setIsLoading(false)
        }, (error) => {
          console.error('Error fetching membership role:', error)
          setRole('Instructor')
          setIsLoading(false)
        })
      } else {
        setRole('Instructor')
        setIsLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeMembership) unsubscribeMembership()
    }
  }, [userRole])

  const handleRoleChange = async (nextRole: DashboardRole) => {
    const user = auth.currentUser
    if (!user || !ROLE_SWITCHER_EMAILS.includes(user.email?.toLowerCase() || '')) return

    const previousRole = role
    setRole(nextRole)
    setIsRoleUpdating(true)

    try {
      const membershipQuery = query(
        collection(db, 'memberships'),
        where('userId', '==', user.uid),
        limit(1)
      )
      const membershipSnapshot = await getDocs(membershipQuery)
      if (membershipSnapshot.empty) {
        throw new Error('No membership record found for role switcher account')
      }

      await updateDoc(doc(db, 'memberships', membershipSnapshot.docs[0].id), {
        role: nextRole,
        department: ROLE_DEPARTMENTS[nextRole],
      })
    } catch (error) {
      console.error('Error changing dashboard role:', error)
      setRole(previousRole)
    } finally {
      setIsRoleUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <section className="h-screen overflow-y-scroll custom-scrollbar bg-[var(--brand-surface)] px-4 pt-0 pb-6 sm:px-6 lg:px-8 lg:pb-8">
        <div className="space-y-6 pt-6 animate-pulse">
          <div className="h-10 w-64 bg-slate-200 rounded-xl" />
          <div className="h-5 w-96 bg-slate-100 rounded-lg" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 pt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 rounded-2xl bg-white border border-slate-100 p-5" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-white border border-slate-100" />
        </div>
      </section>
    )
  }

  const selectedRole = ROLE_OPTIONS.includes(role as DashboardRole) ? role as DashboardRole : 'Instructor'
  const headerAction = ROLE_SWITCHER_EMAILS.includes(userEmail.toLowerCase()) ? (
    <SingleSelectDropdown
      options={ROLE_OPTIONS}
      value={selectedRole}
      onChange={handleRoleChange}
      isDisabled={isRoleUpdating}
      className="w-full min-w-0! [&_button>span]:min-w-0 [&_button>span]:truncate [&_button>svg]:shrink-0"
    />
  ) : undefined
  const dashboard = role === 'University Administrator'
    ? <UniversityAdministratorDashboardPage headerAction={headerAction} />
    : role === 'Admin' || role === 'Registrar'
      ? <AdminDashboardPage userRole={role} headerAction={headerAction} />
      : <DepartmentDashboardPage userRole={role || 'Instructor'} headerAction={headerAction} />

  return dashboard
}

export default DashboardPage
