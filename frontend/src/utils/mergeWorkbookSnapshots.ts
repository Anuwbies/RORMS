import type { WorkbookEditSnapshot } from './excelWorkbookState'
import { readSheetPreviewFormatting } from './excelPreviewStyles.ts'

type ConflictChoice = 'local' | 'remote'

function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((value, i) => value === b[i])
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([key, value]) => b.has(key) && same(value, b.get(key)))
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => same(value, b[i]))
  if (plainObject(a) && plainObject(b)) {
    const keys = Object.keys(a).filter(key => a[key] !== undefined), otherKeys = Object.keys(b).filter(key => b[key] !== undefined)
    return keys.length === otherKeys.length && keys.every(key => same(a[key], b[key]))
  }
  return false
}

function coordinates(snapshot: WorkbookEditSnapshot) {
  const workbook = content(snapshot).workbook
  return { ...workbook, Sheets: Object.fromEntries(Object.entries(workbook.Sheets).map(([name, sheet]) => [name,
    Object.fromEntries(Object.entries(sheet).flatMap(([address, value]) => {
      if (address.startsWith('!') || !plainObject(value)) return [[address, value]]
      // Typing adds rich-text metadata and an empty backing cell; neither moves
      // worksheet coordinates. Keep source values/formulas to detect actual moves.
      const { previewFontRuns: _runs, previewTypingFont: _font, ...cell } = value
      return Object.keys(cell).every(key => key === 't' || cell[key] === undefined) ? [] : [[address, cell]]
    })),
  ])) }
}

function content(snapshot: WorkbookEditSnapshot) {
  // Firestore sheet splitting materializes default sheet metadata and XML
  // formatting. Compare those equivalent representations as the same content.
  return { ...snapshot, selectedSheet: '', selection: null,
    workbook: { ...snapshot.workbook, Workbook: { ...snapshot.workbook.Workbook,
      Sheets: snapshot.workbook.SheetNames.map((name, index) => ({ ...snapshot.workbook.Workbook?.Sheets?.[index], name })),
    } },
    formattingOverrides: new Map(snapshot.workbook.SheetNames.map(name => [name, snapshot.formattingOverrides.get(name) ?? readSheetPreviewFormatting(snapshot.previewStyles, name)])),
    previewStyles: snapshot.previewStyles ? { ...snapshot.previewStyles, files: {}, sheetPaths: {} } : null,
  }
}

export function sameSavedWorkbookContent(a: WorkbookEditSnapshot, b: WorkbookEditSnapshot) {
  return same(content(a), content(b))
}

/** Merge against the last saved baseline, preserving local view state. Arrays
 * and worksheet cell objects are atomic to avoid mixing incompatible structures. */
export function mergeWorkbookSnapshots(base: WorkbookEditSnapshot, local: WorkbookEditSnapshot, remote: WorkbookEditSnapshot, choice: ConflictChoice = 'local') {
  // Row/column moves and imports change the underlying worksheet coordinates.
  // Rebasing overrides onto that data can put an edit into the wrong cell.
  const localChanged = !sameSavedWorkbookContent(base, local)
  const remoteChanged = !sameSavedWorkbookContent(base, remote)
  if (localChanged && remoteChanged && !sameSavedWorkbookContent(local, remote)
    && (!same(coordinates(base), coordinates(local)) || !same(coordinates(base), coordinates(remote)))) {
    const snapshot = choice === 'local' ? local : remote
    return { snapshot, conflicts: ['Workbook layout or source sheets'], hasLocalChanges: !sameSavedWorkbookContent(snapshot, remote), structuralConflict: true }
  }
  const conflicts: string[] = []
  const merge = (before: unknown, ours: unknown, theirs: unknown, path: string): unknown => {
    if (same(ours, before)) return theirs
    if (same(theirs, before) || same(ours, theirs)) return ours
    if (ours instanceof Map && theirs instanceof Map && (before === undefined || before instanceof Map)) {
      const previous = before instanceof Map ? before : new Map<unknown, unknown>()
      const entries: [unknown, unknown][] = []
      for (const key of new Set([...previous.keys(), ...ours.keys(), ...theirs.keys()])) {
        const value = merge(previous.get(key), ours.get(key), theirs.get(key), `${path}/${String(key)}`)
        if (value !== undefined) entries.push([key, value])
      }
      return new Map(entries)
    }
    const cell = /^workbook\/Sheets\/[^/]+\/[A-Z]+[1-9][0-9]*$/.test(path)
    if (!cell && plainObject(ours) && plainObject(theirs) && (before === undefined || plainObject(before))) {
      const previous = plainObject(before) ? before : {}
      const entries: [string, unknown][] = []
      for (const key of new Set([...Object.keys(previous), ...Object.keys(ours), ...Object.keys(theirs)])) {
        const value = merge(previous[key], ours[key], theirs[key], path ? `${path}/${key}` : key)
        if (value !== undefined) entries.push([key, value])
      }
      return Object.fromEntries(entries)
    }
    conflicts.push(path)
    return choice === 'local' ? ours : theirs
  }
  // View changes are local, and original archive bytes follow the saved workbook.
  const baseline = content(base), localData = content(local), remoteData = content(remote)
  const merged = merge(baseline, localData, remoteData, '') as WorkbookEditSnapshot
  const hasLocalChanges = !same(merged, remoteData)
  const selectedSheet = merged.workbook.SheetNames.includes(local.selectedSheet) ? local.selectedSheet : remote.selectedSheet
  const snapshot: WorkbookEditSnapshot = {
    ...(hasLocalChanges ? merged : remote), selectedSheet, selection: selectedSheet === local.selectedSheet ? local.selection : remote.selection,
    previewStyles: !hasLocalChanges || same(merged.previewStyles, remoteData.previewStyles) ? remote.previewStyles
      : merged.previewStyles ? { ...merged.previewStyles, files: remote.previewStyles?.files ?? local.previewStyles?.files ?? {}, sheetPaths: remote.previewStyles?.sheetPaths ?? {} } : null,
  }
  return { snapshot, conflicts, hasLocalChanges, structuralConflict: false }
}
