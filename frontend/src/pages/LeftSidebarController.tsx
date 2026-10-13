import { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { MainLayout } from '../layouts/MainLayout'
import {
  BuildingIcon,
  DashboardIcon,
  DepartmentIcon,
  LayersIcon,
  UsersIcon,
  ClipboardIcon,
  CalendarIcon,
  BookIcon,
  DoorIcon,
  ClockIcon,
} from '../components/Icons'
import type { NavItem, DashboardSection } from '../components/LeftSidebar'
import DashboardPage from './tabs/DashboardPage'
import BuildingsRoomsPage from './tabs/BuildingsRoomsPage'
import MembersPage from './tabs/MembersPage'
import MyDepartmentPage from './tabs/MyDepartmentPage'
import DepartmentsPage from './tabs/DepartmentsPage'
import ReportsPage from './tabs/ReportsPage'
import AnalyticsPage from './tabs/AnalyticsPage'
import LogsPage from './tabs/LogsPage'
import MySchedulePage from './tabs/MySchedulePage'
import ManageReservationsPage from './tabs/ManageReservationsPage'
import ReserveRoomPage from './tabs/ReserveRoomPage'
import MyReservationsPage from './tabs/MyReservationsPage'
import AcademicCalendarPage from './tabs/AcademicCalendarPage'
import DepartmentSchedulesPage from './tabs/DepartmentSchedulesPage'

export const ROLE_ALLOWED_TABS: Record<string, DashboardSection[]> = {
  'Admin': [
    'dashboard', 'academicCalendar', 'members', 'departments', 'buildingsRooms',
    'departmentSchedules', 'manageReservations', 'reserveRoom', 'myReservations', 'analytics', 'reports', 'logs'
  ],
  'Registrar': [
    'dashboard', 'academicCalendar', 'departmentSchedules', 'buildingsRooms',
    'manageReservations', 'reserveRoom', 'analytics', 'reports'
  ],
  'Dean': [
    'dashboard', 'academicCalendar', 'mySchedule', 'myDepartment', 'reserveRoom', 'myReservations', 'buildingsRooms'
  ],
  'Program Head': [
    'dashboard', 'academicCalendar', 'mySchedule', 'myDepartment', 'reserveRoom', 'myReservations', 'buildingsRooms'
  ],
  'Instructor': [
    'dashboard', 'academicCalendar', 'mySchedule', 'myDepartment', 'reserveRoom', 'myReservations', 'buildingsRooms'
  ],
}

export function normalizeRole(role: string | null | undefined): string {
  if (!role) return 'Instructor'
  const trimmed = role.trim().toLowerCase()
  if (trimmed === 'admin') return 'Admin'
  if (trimmed === 'registrar') return 'Registrar'
  if (trimmed === 'dean') return 'Dean'
  if (trimmed === 'program head' || trimmed === 'programhead') return 'Program Head'
  if (trimmed === 'instructor' || trimmed === 'faculty') return 'Instructor'
  const match = Object.keys(ROLE_ALLOWED_TABS).find(k => k.toLowerCase() === trimmed)
  return match || 'Instructor'
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    eyebrow: 'Dashboard',
    description: 'Dynamic dashboard automatically routed based on role.',
    icon: DashboardIcon,
  },
  {
    id: 'academicCalendar',
    label: 'Academic Calendar',
    eyebrow: 'System Settings',
    description: 'Manage academic year and scheduling phases.',
    icon: CalendarIcon,
  },
  {
    id: 'buildingsRooms',
    label: 'Buildings & Rooms',
    eyebrow: 'Buildings & Rooms',
    description: 'Manage buildings, rooms, and available spaces.',
    icon: BuildingIcon,
  },
  {
    id: 'departments',
    label: 'Departments',
    eyebrow: 'Departments',
    description: 'Manage university departments and resource allocation.',
    icon: DepartmentIcon,
  },
  {
    id: 'members',
    label: 'Members',
    eyebrow: 'Members',
    description: 'Manage account roles and member records.',
    icon: UsersIcon,
  },
  {
    id: 'manageReservations',
    label: 'Manage Reservations',
    eyebrow: 'Manage Reservations',
    description: 'Track and approve room reservation requests.',
    icon: ClipboardIcon,
  },
  {
    id: 'departmentSchedules',
    label: 'Department Schedules',
    eyebrow: 'Room Plotting',
    description: 'View department schedules and plot them into rooms.',
    icon: CalendarIcon,
  },
  {
    id: 'reports',
    label: 'Reports',
    eyebrow: 'Reports',
    description: 'Generate and view university-wide utilization reports.',
    icon: ClipboardIcon,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    eyebrow: 'Analytics',
    description: 'View room and scheduling insights.',
    icon: LayersIcon,
  },
  {
    id: 'logs',
    label: 'Logs',
    eyebrow: 'Logs',
    description: 'Review system activity and audit history.',
    icon: ClockIcon,
  },
  {
    id: 'mySchedule',
    label: 'My Schedule',
    eyebrow: 'My Schedule',
    description: 'View and manage your upcoming room bookings.',
    icon: CalendarIcon,
  },
  {
    id: 'myReservations',
    label: 'My Reservations',
    eyebrow: 'My Reservations',
    description: 'View and track your own room bookings.',
    icon: DoorIcon,
  },
  {
    id: 'reserveRoom',
    label: 'Reserve a Room',
    eyebrow: 'Reserve a Room',
    description: 'Find and book available rooms.',
    icon: BookIcon,
  },
  {
    id: 'myDepartment',
    label: 'My Department',
    eyebrow: 'My Department',
    description: 'View department leads, workstreams, and operating coverage.',
    icon: LayersIcon,
  },
]

