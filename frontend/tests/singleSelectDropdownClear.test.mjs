import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

function mount(clearValue = '', enableClear = true) {
  const values = [], changes = []
  let cursor = 0, value = 'room1'
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [values[index], update => { values[index] = typeof update === 'function' ? update(values[index]) : update }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in values)) values[index] = { current: initial }
      return values[index]
    },
    useId: () => 'room-picker', useEffect() {}, useLayoutEffect() {},
  }
  const jsx = (type, props) => ({ type, props })
  const context = { exports: {}, require: name => {
    if (name === 'react') return hooks
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react-dom') return { createPortal: node => node }
    if (name === './Icons') return { CheckIcon: 'check', ChevronDownIcon: 'chevron' }
    throw new Error(`Unexpected import: ${name}`)
  } }
  const source = readFileSync(new URL('../src/components/SingleSelectDropdown.tsx', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context)
  const input = () => {
    cursor = 0
    const tree = context.exports.SingleSelectDropdown({ options: ['', 'room1', 'room2'], value,
      onChange: next => { value = next; changes.push(next) }, searchable: true, retainValueOnOpen: true,
      getOptionLabel: id => id === 'room1' ? 'PTC 201' : id === 'room2' ? 'PTC 202' : '',
      placeholder: 'search...', ...(enableClear ? { clearValue } : {}) })
    return tree.props.children.find(child => child?.type === 'input').props
  }
  return { input, changes }
}

test('deleting all room text clears the selected room and shows the search placeholder after closing', () => {
  const h = mount()
  let selected = false
  h.input().onFocus({ currentTarget: { select: () => { selected = true } } })
  assert.equal(selected, true)
  assert.deepEqual(h.changes, [])
  assert.equal(h.input().value, 'PTC 201')
  h.input().onChange({ target: { value: '' } })
  assert.deepEqual(h.changes, [''])
  h.input().onKeyDown({ key: 'Tab' })
  assert.equal(h.input().value, '')
  assert.equal(h.input().placeholder, 'search...')
})

test('typing a room search preserves the selected room until an option is selected or all text is deleted', () => {
  const h = mount()
  h.input().onFocus({ currentTarget: { select() {} } })
  h.input().onChange({ target: { value: 'PTC 20' } })
  assert.deepEqual(h.changes, [])
  h.input().onKeyDown({ key: 'Escape' })
  assert.equal(h.input().value, 'PTC 201')
  h.input().onChange({ target: { value: '' } })
  assert.deepEqual(h.changes, [''])
})

test('Backspace and Delete also clear a closed room picker', () => {
  for (const key of ['Backspace', 'Delete']) {
    const h = mount()
    let prevented = false
    h.input().onKeyDown({ key, preventDefault: () => { prevented = true } })
    assert.equal(prevented, true)
    assert.deepEqual(h.changes, [''])
  }
})

test('other searchable dropdowns retain existing search-only behavior without clearValue', () => {
  const h = mount('', false)
  h.input().onFocus({ currentTarget: { select() {} } })
  h.input().onChange({ target: { value: '' } })
  assert.deepEqual(h.changes, [])
  h.input().onKeyDown({ key: 'Tab' })
  assert.equal(h.input().value, 'PTC 201')
})
