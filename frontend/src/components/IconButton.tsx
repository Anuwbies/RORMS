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
        'inline-flex items-center justify-center rounded-2xl text-[var(--brand-color)] transition hover:bg-[rgba(98,133,62,0.08)] hover:text-[var(--brand-color)]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
