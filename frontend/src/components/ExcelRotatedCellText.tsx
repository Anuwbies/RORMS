import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ExcelCellFontText } from './ExcelCellFontText'
import type { ExcelFontRun } from '../utils/excelFontRuns'

interface ExcelRotatedCellTextProps {
  text: string
  angle: number
  cellStyle: CSSProperties
  runs?: readonly ExcelFontRun[]
}

interface RotatedTextBounds {
  cellWidth: number
  cellHeight: number
  textWidth: number
  textHeight: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

export function ExcelRotatedCellText({ text, angle, cellStyle, runs }: ExcelRotatedCellTextProps) {
  const areaRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [bounds, setBounds] = useState<RotatedTextBounds>({
    cellWidth: 0, cellHeight: 0, textWidth: 0, textHeight: 0,
    paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0,
  })
  const { textAlign, verticalAlign, whiteSpace, overflowWrap, writingMode, textOrientation, fontFamily, fontSize, fontWeight, fontStyle } = cellStyle
  const verticalWriting = writingMode === 'vertical-rl' || writingMode === 'vertical-lr' || writingMode === 'sideways-rl' || writingMode === 'sideways-lr'
  const wrapping = !whiteSpace || ['normal', 'pre-wrap', 'pre-line', 'break-spaces'].includes(String(whiteSpace))
  const availableWidth = Math.max(0, bounds.cellWidth - bounds.paddingLeft - bounds.paddingRight)
  const availableHeight = Math.max(0, bounds.cellHeight - bounds.paddingTop - bounds.paddingBottom)

  useLayoutEffect(() => {
    const area = areaRef.current
    const content = textRef.current
    const cell = area?.parentElement
    if (!area || !content || !cell) return
    const measure = () => {
      const areaStyle = getComputedStyle(area)
      const textStyle = getComputedStyle(content)
      const padding = getComputedStyle(cell)
      const next: RotatedTextBounds = {
        cellWidth: Number.parseFloat(areaStyle.width) || area.clientWidth,
        cellHeight: Number.parseFloat(areaStyle.height) || area.clientHeight,
        textWidth: Number.parseFloat(textStyle.width) || content.offsetWidth,
        textHeight: Number.parseFloat(textStyle.height) || content.offsetHeight,
        paddingLeft: Number.parseFloat(padding.paddingLeft) || 0,
        paddingRight: Number.parseFloat(padding.paddingRight) || 0,
        paddingTop: Number.parseFloat(padding.paddingTop) || 0,
        paddingBottom: Number.parseFloat(padding.paddingBottom) || 0,
      }
      setBounds(current => (Object.keys(next) as (keyof RotatedTextBounds)[]).every(key => Math.abs(current[key] - next[key]) < 0.01) ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    observer.observe(content)
    return () => observer.disconnect()
  }, [text, runs, angle, textAlign, verticalAlign, whiteSpace, overflowWrap, writingMode, textOrientation, fontFamily, fontSize, fontWeight, fontStyle, availableWidth, availableHeight])

  const radians = angle * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const rotatedWidth = bounds.textWidth * cosine + bounds.textHeight * sine
  const rotatedHeight = bounds.textWidth * sine + bounds.textHeight * cosine
  const horizontalSpace = availableWidth - rotatedWidth
  const verticalSpace = availableHeight - rotatedHeight
  const alignRight = textAlign === 'right' || textAlign === 'end'
  const left = bounds.paddingLeft + (textAlign === 'center' ? horizontalSpace / 2 : alignRight ? horizontalSpace : 0)
  const top = bounds.paddingTop + (verticalAlign === 'middle' ? verticalSpace / 2 : verticalAlign === 'top' ? 0 : verticalSpace)
  const lineWidth = Math.abs(angle % 180) === 90 ? availableHeight : availableWidth

  return <span ref={areaRef} className="pointer-events-none absolute inset-0">
    <span
      ref={textRef}
      className="absolute inline-block h-max w-max origin-center"
      style={{
        // Align the visible rotated rectangle, then compensate for rotation around the text's center.
        left: left + (rotatedWidth - bounds.textWidth) / 2,
        top: top + (rotatedHeight - bounds.textHeight) / 2,
        rotate: `${angle}deg`,
        fontFamily,
        writingMode,
        textOrientation,
        whiteSpace,
        overflowWrap,
        maxWidth: wrapping && !verticalWriting && lineWidth > 0 ? lineWidth : undefined,
        maxHeight: wrapping && verticalWriting && availableHeight > 0 ? availableHeight : undefined,
      }}
    >{runs ? <ExcelCellFontText runs={runs} /> : text}</span>
  </span>
}
