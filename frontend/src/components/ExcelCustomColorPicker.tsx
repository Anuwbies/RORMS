import { useEffect, useRef, useState, type PointerEvent } from 'react'

interface ExcelCustomColorPickerProps {
  initialColor: string
  onConfirm: (color: string) => void
  onCancel: () => void
}

interface HsvColor {
  hue: number
  saturation: number
  value: number
}

function hexToHsv(hex: string): HsvColor {
  const rgb = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
  const [red, green, blue] = rgb
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  const delta = max - min
  const hue = delta === 0 ? 0 : max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return { hue: (hue * 60 + 360) % 360, saturation: max === 0 ? 0 : delta / max * 100, value: max * 100 }
}

function hsvToHex({ hue, saturation, value }: HsvColor): string {
  const chroma = value / 100 * saturation / 100
  const sector = (hue % 360) / 60
  const secondary = chroma * (1 - Math.abs(sector % 2 - 1))
  const offset = value / 100 - chroma
  const rgb = sector < 1 ? [chroma, secondary, 0] : sector < 2 ? [secondary, chroma, 0] : sector < 3 ? [0, chroma, secondary] : sector < 4 ? [0, secondary, chroma] : sector < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary]
  return `#${rgb.map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('')}`
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value))

export function ExcelCustomColorPicker({ initialColor, onConfirm, onCancel }: ExcelCustomColorPickerProps) {
  const [color, setColor] = useState(() => hexToHsv(initialColor))
  const [hexInput, setHexInput] = useState(initialColor)
  const colorAreaRef = useRef<HTMLDivElement>(null)
  const selectedColor = hsvToHex(color)
  const validHex = /^#?[\da-f]{6}$/i.test(hexInput)

  useEffect(() => {
    colorAreaRef.current?.focus()
  }, [])

  const updateColor = (next: HsvColor) => {
    setColor(next)
    setHexInput(hsvToHex(next))
  }

  const updateColorAtPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    updateColor({ ...color, saturation: clampPercent((event.clientX - rect.left) / rect.width * 100), value: clampPercent(100 - (event.clientY - rect.top) / rect.height * 100) })
  }

  return <div
    role="group"
    aria-label="Create custom color"
    className="w-[21.125rem] space-y-3"
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      } else if (event.key === 'Enter' && validHex) {
        event.preventDefault()
        event.stopPropagation()
        onConfirm(selectedColor)
      }
    }}
  >
    <p className="text-sm font-semibold text-slate-700">Create color</p>
    <div
      ref={colorAreaRef}
      role="slider"
      tabIndex={0}
      aria-label="Color saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(color.saturation)}
      aria-valuetext={`${Math.round(color.saturation)}% saturation, ${Math.round(color.value)}% brightness`}
      className="relative aspect-[5/3] w-full touch-none cursor-crosshair overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e]"
      style={{ backgroundColor: `hsl(${color.hue} 100% 50%)` }}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        updateColorAtPointer(event)
      }}
      onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateColorAtPointer(event)
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 10 : 1
        updateColor({
          ...color,
          saturation: clampPercent(color.saturation + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
          value: clampPercent(color.value + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)),
        })
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff,transparent)]" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#000000,transparent)]" />
      <span aria-hidden="true" className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_#0f172a]" style={{ left: `${color.saturation}%`, top: `${100 - color.value}%` }} />
    </div>
    <label className="block space-y-1 text-xs text-slate-600">
      <span>Hue</span>
      <input
        type="range"
        min="0"
        max="360"
        value={color.hue}
        onChange={event => updateColor({ ...color, hue: Number(event.target.value) })}
        className="block h-3 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-slate-700 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-slate-700"
      />
    </label>
    <div className="flex items-end gap-2">
      <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: selectedColor }} />
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-600">
        Hex color
        <input
          type="text"
          value={hexInput}
          maxLength={7}
          aria-invalid={!validHex}
          spellCheck={false}
          onChange={event => {
            const next = event.target.value
            setHexInput(next)
            if (/^#?[\da-f]{6}$/i.test(next)) setColor(hexToHsv(next.startsWith('#') ? next : `#${next}`))
          }}
          className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#a3c48b]"
        />
      </label>
    </div>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="h-8 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#62853e]">Cancel</button>
      <button type="button" disabled={!validHex} onClick={() => onConfirm(selectedColor)} className="h-8 rounded-md bg-[#62853e] px-3 text-sm text-white hover:bg-[#526f34] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#62853e] disabled:cursor-not-allowed disabled:opacity-40">OK</button>
    </div>
  </div>
}
