import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { BellIcon, CameraIcon, ChevronLeftIcon, ChevronRightIcon, LogOutIcon, TrashIcon, UserIcon } from './Icons'
import { IconButton, joinClasses } from './IconButton'
import { rightSidebarOutlineClass, sidebarDividerClass } from './sidebarStyles'

type NotificationType =
  | 'booking_created'
  | 'booking_approved'
  | 'booking_rejected'
  | 'booking_cancelled'
  | 'system'

interface NotificationItem {
  id: string
  title: string
  message: string
  createdAt: string
  isRead: boolean
  type: NotificationType
}

interface RightSidebarProps {
  isExpanded: boolean
  onExpandChange: (isExpanded: boolean) => void
  onSignOut: () => void
}

const initialNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Room request received',
    message: 'A new registrar room request for Meeting Room A needs review before 3:00 PM.',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'booking_created',
  },
  {
    id: 'notif-2',
    title: 'Assignment approved',
    message: 'The revised allocation for Computer Lab 2 was approved and published to staff.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    isRead: false,
    type: 'booking_approved',
  },
  {
    id: 'notif-3',
    title: 'Schedule conflict flagged',
    message: 'Two overlapping reservations were detected for the registrar interview room.',
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    type: 'booking_rejected',
  },
  {
    id: 'notif-4',
    title: 'System summary ready',
    message: 'The weekly room utilization digest is ready for the registrar office to review.',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    isRead: true,
    type: 'system',
  },
]

