import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPlotSelectionHistory, movePlotSelectionHistory, recordPlotSelection } from '../src/utils/plotSelectionHistory.ts'
import { toggleAssignedSchedulePlot, type PlotAssignment } from '../src/utils/schedulePlotting.ts'

const assignment: PlotAssignment = { scheduleId: 'class', meetingKey: 'meeting', roomId: 'room', expectedRoomId: '', expectedRevision: 'revision' }

test('undo and redo restore staged choices and preserve optimistic revision fields', () => {
  const empty = createPlotSelectionHistory()
  const first = recordPlotSelection(empty, new Map([['selection', assignment]]))
  const second = recordPlotSelection(first, new Map([['selection', { ...assignment, roomId: 'other' }]]))
  const undone = movePlotSelectionHistory(second, false)
  assert.deepEqual(undone.present.get('selection'), assignment)
  assert.equal(movePlotSelectionHistory(undone, true).present.get('selection')?.roomId, 'other')
  const cleared = movePlotSelectionHistory(undone, false)
  assert.equal(cleared.present.size, 0)
  assert.equal(movePlotSelectionHistory(cleared, true).present.size, 1)
  assert.equal(empty.present.size, 0)
})

test('plotting checkboxes share room-choice history', () => {
  const meeting = { id: 'class', sourceScheduleId: 'class', status: 'Draft', roomId: 'room', instructorId: 'teacher', days: ['Mon'], startTime: '07:30', endTime: '09:00' }
  const empty = createPlotSelectionHistory()
  const checked = recordPlotSelection(empty, toggleAssignedSchedulePlot(empty.present, meeting))
  assert.equal(checked.present.size, 1)
  const undone = movePlotSelectionHistory(checked, false)
  assert.equal(undone.present.size, 0)
  assert.equal(movePlotSelectionHistory(undone, true).present.size, 1)
})

test('a new edit after undo clears redo; unchanged choices do not add history', () => {
  const first = recordPlotSelection(createPlotSelectionHistory(), new Map([['selection', assignment]]))
  assert.equal(recordPlotSelection(first, new Map([['selection', { ...assignment }]])), first)
  const undone = movePlotSelectionHistory(first, false)
  const edited = recordPlotSelection(undone, new Map([['selection', { ...assignment, roomId: 'new' }]]))
  assert.equal(edited.future.length, 0)
  assert.equal(movePlotSelectionHistory(edited, true), edited)
})

test('history stays bounded and resets completely for a new context or successful Plot', () => {
  let history = createPlotSelectionHistory()
  for (let i = 0; i < 110; i++) history = recordPlotSelection(history, new Map([['selection', { ...assignment, roomId: String(i) }]]))
  assert.equal(history.past.length, 100)
  const reset = createPlotSelectionHistory()
  assert.equal(reset.present.size, 0)
  assert.equal(reset.past.length, 0)
  assert.equal(reset.future.length, 0)
  assert.equal(movePlotSelectionHistory(reset, false), reset)
})
