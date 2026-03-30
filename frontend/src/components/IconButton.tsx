import type { ReactNode } from 'react'

export function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

interface IconButtonProps {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}

export function IconButton({ label, onClick, className, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={joinClasses(
        'inline-flex items-center justify-center rounded-2xl text-[var(--brand-olive)] transition hover:bg-[rgba(58,79,36,0.08)] hover:text-[var(--brand-olive-deep)]',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
