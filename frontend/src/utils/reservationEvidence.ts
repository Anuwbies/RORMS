export interface ReservationEvidenceFile {
  path: string
  type: 'image' | 'video'
  fileName: string
  uploadedAt?: string
}

export interface ReservationEvidenceRecord {
  evidencePath?: string
  evidenceType?: 'image' | 'video'
  evidenceFileName?: string
  evidenceSubmittedAt?: { toDate: () => Date }
  evidenceFiles?: ReservationEvidenceFile[]
}

export function reservationEvidenceFiles(record: ReservationEvidenceRecord): ReservationEvidenceFile[] {
  const files: ReservationEvidenceFile[] = []
  const seen = new Set<string>()

  if (typeof record.evidencePath === 'string' && record.evidencePath) {
    files.push({
      path: record.evidencePath,
      type: record.evidenceType === 'video' ? 'video' : 'image',
      fileName: record.evidenceFileName || 'Evidence file',
      uploadedAt: record.evidenceSubmittedAt?.toDate?.().toISOString(),
    })
    seen.add(record.evidencePath)
  }

  for (const file of Array.isArray(record.evidenceFiles) ? record.evidenceFiles : []) {
    if (typeof file?.path !== 'string' || !file.path || seen.has(file.path)) continue
    files.push({
      path: file.path,
      type: file.type === 'video' ? 'video' : 'image',
      fileName: typeof file.fileName === 'string' ? file.fileName : 'Evidence file',
      uploadedAt: typeof file.uploadedAt === 'string' ? file.uploadedAt : undefined,
    })
    seen.add(file.path)
  }

  return files
}

export function hasReservationEvidence(record: ReservationEvidenceRecord): boolean {
  return reservationEvidenceFiles(record).length > 0
}

export function reservationDisplayStatus(status: string, record: ReservationEvidenceRecord): string {
  return status === 'Completed' && !hasReservationEvidence(record) ? 'Needs Evidence' : status
}
