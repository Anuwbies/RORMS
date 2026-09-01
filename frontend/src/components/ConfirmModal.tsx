import React from 'react'
import { Button } from './Button'
import { AlertCircleIcon, CloseIcon } from './Icons'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isDestructive?: boolean
}

export function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  onConfirm, 
  onCancel,
  isDestructive = false
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 md:p-7 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 text-left">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ring-4 ${isDestructive ? 'bg-rose-100 text-rose-600 ring-rose-50' : 'bg-amber-100 text-amber-600 ring-amber-50'}`}>
            <AlertCircleIcon className="h-7 w-7" strokeWidth={3} />
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-slate-900 leading-snug">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-600 font-medium whitespace-normal">
              {message}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'outline' : 'brand'}
            onClick={onConfirm}
            className={isDestructive ? "flex-1 !text-white !bg-rose-600 !border-rose-600 hover:!bg-rose-700" : "flex-1"}
          >
            {confirmText}
          </Button>
        </div>
      </div>
      <div className="absolute inset-0 -z-10" onMouseDown={onCancel} />
    </div>
  )
}
