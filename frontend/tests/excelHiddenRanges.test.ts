import assert from 'node:assert/strict'
import { test } from 'node:test'
import { axisVisibilityIndicators, rememberHiddenRange, shownAxisRanges, type HiddenAxisRange } from '../src/utils/excelHiddenRanges.ts'

function indicators(hidden: readonly number[], remembered: readonly HiddenAxisRange[] = [], last = 12) {
  const metadata = Array.from({ length: last + 1 }, (_, index) => ({ hidden: hidden.includes(index) }))
  const visible = metadata.flatMap((item, index) => item.hidden ? [] : [index])
  return [...axisVisibilityIndicators(last, visible, metadata, remembered).values()].flat()
}

test('a revealed range keeps its indicator, which targets the same range when hidden again', () => {
  const hidden = [5, 6, 7, 8]
  const before = indicators(hidden)
  assert.deepEqual(before, [{ start: 5, end: 8, anchor: 9, direction: -1, hidden: true }])
  const remembered = rememberHiddenRange([], before[0])
  assert.deepEqual(indicators([], remembered), [
    { start: 5, end: 8, anchor: 5, direction: -1, hidden: false },
    { start: 5, end: 8, anchor: 8, direction: 1, hidden: false },
  ])
  assert.deepEqual(indicators(hidden, remembered), before)
})

test('different hidden ranges remain independent when one range is revealed', () => {
  assert.deepEqual(indicators([1, 2, 10], [{ start: 5, end: 8 }]), [
    { start: 1, end: 2, anchor: 3, direction: -1, hidden: true },
    { start: 10, end: 10, anchor: 11, direction: -1, hidden: true },
    { start: 5, end: 8, anchor: 5, direction: -1, hidden: false },
    { start: 5, end: 8, anchor: 8, direction: 1, hidden: false },
  ])
})

test('leading and trailing ranges show hide indicators on their first and last revealed cells', () => {
  const remembered = [{ start: 0, end: 1 }, { start: 11, end: 12 }]
  assert.deepEqual(indicators([0, 1, 11, 12], remembered), [
    { start: 0, end: 1, anchor: 2, direction: -1, hidden: true },
    { start: 11, end: 12, anchor: 10, direction: 1, hidden: true },
  ])
  assert.deepEqual(indicators([], remembered), [
    { start: 0, end: 1, anchor: 0, direction: -1, hidden: false },
    { start: 0, end: 1, anchor: 1, direction: 1, hidden: false },
    { start: 11, end: 12, anchor: 11, direction: -1, hidden: false },
    { start: 11, end: 12, anchor: 12, direction: 1, hidden: false },
  ])
})

test('a revealed block between hidden neighbors remains clickable', () => {
  const actual = indicators([0, 1, 5, 6, 7], [{ start: 2, end: 4 }], 7)
  assert.ok(actual.some(indicator => indicator.start === 2 && indicator.end === 4 && indicator.anchor === 4 && !indicator.hidden))
  assert.deepEqual(indicators(Array.from({ length: 8 }, (_, index) => index), [{ start: 2, end: 4 }], 7), [])
})

test('partially hidden remembered ranges do not duplicate their hidden indicators', () => {
  const remembered = [{ start: 5, end: 8 }]
  const actual = indicators([6, 7], remembered)
  assert.deepEqual(actual, [{ start: 6, end: 7, anchor: 8, direction: -1, hidden: true }])
  const next = rememberHiddenRange(remembered, actual[0])
  assert.deepEqual(next, remembered)
  assert.deepEqual(indicators([], next), [
    { start: 5, end: 8, anchor: 5, direction: -1, hidden: false },
    { start: 5, end: 8, anchor: 8, direction: 1, hidden: false },
  ])
})

test('remembering overlapping ranges preserves their full extent and immutable history snapshots', () => {
  const original = [{ start: 2, end: 4 }, { start: 8, end: 10 }, { start: 15, end: 16 }]
  const snapshot = structuredClone(original)
  assert.deepEqual(rememberHiddenRange(original, { start: 3, end: 9 }), [{ start: 2, end: 10 }, { start: 15, end: 16 }])
  assert.deepEqual(original, snapshot)
})

test('invalid or off-grid remembered ranges do not create stray controls', () => {
  assert.deepEqual(indicators([], [{ start: -1, end: 3 }, { start: 3, end: 2 }, { start: 10, end: 20 }]), [])
})

test('a single revealed row or column gets one hide indicator', () => {
  assert.deepEqual(indicators([], [{ start: 5, end: 5 }]), [{ start: 5, end: 5, anchor: 5, direction: -1, hidden: false }])
})

test('revealed highlights only include remembered ranges whose cells are shown', () => {
  const remembered = [{ start: 1, end: 2 }, { start: 5, end: 8 }, { start: 10, end: 15 }]
  const metadata = Array.from({ length: 13 }, (_, index) => ({ hidden: index === 6 }))
  assert.deepEqual(shownAxisRanges(12, metadata, remembered), [{ start: 1, end: 2 }])
  metadata[6].hidden = false
  assert.deepEqual(shownAxisRanges(12, metadata, remembered), remembered.slice(0, 2))
})
