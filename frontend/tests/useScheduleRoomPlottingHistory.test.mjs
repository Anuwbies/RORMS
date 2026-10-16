import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
}).outputText

function mount(save = async () => {}) {
  const slots = [], effects = []
  let cursor = 0
  const auth = { currentUser: { uid: 'registrar' } }
  let props = { options: { membershipId: 'manager', departmentCode: 'CITE' }, isOpen: true,
    year: { id: 'year', academicYear: '2026-2027', sem1: { phase: 'Plotting' }, sem2: { phase: 'Plotting' } }, semester: '1st Semester' }
  const changed = (before, after) => !before || after.some((value, index) => !Object.is(value, before[index]))
  const hooks = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, update => { slots[index].value = typeof update === 'function' ? update(slots[index].value) : update }]
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
        slots[index]?.cleanup?.(); slots[index] = { dependencies, cleanup: create() }
      })
    },
  }
  const plotting = { exports: {} }, history = { exports: {} }
  vm.runInNewContext(compile('../src/utils/schedulePlotting.ts'), plotting)
  vm.runInNewContext(compile('../src/utils/plotSelectionHistory.ts'), history)
  const context = { exports: {}, Error, require: name => {
    if (name === 'react') return hooks
    if (name === 'firebase/firestore') return { collection: () => 'rooms', onSnapshot: (_, receive) => { receive({ docs: [] }); return () => {} } }
    if (name === '../firebase') return { auth, db: {} }
    if (name === '../utils/departmentWorkbookPermissions') return { schedulePlottingPhases: () => ['Plotting'] }
    if (name === '../utils/departmentWorkbookPaths') return { semesterKey: semester => semester === '1st Semester' ? 'sem1' : 'sem2' }
    if (name === '../utils/schedulePlotting') return plotting.exports
    if (name === '../utils/plotSelectionHistory') return history.exports
    if (name === '../services/plotScheduleRooms') return { plotScheduleRooms: save, readPlotRoom: () => {} }
    throw new Error(`Unexpected import ${name}`)
  } }
  vm.runInNewContext(compile('../src/hooks/useScheduleRoomPlotting.ts'), context)
  const render = changes => {
    props = { ...props, ...changes }; cursor = 0
    const output = context.exports.useScheduleRoomPlotting(props.options, props.isOpen, props.year, props.semester, ['teacher'], 'schedules')
    while (effects.length) effects.shift()()
    return output
  }
  render()
  return { render, auth }
}

const meeting = { id: 'class', sourceScheduleId: 'class', source: 'workbook', schemaVersion: 2, status: 'Plot', roomId: 'room1',
  instructorId: 'teacher', startTime: '07:30', endTime: '09:00', days: ['Mon'], format: 'Lec',
  registrarPlot: { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [], providedRoomKeys: [] } }

test('real plotting hook undoes/redoes room choices and resets after successful Plot', async () => {
  const h = mount()
  h.render().select(meeting, 'room2')
  assert.equal(h.render().selected(meeting), 'room2')
  h.render().undo()
  assert.equal(h.render().selected(meeting), 'room1')
  h.render().redo()
  assert.equal(h.render().selected(meeting), 'room2')
  await h.render().save()
  assert.equal(h.render().pendingCount, 0)
  assert.equal(h.render().canUndo, false)
  assert.equal(h.render().canRedo, false)
})

test('failed Plot keeps history; saving blocks edits and undo', async () => {
  let finish
  const h = mount(() => new Promise((_, reject) => { finish = reject }))
  h.render().select(meeting, 'room2')
  const saving = h.render().save()
  h.render().undo(); h.render().select(meeting, 'room3')
  assert.equal(h.render().selected(meeting), 'room2')
  finish(new Error('conflict')); await saving
  assert.equal(h.render().error, 'conflict')
  assert.equal(h.render().canUndo, true)
  h.render().undo()
  assert.equal(h.render().selected(meeting), 'room1')
  assert.equal(h.render().error, '')
})

test('switching term, member, account or closing clears pending undo/redo', () => {
  for (const change of [{ semester: '2nd Semester' }, { options: { membershipId: 'other', departmentCode: 'CBA' } }, { isOpen: false }, 'account']) {
    const h = mount()
    h.render().select(meeting, 'room2'); h.render().undo()
    assert.equal(h.render().canRedo, true)
    if (change === 'account') { h.auth.currentUser = { uid: 'other' }; h.render() }
    else h.render(change)
    assert.equal(h.render().canUndo, false)
    assert.equal(h.render().canRedo, false)
    assert.equal(h.render().pendingCount, 0)
  }
})

test('unchecking a provided Plot room participates in undo/redo and cannot edit its room', () => {
  const h = mount()
  const provided = { ...meeting, registrarPlot: undefined }
  assert.equal(h.render().marked(provided), true)
  h.render().select(provided, 'room2')
  assert.equal(h.render().pendingCount, 0)
  h.render().toggleMarked(provided)
  assert.equal(h.render().marked(provided), false)
  assert.equal(h.render().hasDraftChanges, true)
  assert.equal(h.render().selected(provided), 'room1')
  h.render().undo()
  assert.equal(h.render().marked(provided), true)
  h.render().redo()
  assert.equal(h.render().marked(provided), false)
})

test('workbook-provided TBA cannot stage any room assignment', () => {
  const h = mount()
  const tba = { ...meeting, status: 'Draft', roomId: '', room: 'TBA', registrarPlot: undefined,
    providedRoomKeys: ['["teacher","07:30","09:00",["Mon"],"Lec",""]'] }
  h.render().select(tba, 'room2')
  h.render().toggleMarked(tba)
  assert.equal(h.render().pendingCount, 0)
  assert.equal(h.render().selected(tba), '')
})
