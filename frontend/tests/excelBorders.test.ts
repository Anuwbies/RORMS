import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'
import type { CSSProperties } from 'react'

const source = readFileSync(new URL('../src/components/ExcelPreviewModal.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('ExcelPreviewModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const expressions = new Map<string, ts.Expression>()
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) expressions.set(node.name.text, node.initializer)
  ts.forEachChild(node, visit)
}
visit(ast)
function handler(name: string, context: Record<string, unknown>): unknown {
  const expression = expressions.get(name)
  assert(expression)
  const compiled = ts.transpileModule(`module.exports = ${expression.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const scope = { ...context, module: { exports: undefined as unknown } }
  vm.runInNewContext(compiled, scope)
  return scope.module.exports
}
const sides = ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const
const neighbors = {
  borderTop: { row: -1, column: 0, side: 'borderBottom' },
  borderRight: { row: 0, column: 1, side: 'borderLeft' },
  borderBottom: { row: 1, column: 0, side: 'borderTop' },
  borderLeft: { row: 0, column: -1, side: 'borderRight' },
}
const line = '2px solid #000000'

test('border edits keep the outline on selected cells and clear the outside copies on every side', () => {
  let styles = new Map<string, Map<string, CSSProperties>>([['Sheet1', new Map()]])
  const update = handler('updateSelectedBorders', {
    readOnly: false, selectedSheet: 'Sheet1', bounds: { lastRow: 4, lastColumn: 4 },
    selectedRange: XLSX.utils.decode_range('B2:C3'), XLSX, BORDER_SIDES: sides, BORDER_NEIGHBORS: neighbors,
    setCellStyleOverrides: (updater: (current: typeof styles) => typeof styles) => { styles = updater(styles) },
  }) as (borderFor: () => string) => void
  update(() => line)
  const edits = styles.get('Sheet1')!
  for (let r = 1; r <= 2; r++) for (let c = 1; c <= 2; c++) {
    for (const side of sides) {
      assert.equal(edits.get(XLSX.utils.encode_cell({ r, c }))?.[side], line)
      const neighbor = neighbors[side], row = r + neighbor.row, column = c + neighbor.column
      if (row < 1 || row > 2 || column < 1 || column > 2) {
        assert.equal(edits.get(XLSX.utils.encode_cell({ r: row, c: column }))?.[neighbor.side as typeof sides[number]], 'none')
      }
    }
  }
})

test('clearing a moved cell border does not hide a border owned by its new neighbor', () => {
  const base = new Map<string, CSSProperties>([['A2', { borderRight: line }]])
  const edits = new Map<string, CSSProperties>([['B2', { borderLeft: 'none' }]])
  const resolve = handler('resolvedBordersFor', {
    XLSX, rowStart: 0, rowEnd: 4, columnStart: 0, columnEnd: 4, DEFAULT_GRIDLINE: '1px solid #d4d4d4',
    styleForCell: (address: string) => base.get(address) ?? {},
    editStyleForCell: (address: string) => edits.get(address) ?? {},
    strongerBorder: (current: string | undefined, candidate: string | undefined) => !current || (Number.parseFloat(candidate ?? '') || 0) > (Number.parseFloat(current) || 0) ? candidate : current,
  }) as (range: XLSX.Range, explicitOnly?: boolean) => CSSProperties
  assert.equal(resolve(XLSX.utils.decode_range('B2')).borderLeft, line)
  assert.equal(resolve(XLSX.utils.decode_range('A2')).borderRight, line)
  edits.set('A2', { borderRight: 'none' })
  assert.equal(resolve(XLSX.utils.decode_range('B2')).borderLeft, '1px solid #d4d4d4')
  assert.equal(resolve(XLSX.utils.decode_range('B2'), true).borderLeft, 'none')
})
