export function reservationDisplayStatus(status: string, evidencePath?: string): string {
  return status === 'Completed' && !evidencePath ? 'Needs Evidence' : status
}
