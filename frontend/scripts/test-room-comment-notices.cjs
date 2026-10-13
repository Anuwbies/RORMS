const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the actual hook with controlled Firestore delivery order and delayed
// writes, without Firebase credentials, React DOM, or a browser.
const state = []
const dependencies = []
const listeners = []
const transactions = []
let cursor = 0
let dirty = true
let effects = []
let result
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
const react = {
  useState(initial) {
    const index = cursor++
    if (!(index in state)) state[index] = initial
    return [state[index], next => {
      const value = typeof next === 'function' ? next(state[index]) : next
      if (!Object.is(value, state[index])) { state[index] = value; dirty = true }
    }]
  },
  useEffect(effect, deps) {
    const index = cursor++
    if (!same(dependencies[index], deps)) {
      dependencies[index] = deps
      effects.push(() => { state[index]?.(); state[index] = effect() })
    }
  },
  useMemo(factory, deps) {
    const index = cursor++
    if (!same(dependencies[index], deps)) {
      dependencies[index] = deps
      state[index] = factory()
    }
    return state[index]
  },
  useCallback(callback, deps) { return react.useMemo(() => callback, deps) },
}
class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds }
}
const auth = { currentUser: { uid: 'alice' } }
const firestore = {
  Timestamp,
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  query: (ref, ...clauses) => ({ ...ref, clauses }),
  where: (...args) => ({ where: args }),
  orderBy: (...args) => ({ orderBy: args }),
  limit: value => ({ limit: value }),
  onSnapshot(ref, _options, next) {
    const listener = { ref, next, active: true }
    listeners.push(listener)
    return () => { listener.active = false }
  },
  runTransaction: () => new Promise(resolve => transactions.push(resolve)),
}
const moduleObject = { exports: {} }
const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useRoomCommentNotices.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
vm.runInNewContext(compiled, {
  exports: moduleObject.exports,
  require(name) {
    if (name === 'react') return react
    if (name === 'firebase/firestore') return firestore
    if (name === 'firebase/auth') return { onAuthStateChanged: () => () => {} }
    if (name === '../firebase') return { auth, db: {} }
    throw new Error(`Unexpected dependency: ${name}`)
  },
  console,
})
function flush() {
  let iterations = 0
  while (dirty) {
    assert.ok(++iterations < 20, 'Hook should settle')
    dirty = false
    cursor = 0
    result = moduleObject.exports.useRoomCommentNotices(['room'])
    const pending = effects
    effects = []
    pending.forEach(effect => effect())
  }
}
function deliver(collectionPath, docs, metadata = {}) {
  const listener = listeners.find(item => item.active && item.ref.path === collectionPath)
  assert.ok(listener, `Active listener for ${collectionPath}`)
  listener.next({
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
    size: docs.length,
    forEach: callback => docs.forEach(data => callback({ id: data.id ?? 'room', data: () => data })),
  })
  flush()
}
const comment = (authorId, seconds) => ({ id: `${authorId}-${seconds}`, authorId, createdAt: new Timestamp(seconds) })
const receipt = seconds => ({ lastSeenAt: new Timestamp(seconds) })
const unread = () => result.unreadRoomIds.has('room')
flush()
deliver('users/alice/roomCommentReads', [], { fromCache: true })
assert.equal(unread(), false, 'Empty cached receipts must not flash unread notices')
deliver('users/alice/roomCommentReads', [receipt(100)])
deliver('comments', [comment('bob', 90)])
assert.equal(unread(), false)
deliver('comments', [comment('alice', 120)], { hasPendingWrites: true })
assert.equal(unread(), false, 'An own pending post must not trigger a notice')
deliver('comments', [comment('alice', 120)])
deliver('comments', [comment('alice', 120), comment('bob', 90)])
assert.equal(unread(), false, 'An own committed post must not trigger a notice')
deliver('comments', [comment('bob', 200)], { fromCache: true })
assert.equal(unread(), false, 'Stale cached comment queries must not flash notices')
deliver('comments', [comment('bob', 130)])
assert.equal(unread(), true, 'Another author must still trigger a notice')
assert.equal(result.isCommentUnread('room', comment('alice', 150)), false, 'Own comments must never be highlighted')
const clicking = result.markCommentSeen('room', comment('bob', 130))
flush()
assert.equal(result.isCommentUnread('room', comment('bob', 130)), false, 'Clicking clears that exact highlight immediately')
assert.equal(result.isCommentUnread('room', comment('bob', 125)), true, 'Clicking a newer comment must leave older unread comments highlighted')
deliver('comments', [comment('bob', 130)])
deliver('comments', [comment('bob', 130), comment('bob', 125)])
assert.equal(unread(), true, 'The room notice remains while another comment is unread')
deliver('users/alice/roomCommentReads', [receipt(100)])
assert.equal(result.isCommentUnread('room', comment('bob', 130)), false, 'Delayed receipts must not restore a clicked highlight')
const saving = result.markCommentsSeen('room', new Timestamp(130))
flush()
assert.equal(unread(), false, 'Viewing must clear locally before the server write finishes')
assert.equal(result.isCommentUnread('room', comment('bob', 125)), false, 'Closing clears remaining loaded highlights')
deliver('users/alice/roomCommentReads', [receipt(100)])
assert.equal(unread(), false, 'An older server receipt must not restore the notice')
deliver('comments', [comment('alice', 150)])
deliver('comments', [comment('alice', 150), comment('bob', 140)])
assert.equal(unread(), true, 'An own post must not hide newer unread feedback')
transactions.forEach(resolve => resolve())
Promise.all([saving, clicking]).then(() => console.log('Room comment notice regression checks passed.'))
