interface ExcelHiddenRangeIndicatorProps {
  axis: 'row' | 'column'
  label: string
  className: string
  disabled: boolean
  arrow?: 'up' | 'down' | 'left' | 'right'
  onToggle: () => void
}

const SINGLE_ARROW_PATHS = {
  up: 'M2 8 6 4l4 4Z',
  down: 'M2 4h8L6 8Z',
  left: 'M8 2v8L4 6Z',
  right: 'm4 2 4 4-4 4Z',
}

export function ExcelHiddenRangeIndicator({ axis, label, className, disabled, arrow, onToggle }: ExcelHiddenRangeIndicatorProps) {
  return <button
    type="button"
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`absolute z-20 grid size-4 cursor-pointer place-items-center rounded-none text-[#62853e] transition-[background-color,color,box-shadow] enabled:hover:bg-[#e3edda] enabled:hover:text-[#526f34] enabled:hover:ring-1 enabled:hover:ring-[#62853e] enabled:hover:shadow-sm enabled:active:bg-[#c6dbb6] focus-visible:bg-[#e3edda] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#62853e] disabled:cursor-default ${className}`}
    onPointerDown={event => event.stopPropagation()}
    onMouseDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); onToggle() }}
  >
    <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 fill-current">
      {arrow ? <path d={SINGLE_ARROW_PATHS[arrow]} /> : axis === 'row' ? <>
        <path d="M2 5 6 1l4 4Z" />
        <path d="M2 7h8l-4 4Z" />
      </> : <>
        <path d="M5 2v8L1 6Z" />
        <path d="m7 2 4 4-4 4Z" />
      </>}
    </svg>
  </button>
}
