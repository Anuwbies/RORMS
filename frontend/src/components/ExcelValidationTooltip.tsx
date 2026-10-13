import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ScheduleRange } from '../utils/excelScheduleTemplate'

interface TooltipAnchor { left: number; right: number; top: number; bottom: number }
export type ExcelValidationTone = 'danger' | 'purple' | 'warning'

export function ExcelValidationTooltip({ anchor, messages, tone = 'purple' }: { anchor: TooltipAnchor; messages: readonly string[]; tone?: ExcelValidationTone }) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: anchor.left, top: anchor.top, arrowLeft: 0, below: false })
  useLayoutEffect(() => {
    const rect = tooltipRef.current?.getBoundingClientRect()
    if (!rect) return
    const center = (anchor.left + anchor.right) / 2
    const left = Math.max(8, Math.min(center - rect.width / 2, window.innerWidth - rect.width - 8))
    const below = anchor.top - rect.height - 8 < 8
    const top = Math.max(8, Math.min(below ? anchor.bottom + 8 : anchor.top - rect.height - 8, window.innerHeight - rect.height - 8))
    setPosition({ left, top, below, arrowLeft: Math.max(12, Math.min(center - left, rect.width - 12)) })
  }, [anchor, messages])
  return createPortal(<div ref={tooltipRef} role="tooltip" aria-label="Schedule validation error" className={`pointer-events-none fixed z-[350] w-max max-w-[90vw] rounded-2xl border px-4 py-2.5 text-xs font-semibold backdrop-blur-md ${tone === 'danger' ? 'border-rose-500/40 bg-rose-950/95 text-rose-100 shadow-[0_8px_30px_rgba(225,29,72,0.35)]' : tone === 'warning' ? 'border-amber-500/40 bg-amber-950/95 text-amber-100 shadow-[0_8px_30px_rgba(245,158,11,0.35)]' : 'border-purple-500/40 bg-purple-950/95 text-purple-100 shadow-[0_8px_30px_rgba(168,85,247,0.35)]'}`} style={{ left: position.left, top: position.top }}>
    <div className="max-h-[calc(100vh-3rem)] space-y-1 overflow-hidden">
      {messages.map(message => <p key={message} className="flex items-start gap-2 whitespace-pre-wrap break-words">
        {messages.length > 1 && <span aria-hidden="true" className={tone === 'danger' ? 'text-rose-400' : tone === 'warning' ? 'text-amber-400' : 'text-purple-400'}>•</span>}
        <span className="min-w-0">{message}</span>
      </p>)}
    </div>
    <span aria-hidden="true" className={`absolute -translate-x-1/2 border-x-[6px] border-x-transparent ${position.below ? `bottom-full border-b-[6px] ${tone === 'danger' ? 'border-b-rose-950/95' : tone === 'warning' ? 'border-b-amber-950/95' : 'border-b-purple-950/95'}` : `top-full border-t-[6px] ${tone === 'danger' ? 'border-t-rose-950/95' : tone === 'warning' ? 'border-t-amber-950/95' : 'border-t-purple-950/95'}`}`} style={{ left: position.arrowLeft }} />
  </div>, document.body)
}

export function useExcelValidationTooltip(messagesForRange: (range: ScheduleRange) => readonly string[], toneForRange?: (range: ScheduleRange) => ExcelValidationTone) {
  const [hover, setHover] = useState<{ range: ScheduleRange; anchor: TooltipAnchor } | null>(null)
  const hideValidationTooltip = useCallback(() => setHover(null), [])
  const showValidationTooltip = (range: ScheduleRange, element: HTMLElement) => {
    if (!messagesForRange(range).length) { hideValidationTooltip(); return }
    const { left, right, top, bottom } = element.getBoundingClientRect()
    setHover({ range, anchor: { left, right, top, bottom } })
  }
  useEffect(() => {
    window.addEventListener('scroll', hideValidationTooltip, true)
    window.addEventListener('resize', hideValidationTooltip)
    return () => {
      window.removeEventListener('scroll', hideValidationTooltip, true)
      window.removeEventListener('resize', hideValidationTooltip)
    }
  }, [hideValidationTooltip])
  const messages = hover ? messagesForRange(hover.range) : []
  return { showValidationTooltip, hideValidationTooltip, validationTooltip: hover && messages.length ? <ExcelValidationTooltip anchor={hover.anchor} messages={messages} tone={toneForRange?.(hover.range)} /> : null }
}
