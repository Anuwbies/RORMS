import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

export function DashboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 13.5h6.5V20H4z" />
      <path d="M13.5 4H20v6.5h-6.5z" />
      <path d="M13.5 13.5H20V20h-6.5z" />
      <path d="M4 4h6.5v6.5H4z" />
    </svg>
  )
}

export function DoorIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 20V5.75a1 1 0 0 1 .73-.96l8-2.25a1 1 0 0 1 .27.96V20" />
      <path d="M6 20h12" />
      <path d="M13 12.5h.01" />
    </svg>
  )
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M9 4.75h6" />
      <path d="M9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6H8V4.75A1.75 1.75 0 0 1 9.75 3Z" />
      <path d="M8 5.75H6.75A1.75 1.75 0 0 0 5 7.5v11A1.75 1.75 0 0 0 6.75 20.25h10.5A1.75 1.75 0 0 0 19 18.5v-11a1.75 1.75 0 0 0-1.75-1.75H16" />
      <path d="m8.75 12 2 2 4.5-4.5" />
    </svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 3.75V6" />
      <path d="M17 3.75V6" />
      <path d="M4.75 9H19.25" />
      <path d="M6.75 5.25h10.5A1.75 1.75 0 0 1 19 7v10.25A1.75 1.75 0 0 1 17.25 19H6.75A1.75 1.75 0 0 1 5 17.25V7a1.75 1.75 0 0 1 1.75-1.75Z" />
      <path d="M9 13h2.25" />
      <path d="M13 13h2" />
      <path d="M9 16h2.25" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="m12 3 1.1 2.64 2.85.4-2.08 1.97.5 2.84L12 9.5l-2.37 1.35.5-2.84-2.08-1.97 2.85-.4L12 3Z" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M19.4 15.2 21 17.75l-2.4 2.4-2.55-1.6" />
      <path d="M4.6 15.2 3 17.75l2.4 2.4 2.55-1.6" />
      <path d="M19.4 8.8 21 6.25l-2.4-2.4-2.55 1.6" />
      <path d="M4.6 8.8 3 6.25l2.4-2.4 2.55 1.6" />
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