function formatRelativeTime(timestamp: string) {
  const elapsedMs = Math.max(Date.now() - new Date(timestamp).getTime(), 0)
  const minutes = Math.max(1, Math.floor(elapsedMs / (60 * 1000)))

  if (minutes < 60) {
    return `${minutes}min ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getNotificationConfig(type: NotificationType) {
  switch (type) {
    case 'booking_created':
      return {
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
        border: 'bg-blue-500',
      }
    case 'booking_approved':
      return {
        color: 'text-emerald-600 dark:text-emerald-300',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
        border: 'bg-emerald-500',
      }
    case 'booking_rejected':
      return {
        color: 'text-red-600 dark:text-red-300',
        bg: 'bg-red-50 dark:bg-red-500/10',
        border: 'bg-red-500',
      }
    case 'booking_cancelled':
      return {
        color: 'text-amber-600 dark:text-amber-300',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
        border: 'bg-amber-500',
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

export function RightSidebar({
  isExpanded,
  onExpandChange,
  onSignOut,
}: RightSidebarProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false)
  const [isClearNotificationsModalOpen, setIsClearNotificationsModalOpen] = useState(false)
  const [userData, setUserData] = useState({
    fullName: 'No Name',
    email: 'example.up@phinmaed.com',
    profilePicture: ''
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubscribeDoc = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data()
            setUserData({
              fullName: data.fullName || 'No Name',
              email: data.email || 'example.up@phinmaed.com',
              profilePicture: data.profilePicture || ''
            })
            if (data.profilePicture) {
              setProfileImage(data.profilePicture)
            }
          }
        })
        return () => unsubscribeDoc()
      } else {
        setUserData({
          fullName: 'No Name',
          email: 'example.up@phinmaed.com',
          profilePicture: ''
        })
        setProfileImage(null)
      }
    })

    return () => unsubscribeAuth()
  }, [])

  const unreadCount = notifications.filter((notification) => !notification.isRead).length

  const toggleNotificationsEnabled = () => {
    setNotificationsEnabled((current) => !current)
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setProfileImage(typeof reader.result === 'string' ? reader.result : null)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const markAsRead = (notificationId: string) => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, isRead: true }
          : notification,
      ),
    )
  }

  const deleteNotification = (notificationId: string) => {
    setNotifications((currentNotifications) =>
      currentNotifications.filter((notification) => notification.id !== notificationId),
    )
  }

  const markAllAsRead = () => {
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        isRead: true,
      })),
    )
  }

  const clearNotifications = () => {
    setNotifications([])
  }

  const avatar = profileImage ? (
    <img
      src={profileImage}
      alt={userData.fullName}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <div
      className={joinClasses(
        'flex h-full w-full items-center justify-center rounded-full bg-primary-600 font-black uppercase text-white',
        isExpanded ? 'text-2xl' : 'text-[10px] tracking-tight',
      )}
    >
      <UserIcon className={isExpanded ? "h-12 w-12" : "h-5 w-5"} />
    </div>
  )

  return (
    <>
      {/* Sign Out Confirmation Modal */}
      {isSignOutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md relative">
              <h3 className="text-xl font-bold">Sign Out</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to sign out?</p>
            </div>
            
            <div className="p-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsSignOutModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignOutModalOpen(false)
                    onSignOut()
                  }}
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 hover:shadow-lg"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setIsSignOutModalOpen(false)} />
        </div>
      )}

      {/* Clear Notifications Confirmation Modal */}
      {isClearNotificationsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div 
            className="w-full max-w-sm rounded-md border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-rose-600 p-6 text-white rounded-t-md relative">
              <h3 className="text-xl font-bold">Clear All</h3>
              <p className="mt-1 text-sm text-white/80">Are you sure you want to clear all notifications?</p>
            </div>
            
            <div className="p-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsClearNotificationsModalOpen(false)}
                  className="flex-1 rounded-md border border-gray-200 bg-white py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearNotifications()
                    setIsClearNotificationsModalOpen(false)
                  }}
                  className="flex-1 rounded-md bg-rose-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-rose-700 hover:shadow-lg"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setIsClearNotificationsModalOpen(false)} />
        </div>
      )}

      <aside
        className={joinClasses(
          'fixed top-0 right-0 z-50 hidden h-full flex-col bg-[var(--brand-surface)] transition-all duration-200 ease-out xl:flex',
          rightSidebarOutlineClass,
          isExpanded ? 'w-80' : 'w-20',
        )}
      >
      <div
        className={joinClasses(
          'bg-[var(--card-surface)] shadow-none transition-all duration-200',
          sidebarDividerClass,
          isExpanded ? 'p-6' : 'px-2.5 py-2.5',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {isExpanded ? (
          <div className="relative flex flex-col items-center text-center">
            <div className="absolute top-0 left-0">
              <IconButton
                label="Collapse right sidebar"
                className="h-8 w-8 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                onClick={() => onExpandChange(false)}
              >
                <ChevronRightIcon className="h-5 w-5" />
              </IconButton>
            </div>

            <div className="group relative mb-4">
              <div className="relative h-24 w-24">
                <div className="h-24 w-24 overflow-hidden rounded-full ring-4 ring-primary-50 ring-offset-2 ring-offset-white dark:ring-primary-500/20 dark:ring-offset-secondary-900">
                  {avatar}
                </div>
                <div className="absolute right-0 bottom-0 z-10 h-6 w-6 rounded-full border-4 border-white bg-green-500 dark:border-secondary-900" />
                <button
                  type="button"
                  aria-label="Change profile picture"
                  title="Change profile picture"
                  className="absolute right-[-4px] bottom-[-4px] z-20 flex h-8 w-8 items-center justify-center rounded-full border border-secondary-200 bg-white text-secondary-600 shadow-sm transition-all hover:border-primary-100 hover:text-primary-600 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-300 dark:hover:border-primary-500/30 dark:hover:text-primary-300"
                  onClick={triggerFileInput}
                >
                  <CameraIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <h2 className="mb-1 text-lg font-bold tracking-tight text-secondary-900 dark:text-secondary-100">
              {userData.fullName}
            </h2>
            <p className="mb-4 text-sm text-secondary-500 dark:text-secondary-400">
              {userData.email}
            </p>

            <div className="flex w-full gap-2">
              <button
                type="button"
                aria-pressed={notificationsEnabled}
                className={joinClasses(
                  'group flex h-9 flex-1 items-center justify-center rounded-md border px-2 text-secondary-900 transition-colors',
                  notificationsEnabled
                    ? 'border-[var(--brand-color)]/30 bg-[var(--brand-color)]/10 text-[var(--brand-color)] hover:bg-[var(--brand-color)]/15'
                    : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15',
                )}
                onClick={toggleNotificationsEnabled}
              >
                <div className="flex items-center gap-1.5 scale-[1] origin-center">
                  <BellIcon
                    className={joinClasses(
                      'h-4 w-4 transition-colors',
                      notificationsEnabled
                        ? 'text-[var(--brand-color)]'
                        : 'text-red-500 group-hover:text-red-600 dark:text-red-300 dark:group-hover:text-red-200',
                    )}
                  />
                  <span className="font-bold leading-none tracking-tight text-[13px]">
                    Notifications
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="group flex h-9 flex-1 items-center justify-center rounded-md border border-secondary-200 bg-white px-2 text-secondary-900 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-100 dark:hover:border-red-500/20 dark:hover:bg-red-500/10 dark:hover:text-red-200"
                onClick={() => setIsSignOutModalOpen(true)}
              >
                <div className="flex items-center gap-1.5 scale-[1] origin-center">
                  <LogOutIcon className="h-4 w-4 text-red-500 transition-colors group-hover:text-red-600 dark:text-red-300 dark:group-hover:text-red-200" />
                  <span className="font-bold leading-none tracking-tight text-[13px]">
                    Sign Out
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4">
            <IconButton
              label="Expand right sidebar"
              className="order-1 h-8 w-8 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
              onClick={() => onExpandChange(true)}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </IconButton>

            <button
              type="button"
              aria-label="Expand right sidebar"
              className="order-2 flex h-10 w-10 scale-110 items-center justify-center rounded-full bg-white transition-transform hover:scale-115"
              onClick={() => onExpandChange(true)}
            >
              <div className="h-8 w-8 overflow-hidden rounded-full">
                {avatar}
              </div>
            </button>
          </div>
        )}
      </div>

      {!isExpanded && (
        <div className="flex flex-1 flex-col bg-[var(--card-surface)] px-2 py-4 transition-all duration-200">
          <div className="flex flex-col space-y-1">
            <button
              type="button"
              aria-label="Open notifications"
              className={joinClasses(
                'group relative flex h-12 w-full items-center justify-center rounded-md transition-all duration-200',
                'text-gray-500 hover:bg-[var(--brand-color)]/20 hover:text-[var(--brand-color)]',
              )}
              onClick={() => onExpandChange(true)}
            >
              <BellIcon
                className={joinClasses(
                  'h-6 w-6 transition-all duration-200 group-hover:scale-110',
                  'text-gray-500 group-hover:text-[var(--brand-color)]',
                )}
              />
              {notificationsEnabled && unreadCount > 0 && (
                <span className="absolute top-2.5 right-3 h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </button>

            <button
              type="button"
              aria-label="Sign out"
              className="group flex h-12 w-full items-center justify-center rounded-md transition-all duration-200 hover:bg-red-500/10"
              onClick={() => setIsSignOutModalOpen(true)}
            >
              <LogOutIcon className="h-6 w-6 text-red-500 transition-all duration-200 group-hover:scale-110 group-hover:text-red-600" />
            </button>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="flex min-h-0 flex-1 flex-col bg-[var(--card-surface)] transition-all duration-200">
          <div className="flex items-center justify-between p-6 pb-2">
            <h3 className="text-sm font-black uppercase tracking-widest text-secondary-900 dark:text-secondary-100">
              Notifications
            </h3>
            <span
              className={joinClasses(
                'min-w-[32px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold transition-colors',
                notificationsEnabled
                  ? unreadCount > 0
                    ? 'bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
                    : 'bg-secondary-50 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-200'
                  : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-200',
              )}
              aria-label={
                notificationsEnabled
                  ? `${unreadCount} unread notifications`
                  : 'Notifications off'
              }
              role="status"
            >
              {notificationsEnabled ? unreadCount : 'Off'}
            </span>
          </div>

          <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
            {notifications.map((notification) => {
              const config = getNotificationConfig(notification.type)

              return (
                <div
                  key={notification.id}
                  role="button"
                  tabIndex={0}
                  className={joinClasses(
                    'group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-300 hover:shadow-md cursor-pointer',
                    config.bg,
                    config.color,
                    'border-secondary-100 dark:border-secondary-800',
                    !notification.isRead && 'ring-1 ring-primary-500/20 shadow-sm',
                  )}
                  onClick={() => markAsRead(notification.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      markAsRead(notification.id)
                    }
                  }}
                >
                  <div className={joinClasses('absolute top-0 bottom-0 left-0 w-1.5', config.border)} />

                  <div className="p-4 pl-6">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p
                            className={joinClasses(
                              'truncate text-sm font-black tracking-tight',
                              notification.isRead
                                ? 'text-secondary-900 dark:text-secondary-100'
                                : 'text-primary-600 dark:text-primary-400',
                            )}
                          >
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="h-3.5 shrink-0 rounded-full bg-primary-500 px-1 text-[8px] leading-[14px] font-black uppercase tracking-widest text-white">
                              New
                            </span>
                          )}
                        </div>

                        <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] font-bold text-secondary-400 dark:text-secondary-500">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-end justify-between gap-4">
                        <p className="line-clamp-2 flex-1 text-[11px] font-semibold leading-relaxed text-secondary-500 dark:text-secondary-400">
                          {notification.message}
                        </p>

                        <button
                          type="button"
                          aria-label={`Delete ${notification.title}`}
                          className="mb-[-4px] mr-[-4px] shrink-0 rounded-lg p-1.5 text-secondary-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/30"
                          onClick={(event) => {
                            event.stopPropagation()
                            deleteNotification(notification.id)
                          }}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {notifications.length === 0 && (
              <div className="py-12 text-center">
                <BellIcon className="mx-auto mb-3 h-10 w-10 text-secondary-200 dark:text-secondary-600" />
                <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">
                  No new notifications
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 p-4 pt-2">
            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 font-bold text-[var(--brand-color)] transition-colors hover:bg-[var(--brand-color)]/8 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              <span className="inline-block scale-[1] origin-center text-[13px] font-bold tracking-tight">
                Mark all as read
              </span>
            </button>

            <button
              type="button"
              className="w-full rounded-xl px-3 py-2 font-bold text-secondary-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-secondary-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              onClick={() => setIsClearNotificationsModalOpen(true)}
              disabled={notifications.length === 0}
            >
              <span className="inline-block scale-[1] origin-center text-[13px] font-bold tracking-tight">
                Clear all notifications
              </span>
            </button>
          </div>
        </div>
      )}
    </aside>
    </>
  )
}

export default RightSidebar
