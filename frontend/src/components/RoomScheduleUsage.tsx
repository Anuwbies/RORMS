import type { Room } from '../types/room'
import type { BuildingScheduleUsage } from '../utils/buildingScheduleUsage'
import { ScheduleUsageBar } from './ScheduleUsageBar'

interface RoomScheduleUsageProps {
  room: Room
  usage?: BuildingScheduleUsage
  isLoading: boolean
  hasError: boolean
  colorIndexes: Readonly<Record<string, number>>
}

export function RoomScheduleUsage({ room, usage, isLoading, hasError, colorIndexes }: RoomScheduleUsageProps) {
  const isExcluded = room.status !== 'Available'

  return (
    <div className="w-full border-t border-gray-200 px-3.5 pb-3.5 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">Schedule usage</span>
        <span className="text-sm font-semibold text-slate-800">
          {isExcluded || isLoading || hasError ? '—' : `${Math.round(usage?.totalPercent || 0)}%`}
        </span>
      </div>
      <ScheduleUsageBar
        usage={usage}
        isLoading={isLoading}
        hasError={hasError}
        isExcluded={isExcluded}
        emptyMessage={isExcluded ? 'Excluded from usage' : 'No scheduled room hours'}
        colorIndexes={colorIndexes}
        label={`Scheduled usage for ${room.name}`}
        compact
      />
    </div>
  )
}
