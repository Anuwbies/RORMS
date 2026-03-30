import { useState } from 'react'
import { DashboardLayout } from '../layouts/DashboardLayout'
import {
  CalendarIcon,
  ClipboardIcon,
  DashboardIcon,
  DoorIcon,
  SettingsIcon,
} from '../components/Icons'
import type { NavItem, DashboardSection } from '../components/Sidebar'

const navItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    eyebrow: 'Dashboard',
    description: 'Snapshot of occupancy, requests, and registrar room activity.',
    icon: DashboardIcon,
  },
  {
    id: 'rooms',
    label: 'Rooms',
    eyebrow: 'Rooms',
    description: 'Manage room availability, capacity, and assigned office spaces.',
    icon: DoorIcon,
  },
  {
    id: 'requests',
    label: 'Requests',
    eyebrow: 'Requests',
    description: 'Review reservation submissions waiting for registrar approval.',
    icon: ClipboardIcon,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    eyebrow: 'Schedule',
    description: 'Track upcoming room usage and reservation timelines.',
    icon: CalendarIcon,
  },
  {
    id: 'settings',
    label: 'Settings',
    eyebrow: 'Settings',
    description: 'Adjust room policies, preferences, and system defaults.',
    icon: SettingsIcon,
  },
]

function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview')

  return (
    <DashboardLayout
      navItems={navItems}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    >
      <div className="h-full w-full bg-white">
        {/* Main content will go here */}
      </div>
    </DashboardLayout>
  )
}

export default DashboardPage
