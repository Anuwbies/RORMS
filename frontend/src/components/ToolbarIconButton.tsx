import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface ToolbarIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  withArrow?: boolean
  selected?: boolean
}

export const ToolbarIconButton = forwardRef<HTMLButtonElement, ToolbarIconButtonProps>(function ToolbarIconButton(
  { icon, withArrow = false, selected = false, className = '', type = 'button', ...props },
  ref,
) {
  return <button
    {...props}
    ref={ref}
    type={type}
    className={`inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[#62853e] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${selected ? 'bg-[#c6dbb6] text-[#41572a] hover:bg-[#c6dbb6]' : 'bg-transparent text-slate-700 hover:bg-[#e3edda]'} ${withArrow ? 'w-14 gap-0.5' : 'w-10'} ${className}`}
  >
    <span className="flex h-6 w-6 shrink-0 items-center justify-center">{icon}</span>
    {withArrow && <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0 fill-current"><path d="m2 4 4 4 4-4Z" /></svg>}
  </button>
})
