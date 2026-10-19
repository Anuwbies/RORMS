import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { auth, storage } from '../firebase'
import { TrashIcon } from './Icons'
import type { ReservationEvidenceFile } from '../utils/reservationEvidence'

const cachedUrls = new Map<string, string>()
const pendingUrls = new Map<string, Promise<string | null>>()
let cachedUserId: string | null = null

function syncCacheUser() {
  const userId = auth.currentUser?.uid ?? null
  if (cachedUserId !== userId) {
    cachedUrls.clear()
    pendingUrls.clear()
    cachedUserId = userId
  }
  return userId
}

function cachedUrl(path: string) {
  syncCacheUser()
  return cachedUrls.get(path)
}

function loadUrl(path: string): Promise<string | null> {
  const userId = syncCacheUser()
  const cached = cachedUrls.get(path)
  if (cached) return Promise.resolve(cached)
  const pending = pendingUrls.get(path)
  if (pending) return pending

  const request = getDownloadURL(ref(storage, path)).then(url => {
    if (cachedUserId === userId) cachedUrls.set(path, url)
    return url
  }).catch(() => null)
  pendingUrls.set(path, request)
  void request.finally(() => {
    if (pendingUrls.get(path) === request) pendingUrls.delete(path)
  })
  return request
}

export function forgetEvidenceUrl(path: string) {
  cachedUrls.delete(path)
  pendingUrls.delete(path)
}

export interface EvidenceGalleryItem extends ReservationEvidenceFile {
  previewUrl?: string
}

interface ReservationEvidenceGalleryProps {
  files: EvidenceGalleryItem[]
  twoColumns?: boolean
  onRemove?: (file: EvidenceGalleryItem, index: number) => void
  removeDisabled?: boolean
}

export function ReservationEvidenceGallery({ files, twoColumns = false, onRemove, removeDisabled = false }: ReservationEvidenceGalleryProps) {
  const [urls, setUrls] = useState<Record<string, string | null>>(() => Object.fromEntries(
    files.filter(file => !file.previewUrl).flatMap(file => {
      const url = cachedUrl(file.path)
      return url ? [[file.path, url]] : []
    })
  ))
  const pathsKey = files.filter(file => !file.previewUrl).map(file => file.path).join('|')

  useEffect(() => {
    let active = true
    const paths = pathsKey ? pathsKey.split('|') : []
    const available = Object.fromEntries(paths.flatMap(path => {
      const url = cachedUrl(path)
      return url ? [[path, url]] : []
    }))
    if (Object.keys(available).length > 0) setUrls(previous => ({ ...previous, ...available }))
    Promise.all(paths.filter(path => !available[path]).map(async path => [path, await loadUrl(path)] as const)).then(entries => {
      if (active && entries.length > 0) setUrls(previous => ({ ...previous, ...Object.fromEntries(entries) }))
    })
    return () => { active = false }
  }, [pathsKey])

  return (
    <div className={`grid gap-3 ${twoColumns ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
      {files.map((file, index) => {
        const source = file.previewUrl || urls[file.path]
        const failed = !file.previewUrl && urls[file.path] === null
        const uploadedAt = file.uploadedAt ? new Date(file.uploadedAt) : null
        return (
          <div key={`${file.path}-${index}`} className="relative min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            {onRemove && (
              <button type="button" onClick={() => onRemove(file, index)} disabled={removeDisabled} aria-label={`Remove ${file.fileName}`} title="Remove file" className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-rose-600 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50">
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
            {source && file.type === 'image' && <img src={source} alt={`Room evidence: ${file.fileName}`} className="h-40 w-full rounded-lg object-contain" />}
            {source && file.type === 'video' && <video controls src={source} className="h-40 w-full rounded-lg" aria-label={`Room evidence: ${file.fileName}`} />}
            {!source && <div className="flex h-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">{failed ? 'Could not load this file' : 'Loading evidence...'}</div>}
            {uploadedAt && !Number.isNaN(uploadedAt.getTime()) && <p className="mt-2 text-xs text-slate-500">{uploadedAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })} PHT</p>}
          </div>
        )
      })}
    </div>
  )
}
