import React from 'react'
import type { ButtonVariant } from './Button'

export interface IconOnlyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon: React.ReactNode
  label: string
}

export function IconOnlyButton({ variant = 'primary', icon, label, className = '', ...props }: IconOnlyButtonProps) {
  // h-12 w-12 for a square icon button matching the height of the standard Button
  const baseClasses = 'h-12 w-12 rounded-xl flex items-center justify-center transition-all cursor-pointer hover:cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-default disabled:active:scale-100 disabled:pointer-events-none disabled:hover:shadow-none'
  
  const variants = {
    primary: 'bg-gray-900 text-white shadow-md shadow-gray-900/20 hover:bg-black hover:shadow-lg',
    brand: 'bg-[var(--brand-color)] text-white shadow-md hover:bg-[var(--brand-color-hover)] hover:shadow-lg',
    outline: 'bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:bg-gray-100',
    active: 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] border border-[var(--brand-color)]/20 shadow-sm hover:bg-[var(--brand-color)]/15 hover:border-[var(--brand-color)]/30 hover:shadow-md active:bg-[var(--brand-color)]/20',
  }

  return (
    <button 
      className={`${baseClasses} ${variants[variant]} ${className}`} 
      aria-label={label}
      {...props}
    >
      {icon}
    </button>
  )
}
