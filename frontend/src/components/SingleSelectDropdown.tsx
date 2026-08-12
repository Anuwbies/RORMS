import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { ChevronDownIcon, CheckIcon } from './Icons'

export interface SingleSelectDropdownProps<T extends string> {
  options: T[] | readonly T[]
  value: T
  onChange: (value: T) => void
  className?: string
  isDisabled?: boolean
  onToggle?: (isOpen: boolean) => void
}

export function SingleSelectDropdown<T extends string>({ 
  options, 
  value, 
  onChange, 
  className = '',
  isDisabled = false,
  onToggle
}: SingleSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option: T) => {
    onChange(option)
    setIsOpen(false)
  }

  const longestOption = options.reduce((a, b) => (a.length > b.length ? a : b), '' as T)

  useLayoutEffect(() => {
    if (!menuWidthRef.current) {
      return
    }
    setMenuMinWidth(menuWidthRef.current.offsetWidth)
  }, [longestOption])

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
      style={menuMinWidth ? { minWidth: `${menuMinWidth}px` } : undefined}
    >
      <div
        ref={menuWidthRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-md border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-xs">
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={isDisabled}
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 outline-none transition-all cursor-pointer hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 active:scale-95 shadow-sm disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
      >
        <span className="whitespace-nowrap text-gray-900">{value || 'None'}</span>
        <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !isDisabled && (
        <div className="absolute left-0 top-full z-20 mt-2 min-w-full rounded-2xl border border-gray-200 bg-white p-2 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200 overflow-visible">
          <div className="space-y-1 max-h-55 overflow-y-auto custom-scrollbar pr-1 overflow-visible">
            {options.map((option) => {
              const isSelected = value === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleSelect(option)}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition-all active:scale-[0.98] ${
                    isSelected 
                      ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)]' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100'
                  }`}
                >
                  <span className="whitespace-nowrap">{option || 'None'}</span>
                  {isSelected && <CheckIcon className="ml-auto h-4 w-4 text-[var(--brand-color)]" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
