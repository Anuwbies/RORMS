import type { MouseEventHandler, ReactNode } from 'react'

export function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

interface IconButtonProps {
  label: string
  onClick: MouseEventHandler<HTMLButtonElement>
  className?: string
  children: ReactNode
  disabled?: boolean
}

export function IconButton({ label, onClick, className, children, disabled }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={joinClasses(
        'inline-flex items-center justify-center rounded-2xl text-[var(--brand-color)] transition enabled:hover:bg-[rgba(98,133,62,0.08)] enabled:hover:text-[var(--brand-color)] enabled:cursor-pointer disabled:cursor-default disabled:shadow-none disabled:transform-none',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
