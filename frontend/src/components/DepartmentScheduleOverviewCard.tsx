import { ChevronRightIcon } from './Icons'

interface DepartmentScheduleOverviewCardProps {
  term: string
  total: number
  plotted: number
  drafted: number
  isLoading: boolean
  hasError: boolean
  onOpenDepartment: () => void
}

export function DepartmentScheduleOverviewCard({ term, total, plotted, drafted, isLoading, hasError, onOpenDepartment }: DepartmentScheduleOverviewCardProps) {
  const plottedPercent = total > 0 ? Math.round(plotted / total * 100) : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/50 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 leading-tight">Department Schedule</h3>
          <p className="text-xs text-gray-500 mt-0.5">Current term · {term}</p>
        </div>
        <button type="button" onClick={onOpenDepartment} className="group flex shrink-0 cursor-pointer items-center gap-1 text-xs font-bold text-slate-400 hover:text-[var(--brand-color)]">
          <span>Department Hub</span>
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
      <div className="p-4 sm:p-5">
        {hasError ? (
          <p className="text-sm text-rose-600">Department schedule is unavailable.</p>
        ) : isLoading ? (
          <p className="text-sm text-slate-500">Loading department schedule…</p>
        ) : total === 0 ? (
          <p className="text-sm text-slate-500">No classes are saved for this department in the active term.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Total classes</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{total}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-700">Plotted</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">{plotted}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700">Draft</p>
                <p className="mt-1 text-xl font-bold text-amber-700">{drafted}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
              <span>Plotting progress</span>
              <span>{plottedPercent}%</span>
            </div>
            <div role="progressbar" aria-label="Department schedule plotting progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={plottedPercent} className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[var(--brand-color)]" style={{ width: `${plottedPercent}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
