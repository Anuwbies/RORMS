import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { ClockIcon } from './Icons'

interface TimePickerProps {
  value: string // Format: "HH:mm" (24h)
  onChange: (value: string) => void
  onToggle?: (isOpen: boolean) => void
  hasError?: boolean
  minuteStep?: number
  minTime?: string // Format: "HH:mm" default: "07:30"
  maxTime?: string // Format: "HH:mm" default: "18:00"
  hideClear?: boolean
  placeholder?: string
  defaultPlacement?: 'earliest' | 'latest'
}

export function TimePicker({
  value,
  onChange,
  onToggle,
  hasError,
  minuteStep = 1,
  minTime = '07:30',
  maxTime = '18:00',
  hideClear = false,
  placeholder,
  defaultPlacement = 'earliest'
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hourScrollRef = useRef<HTMLDivElement>(null)
  const minScrollRef = useRef<HTMLDivElement>(null)
  const periodScrollRef = useRef<HTMLDivElement>(null)

  // Parse min and max bounds into minutes from midnight
  const minMinutes = useMemo(() => {
    if (!minTime) return 450 // 07:30
    const [h, m] = minTime.split(':').map(Number)
    return isNaN(h) || isNaN(m) ? 450 : h * 60 + m
  }, [minTime])

  const maxMinutes = useMemo(() => {
    if (!maxTime) return 1080 // 18:00
    const [h, m] = maxTime.split(':').map(Number)
    return isNaN(h) || isNaN(m) ? 1080 : h * 60 + m
  }, [maxTime])

  // Parse 24h to 12h or default to minTime
  const [h24, m] = (value || minTime || '07:30').split(':').map(Number)
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

  const getMinutes = (hStr: string, mStr: string, pStr: string) => {
    let h = parseInt(hStr, 10)
    if (pStr === 'PM' && h < 12) h += 12
    if (pStr === 'AM' && h === 12) h = 0
    const min = parseInt(mStr, 10) || 0
    return h * 60 + min
  }

  // 12-hour list in clock order (12 first, then 01..11)
  const allHours = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']
  const allMinutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => (i * minuteStep).toString().padStart(2, '0'))
  const periods = ['AM', 'PM']

  const isHourDisabled = (h: string, p: string = period) => {
    return !allMinutes.some((min) => {
      const mins = getMinutes(h, min, p)
      return mins >= minMinutes && mins <= maxMinutes
    })
  }

  const isMinuteDisabled = (min: string) => {
    const mins = getMinutes(hourStr, min, period)
    return mins < minMinutes || mins > maxMinutes
  }

  const isPeriodDisabled = (p: string) => {
    if (p === 'AM') {
      return minMinutes >= 720
    }
    if (p === 'PM') {
      return maxMinutes < 720
    }
    return false
  }

  // Filter only valid selectable options to completely hide non-selectable numbers
  const visibleHours = allHours.filter((h) => !isHourDisabled(h, period))
  const visibleMinutes = allMinutes.filter((min) => !isMinuteDisabled(min))

  const updateTime = (newHour: string, newMinute: string, newPeriod: string) => {
    let targetMins = getMinutes(newHour, newMinute, newPeriod)
    
    // If switching period (e.g. AM -> PM or PM -> AM)
    if (newPeriod !== period) {
      if (newPeriod === 'PM') {
        if (defaultPlacement === 'latest') {
          // Choose latest valid PM time
          const latestPMBound = Math.min(1439, maxMinutes)
          let bestPM = latestPMBound - (latestPMBound % minuteStep)
          if (bestPM < 720) bestPM = 720
          targetMins = Math.max(minMinutes, Math.min(bestPM, maxMinutes))
        } else {
          // Choose earliest valid PM time
          if (targetMins < minMinutes || targetMins > maxMinutes) {
            const earliestPM = Math.max(720, minMinutes) // 720 is 12:00 PM
            targetMins = Math.min(earliestPM, maxMinutes)
          }
        }
      } else {
        if (defaultPlacement === 'latest') {
          // Choose latest valid AM time (e.g. 11:30 AM)
          const latestAMBound = Math.min(719, maxMinutes)
          let bestAM = latestAMBound - (latestAMBound % minuteStep)
          targetMins = Math.max(minMinutes, Math.min(bestAM, maxMinutes))
        } else {
          // Choose earliest valid AM time
          if (targetMins < minMinutes || targetMins > maxMinutes) {
            targetMins = Math.min(minMinutes, maxMinutes)
          }
        }
      }
    } else {
      // Normal hour/minute selection: clamp within bounds
      if (targetMins < minMinutes) {
        targetMins = minMinutes
      } else if (targetMins > maxMinutes) {
        targetMins = maxMinutes
      }
    }

    const h = Math.floor(targetMins / 60)
    const min = targetMins % 60
    const formattedTime = `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
    onChange(formattedTime)
  }

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
        <span className="text-sm font-medium text-gray-900 flex-1 text-left">
          {value ? `${hourStr}:${minuteStr} ${period}` : hideClear ? `${hourStr}:${minuteStr} ${period}` : (placeholder || 'Any Time')}
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          <div className="flex p-1">
            {/* Hours */}
            <div ref={hourScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar py-1">
              {visibleHours.map((h) => {
                const isSelected = hourStr === h && Boolean(value)
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => updateTime(h, minuteStr, period)}
                    className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {h}
                  </button>
                )
              })}
            </div>

            {/* Minutes */}
            <div ref={minScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar border-l border-gray-100 py-1">
              {visibleMinutes.map((min) => {
                const isSelected = minuteStr === min && Boolean(value)
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => updateTime(hourStr, min, period)}
                    className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold' 
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {min}
                  </button>
                )
              })}
            </div>

            {/* AM/PM */}
            <div ref={periodScrollRef} className="h-48 flex-1 overflow-y-auto no-scrollbar border-l border-gray-100 py-1">
              {periods.map((p) => {
                const disabled = isPeriodDisabled(p)
                const isSelected = period === p && Boolean(value)
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => updateTime(hourStr, minuteStr, p)}
                    className={`w-full rounded-xl py-2.5 text-sm text-center transition-colors ${
                      disabled
                        ? 'text-gray-300 cursor-default opacity-40'
                        : isSelected
                          ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] font-bold cursor-pointer' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 cursor-pointer'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
          {/* Footer */}
          {!hideClear && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setIsOpen(false)
                }}
                className="w-full rounded-xl py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
