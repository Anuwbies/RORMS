import { useState } from 'react'
import { LeftSidebarLayout } from '../layouts/LeftSidebarLayout'
import {
  BuildingIcon,
  DashboardIcon,
  UsersIcon,
} from '../components/Icons'
import type { NavItem, DashboardSection } from '../components/LeftSidebar'
import DashboardPage from './tabs/DashboardPage'
import BuildingsRoomsPage from './tabs/BuildingsRoomsPage'
import UsersPage from './tabs/UsersPage'

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    eyebrow: 'Dashboard',
    description: 'Overview of room management activity and registrar highlights.',
    icon: DashboardIcon,
  },
  {
    id: 'buildingsRooms',
    label: 'Buildings & Rooms',
    eyebrow: 'Buildings & Rooms',
    description: 'Manage buildings, rooms, and available spaces.',
    icon: BuildingIcon,
  },
  {
    id: 'users',
    label: 'Users',
    eyebrow: 'Users',
    description: 'Manage account roles and user records.',
    icon: UsersIcon,
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
      case 'buildingsRooms':
        return <BuildingsRoomsPage />
      case 'users':
        return <UsersPage />
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
