import React, { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { CheckIcon, CloseIcon, AlertCircleIcon, ExclamationIcon } from './Icons'

export type SnackbarType = 'success' | 'error' | 'warning' | 'info' | 'brand'
export type SnackbarPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface SnackbarOptions {
  id?: string
  title?: string
  message: string
  type?: SnackbarType
  duration?: number // duration in ms, 0 = persistent
  action?: {
    label: string
    onClick: () => void
  }
  minWidth?: string
}

export interface SnackbarProps extends SnackbarOptions {
  isOpen: boolean
  onClose: () => void
  position?: SnackbarPosition
}

const typeStyles: Record<SnackbarType, {
  container: string
  iconBg: string
  iconColor: string
  icon: React.ReactNode
}> = {
  success: {
    container: 'bg-white border-emerald-200 text-slate-800 shadow-xl shadow-emerald-950/10 ring-1 ring-emerald-500/15',
    iconBg: 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50',
    iconColor: 'text-emerald-600',
    icon: <CheckIcon className="h-5.5 w-5.5" strokeWidth={3} />
  },
  error: {
    container: 'bg-white border-rose-200 text-slate-800 shadow-xl shadow-rose-950/10 ring-1 ring-rose-500/15',
    iconBg: 'bg-rose-100 text-rose-600 ring-4 ring-rose-50',
    iconColor: 'text-rose-600',
    icon: <AlertCircleIcon className="h-5.5 w-5.5" strokeWidth={2.5} />
  },
  warning: {
    container: 'bg-white border-amber-200 text-slate-800 shadow-xl shadow-amber-950/10 ring-1 ring-amber-500/15',
    iconBg: 'bg-amber-100 text-amber-600 ring-4 ring-amber-50',
    iconColor: 'text-amber-600',
    icon: <ExclamationIcon className="h-5.5 w-5.5" strokeWidth={2.5} />
  },
  info: {
    container: 'bg-white border-sky-200 text-slate-800 shadow-xl shadow-sky-950/10 ring-1 ring-sky-500/15',
    iconBg: 'bg-sky-100 text-sky-600 ring-4 ring-sky-50',
    iconColor: 'text-sky-600',
    icon: <AlertCircleIcon className="h-5.5 w-5.5" strokeWidth={2.5} />
  },
  brand: {
    container: 'bg-white border-[var(--brand-color)]/30 text-slate-800 shadow-xl shadow-[var(--brand-color)]/10 ring-1 ring-[var(--brand-color)]/15',
    iconBg: 'bg-[var(--brand-color)]/10 text-[var(--brand-color)] ring-4 ring-[var(--brand-color)]/5',
    iconColor: 'text-[var(--brand-color)]',
    icon: <CheckIcon className="h-5.5 w-5.5" strokeWidth={3} />
  }
}

const positionStyles: Record<SnackbarPosition, string> = {
  'top-left': 'top-6 left-6 items-start',
  'top-center': 'top-6 left-1/2 -translate-x-1/2 items-center',
  'top-right': 'top-6 right-6 items-end',
  'bottom-left': 'bottom-6 left-6 items-start',
  'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-6 right-6 items-end'
}

/**
 * Standalone Snackbar Component
 */
export function Snackbar({
  isOpen,
  onClose,
  title,
  message,
  type = 'brand',
  duration = 4000,
  action,
  position = 'bottom-right',
  minWidth = '340px'
}: SnackbarProps) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!isOpen || duration <= 0) return
    const timer = setTimeout(() => {
      onCloseRef.current()
    }, duration)
    return () => clearTimeout(timer)
  }, [isOpen, duration, message, title])

  if (!isOpen) return null

  const style = typeStyles[type] || typeStyles.brand
  const isTop = position.startsWith('top')

  return (
    <div 
      className={`fixed z-[150] pointer-events-none flex flex-col ${positionStyles[position]}`}
      aria-live="assertive"
    >
      <div 
        style={{ minWidth: minWidth || undefined }}
        className={`pointer-events-auto flex items-center gap-3.5 sm:gap-4 rounded-2xl border p-4.5 shadow-2xl transition-all duration-300 w-max max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] ${
          style.container
        } ${
          isTop 
            ? 'animate-in fade-in slide-in-from-top-4' 
            : 'animate-in fade-in slide-in-from-bottom-4'
        }`}
      >
        {/* Icon */}
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
          {style.icon}
        </div>

        {/* Content */}
        <div className="flex items-center gap-2 whitespace-nowrap min-w-0 pr-1">
          {title && (
            <span className="text-sm font-bold text-gray-900 shrink-0">
              {title}
            </span>
          )}
          {title && <span className="text-gray-300 text-xs select-none">•</span>}
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
            {message}
          </span>
        </div>

        {/* Action Button */}
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick()
              onClose()
            }}
            className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold text-[var(--brand-color)] hover:bg-[var(--brand-color)]/10 transition-colors cursor-pointer"
          >
            {action.label}
          </button>
        )}

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto shrink-0 rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer"
          aria-label="Close notification"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Snackbar Context & Provider for App-wide Imperative Usage
// ----------------------------------------------------------------------

interface SnackbarContextType {
  showSnackbar: (options: SnackbarOptions) => void
  hideSnackbar: () => void
}

const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined)

export function SnackbarProvider({ 
  children, 
  defaultPosition = 'bottom-right' 
}: { 
  children: React.ReactNode
  defaultPosition?: SnackbarPosition 
}) {
  const [snackbar, setSnackbar] = useState<SnackbarOptions | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const showSnackbar = useCallback((options: SnackbarOptions) => {
    setSnackbar(options)
    setIsOpen(true)
  }, [])

  const hideSnackbar = useCallback(() => {
    setIsOpen(false)
  }, [])

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar }}>
      {children}
      {snackbar && (
        <Snackbar
          isOpen={isOpen}
          onClose={hideSnackbar}
          title={snackbar.title}
          message={snackbar.message}
          type={snackbar.type}
          duration={snackbar.duration}
          action={snackbar.action}
          position={defaultPosition}
          minWidth={snackbar.minWidth}
        />
      )}
    </SnackbarContext.Provider>
  )
}

export function useSnackbar() {
  const context = useContext(SnackbarContext)
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider')
  }
  return context
}
