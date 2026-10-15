import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/utils/universityDashboard.ts', import.meta.url), 'utf8')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
const { universityDateKey, universityDashboardData } = context.exports

test('today uses the Philippine date across midnight and year boundaries', () => {
  assert.equal(universityDateKey(new Date('2026-10-13T15:59:00Z')), '2026-10-13')
  assert.equal(universityDateKey(new Date('2026-10-13T16:00:00Z')), '2026-10-14')
  const result = universityDashboardData([], [], new Date('2026-12-31T16:00:00Z'))
  assert.equal(result.week[0].key, '2027-01-01')
  assert.equal(result.week[6].key, '2027-01-07')
})

test('today includes pending, approved and completed bookings in time order, excluding cancelled and declined', () => {
  const bookings = [
    { id: 'later', date: '2026-10-14', startTime: '15:00', status: 'Approved' },
    { id: 'early', date: '2026-10-14', startTime: '08:00', status: 'Completed' },
    { id: 'pending', date: '2026-10-14', startTime: '10:00', status: 'Pending' },
    { id: 'recommended', date: '2026-10-14', startTime: '11:00', status: 'Recommending Approval' },
    { id: 'cancelled', date: '2026-10-14', status: 'Cancelled' },
    { id: 'declined', date: '2026-10-14', status: 'Declined' },
    { id: 'tomorrow', date: '2026-10-15', status: 'Pending' },
  ]
  const result = universityDashboardData([], bookings, new Date('2026-10-13T16:01:00Z'))
  assert.equal(result.todayReservations.map(item => item.id).join(','), 'early,pending,recommended,later')
  assert.equal(result.pending.map(item => item.id).join(','), 'recommended')
  assert.equal(result.week[0].approved, 1)
  assert.equal(result.week[0].pending, 2)
  assert.equal(result.week[0].total, 3)
  assert.equal(result.week[1].total, 1)
})

test('facility readiness counts stored statuses and excludes invalid seating capacities', () => {
  const result = universityDashboardData([
    { id: 'available', status: 'Available', capacity: 40 },
    { id: 'unavailable', status: 'Unavailable', capacity: 30 },
    { id: 'maintenance', status: 'Maintenance', capacity: -10 },
    { id: 'unknown', capacity: Number.NaN },
  ], [], new Date('2026-10-14T00:00:00Z'))
  assert.equal(result.available, 1)
  assert.equal(result.unavailable, 1)
  assert.equal(result.maintenance, 1)
  assert.equal(result.capacity, 70)
})

test('empty directories and no bookings produce seven zero-demand days', () => {
  const result = universityDashboardData([], [], new Date('2026-10-14T00:00:00Z'))
  assert.equal(result.capacity, 0)
  assert.equal(result.available, 0)
  assert.equal(result.pending.length, 0)
  assert.equal(result.todayReservations.length, 0)
  assert.equal(result.week.length, 7)
  assert.equal(result.week.reduce((total, day) => total + day.total, 0), 0)
})
