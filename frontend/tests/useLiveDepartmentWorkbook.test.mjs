import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText

// Exercise the real hook/receiver with server notifications and a minimal hook runtime.
function mount(initial = {}) {
  const slots = [], effects = [], listeners = new Set(), authListeners = new Set(), applied = []
  const auth = { currentUser: { uid: 'first' } }
  let cursor = 0, output, loadCount = 0
  let props = { term: { departmentId: 'CITE', academicYearId: 'year', academicYear: '2026-2027', semester: 'sem1' }, paused: false,
    revision: 1, load: async () => ({ revision: 2, editorState: '{"version":2}' }), ...initial }
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]))
  const hooks = {
    useState(initialValue) {
      const index = cursor++
      slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value }]
    },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value } },
    useMemo(create, dependencies) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { value: create(), dependencies }
      return slots[index].value
    },
    useEffect(create, dependencies) {
      const index = cursor++
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { dependencies, cleanup: create() }
      })
    },
  }
  const receiverModule = { exports: {}, Error }
  vm.runInNewContext(compile('../src/utils/liveWorkbookReceiver.ts'), receiverModule)
  const context = { exports: {}, Error, require: name => {
    if (name === 'react') return hooks
    if (name === 'firebase/auth') return { onAuthStateChanged: (_auth, callback) => { authListeners.add(callback); callback(auth.currentUser); return () => authListeners.delete(callback) } }
    if (name === '../firebase') return { auth }
    if (name === '../utils/departmentWorkbookPaths') return { workbookTermPaths: term => ({ document: `${term.departmentId}/${term.semester}`, previousDocument: 'previous', namedLegacyDocument: 'named', legacyDocument: 'legacy' }) }
    if (name === '../utils/excelWorkbookState') return { deserializeWorkbookState: text => JSON.parse(text) }
    if (name === '../utils/liveWorkbookReceiver') return receiverModule.exports
    if (name === '../services/workbookLiveUpdates') return { subscribeWorkbookRevisions: (paths, receive, error) => {
      const listener = { paths, receive, error }; listeners.add(listener); return () => listeners.delete(listener)
    } }
    if (name === './useLatestEvent') return { useLatestEvent: handler => {
      const ref = hooks.useRef(handler); ref.current = handler
      return hooks.useMemo(() => (...args) => ref.current(...args), [])
    } }
    throw new Error(`Unexpected import: ${name}`)
  } }
  vm.runInNewContext(compile('../src/hooks/useLiveDepartmentWorkbook.ts'), context)
  const render = changes => {
    props = { ...props, ...changes }; cursor = 0
    output = context.exports.useLiveDepartmentWorkbook(props.term, props.paused, () => { loadCount++; return props.load() },
      () => props.revision, value => applied.push(value))
    while (effects.length) effects.shift()()
    return output
  }
  render()
  return { render, applied, listeners, auth, get loads() { return loadCount },
    notify: revision => [...listeners].forEach(listener => listener.receive({ path: listener.paths[0], revision })),
    changeAccount: uid => { auth.currentUser = uid ? { uid } : null; authListeners.forEach(callback => callback(auth.currentUser)) },
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  }
}

test('committed saves are queued until applied; self acknowledgements do not reload', async () => {
  const h = mount()
  h.notify(1); await tick(); assert.equal(h.loads, 0)
  h.notify(2); await tick()
  const update = h.render().update
  assert.equal(update.revision, 2)
  assert.equal(h.applied.length, 0) // Receiving alone cannot replace a local draft.
  update.onApplied(); assert.equal(h.applied[0].revision, 2)
  h.render({ revision: 2 }); assert.equal(update.isCurrent(), false)
  h.notify(2); await tick(); assert.equal(h.loads, 1)
  h.unmount(); assert.equal(h.listeners.size, 0)
})

test('imports and saves pause delivery; a notification resumes afterwards', async () => {
  const h = mount({ paused: true })
  h.notify(2); await tick(); assert.equal(h.loads, 0)
  h.render({ paused: false }); await tick()
  assert.equal(h.render().update.revision, 2)
  h.unmount()
})

test('late loads cannot cross accounts, terms or unmounts', async () => {
  let finish
  const h = mount({ load: () => new Promise(resolve => { finish = resolve }) })
  h.notify(2)
  h.changeAccount('second')
  finish({ revision: 2, editorState: '{}' }); await tick()
  assert.equal(h.render().update, undefined)
  h.notify(3)
  h.render({ term: { departmentId: 'CITE', academicYearId: 'year', academicYear: '2026-2027', semester: 'sem2' } })
  finish({ revision: 3, editorState: '{}' }); await tick()
  assert.equal(h.render().update, undefined)
  h.notify(4); h.unmount()
  finish({ revision: 4, editorState: '{}' }); await tick()
  assert.equal(h.applied.length, 0)
  assert.equal(h.listeners.size, 0)
})

test('standalone workbooks do not subscribe; failed loads preserve edits and can retry', async () => {
  const standalone = mount({ term: undefined })
  assert.equal(standalone.listeners.size, 0); standalone.unmount()
  const h = mount({ load: async () => { throw new Error('Offline') } })
  h.notify(2); await tick()
  let state = h.render()
  assert.equal(state.error, 'Offline'); assert.equal(h.applied.length, 0)
  state.retry(); h.render({ load: async () => ({ revision: 2, editorState: '{}' }) })
  h.notify(2); await tick()
  state = h.render(); assert.equal(state.update.revision, 2); assert.equal(state.error, '')
  h.unmount()
})
