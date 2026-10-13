import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeWorkbookSnapshots, sameSavedWorkbookContent } from '../src/utils/mergeWorkbookSnapshots.ts'
import { createLiveWorkbookReceiver } from '../src/utils/liveWorkbookReceiver.ts'
import type { WorkbookEditSnapshot } from '../src/utils/excelWorkbookState.ts'
import { joinFirestoreWorkbookState, serializeFirestoreWorkbookState, splitFirestoreWorkbookState } from '../src/utils/firestoreWorkbookState.ts'
import { deserializeWorkbookState } from '../src/utils/excelWorkbookState.ts'

function workbook(): WorkbookEditSnapshot {
  return {
    workbook: { SheetNames: ['First', 'Second'], Sheets: { First: { '!ref': 'A1:B3', A1: { t: 's', v: 'Original' } }, Second: { '!ref': 'A1', A1: { t: 's', v: 'Other sheet' } } } },
    previewStyles: null, sheetColors: new Map(), addedRowsBySheet: new Map(), rowHeightOverrides: new Map(), columnWidthOverrides: new Map(),
    cellTextOverrides: new Map(), cellStyleOverrides: new Map(), mergeOverrides: new Map(), formattingOverrides: new Map(), scheduleSetups: new Map(),
    hiddenRangeToggles: new Map(), selectedSheet: 'First', selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
  }
}
function edit(base: WorkbookEditSnapshot, address: string, value: string) {
  return { ...base, cellTextOverrides: new Map(base.cellTextOverrides).set('First', new Map(base.cellTextOverrides.get('First')).set(address, value)) }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('different cell edits merge and preserve local selection and sheet without mutating snapshots', () => {
  const base = workbook(), local = { ...edit(base, 'A1', 'Local'), selectedSheet: 'Second' }, remote = edit(base, 'B1', 'Remote')
  const merged = mergeWorkbookSnapshots(base, local, remote)
  assert.deepEqual(merged.conflicts, [])
  assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('A1'), 'Local')
  assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('B1'), 'Remote')
  assert.equal(merged.snapshot.selectedSheet, 'Second')
  assert.equal(merged.hasLocalChanges, true)
  assert.equal(base.cellTextOverrides.size, 0)
  assert.equal(remote.cellTextOverrides.get('First')?.has('A1'), false)
})

test('same cell conflicts resolve explicitly while retaining non-conflicting changes from both users', () => {
  const base = workbook(), local = edit(edit(base, 'A1', 'Ours'), 'B1', 'Local'), remote = edit(edit(base, 'A1', 'Theirs'), 'C1', 'Remote')
  for (const choice of ['local', 'remote'] as const) {
    const merged = mergeWorkbookSnapshots(base, local, remote, choice)
    assert.deepEqual(merged.conflicts, ['cellTextOverrides/First/A1'])
    assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('A1'), choice === 'local' ? 'Ours' : 'Theirs')
    assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('B1'), 'Local')
    assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('C1'), 'Remote')
  }
})

test('materialized Firestore metadata and formatting do not create false layout conflicts after the first save', () => {
  const base = workbook(), local = { ...edit(base, 'A1', 'Local'), workbook: { ...base.workbook, Sheets: { ...base.workbook.Sheets,
    First: { ...base.workbook.Sheets.First, A1: { ...base.workbook.Sheets.First.A1, previewFontRuns: [{ text: 'Local', fontFamily: 'Arial' }], previewTypingFont: 'Arial' } },
  } } }
  const split = splitFirestoreWorkbookState(serializeFirestoreWorkbookState(edit(base, 'B1', 'Remote')))
  const remote = deserializeWorkbookState(joinFirestoreWorkbookState(split.manifest, split.sheets), {})
  const result = mergeWorkbookSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.snapshot.cellTextOverrides.get('First')?.get('A1'), 'Local')
  assert.equal(result.snapshot.cellTextOverrides.get('First')?.get('B1'), 'Remote')
  assert.deepEqual(result.snapshot.workbook.Sheets.First.A1.previewFontRuns, [{ text: 'Local', fontFamily: 'Arial' }])
})

test('same edits, text clearing, override removal and disjoint formatting merge correctly', () => {
  const base = edit(workbook(), 'A1', 'Saved')
  const local = { ...edit(base, 'A1', ''), cellStyleOverrides: new Map([['First', new Map([['B1', { color: 'red' }]])]]) }
  const remote = edit(base, 'A1', '')
  const merged = mergeWorkbookSnapshots(base, local, remote)
  assert.deepEqual(merged.conflicts, [])
  assert.equal(merged.snapshot.cellTextOverrides.get('First')?.get('A1'), '')
  assert.equal(merged.snapshot.cellStyleOverrides.get('First')?.get('B1')?.color, 'red')
  const removed = { ...base, cellTextOverrides: new Map([['First', new Map<string, string>()]]) }
  assert.equal(mergeWorkbookSnapshots(base, removed, edit(base, 'B1', 'Remote')).snapshot.cellTextOverrides.get('First')?.has('A1'), false)
})

