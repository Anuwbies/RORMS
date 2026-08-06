import React from 'react'

export type ButtonVariant = 'primary' | 'brand' | 'outline' | 'active'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: React.ReactNode
}

export function Button({ variant = 'primary', icon, children, className = '', ...props }: ButtonProps) {
  const baseClasses = 'h-12 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer hover:cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none'
  
  const variants = {
    primary: 'bg-gray-900 text-white shadow-md shadow-gray-900/20 hover:bg-black hover:shadow-lg',
    brand: 'bg-[var(--brand-color)] text-white shadow-md hover:bg-[var(--brand-color-hover)] hover:shadow-lg',
    outline: 'bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:shadow-md active:bg-gray-100',
    active: 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] border border-[var(--brand-color)]/20 shadow-sm hover:bg-[var(--brand-color)]/15 hover:border-[var(--brand-color)]/30 hover:shadow-md active:bg-[var(--brand-color)]/20',
  }

  return (
    <button className={`${baseClasses} ${variants[variant]} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}
