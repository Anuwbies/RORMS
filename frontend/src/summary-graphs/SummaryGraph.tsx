export interface SummaryGraphPoint {
  label: string
  value: number
  tooltipLabel?: string
}

interface SummaryGraphProps {
  points: SummaryGraphPoint[]
  total?: number
  unit?: string
  tone?: 'brand' | 'emerald' | 'amber' | 'sky' | 'rose'
  variant?: 'bar' | 'pie' | 'line'
  showLegendValues?: boolean
}

const palettes = {
  brand: ['#62853e', '#a3c48b', '#c6dbb6'],
  emerald: ['#10b981', '#6ee7b7', '#a7f3d0'],
  amber: ['#f59e0b', '#fbbf24', '#fde68a'],
  sky: ['#0284c7', '#38bdf8', '#bae6fd'],
  rose: ['#f43f5e', '#fb7185', '#fecdd3'],
}

const tooltipColors = {
  brand: '#41572a',
  emerald: '#047857',
  amber: '#78350f',
  sky: '#075985',
  rose: '#9f1239',
}

const chartWidth = 300
const chartHeight = 170
const plotLeft = 10
const plotRight = 8
const plotTop = 16
const plotBottom = 134

function shortenLabel(label: string) {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label
}

function AxisGuides({ largestValue, leftPadding = plotLeft, rightPadding = plotRight }: { largestValue: number, leftPadding?: number, rightPadding?: number }) {
  return (
    <g aria-hidden="true">
      {[0, 1, 2, 3].map(index => {
        const fraction = index / 3
        const y = plotBottom - fraction * (plotBottom - plotTop)
        const value = largestValue * fraction

        return (
          <g key={index}>
            <line x1={leftPadding} y1={y} x2={chartWidth - rightPadding} y2={y} stroke="#dbe4ee" strokeDasharray="3 3" />
          </g>
        )
      })}
    </g>
  )
}

interface HoveredPoint {
  label: string
  value: number
  x: number
  y: number
}

function getHoveredPoint(event: MouseEvent<SVGElement>, point: SummaryGraphPoint): HoveredPoint {
  const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget
  const bounds = svg.getBoundingClientRect()

  return {
    label: point.tooltipLabel || point.label,
    value: point.value,
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  }
}

function GraphTooltip({ point, color }: { point: HoveredPoint | null, color: string }) {
  if (!point) return null
  const opensBelow = point.y < 48

  return (
    <div
      className={`pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-2xl border px-3 py-1.5 text-xs font-semibold text-white ${opensBelow ? '' : '-translate-y-full'}`}
      role="tooltip"
      style={{ left: point.x, top: opensBelow ? point.y + 14 : point.y - 6, backgroundColor: color, borderColor: color }}
    >
      {point.label}: <strong>{point.value.toLocaleString()}</strong>
      <span className={`absolute left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 ${opensBelow ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r'}`} style={{ backgroundColor: color, borderColor: color }} />
    </div>
  )
}

function BarGraph({ data, colors, tooltipColor }: { data: SummaryGraphPoint[], colors: string[], tooltipColor: string }) {
  const largestValue = Math.max(...data.map(point => point.value), 1)
  const slotWidth = (chartWidth - plotLeft - plotRight) / data.length
  const barWidth = Math.min(44, slotWidth * 0.64)
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null)

  return (
    <div className="relative h-full w-full">
      <svg className="h-full w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <AxisGuides largestValue={largestValue} />
        {data.map((point, index) => {
          const height = (point.value / largestValue) * (plotBottom - plotTop)
          const x = plotLeft + slotWidth * index + (slotWidth - barWidth) / 2
          const y = plotBottom - height

          return (
            <g key={point.label} onMouseEnter={event => setHoveredPoint(getHoveredPoint(event, point))} onMouseMove={event => setHoveredPoint(getHoveredPoint(event, point))} onMouseLeave={() => setHoveredPoint(null)}>
              <rect x={x} y={y} width={barWidth} height={height} rx="4" fill={colors[index % colors.length]} />
              <text x={x + barWidth / 2} y="158" textAnchor="middle" fill="#475569" fontSize="10" fontWeight="600">{shortenLabel(point.label)}</text>
            </g>
          )
        })}
      </svg>
      <GraphTooltip point={hoveredPoint} color={tooltipColor} />
    </div>
  )
}

