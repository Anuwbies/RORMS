import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const term = { departmentId: 'dept', departmentCode: 'CITE', academicYearId: 'year', academicYear: '2026-2027', semester: 'sem1', membershipId: 'registrar' }
const path = 'departments/dept/workbooks/2026-2027/semesters/sem1'
const parent = 'sheets/workbook_test_sheet_0'
const row = { id: 'class1', sourceWorkbook: path, sourceSheet: 'Schedule', sourceRow: 501, rawValues: Array(21).fill(''), meetings: [] }
function harness({ existingCell = false, stale = false, locked = false, unchanged = false } = {}) {
  const manifest = { schemaVersion: 3, workbookId: 'workbook_test', revision: 1, revisionId: 'revision1', sheetNames: ['Schedule'], sheetIds: ['sheet_0'], sheetSlots: ['a'], cellCounts: [existingCell ? 1 : 0] }
  const documents = new Map([[path, manifest], [parent, { sheetId: 'sheet_0', sourceWorkbook: path, slots: { a: { revisionId: 'base1' } } }]])
  if (existingCell) documents.set(`${parent}/cells/T3`, { baseRevisionId: 'base1', text: 'Old room', styleJson: '{"color":"red"}' })
  if (locked) documents.set(`${path}/saveLocks/current`, { status: 'saving', createdAt: { toMillis: () => Date.now() } })
  const writes = []
  const snapshot = reference => ({ data: () => documents.get(reference), exists: () => documents.has(reference) })
  const context = { exports: {}, Date, require: name => {
    if (name === 'firebase/firestore') return { doc: (_db, reference) => reference, getDocFromServer: async reference => snapshot(reference), serverTimestamp: () => 'now' }
    if (name === '../firebase') return { db: {} }
    if (name === '../utils/departmentWorkbookPaths') return { workbookTermPaths: () => ({ document: path }) }
    if (name === './firestoreDepartmentWorkbooks') return { loadFirestoreDepartmentWorkbook: async () => ({ revision: 1, revisionId: 'revision1', editorState: 'state' }) }
    if (name === '../utils/scheduleRoomWorkbookCells') return { scheduleRoomWorkbookLocation: (_state, item) => ({ workbookRow: item.sourceRow - 498, sheetName: 'Schedule', values: Array(21).fill('') }), scheduleRoomWorkbookTexts: () => [unchanged ? '' : 'PTC 201', ''] }
    throw new Error(name)
  } }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/scheduleRoomWorkbookSync.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText, context)
  const transaction = { get: async reference => { if (stale && reference === path) return { data: () => ({ ...manifest, revision: 2 }) }; return snapshot(reference) },
    set: (reference, data) => writes.push({ reference, data }), update: (reference, data) => writes.push({ reference, data }) }
  return { prepare: context.exports.prepareScheduleRoomWorkbookSync, transaction, writes }
}

test('room-cell patches and the new manifest revision are queued inside the plotting transaction', async () => {
  const h = harness()
  const plan = await h.prepare(term, [row], 'plot1')
  const update = await plan.read(h.transaction)
  const fields = update.updateRow('class1', [])
  assert.equal(h.writes.length, 0)
  assert.equal(fields.rawValues[19], 'PTC 201')
  assert.equal(fields.workbookRow, 3)
  update.apply('actor')
  assert.equal(h.writes.length, 2)
  assert.equal(h.writes[0].reference, `${parent}/cells/T3`)
  assert.equal(h.writes[0].data.plotScheduleId, 'class1')
  assert.equal(h.writes[0].data.text, 'PTC 201')
  assert.equal(h.writes[0].data.baseRevisionId, 'base1')
  assert.equal(h.writes[1].reference, path)
  assert.equal(h.writes[1].data.revision, 2)
  assert.equal(h.writes[1].data.cellCounts[0], 1)
})

test('overwriting an existing room patch preserves styling and does not count the cell twice', async () => {
  const h = harness({ existingCell: true })
  const update = await (await h.prepare(term, [row], 'plot1')).read(h.transaction)
  update.updateRow('class1', [])
  update.apply('actor')
  assert.equal(h.writes[0].data.styleJson, '{"color":"red"}')
  assert.equal(h.writes[1].data.cellCounts[0], 1)
})

test('concurrent workbook edits and active save locks abort before any writes', async () => {
  for (const options of [{ stale: true }, { locked: true }]) {
    const h = harness(options)
    const plan = await h.prepare(term, [row], 'plot1')
    await assert.rejects(plan.read(h.transaction), /workbook changed|saving this workbook/i)
    assert.equal(h.writes.length, 0)
  }
})

test('approving an unchanged room does not rewrite the workbook or advance its revision', async () => {
  const h = harness({ unchanged: true })
  const update = await (await h.prepare(term, [row], 'plot1')).read(h.transaction)
  update.updateRow('class1', [])
  update.apply('actor')
  assert.equal(h.writes.length, 0)
})

test('oversized room-change groups fail before queuing writes', async () => {
  const h = harness()
  const rows = Array.from({ length: 10 }, (_, index) => ({ ...row, id: `class${index}`, sourceRow: 501 + index }))
  const update = await (await h.prepare(term, rows, 'plot1')).read(h.transaction)
  rows.forEach(item => update.updateRow(item.id, []))
  assert.throws(() => update.apply('actor'), /smaller group/)
  assert.equal(h.writes.length, 0)
})
