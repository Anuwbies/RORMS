import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'

const source = readFileSync(new URL('../src/components/ExcelPreviewModal.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('ExcelPreviewModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let opening: ts.Expression | undefined, readEffect: ts.Expression | undefined
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'isOpeningWorkbook') opening = node.initializer
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const readFile = async')) readEffect = node.arguments[0]
  ts.forEachChild(node, visit)
}
visit(ast)
assert(opening); assert(readEffect)
const openingSource = opening.getText(ast), effectSource = readEffect.getText(ast)
const compiled = ts.transpileModule(`module.exports = ${effectSource}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText

test('loading remains visible between the download finishing and workbook reading starting', () => {
  const state = { loading: false, loadBlocked: false, error: '', isReading: false, workbook: null }
  assert.equal(vm.runInNewContext(openingSource, state), true)
  assert.equal(vm.runInNewContext(openingSource, { ...state, loading: true }), true)
  assert.equal(vm.runInNewContext(openingSource, { ...state, isReading: true }), true)
  assert.equal(vm.runInNewContext(openingSource, { ...state, workbook: XLSX.utils.book_new() }), false)
  assert.equal(vm.runInNewContext(openingSource, { ...state, error: 'Invalid workbook' }), false)
  assert.equal(vm.runInNewContext(openingSource, { ...state, loadBlocked: true }), false)
})

function harness({ cancelled = false, malformed = false, empty = false } = {}) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Saved schedule']]), 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  const frames: Array<() => void> = [], events: string[] = []
  const context: Record<string, unknown> = {
    module: { exports: undefined }, loading: false, loadBlocked: false, isReading: false, error: '', workbook: null,
    file: empty ? null : { name: malformed ? 'invalid.txt' : 'Schedule.xlsx', arrayBuffer: async () => { events.push('read'); return bytes } },
    initialEditorState: undefined, persistenceMode: 'storage', emptyWorkbookBehavior: empty ? 'message' : 'sheet',
    XLSX, DEFAULT_ROWS_TO_ADD: 50, hideCellAnnotations: () => {},
    parseExcelPreviewStyles: () => { events.push('parse'); return { files: {}, sheetPaths: {}, cellStyles: [], differentialStyles: [] } },
    getCellText: (cell?: XLSX.CellObject) => String(cell?.v ?? ''),
    requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length }, cancelAnimationFrame: () => {},
  }
  for (const ref of ['importedSourceRef', 'savedSnapshotRef', 'cellClipboardRef', 'pendingSelectionFocusRef', 'selectionFrameRef', 'resizeDragRef', 'resizeFrameRef']) context[ref] = { current: null }
  for (const setter of effectSource.matchAll(/\b(set[A-Z]\w*)\(/g)) context[setter[1]] = () => {}
  context.setWorkbook = (next: XLSX.WorkBook | null) => { context.workbook = next }
  context.setIsReading = (next: boolean) => { context.isReading = next }
  context.setError = (next: string) => { context.error = next }
  vm.runInNewContext(compiled, context)
  const effect = (context.module as { exports: () => () => void }).exports
  const cleanup = effect()
  if (cancelled) cleanup()
  return { context, frames, events }
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test('the loading message gets a paint opportunity before parsing and ends when the workbook is ready', async () => {
  const { context, frames, events } = harness()
  assert.equal(vm.runInNewContext(openingSource, context), true)
  assert.deepEqual(events, [])
  frames.shift()!()
  await settle()
  assert.deepEqual(events, [])
  frames.shift()!()
  await settle()
  assert.deepEqual(events, ['read', 'parse'])
  assert.deepEqual((context.workbook as XLSX.WorkBook).SheetNames, ['Schedule'])
  assert.equal(vm.runInNewContext(openingSource, context), false)
})

for (const outcome of ['cancelled', 'malformed', 'empty'] as const) test(`${outcome} workbook opening does not leave a blank pending view`, async () => {
  const { context, frames, events } = harness({ [outcome]: true })
  frames.shift()!(); frames.shift()!()
  await settle()
  if (outcome === 'cancelled') { assert.deepEqual(events, []); assert.equal(context.workbook, null) }
  else {
    assert.equal(vm.runInNewContext(openingSource, context), false)
    if (outcome === 'malformed') assert.equal(context.error, 'Choose an .xlsx workbook.')
    else assert.deepEqual((context.workbook as XLSX.WorkBook).SheetNames, [])
  }
})
