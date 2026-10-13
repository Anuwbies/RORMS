import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withDeadline } from '../src/utils/withDeadline.ts'

test('deadline preserves a completed operation and an immediate failure', async () => {
  assert.equal(await withDeadline(Promise.resolve('complete'), 100, 'timeout'), 'complete')
  await assert.rejects(withDeadline(Promise.reject(new Error('permission denied')), 100, 'timeout'), /permission denied/)
})

test('late success cannot replace a timed-out result', async () => {
  let finish: (value: string) => void = () => {}
  const pending = new Promise<string>(resolve => { finish = resolve })
  const result = withDeadline(pending, 1, 'retry required')
  await assert.rejects(result, /retry required/)
  finish('late success')
  await assert.rejects(result, /retry required/)
})

test('late network failure is handled after the deadline', async () => {
  let fail: (reason: Error) => void = () => {}
  const pending = new Promise<never>((_, reject) => { fail = reject })
  const result = withDeadline(pending, 1, 'retry required')
  await assert.rejects(result, /retry required/)
  fail(new Error('late network failure'))
  await assert.rejects(result, /retry required/)
})
