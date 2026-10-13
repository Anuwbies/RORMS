import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

function watcher() {
  const listeners = new Map(), received = [], errors = []
  const source = readFileSync(new URL('../src/services/workbookLiveUpdates.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const context = { exports: {}, require: name => name === '../firebase' ? { db: {} } : {
    doc: (_db, path) => path,
    onSnapshot: (path, options, next, error) => { assert.equal(options.includeMetadataChanges, true); listeners.set(path, { next, error }); return () => listeners.delete(path) },
  } }
  vm.runInNewContext(compiled, context)
  const stop = context.exports.subscribeWorkbookRevisions(['current', 'legacy'], value => received.push(value), error => errors.push(error))
  const emit = (path, revision, metadata = {}) => listeners.get(path).next({
    metadata: { fromCache: false, hasPendingWrites: false, ...metadata }, exists: () => revision !== null,
    data: () => revision === null ? undefined : { revision, revisionId: `save-${revision}` },
  })
  return { listeners, received, errors, stop, emit }
}

test('subscriptions prefer canonical records, ignore cache/pending writes, dedupe commits and retry on reconnect', () => {
  const w = watcher()
  w.emit('legacy', 9); assert.equal(w.received.length, 0)
  w.emit('current', 10, { fromCache: true }); assert.equal(w.received.length, 0)
  w.emit('current', 10, { hasPendingWrites: true }); assert.equal(w.received.length, 0)
  w.emit('current', 10); assert.equal(w.received[0].path, 'current')
  w.emit('legacy', 11); w.emit('current', 10); assert.equal(w.received.length, 1)
  w.emit('current', 12); assert.equal(w.received[1].revision, 12)
  w.emit('current', 12, { fromCache: true }); w.emit('current', 12); assert.equal(w.received.length, 3)
  const late = w.listeners.get('current').next
  w.stop(); assert.equal(w.listeners.size, 0)
  late({ metadata: { fromCache: false, hasPendingWrites: false }, exists: () => true, data: () => ({ revision: 20 }) })
  assert.equal(w.received.length, 3)
})

test('subscriptions load legacy records only if canonical is absent and report invalid revisions and denied reads', () => {
  const w = watcher()
  w.emit('legacy', 4); w.emit('current', null); assert.equal(w.received[0].path, 'legacy')
  w.emit('current', 'invalid'); assert.equal(w.errors.length, 1)
  w.listeners.get('legacy').error(new Error('permission-denied')); assert.equal(w.errors.length, 2)
  w.stop()
})
