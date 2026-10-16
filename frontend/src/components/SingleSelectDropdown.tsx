import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDownIcon, CheckIcon } from './Icons'

const searchKey = (text: string) => text.toLocaleLowerCase().replace(/[\s\p{P}]+/gu, '')

export interface SingleSelectDropdownProps<T extends string> {
  options: T[] | readonly T[]
  value: T
  onChange: (value: T) => void
  className?: string
  isDisabled?: boolean
  onToggle?: (isOpen: boolean) => void
  placeholder?: string
  isPlaceholder?: (value: T) => boolean
  portal?: boolean
  ariaLabel?: string
  searchable?: boolean
  getOptionLabel?: (value: T) => string
  variant?: 'default' | 'meeting'
  menuAnchorSelector?: string
  retainValueOnOpen?: boolean
  recommendedOptions?: readonly T[]
}

export function SingleSelectDropdown<T extends string>({ 
  options, 
  value, 
  onChange, 
  className = '',
  isDisabled = false,
  onToggle,
  placeholder,
  isPlaceholder: isPlaceholderProp,
  portal = false,
  ariaLabel,
  searchable = false,
  getOptionLabel = (option: T) => option,
  variant = 'default',
  menuAnchorSelector,
  retainValueOnOpen = false,
  recommendedOptions = []
}: SingleSelectDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchStarted, setSearchStarted] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const listId = useId()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuWidthRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number; maxHeight?: number } | null>(null)
  const [menuMinWidth, setMenuMinWidth] = useState<number | null>(null)
  const query = searchKey(search)
  const filteredOptions = searchable ? options.filter(option => searchKey(getOptionLabel(option)).includes(query)) : options
  const meetingVariant = variant === 'meeting'

  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  useEffect(() => {
    function handleClickOutside(event: Event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    if (searchable) document.addEventListener('focusin', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('focusin', handleClickOutside) }
  }, [searchable])

  useEffect(() => {
    if (!isOpen) { setSearch(''); setSearchStarted(false); setActiveIndex(-1) }
  }, [isOpen])

  useEffect(() => {
    if (activeIndex >= 0) menuRef.current?.querySelector(`#${CSS.escape(`${listId}-${activeIndex}`)}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, listId])

  useLayoutEffect(() => {
    if (!portal || !isOpen || !dropdownRef.current) return
    const anchor = menuAnchorSelector ? dropdownRef.current.closest(menuAnchorSelector) : null
    const rect = (anchor ?? dropdownRef.current).getBoundingClientRect()
    const width = Math.min(anchor ? rect.width : Math.max(rect.width, 220), window.innerWidth - 16)
    const top = anchor ? rect.bottom + 4 : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 260))
    setMenuPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top, width, ...(anchor ? { maxHeight: Math.max(32, Math.min(220, window.innerHeight - top - 20)) } : {}) })
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setIsOpen(false) } }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); document.removeEventListener('keydown', key, true) }
  }, [isOpen, portal, menuAnchorSelector])

  const handleSelect = (option: T) => {
    onChange(option)
    setIsOpen(false)
  }

  const longestOption = options.map(option => getOptionLabel(option)).reduce((longest, label) => label.length > longest.length ? label : longest, '')

  useLayoutEffect(() => {
    if (!menuWidthRef.current) {
      return
    }
    setMenuMinWidth(menuWidthRef.current.offsetWidth)
  }, [longestOption])

  const isMuted = isPlaceholderProp
    ? isPlaceholderProp(value)
    : (
        !value || 
        value === placeholder || 
        value.startsWith('Any ') || 
        value.startsWith('Select ') || 
        value === 'None'
      )

  const menu = (
    <div ref={menuRef} style={portal && menuPosition ? { position: 'fixed', left: menuPosition.left, top: menuPosition.top, width: menuPosition.width } : undefined}
      className={`${portal ? 'z-[300]' : 'absolute left-0 top-full z-20 mt-2 w-full'} ${meetingVariant ? 'rounded shadow-none' : 'rounded-2xl shadow-xl ring-1 ring-black/5'} border border-gray-200 bg-white p-2 animate-in fade-in zoom-in-95 duration-200 overflow-visible`}>
      <div id={listId} role={searchable ? 'listbox' : undefined} aria-label={searchable ? ariaLabel : undefined}
        style={portal && menuPosition?.maxHeight ? { maxHeight: menuPosition.maxHeight } : undefined}
        className="space-y-1 max-h-55 overflow-y-auto custom-scrollbar pr-1 overflow-visible">
        {filteredOptions.map((option, index) => {
          const selected = value === option
          const muted = isPlaceholderProp ? isPlaceholderProp(option) : option.startsWith('Any ') || option.startsWith('Select ') || option === 'None'
          return <button key={option} id={`${listId}-${index}`} type="button" role={searchable ? 'option' : undefined} aria-selected={searchable ? selected : undefined}
            tabIndex={searchable ? -1 : undefined} onMouseDown={event => { if (searchable) event.preventDefault() }} onClick={() => handleSelect(option)}
            className={`flex w-full items-center gap-2 ${meetingVariant ? 'rounded' : 'rounded-xl'} px-3 py-2 text-left text-sm font-medium transition-all active:scale-[0.98] ${activeIndex === index ? 'bg-gray-100' : ''} ${selected ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)]' : muted ? 'text-gray-400 font-medium hover:bg-gray-50 hover:text-gray-600 active:bg-gray-100' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100'}`}>
            {recommendedOptions.includes(option) ? <span className="min-w-0 flex-1">
              <span className="block truncate">{getOptionLabel(option) || 'None'}</span>
              <span className="block text-xs font-normal text-[var(--brand-color)]">Recommended</span>
            </span> : <span className="truncate">{getOptionLabel(option) || 'None'}</span>}
            {selected && <CheckIcon className="ml-auto h-4 w-4 text-[var(--brand-color)] shrink-0" strokeWidth={3} />}
          </button>
        })}
        {!filteredOptions.length && <p className="px-3 py-2 text-sm text-gray-500">No matching rooms.</p>}
      </div>
    </div>
  )

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
      style={!portal && menuMinWidth ? { minWidth: `${menuMinWidth}px` } : undefined}
    >
      <div
        ref={menuWidthRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 invisible w-max rounded-md border border-transparent p-1.5"
      >
        <div className="flex items-center gap-3 rounded-md px-3 py-2.5 text-xs">
          <span className="whitespace-nowrap">{longestOption}</span>
        </div>
      </div>

      {searchable ? <input
        type="text" role="combobox" autoComplete="off" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={isOpen}
        size={meetingVariant ? 1 : undefined}
        aria-controls={isOpen ? listId : undefined} aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        disabled={isDisabled} value={isOpen && (!retainValueOnOpen || searchStarted) ? search : getOptionLabel(value)} placeholder={isOpen && (!retainValueOnOpen || searchStarted) ? 'search...' : placeholder}
        onFocus={event => { setSearch(''); setSearchStarted(false); setActiveIndex(-1); setIsOpen(true); if (retainValueOnOpen) event.currentTarget.select() }}
        onClick={() => setIsOpen(true)}
        onChange={event => { setSearch(event.target.value); setSearchStarted(true); setActiveIndex(-1); setIsOpen(true) }}
        onKeyDown={event => {
          if (!isOpen && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
            event.preventDefault(); setSearch(event.key.length === 1 ? event.key : ''); setSearchStarted(true); setActiveIndex(-1); setIsOpen(true)
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setIsOpen(true)
            setActiveIndex(index => filteredOptions.length ? event.key === 'ArrowDown' ? (index + 1) % filteredOptions.length : index <= 0 ? filteredOptions.length - 1 : index - 1 : -1)
          } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault()
            if (activeIndex >= 0 && filteredOptions[activeIndex] !== undefined) handleSelect(filteredOptions[activeIndex])
            else if (filteredOptions.length === 1) handleSelect(filteredOptions[0])
          } else if (event.key === 'Escape' || event.key === 'Tab') setIsOpen(false)
        }}
        className={`relative h-12 w-full min-w-0 border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 outline-none transition-colors hover:border-gray-300 focus:border-[var(--brand-color)] disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 ${meetingVariant ? 'rounded shadow-none' : 'rounded-xl shadow-sm'}`}
      /> : <button
        type="button"
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-12 w-full items-center justify-between gap-2 border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 outline-none transition-all cursor-pointer hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 active:scale-95 disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400 ${meetingVariant ? 'rounded shadow-none' : 'rounded-xl shadow-sm'}`}
      >
        <span className={`whitespace-nowrap ${isMuted ? 'text-gray-400 font-medium' : 'text-gray-900 font-medium'}`}>
          {getOptionLabel(value) || placeholder || 'None'}
        </span>
        {!meetingVariant && <ChevronDownIcon className={`h-4.5 w-4.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />}
      </button>}

      {isOpen && !isDisabled && (portal ? menuPosition && createPortal(menu, document.body) : menu)}
    </div>
  )
}
