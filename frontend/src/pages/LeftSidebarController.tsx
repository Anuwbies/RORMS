import { useState } from 'react'
import { LeftSidebarLayout } from '../layouts/LeftSidebarLayout'
import {
  BuildingIcon,
  DashboardIcon,
  LayersIcon,
  UsersIcon,
} from '../components/Icons'
import type { NavItem, DashboardSection } from '../components/LeftSidebar'
import DashboardPage from './tabs/DashboardPage'
import BuildingsRoomsPage from './tabs/BuildingsRoomsPage'
import MembersPage from './tabs/MembersPage'
import MyDepartmentPage from './tabs/MyDepartmentPage'

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
    id: 'members',
    label: 'Members',
    eyebrow: 'Members',
    description: 'Manage account roles and member records.',
    icon: UsersIcon,
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
      case 'buildingsRooms':
        return <BuildingsRoomsPage />
      case 'members':
        return <MembersPage />
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
