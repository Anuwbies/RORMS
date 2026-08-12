import React, { useState, useEffect, useRef } from 'react'
import { FilterIcon, CheckIcon } from './Icons'
import { Button } from './Button'

export interface FilterOption {
  value: string
  label?: string
}

export interface FilterGroup {
  id: string
  title: string
  options: (string | FilterOption)[]
  selectedValues: string[]
  onChange: (newSelected: string[]) => void
}

export interface FilterDropdownProps {
  groups: FilterGroup[]
  onClearAll?: () => void
  label?: string
  className?: string
  buttonClassName?: string
}

export function FilterDropdown({
  groups,
  onClearAll,
  label = "Filters",
  className = "",
  buttonClassName = ""
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeCount = groups.reduce((sum, g) => sum + g.selectedValues.length, 0)
  const isActive = activeCount > 0

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll()
    } else {
      groups.forEach(g => g.onChange([]))
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <Button
        variant={isActive ? 'active' : 'outline'}
        icon={<FilterIcon className="h-4 w-4" />}
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(prev => !prev)
        }}
      >
        {label} {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 bg-[var(--brand-color)] text-white text-[0.65rem] font-bold rounded-full text-center tabular-nums">
            {activeCount}
          </span>
        )}
      </Button>
      
      {isOpen && (
        <div 
          className="absolute top-full mt-2 left-0 w-80 bg-white rounded-2xl border border-gray-200 shadow-xl ring-1 ring-black/5 p-4 z-50 animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
            <p className="text-base font-bold text-gray-900">{label}</p>
            <button 
              type="button"
              onClick={handleClearAll}
              disabled={activeCount === 0}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-3 max-h-[34vh] overflow-y-auto custom-scrollbar pr-2">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{group.title}</p>
                <div className="space-y-0.5">
                  {group.options.map((opt) => {
                    const optValue = typeof opt === 'string' ? opt : opt.value
                    const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.value)
                    const isSelected = group.selectedValues.includes(optValue)

                    return (
                      <label key={optValue} className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group">
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={isSelected}
                          onChange={() => {
                            const newSelected = isSelected
                              ? group.selectedValues.filter(v => v !== optValue)
                              : [...group.selectedValues, optValue]
                            group.onChange(newSelected)
                          }}
                        />
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${isSelected ? 'bg-[var(--brand-color)] border-[var(--brand-color)]' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                          {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm font-bold truncate ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>{optLabel}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
