import { useState } from 'react'
import { LeftSidebarLayout } from '../layouts/LeftSidebarLayout'
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
} from '../components/Icons'
import type { NavItem, DashboardSection } from '../components/LeftSidebar'
import DashboardPage from './tabs/DashboardPage'
import BuildingsRoomsPage from './tabs/BuildingsRoomsPage'
import MembersPage from './tabs/MembersPage'
import MyDepartmentPage from './tabs/MyDepartmentPage'
import DepartmentsPage from './tabs/DepartmentsPage'
import ReportsPage from './tabs/ReportsPage'
import MySchedulePage from './tabs/MySchedulePage'
import ManageReservationsPage from './tabs/ManageReservationsPage'
import ReserveRoomPage from './tabs/ReserveRoomPage'
import MyReservationsPage from './tabs/MyReservationsPage'

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    eyebrow: 'Dashboard',
    description: 'Overview of room management activity and registrar highlights.',
    icon: DashboardIcon,
  },
  {
    id: 'mySchedule',
    label: 'My Schedule',
    eyebrow: 'My Schedule',
    description: 'View and manage your upcoming room bookings.',
    icon: CalendarIcon,
  },
  {
    id: 'reserveRoom',
    label: 'Reserve a Room',
    eyebrow: 'Reserve a Room',
    description: 'Find and book available rooms.',
    icon: BookIcon,
  },
  {
    id: 'myReservations',
    label: 'My Reservations',
    eyebrow: 'My Reservations',
    description: 'View and track your own room bookings.',
    icon: DoorIcon,
  },
  {
    id: 'manageReservations',
    label: 'Manage Reservations',
    eyebrow: 'Manage Reservations',
    description: 'Track and approve room reservation requests.',
    icon: ClipboardIcon,
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
    id: 'reports',
    label: 'Reports',
    eyebrow: 'Reports',
    description: 'Generate and view university-wide utilization reports.',
    icon: ClipboardIcon,
  },
  {
    id: 'myDepartment',
    label: 'My Department',
    eyebrow: 'My Department',
    description: 'View department leads, workstreams, and operating coverage.',
    icon: LayersIcon,
  },
]

interface LeftSidebarControllerProps {
  onSignOut: () => void
}

function LeftSidebarController({ onSignOut }: LeftSidebarControllerProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard')

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardPage />
      case 'mySchedule':
        return <MySchedulePage />
      case 'reserveRoom':
        return <ReserveRoomPage />
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
        return <ReportsPage />
      case 'myDepartment':
        return <MyDepartmentPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <LeftSidebarLayout
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onSignOut={onSignOut}
    >
      {renderSection()}
    </LeftSidebarLayout>
  )
}

export default LeftSidebarController
