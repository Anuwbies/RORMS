export interface WorkbookRevision {
  path: string
  revision: number
  revisionId?: string
}

/** Serialize reloads and coalesce newer commits. A save/import pauses application
 * without losing the revision notification received while it is in progress. */
export function createLiveWorkbookReceiver<T extends { revision: number }>(load: () => Promise<T | null>, savedRevision: () => number, receive: (saved: T) => void, onError: (error: unknown) => void) {
  let pending: WorkbookRevision | undefined
  let paused = true, stopped = false, running = false, generation = 0
  const drain = async () => {
    if (running || stopped || paused) return
    running = true
    const started = generation
    try {
      while (pending && !paused && !stopped) {
        const expected = pending
        pending = undefined
        if (expected.revision <= savedRevision()) continue
        try {
          const loaded = await load()
          if (stopped || started !== generation) return
          if (paused) { pending ??= expected; return }
          const queued = pending as WorkbookRevision | undefined
          if (queued && (!loaded || queued.revision > loaded.revision)) continue
          if (!loaded) throw new Error('The saved workbook was removed. Your local edits have been kept.')
          if (loaded.revision > savedRevision()) receive(loaded)
        } catch (error) {
          if (!stopped && started === generation && !pending) onError(error)
        }
      }
    } finally { if (started === generation) running = false }
  }
  return {
    notify(revision: WorkbookRevision) { pending = revision; void drain() },
    pause(value: boolean) { paused = value; if (!value) void drain() },
    start() { stopped = false; void drain() },
    stop() { stopped = true; pending = undefined; running = false; generation++ },
  }
}
