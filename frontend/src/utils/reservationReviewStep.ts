export const RESERVATION_REVIEW_STEPS = ['Registrar', 'Dean', 'University Administrator'] as const

export type ReservationReviewStep = typeof RESERVATION_REVIEW_STEPS[number]

interface ReservationReviewProgress {
  status: string
  registrarRecommend?: boolean
  deanRecommend?: boolean
  declinedByRole?: string
}

export function reservationReviewStep(reservation: ReservationReviewProgress): ReservationReviewStep {
  if (reservation.status === 'Declined') {
    if (reservation.declinedByRole === 'Registrar') return 'Registrar'
    if (reservation.declinedByRole === 'Dean') return 'Dean'
    if (reservation.declinedByRole === 'University Administrator') return 'University Administrator'
  }

  if (reservation.status === 'Approved' || reservation.status === 'Completed') return 'University Administrator'
  if (reservation.registrarRecommend !== true) return 'Registrar'
  return reservation.deanRecommend === true ? 'University Administrator' : 'Dean'
}
