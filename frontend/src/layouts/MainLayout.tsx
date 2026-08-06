import { useState, type ReactNode } from 'react'
import { LeftSidebar, type NavItem, type DashboardSection } from '../components/LeftSidebar'
import { RightSidebar } from '../components/RightSidebar'
import { joinClasses } from '../components/IconButton'

interface MainLayoutProps {
  navItems: NavItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  onSignOut: () => void
  children: ReactNode
}

export function MainLayout({
  navItems,
  activeSection,
  onSectionChange,
  onSignOut,
  children,
}: MainLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true)
  const [isRightSidebarExpanded, setIsRightSidebarExpanded] = useState(false)

  const handleRightSidebarExpandChange = (isExpanded: boolean) => {
    setIsRightSidebarExpanded(isExpanded)
    if (isExpanded) {
      setIsSidebarExpanded(false)
    }
  }

  const handleLeftSidebarExpandChange = (isExpanded: boolean | ((prev: boolean) => boolean)) => {
    setIsSidebarExpanded((prev) => {
      const next = typeof isExpanded === 'function' ? isExpanded(prev) : isExpanded
      if (next) {
        setIsRightSidebarExpanded(false)
      }
      return next
    })
  }

  return (
    <main className="min-h-screen bg-[var(--brand-surface)] text-[var(--brand-color)]">
      <LeftSidebar
        navItems={navItems}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isSidebarExpanded={isSidebarExpanded}
        setIsSidebarExpanded={handleLeftSidebarExpandChange}
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
        onExpandChange={handleRightSidebarExpandChange}
        onSignOut={onSignOut}
      />
    </main>
  )
}
