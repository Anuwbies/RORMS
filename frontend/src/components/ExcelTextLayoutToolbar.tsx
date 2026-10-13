import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ToolbarIconButton } from './ToolbarIconButton'

type LayoutMenu = 'horizontal' | 'vertical' | 'wrap' | 'rotation'

interface LayoutOption {
  value: string
  label: string
  patch: CSSProperties
}

interface ExcelTextLayoutToolbarProps {
  style: CSSProperties
  onStyleChange: (style: CSSProperties) => void
  onMenuOpen: () => void
}

const menuLabels: Record<LayoutMenu, string> = {
  horizontal: 'Horizontal alignment',
  vertical: 'Vertical alignment',
  wrap: 'Text wrapping',
  rotation: 'Text rotation',
}

const rotationPatch = (angle: number): CSSProperties => ({ rotate: `${angle}deg`, writingMode: 'horizontal-tb', textOrientation: 'mixed' })

const layoutOptions: Record<LayoutMenu, LayoutOption[]> = {
  horizontal: [
    { value: 'left', label: 'Align left', patch: { textAlign: 'left' } },
    { value: 'center', label: 'Align center', patch: { textAlign: 'center' } },
    { value: 'right', label: 'Align right', patch: { textAlign: 'right' } },
    { value: 'justify', label: 'Justify', patch: { textAlign: 'justify' } },
  ],
  vertical: [
    { value: 'top', label: 'Align top', patch: { verticalAlign: 'top' } },
    { value: 'middle', label: 'Align middle', patch: { verticalAlign: 'middle' } },
    { value: 'bottom', label: 'Align bottom', patch: { verticalAlign: 'bottom' } },
  ],
  wrap: [
    { value: 'overflow', label: 'Overflow text', patch: { whiteSpace: 'pre', overflowWrap: 'normal', overflow: 'visible' } },
    { value: 'wrap', label: 'Wrap text', patch: { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden' } },
    { value: 'clip', label: 'Clip text', patch: { whiteSpace: 'pre', overflowWrap: 'normal', overflow: 'hidden' } },
  ],
  rotation: [
    { value: '0', label: 'No rotation', patch: rotationPatch(0) },
    { value: '-45', label: 'Tilt up', patch: rotationPatch(-45) },
    { value: '45', label: 'Tilt down', patch: rotationPatch(45) },
    { value: 'stack', label: 'Stack vertically', patch: { rotate: '0deg', writingMode: 'vertical-rl', textOrientation: 'upright' } },
    { value: '-90', label: 'Rotate up', patch: rotationPatch(-90) },
    { value: '90', label: 'Rotate down', patch: rotationPatch(90) },
  ],
}

function LayoutIcon({ kind, value }: { kind: LayoutMenu; value: string }) {
  let path = ''
  if (kind === 'horizontal') {
    path = value === 'center' ? 'M3 4h18M6 8h12M3 12h18M6 16h12M3 20h18'
      : value === 'right' ? 'M3 4h18M9 8h12M3 12h18M9 16h12M3 20h18'
        : value === 'justify' ? 'M3 4h18M3 8h18M3 12h18M3 16h18M3 20h18'
          : 'M3 4h18M3 8h12M3 12h18M3 16h12M3 20h18'
  } else if (kind === 'vertical') {
    path = value === 'top' ? 'M4 4h16M12 20V8m-4 4 4-4 4 4'
      : value === 'middle' ? 'M4 12h16M12 3v5m-3-3 3 3 3-3M12 21v-5m-3 3 3-3 3 3'
        : 'M4 20h16M12 4v12m-4-4 4 4 4-4'
  } else if (kind === 'wrap') {
    path = value === 'wrap' ? 'M5 4v16M9 7h8a4 4 0 0 1 0 8h-6m3-3-3 3 3 3'
      : value === 'clip' ? 'M5 4v16M19 4v16M8 12h8'
        : 'M5 4v16M10 5v4M10 15v4M8 12h12m-3-3 3 3-3 3'
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
    {kind !== 'rotation' ? <path d={path} strokeLinejoin="round" />
      : value === 'stack' ? <>
        <path d="M5 3v17m-3-3 3 3 3-3" strokeLinejoin="round" />
        <text x="16" y="7" fontSize="7" textAnchor="middle" className="fill-current stroke-none">A</text>
        <text x="16" y="14" fontSize="7" textAnchor="middle" className="fill-current stroke-none">B</text>
        <text x="16" y="21" fontSize="7" textAnchor="middle" className="fill-current stroke-none">C</text>
      </> : <g transform={`rotate(${Number(value) || 0} 12 12)`}>
        <path d="m6 14 4-10 4 10M8 10h4M4 19h15m-3-3 3 3-3 3" strokeLinejoin="round" />
      </g>}
  </svg>
}

export const ExcelTextLayoutToolbar = memo(function ExcelTextLayoutToolbar({ style, onStyleChange, onMenuOpen }: ExcelTextLayoutToolbarProps) {
  const [menu, setMenu] = useState<{ kind: LayoutMenu; top: number; left: number } | null>(null)
  const [angleInput, setAngleInput] = useState('0')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const rotation = Number.parseFloat(String(style.rotate || '0')) || 0
  const selected: Record<LayoutMenu, string> = {
    horizontal: String(style.textAlign || 'left'),
    vertical: String(style.verticalAlign || 'bottom'),
    wrap: style.whiteSpace === 'pre-wrap' ? 'wrap' : style.overflow === 'visible' ? 'overflow' : 'clip',
    rotation: style.writingMode === 'vertical-rl' && style.textOrientation === 'upright' ? 'stack' : String(rotation),
  }

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popup = menuRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popup.width - 8))
    const top = rect.bottom + 4 + popup.height <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - popup.height - 4)
    if (left !== menu.left || top !== menu.top) setMenu({ ...menu, left, top })
  }, [menu?.kind])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOutside = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return
      close()
    }
    const frame = requestAnimationFrame(() => {
      const selectedItem = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
      ;(selectedItem || firstItem)?.focus()
    })
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu?.kind])

  const closeMenu = () => {
    setMenu(null)
    triggerRef.current?.focus()
  }

  const validAngle = angleInput.trim() !== '' && Number.isFinite(Number(angleInput)) && Number(angleInput) >= -90 && Number(angleInput) <= 90

  return <>
    {(Object.keys(menuLabels) as LayoutMenu[]).map(kind => <ToolbarIconButton
      key={kind}
      aria-label={menuLabels[kind]}
      title={menuLabels[kind]}
      aria-haspopup="menu"
      aria-expanded={menu?.kind === kind}
      aria-controls={menu?.kind === kind ? menuId : undefined}
      withArrow
      selected={menu?.kind === kind}
      icon={<LayoutIcon kind={kind} value={selected[kind]} />}
      onClick={event => {
        if (menu?.kind === kind) {
          closeMenu()
          return
        }
        onMenuOpen()
        triggerRef.current = event.currentTarget
        const rect = event.currentTarget.getBoundingClientRect()
        setAngleInput(String(rotation))
        setMenu({ kind, top: rect.bottom + 4, left: rect.left })
      }}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        if (menu?.kind !== kind) event.currentTarget.click()
      }}
    />)}
    {menu && createPortal(<div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={menuLabels[menu.kind]}
      aria-orientation="horizontal"
      className="fixed z-[250] flex w-max max-w-[calc(100vw-1rem)] flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-slate-700 shadow-xl"
      style={{ top: menu.top, left: menu.left }}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault()
          event.stopPropagation()
          closeMenu()
          return
        }
        if (event.target instanceof HTMLInputElement) return
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[next]?.focus()
      }}
    >
      {layoutOptions[menu.kind].map(option => <button
        key={option.value}
        type="button"
        role="menuitemradio"
        tabIndex={-1}
        aria-label={option.label}
        aria-checked={selected[menu.kind] === option.value}
        title={option.label}
        onClick={() => {
          onStyleChange(option.patch)
          closeMenu()
        }}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-[#62853e] ${selected[menu.kind] === option.value ? 'bg-[#c6dbb6] text-[#41572a] hover:bg-[#c6dbb6]' : 'hover:bg-[#e3edda]'}`}
      ><LayoutIcon kind={menu.kind} value={option.value} /></button>)}
      {menu.kind === 'rotation' && <label className="ml-1 flex h-10 items-center gap-1 border-l border-slate-200 pl-2 text-sm">
        <span className="sr-only">Rotation angle in degrees</span>
        <input
          type="number"
          min="-90"
          max="90"
          value={angleInput}
          aria-invalid={!validAngle}
          onChange={event => {
            const value = event.target.value
            setAngleInput(value)
            const angle = Number(value)
            if (value.trim() !== '' && Number.isFinite(angle) && angle >= -90 && angle <= 90) onStyleChange(rotationPatch(angle))
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && validAngle) {
              event.preventDefault()
              event.stopPropagation()
              onStyleChange(rotationPatch(Number(angleInput)))
              closeMenu()
            }
          }}
          className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#a3c48b] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span aria-hidden="true">°</span>
      </label>}
    </div>, document.body)}
  </>
})
