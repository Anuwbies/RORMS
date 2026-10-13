import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ExcelFontMenuProps {
  fonts: string[]
  value: string
  onChange: (font: string) => void
  onMenuOpen: () => void
}

export const ExcelFontMenu = memo(function ExcelFontMenu({ fonts, value, onChange, onMenuOpen }: ExcelFontMenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef({ text: '', time: 0 })
  const menuId = useId()
  const open = position !== null
  const options = fonts.includes(value) ? fonts : [value, ...fonts]

  const closeMenu = () => {
    setPosition(null)
    buttonRef.current?.focus()
  }

  const toggleMenu = () => {
    if (position) {
      closeMenu()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    onMenuOpen()
    searchRef.current = { text: '', time: 0 }
    setPosition({ top: rect.bottom + 4, left: rect.left })
  }

  useLayoutEffect(() => {
    if (!position || !menuRef.current || !buttonRef.current) return
    const anchor = buttonRef.current.getBoundingClientRect()
    const popup = menuRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8))
    const top = anchor.bottom + 4 + popup.height <= window.innerHeight - 8
      ? anchor.bottom + 4 : Math.max(8, anchor.top - popup.height - 4)
    if (left !== position.left || top !== position.top) setPosition({ top, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (buttonRef.current?.contains(event.target as Node) || menuRef.current?.contains(event.target as Node)) return
      setPosition(null)
    }
    const closeOnResize = () => setPosition(null)
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      setPosition(null)
    }
    const frame = requestAnimationFrame(() => {
      const selected = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      selected?.focus({ preventScroll: true })
      selected?.scrollIntoView({ block: 'nearest' })
    })
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', closeOnResize)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeOnResize)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  return <>
    <button
      ref={buttonRef}
      type="button"
      aria-label="Font"
      data-excel-font-control
      title="Font"
      aria-haspopup="menu"
      aria-expanded={Boolean(position)}
      aria-controls={position ? menuId : undefined}
      onClick={toggleMenu}
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        if (!position) toggleMenu()
      }}
      className={`inline-flex h-10 w-36 shrink-0 items-center justify-between rounded-md border border-transparent px-2.5 text-sm shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#62853e] ${position ? 'bg-[#c6dbb6] text-[#41572a]' : 'bg-transparent text-slate-700 hover:bg-[#e3edda]'}`}
    >
      <span className="min-w-0 truncate">{value}</span>
      <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0 fill-current"><path d="m2 4 4 4 4-4Z" /></svg>
    </button>
    {position && createPortal(<div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label="Font"
      data-excel-font-control
      className="fixed z-[250] w-max min-w-36 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm text-slate-700 shadow-xl"
      style={position}
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault()
          event.stopPropagation()
          closeMenu()
          return
        }
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || [])
        const index = items.indexOf(document.activeElement as HTMLButtonElement)
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault()
          event.stopPropagation()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
          items[next]?.focus()
        } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          event.stopPropagation()
          const time = Date.now()
          const text = (time - searchRef.current.time > 700 ? '' : searchRef.current.text) + event.key.toLowerCase()
          searchRef.current = { text, time }
          const next = options.findIndex(font => font.toLowerCase().startsWith(text))
          if (next >= 0) items[next]?.focus()
        }
      }}
    >
      {options.map(font => <button
        key={font}
        type="button"
        role="menuitemradio"
        tabIndex={-1}
        aria-checked={value === font}
        onClick={() => {
          onChange(font)
          closeMenu()
        }}
        className={`flex h-10 w-full items-center rounded-md px-2.5 text-left focus-visible:outline-2 focus-visible:outline-[#62853e] ${value === font ? 'bg-[#c6dbb6] text-[#41572a] hover:bg-[#c6dbb6]' : 'hover:bg-[#e3edda] focus-visible:bg-[#e3edda]'}`}
      >{font}</button>)}
    </div>, document.body)}
  </>
})
