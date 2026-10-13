import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/ExcelPreviewModal.tsx', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('ExcelPreviewModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let saveEffect
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === 'useEffect' && node.arguments[0]?.getText(parsed).includes('const handleSave =')) saveEffect = node.arguments[0].getText(parsed)
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.ok(saveEffect, 'The workbook save shortcut must remain covered by this test')

function harness(readOnly, onSave) {
  let listener, calls = 0, capture
  const context = { readOnly, onSave, saveWorkbook: () => { calls++ }, document: {
    addEventListener: (_type, callback, capturing) => { listener = callback; capture = capturing },
    removeEventListener: (_type, callback, capturing) => { assert.equal(callback, listener); assert.equal(capturing, capture); listener = undefined },
  } }
  vm.runInNewContext(ts.transpileModule(`globalThis.cleanup = (${saveEffect})();`, { compilerOptions: { target: ts.ScriptTarget.ES2023 } }).outputText, context)
  return { event: changes => {
    const event = { key: 's', ctrlKey: true, metaKey: false, altKey: false, isComposing: false,
      prevented: false, stopped: false, preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...changes }
    listener?.(event)
    return event
  }, calls: () => calls, capture: () => capture, cleanup: () => context.cleanup?.() }
}

test('read-only workbook suppresses Ctrl+S and Cmd+S even without an onSave callback', () => {
  const h = harness(true, undefined)
  assert.equal(h.capture(), true)
  for (const changes of [{}, { ctrlKey: false, metaKey: true }]) {
    const event = h.event(changes)
    assert.equal(event.prevented, true)
    assert.equal(event.stopped, true)
  }
  assert.equal(h.calls(), 0)
  h.cleanup()
})

test('an editable workbook retains its Save shortcut', () => {
  const h = harness(false, () => {})
  assert.equal(h.event({}).prevented, true)
  assert.equal(h.calls(), 1)
  assert.equal(h.event({ altKey: true }).prevented, false)
  assert.equal(h.calls(), 1)
  h.cleanup()
})
