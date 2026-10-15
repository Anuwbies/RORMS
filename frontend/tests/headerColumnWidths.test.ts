import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultRowCounterWidth, headerResizeScrollStep, headerTextMinimumWidth, resizeHeaderColumns, rowNumberMinimumWidth } from '../src/utils/headerColumnWidths.ts'

const measure = (text: string) => text.length * 10

test('the default counter starts at its measured minimum without leaving empty table space', () => {
  const original = [100, 200, 300]
  const fitted = defaultRowCounterWidth(original, 40)
  assert.equal(fitted[0], 40)
  assert.equal(fitted.reduce((sum, width) => sum + width, 0), 600)
  assert.equal(fitted[1] / fitted[2], 200 / 300)
  assert.deepEqual(original, [100, 200, 300])
})

test('a counter minimum wider than its original allocation does not shrink other columns', () => {
  assert.deepEqual(defaultRowCounterWidth([30, 200, 300], 40), [40, 200, 300])
})

test('row-number minimum fits all digits on one line, including the widest earlier row', () => {
  assert.equal(rowNumberMinimumWidth(9, measure), 10)
  assert.equal(rowNumberMinimumWidth(150, measure), 30)
  const proportionalMeasure = (text: string) => [...text].reduce((width, digit) => width + (digit === '1' ? 3 : 10), 0)
  assert.equal(rowNumberMinimumWidth(111, proportionalMeasure), 23)
})

test('resize scrolling starts near viewport edges and stops in the center', () => {
  assert.equal(headerResizeScrollStep(300, 100, 500), 0)
  assert.equal(headerResizeScrollStep(120, 100, 500), -6)
  assert.equal(headerResizeScrollStep(480, 100, 500), 6)
  assert.equal(headerResizeScrollStep(600, 100, 500), 12)
  assert.equal(headerResizeScrollStep(0, 100, 500), -12)
})

test('scroll displacement contributes to resizing while the pointer remains at the edge', () => {
  const initial = [100, 100]
  const constraints = [{ start: 0, count: 1, minimum: 60 }]
  const pointerDelta = 0
  const scrollDelta = 40
  assert.deepEqual(resizeHeaderColumns(initial, constraints, 0, 1, pointerDelta + scrollDelta), [140, 100])
  assert.deepEqual(resizeHeaderColumns(initial, constraints, 0, 1, pointerDelta - scrollDelta), [60, 100])
})

test('one-word headers retain the complete word width', () => {
  assert.equal(headerTextMinimumWidth('College', measure), 70)
  assert.equal(headerTextMinimumWidth('Section', measure), 70)
})

test('multiword headers use the best whole-word split across two lines', () => {
  assert.equal(headerTextMinimumWidth('Subject Area', measure), 70)
  assert.equal(headerTextMinimumWidth('Descriptive Title', measure), 110)
  assert.equal(headerTextMinimumWidth('Max No. of Stud.', measure), 80)
  assert.equal(headerTextMinimumWidth('  F2F\nRoom  ', measure), 40)
})

test('a single column respects its header and its grouped parent without resizing its neighbor', () => {
  const constraints = [{ start: 0, count: 1, minimum: 50 }, { start: 1, count: 1, minimum: 60 }, { start: 0, count: 2, minimum: 150 }]
  assert.deepEqual(resizeHeaderColumns([100, 80], constraints, 0, 1, -200), [70, 80])
})

test('group resizing respects individual and parent header limits', () => {
  const constraints = [{ start: 0, count: 1, minimum: 70 }, { start: 1, count: 1, minimum: 40 }, { start: 0, count: 2, minimum: 160 }]
  const resized = resizeHeaderColumns([100, 100, 90], constraints, 0, 2, -200)
  assert.ok(resized[0] >= 70)
  assert.ok(resized[1] >= 40)
  assert.equal(resized[0] + resized[1], 160)
  assert.equal(resized[2], 90)
})
