import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

// Exercise App's auth boundary with controlled Auth/Firestore events.
function appSession({ signOutFails = false } = {}) {
  const states = [], effects = [], listeners = [], transactions = [], writes = []
  let stateIndex = 0, mounted = false, authCallback, signOutCount = 0
  const auth = {
    currentUser: null,
    signOut: async () => {
      ++signOutCount
      if (signOutFails) throw new Error('sign-out failed')
      auth.currentUser = null
      await authCallback(null)
    },
  }
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const context = {
    exports: {}, Error,
    console: { error() {} },
    URLSearchParams,
    window: { location: { pathname: '/', search: '' }, history: { replaceState() {} }, addEventListener() {}, removeEventListener() {} },
    sessionStorage: { getItem: () => null, removeItem() {} },
    setInterval: () => 1, clearInterval() {},
    require: name => {
      if (name === 'react') return {
        useState: initial => {
          const index = stateIndex++
          if (!(index in states)) states[index] = initial
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
        useEffect: effect => { if (!mounted) effects.push(effect) },
        useCallback: callback => callback,
      }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === './firebase') return { auth, db: {} }
      if (name === 'firebase/auth') return { onAuthStateChanged: (_auth, callback) => { authCallback = callback; return () => { authCallback = undefined } } }
      if (name === 'firebase/firestore') return {
        doc: (_db, collection, uid) => `${collection}/${uid}`,
        serverTimestamp: () => 'server-time',
        onSnapshot: (path, options, next, error) => {
          assert.equal(options.includeMetadataChanges, true)
          const listener = { path, next, error, stopped: false }
          listeners.push(listener)
          return () => { listener.stopped = true }
        },
        runTransaction: (_db, callback) => new Promise((resolve, reject) => {
          transactions.push({
            finish: async data => {
              try {
                await callback({
                  get: async () => ({ exists: () => data !== undefined, data: () => data }),
                  set: (path, updates) => writes.push({ path, updates }),
                })
                resolve()
              } catch (error) { reject(error) }
            },
            reject,
          })
        }),
      }
      return { default: name }
    },
  }
  vm.runInNewContext(compiled, context)
  const render = () => { stateIndex = 0; return context.exports.default() }
  render()
  const cleanup = effects.map(effect => effect())
  mounted = true
  const login = (uid = 'member') => {
    const user = { uid, emailVerified: true, email: `${uid}@example.com` }
    auth.currentUser = user
    return authCallback(user)
  }
  const emit = (index, data, fromCache = false) => listeners[index].next({ data: () => data, exists: () => data !== undefined, metadata: { fromCache } })
  return { auth, login, render, listeners, transactions, writes, emit, stop: () => cleanup.forEach(fn => fn?.()), signOutCount: () => signOutCount }
}

test('an active session is signed out as soon as its account is deactivated', async () => {
  const app = appSession()
  const ready = app.login()
  await app.transactions[0].finish({ isActive: true })
  await ready
  assert.equal(app.render().type, './pages/LeftSidebarController')
  app.emit(0, { isActive: false })
  assert.equal(app.render().type, './pages/SignInPage')
  assert.equal(app.render().props.sessionError, 'This account has been deactivated.')
  assert.equal(app.signOutCount(), 1)
  assert.equal(app.listeners[0].stopped, true)
})

test('restoring an inactive account never grants access or updates its profile', async () => {
  const app = appSession()
  const ready = app.login()
  await app.transactions[0].finish({ isActive: false })
  await ready
  assert.equal(app.render().type, './pages/SignInPage')
  assert.equal(app.render().props.sessionError, 'This account has been deactivated.')
  assert.equal(app.writes.length, 0)
})

test('deactivation during profile initialization cannot be undone by its late completion', async () => {
  const app = appSession()
  const ready = app.login()
  app.emit(0, { isActive: false })
  await app.transactions[0].finish({ isActive: true })
  await ready
  assert.equal(app.render().type, './pages/SignInPage')
  assert.equal(app.signOutCount(), 1)
})

test('old account callbacks cannot sign out a new account and cleanup stops the listener', async () => {
  const app = appSession()
  const first = app.login('first')
  const second = app.login('second')
  app.emit(0, { isActive: false })
  await app.transactions[0].finish({ isActive: true })
  await first
  assert.notEqual(app.render().type, './pages/LeftSidebarController')
  await app.transactions[1].finish({ isActive: true })
  await second
  assert.equal(app.render().type, './pages/LeftSidebarController')
  assert.equal(app.signOutCount(), 0)
  assert.equal(app.listeners[0].stopped, true)
  app.stop()
  assert.equal(app.listeners[1].stopped, true)
  app.emit(1, { isActive: false })
  assert.equal(app.signOutCount(), 0)
})

test('profile initialization and listener failures deny access', async () => {
  const app = appSession()
  const ready = app.login()
  app.transactions[0].reject(new Error('permission-denied'))
  await ready
  assert.equal(app.render().type, './pages/SignInPage')
  assert.match(app.render().props.sessionError, /Unable to verify/)

  const next = app.login()
  await app.transactions[1].finish({ isActive: true })
  await next
  app.listeners[1].error(new Error('permission-denied'))
  assert.equal(app.render().type, './pages/SignInPage')
  assert.equal(app.signOutCount(), 2)
})

test('the app remains blocked if signing out fails', async () => {
  const app = appSession({ signOutFails: true })
  const ready = app.login()
  await app.transactions[0].finish({ isActive: true })
  await ready
  app.emit(0, { isActive: false })
  app.emit(0, { isActive: true })
  assert.equal(app.render().type, './pages/SignInPage')
  assert.equal(app.signOutCount(), 1)
})

test('new profiles retain their defaults and cached missing profiles do not end a session', async () => {
  const app = appSession()
  const ready = app.login()
  await app.transactions[0].finish(undefined)
  await ready
  assert.equal(app.writes[0].updates.isActive, true)
  app.emit(0, undefined, true)
  assert.equal(app.render().type, './pages/LeftSidebarController')
  app.emit(0, undefined)
  assert.equal(app.render().type, './pages/SignInPage')
})

test('stale cached deactivation does not reject a reactivated account', async () => {
  const app = appSession()
  const ready = app.login()
  app.emit(0, { isActive: false }, true)
  await app.transactions[0].finish({ isActive: true })
  await ready
  assert.equal(app.render().type, './pages/LeftSidebarController')
  assert.equal(app.signOutCount(), 0)
  app.emit(0, { isActive: false })
  assert.equal(app.render().type, './pages/SignInPage')
})
