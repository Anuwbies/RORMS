import { useState, useRef, useEffect, useMemo } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons'

interface DatePickerProps {
  value: string // Format: "YYYY-MM-DD"
  onChange: (value: string) => void
  onToggle?: (isOpen: boolean) => void
  minDate?: string // Format: "YYYY-MM-DD"
  maxDate?: string // Format: "YYYY-MM-DD"
  allowedDays?: string[] // e.g., ["Monday", "Tuesday"]
  hasError?: boolean
  align?: 'left' | 'right'
  showClear?: boolean
  hideClear?: boolean
  onPrev?: () => void
  onNext?: () => void
  prevDisabled?: boolean
  nextDisabled?: boolean
  prevTitle?: string
  nextTitle?: string
}

const DAYS_MAP: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday'
}

export function DatePicker({
  value,
  onChange,
  onToggle,
  minDate,
  maxDate,
  allowedDays,
  hasError,
  align = 'left',
  showClear = true,
  hideClear = false,
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
  prevTitle,
  nextTitle
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse current value or default to today
  const selectedDate = useMemo(() => {
    if (!value) return new Date()
    const [year, month, day] = value.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    return isNaN(d.getTime()) ? new Date() : d
  }, [value])

  // View state (which month we are looking at)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(selectedDate)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  // Sync viewDate when selectedDate changes
  useEffect(() => {
    setViewDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  }, [selectedDate])

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  }

  const parsedMinDate = useMemo(() => {
    if (!minDate) return null
    const [y, m, d] = minDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setHours(0, 0, 0, 0)
    return date
  }, [minDate])

  const parsedMaxDate = useMemo(() => {
    if (!maxDate) return null
    const [y, m, d] = maxDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setHours(23, 59, 59, 999)
    return date
  }, [maxDate])

  const handleSelectDay = (day: number) => {
    const year = viewDate.getFullYear()
    const month = String(viewDate.getMonth() + 1).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    const formatted = `${year}-${month}-${dayStr}`
    onChange(formatted)
    setIsOpen(false)
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const calendarDays = useMemo(() => {
    const days = []
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    
    const count = daysInMonth(year, month)
    const firstDay = firstDayOfMonth(year, month)
    
    // Empty slots for days of previous month
    for (let i = 0; i < firstDay; i++) {
      days.push(null)
    }
    
    // Actual days
    for (let i = 1; i <= count; i++) {
      days.push(i)
    }
    
    return days
  }, [viewDate])

  const isSelected = (day: number) => {
    if (!value) return false
    return selectedDate.getDate() === day &&
           selectedDate.getMonth() === viewDate.getMonth() &&
           selectedDate.getFullYear() === viewDate.getFullYear()
  }

  const isToday = (day: number) => {
    const today = new Date()
    return today.getDate() === day &&
           today.getMonth() === viewDate.getMonth() &&
           today.getFullYear() === viewDate.getFullYear()
  }

  const isDisabled = (day: number) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    
    // Check minDate
    if (parsedMinDate && date < parsedMinDate) {
      return true
    }

    // Check maxDate
    if (parsedMaxDate && date > parsedMaxDate) {
      return true
    }

    // Check allowedDays
    if (allowedDays && allowedDays.length > 0) {
      const dayName = DAYS_MAP[date.getDay()]
      if (!allowedDays.includes(dayName)) return true
    }

    return false
  }

  const isPrevMonthDisabled = parsedMinDate ? new Date(viewDate.getFullYear(), viewDate.getMonth(), 0) < parsedMinDate : false
  const isNextMonthDisabled = parsedMaxDate ? new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1) > parsedMaxDate : false


  const formattedDisplayDate = value ? selectedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) : 'Any Date'

  return (
    <div className="relative" ref={containerRef}>
      {!(onPrev || onNext) ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex h-12 w-full items-center gap-2.5 rounded-xl border bg-white px-3.5 py-1 text-sm outline-none transition-all shadow-sm cursor-pointer hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 active:scale-95 ${
            hasError 
              ? 'border-rose-500 focus:border-rose-500 ring-4 ring-rose-50' 
              : isOpen
                ? 'border-gray-300'
                : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <CalendarIcon className="h-4.5 w-4.5 text-gray-400 shrink-0" />
          <span className={`text-sm font-medium truncate flex-1 text-left ${!value ? 'text-gray-400' : 'text-gray-900'}`}>
            {formattedDisplayDate}
          </span>
        </button>
      ) : (
        <div
          className={`flex h-12 w-full items-center justify-between gap-1.5 rounded-xl border bg-white pl-3.5 pr-1.5 py-1 text-sm text-gray-900 outline-none transition-all shadow-sm ${
            hasError 
              ? 'border-rose-500 focus-within:border-rose-500 ring-4 ring-rose-50' 
              : isOpen
                ? 'border-gray-300'
                : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex flex-1 h-full items-center gap-2.5 text-left outline-none cursor-pointer min-w-0 transition-transform active:scale-95"
          >
            <CalendarIcon className="h-4.5 w-4.5 text-gray-400 shrink-0" />
            <span className={`text-sm font-medium truncate ${!value ? 'text-gray-400' : 'text-gray-900'}`}>
              {formattedDisplayDate}
            </span>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            {onPrev && (
              <button
                type="button"
                disabled={prevDisabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!prevDisabled) onPrev()
                }}
                title={prevTitle || 'Previous'}
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${
                  prevDisabled
                    ? 'text-gray-300 cursor-default opacity-40'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer'
                }`}
              >
                <ChevronLeftIcon className="h-4.5 w-4.5" />
              </button>
            )}
            {onNext && (
              <button
                type="button"
                disabled={nextDisabled}
                onClick={(e) => {
                  e.stopPropagation()
                  if (!nextDisabled) onNext()
                }}
                title={nextTitle || 'Next'}
                className={`h-8 w-8 flex items-center justify-center rounded-lg transition-all ${
                  nextDisabled
                    ? 'text-gray-300 cursor-default opacity-40'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 active:scale-95 cursor-pointer'
                }`}
              >
                <ChevronRightIcon className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200`}>
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={isPrevMonthDisabled}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                isPrevMonthDisabled ? 'text-gray-200 cursor-default' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer'
              }`}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h4 className="text-sm font-bold text-gray-900">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h4>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={isNextMonthDisabled}
              className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                isNextMonthDisabled ? 'text-gray-200 cursor-default' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer'
              }`}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Days of week */}
          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-[0.625rem] font-black uppercase tracking-widest text-gray-400">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-8" />
              }

              const selected = isSelected(day)
              const today = isToday(day)
              const disabled = isDisabled(day)
              const key = `${viewDate.getFullYear()}-${viewDate.getMonth()}-${day}`

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectDay(day)}
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold transition-[background-color,color,box-shadow,transform] duration-200 ${
                    selected
                      ? 'bg-[var(--brand-color)] text-white shadow-md cursor-pointer'
                      : disabled
                        ? 'text-gray-200 cursor-default'
                        : today
                          ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] hover:bg-[var(--brand-color)]/20 cursor-pointer'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 cursor-pointer'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer / Today button */}
          <div className="mt-3.5 border-t border-gray-100 pt-2.5 flex items-center gap-2">
            {(showClear && !hideClear) && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setIsOpen(false)
                }}
                className="flex-1 rounded-xl py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
              }}
              className="w-full flex-1 rounded-xl py-1.5 text-xs font-bold text-[var(--brand-color)] hover:bg-[var(--brand-color)]/5 transition-colors cursor-pointer"
            >
              Go to Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
