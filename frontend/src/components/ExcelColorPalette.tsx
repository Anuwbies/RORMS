import { memo, useEffect, useRef, useState } from 'react'
import { ExcelCustomColorPicker } from './ExcelCustomColorPicker'

interface ExcelColorPaletteProps {
  currentColor: string
  customColors: string[]
  onSelect: (color: string) => void
  onCreate: (color: string) => void
  onReset: () => void
}

interface ColorEyeDropper {
  open: (options: { signal: AbortSignal }) => Promise<{ sRGBHex: string }>
}

export const MAX_CUSTOM_COLORS = 19

const neutrals = ['#000000', '#404040', '#666666', '#999999', '#b7b7b7', '#cccccc', '#dddddd', '#eeeeee', '#f4f4f4', '#ffffff']
const accents = ['#990000', '#ff0000', '#ff9900', '#ffff00', '#00d900', '#00d9dd', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff']
const shades = [
  ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
  ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
  ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
  ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
  ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
  ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130'],
]

const swatches = [...neutrals, ...accents, ...shades.flat()]

export const ExcelColorPalette = memo(function ExcelColorPalette({ currentColor, customColors, onSelect, onCreate, onReset }: ExcelColorPaletteProps) {
  const [creatingColor, setCreatingColor] = useState(false)
  const [pickingColor, setPickingColor] = useState(false)
  const [pickError, setPickError] = useState('')
  const createColorButtonRef = useRef<HTMLButtonElement>(null)
  const pickColorButtonRef = useRef<HTMLButtonElement>(null)
  const pickControllerRef = useRef<AbortController | null>(null)
  const EyeDropper = typeof window === 'undefined' ? undefined : (window as Window & { EyeDropper?: new () => ColorEyeDropper }).EyeDropper

  useEffect(() => () => pickControllerRef.current?.abort(), [])

  const pickColor = async () => {
    if (!EyeDropper || pickControllerRef.current) return
    const controller = new AbortController()
    pickControllerRef.current = controller
    setPickingColor(true)
    setPickError('')
    try {
      const { sRGBHex } = await new EyeDropper().open({ signal: controller.signal })
      if (!controller.signal.aborted) onCreate(sRGBHex.toLowerCase())
    } catch (error) {
      if (controller.signal.aborted) return
      if (!(error instanceof DOMException && error.name === 'AbortError')) setPickError('Unable to pick a color. Try again.')
      pickColorButtonRef.current?.focus()
    } finally {
      if (!controller.signal.aborted) setPickingColor(false)
      if (pickControllerRef.current === controller) pickControllerRef.current = null
    }
  }

  if (creatingColor) return <ExcelCustomColorPicker
    initialColor={currentColor}
    onConfirm={color => {
      setCreatingColor(false)
      onCreate(color)
    }}
    onCancel={() => {
      setCreatingColor(false)
      requestAnimationFrame(() => createColorButtonRef.current?.focus())
    }}
  />

  return <>
    <button type="button" onClick={onReset} className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-[#e3edda]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
        <path d="M4 4 20 20M8 3 3 8l13 13 5-5L8 3Z" strokeLinejoin="round" />
      </svg>
      Reset
    </button>
    <div role="group" aria-label="Preset colors" className="grid w-fit grid-cols-10 gap-0.5">
      {swatches.map((swatch, index) => (
        <button
          key={`${swatch}-${index}`}
          type="button"
          aria-label={`Choose color ${swatch}`}
          aria-pressed={currentColor.toLowerCase() === swatch.toLowerCase()}
          onClick={() => onSelect(swatch)}
          className="flex h-8 w-8 items-center justify-center justify-self-center rounded-full border border-black/10 hover:outline-2 hover:outline-[#62853e]"
          style={{ backgroundColor: swatch }}
        >
          {currentColor.toLowerCase() === swatch.toLowerCase() && <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 fill-none stroke-2 ${['#ffffff', '#f4f4f4', '#eeeeee', '#dddddd', '#cccccc'].includes(swatch) ? 'stroke-slate-800' : 'stroke-white'}`}><path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
      ))}
    </div>
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Custom colors</p>
      <div className="grid w-fit grid-cols-10 gap-0.5">
        {customColors.slice(0, MAX_CUSTOM_COLORS).map((swatch, index) => <button key={`${swatch}-${index}`} type="button" aria-label={`Choose custom color ${swatch}`} onClick={() => onSelect(swatch)} className="h-8 w-8 rounded-full border border-black/10 hover:outline-2 hover:outline-[#62853e]" style={{ backgroundColor: swatch }} />)}
        <button ref={createColorButtonRef} type="button" onClick={() => setCreatingColor(true)} className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-slate-500 text-xl text-slate-600 hover:bg-[#e3edda]" aria-label="Choose a custom color">
          +
        </button>
        <button
          ref={pickColorButtonRef}
          type="button"
          onClick={pickColor}
          disabled={!EyeDropper || pickingColor}
          aria-label="Pick a custom color from the screen"
          title={EyeDropper ? 'Pick a custom color from another cell. Press Esc to cancel.' : 'Screen color picking is unavailable in this browser. Use + to choose a custom color.'}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
            <path d="m14 5 5 5M12 7l5 5M4 16l9-9 4 4-9 9H4v-4Zm11-11 3-3a2.12 2.12 0 0 1 3 3l-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {pickError && <p role="alert" className="mt-2 text-xs text-rose-600">{pickError}</p>}
    </div>
  </>
})
