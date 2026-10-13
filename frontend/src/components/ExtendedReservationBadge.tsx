interface ExtendedReservationBadgeProps {
  requestType?: 'Standard' | 'Extended'
}

export function ExtendedReservationBadge({ requestType }: ExtendedReservationBadgeProps) {
  if (requestType !== 'Extended') return null
  return <span className="inline-flex self-start rounded-md py-0.5 text-[0.625rem] font-bold text-sky-700">Extended reservation</span>
}
