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
const policyContext = { exports: {} }
vm.runInNewContext(compile('../src/utils/passwordPolicy.ts'), policyContext)
const policy = policyContext.exports

test('accepts a 12-character password and longer passphrases with every required category', () => {
  assert.equal(policy.getPasswordError('Abcdefghij1!'), null)
  assert.equal(policy.getPasswordError('A longer passphrase with 123!'), null)
})

test('rejects short passwords and every missing category, including spaces used as symbols', () => {
  for (const [password, missing] of [
    ['Abcdefghi1!', '12 characters'],
    ['abcdefghij1!', 'uppercase'],
    ['ABCDEFGHIJ1!', 'lowercase'],
    ['Abcdefghijk!', 'number'],
    ['Abcdefghijk1', 'symbol'],
    ['Abcdefghij1 ', 'symbol'],
  ]) assert.match(policy.getPasswordError(password), new RegExp(missing))
})

function pageHarness(pageName, password, confirmation = password) {
  const signup = pageName === 'SignUpPage'
  const states = signup
    ? [false, 'Jane', 'Doe', 'jane@example.com', password, 'Instructor', 'CITE', 'token', null, false, false, false, 0]
    : ['code', 'jane@example.com', password, confirmation, false, false, null, false, false, false]
  let index = 0, authRequests = 0
  class FirebaseError extends Error { constructor(code) { super(code); this.code = code } }
  const context = {
    exports: {}, URLSearchParams, console: { error() {} },
    window: { location: { search: '?oobCode=code' } },
    sessionStorage: { setItem() {}, removeItem() {} },
    require: name => {
      if (name === 'react') return {
        useState: () => {
          const slot = index++
          return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value }]
        },
        useEffect() {},
      }
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (name === 'firebase/app') return { FirebaseError }
      if (name === 'firebase/auth') return {
        createUserWithEmailAndPassword: async () => { authRequests++; throw new FirebaseError('auth/email-already-in-use') },
        confirmPasswordReset: async () => { authRequests++ },
      }
      if (name === '../firebase') return { auth: {}, db: {} }
      if (name === '../utils/passwordPolicy') return policy
      if (name === '../utils/userName') return {
        titleCaseName: value => value,
        userNameFields: names => ({ ...names, fullName: `${names.firstName} ${names.surname}` }),
      }
      return new Proxy({}, { get: (_, key) => key })
    },
  }
  vm.runInNewContext(compile(`../src/pages/${pageName}.tsx`), context)
  function render() {
    index = 0
    return context.exports.default({ currentSlide: 0, onSlideChange() {}, onBackToSignIn() {} })
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
    submit: () => find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    get requests() { return authRequests },
    get error() { return states[signup ? 8 : 6] },
    passwordInput: () => find(render(), node => node.type === 'TextInput' && node.props.autoComplete === 'new-password'),
  }
}

for (const pageName of ['SignUpPage', 'ResetPasswordPage']) {
  test(`${pageName} rejects weak passwords before sending an Auth request and keeps inputs available`, async () => {
    const page = pageHarness(pageName, 'weak')
    await page.submit()
    assert.equal(page.requests, 0)
    assert.match(page.error, /12 characters/)
    assert.ok(page.passwordInput())
    assert.equal(page.passwordInput().props.minLength, 12)
  })
  test(`${pageName} submits passwords meeting the shared requirements`, async () => {
    const page = pageHarness(pageName, 'Abcdefghij1!')
    await page.submit()
    assert.equal(page.requests, 1)
  })
}

test('password reset still requires an exact confirmation match', async () => {
  const page = pageHarness('ResetPasswordPage', 'Abcdefghij1!', 'Abcdefghij2!')
  await page.submit()
  assert.equal(page.requests, 0)
  assert.equal(page.error, 'Passwords do not match.')
})
