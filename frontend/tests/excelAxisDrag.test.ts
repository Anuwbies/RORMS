import assert from 'node:assert/strict'
import { test } from 'node:test'
import { axisDragOffset, axisDragTarget, axisDragScrollSpeed, createAxisDragPreview } from '../src/utils/excelAxisDrag.ts'

test('row previews stay vertical and column previews stay horizontal, even with diagonal pointer movement', () => {
  const start = { x: 100, y: 200 }
  assert.deepEqual(axisDragOffset('row', start, { x: 800, y: 240 }), { x: 0, y: 40 })
  assert.deepEqual(axisDragOffset('column', start, { x: 60, y: 900 }), { x: -40, y: 0 })
  assert.deepEqual(axisDragOffset('row', start, { x: 800, y: 200 }), { x: 0, y: 0 })
  assert.deepEqual(axisDragOffset('column', start, { x: 100, y: 900 }), { x: 0, y: 0 })
})

test('drop boundaries follow the real visible headers and their different sizes, including hidden gaps', () => {
  const headers = [{ index: 0, start: 30, end: 70 }, { index: 3, start: 70, end: 150 }, { index: 4, start: 150, end: 180 }]
  assert.deepEqual(axisDragTarget(headers, 35), { index: 0, after: false })
  assert.deepEqual(axisDragTarget(headers, 60), { index: 0, after: true })
  assert.deepEqual(axisDragTarget(headers, 100), { index: 3, after: false })
  assert.deepEqual(axisDragTarget(headers, 140), { index: 3, after: true })
  assert.deepEqual(axisDragTarget(headers, 175), { index: 4, after: true })
  assert.equal(axisDragTarget(headers, 0), null)
  assert.equal(axisDragTarget(headers, 181), null)
  assert.equal(axisDragTarget([], 100), null)
})

test('edge scrolling is bounded and stops when the pointer returns to the middle', () => {
  assert.equal(axisDragScrollSpeed(5, 0, 300), -14)
  assert.equal(axisDragScrollSpeed(295, 0, 300), 14)
  assert.equal(axisDragScrollSpeed(150, 0, 300), 0)
  assert.equal(axisDragScrollSpeed(-100, 0, 300), -16)
  assert.equal(axisDragScrollSpeed(500, 0, 300), 16)
})

class PreviewElement {
  style: Record<string, string> = {}
  className = ''
  children: PreviewElement[] = []
  attributes: Record<string, string> = {}
  inert = false
  removed = false
  append(...elements: PreviewElement[]) { this.children.push(...elements) }
  setAttribute(key: string, value: string) { this.attributes[key] = value }
  remove() { this.removed = true }
}

test('the translucent preview follows the selected area without copying cells or changing sheet layout', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const body = new PreviewElement()
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body, createElement: () => new PreviewElement() } })
  try {
    const scroller = { clientWidth: 300, clientHeight: 200, getBoundingClientRect: () => ({ left: 10, top: 100 }) } as unknown as HTMLElement
    let worksheetBottom = 350
    const worksheet = { getBoundingClientRect: () => ({ bottom: worksheetBottom }) } as unknown as HTMLElement
    const headers = [0, 1].map(index => ({
      getBoundingClientRect: () => ({ left: 10, right: 60, top: 130 + index * 40, bottom: 170 + index * 40, width: 50, height: 40 }),
    })) as unknown as HTMLElement[]
    const preview = createAxisDragPreview('row', scroller, worksheet, headers, { x: 1, y: 1 })
    const layer = body.children[0], band = layer.children[0]
    assert.equal(layer.style.width, '300px')
    assert.equal(layer.style.height, '200px')
    assert.equal(layer.attributes['aria-hidden'], 'true')
    assert.equal(layer.inert, true)
    assert.equal(band.style.top, '30px')
    assert.equal(band.style.height, '80px')
    assert.equal(band.children.length, 0)
    assert.match(band.className, /bg-\[#62853e\]\/20/)
    assert.doesNotMatch(band.className, /\b(?:ring|border|outline)-/)
    const rowDestination = layer.children[1]
    preview.highlightTarget({ start: 110, end: 150, after: true, error: false })
    assert.equal(rowDestination.style.left, '0px')
    assert.equal(rowDestination.style.top, '110px')
    assert.equal(rowDestination.style.width, '300px')
    assert.equal(rowDestination.style.height, '40px')
    assert.match(rowDestination.className, /border-b-2/)
    assert.match(rowDestination.className, /border-\[#62853e\]/)
    assert.doesNotMatch(rowDestination.className, /\bbg-/)
    preview.highlightTarget(null)
    assert.equal(rowDestination.style.display, 'none')
    preview.move(axisDragOffset('row', { x: 0, y: 0 }, { x: 100, y: 25 }))
    assert.equal(band.style.translate, '0px 25px')
    preview.layer.remove()
    assert.equal(layer.removed, true)
    const columnHeaders = [0, 1].map(index => ({
      getBoundingClientRect: () => ({ left: 70 + index * 50, right: 120 + index * 50, top: 100, bottom: 130, width: 50, height: 30 }),
    })) as unknown as HTMLElement[]
    const columnPreview = createAxisDragPreview('column', scroller, worksheet, columnHeaders, { x: 1, y: 1 })
    const columnBand = body.children[1].children[0]
    assert.equal(columnBand.style.left, '60px')
    assert.equal(columnBand.style.top, '0px')
    assert.equal(columnBand.style.width, '100px')
    assert.equal(columnBand.style.height, '200px')
    const columnDestination = body.children[1].children[1]
    columnPreview.highlightTarget({ start: 160, end: 210, after: false, error: true })
    assert.equal(columnDestination.style.left, '160px')
    assert.equal(columnDestination.style.top, '0px')
    assert.equal(columnDestination.style.width, '50px')
    assert.equal(columnDestination.style.height, '200px')
    assert.match(columnDestination.className, /border-l-2/)
    assert.match(columnDestination.className, /border-rose-500/)
    assert.doesNotMatch(columnDestination.className, /\bbg-/)
    columnPreview.move(axisDragOffset('column', { x: 0, y: 0 }, { x: 45, y: 900 }))
    assert.equal(columnBand.style.translate, '45px 0px')
    // Scrolling to the sheet bottom reveals the add-rows controls inside the viewport.
    worksheetBottom = 260
    columnPreview.move({ x: 50, y: 0 })
    assert.equal(body.children[1].style.height, '160px')
    worksheetBottom = 240
    columnPreview.highlightTarget({ start: 160, end: 210, after: false, error: false })
    assert.equal(body.children[1].style.height, '140px')
    assert.match(body.children[1].className, /overflow-hidden/)
    worksheetBottom = 350
    columnPreview.move({ x: 55, y: 0 })
    assert.equal(body.children[1].style.height, '200px')
    columnPreview.layer.remove()
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

