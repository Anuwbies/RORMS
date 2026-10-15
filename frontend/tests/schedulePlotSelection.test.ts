import assert from 'node:assert/strict'
import { test } from 'node:test'
import { schedulePlotSelectionKey, toggleAssignedSchedulePlot, type PlotAssignment } from '../src/utils/schedulePlotting.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

function meeting(overrides: Partial<ScheduleMeetingRecord> = {}): ScheduleMeetingRecord {
  return { id: 'class1', sourceScheduleId: 'class1', status: 'Draft', workbookRevisionId: 'revision1',
    format: 'Lec', faculty: 'Teacher', instructorId: 'teacher', days: ['Mon'], startTime: '07:30', endTime: '09:00',
    roomId: 'room1', room: 'PTC 201', buildingId: 'ptc', ...overrides }
}

test('checking an assigned Draft room only stages its current assignment and preserves saved status', () => {
  const saved = meeting()
  const pending = new Map<string, PlotAssignment>()
  const selected = toggleAssignedSchedulePlot(pending, saved)
  assert.equal(pending.size, 0)
  assert.equal(saved.status, 'Draft')
  assert.equal(selected.size, 1)
  assert.deepEqual(selected.get(schedulePlotSelectionKey(saved)), { scheduleId: 'class1', meetingKey: '["teacher","07:30","09:00",["Mon"],"Lec",""]',
    roomId: 'room1', expectedRoomId: 'room1', expectedRevision: '["revision1",""]' })
})

test('unchecking cancels staging without clearing the assigned room', () => {
  const saved = meeting()
  const selected = toggleAssignedSchedulePlot(new Map(), saved)
  const cancelled = toggleAssignedSchedulePlot(selected, saved)
  assert.equal(selected.size, 1)
  assert.equal(cancelled.size, 0)
  assert.equal(saved.roomId, 'room1')
  assert.equal(saved.status, 'Draft')
})

test('calendar copies of the same meeting share a check while separate Lec/Lab meetings are independent', () => {
  const first = meeting()
  const repeated = meeting({ id: 'class1:meeting:1' })
  const lab = meeting({ id: 'class1:meeting:2', format: 'Lab', startTime: '09:00', endTime: '10:30' })
  assert.equal(schedulePlotSelectionKey(first), schedulePlotSelectionKey(repeated))
  let selected = toggleAssignedSchedulePlot(new Map(), first)
  selected = toggleAssignedSchedulePlot(selected, lab)
  assert.equal(selected.size, 2)
  selected = toggleAssignedSchedulePlot(selected, repeated)
  assert.equal(selected.size, 1)
  assert.ok(selected.has(schedulePlotSelectionKey(lab)))
})

test('unassigned, already plotted, and other statuses cannot stage current-room approval', () => {
  for (const saved of [meeting({ roomId: '' }), meeting({ status: 'Plot' }), meeting({ status: 'Return' })]) {
    assert.equal(toggleAssignedSchedulePlot(new Map(), saved).size, 0)
  }
})
