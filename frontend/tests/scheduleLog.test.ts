import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleChangeValue } from '../src/utils/scheduleLog.ts'

test('meeting changes display instructor, room, time, days and match status without internal IDs', () => {
  const raw = JSON.stringify([{ faculty: 'Cruz, Juan', room: 'PTC 403', startTime: '15:00', endTime: '18:00', days: ['Wed'], format: 'Lec', instructorId: 'private-instructor-id', roomId: 'private-room-id', buildingId: 'private-building-id' }])
  const display = scheduleChangeValue('Resolved meetings', raw)
  assert.equal(display.text, 'Instructor: Cruz, Juan\nRoom: PTC 403\nTime: 15:00 – 18:00\nDays: Wed\nClass format: Lec\nInstructor match: Matched\nRoom link: Linked\nBuilding link: Linked')
  assert.equal(display.text.includes('private-'), false)
  assert.equal(display.recordedText, raw, 'the exact saved text remains available for inspection')
  assert.match(scheduleChangeValue('Resolved meetings', '[{"faculty":"Cruz, Juan","instructorId":""}]').text, /Instructor match: Not matched/)
})

test('validation messages become readable lines and cleared checks show an explicit empty state', () => {
  assert.equal(scheduleChangeValue('Validation issues', '["Faculty could not be matched.","Room not found."]').text, 'Faculty could not be matched.\nRoom not found.')
  assert.equal(scheduleChangeValue('Validation issues', '[]').text, 'No validation issues')
  assert.equal(scheduleChangeValue('Resolved meetings', '[]').text, 'No meetings')
})

test('shortened legacy JSON is identified without fabricating missing schedule information', () => {
  const raw = '[{"faculty":"Cruz, Juan","room":"PTC 403","startTime":"15:…'
  const display = scheduleChangeValue('Resolved meetings', raw)
  assert.match(display.text, /shortened/)
  assert.equal(display.recordedText, raw)
  assert.equal(display.text.includes('Not assigned'), false)
})

test('plain cell contents, zeroes, booleans and nested settings remain meaningful', () => {
  assert.equal(scheduleChangeValue('Cell value', '[Important note]').text, '[Important note]')
  assert.equal(scheduleChangeValue('Cell value', '[1,2]').text, '[1,2]')
  assert.equal(scheduleChangeValue('Cell value', '0').text, '0')
  assert.equal(scheduleChangeValue('Cell value', '').text, 'Empty')
  assert.equal(scheduleChangeValue('Cell value', null).text, 'Not set')
  assert.equal(scheduleChangeValue('Cell formatting', '{"override":{"bold":true,"italic":false,"fontSize":0}}').text, 'Override · Bold: Yes\nOverride · Italic: No\nOverride · Font Size: 0')
})

test('malformed meeting data is displayed generically rather than inventing a meeting', () => {
  assert.equal(scheduleChangeValue('Resolved meetings', '["Legacy meeting note"]').text, 'Legacy meeting note')
})
