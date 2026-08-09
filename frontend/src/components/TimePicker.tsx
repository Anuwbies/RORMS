import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { ClockIcon, ChevronDownIcon } from './Icons'

interface TimePickerProps {
  value: string // Format: "HH:mm" (24h)
  onChange: (value: string) => void
  onToggle?: (isOpen: boolean) => void
  hasError?: boolean
  minuteStep?: number
}

export function TimePicker({ value, onChange, onToggle, hasError, minuteStep = 1 }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hourScrollRef = useRef<HTMLDivElement>(null)
  const minScrollRef = useRef<HTMLDivElement>(null)
  const periodScrollRef = useRef<HTMLDivElement>(null)

  // Parse 24h to 12h
  const [h24, m] = (value || '00:00').split(':').map(Number)
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  const hourStr = h12.toString().padStart(2, '0')
  const minuteStr = (m || 0).toString().padStart(2, '0')

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

  useLayoutEffect(() => {
    if (isOpen) {
      // Scroll to selected values
      const scrollToSelected = (container: HTMLDivElement | null, selectedText: string) => {
        if (!container) return
        const selectedElement = Array.from(container.querySelectorAll('button')).find(
          (btn) => btn.textContent?.trim() === selectedText
        )
        if (selectedElement) {
          container.scrollTop = (selectedElement as HTMLElement).offsetTop - container.offsetTop - 60
        }
      }

      scrollToSelected(hourScrollRef.current, hourStr)
      scrollToSelected(minScrollRef.current, minuteStr)
      scrollToSelected(periodScrollRef.current, period)
    }
  }, [isOpen, hourStr, minuteStr, period])

  const updateTime = (newHour: string, newMinute: string, newPeriod: string) => {
    let h = parseInt(newHour)
    if (newPeriod === 'PM' && h < 12) h += 12
    if (newPeriod === 'AM' && h === 12) h = 0
    const formattedTime = `${h.toString().padStart(2, '0')}:${newMinute}`
    onChange(formattedTime)
  }

  const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => (i * minuteStep).toString().padStart(2, '0'))
  const periods = ['AM', 'PM']

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-12 w-full items-center gap-3 rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-all shadow-sm cursor-pointer hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 active:scale-95 ${
          hasError 
            ? 'border-rose-500 focus:border-rose-500 ring-4 ring-rose-50' 
            : isOpen
              ? 'border-gray-300'
              : 'border-gray-200 focus:border-gray-300'
        }`}
      >
        <ClockIcon className="h-4.5 w-4.5 text-gray-400 shrink-0" />
        <span className="text-sm font-medium text-gray-900 flex-1 text-left">{`${hourStr}:${minuteStr} ${period}`}</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 flex w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-1 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          {/* Hours */}
          <div ref={hourScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar py-1">
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => updateTime(h, minuteStr, period)}
                className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors cursor-pointer ${
                  hourStr === h 
                    ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Minutes */}
          <div ref={minScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar border-l border-gray-100 py-1">
            {minutes.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => updateTime(hourStr, min, period)}
                className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors cursor-pointer ${
                  minuteStr === min 
                    ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {min}
              </button>
            ))}
          </div>

          {/* AM/PM */}
          <div ref={periodScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar border-l border-gray-100 py-1">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => updateTime(hourStr, minuteStr, p)}
                className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors cursor-pointer ${
                  period === p 
                    ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
