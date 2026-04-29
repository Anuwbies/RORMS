import { useState, useRef, useEffect, useMemo } from 'react'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons'

interface DatePickerProps {
  value: string // Format: "YYYY-MM-DD"
  onChange: (value: string) => void
  onToggle?: (isOpen: boolean) => void
  minDate?: string // Format: "YYYY-MM-DD"
  allowedDays?: string[] // e.g., ["Monday", "Tuesday"]
  hasError?: boolean
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

export function DatePicker({ value, onChange, onToggle, minDate, allowedDays, hasError }: DatePickerProps) {
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

    // Check allowedDays
    if (allowedDays && allowedDays.length > 0) {
      const dayName = DAYS_MAP[date.getDay()]
      if (!allowedDays.includes(dayName)) return true
    }

    return false
  }

  const formattedDisplayDate = selectedDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-[46px] w-full items-center justify-between gap-2 rounded-md border bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all hover:border-gray-300 hover:shadow-md focus:border-gray-300 focus:ring-4 focus:ring-gray-50 shadow-sm ${
          hasError ? 'border-rose-500 ring-rose-50' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-4.5 w-4.5 text-gray-400" />
          <span className="text-sm font-normal text-gray-900">{formattedDisplayDate}</span>
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-gray-200 bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <h4 className="text-sm font-bold text-gray-900">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h4>
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Days of week */}
          <div className="mb-2 grid grid-cols-7 gap-1">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
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
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold transition-[background-color,color,box-shadow,transform] duration-200 ${
                    selected
                      ? 'bg-[var(--brand-color)] text-white shadow-md'
                      : disabled
                        ? 'text-gray-200 cursor-not-allowed'
                        : today
                          ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] hover:bg-[var(--brand-color)]/20'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer / Today button */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
              }}
              className="w-full rounded-md py-1.5 text-xs font-bold text-[var(--brand-color)] hover:bg-[var(--brand-color)]/5 transition-colors"
            >
              Go to Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