function LineGraph({ data, colors, tooltipColor }: { data: SummaryGraphPoint[], colors: string[], tooltipColor: string }) {
  const largestValue = Math.max(...data.map(point => point.value), 1)
  const linePlotLeft = 18
  const linePlotRight = 18
  const usableWidth = chartWidth - linePlotLeft - linePlotRight
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null)
  const pointPosition = (point: SummaryGraphPoint, index: number) => {
    const x = data.length === 1 ? linePlotLeft + usableWidth / 2 : linePlotLeft + (usableWidth / (data.length - 1)) * index
    const y = plotBottom - (point.value / largestValue) * (plotBottom - plotTop)
    return { x, y }
  }
  const positions = data.map(pointPosition)

  return (
    <div className="relative h-full w-full">
      <svg className="h-full w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <AxisGuides largestValue={largestValue} leftPadding={linePlotLeft} rightPadding={linePlotRight} />
        <polyline points={positions.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={colors[0]} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((point, index) => {
          const position = positions[index]
          return (
            <g key={point.label} onMouseEnter={event => setHoveredPoint(getHoveredPoint(event, point))} onMouseMove={event => setHoveredPoint(getHoveredPoint(event, point))} onMouseLeave={() => setHoveredPoint(null)}>
              <circle cx={position.x} cy={position.y} r="5" fill={colors[0]} stroke="#f1f5f9" strokeWidth="3" />
              <text x={position.x} y="158" textAnchor="middle" fill="#475569" fontSize="10" fontWeight="600">{shortenLabel(point.label)}</text>
            </g>
          )
        })}
      </svg>
      <GraphTooltip point={hoveredPoint} color={tooltipColor} />
    </div>
  )
}

function PieGraph({ data, colors, tooltipColor, showLegendValues }: { data: SummaryGraphPoint[], colors: string[], tooltipColor: string, showLegendValues: boolean }) {
  const total = data.reduce((sum, point) => sum + point.value, 0)
  const radius = 38
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null)

  return (
    <div className="flex h-full min-h-0 w-full items-start gap-3 p-3" aria-hidden="true">
      <div className="relative h-full min-w-0 flex-[0_0_52%]">
        <svg className="h-full w-full" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="27" />
          {data.map((point, index) => {
            const length = (point.value / total) * circumference
            const segmentOffset = offset
            offset += length
            return (
              <circle
                key={point.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="27"
                strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                strokeDashoffset={-segmentOffset}
                strokeLinecap="butt"
                transform="rotate(-90 60 60)"
                onMouseEnter={event => setHoveredPoint(getHoveredPoint(event, point))}
                onMouseMove={event => setHoveredPoint(getHoveredPoint(event, point))}
                onMouseLeave={() => setHoveredPoint(null)}
              >
              </circle>
            )
          })}
        </svg>
        <GraphTooltip point={hoveredPoint} color={tooltipColor} />
      </div>
      <figcaption className="min-h-0 min-w-0 flex-1 self-stretch space-y-2 overflow-y-auto border-l border-slate-300 py-3 pl-3 text-xs font-medium text-slate-600 sm:text-sm">
        {data.map((point, index) => (
          <div key={point.label} className="flex min-w-0 items-start gap-1.5 border-b border-dashed border-slate-300 pb-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
            <span className="min-w-0 break-words">{point.label}{showLegendValues && <> <strong className="font-bold text-slate-800">{point.value.toLocaleString()}</strong></>}</span>
          </div>
        ))}
      </figcaption>
    </div>
  )
}

export function SummaryGraph({ points, total, unit, tone = 'brand', variant = 'bar', showLegendValues = true }: SummaryGraphProps) {
  const colors = palettes[tone]
  const tooltipColor = tooltipColors[tone]
  const data = points.map(point => ({ label: point.label, value: Math.max(0, point.value), tooltipLabel: point.tooltipLabel }))
  const summary = total ?? data.reduce((sum, point) => sum + point.value, 0)
  const hasData = data.some(point => point.value > 0)

  return (
    <figure className="flex h-full min-h-0 w-full flex-col rounded-xl border border-slate-300 bg-slate-100 shadow-inner" aria-label={`${summary.toLocaleString()}${unit ? ` ${unit}` : ''}. ${points.map(point => `${point.label}: ${point.value}`).join(', ')}`}>
      {hasData ? (
        variant === 'pie' ? <PieGraph data={data} colors={colors} tooltipColor={tooltipColor} showLegendValues={showLegendValues} /> : (
          <div className="min-h-0 w-full flex-1">
            {variant === 'line' ? <LineGraph data={data} colors={colors} tooltipColor={tooltipColor} /> : <BarGraph data={data} colors={colors} tooltipColor={tooltipColor} />}
          </div>
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs font-medium text-slate-400">No data yet</div>
      )}
    </figure>
  )
}
import { useState, type MouseEvent } from 'react'
