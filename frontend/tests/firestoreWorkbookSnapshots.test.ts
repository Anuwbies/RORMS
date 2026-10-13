import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { compressSnapshot, compressedParts, decompressSnapshot, changedCellEdits, validCellAddress, MAX_COMPRESSED_PART_CHARS } from '../src/utils/firestoreWorkbookSnapshots.ts'

test('compressed Unicode and incompressible snapshots restore exact text across chunk boundaries', async () => {
  for (const text of ['漢字😀'.repeat(200000), randomBytes(500000).toString('base64')]) {
    const encoded = await compressSnapshot(text), parts = compressedParts(encoded)
    assert.ok(parts.every(part => part.length <= MAX_COMPRESSED_PART_CHARS))
    assert.equal(parts.join(''), encoded)
    assert.equal(await decompressSnapshot(parts.join(''), new TextEncoder().encode(text).byteLength), text)
  }
})
test('invalid compression, lengths and base64 cannot bypass bounded decompression', async () => {
  const encoded = await compressSnapshot('Repeated text'.repeat(10000)), size = 130000
  await assert.rejects(decompressSnapshot(encoded, size - 1), /declared size/)
  await assert.rejects(decompressSnapshot(encoded, size + 1), /incomplete/)
  for (const invalid of ['', '====', `${encoded.slice(0, -4)}_===`, 'bm90IGd6aXA=']) await assert.rejects(decompressSnapshot(invalid, size))
  for (const invalidSize of [0, -1, 1.5, 51 * 1024 * 1024]) await assert.rejects(decompressSnapshot(encoded, invalidSize), /invalid/)
})
test('cell patch differences preserve empty values and explicit override removal', () => {
  const before = new Map([['A1', { text: 'Original', styleJson: null }], ['B1', { text: null, styleJson: '{"fontWeight":"bold"}' }]])
  const after = new Map([['A1', { text: '', styleJson: null }]])
  assert.deepEqual([...changedCellEdits(before, after)], [['A1', { text: '', styleJson: null }], ['B1', { text: null, styleJson: null }]])
  assert.equal(changedCellEdits(before, before).size, 0)
  for (const address of ['A1', 'XFD1048576']) assert.equal(validCellAddress(address), true)
  for (const address of ['A0', 'a1', 'XFE1', 'A1048577', 'A01', 'A1.B2']) assert.equal(validCellAddress(address), false)
})
