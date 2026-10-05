export type NotificationType =
  | 'booking_approved'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'booking_reminder'
  | 'building_added'
  | 'building_updated'
  | 'room_added'
  | 'room_updated'
  | 'room_status_changed'
  | 'department_invited'
  | 'department_member_removed'
  | 'department_invitation_accepted'
  | 'department_reinvitation_accepted'
  | 'member_department_assigned'
  | 'member_role_changed'
  | 'academic_year_changed'
  | 'academic_phase_changed'

export interface NotificationItem {
  id: string
  title: string
  message: string
  createdAt: string
  isRead: boolean
  type: NotificationType
}
