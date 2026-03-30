import { type ComponentType } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  type IconProps,
} from './Icons'
import { IconButton, joinClasses } from './IconButton'

export type DashboardSection = 'overview' | 'rooms' | 'requests' | 'schedule' | 'settings'

export interface NavItem {
  id: DashboardSection
  label: string
  eyebrow: string
  description: string
  icon: ComponentType<IconProps>
}

interface SidebarProps {
  navItems: NavItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  isSidebarOpen: boolean
  setIsSidebarOpen: (isOpen: boolean) => void
  isSidebarExpanded: boolean
  setIsSidebarExpanded: (isExpanded: boolean) => void
}

export function Sidebar({
  navItems,
  activeSection,
  onSectionChange,
  isSidebarOpen,
  setIsSidebarOpen,
  isSidebarExpanded,
  setIsSidebarExpanded,
}: SidebarProps) {
  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[rgba(36,49,22,0.42)] lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={joinClasses(
          'fixed inset-y-0 left-0 z-40 flex overflow-y-auto border-r border-[color:rgba(18,26,10,0.22)] bg-[#3a4f24] transition-all duration-300 ease-out lg:translate-x-0',
          isSidebarOpen
            ? 'translate-x-0 shadow-[0_24px_60px_rgba(36,49,22,0.18)]'
            : '-translate-x-full lg:shadow-none',
          isSidebarExpanded ? 'w-80' : 'w-24',
        )}
      >
        <div className="flex min-h-full w-full flex-col">
          <div
            className={joinClasses(
              'relative border-b border-[color:rgba(36,49,22,0.12)] bg-[#f3a91f] transition-all duration-300',
              isSidebarExpanded ? 'px-5 py-3' : 'px-2.5 py-2.5',
            )}
          >
            {!isSidebarExpanded && (
              <div className="mb-4 flex justify-center">
                <IconButton
                  label="Expand sidebar"
                  className="text-[var(--brand-olive-deep)] hover:bg-[rgba(36,49,22,0.08)] hover:text-[var(--brand-olive-deep)]"
                  onClick={() => setIsSidebarExpanded(true)}
                >
                  <ChevronRightIcon className="h-7 w-7" />
                </IconButton>
              </div>
            )}

            <div
              className={joinClasses(
                'flex items-center gap-3',
                isSidebarExpanded ? 'justify-between' : 'justify-center',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/logo.png"
                  alt="RORMS Logo"
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />

                {isSidebarExpanded && (
                  <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight text-[var(--brand-olive-deep)]">
                      RORMS
                    </h1>
                  </div>
                )}
              </div>

              {isSidebarExpanded && (
                <IconButton
                  label="Collapse sidebar"
                  className="text-[var(--brand-olive-deep)] hover:bg-[rgba(36,49,22,0.08)] hover:text-[var(--brand-olive-deep)]"
                  onClick={() => setIsSidebarExpanded(false)}
                >
                  <ChevronLeftIcon className="h-7 w-7" />
                </IconButton>
              )}
            </div>

            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--brand-olive-deep)] transition hover:bg-[rgba(36,49,22,0.08)] hover:text-[var(--brand-olive-deep)] lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <nav
            className={joinClasses(
              'flex-1 space-y-1 bg-[#3a4f24] py-4 transition-all duration-300',
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
                    'group flex w-full items-center gap-3 text-left text-sm font-semibold transition-all duration-200',
                    isSidebarExpanded ? 'px-3 py-2.5' : 'justify-center p-2.5',
                    isActive
                      ? 'text-[var(--brand-gold)]'
                      : 'text-[#f6f1e6] hover:text-[var(--brand-gold)]',
                  )}
                >
                  <item.icon
                    className={joinClasses(
                      'h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110',
                      isActive ? 'text-[var(--brand-gold)]' : 'text-[#f6f1e6]',
                    )}
                  />
                  {isSidebarExpanded && <span className="flex-1">{item.label}</span>}
                </button>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
