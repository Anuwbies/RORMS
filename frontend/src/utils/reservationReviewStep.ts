export const RESERVATION_REVIEW_STEPS = ['Dean', 'Registrar', 'University Administrator', 'Admin'] as const

export type ReservationReviewStep = typeof RESERVATION_REVIEW_STEPS[number]

interface ReservationReviewProgress {
  status: string
  registrarRecommend?: boolean
  deanRecommend?: boolean
  declinedByRole?: string
  autoApproved?: boolean
  approvedByRole?: string
}

export function reservationReviewStep(reservation: ReservationReviewProgress): ReservationReviewStep {
  if (reservation.status === 'Declined') {
    if (reservation.declinedByRole === 'Registrar') return 'Registrar'
    if (reservation.declinedByRole === 'Dean') return 'Dean'
    if (reservation.declinedByRole === 'University Administrator') return 'University Administrator'
  }

  if (reservation.autoApproved === true) {
    return reservation.approvedByRole === 'University Administrator' ? 'University Administrator' : 'Admin'
  }
  if (reservation.status === 'Approved' || reservation.status === 'Completed') return 'University Administrator'
  if (reservation.deanRecommend !== true) return 'Dean'
  return reservation.registrarRecommend === true ? 'University Administrator' : 'Registrar'
}
