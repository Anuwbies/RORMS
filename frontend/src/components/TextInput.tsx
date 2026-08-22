import React from 'react'

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: boolean
  icon?: React.ReactNode
  rightIcon?: React.ReactNode
  rightElement?: React.ReactNode
  className?: string
  inputClassName?: string
}

export function TextInput({ 
  value, 
  onChange, 
  error, 
  icon, 
  rightIcon,
  rightElement,
  className = '', 
  inputClassName = '', 
  type = 'text',
  ...props 
}: TextInputProps) {
  const hasRight = rightIcon || rightElement

  return (
    <div className={`relative w-full ${className}`}>
      {icon && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
          {icon}
        </div>
      )}
      <input
        type={type}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-12 rounded-xl bg-white border text-sm font-medium outline-none transition-all shadow-sm ${
          icon ? 'pl-11' : 'pl-4'
        } ${hasRight ? 'pr-11' : 'pr-4'} ${
          error
            ? 'border-rose-500 text-gray-900 placeholder:text-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-50'
            : 'border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-300'
        } ${inputClassName}`}
        {...props}
      />
      {rightIcon && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-[var(--hint-color)]">
          {rightIcon}
        </div>
      )}
      {rightElement && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {rightElement}
        </div>
      )}
    </div>
  )
}
