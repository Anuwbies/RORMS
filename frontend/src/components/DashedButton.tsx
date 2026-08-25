import { type ButtonHTMLAttributes, type ReactNode } from 'react'

interface DashedButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'brand' | 'danger' | 'neutral' | 'success'
  icon?: ReactNode
}

export function DashedButton({
  children,
  variant = 'brand',
  icon,
  className = '',
  ...props
}: DashedButtonProps) {
  const baseStyles = "rounded-xl border-[1.5px] border-dashed px-4 py-2 text-sm font-bold bg-white transition-all flex items-center justify-center gap-1.5 shrink-0 focus:outline-none cursor-pointer active:scale-95 disabled:active:scale-100 min-w-[6.5rem]"
  
  const variants = {
    brand: "border-[var(--brand-color)]/40 text-[var(--brand-color)]/80 hover:border-[var(--brand-color)] hover:text-[var(--brand-color)] hover:bg-[var(--brand-color)]/10",
    danger: "border-rose-300 text-rose-500 hover:border-rose-500 hover:text-rose-600 hover:bg-rose-50",
    neutral: "border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 hover:bg-gray-50",
    success: "border-emerald-300 text-emerald-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className} ${props.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      {...props}
    >
      {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
      {children}
    </button>
  )
}