function getOrderedItemsForRole(role: string): NavItem[] {
  const normRole = normalizeRole(role)
  const allowedIds = ROLE_ALLOWED_TABS[normRole] || ROLE_ALLOWED_TABS['Instructor']
  const userId = auth.currentUser?.uid || 'guest'
  const savedOrder = localStorage.getItem(`rorms_sidebar_order_${userId}`)

  if (savedOrder) {
    try {
      const orderIds: string[] = JSON.parse(savedOrder)
      const validIds = orderIds.filter((id): id is DashboardSection => allowedIds.includes(id as DashboardSection))
      const missingIds = allowedIds.filter(id => !validIds.includes(id))
      const finalIds = [...validIds, ...missingIds]
      return finalIds
        .map(id => navItems.find(item => item.id === id))
        .filter((item): item is NavItem => Boolean(item))
    } catch (e) {
      // Fallback to default role tabs
    }
  }

  return allowedIds
    .map(id => navItems.find(item => item.id === id))
    .filter((item): item is NavItem => Boolean(item))
}

interface LeftSidebarControllerProps {
  onSignOut: () => void
}

function LeftSidebarController({ onSignOut }: LeftSidebarControllerProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard')
  const [userRole, setUserRole] = useState<string | null>(() => {
    const userId = auth.currentUser?.uid || 'guest'
    return localStorage.getItem(`rorms_user_role_${userId}`) || null
  })
  const [orderedNavItems, setOrderedNavItems] = useState<NavItem[]>(() => {
    return getOrderedItemsForRole(userRole || 'Instructor')
  })

  useEffect(() => {
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
            const fetchedRole = snapshot.docs[0].data().role || 'Instructor'
            setUserRole(fetchedRole)
            localStorage.setItem(`rorms_user_role_${user.uid}`, fetchedRole)
          } else {
            setUserRole('Instructor')
            localStorage.setItem(`rorms_user_role_${user.uid}`, 'Instructor')
          }
        }, (error) => {
          console.error('Error fetching membership role:', error)
          setUserRole('Instructor')
        })
      } else {
        setUserRole('Instructor')
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeMembership) unsubscribeMembership()
    }
  }, [])

  useEffect(() => {
    setOrderedNavItems(getOrderedItemsForRole(userRole || 'Instructor'))
  }, [userRole])

  useEffect(() => {
    const normRole = normalizeRole(userRole)
    const allowedIds = ROLE_ALLOWED_TABS[normRole] || ROLE_ALLOWED_TABS['Instructor']
    if (!allowedIds.includes(activeSection)) {
      setActiveSection('dashboard')
    }
  }, [userRole, activeSection])

  useEffect(() => {
    const handleNavigation = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail) {
        const target = customEvent.detail as DashboardSection
        const normRole = normalizeRole(userRole)
        const allowedIds = ROLE_ALLOWED_TABS[normRole] || ROLE_ALLOWED_TABS['Instructor']
        if (allowedIds.includes(target)) {
          setActiveSection(target)
        } else {
          setActiveSection('dashboard')
        }
      }
    }
    window.addEventListener('navigate-tab', handleNavigation)
    return () => window.removeEventListener('navigate-tab', handleNavigation)
  }, [userRole])

  const handleReorder = (newItems: NavItem[]) => {
    const userId = auth.currentUser?.uid || 'guest'
    setOrderedNavItems(newItems)
    localStorage.setItem(`rorms_sidebar_order_${userId}`, JSON.stringify(newItems.map(item => item.id)))
  }

  const renderSection = () => {
    const normRole = normalizeRole(userRole)
    const allowedIds = ROLE_ALLOWED_TABS[normRole] || ROLE_ALLOWED_TABS['Instructor']

    if (!allowedIds.includes(activeSection)) {
      return <DashboardPage userRole={normRole} />
    }

    switch (activeSection) {
      case 'dashboard':
        return <DashboardPage userRole={normRole} />
      case 'academicCalendar':
        return <AcademicCalendarPage userRole={normRole} />
      case 'mySchedule':
        return <MySchedulePage />
      case 'reserveRoom':
        return <ReserveRoomPage userRole={normRole} />
      case 'myReservations':
        return <MyReservationsPage />
      case 'manageReservations':
        return <ManageReservationsPage />
      case 'buildingsRooms':
        return <BuildingsRoomsPage />
      case 'departments':
        return <DepartmentsPage />
      case 'members':
        return <MembersPage />
      case 'reports':
        return <ReportsPage userRole={normRole} />
      case 'analytics':
        return <AnalyticsPage userRole={normRole} />
      case 'logs':
        return <LogsPage />
      case 'myDepartment':
        return <MyDepartmentPage />
      case 'departmentSchedules':
        return <DepartmentSchedulesPage />
      default:
        return <DashboardPage userRole={normRole} />
    }
  }

  return (
    <MainLayout
      navItems={orderedNavItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSignOut={onSignOut}
      onReorder={handleReorder}
    >
      {renderSection()}
    </MainLayout>
  )
}

export default LeftSidebarController
