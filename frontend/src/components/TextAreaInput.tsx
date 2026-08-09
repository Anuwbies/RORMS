import React from 'react'

export interface TextAreaInputProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: boolean
  icon?: React.ReactNode
  className?: string
  inputClassName?: string
}

export function TextAreaInput({ 
  value, 
  onChange, 
  error, 
  icon, 
  className = '', 
  inputClassName = '',
  placeholder,
  ...props 
}: TextAreaInputProps) {
  return (
    <div className={`relative w-full ${className}`}>
      {icon && !value && (
        <div className="absolute top-3 left-4 flex items-center gap-2 pointer-events-none text-gray-400">
          {icon}
          {placeholder && <span className="text-sm font-medium">{placeholder}</span>}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={icon ? undefined : placeholder}
        className={`w-full rounded-xl border bg-white py-3 text-sm font-medium text-gray-900 outline-none transition shadow-sm resize-none ${
          icon ? 'px-4' : 'px-4'
        } ${
          error
            ? 'border-rose-500 focus:border-rose-500 focus:ring-4 focus:ring-rose-50'
            : 'border-gray-200 focus:border-gray-300'
        } ${inputClassName}`}
        {...props}
      />
    </div>
  )
}
