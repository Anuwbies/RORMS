import React from 'react'
import { SearchIcon, PlusIcon } from './Icons'

interface SearchFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  placeholder?: string
  dropdowns?: React.ReactNode
  primaryButton?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  className?: string
}

export function SearchFilters({
  searchTerm,
  onSearchChange,
  placeholder = "Search...",
  dropdowns,
  primaryButton,
  className = ""
}: SearchFiltersProps) {
  return (
    <div className={`lg:h-22 rounded-md border border-gray-200 bg-gray-50/50 p-5 shadow-md flex items-center ${className}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center w-full">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <SearchIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
            className="h-[46px] w-full rounded-md border border-gray-200 bg-white pl-11 pr-24 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute inset-y-1.5 right-1.5 rounded-md bg-gray-900 px-4 text-sm font-bold text-white transition hover:bg-gray-800"
            >
              Clear
            </button>
          )}
        </div>

        {dropdowns && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {dropdowns}
          </div>
        )}

        {primaryButton && (
          <button
            type="button"
            className="h-[46px] flex items-center justify-center gap-2 rounded-md bg-[var(--brand-color)] px-6 text-sm font-bold text-white shadow-md transition hover:bg-[#526f34] hover:shadow-lg shrink-0"
            onClick={primaryButton.onClick}
          >
            {primaryButton.icon || <PlusIcon className="h-5 w-5" />}
            {primaryButton.label}
          </button>
        )}
      </div>
    </div>
  )
}
