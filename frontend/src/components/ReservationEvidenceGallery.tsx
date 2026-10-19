import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../firebase'
import type { ReservationEvidenceFile } from '../utils/reservationEvidence'

export interface EvidenceGalleryItem extends ReservationEvidenceFile {
  previewUrl?: string
}

interface ReservationEvidenceGalleryProps {
  files: EvidenceGalleryItem[]
}

export function ReservationEvidenceGallery({ files }: ReservationEvidenceGalleryProps) {
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  const pathsKey = files.filter(file => !file.previewUrl).map(file => file.path).join('|')

  useEffect(() => {
    let active = true
    const paths = pathsKey ? pathsKey.split('|') : []
    setUrls({})
    Promise.all(paths.map(async path => {
      try {
        return [path, await getDownloadURL(ref(storage, path))] as const
      } catch {
        return [path, null] as const
      }
    })).then(entries => {
      if (active) setUrls(Object.fromEntries(entries))
    })
    return () => { active = false }
  }, [pathsKey])

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {files.map((file, index) => {
        const source = file.previewUrl || urls[file.path]
        const failed = !file.previewUrl && urls[file.path] === null
        const uploadedAt = file.uploadedAt ? new Date(file.uploadedAt) : null
        return (
          <div key={`${file.path}-${index}`} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
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
