import { type ComponentType } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  type IconProps,
} from './Icons'
import { IconButton, joinClasses } from './IconButton'
import { leftSidebarOutlineClass, sidebarDividerClass } from './sidebarStyles'

export type DashboardSection = 'dashboard' | 'buildingsRooms' | 'users'

export interface NavItem {
  id: DashboardSection
  label: string
  eyebrow: string
  description: string
  icon: ComponentType<IconProps>
}

interface LeftSidebarProps {
  navItems: NavItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  isSidebarOpen: boolean
  setIsSidebarOpen: (isOpen: boolean) => void
  isSidebarExpanded: boolean
  setIsSidebarExpanded: (isExpanded: boolean) => void
}

export function LeftSidebar({
  navItems,
  activeSection,
  onSectionChange,
  isSidebarOpen,
  setIsSidebarOpen,
  isSidebarExpanded,
  setIsSidebarExpanded,
}: LeftSidebarProps) {
  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.2)] lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={joinClasses(
          'fixed inset-y-0 left-0 z-40 flex overflow-y-auto bg-[var(--brand-surface)] transition-all duration-200 ease-out lg:translate-x-0',
          leftSidebarOutlineClass,
          isSidebarOpen
            ? 'translate-x-0'
            : '-translate-x-full',
          isSidebarExpanded ? 'w-80' : 'w-20',
        )}
      >
        <div className="flex min-h-full w-full flex-col">
          <div
            className={joinClasses(
              'relative bg-[var(--card-surface)] transition-all duration-200',
              sidebarDividerClass,
              isSidebarExpanded ? 'px-5 py-3' : 'px-2.5 py-2.5',
            )}
          >
            <div
              className={joinClasses(
                'flex items-center gap-3',
                isSidebarExpanded ? 'justify-between' : 'flex-col justify-center gap-4',
              )}
            >
              <div
                className={joinClasses(
                  'flex min-w-0 items-center gap-2',
                  !isSidebarExpanded && 'order-2',
                )}
              >
                <img
                  src="/logo2.png"
                  alt="RORMS Logo"
                  className={joinClasses(
                    'shrink-0 object-cover',
                    isSidebarExpanded ? 'h-12 w-12' : 'h-10 w-10',
                  )}
                />

                {isSidebarExpanded && (
                  <div className="w-[170px] shrink-0 overflow-hidden">
                    <h1 className="text-[15px] font-medium leading-tight tracking-tight text-black">
                      <span className="block whitespace-nowrap">Registrar Office Room</span>
                      <span className="block whitespace-nowrap">Management System</span>
                    </h1>
                  </div>
                )}
              </div>

              {isSidebarExpanded ? (
                <IconButton
                  label="Collapse sidebar"
                  className="h-8 w-8 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                  onClick={() => setIsSidebarExpanded(false)}
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </IconButton>
              ) : (
                <IconButton
                  label="Expand sidebar"
                  className="order-1 h-8 w-8 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
                  onClick={() => setIsSidebarExpanded(true)}
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </IconButton>
              )}
            </div>

            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <nav
            className={joinClasses(
              'flex-1 space-y-1 bg-[var(--card-surface)] py-4 transition-all duration-200',
              isSidebarExpanded ? 'px-3' : 'px-2',
            )}
          >
            {navItems.map((item) => {
              const isActive = item.id === activeSection

              return (
                <button
                  key={item.id}
                  type="button"
                  title={!isSidebarExpanded ? item.label : undefined}
                  onClick={() => {
                    onSectionChange(item.id)
                    setIsSidebarOpen(false)
                  }}
                  className={joinClasses(
                    'group flex w-full items-center gap-3 text-left text-base font-semibold transition-all duration-200',
                    isSidebarExpanded ? 'h-12 px-3.5' : 'h-12 justify-center',
                    isActive
                      ? 'rounded-md bg-[var(--brand-color)]/20 text-[var(--brand-color)]'
                      : 'text-gray-700 hover:text-black',
                  )}
                >
                  <item.icon
                    className={joinClasses(
                      'h-6 w-6 shrink-0 transition-transform duration-200 group-hover:scale-110',
                      isActive ? 'text-[var(--brand-color)]' : 'text-gray-500 group-hover:text-black',
                    )}
                  />
                  {isSidebarExpanded && (
                    <span className="flex-1 transition-all duration-200 origin-left group-hover:scale-105">
                      {item.label}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
