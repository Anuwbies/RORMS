import { deserializeWorkbookState, type WorkbookEditSnapshot } from './excelWorkbookState.ts'
import type { FirestoreWorkbookSheet } from './firestoreWorkbookState'

export interface WorkbookAuditChange {
  kind: string
  sheet: string
  location: string
  field: string
  before: string | null
  after: string | null
}

export interface WorkbookAudit {
  version: 1
  kind: 'created' | 'imported' | 'updated' | 'repaired'
  counts: Record<string, number>
  samples: WorkbookAuditChange[]
  totalChanges: number
  omittedSamples: number
  baselineAvailable: boolean
}

function canonical(value: unknown): unknown {
  if (value === undefined) return null
  if (value instanceof Map) return [...value].map(([key, item]) => [String(key), canonical(item)]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
  return value
}
const equal = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
const display = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  const result = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(canonical(value)) : String(value)
  return result.length > 400 ? `${result.slice(0, 399)}…` : result
}

/** Bounded descriptions of persisted changes, independent of selection and map insertion order. */
export function describeWorkbookSave(input: {
  before: readonly FirestoreWorkbookSheet[] | null
  after: readonly FirestoreWorkbookSheet[]
  previousFileName?: string
  fileName: string
  previousRevision: number
  imported?: boolean
  repaired?: boolean
  schedules?: { added: number; updated: number; removed: number; samples: WorkbookAuditChange[]; omittedSamples: number }
}): WorkbookAudit {
  const counts: Record<string, number> = {}
  const samples: WorkbookAuditChange[] = []
  let descriptions = 0
  const add = (kind: string, sheet: string, location: string, field: string, before: unknown, after: unknown) => {
    counts[kind] = (counts[kind] || 0) + 1
    descriptions++
    if (samples.length < 80) samples.push({ kind, sheet, location, field, before: display(before), after: display(after) })
  }
  const compare = (kind: string, sheet: string, location: string, field: string, before: unknown, after: unknown) => {
    if (!equal(before, after)) add(kind, sheet, location, field, before, after)
  }
  const kind = input.repaired ? 'repaired' : !input.previousRevision ? 'created' : input.imported ? 'imported' : 'updated'
  if (input.previousFileName && input.previousFileName !== input.fileName) add('workbook', '', '', 'Filename', input.previousFileName, input.fileName)
  const previous = input.before || []
  const used = new Set<string>()
  const previousNames = previous.map(sheet => sheet.name), nextNames = input.after.map(sheet => sheet.name)
  if (input.before && previousNames.length === nextNames.length && previousNames.every(name => nextNames.includes(name))) {
    compare('sheetOrder', '', '', 'Sheet order', previousNames, nextNames)
  }
  for (const [index, next] of input.after.entries()) {
    let old = previous.find(sheet => sheet.name === next.name)
    // IDs are positional. Match names before recognizing an otherwise-unmatched rename.
    if (!old && input.before && previous[index] && !nextNames.includes(previous[index].name) && !used.has(previous[index].name)) {
      old = previous[index]
      add('sheetsRenamed', next.name, '', 'Sheet name', old.name, next.name)
    }
    if (!old) {
      add(input.before ? 'sheetsAdded' : 'sheetsIncluded', next.name, '', input.before ? 'Added sheet' : 'Saved sheet', null, next.name)
      continue
    }
    used.add(old.name)
    if (old.json === next.json) continue
    const left = deserializeWorkbookState(old.json, {}), right = deserializeWorkbookState(next.json, {})
    const leftSheet = left.workbook.Sheets[old.name], rightSheet = right.workbook.Sheets[next.name]
    const leftTexts = left.cellTextOverrides.get(old.name), rightTexts = right.cellTextOverrides.get(next.name)
    const leftStyles = left.cellStyleOverrides.get(old.name), rightStyles = right.cellStyleOverrides.get(next.name)
    const addresses = new Set([...Object.keys(leftSheet), ...Object.keys(rightSheet), ...(leftTexts?.keys() || []), ...(rightTexts?.keys() || []), ...(leftStyles?.keys() || []), ...(rightStyles?.keys() || [])].filter(address => /^[A-Z]+[1-9]\d*$/.test(address)))
    const cellText = (snapshot: WorkbookEditSnapshot, name: string, address: string) => {
      const override = snapshot.cellTextOverrides.get(name)?.get(address)
      const cell = snapshot.workbook.Sheets[name][address]
      return override ?? (cell?.f ? `=${cell.f}` : cell?.w ?? (cell?.v == null ? '' : String(cell.v)))
    }
    for (const address of addresses) {
      compare('cellsChanged', next.name, address, 'Cell value', cellText(left, old.name, address), cellText(right, next.name, address))
      const beforeStyle = { style: leftSheet[address]?.s, numberFormat: leftSheet[address]?.z, override: leftStyles?.get(address) }
      const afterStyle = { style: rightSheet[address]?.s, numberFormat: rightSheet[address]?.z, override: rightStyles?.get(address) }
      if (!equal(beforeStyle, afterStyle)) add('formattingChanged', next.name, address, 'Cell formatting', beforeStyle, afterStyle)
      compare('cellDetailsChanged', next.name, address, 'Comments and notes', leftSheet[address]?.c, rightSheet[address]?.c)
      compare('cellDetailsChanged', next.name, address, 'Link', leftSheet[address]?.l, rightSheet[address]?.l)
    }
    for (const [field, label] of [
      ['sheetColors', 'Sheet color'], ['addedRowsBySheet', 'Added rows'], ['rowHeightOverrides', 'Row heights'],
      ['columnWidthOverrides', 'Column widths'], ['mergeOverrides', 'Merged cells'], ['hiddenRangeToggles', 'Hidden rows and columns'],
      ['formattingOverrides', 'Formatting rules'], ['scheduleSetups', 'Schedule header, years and row statuses'],
    ] as const) {
      compare(field === 'scheduleSetups' ? 'setupChanged' : field === 'formattingOverrides' ? 'formattingChanged' : 'layoutChanged', next.name, '', label, left[field].get(old.name), right[field].get(next.name))
    }
    for (const key of new Set([...Object.keys(leftSheet), ...Object.keys(rightSheet)].filter(key => key.startsWith('!')))) {
      compare('layoutChanged', next.name, '', ({ '!ref': 'Sheet range', '!rows': 'Rows', '!cols': 'Columns', '!merges': 'Merged ranges' } as Record<string, string>)[key] || key, leftSheet[key], rightSheet[key])
    }
    const leftInfo = left.workbook.Workbook?.Sheets?.[0], rightInfo = right.workbook.Workbook?.Sheets?.[0]
    compare('layoutChanged', next.name, '', 'Sheet visibility', leftInfo?.Hidden || 0, rightInfo?.Hidden || 0)
    compare('formattingChanged', next.name, '', 'Workbook styles', left.previewStyles, right.previewStyles)
  }
  for (const old of previous) if (!used.has(old.name) && !nextNames.includes(old.name)) add('sheetsRemoved', old.name, '', 'Removed sheet', old.name, null)
  if (input.schedules) {
    counts.schedulesAdded = input.schedules.added
    counts.schedulesUpdated = input.schedules.updated
    counts.schedulesRemoved = input.schedules.removed
    descriptions += input.schedules.samples.length + input.schedules.omittedSamples
    // Schedule fields are the most useful examples; retain room/faculty/time/status changes first.
    const combined = [...input.schedules.samples, ...samples]
    samples.splice(0, samples.length, ...combined.slice(0, 80))
  }
  const totalChanges = Object.values(counts).reduce((sum, value) => sum + value, 0)
  return { version: 1, kind, counts, samples, totalChanges, omittedSamples: Math.max(0, descriptions - samples.length), baselineAvailable: input.before !== null }
}
