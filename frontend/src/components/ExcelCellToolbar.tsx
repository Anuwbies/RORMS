import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ExcelColorPalette, MAX_CUSTOM_COLORS } from './ExcelColorPalette'
import { ToolbarIconButton } from './ToolbarIconButton'
import { ExcelTextLayoutToolbar } from './ExcelTextLayoutToolbar'
import { ExcelFontMenu } from './ExcelFontMenu'
import { useLatestEvent } from '../hooks/useLatestEvent'

export type BorderPreset = 'all' | 'inner' | 'horizontal' | 'vertical' | 'outer' | 'left' | 'top' | 'right' | 'bottom' | 'none'
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double'
export type MergePreset = 'all' | 'vertical' | 'horizontal' | 'unmerge'

interface BorderStyleOption {
  label: string
  width: number
  style: BorderLineStyle
}

const borderStyleOptions: BorderStyleOption[] = [
  { label: 'Thin solid', width: 1, style: 'solid' },
  { label: 'Medium solid', width: 2, style: 'solid' },
  { label: 'Thick solid', width: 3, style: 'solid' },
  { label: 'Dashed', width: 1, style: 'dashed' },
  { label: 'Dotted', width: 1, style: 'dotted' },
  { label: 'Double', width: 3, style: 'double' },
]

const borderPresets: { preset: BorderPreset; label: string; path: string }[] = [
  { preset: 'all', label: 'All borders', path: 'M4 4h16v16H4zM12 4v16M4 12h16' },
  { preset: 'inner', label: 'Inner borders', path: 'M12 4v16M4 12h16' },
  { preset: 'horizontal', label: 'Horizontal borders', path: 'M4 12h16' },
  { preset: 'vertical', label: 'Vertical borders', path: 'M12 4v16' },
  { preset: 'outer', label: 'Outer borders', path: 'M4 4h16v16H4z' },
  { preset: 'left', label: 'Left border', path: 'M4 4v16' },
  { preset: 'top', label: 'Top border', path: 'M4 4h16' },
  { preset: 'right', label: 'Right border', path: 'M20 4v16' },
  { preset: 'bottom', label: 'Bottom border', path: 'M4 20h16' },
  { preset: 'none', label: 'No borders', path: '' },
]

const mergePresets: { preset: MergePreset; label: string; path: string }[] = [
  { preset: 'all', label: 'Merge all', path: 'M3 12h5m-2-2 2 2-2 2M21 12h-5m2-2-2 2 2 2M12 3v5m-2-2 2 2 2-2M12 21v-5m-2 2 2-2 2 2' },
  { preset: 'vertical', label: 'Merge vertically', path: 'M12 3v18M7.5 4v5m-2-2 2 2 2-2M7.5 20v-5m-2 2 2-2 2 2M16.5 4v5m-2-2 2 2 2-2M16.5 20v-5m-2 2 2-2 2 2' },
  { preset: 'horizontal', label: 'Merge horizontally', path: 'M3 12h18M4 7.5h5m-2-2 2 2-2 2M20 7.5h-5m2-2-2 2 2 2M4 16.5h5m-2-2 2 2-2 2M20 16.5h-5m2-2-2 2 2 2' },
  { preset: 'unmerge', label: 'Unmerge', path: 'M12 3v18M3 12h18' },
]

