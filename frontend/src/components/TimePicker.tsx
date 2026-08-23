import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { ClockIcon } from './Icons'

interface TimePickerProps {
  value: string // Format: "HH:mm" (24h)
  onChange: (value: string) => void
  onToggle?: (isOpen: boolean) => void
  hasError?: boolean
  minuteStep?: number
  minTime?: string // Format: "HH:mm" default: "07:30"
  maxTime?: string // Format: "HH:mm" default: "18:00"
  disabledTimes?: string[] | ((time: string) => boolean)
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
  maxTime = '17:30',
  disabledTimes,
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
    if (!maxTime) return 1050 // 17:30
    const [h, m] = maxTime.split(':').map(Number)
    return isNaN(h) || isNaN(m) ? 1050 : h * 60 + m
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

  const getTimeStr = (hStr: string, mStr: string, pStr: string) => {
    let h = parseInt(hStr, 10)
    if (pStr === 'PM' && h < 12) h += 12
    if (pStr === 'AM' && h === 12) h = 0
    const min = parseInt(mStr, 10) || 0
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`
  }

  const isMinsDisabled = useCallback((mins: number) => {
    if (mins < minMinutes || mins > maxMinutes) return true
    const h24 = Math.floor(mins / 60)
    const m = mins % 60
    const timeStr = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
    if (disabledTimes) {
      if (typeof disabledTimes === 'function') {
        return disabledTimes(timeStr)
      }
      if (Array.isArray(disabledTimes)) {
        return disabledTimes.includes(timeStr)
      }
    }
    return false
  }, [minMinutes, maxMinutes, disabledTimes])

  // 12-hour list in clock order (12 first, then 01..11)
  const allHours = useMemo(() => ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'], [])
  const allMinutes = useMemo(() => Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => (i * minuteStep).toString().padStart(2, '0')), [minuteStep])
  const periods = useMemo(() => ['AM', 'PM'], [])

  const validAMMinutes = useMemo(() => {
    const list: number[] = []
    allHours.forEach(h => {
      allMinutes.forEach(m => {
        const mins = getMinutes(h, m, 'AM')
        if (!isMinsDisabled(mins)) {
          list.push(mins)
        }
      })
    })
    return list.sort((a, b) => a - b)
  }, [allHours, allMinutes, isMinsDisabled])

  const validPMMinutes = useMemo(() => {
    const list: number[] = []
    allHours.forEach(h => {
      allMinutes.forEach(m => {
        const mins = getMinutes(h, m, 'PM')
        if (!isMinsDisabled(mins)) {
          list.push(mins)
        }
      })
    })
    return list.sort((a, b) => a - b)
  }, [allHours, allMinutes, isMinsDisabled])

  const isHourDisabled = (h: string, p: string = period) => {
    return !allMinutes.some((m) => !isMinsDisabled(getMinutes(h, m, p)))
  }

  // Filter only valid selectable options to completely hide non-selectable numbers
  const visibleHours = allHours.filter((h) => !isHourDisabled(h, period))

  const visibleMinutes = allMinutes.filter((min) => {
    if (!value) {
      return visibleHours.some(h => !isMinsDisabled(getMinutes(h, min, period)))
    }
    return !isMinsDisabled(getMinutes(hourStr, min, period))
  })

  const isPeriodDisabled = (p: string) => {
    return p === 'AM' ? validAMMinutes.length === 0 : validPMMinutes.length === 0
  }

  const updateTime = (newHour: string, newMinute: string, newPeriod: string) => {
    const validList = newPeriod === 'PM' ? validPMMinutes : validAMMinutes
    if (validList.length === 0) return

    let targetMins = getMinutes(newHour, newMinute, newPeriod)

    // If switching period (e.g. AM -> PM or PM -> AM)
    if (newPeriod !== period) {
      if (defaultPlacement === 'latest') {
        targetMins = validList[validList.length - 1]
      } else {
        if (isMinsDisabled(targetMins)) {
          // Snap to the earliest valid time in the target period
          targetMins = validList[0]
        }
      }
    } else {
      // If clicking hour or minute in same period
      if (isMinsDisabled(targetMins)) {
        // Try to find a valid minute for this newHour in newPeriod
        const validForHour = allMinutes
          .map(m => getMinutes(newHour, m, newPeriod))
          .filter(m => !isMinsDisabled(m))

        if (validForHour.length > 0) {
          targetMins = validForHour[0]
        } else {
          targetMins = validList[0]
        }
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
        <span className={`text-sm font-medium flex-1 text-left ${!value && !hideClear ? 'text-gray-400' : 'text-gray-900'}`}>
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
                    onClick={() => {
                      if (!value) {
                        const validHour = visibleHours.find(h => !isMinsDisabled(getMinutes(h, min, period))) || hourStr
                        updateTime(validHour, min, period)
                      } else {
                        updateTime(hourStr, min, period)
                      }
                    }}
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
