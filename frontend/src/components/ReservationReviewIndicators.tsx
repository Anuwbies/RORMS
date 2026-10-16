import { CheckIcon, MinusCircleIcon, QuestionIcon } from './Icons'

interface ReservationReviewIndicatorsProps {
  deanRecommend?: boolean
  registrarRecommend?: boolean
  universityAdministratorRecommend?: boolean
  status?: string
}

export function ReservationReviewIndicators({
  deanRecommend,
  registrarRecommend,
  universityAdministratorRecommend,
  status,
}: ReservationReviewIndicatorsProps) {
  const indicators = [
    { role: 'Registrar', label: 'Registrar', value: registrarRecommend },
    { role: 'Dean', label: 'Dean', value: deanRecommend },
    { role: 'University Administrator', label: 'Univ. Admin', value: universityAdministratorRecommend },
  ]

  return (
    <div className="grid w-full grid-cols-3 gap-2" role="group" aria-label={status ? `Reservation status: ${status}` : 'Reservation review'}>
      {indicators.map(({ role, label, value }) => {
        const state = value === true ? 'Yes' : value === false ? 'No' : 'N/A'

        return (
          <span key={role} className="flex min-w-0 flex-col items-center gap-1 text-center" title={`${role}: ${state}${status ? `. Reservation status: ${status}` : ''}`} aria-label={`${role}: ${state}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${value === true ? 'bg-emerald-100 text-emerald-700' : value === false ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
              {value === true ? <CheckIcon className="h-4 w-4" /> : value === false ? <MinusCircleIcon className="h-4 w-4" /> : <QuestionIcon className="h-4 w-4" />}
            </span>
            <span className="text-[0.65rem] font-semibold text-slate-500">{label}</span>
          </span>
        )
      })}
    </div>
  )
}
