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

export function BuildingIcon(props: IconProps) {
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
      <path d="M4.5 20V6.25A1.75 1.75 0 0 1 6.25 4.5h6A1.75 1.75 0 0 1 14 6.25V20" />
      <path d="M14 20V9.25A1.75 1.75 0 0 1 15.75 7.5h2A1.75 1.75 0 0 1 19.5 9.25V20" />
      <path d="M8 8.5h2" />
      <path d="M8 12h2" />
      <path d="M8 15.5h2" />
      <path d="M16.25 11.5h1" />
      <path d="M16.25 15h1" />
      <path d="M3 20h18" />
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

export function UsersIcon(props: IconProps) {
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
      <circle cx="9" cy="8.5" r="2.5" />
      <circle cx="16.5" cy="9.5" r="2" />
      <path d="M4.75 18a4.75 4.75 0 0 1 8.5 0" />
      <path d="M14.25 18a3.5 3.5 0 0 1 5 0" />
    </svg>
  )
}

export function UserIcon(props: IconProps) {
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
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

export function ChevronDownIcon(props: IconProps) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function BellIcon(props: IconProps) {
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
      <path d="M6.75 9.5a5.25 5.25 0 1 1 10.5 0c0 4.8 2 5.9 2 5.9H4.75s2-1.1 2-5.9" />
      <path d="M10 18.25a2 2 0 0 0 4 0" />
    </svg>
  )
}

export function SunIcon(props: IconProps) {
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
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.75v2.5" />
      <path d="M12 18.75v2.5" />
      <path d="m4.93 4.93 1.77 1.77" />
      <path d="m17.3 17.3 1.77 1.77" />
      <path d="M2.75 12h2.5" />
      <path d="M18.75 12h2.5" />
      <path d="m4.93 19.07 1.77-1.77" />
      <path d="m17.3 6.7 1.77-1.77" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
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
      <path d="M20 14.25A7.75 7.75 0 1 1 9.75 4 6.25 6.25 0 1 0 20 14.25Z" />
    </svg>
  )
}

export function LogOutIcon(props: IconProps) {
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
      <path d="M14.5 7.5V5.75A1.75 1.75 0 0 0 12.75 4H6.75A1.75 1.75 0 0 0 5 5.75v12.5A1.75 1.75 0 0 0 6.75 20h6A1.75 1.75 0 0 0 14.5 18.25V16.5" />
      <path d="M10.5 12h9" />
      <path d="m16 7.5 4.5 4.5-4.5 4.5" />
    </svg>
  )
}

export function CameraIcon(props: IconProps) {
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
      <path d="M4.75 8.25h2.4l1.15-1.75h7.4l1.15 1.75h2.4A1.75 1.75 0 0 1 21 10v8.25A1.75 1.75 0 0 1 19.25 20H4.75A1.75 1.75 0 0 1 3 18.25V10a1.75 1.75 0 0 1 1.75-1.75Z" />
      <circle cx="12" cy="14" r="3.25" />
    </svg>
  )
}

export function TrashIcon(props: IconProps) {
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
      <path d="M4.75 7.25h14.5" />
      <path d="M9.25 4.5h5.5" />
      <path d="M7 7.25 7.8 18A1.75 1.75 0 0 0 9.55 19.6h4.9A1.75 1.75 0 0 0 16.2 18L17 7.25" />
      <path d="M10 10.5v5" />
      <path d="M14 10.5v5" />
    </svg>
  )
}

export function LayersIcon(props: IconProps) {
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
      <path d="m3.75 10.5 8.25 4.5 8.25-4.5" />
      <path d="m3.75 14.5 8.25 4.5 8.25-4.5" />
      <path d="m12 4.5-8.25 4.5 8.25 4.5 8.25-4.5Z" />
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3" />
    </svg>
  )
}

export function EditIcon(props: IconProps) {
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
      <path d="M13.25 5.75 18.25 10.75" />
      <path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L6.75 19.25l-3.5.75.75-3.5Z" />
    </svg>
  )
}

export function PlusIcon(props: IconProps) {
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
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

export function DotsVerticalIcon(props: IconProps) {
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
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
