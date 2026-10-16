import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignedSchedulePlotStatus, isProvidedScheduleRoom, plotMeetingKey, schedulePlotSelectionKey, toggleAssignedSchedulePlot, type PlotAssignment } from '../src/utils/schedulePlotting.ts'
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
    roomId: 'room1', expectedRoomId: 'room1', expectedRevision: '["revision1",""]', targetStatus: 'Plot' })
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

test('calendar copies and Lec/Lab checkboxes share their schedule row status', () => {
  const first = meeting()
  const repeated = meeting({ id: 'class1:meeting:1' })
  const lab = meeting({ id: 'class1:meeting:2', format: 'Lab', startTime: '09:00', endTime: '10:30' })
  assert.equal(schedulePlotSelectionKey(first), schedulePlotSelectionKey(repeated))
  let selected = toggleAssignedSchedulePlot(new Map(), first)
  assert.equal(assignedSchedulePlotStatus(selected, lab), 'Plot')
  assert.equal(assignedSchedulePlotStatus(selected, repeated), 'Plot')
  selected = toggleAssignedSchedulePlot(selected, repeated)
  assert.equal(selected.size, 0)
  selected = toggleAssignedSchedulePlot(selected, lab)
  assert.ok(selected.has(schedulePlotSelectionKey(lab)))
})

test('unassigned and other statuses cannot stage current-room approval', () => {
  for (const saved of [meeting({ roomId: '' }), meeting({ status: 'Return' })]) {
    assert.equal(toggleAssignedSchedulePlot(new Map(), saved).size, 0)
  }
})

test('provided Plot rooms keep their checkbox and unchecking stages Draft without clearing rooms', () => {
  const saved = meeting({ status: 'Plot' })
  assert.equal(isProvidedScheduleRoom(saved), true)
  const unchecked = toggleAssignedSchedulePlot(new Map(), saved)
  assert.equal(assignedSchedulePlotStatus(unchecked, saved), 'Draft')
  assert.equal(unchecked.get(schedulePlotSelectionKey(saved))?.roomId, 'room1')
  assert.equal(unchecked.get(schedulePlotSelectionKey(saved))?.targetStatus, 'Draft')
  assert.equal(toggleAssignedSchedulePlot(unchecked, saved).size, 0)
  assert.equal(saved.status, 'Plot')
})

test('recorded provided-room provenance survives Plot while newly chosen rooms remain editable', () => {
  const saved = meeting({ status: 'Plot' })
  const key = plotMeetingKey(saved as Parameters<typeof plotMeetingKey>[0])
  const plot = { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [] }
  assert.equal(isProvidedScheduleRoom({ ...saved, registrarPlot: { ...plot, providedRoomKeys: [key] } }), true)
  const assigned = { ...saved, registrarPlot: { ...plot, providedRoomKeys: [] } }
  assert.equal(isProvidedScheduleRoom(assigned), false)
  assert.equal(toggleAssignedSchedulePlot(new Map(), assigned).size, 0)
})

test('workbook source metadata takes precedence over legacy Plot metadata, including TBA', () => {
  const tba = meeting({ roomId: '', room: 'TBA' })
  const key = plotMeetingKey(tba as Parameters<typeof plotMeetingKey>[0])
  const plot = { version: 1, revisionId: 'plot1', savedBy: 'registrar', assignments: [], providedRoomKeys: [] }
  assert.equal(isProvidedScheduleRoom({ ...tba, providedRoomKeys: [key], registrarPlot: plot }), true)
  assert.equal(isProvidedScheduleRoom({ ...tba, providedRoomKeys: [] }), false)
  assert.equal(isProvidedScheduleRoom(tba), true)
  assert.equal(isProvidedScheduleRoom({ ...tba, registrarPlot: plot }), true)
  assert.equal(toggleAssignedSchedulePlot(new Map(), { ...tba, providedRoomKeys: [key] }).size, 0)
})