test('receiving a saved workbook without local edits remains clean and uses the new original archive', () => {
  const base = workbook(), remote = edit(base, 'B1', 'New save')
  const result = mergeWorkbookSnapshots(base, { ...base, selectedSheet: 'Second' }, remote)
  assert.equal(result.hasLocalChanges, false)
  assert.equal(result.snapshot.cellTextOverrides, remote.cellTextOverrides)
  assert.equal(sameSavedWorkbookContent(result.snapshot, remote), true)
})

test('layout changes cannot silently rebase text into shifted rows; deleting a viewed sheet chooses a valid view', () => {
  const base = workbook(), local = edit(base, 'A1', 'Local')
  const remote = { ...base, workbook: { ...base.workbook, Sheets: { ...base.workbook.Sheets, First: { '!ref': 'A1:B4', A2: base.workbook.Sheets.First.A1 } } } }
  const result = mergeWorkbookSnapshots(base, local, remote)
  assert.equal(result.structuralConflict, true)
  assert.equal(result.snapshot, local)
  assert.equal(mergeWorkbookSnapshots(base, local, remote, 'remote').snapshot, remote)
  const deleted = { ...base, workbook: { SheetNames: ['Second'], Sheets: { Second: base.workbook.Sheets.Second } }, selectedSheet: 'Second' }
  assert.equal(mergeWorkbookSnapshots(base, base, deleted).snapshot.selectedSheet, 'Second')
})

test('receiver coalesces commits and ignores an in-flight older load', async () => {
  let finish: ((value: { revision: number }) => void) | undefined, reads = 0
  const received: number[] = []
  const receiver = createLiveWorkbookReceiver(() => ++reads === 1 ? new Promise<{ revision: number }>(resolve => { finish = resolve }) : Promise.resolve({ revision: 3 }), () => 1, value => received.push(value.revision), error => { throw error })
  receiver.pause(false)
  receiver.notify({ path: 'term', revision: 2 })
  receiver.notify({ path: 'term', revision: 3 })
  finish!({ revision: 2 }); await tick()
  assert.deepEqual(received, [3]); assert.equal(reads, 2)
})

test('own saves and paused imports retain notifications, and self acknowledgements do not reload', async () => {
  let saved = 1, reads = 0
  const received: number[] = []
  const receiver = createLiveWorkbookReceiver(async () => { reads++; return { revision: 3 } }, () => saved, value => received.push(value.revision), error => { throw error })
  receiver.notify({ path: 'term', revision: 2 }); saved = 2; receiver.pause(false); await tick()
  assert.equal(reads, 0)
  receiver.pause(true); receiver.notify({ path: 'term', revision: 3 }); await tick(); assert.equal(reads, 0)
  receiver.pause(false); await tick(); assert.deepEqual(received, [3])
})

test('unmount/account changes cancel late loads and Strict Mode restart remains usable', async () => {
  let finish: ((value: { revision: number }) => void) | undefined, reads = 0
  const received: number[] = []
  const receiver = createLiveWorkbookReceiver(() => ++reads === 1 ? new Promise<{ revision: number }>(resolve => { finish = resolve }) : Promise.resolve({ revision: 4 }), () => 1, value => received.push(value.revision), error => { throw error })
  receiver.pause(false); receiver.notify({ path: 'term', revision: 2 }); receiver.stop()
  receiver.start(); receiver.notify({ path: 'other-account', revision: 4 }); await tick()
  finish!({ revision: 2 }); await tick(); assert.deepEqual(received, [4])
})

test('failed live loads preserve the editor baseline and later commits can retry', async () => {
  let reads = 0
  const received: number[] = [], errors: unknown[] = []
  const receiver = createLiveWorkbookReceiver(async () => { if (++reads === 1) throw new Error('Offline'); return { revision: 3 } }, () => 1, value => received.push(value.revision), error => errors.push(error))
  receiver.pause(false); receiver.notify({ path: 'term', revision: 2 }); await tick()
  assert.equal(errors.length, 1); assert.deepEqual(received, [])
  receiver.notify({ path: 'term', revision: 3 }); await tick(); assert.deepEqual(received, [3])
})
