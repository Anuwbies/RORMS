const DATABASE_NAME = 'rorms-department-workbook-cache'
const STORE_NAME = 'files'
const MEMORY_LIMIT = 64 * 1024 * 1024
const DISK_LIMIT = 150 * 1024 * 1024
const CACHE_TIMEOUT = 1500

interface CachedFile {
  key: string
  blob: Blob
  size: number
  lastUsedAt: number
}

const memory = new Map<string, Blob>()
let memoryBytes = 0
let databasePromise: Promise<IDBDatabase | null> | undefined

export function workbookFileCacheKey(scope: string, path: string, generation: string): string {
  return JSON.stringify([scope, path, generation])
}

function remember(key: string, blob: Blob) {
  const previous = memory.get(key)
  if (previous) { memoryBytes -= previous.size; memory.delete(key) }
  if (blob.size > MEMORY_LIMIT) return
  memory.set(key, blob)
  memoryBytes += blob.size
  while (memoryBytes > MEMORY_LIMIT) {
    const oldest = memory.entries().next().value
    if (!oldest) break
    memory.delete(oldest[0])
    memoryBytes -= oldest[1].size
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (databasePromise) return databasePromise
  databasePromise = new Promise(resolve => {
    let settled = false
    const timer = setTimeout(() => finish(null), CACHE_TIMEOUT)
    const finish = (database: IDBDatabase | null) => {
      if (settled) { database?.close(); return }
      settled = true
      clearTimeout(timer)
      resolve(database)
    }
    try {
      const request = indexedDB.open(DATABASE_NAME, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE_NAME, { keyPath: 'key' }) }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => { database.close(); databasePromise = undefined }
        finish(database)
      }
      request.onerror = request.onblocked = () => finish(null)
    } catch { finish(null) }
  })
  return databasePromise
}

async function readDisk(key: string): Promise<Blob | null> {
  const database = await openDatabase()
  if (!database) return null
  return new Promise(resolve => {
    let result: Blob | null = null
    let transaction: IDBTransaction | undefined
    const timer = setTimeout(() => {
      try { transaction?.abort() } catch { /* Cache timeouts must not block cloud loading. */ }
      resolve(null)
    }, CACHE_TIMEOUT)
    const finish = (blob: Blob | null) => { clearTimeout(timer); resolve(blob) }
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onsuccess = () => {
        const value: unknown = request.result
        if (!value || typeof value !== 'object' || !('blob' in value) || !(value.blob instanceof Blob)) return
        result = value.blob
        try { store.put({ key, blob: result, size: result.size, lastUsedAt: Date.now() } satisfies CachedFile) } catch { /* A read can succeed even if the access timestamp cannot be saved. */ }
      }
      transaction.oncomplete = () => finish(result)
      transaction.onerror = transaction.onabort = () => finish(null)
    } catch { finish(null) }
  })
}

async function writeDisk(key: string, blob: Blob): Promise<void> {
  const database = await openDatabase()
  if (!database || blob.size > DISK_LIMIT) return
  return new Promise(resolve => {
    let transaction: IDBTransaction | undefined
    const timer = setTimeout(() => {
      try { transaction?.abort() } catch { /* A full or unavailable cache is optional. */ }
      resolve()
    }, CACHE_TIMEOUT)
    const finish = () => { clearTimeout(timer); resolve() }
    try {
      transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.put({ key, blob, size: blob.size, lastUsedAt: Date.now() } satisfies CachedFile)
      const request = store.getAll()
      request.onsuccess = () => {
        const entries = request.result as CachedFile[]
        let bytes = entries.reduce((sum, entry) => sum + entry.size, 0)
        for (const entry of entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt)) {
          if (bytes <= DISK_LIMIT) break
          store.delete(entry.key)
          bytes -= entry.size
        }
      }
      transaction.oncomplete = transaction.onerror = transaction.onabort = finish
    } catch { finish() }
  })
}

export async function readWorkbookFileCache(key: string): Promise<Blob | null> {
  const cached = memory.get(key)
  if (cached) { remember(key, cached); return cached }
  try {
    const blob = await readDisk(key)
    if (blob) remember(key, blob)
    return blob
  } catch { return null }
}

export function writeWorkbookFileCache(key: string, blob: Blob): Promise<void> {
  remember(key, blob)
  // Save/open success never depends on local storage availability or quota.
  return writeDisk(key, blob).catch(() => {})
}

export async function deleteWorkbookFileCache(key: string): Promise<void> {
  const previous = memory.get(key)
  if (previous) memoryBytes -= previous.size
  memory.delete(key)
  try {
    const database = await openDatabase()
    if (!database) return
    await new Promise<void>(resolve => {
      let transaction: IDBTransaction | undefined
      const timer = setTimeout(() => {
        try { transaction?.abort() } catch { /* Cache cleanup is optional. */ }
        resolve()
      }, CACHE_TIMEOUT)
      const finish = () => { clearTimeout(timer); resolve() }
      try {
        transaction = database.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).delete(key)
        transaction.oncomplete = transaction.onerror = transaction.onabort = finish
      } catch { finish() }
    })
  } catch { /* Cloud operations must not depend on local cache availability. */ }
}
