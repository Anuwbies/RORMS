import type { BuildingScheduleUsage as Usage } from '../utils/buildingScheduleUsage'
import { ScheduleUsageBar } from './ScheduleUsageBar'

interface BuildingScheduleUsageProps {
  usage?: Usage
  term: string
  isLoading: boolean
  hasError: boolean
  colorIndexes: Readonly<Record<string, number>>
}

export function BuildingScheduleUsage({ usage, term, isLoading, hasError, colorIndexes }: BuildingScheduleUsageProps) {
  const total = usage?.totalPercent || 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-transform hover:scale-[1.005]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-700" title={`Available room schedule usage · ${term}`}>
            <span className="font-bold">Available room schedule usage</span>
            <span className="text-slate-500"> · {term}</span>
          </p>
        </div>
        <p className="shrink-0 text-xl font-semibold text-slate-800">
          {isLoading || hasError ? '—' : `${Math.round(total)}%`}
        </p>
      </div>
      <ScheduleUsageBar usage={usage} isLoading={isLoading} hasError={hasError} colorIndexes={colorIndexes} label="Scheduled building room usage" />
    </div>
  )
}
