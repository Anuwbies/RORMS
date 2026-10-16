import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function mount(includeReservations = false, throwsOnSubscribe = -1) {
  const listeners = [], updates = [], errors = [], timers = new Set()
  const firestore = {
    collection: (_db, name) => name,
    where: (field, operator, value) => ({ field, operator, value }),
    query: (name, filter) => ({ name, filter }),
    onSnapshot: (source, receive, fail) => {
      const index = listeners.length
      const listener = { source, receive, fail, closed: false }
      listeners.push(listener)
      if (index === throwsOnSubscribe) throw new Error('Subscription failed')
      return () => { listener.closed = true }
    },
  }
  const cache = new Map()
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const context = { exports: {}, Map, Set, Error,
      setTimeout: callback => { timers.add(callback); return callback },
      clearTimeout: timer => timers.delete(timer),
      require: name => {
        if (name === 'firebase/firestore') return firestore
        if (name === '../firebase') return { db: {} }
        if (name === '../utils/roomSchedule') return load('../src/utils/roomSchedule.ts')
        if (name === './scheduleMeetings.ts') return load('../src/utils/scheduleMeetings.ts')
        throw new Error(`Unexpected import: ${name}`)
      },
    }
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 },
    }).outputText
    vm.runInNewContext(compiled, context)
    cache.set(path, context.exports)
    return context.exports
  }
  const unsubscribe = load('../src/services/roomTimetable.ts').subscribeRoomTimetable('room1', includeReservations,
    value => updates.push(value), error => errors.push(error))
  return { listeners, updates, errors, timers, unsubscribe,
    emit: (index, docs = []) => listeners[index].receive({ docs }),
    timeout: () => { for (const callback of [...timers]) { timers.delete(callback); callback() } },
  }
}

const document = (id, values) => ({ id, data: () => values })
const meeting = changes => ({ roomId: 'room1', startTime: '07:30', endTime: '09:00', days: ['Fri'], ...changes })

test('loads both simple room queries, deduplicates rows and retains later workbook meetings', () => {
  const h = mount()
  assert.deepEqual(h.listeners.map(listener => listener.source), [
    { name: 'schedules', filter: { field: 'roomId', operator: '==', value: 'room1' } },
    { name: 'schedules', filter: { field: 'roomIds', operator: 'array-contains', value: 'room1' } },
  ])
  const row = document('row', { source: 'workbook', schemaVersion: 2, meetings: [meeting(), meeting({ startTime: '09:00', endTime: '10:30' }), meeting({ roomId: 'room2' })] })
  h.emit(0, [row]); assert.equal(h.updates.length, 0)
  h.emit(1, [row])
  assert.equal(h.updates.length, 1)
  assert.equal(h.updates[0].schedules.length, 2)
  assert.equal(h.timers.size, 0)
  h.emit(0); h.emit(1)
  assert.equal(h.updates.at(-1).schedules.length, 0)
  h.unsubscribe()
})

test('empty room schedules finish loading; week view waits for and filters reservations', () => {
  const h = mount(true)
  h.emit(0); h.emit(1)
  assert.equal(h.updates.length, 0)
  h.emit(2, [document('approved', { status: 'Approved' }), document('pending', { status: 'Pending' }),
    document('review', { status: 'Recommending Approval' }), document('declined', { status: 'Declined' })])
  assert.equal(h.updates.length, 1)
  assert.equal(h.updates[0].schedules.length, 0)
  assert.deepEqual(Array.from(h.updates[0].reservations, reservation => reservation.id), ['approved', 'pending', 'review'])
  h.unsubscribe()
})

test('listener and synchronous registration errors report immediately without presenting partial data', () => {
  const h = mount(true)
  h.listeners[0].fail(new Error('Permission denied'))
  assert.equal(h.errors.length, 1)
  assert.equal(h.timers.size, 0)
  h.emit(1); h.emit(2)
  assert.equal(h.updates.length, 0)
  h.unsubscribe()
  const failed = mount(false, 0)
  assert.equal(failed.errors[0].message, 'Subscription failed')
  failed.unsubscribe()
})

test('stalled requests report a timeout and can recover when live data arrives', () => {
  const h = mount(true)
  h.emit(0); h.emit(1)
  h.timeout()
  assert.equal(h.errors[0].message, 'Room timetable request timed out.')
  h.emit(2)
  assert.equal(h.updates.length, 1)
  h.unsubscribe()
})

test('snapshot processing errors report instead of leaving the loading state pending', () => {
  const h = mount()
  h.emit(0, [{ id: 'broken', data: () => { throw new Error('Invalid schedule data') } }])
  h.emit(1)
  assert.equal(h.errors[0].message, 'Invalid schedule data')
  assert.equal(h.updates.length, 0)
  h.unsubscribe()
})

test('closing or changing rooms cancels listeners and ignores queued results and errors', () => {
  const h = mount(true)
  h.unsubscribe()
  assert.equal(h.timers.size, 0)
  assert.ok(h.listeners.every(listener => listener.closed))
  h.emit(0); h.emit(1); h.emit(2)
  h.listeners[0].fail(new Error('Late error'))
  h.timeout()
  assert.equal(h.updates.length, 0)
  assert.equal(h.errors.length, 0)
})