function MergePresetIcon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]">
    <rect x="3" y="3" width="18" height="18" />
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function BorderPresetIcon({ path }: { path: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-slate-700">
    <path d="M4 4h16v16H4zM12 4v16M4 12h16" className="stroke-slate-600" strokeWidth="1.5" strokeDasharray="1 2" />
    {path && <path d={path} strokeWidth="2" strokeLinecap="square" />}
  </svg>
}

function BorderStyleSample({ option }: { option: BorderStyleOption }) {
  return <svg aria-hidden="true" viewBox="0 0 80 24" className="h-6 w-20 stroke-slate-900">
    {option.style === 'double'
      ? <path d="M5 10h70M5 14h70" strokeWidth="1" />
      : <path d="M5 12h70" fill="none" strokeWidth={option.width} strokeDasharray={option.style === 'dashed' ? '5 4' : option.style === 'dotted' ? '1 3' : undefined} strokeLinecap={option.style === 'dotted' ? 'round' : 'butt'} />}
  </svg>
}

interface ExcelCellToolbarProps {
  style: CSSProperties
  mergeDisabled?: boolean
  merged: boolean
  canUnmerge: boolean
  onStyleChange: (style: CSSProperties) => void
  onFontChange: (font: string) => void
  onBorderChange: (preset: BorderPreset, color: string, width: number, lineStyle: BorderLineStyle) => void
  onBorderLineChange: (color: string, width: number, lineStyle: BorderLineStyle) => void
  onMergeToggle: () => void
  onMergeChange: (preset: MergePreset) => void
  onPlotScheduleRows: (status: 'Plot' | 'Draft') => void
  showPlotTool?: boolean
  canPlotScheduleRows: boolean
  canUnplotScheduleRows: boolean
  selectedRowsPlotted: boolean
}

const fonts = ['Arial', 'Calibri', 'Aptos', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Courier New']
const fontSizeControl = 'h-8 rounded-md border border-slate-400 bg-gray-200 px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#a3c48b]'

export const ExcelCellToolbar = memo(function ExcelCellToolbar({ style, mergeDisabled, merged, canUnmerge, onStyleChange, onFontChange, onBorderChange, onBorderLineChange, onMergeToggle, onMergeChange, onPlotScheduleRows, showPlotTool = false, canPlotScheduleRows, canUnplotScheduleRows, selectedRowsPlotted }: ExcelCellToolbarProps) {
  const [borderColor, setBorderColor] = useState('#000000')
  const [borderStyle, setBorderStyle] = useState(borderStyleOptions[0])
  const [borderMenuPosition, setBorderMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [borderStyleMenuPosition, setBorderStyleMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [mergeMenuPosition, setMergeMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [plotMenuPosition, setPlotMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [colorPalette, setColorPalette] = useState<{ kind: 'text' | 'fill' | 'border'; top: number; left: number } | null>(null)
  const [customColors, setCustomColors] = useState(['#000000', '#ffffff', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'])
  const borderButtonRef = useRef<HTMLButtonElement>(null)
  const borderMenuRef = useRef<HTMLDivElement>(null)
  const borderStyleButtonRef = useRef<HTMLButtonElement>(null)
  const borderStyleMenuRef = useRef<HTMLDivElement>(null)
  const mergeIconRef = useRef<HTMLButtonElement>(null)
  const mergeButtonRef = useRef<HTMLButtonElement>(null)
  const mergeMenuRef = useRef<HTMLDivElement>(null)
  const mergeMenuId = useId()
  const plotButtonRef = useRef<HTMLButtonElement>(null)
  const plotMenuRef = useRef<HTMLDivElement>(null)
  const plotMenuId = useId()
  const colorPaletteRef = useRef<HTMLDivElement>(null)
  const colorAnchorRef = useRef<HTMLElement | null>(null)
  const fontFamily = String(style.fontFamily || 'Arial').replace(/^['"]|['"]$/g, '')
  const fontSize = Number.parseFloat(String(style.fontSize || '11')) || 11
  const color = /^#[\da-f]{6}$/i.test(String(style.color)) ? String(style.color) : '#000000'
  const fill = /^#[\da-f]{6}$/i.test(String(style.backgroundColor)) ? String(style.backgroundColor) : '#ffffff'
  const isBold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 600
  const isItalic = style.fontStyle === 'italic'
  const isStrike = String(style.textDecoration || '').includes('line-through')
  const decorationWithoutStrike = String(style.textDecoration || '').replace(/\bline-through\b/g, '').trim()
  const mergeMenuOpen = mergeMenuPosition !== null
  const plotMenuOpen = plotMenuPosition !== null
  const borderMenuOpen = borderMenuPosition !== null
  const borderStyleMenuOpen = borderStyleMenuPosition !== null
  const colorPaletteOpen = colorPalette !== null
  const layoutStyle = useMemo<CSSProperties>(() => ({
    textAlign: style.textAlign, verticalAlign: style.verticalAlign, whiteSpace: style.whiteSpace,
    overflow: style.overflow, rotate: style.rotate, writingMode: style.writingMode, textOrientation: style.textOrientation,
  }), [style.textAlign, style.verticalAlign, style.whiteSpace, style.overflow, style.rotate, style.writingMode, style.textOrientation])
  const closeFormattingMenus = useLatestEvent(() => {
    setPlotMenuPosition(null)
    setMergeMenuPosition(null)
    setBorderMenuPosition(null)
    setBorderStyleMenuPosition(null)
    setColorPalette(null)
  })

  useEffect(() => {
    if (!plotMenuOpen) return
    const closeMenu = () => setPlotMenuPosition(null)
    if (!showPlotTool || !canPlotScheduleRows) { closeMenu(); return }
    const closeOutside = (event: PointerEvent) => {
      if (!plotButtonRef.current?.contains(event.target as Node) && !plotMenuRef.current?.contains(event.target as Node)) closeMenu()
    }
    const frame = requestAnimationFrame(() => plotMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus())
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [plotMenuOpen, showPlotTool, canPlotScheduleRows])

  useEffect(() => {
    if (!mergeMenuOpen) return
    const closeMenu = () => setMergeMenuPosition(null)
    const closeOutside = (event: PointerEvent) => {
      if (mergeButtonRef.current?.contains(event.target as Node) || mergeMenuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const frame = requestAnimationFrame(() => mergeMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus())
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [mergeMenuOpen])

  useEffect(() => {
    if (!borderMenuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (borderButtonRef.current?.contains(event.target as Node) || borderMenuRef.current?.contains(event.target as Node) || borderStyleMenuRef.current?.contains(event.target as Node) || colorPaletteRef.current?.contains(event.target as Node)) return
      setBorderMenuPosition(null)
      setBorderStyleMenuPosition(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [borderMenuOpen])

  useEffect(() => {
    if (!borderMenuOpen) return
    const frame = requestAnimationFrame(() => borderMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [borderMenuOpen])

  useEffect(() => {
    if (!borderStyleMenuOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (borderStyleButtonRef.current?.contains(event.target as Node) || borderStyleMenuRef.current?.contains(event.target as Node)) return
      setBorderStyleMenuPosition(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [borderStyleMenuOpen])

  useEffect(() => {
    if (!colorPaletteOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (colorAnchorRef.current?.contains(event.target as Node) || colorPaletteRef.current?.contains(event.target as Node)) return
      setColorPalette(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [colorPaletteOpen])

  useLayoutEffect(() => {
    if (!colorPalette || !colorPaletteRef.current || !colorAnchorRef.current) return
    const width = colorPaletteRef.current.getBoundingClientRect().width
    const anchorLeft = colorAnchorRef.current.getBoundingClientRect().left
    const left = Math.max(8, Math.min(anchorLeft, window.innerWidth - width - 8))
    if (left !== colorPalette.left) setColorPalette({ ...colorPalette, left })
  }, [colorPalette?.kind])

  const toggleColorPalette = (kind: 'text' | 'fill' | 'border', anchor: HTMLElement) => {
    setPlotMenuPosition(null)
    setMergeMenuPosition(null)
    if (colorPalette?.kind === kind) {
      setColorPalette(null)
      return
    }
    colorAnchorRef.current = anchor
    const rect = anchor.getBoundingClientRect()
    setColorPalette({
      kind,
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 510)),
      left: Math.max(8, rect.left),
    })
  }

  const chooseColor = useLatestEvent((chosen: string) => {
    if (colorPalette?.kind === 'text') onStyleChange({ color: chosen })
    else if (colorPalette?.kind === 'fill') onStyleChange({ backgroundColor: chosen })
    else {
      setBorderColor(chosen)
      onBorderLineChange(chosen, borderStyle.width, borderStyle.style)
    }
    setColorPalette(null)
  })

  const createColor = useLatestEvent((created: string) => {
    setCustomColors(current => [created, ...current.filter(item => item.toLowerCase() !== created.toLowerCase())].slice(0, MAX_CUSTOM_COLORS))
    chooseColor(created)
  })

  const resetColor = useLatestEvent(() => {
    if (colorPalette?.kind === 'text') onStyleChange({ color: '#000000' })
    else if (colorPalette?.kind === 'fill') onStyleChange({ backgroundColor: '#ffffff' })
    else {
      setBorderColor('#000000')
      onBorderLineChange('#000000', borderStyle.width, borderStyle.style)
    }
    setColorPalette(null)
  })

  const toggleBorderMenu = () => {
    setPlotMenuPosition(null)
    setMergeMenuPosition(null)
    if (borderMenuPosition) {
      setBorderMenuPosition(null)
      setBorderStyleMenuPosition(null)
      return
    }
    const rect = borderButtonRef.current?.getBoundingClientRect()
    const menuWidth = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 20
    if (rect) setBorderMenuPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)) })
  }

  const toggleBorderStyleMenu = () => {
    setPlotMenuPosition(null)
    setMergeMenuPosition(null)
    if (borderStyleMenuPosition) {
      setBorderStyleMenuPosition(null)
      return
    }
    const rect = borderStyleButtonRef.current?.getBoundingClientRect()
    const menuWidth = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 10
    if (rect) setBorderStyleMenuPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)) })
  }

  const applyBorder = (preset: BorderPreset) => {
    onBorderChange(preset, borderColor, borderStyle.width, borderStyle.style)
  }

  const toggleMergeMenu = () => {
    setPlotMenuPosition(null)
    if (mergeMenuPosition) {
      setMergeMenuPosition(null)
      return
    }
    const rect = mergeIconRef.current?.getBoundingClientRect()
    if (!rect) return
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    const menuWidth = rem * 11.25 + 2
    const menuHeight = rem * 3 + 2
    setBorderMenuPosition(null)
    setBorderStyleMenuPosition(null)
    setColorPalette(null)
    setMergeMenuPosition({
      top: rect.bottom + 4 + menuHeight <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
    })
  }

  const togglePlotMenu = () => {
    closeFormattingMenus()
    if (plotMenuPosition || !showPlotTool || !canPlotScheduleRows) return
    const rect = plotButtonRef.current?.getBoundingClientRect()
    if (!rect) return
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    setPlotMenuPosition({
      top: rect.bottom + 4 + rem * 5.5 <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - rem * 5.5 - 4),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rem * 11 - 8)),
    })
  }

  return (
    <div role="toolbar" aria-label="Cell formatting" className="flex shrink-0 items-center overflow-x-auto border-b border-slate-200 bg-gray-200 px-3 py-2">
      <div role="group" aria-label="Font" className="flex shrink-0 items-center gap-1.5">
      <ExcelFontMenu
        fonts={fonts}
        value={fontFamily}
        onChange={onFontChange}
        onMenuOpen={closeFormattingMenus}
      />
      <ToolbarIconButton aria-label="Decrease font size" disabled={fontSize <= 6} onClick={() => onStyleChange({ fontSize: `${Math.max(6, fontSize - 1)}pt` })} icon={<span aria-hidden="true" className="text-2xl font-medium leading-none">−</span>} />
      <input aria-label="Font size" type="number" min="6" max="72" value={fontSize} onChange={event => {
        const next = Number(event.target.value)
        if (next >= 6 && next <= 72) onStyleChange({ fontSize: `${next}pt` })
      }} className={`${fontSizeControl} w-14 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
      <ToolbarIconButton aria-label="Increase font size" disabled={fontSize >= 72} onClick={() => onStyleChange({ fontSize: `${Math.min(72, fontSize + 1)}pt` })} icon={<span aria-hidden="true" className="text-2xl font-medium leading-none">+</span>} />
      </div>
      <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-slate-500" />
      <div role="group" aria-label="Text emphasis" className="flex shrink-0 items-center gap-1.5">
      <ToolbarIconButton aria-label="Bold" aria-pressed={isBold} selected={isBold} onClick={() => onStyleChange({ fontWeight: isBold ? 'normal' : 'bold' })} icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M6 4h6a4 4 0 0 1 0 8H6V4Zm0 8h7a4 4 0 0 1 0 8H6v-8Z" strokeLinejoin="round" /></svg>} />
      <ToolbarIconButton aria-label="Italic" aria-pressed={isItalic} selected={isItalic} onClick={() => onStyleChange({ fontStyle: isItalic ? 'normal' : 'italic' })} icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M13 4h7M4 20h7M16 4 8 20" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
      <ToolbarIconButton aria-label="Strikethrough" aria-pressed={isStrike} selected={isStrike} onClick={() => onStyleChange({ textDecoration: isStrike ? decorationWithoutStrike || 'none' : [decorationWithoutStrike, 'line-through'].filter(Boolean).join(' ') })} icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2"><path d="M17 5c-1.2-1-2.6-1.5-4.5-1.5H11C8 3.5 6 5 6 7.5c0 2 1.5 3.2 4 3.5M14 13c2.6.4 4 1.5 4 3.5 0 2.2-2 4-5 4h-2c-1.9 0-3.3-.5-4.5-1.5M3 12h18" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
      </div>
      <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-slate-500" />
      <div role="group" aria-label="Colors borders and merge" className="flex shrink-0 items-center gap-1.5">
      <ToolbarIconButton
        aria-label="Text color"
        aria-expanded={colorPalette?.kind === 'text'}
        onClick={event => toggleColorPalette('text', event.currentTarget)}
        icon={<span aria-hidden="true" className="flex h-6 w-6 flex-col items-center justify-center">
          <span className="text-lg font-semibold leading-5">A</span>
          <span className="h-1 w-5" style={{ backgroundColor: color }} />
        </span>}
      />
      <ToolbarIconButton
        aria-label="Fill color"
        aria-expanded={colorPalette?.kind === 'fill'}
        onClick={event => toggleColorPalette('fill', event.currentTarget)}
        icon={<span aria-hidden="true" className="flex h-6 w-6 flex-col items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
            <path d="m4 11 8-8 8 8-8 8-8-8Z" strokeLinejoin="round" />
            <path d="M3 2 7 6" strokeLinecap="round" />
            <path d="M20 17c0-1.3 1.5-2.7 1.5-2.7S23 15.7 23 17a1.5 1.5 0 0 1-3 0Z" />
          </svg>
          <span className="h-1 w-5" style={{ backgroundColor: fill }} />
        </span>}
      />
      <ToolbarIconButton
        ref={borderButtonRef}
        aria-label="Border settings"
        title="Border settings"
        aria-expanded={Boolean(borderMenuPosition)}
        onClick={toggleBorderMenu}
        icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
          <rect x="3" y="3" width="18" height="18" />
          <path d="M12 3v18M3 12h18" />
        </svg>}
      />
      <span className="inline-flex h-10 w-14 shrink-0 items-center">
        <ToolbarIconButton
          ref={mergeIconRef}
          disabled={mergeDisabled && !merged}
          aria-label={merged ? 'Unmerge cells' : 'Merge selected cells'}
          title={merged ? 'Unmerge cells' : 'Merge selected cells'}
          aria-pressed={merged}
          onClick={onMergeToggle}
          className={`rounded-r-none ${merged ? 'text-[#41572a]' : ''}`}
          icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
            <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" strokeLinejoin="round" />
            <path d="m8 8-5-5m13 5 5-5m-5 13 5 5M8 16l-5 5" />
          </svg>}
        />
        <button
          ref={mergeButtonRef}
          type="button"
          aria-label="Merge options"
          title="Merge options"
          aria-haspopup="menu"
          aria-expanded={Boolean(mergeMenuPosition)}
          aria-controls={mergeMenuPosition ? mergeMenuId : undefined}
          onClick={toggleMergeMenu}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!mergeMenuPosition) toggleMergeMenu()
            }
          }}
          className="inline-flex h-10 w-4 shrink-0 items-center justify-center rounded-r-md border border-transparent bg-transparent text-slate-700 hover:bg-[#e3edda] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#62853e]"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0 fill-current"><path d="m2 4 4 4 4-4Z" /></svg>
        </button>
      </span>
      </div>
      <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-slate-500" />
      <div role="group" aria-label="Text layout" className="flex shrink-0 items-center gap-1.5">
        <ExcelTextLayoutToolbar
          style={layoutStyle}
          onStyleChange={onStyleChange}
          onMenuOpen={closeFormattingMenus}
        />
      </div>
      {showPlotTool && <span aria-hidden="true" className="mx-2 h-6 w-px shrink-0 bg-slate-500" />}
      {showPlotTool && <div role="group" aria-label="Schedule tools" className="flex shrink-0 items-center gap-1.5">
      <ToolbarIconButton
        ref={plotButtonRef}
        aria-label="Plot options"
        title={canPlotScheduleRows ? 'Plot or unplot selected schedule rows' : 'Select cells from College through Status on rows assigned to a year'}
        aria-haspopup="menu"
        aria-expanded={plotMenuOpen}
        aria-controls={plotMenuOpen ? plotMenuId : undefined}
        withArrow
        selected={selectedRowsPlotted}
        disabled={!canPlotScheduleRows}
        onClick={togglePlotMenu}
        onKeyDown={event => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !plotMenuOpen) {
            event.preventDefault()
            togglePlotMenu()
          }
        }}
        icon={<svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5]"><path d="M3 4h18v16H3zM3 9h18M8 9v11m3-6 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      />
      </div>}
      {showPlotTool && plotMenuPosition && createPortal(
        <div ref={plotMenuRef} id={plotMenuId} role="menu" aria-label="Schedule status options"
          className="fixed z-[250] w-44 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-1 text-sm text-slate-700 shadow-xl"
          style={plotMenuPosition}
          onKeyDown={event => {
            if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault()
              event.stopPropagation()
              setPlotMenuPosition(null)
              plotButtonRef.current?.focus()
            } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              event.stopPropagation()
              const items = Array.from(plotMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') || [])
              const index = items.indexOf(document.activeElement as HTMLButtonElement)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
              items[next]?.focus()
            }
          }}>
          {(['Plot', 'Draft'] as const).map(status => <button key={status} type="button" role="menuitem" tabIndex={-1}
            disabled={!canPlotScheduleRows || (status === 'Plot' ? selectedRowsPlotted : !canUnplotScheduleRows)}
            onClick={() => {
              onPlotScheduleRows(status)
              setPlotMenuPosition(null)
              plotButtonRef.current?.focus()
            }}
            className="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#e3edda] focus-visible:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.5]"><path d={status === 'Plot' ? 'm5 12 4 4L19 6' : 'M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5'} strokeLinecap="round" strokeLinejoin="round" /></svg>
            {status === 'Plot' ? 'Plot' : 'Unplot (Draft)'}
          </button>)}
        </div>, document.body,
      )}
      {mergeMenuPosition && createPortal(
        <div
          ref={mergeMenuRef}
          id={mergeMenuId}
          role="menu"
          aria-label="Merge options"
          aria-orientation="horizontal"
          className="fixed z-[250] flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-slate-700 shadow-xl"
          style={mergeMenuPosition}
          onKeyDown={event => {
            if (event.key === 'Escape' || event.key === 'Tab') {
              if (event.key === 'Escape') event.preventDefault()
              event.stopPropagation()
              setMergeMenuPosition(null)
              mergeButtonRef.current?.focus()
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              event.stopPropagation()
              const items = Array.from(mergeMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') || [])
              const index = items.indexOf(document.activeElement as HTMLButtonElement)
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
              items[next]?.focus()
            }
          }}
        >
          {mergePresets.map(({ preset, label, path }) => <button
            key={preset}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-label={label}
            title={label}
            disabled={preset === 'unmerge' ? !canUnmerge : mergeDisabled}
            onClick={() => {
              onMergeChange(preset)
              setMergeMenuPosition(null)
              mergeButtonRef.current?.focus()
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md hover:bg-[#e3edda] focus-visible:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          ><MergePresetIcon path={path} /></button>)}
        </div>,
        document.body,
      )}
      {borderMenuPosition && createPortal(
        <div
          ref={borderMenuRef}
          role="menu"
          aria-label="Border settings"
          className="fixed z-[250] flex w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 shadow-xl"
          style={borderMenuPosition}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setBorderMenuPosition(null)
              setBorderStyleMenuPosition(null)
              borderButtonRef.current?.focus()
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
              const items = Array.from(borderMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])
              const index = items.indexOf(document.activeElement as HTMLButtonElement)
              if (index < 0) return
              event.preventDefault()
              const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -5 : 5
              items[Math.max(0, Math.min(items.length - 1, index + step))]?.focus()
            }
          }}
        >
          <div role="group" aria-label="Border presets" className="grid flex-1 grid-cols-5 gap-1">
            {borderPresets.map(({ preset, label, path }) => <button
              key={preset}
              type="button"
              role="menuitem"
              aria-label={label}
              title={label}
              onClick={() => applyBorder(preset)}
              className="flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-[#e3edda] focus-visible:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e]"
            ><BorderPresetIcon path={path} /></button>)}
          </div>
          <div className="ml-2 flex shrink-0 flex-col gap-1 border-l border-slate-200 pl-2">
            <button type="button" aria-label="Border color" title="Border color" onClick={event => toggleColorPalette('border', event.currentTarget)} className="relative flex h-10 w-10 flex-col items-center justify-center rounded-md hover:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-slate-700 stroke-2"><path d="m5 16 9-9 3 3-9 9-4 1 1-4ZM13 8l3-3a2 2 0 0 1 3 3l-3 3" strokeLinejoin="round" /></svg>
              <span className="h-1 w-6" style={{ backgroundColor: borderColor }} />
              <span aria-hidden="true" className="absolute right-0 top-1 text-[8px] leading-none">▾</span>
            </button>
            <button ref={borderStyleButtonRef} type="button" aria-label="Border style" aria-expanded={Boolean(borderStyleMenuPosition)} title="Border style" onClick={toggleBorderStyleMenu} className="relative flex h-10 w-10 items-center justify-center rounded-md hover:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-slate-700"><path d="M3 5h18M3 12h18M3 19h18" strokeWidth="2" /></svg>
              <span aria-hidden="true" className="absolute right-0 top-1 text-[8px] leading-none">▾</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
      {borderStyleMenuPosition && createPortal(
        <div
          ref={borderStyleMenuRef}
          role="menu"
          aria-label="Border style"
          className="fixed z-[260] w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          style={borderStyleMenuPosition}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setBorderStyleMenuPosition(null)
              borderStyleButtonRef.current?.focus()
            }
          }}
        >
          {borderStyleOptions.map(option => <button
            key={option.label}
            type="button"
            role="menuitemradio"
            aria-label={option.label}
            aria-checked={borderStyle.label === option.label}
            title={option.label}
            onClick={() => {
              setBorderStyle(option)
              onBorderLineChange(borderColor, option.width, option.style)
            }}
            className="flex h-10 w-full items-center gap-2 rounded-md px-2 hover:bg-[#e3edda] focus-visible:bg-[#e3edda] focus-visible:outline-2 focus-visible:outline-[#62853e]"
          >
            <span className="w-4 text-center text-sm text-[#41572a]">{borderStyle.label === option.label ? '✓' : ''}</span>
            <BorderStyleSample option={option} />
          </button>)}
        </div>,
        document.body,
      )}
      {colorPalette && createPortal(
        <div
          ref={colorPaletteRef}
          role="dialog"
          aria-label={`${colorPalette.kind} color choices`}
          className="fixed z-[260] w-fit max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{ top: colorPalette.top, left: colorPalette.left }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setColorPalette(null)
              colorAnchorRef.current?.focus()
            }
          }}
        >
          <ExcelColorPalette
            key={colorPalette.kind}
            currentColor={colorPalette.kind === 'text' ? color : colorPalette.kind === 'fill' ? fill : borderColor}
            customColors={customColors}
            onSelect={chooseColor}
            onCreate={createColor}
            onReset={resetColor}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}, (previous, next) => {
  if (previous.merged !== next.merged || previous.canUnmerge !== next.canUnmerge
    || previous.mergeDisabled !== next.mergeDisabled
    || previous.showPlotTool !== next.showPlotTool
    || previous.canPlotScheduleRows !== next.canPlotScheduleRows
    || previous.canUnplotScheduleRows !== next.canUnplotScheduleRows
    || previous.selectedRowsPlotted !== next.selectedRowsPlotted || previous.onPlotScheduleRows !== next.onPlotScheduleRows
    || previous.onStyleChange !== next.onStyleChange || previous.onFontChange !== next.onFontChange
    || previous.onBorderChange !== next.onBorderChange || previous.onBorderLineChange !== next.onBorderLineChange
    || previous.onMergeToggle !== next.onMergeToggle || previous.onMergeChange !== next.onMergeChange) return false
  if (previous.style === next.style) return true
  const keys = Object.keys(previous.style) as (keyof CSSProperties)[]
  return keys.length === Object.keys(next.style).length && keys.every(key => Object.is(previous.style[key], next.style[key]))
})
