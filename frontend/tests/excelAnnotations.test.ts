import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateCellAnnotation, formatCommentTime, applyCommentAction, isVisibleAnnotation, type PreviewComment } from '../src/utils/excelAnnotations.ts'

const author = { name: 'Anuwbies', id: 'user-1', avatarUrl: '/avatar.png' }
const createdAt = '2026-10-07T17:00:00.000Z'

test('a new comment stores the signed-in author and creation time', () => {
  const comment = updateCellAnnotation([], 'comment', ' hello ', author, createdAt)[0]
  assert.equal(comment.t, 'hello')
  assert.equal(comment.T, true)
  assert.equal(comment.a, 'Anuwbies')
  assert.equal(comment.authorId, 'user-1')
  assert.equal(comment.avatarUrl, '/avatar.png')
  assert.equal(comment.createdAt, createdAt)
})

test('editing a comment preserves its original author and creation time', () => {
  const original = updateCellAnnotation([], 'comment', 'Original', author, createdAt)
  const updated = updateCellAnnotation(original, 'comment', 'Edited', { name: 'Another user', id: 'user-2' }, '2026-10-08T08:00:00.000Z')
  assert.equal(updated[0].a, author.name)
  assert.equal(updated[0].authorId, author.id)
  assert.equal(updated[0].createdAt, createdAt)
  assert.equal(original[0].t, 'Original')
})

test('notes have text without author or timestamp metadata', () => {
  assert.deepEqual(updateCellAnnotation([], 'note', ' Note text ', author, createdAt), [{ t: 'Note text', T: false }])
})

test('editing or removing a note preserves the cell’s comment', () => {
  const comments: PreviewComment[] = [...updateCellAnnotation([], 'comment', 'Comment', author, createdAt), { t: 'Old note', T: false }]
  const updated = updateCellAnnotation(comments, 'note', 'New note', author, createdAt)
  assert.equal(updated[0], comments[0])
  assert.equal(updated[1].t, 'New note')
  assert.deepEqual(updateCellAnnotation(comments, 'note', '', author, createdAt), [comments[0]])
})

test('Today is based on the Manila date even when the UTC date is different', () => {
  assert.equal(formatCommentTime(createdAt, new Date('2026-10-08T03:00:00.000Z')), '1:00 AM Today')
})

test('older comments show the actual local date', () => {
  assert.equal(formatCommentTime(createdAt, new Date('2026-10-09T03:00:00.000Z')), '1:00 AM Oct 8, 2026')
})

test('an imported comment without a timestamp does not display a fabricated time', () => {
  assert.equal(formatCommentTime(undefined), null)
  assert.equal(formatCommentTime('invalid'), null)
})

test('resolving keeps comment metadata and hides only the targeted comment without mutating the undo snapshot', () => {
  const original: PreviewComment[] = [{ T: false, t: 'Note' }, ...updateCellAnnotation([], 'comment', 'First', author, createdAt), { T: true, t: 'Second', a: 'Other' }]
  const resolved = applyCommentAction(original, 1, 'resolve')
  assert.deepEqual(resolved[1], { ...original[1], resolved: true })
  assert.deepEqual(resolved.filter(isVisibleAnnotation), [original[0], original[2]])
  assert.equal(original[1].resolved, undefined)
  assert.equal(resolved[0], original[0])
  assert.equal(resolved[2], original[2])
})

test('deleting uses the original annotation index even when notes and resolved comments are mixed in', () => {
  const comments: PreviewComment[] = [{ T: false, t: 'Note' }, { T: true, t: 'Resolved', resolved: true }, { T: true, t: 'Delete me' }, { T: true, t: 'Keep me' }]
  const deleted = applyCommentAction(comments, 2, 'delete')
  assert.deepEqual(deleted, [comments[0], comments[1], comments[3]])
  assert.equal(comments.length, 4)
  assert.equal(applyCommentAction(comments, 0, 'delete'), comments)
  assert.equal(applyCommentAction(comments, 20, 'delete'), comments)
})

test('adding a new comment after resolving preserves the resolved comment and uses the new author', () => {
  const resolved = applyCommentAction(updateCellAnnotation([], 'comment', 'Resolved', author, createdAt), 0, 'resolve')
  const updated = updateCellAnnotation(resolved, 'comment', 'New', { name: 'New author' }, '2026-10-08T09:00:00.000Z')
  assert.equal(updated[0], resolved[0])
  assert.equal(updated[1].a, 'New author')
  assert.deepEqual(updated.filter(isVisibleAnnotation), [updated[1]])
  assert.deepEqual(updateCellAnnotation(updated, 'comment', '', author, createdAt), resolved)
})

test('resolution records the user and time without changing the original comment author', () => {
  const comments = updateCellAnnotation([], 'comment', 'Original', author, createdAt)
  const resolver = { name: 'Resolving user', id: 'user-2', avatarUrl: '/resolver.png' }
  const resolvedAt = '2026-10-08T09:00:00.000Z'
  const resolved = applyCommentAction(comments, 0, 'resolve', { author: resolver, createdAt: resolvedAt })
  assert.deepEqual(resolved[0].resolvedBy, resolver)
  assert.equal(resolved[0].resolvedAt, resolvedAt)
  assert.equal(resolved[0].a, author.name)
  assert.equal(resolved[0].createdAt, createdAt)
  assert.equal(isVisibleAnnotation(resolved[0]), false)
  assert.equal(comments[0].resolvedBy, undefined)
  assert.equal(applyCommentAction(resolved, 0, 'resolve', { author, createdAt }), resolved)
  assert.deepEqual(applyCommentAction(resolved, 0, 'delete'), [])
})

test('marking unresolved restores cell visibility and removes stale resolution metadata without mutating history', () => {
  const original = updateCellAnnotation([], 'comment', 'Original', author, createdAt)
  const resolved = applyCommentAction(original, 0, 'resolve', { author: { name: 'Resolver' }, createdAt: '2026-10-08T09:00:00.000Z' })
  const unresolved = applyCommentAction(resolved, 0, 'unresolve')
  assert.deepEqual(unresolved, original)
  assert.equal(isVisibleAnnotation(unresolved[0]), true)
  assert.equal(resolved[0].resolved, true)
  assert.equal(resolved[0].resolvedBy?.name, 'Resolver')
  assert.equal(applyCommentAction(unresolved, 0, 'unresolve'), unresolved)
  const resolvedAgain = applyCommentAction(unresolved, 0, 'resolve', { author: { name: 'New resolver' }, createdAt: '2026-10-08T10:00:00.000Z' })
  assert.equal(resolvedAgain[0].resolvedBy?.name, 'New resolver')
  assert.equal(resolvedAgain[0].resolvedAt, '2026-10-08T10:00:00.000Z')
})
