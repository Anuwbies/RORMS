import { useState, useEffect } from 'react'
import { auth, db } from '../../firebase'
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import AdminDashboardPage from './AdminDashboardPage'
import RegistrarDashboardPage from './RegistrarDashboardPage'
import FacultyDashboardPage from './FacultyDashboardPage'

interface DashboardPageProps {
  userRole?: string | null
}

export function DashboardPage({ userRole }: DashboardPageProps = {}) {
  const [role, setRole] = useState<string | null>(userRole || null)
  const [isLoading, setIsLoading] = useState(!userRole)

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

  // 1. Admin Dashboard
  if (role === 'Admin') {
    return <AdminDashboardPage />
  }

  // 2. Registrar Dashboard
  if (role === 'Registrar') {
    return <RegistrarDashboardPage />
  }

  // 3. Dean, Program Head, and Instructor Dashboard
  return <FacultyDashboardPage userRole={role || 'Instructor'} />
}

export default DashboardPage
