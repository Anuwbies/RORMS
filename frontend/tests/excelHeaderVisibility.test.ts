import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'
import { setSheetAxisHidden } from '../src/utils/excelGridEdits.ts'

const source = readFileSync(new URL('../src/components/ExcelPreviewModal.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('ExcelPreviewModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const expressions = new Map<string, ts.Expression>()
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) expressions.set(node.name.text, node.initializer)
  ts.forEachChild(node, visit)
}
visit(ast)
const compile = (name: string) => {
  const expression = expressions.get(name)
  assert(expression)
  return ts.transpileModule(`module.exports = ${expression.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
  }).outputText
}

for (const axis of ['row', 'column'] as const) for (const hidden of [true, false]) test(`${hidden ? 'hiding' : 'showing'} a ${axis} block through its context menu preserves the viewport and nearby header focus`, () => {
  const original: XLSX.WorkSheet = { '!ref': 'A1:GR200' }
  const key = axis === 'row' ? '!rows' : '!cols'
  if (!hidden) original[key] = Array.from({ length: 200 }, (_, index) => ({ hidden: index === 109 || index === 110 }))
  let sheet = original, menuClosed = false, focusedIndex = -1, preventedScroll = false
  const scroller = { scrollLeft: 310, scrollTop: 820, scrollTo: (left: number, top: number) => { scroller.scrollLeft = left; scroller.scrollTop = top } }
  const frames: Array<() => void> = []
  const visibleHeaders = () => [0, 108, 109, 110, 111, 112].filter(index => !sheet[key]?.[index]?.hidden).map(index => ({
    dataset: { gridIndex: String(index) },
    focus: (options?: { preventScroll?: boolean }) => {
      focusedIndex = index; preventedScroll = Boolean(options?.preventScroll)
      if (!preventedScroll) scroller.scrollTo(0, 0)
    },
  }))
  const context: Record<string, unknown> = {
    module: { exports: undefined }, readOnly: false, sheet: original,
    workbook: { SheetNames: ['Sheet1'], Sheets: { Sheet1: original } }, selectedSheet: 'Sheet1',
    headerMenu: { axis, index: 109, indexes: [109, 110] }, selectedHiddenHeaderCount: hidden ? 0 : 2,
    hiddenHeaderIndexes: hidden ? [] : [109, 110], setSheetAxisHidden,
    setWorkbook: (workbook: XLSX.WorkBook) => { sheet = workbook.Sheets.Sheet1 },
    setHeaderMenu: () => { menuClosed = true }, setRenderedRowHeights: () => {},
    sheetScrollRef: { current: scroller }, requestAnimationFrame: (callback: () => void) => { frames.push(callback) },
    dialogRef: { current: {
      querySelector: (selector: string) => {
        const index = Number(selector.match(/data-grid-index="(\d+)"/)?.[1] ?? 0)
        return visibleHeaders().find(header => Number(header.dataset.gridIndex) === index) ?? null
      },
      querySelectorAll: () => visibleHeaders(),
    } },
  }
  vm.runInNewContext(compile('closeHeaderMenu'), context)
  context.closeHeaderMenu = (context.module as { exports: unknown }).exports
  vm.runInNewContext(compile('changeHeaderVisibility'), context)
  const changeVisibility = (context.module as { exports: (hidden: boolean) => void }).exports
  changeVisibility(hidden)
  scroller.scrollTo(0, 0) // Simulate scroll anchoring during the worksheet render.
  frames.forEach(callback => callback())
  assert.equal(menuClosed, true)
  assert.equal(sheet[key]?.[109]?.hidden, hidden)
  assert.equal(sheet[key]?.[110]?.hidden, hidden)
  assert.equal(focusedIndex, hidden ? 111 : 109)
  assert.equal(preventedScroll, true)
  assert.equal(scroller.scrollLeft, 310)
  assert.equal(scroller.scrollTop, 820)
  assert.equal(Boolean(original[key]?.[109]?.hidden), !hidden)
})
