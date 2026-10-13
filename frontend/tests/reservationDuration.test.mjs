import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/utils/reservationDuration.ts', import.meta.url), 'utf8')
const context = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText, context)
const { maxReservationDuration, reservationTimeString, reservationTimeMinutes } = context.exports
const room = { startTime: '07:30', endTime: '18:00', maxBookingMins: 60 }

test('standard duration still respects both room maximum and the current slot boundary', () => {
  assert.equal(maxReservationDuration(room, '07:30', 'Standard', []), 60)
  assert.equal(maxReservationDuration(room, '08:30', 'Standard', []), 30)
})

test('extended requests span slots and the normal maximum, but stop at room closing', () => {
  assert.equal(maxReservationDuration(room, '07:30', 'Extended', []), 630)
  assert.equal(maxReservationDuration(room, '17:30', 'Extended', []), 30)
  assert.equal(maxReservationDuration(room, '07:00', 'Extended', []), 0)
  assert.equal(maxReservationDuration(room, '18:00', 'Extended', []), 0)
})

test('occupied intervals block a whole day and limit extended end times to the next conflict', () => {
  const occupied = [{ start: 600, end: 660 }, { start: 780, end: 840 }]
  assert.equal(maxReservationDuration(room, '07:30', 'Extended', occupied), 150)
  assert.equal(maxReservationDuration(room, '10:30', 'Extended', occupied), 0)
  assert.equal(maxReservationDuration(room, '11:00', 'Extended', occupied), 120)
  assert.equal(maxReservationDuration(room, '14:00', 'Extended', occupied), 240)
})

test('whole-day times retain custom room hours and round-trip their end time', () => {
  const customRoom = { startTime: '08:00', endTime: '17:00', maxBookingMins: 90 }
  const duration = maxReservationDuration(customRoom, '08:00', 'Extended', [])
  assert.equal(duration, 540)
  assert.equal(reservationTimeString(reservationTimeMinutes('08:00') + duration), '17:00')
})
