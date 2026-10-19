import { CheckIcon, CloseIcon, MinusCircleIcon, QuestionIcon } from './Icons'

interface ReservationReviewIndicatorsProps {
  deanRecommend?: boolean
  registrarRecommend?: boolean
  universityAdministratorRecommend?: boolean
  status?: string
  declinedByRole?: string
  autoProcessed?: boolean
}

export function ReservationReviewIndicators({
  deanRecommend,
  registrarRecommend,
  universityAdministratorRecommend,
  status,
  declinedByRole,
  autoProcessed,
}: ReservationReviewIndicatorsProps) {
  const fullyApproved = status === 'Approved' || status === 'Completed' || status === 'Needs Evidence'
  const declinedRole = status === 'Declined' && !autoProcessed
    ? declinedByRole || (registrarRecommend !== true && deanRecommend !== true ? 'Registrar'
      : registrarRecommend === true && deanRecommend !== true ? 'Dean'
      : registrarRecommend === true && deanRecommend === true ? 'University Administrator' : '')
    : ''
  const registrarApproved = fullyApproved || declinedRole === 'Dean' || declinedRole === 'University Administrator'
    || (registrarRecommend === true && declinedRole !== 'Registrar')
  const deanApproved = fullyApproved || declinedRole === 'University Administrator'
    || (registrarApproved && deanRecommend === true && declinedRole !== 'Dean')
  const administratorApproved = fullyApproved || (status !== 'Pending' && status !== 'Declined'
    && deanApproved && universityAdministratorRecommend === true)
  const indicators = [
    { role: 'Registrar', label: 'Registrar', value: registrarRecommend === undefined && !fullyApproved && !declinedRole ? undefined : registrarApproved },
    { role: 'Dean', label: 'Dean', value: deanRecommend === undefined && !fullyApproved && !declinedRole ? undefined : deanApproved },
    { role: 'University Administrator', label: 'Univ. Admin', value: administratorApproved },
  ]

  return (
    <div className="grid w-full grid-cols-3 gap-2" role="group" aria-label={status ? `Reservation status: ${status}` : 'Reservation review'}>
      {indicators.map(({ role, label, value }) => {
        const declined = declinedRole === role
        const state = declined ? 'Declined' : value === true ? 'Yes' : value === false ? 'No' : 'N/A'

        return (
          <span key={role} className="flex min-w-0 flex-col items-center gap-1 text-center" title={`${role}: ${state}${status ? `. Reservation status: ${status}` : ''}`} aria-label={`${role}: ${state}`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full ${declined ? 'bg-rose-100 text-rose-700' : value === true ? 'bg-emerald-100 text-emerald-700' : value === false ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
              {declined ? <CloseIcon className="h-4 w-4" /> : value === true ? <CheckIcon className="h-4 w-4" /> : value === false ? <MinusCircleIcon className="h-4 w-4" /> : <QuestionIcon className="h-4 w-4" />}
            </span>
            <span className="text-[0.65rem] font-semibold text-slate-500">{label}</span>
          </span>
        )
      })}
    </div>
  )
}
