import { useState, type PointerEvent } from 'react'
import type { BuildingScheduleUsage } from '../utils/buildingScheduleUsage'

interface ScheduleUsageBarProps {
  usage?: BuildingScheduleUsage
  isLoading: boolean
  hasError: boolean
  colorIndexes: Readonly<Record<string, number>>
  label: string
  compact?: boolean
  emptyMessage?: string
  isExcluded?: boolean
}

const colors = ['bg-[#62853e]', 'bg-sky-600', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-600', 'bg-indigo-500']

export function ScheduleUsageBar({ usage, isLoading, hasError, colorIndexes, label, compact = false, emptyMessage = 'No scheduled room hours', isExcluded = false }: ScheduleUsageBarProps) {
  const departments = usage?.departments || []
  const color = (name: string) => colors[(colorIndexes[name] || 0) % colors.length]
  const [hovered, setHovered] = useState<{ name: string; percent: number; left: number } | null>(null)
  const canShowBreakdown = !hasError && !isLoading && !isExcluded && departments.length > 0

  const showDepartmentAtPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!canShowBreakdown) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const offset = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
    const position = offset / bounds.width * 100
    let end = 0
    const department = departments.find(item => {
      end += item.percent
      return position <= end
    })
    setHovered(department ? {
      name: department.name,
      percent: department.percent,
      left: Math.max(Math.min(offset, bounds.width - 72), Math.min(72, bounds.width / 2)),
    } : null)
  }

  return (
    <>
      <div className={`relative w-full ${compact ? 'mt-2' : 'mt-3'}`} onClick={event => event.stopPropagation()}>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasError || isLoading || isExcluded ? undefined : Math.round(usage?.totalPercent || 0)}
          aria-valuetext={canShowBreakdown ? `${Math.round(usage?.totalPercent || 0)}% scheduled; ${departments.map(department => `${department.name} ${department.percent.toFixed(1)}%`).join(', ')}` : undefined}
          tabIndex={canShowBreakdown ? 0 : undefined}
          onPointerMove={showDepartmentAtPointer}
          onPointerDown={showDepartmentAtPointer}
          onPointerLeave={() => setHovered(null)}
          onBlur={() => setHovered(null)}
          className={`flex w-full overflow-hidden rounded-full bg-slate-200 ${compact ? 'h-2' : 'h-4'}`}
        >
          {canShowBreakdown && departments.map(department => (
            <div
              key={department.name}
              className={`${color(department.name)} h-full shrink-0`}
              style={{ width: `${department.percent}%` }}
            />
          ))}
        </div>
        {hovered && canShowBreakdown && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full z-50 mb-2 max-w-36 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-xs font-semibold text-white shadow-lg"
            style={{ left: hovered.left }}
          >
            {hovered.name} · {hovered.percent.toFixed(1)}%
          </div>
        )}
      </div>
      {isExcluded ? (
        <p className="mt-2 text-xs text-slate-500">{emptyMessage}</p>
      ) : hasError ? (
        <p className="mt-2 text-xs text-rose-600">Schedule usage is unavailable.</p>
      ) : isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Loading schedules…</p>
      ) : !departments.length ? (
        <p className="mt-2 text-xs text-slate-500">{emptyMessage}</p>
      ) : null}
    </>
  )
}
