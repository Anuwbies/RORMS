import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface WorkbookSlotProps {
  host?: HTMLElement | null
  active: boolean
  children: ReactNode
}

export function WorkbookSlot({ host, active, children }: WorkbookSlotProps) {
  if (!active) return null
  return host ? createPortal(children, host) : children
}
