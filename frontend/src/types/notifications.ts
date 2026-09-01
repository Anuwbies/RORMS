export type NotificationType =
  | 'booking_created'
  | 'booking_approved'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'system'
  | 'system_added'
  | 'invitation'
  | 'role_assigned'
  | 'schedule_plotted'
  | 'schedule_revised'
  | 'schedule_returned'
  | 'department_removed'
  | 'phase_changed'

export interface NotificationItem {
  id: string
  title: string
  message: string
  createdAt: string
  isRead: boolean
  type: NotificationType
}

export function getNotificationConfig(type: NotificationType) {
  switch (type) {
    case 'booking_created':
    case 'system_added':
    case 'schedule_revised':
    case 'phase_changed':
      return {
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
        border: 'bg-blue-500',
      }
    case 'booking_approved':
    case 'schedule_plotted':
      return {
        color: 'text-emerald-600 dark:text-emerald-300',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        border: 'bg-emerald-500',
      }
    case 'booking_rejected':
    case 'department_removed':
      return {
        color: 'text-rose-600 dark:text-rose-300',
        bg: 'bg-rose-50 dark:bg-rose-500/10',
        border: 'bg-rose-500',
      }
    case 'booking_cancelled':
    case 'schedule_returned':
    case 'role_assigned':
      return {
        color: 'text-amber-600 dark:text-amber-300',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'bg-amber-500',
      }
    case 'booking_completed':
      return {
        color: 'text-slate-600 dark:text-slate-300',
        bg: 'bg-slate-50 dark:bg-slate-500/10',
        border: 'bg-slate-500',
      }
    case 'invitation':
      return {
        color: 'text-[var(--brand-color)]',
        bg: 'bg-[var(--brand-color)]/10',
        border: 'bg-[var(--brand-color)]',
      }
    case 'system':
    default:
      return {
        color: 'text-purple-600 dark:text-purple-300',
        bg: 'bg-purple-50 dark:bg-purple-500/10',
        border: 'bg-purple-500',
      }
  }
}

// TODO: Remove this mock data once Firestore integration is complete
export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Reservation approved',
    message: 'Your reservation for Meeting Room A has been approved.',
    createdAt: new Date().toISOString(),
    isRead: false,
    type: 'booking_approved',
  },
  {
    id: 'notif-2',
    title: 'Reservation declined',
    message: 'Your request for Computer Lab 2 was declined due to a schedule conflict.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'booking_rejected',
  },
  {
    id: 'notif-3',
    title: 'Reservation completed',
    message: 'Your session in the Library Study Room has concluded.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    type: 'booking_completed',
  },
  {
    id: 'notif-4',
    title: 'Reservation cancelled',
    message: 'The reservation for the AVR has been cancelled.',
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    type: 'booking_cancelled',
  },
  {
    id: 'notif-5',
    title: 'New building added',
    message: 'The new Science & Technology Building has been added to the system.',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'system_added',
  },
  {
    id: 'notif-6',
    title: 'New room available',
    message: 'Computer Lab 3 has been added and is now available for scheduling.',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'system_added',
  },
  {
    id: 'notif-7',
    title: 'Department Invitation',
    message: 'You have been invited to join the College of Information Technology as an Instructor.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'invitation',
  },
  {
    id: 'notif-8',
    title: 'Role Assignment',
    message: 'You have been assigned as the Dean of the College of Engineering.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'role_assigned',
  },
  {
    id: 'notif-9',
    title: 'Schedule Plotted',
    message: 'The department schedule for the College of Information Technology has been successfully plotted.',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'schedule_plotted',
  },
  {
    id: 'notif-10',
    title: 'Schedule Revised',
    message: 'A revision has been made to the department schedule for College of Engineering.',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'schedule_revised',
  },
  {
    id: 'notif-11',
    title: 'Schedule Returned',
    message: 'The drafted schedule has been returned for further adjustments. Please review the comments.',
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'schedule_returned',
  },
  {
    id: 'notif-12',
    title: 'Removed from Department',
    message: 'You have been removed from the College of Education department.',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'department_removed',
  },
  {
    id: 'notif-13',
    title: 'Phase Changed: Plotting',
    message: 'The active semester (SY 2026-2027, 1st Semester) phase has been changed to Plotting.',
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'phase_changed',
  }
]
