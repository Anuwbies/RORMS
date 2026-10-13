import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2023 },
  }).outputText
}

function signInHarness(storage = new Map()) {
  let now = 1_000_000, index = 0, requests = 0, signedIn = 0
  let authenticate = async () => { throw { code: 'auth/invalid-credential' } }
  const states = [], refs = []
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  class Clock extends Date { static now() { return now } }
  const attemptsContext = { exports: {}, Date: Clock }
  vm.runInNewContext(compile('../src/utils/signInAttempts.ts'), attemptsContext)
  const helpers = attemptsContext.exports
  const context = {
    exports: {}, Date: Clock, console: { error() {} },
    window: { localStorage },
    require: name => {
      if (name === 'react') return {
        useState: initial => {
          const slot = index++
          if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial
          return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value }]
        },
        useRef: initial => { const slot = index++; return refs[slot] ??= { current: initial } },
        useEffect() {},
      }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === 'firebase/auth') return {
        setPersistence: async () => {},
        signInWithEmailAndPassword: async () => { requests++; return authenticate() },
      }
      if (name === '../firebase') return { auth: {} }
      if (name === '../utils/signInAttempts') return helpers
      return new Proxy({}, { get: (_, key) => key })
    },
  }
  vm.runInNewContext(compile('../src/pages/SignInPage.tsx'), context)
  function render() {
    index = 0
    return context.exports.default({ onSignIn: () => signedIn++, currentSlide: 0, onSlideChange() {}, onForgotPassword() {} })
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    const children = node.props?.children
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const found = find(child, predicate)
      if (found) return found
    }
  }
  return {
    helpers, localStorage,
    submit: () => find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    button: () => find(render(), node => node.type === 'Button' && node.props.type === 'submit').props,
    message: () => find(render(), node => node.props?.role === 'status')?.props.children,
    get requests() { return requests },
    get signedIn() { return signedIn },
    advance: ms => { now += ms },
    authenticate: callback => { authenticate = callback },
  }
}

test('three credential failures lock further requests and survive a page reload', async () => {
  const storage = new Map()
  const page = signInHarness(storage)
  await page.submit()
  assert.match(page.message(), /2 attempts remaining/)
  await page.submit()
  assert.match(page.message(), /1 attempt remaining/)
  await page.submit()
  assert.equal(page.requests, 3)
  assert.equal(page.button().disabled, true)
  assert.match(page.message(), /5:00/)
  await page.submit()
  assert.equal(page.requests, 3)
  const reloaded = signInHarness(storage)
  assert.equal(reloaded.button().disabled, true)
  await reloaded.submit()
  assert.equal(reloaded.requests, 0)
})

test('expiry restores attempts and successful login resets the counter', async () => {
  const page = signInHarness()
  for (let i = 0; i < 3; i++) await page.submit()
  page.advance(page.helpers.SIGN_IN_COOLDOWN_MS)
  await page.submit()
  assert.match(page.message(), /2 attempts remaining/)
  page.authenticate(async () => ({}))
  await page.submit()
  assert.equal(page.signedIn, 1)
  const saved = page.helpers.readSignInAttempts(page.localStorage, page.helpers.freshSignInAttempts())
  assert.equal(saved.failures, 0)
  assert.equal(saved.lockedUntil, 0)
  assert.equal(saved.lockouts, 0)
})

test('network failures do not consume credential attempts', async () => {
  const page = signInHarness()
  page.authenticate(async () => { throw { code: 'auth/network-request-failed' } })
  for (let i = 0; i < 4; i++) await page.submit()
  assert.equal(page.button().disabled, false)
  page.authenticate(async () => { throw { code: 'auth/wrong-password' } })
  await page.submit()
  assert.match(page.message(), /2 attempts remaining/)
})

test('duplicate submissions cannot send concurrent login requests', async () => {
  const page = signInHarness()
  let reject
  page.authenticate(() => new Promise((_, fail) => { reject = fail }))
  const pending = page.submit()
  await Promise.resolve()
  await page.submit()
  assert.equal(page.requests, 1)
  reject({ code: 'auth/invalid-credential' })
  await pending
})

test('Firebase throttling immediately activates the cooldown', async () => {
  const page = signInHarness()
  page.authenticate(async () => { throw { code: 'auth/too-many-requests' } })
  await page.submit()
  assert.equal(page.button().disabled, true)
  await page.submit()
  assert.equal(page.requests, 1)
})

test('unavailable storage retains the in-memory limit and expired locks reset', () => {
  const { helpers } = signInHarness()
  const blocked = { failures: 3, lockedUntil: 2000, lockouts: 1 }
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.equal(helpers.readSignInAttempts(storage, blocked, 1999), blocked)
  assert.equal(helpers.readSignInAttempts(storage, blocked, 2000).failures, 0)
  assert.doesNotThrow(() => helpers.writeSignInAttempts(storage, blocked))
  assert.equal(helpers.readSignInAttempts({ getItem: () => null }, blocked, 1999), blocked)
})

test('repeated lockouts escalate to one hour, persist after reload, and reset on success', async () => {
  const storage = new Map()
  const page = signInHarness(storage)
  for (const minutes of [5, 10, 20, 40, 60, 60]) {
    for (let i = 0; i < 3; i++) await page.submit()
    assert.match(page.message(), new RegExp(`${minutes}:00`))
    const saved = JSON.parse(storage.get(page.helpers.SIGN_IN_ATTEMPTS_KEY))
    assert.equal(signInHarness(storage).helpers.readSignInAttempts(page.localStorage, page.helpers.freshSignInAttempts(), saved.lockedUntil).lockouts, saved.lockouts)
    page.advance(minutes * 60 * 1000)
  }
  page.authenticate(async () => ({}))
  await page.submit()
  page.authenticate(async () => { throw { code: 'auth/invalid-credential' } })
  for (let i = 0; i < 3; i++) await page.submit()
  assert.match(page.message(), /5:00/)
})
