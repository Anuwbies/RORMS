import { type ComponentType, useState, useRef } from 'react'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  type IconProps,
} from './Icons'
import { IconButton, joinClasses } from './IconButton'

export type DashboardSection =
  | 'dashboard'
  | 'academicCalendar'
  | 'buildingsRooms'
  | 'members'
  | 'departments'
  | 'departmentSchedules'
  | 'myDepartment'
  | 'reports'
  | 'analytics'
  | 'mySchedule'
  | 'manageReservations'
  | 'reserveRoom'
  | 'myReservations'

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
  onReorder?: (items: NavItem[]) => void
}

export function LeftSidebar({
  navItems,
  activeSection,
  onSectionChange,
  isSidebarOpen,
  setIsSidebarOpen,
  isSidebarExpanded,
  setIsSidebarExpanded,
  onReorder,
}: LeftSidebarProps) {
  const [dragState, setDragState] = useState<{
    index: number
    startY: number
    deltaY: number
    itemHeight: number
    stepHeight: number
    itemTops: number[]
  } | null>(null)
  
  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  const listRef = useRef<HTMLElement>(null)

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    if (!isSidebarExpanded || !onReorder) return
    const target = e.target as HTMLElement
    if (!target.closest('.drag-handle')) return

    // Don't prevent default here to allow clicking, but we will capture the pointer
    e.currentTarget.setPointerCapture(e.pointerId)
    
    if (!listRef.current) return
    const itemElements = Array.from(listRef.current.children) as HTMLElement[]
    const itemTops = itemElements.map(el => el.getBoundingClientRect().top)
    const itemHeight = itemElements[0].getBoundingClientRect().height
    const stepHeight = itemElements.length > 1 ? itemTops[1] - itemTops[0] : itemHeight

    setDragState({
      index,
      startY: e.clientY,
      deltaY: 0,
      itemHeight,
      stepHeight,
      itemTops
    })

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      
      const deltaY = moveEvent.clientY - ds.startY
      
      const firstTop = ds.itemTops[0]
      const lastTop = ds.itemTops[ds.itemTops.length - 1]
      const draggedOriginalTop = ds.itemTops[ds.index]
      
      const minDelta = firstTop - draggedOriginalTop
      const maxDelta = lastTop - draggedOriginalTop
      const clampedDeltaY = Math.max(minDelta, Math.min(deltaY, maxDelta))

      setDragState({ ...ds, deltaY: clampedDeltaY })
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      
      const ds = dragStateRef.current
      if (!ds) return
      
      const isClick = Math.abs(ds.deltaY) < 5
      
      if (!isClick) {
        const draggedOriginalTop = ds.itemTops[ds.index]
        const draggedVisualCenter = draggedOriginalTop + ds.deltaY + ds.itemHeight / 2
        
        let newIndex = ds.index
        let minDistance = Infinity
        for (let i = 0; i < ds.itemTops.length; i++) {
          const targetCenter = ds.itemTops[i] + ds.itemHeight / 2
          const dist = Math.abs(draggedVisualCenter - targetCenter)
          if (dist < minDistance) {
            minDistance = dist
            newIndex = i
          }
        }
        
        if (newIndex !== ds.index) {
          const newItems = [...navItems]
          const [moved] = newItems.splice(ds.index, 1)
          newItems.splice(newIndex, 0, moved)
          onReorder(newItems)
        }
      }
      
      setDragState(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const getDragStyle = (index: number) => {
    if (!dragState) return {}
    const { index: dragIndex, deltaY, itemHeight, stepHeight, itemTops } = dragState
    
    if (index === dragIndex) {
      return {
        transform: `translateY(${deltaY}px) scale(1.05)`,
        zIndex: 50,
        transition: 'none'
      }
    }
    
    const dragOriginalTop = itemTops[dragIndex]
    const dragTop = dragOriginalTop + deltaY
    const dragBottom = dragTop + itemHeight
    const thisCenter = itemTops[index] + itemHeight / 2
    
    let shift = 0
    if (deltaY > 0 && index > dragIndex && thisCenter < dragBottom) {
      shift = -stepHeight
    } else if (deltaY < 0 && index < dragIndex && thisCenter > dragTop) {
      shift = stepHeight
    }
    
    return {
      transform: `translateY(${shift}px)`,
      transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
    }
  }

  return (
    <>
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.2)] lg:hidden cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={joinClasses(
          'fixed inset-y-0 left-0 z-40 flex overflow-y-auto bg-[var(--brand-surface)] transition-all duration-200 ease-out lg:translate-x-0',
          'border-r-2 border-t-0 border-b-0 border-l-0 border-[var(--brand-color)]/55 shadow-[0_18px_48px_rgba(0,0,0,0.12)] backdrop-blur-[0.125rem]',
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
              isSidebarExpanded ? 'px-5 py-5' : 'px-2.5 py-5',
            )}
          >
            <div
              className={joinClasses(
                'flex items-center gap-3',
                isSidebarExpanded ? 'justify-between' : 'flex-col justify-center gap-4',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onSectionChange('dashboard')
                  setIsSidebarOpen(false)
                }}
                title="Go to Dashboard"
                className={joinClasses(
                  'flex min-w-0 items-center gap-2 text-left cursor-pointer group focus:outline-none',
                  !isSidebarExpanded && 'order-2',
                )}
              >
                <img
                  src="/logo2.png"
                  alt="Room Track logo"
                  className={joinClasses(
                    'shrink-0 object-cover transition-transform group-hover:scale-105',
                    isSidebarExpanded ? 'h-12 w-12' : 'h-10 w-10',
                  )}
                />

                {isSidebarExpanded && (
                  <div className="w-[10.625rem] shrink-0 overflow-hidden">
                    <h1 className="text-[0.9375rem] font-medium leading-tight tracking-tight text-black group-hover:text-[var(--brand-color)] transition-colors">
                      <span className="block whitespace-nowrap">Phinma UPANG Room</span>
                      <span className="block whitespace-nowrap">Management System</span>
                    </h1>
                  </div>
                )}
              </button>

              {isSidebarExpanded ? (
                <IconButton
                  label="Collapse sidebar"
                  className="h-8 w-8 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100 cursor-pointer"
                  onClick={() => setIsSidebarExpanded(false)}
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </IconButton>
              ) : (
                <IconButton
                  label="Expand sidebar"
                  className="order-1 h-8 w-8 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-100 cursor-pointer"
                  onClick={() => setIsSidebarExpanded(true)}
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </IconButton>
              )}
            </div>

            <button
              type="button"
              aria-label="Close navigation"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 lg:hidden cursor-pointer"
              onClick={() => setIsSidebarOpen(false)}
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <nav
            ref={listRef}
            className={joinClasses(
              'flex-1 space-y-1 bg-[var(--card-surface)] transition-all duration-200 relative',
              isSidebarExpanded ? 'px-3' : 'px-2',
            )}
          >
            {navItems.map((item, index) => {
              const isActive = item.id === activeSection
              const isDragging = dragState?.index === index

              return (
                <div
                  key={item.id}
                  style={getDragStyle(index)}
                  className={joinClasses(
                    'group flex w-full items-center gap-3 text-left text-base font-medium transition-colors duration-200 cursor-pointer',
                    isSidebarExpanded ? 'h-12 px-3.5' : 'h-12 justify-center',
                    isActive
                      ? 'rounded-xl bg-[#e3edda] text-[#526f34]'
                      : 'text-gray-600 hover:text-black',
                    isDragging ? 'opacity-90' : ''
                  )}
                  onClick={(e) => {
                    // Prevent navigation if we are actively dragging
                    if (dragState && Math.abs(dragState.deltaY) > 5) {
                      e.preventDefault()
                      return
                    }
                    // Prevent navigation if clicking the drag handle when expanded
                    if (isSidebarExpanded) {
                      const target = e.target as HTMLElement
                      if (target.closest('.drag-handle')) {
                        e.preventDefault()
                        return
                      }
                    }
                    onSectionChange(item.id)
                    setIsSidebarOpen(false)
                  }}
                >
                  <div 
                    className={joinClasses(
                      "drag-handle flex items-center justify-center h-full touch-none",
                      isSidebarExpanded ? "cursor-grab active:cursor-grabbing" : ""
                    )}
                    onPointerDown={(e) => handlePointerDown(e, index)}
                  >
                    <item.icon
                      className={joinClasses(
                        'h-6 w-6 shrink-0 transition-transform duration-200 group-hover:scale-110',
                        isActive ? 'text-[#526f34]' : 'text-gray-600 group-hover:text-black',
                      )}
                    />
                  </div>
                  {isSidebarExpanded && (
                    <span className="flex-1 transition-all duration-200 origin-left group-hover:scale-105 pointer-events-none select-none">
                      {item.label}
                    </span>
                  )}
                </div>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
