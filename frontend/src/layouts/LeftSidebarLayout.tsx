import { useState, type ReactNode } from 'react'
import { LeftSidebar, type NavItem, type DashboardSection } from '../components/LeftSidebar'
import { RightSidebar } from '../components/RightSidebar'
import { joinClasses } from '../components/IconButton'

interface LeftSidebarLayoutProps {
  navItems: NavItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  onSignOut: () => void
  children: ReactNode
}

export function LeftSidebarLayout({
  navItems,
  activeSection,
  onSectionChange,
  onSignOut,
  children,
}: LeftSidebarLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)
  const [isRightSidebarExpanded, setIsRightSidebarExpanded] = useState(false)

  return (
    <main className="min-h-screen bg-[var(--brand-surface)] text-[var(--brand-color)]">
      <LeftSidebar
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
          isSidebarExpanded ? 'lg:pl-80' : 'lg:pl-20',
          isRightSidebarExpanded ? 'xl:pr-80' : 'xl:pr-20',
        )}
      >
        <section className="h-full w-full">
          {children}
        </section>
      </div>

      <RightSidebar
        isExpanded={isRightSidebarExpanded}
        onExpandChange={setIsRightSidebarExpanded}
        onSignOut={onSignOut}
      />
    </main>
  )
}
