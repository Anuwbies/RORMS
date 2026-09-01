import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon, SpinnerIcon } from './Icons'
import { SearchInput } from './SearchInput'

export interface ColumnDef<T> {
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  render: (row: T) => ReactNode
}

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T>[]
  
  // Controls
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (val: string) => void
  filters?: ReactNode
  primaryAction?: ReactNode
  
  // Empty State
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: ReactNode

  // Row selection/interaction
  onRowClick?: (row: T) => void

  // Loading State
  isLoading?: boolean

  // Custom styling
  className?: string
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  primaryAction,
  emptyTitle = 'No data found',
  emptyDescription = 'Try adjusting your filters or search terms.',
  emptyIcon,
  onRowClick,
  isLoading,
  className = ''
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(15)
  const [isRowsDropdownOpen, setIsRowsDropdownOpen] = useState(false)
  const rowsDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCurrentPage(1)
  }, [data])

  useEffect(() => {
    if (!isRowsDropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (rowsDropdownRef.current && !rowsDropdownRef.current.contains(e.target as Node)) {
        setIsRowsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isRowsDropdownOpen])

  const totalRows = data.length
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, totalRows)
  const currentData = data.slice(startIndex, endIndex)

  const hasControls = searchPlaceholder || filters || primaryAction

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-0 overflow-visible w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 ${className}`}>
      {hasControls && (
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 w-full relative z-20 p-4 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3 w-full lg:w-auto flex-1">
            {searchPlaceholder && onSearchChange && (
              <div className="relative w-full lg:max-w-xl">
                <SearchInput
                  value={searchValue || ''}
                  onChange={onSearchChange}
                  placeholder={searchPlaceholder}
                />
              </div>
            )}
            {filters}
          </div>
          {primaryAction && (
            <div className="shrink-0 w-full lg:w-auto">
              {primaryAction}
            </div>
          )}
        </div>
      )}

      <div className="overflow-auto custom-scrollbar w-full max-h-[495px] flex-1">
        <table className="w-full text-left border-separate border-spacing-0 min-w-[600px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((col, i) => (
                <th 
                  key={i} 
                  className={`px-6 py-4 text-[0.7rem] font-bold uppercase tracking-[0.15em] text-black whitespace-nowrap bg-slate-50 border-t border-b border-slate-200 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400 border-b border-slate-100">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <SpinnerIcon className="h-8 w-8 text-[var(--brand-color)]" />
                    <p className="text-base font-bold text-slate-700">Loading data...</p>
                    <p className="text-xs text-slate-400">Please wait while information is retrieved.</p>
                  </div>
                </td>
              </tr>
            ) : currentData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-400 border-b border-slate-100">
                  <div className="flex flex-col items-center justify-center">
                    {emptyIcon && <div className="mb-4 text-slate-200">{emptyIcon}</div>}
                    <p className="text-base font-bold text-slate-600">{emptyTitle}</p>
                    <p className="text-sm mt-1">{emptyDescription}</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentData.map((row, rowIndex) => (
                <tr 
                  key={rowIndex} 
                  className={`group transition-colors hover:bg-slate-50/80 ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col, colIndex) => (
                    <td 
                      key={colIndex} 
                      className={`whitespace-nowrap px-6 py-4 border-b border-slate-100 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200/50 gap-4 p-4 bg-white rounded-b-2xl mt-auto shrink-0 z-10">
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-500">Rows per page:</span>
            <div ref={rowsDropdownRef} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRowsDropdownOpen(o => !o);
                }}
                className="inline-flex h-8 w-16 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus:outline-none transition-colors cursor-pointer select-none"
              >
                {rowsPerPage}
                <ChevronDownIcon className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${isRowsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isRowsDropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 z-50 w-16 rounded-lg border border-slate-200 bg-white shadow-lg animate-in fade-in zoom-in-95 duration-100">
                  {[15, 20, 50].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRowsPerPage(n)
                        setCurrentPage(1)
                        setIsRowsDropdownOpen(false)
                      }}
                      className={`flex w-full items-center justify-between px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${
                        rowsPerPage === n
                          ? 'bg-[var(--brand-color)]/10 text-[var(--brand-color)]'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {n}
                      {rowsPerPage === n && <CheckIcon className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
            <span className="text-xs font-medium text-slate-500">
              {totalRows > 0 ? (
                <>
                  <span className="font-bold text-slate-900">{startIndex + 1}</span>-
                  <span className="font-bold text-slate-900">{endIndex}</span> of <span className="font-bold text-slate-900">{totalRows}</span> rows
                </>
              ) : (
                '0 rows'
              )}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              title="First Page"
            >
              <span className="sr-only">First Page</span>
              <ChevronsLeftIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              title="Previous Page"
            >
              <span className="sr-only">Previous Page</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            
            <div className="flex items-center px-1">
              {Array.from({ length: totalPages }).map((_, i) => {
                const page = i + 1;
                if (totalPages <= 5 || page === 1 || page === totalPages || Math.abs(currentPage - page) <= 1) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                        currentPage === page 
                          ? 'bg-[var(--brand-color)] text-white shadow-md' 
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {page}
                    </button>
                  )
                } else if (
                  (page === 2 && currentPage > 3) ||
                  (page === totalPages - 1 && currentPage < totalPages - 2)
                ) {
                  return <span key={page} className="px-1 text-slate-400 font-bold">...</span>
                }
                return null;
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              title="Next Page"
            >
              <span className="sr-only">Next Page</span>
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || totalPages === 0}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-sm hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              title="Last Page"
            >
              <span className="sr-only">Last Page</span>
              <ChevronsRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
    </div>
  )
}
