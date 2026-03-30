import { useState, type ReactNode } from 'react'
import { Sidebar, type NavItem, type DashboardSection } from '../components/Sidebar'
import { joinClasses } from '../components/IconButton'

interface DashboardLayoutProps {
  navItems: NavItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  children: ReactNode
}

export function DashboardLayout({
  navItems,
  activeSection,
  onSectionChange,
  children,
}: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)

  return (
    <main className="min-h-screen bg-white text-[var(--brand-olive-deep)]">
      <Sidebar
        navItems={navItems}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isSidebarExpanded={isSidebarExpanded}
        setIsSidebarExpanded={setIsSidebarExpanded}
      />

      <div
        className={joinClasses(
          'min-h-screen transition-[padding] duration-300',
          isSidebarExpanded ? 'lg:pl-80' : 'lg:pl-24',
        )}
      >
        <section className="h-full w-full">
          {children}
        </section>
      </div>
    </main>
  )
}
