import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

export function DashboardIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3.5" y="4" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="4" width="7" height="4.5" rx="1.8" />
      <rect x="13.5" y="11.5" width="7" height="8.5" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="6.5" rx="1.8" />
    </svg>
  )
}

export function DoorIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 20V5.8c0-.64.43-1.2 1.04-1.36l7-1.84a1.4 1.4 0 0 1 1.76 1.35V20" />
      <path d="M6 20h11.5" />
      <path d="M11.95 12.15h.1" />
      <path d="M15.8 20V4.1" />
    </svg>
  )
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.25 4h5.5A1.75 1.75 0 0 1 16.5 5.75V7h-9V5.75A1.75 1.75 0 0 1 9.25 4Z" />
      <path d="M8 5.75H6.75A1.75 1.75 0 0 0 5 7.5v10.75A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V7.5a1.75 1.75 0 0 0-1.75-1.75H16" />
      <path d="m8.7 12.1 2.1 2.1 4.5-4.55" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7.5 3.75V6" />
      <path d="M16.5 3.75V6" />
      <path d="M5 9h14" />
      <rect x="4" y="5.25" width="16" height="14.75" rx="2.25" />
      <path d="M8.5 12.75h.01" />
      <path d="M12 12.75h.01" />
      <path d="M15.5 12.75h.01" />
      <path d="M8.5 16.25h.01" />
      <path d="M12 16.25h.01" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 6.5h8" />
      <path d="M15.5 6.5H20" />
      <path d="M4 12h3.5" />
      <path d="M11 12h9" />
      <path d="M4 17.5h10" />
      <path d="M17.5 17.5H20" />
      <circle cx="12" cy="6.5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15.5" cy="17.5" r="2" />
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
