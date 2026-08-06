import React from 'react'

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: boolean
  icon?: React.ReactNode
  className?: string
  inputClassName?: string
}

export function TextInput({ 
  value, 
  onChange, 
  error, 
  icon, 
  className = '', 
  inputClassName = '', 
  ...props 
}: TextInputProps) {
  return (
    <div className={`relative w-full ${className}`}>
      {icon && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
          {icon}
        </div>
      )}
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck="false"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-12 rounded-xl bg-white border text-sm font-medium outline-none transition-all shadow-sm ${
          icon ? 'pl-12' : 'pl-4'
        } pr-4 ${
          error
            ? 'border-rose-500 text-gray-900 placeholder:text-rose-300 focus:border-rose-500 focus:ring-4 focus:ring-rose-50'
            : 'border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50'
        } ${inputClassName}`}
        {...props}
      />
    </div>
  )
}
