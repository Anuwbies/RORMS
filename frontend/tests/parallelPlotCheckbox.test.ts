import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parallelPlotCheckboxState, plotParallelGroup, stagePlotRoomSelections, toggleParallelSchedulePlot } from '../src/utils/plotParallelRooms.ts'
import { createPlotSelectionHistory, movePlotSelectionHistory, recordPlotSelection } from '../src/utils/plotSelectionHistory.ts'
import { schedulePlotSelectionKey, type PlotAssignment, type PlotRoom } from '../src/utils/schedulePlotting.ts'
import type { ScheduleMeetingRecord } from '../src/utils/scheduleMeetings.ts'

const rooms: PlotRoom[] = [402, 403, 404, 405, 407].map(number => ({ id: String(number), code: `PTC ${number}`, name: `PTC ${number}`,
  buildingId: 'ptc', floor: 4, status: 'Available', type: 'Lecture', availableDays: ['Monday'], startTime: '07:30', endTime: '18:00', capacity: 40 }))
const group = (): ScheduleMeetingRecord[] => [402, 403, 404, 405].map((number, index) => ({ id: `row${index}`, sourceScheduleId: `row${index}`,
  source: 'workbook', schemaVersion: 2, department: 'CITE', sourceWorkbook: 'book', sourceSheet: 'sheet', groupId: 'parallel', subjectCode: 'ITE 083',
  classSection: String(index + 5), faculty: 'Teacher', instructorId: 'teacher', format: 'Lec', startTime: '07:30', endTime: '10:30', days: ['Mon'],
  roomId: String(number), room: `PTC ${number}`, status: 'Draft', workbookRevisionId: 'revision' }))

test('one group checkbox checks all four provided schedules and undo/redo restores the whole group', () => {
  const meetings = group()
  const initial = createPlotSelectionHistory()
  const checked = toggleParallelSchedulePlot(initial.present, meetings, rooms)
  assert.equal(checked.size, 4)
  assert.ok([...checked.values()].every(item => item.targetStatus === 'Plot'))
  assert.equal(parallelPlotCheckboxState(meetings, rooms, checked).checked, true)
  assert.equal(toggleParallelSchedulePlot(checked, meetings, rooms).size, 0)
  const history = recordPlotSelection(initial, checked)
  const undone = movePlotSelectionHistory(history, false)
  assert.equal(undone.present.size, 0)
  assert.equal(movePlotSelectionHistory(undone, true).present.size, 4)
})

test('unchecking an approved group stages Draft for every section while keeping all rooms', () => {
  const meetings = group().map(meeting => ({ ...meeting, status: 'Plot' }))
  assert.equal(parallelPlotCheckboxState(meetings, rooms, new Map()).checked, true)
  const unchecked = toggleParallelSchedulePlot(new Map(), meetings, rooms)
  assert.equal(unchecked.size, 4)
  for (const meeting of meetings) {
    const assignment = unchecked.get(schedulePlotSelectionKey(meeting))!
    assert.equal(assignment.targetStatus, 'Draft')
    assert.equal(assignment.roomId, meeting.roomId)
  }
  assert.equal(toggleParallelSchedulePlot(unchecked, meetings, rooms).size, 0)
})

test('incomplete and disconnected groups stay unchecked and cannot be toggled', () => {
  for (const change of [{ roomId: '' }, { roomId: '407' }, { roomId: 'deleted' }]) {
    const meetings = group().map(meeting => ({ ...meeting, status: 'Plot' }))
    meetings[3] = { ...meetings[3], ...change }
    assert.equal(parallelPlotCheckboxState(meetings, rooms, new Map()).valid, false)
    assert.equal(parallelPlotCheckboxState(meetings, rooms, new Map()).checked, false)
    assert.equal(toggleParallelSchedulePlot(new Map(), meetings, rooms).size, 0)
  }
})

test('staged room choices enable the checkbox but require a separate manual check', () => {
  const meetings = group().map(meeting => ({ ...meeting, roomId: '', room: '', providedRoomKeys: [] }))
  const pending = new Map<string, PlotAssignment>()
  meetings.forEach((meeting, index) => {
    pending.set(schedulePlotSelectionKey(meeting), { scheduleId: meeting.id, meetingKey: 'unused', roomId: String(402 + index), expectedRoomId: '', expectedRevision: '' })
    assert.equal(parallelPlotCheckboxState(meetings, rooms, pending).checked, false)
    assert.equal(parallelPlotCheckboxState(meetings, rooms, pending).valid, index === 3)
  })
  const checked = toggleParallelSchedulePlot(pending, meetings, rooms)
  assert.equal(checked.size, 4)
  assert.ok([...checked.values()].every(item => item.targetStatus === 'Plot' && item.roomId))
  assert.equal(parallelPlotCheckboxState(meetings, rooms, checked).checked, true)
  const unchecked = toggleParallelSchedulePlot(checked, meetings, rooms)
  assert.equal(unchecked.size, 4)
  assert.ok([...unchecked.values()].every(item => !item.targetStatus && item.roomId))
})

test('editing a room clears group approval but retains all choices; undo restores the manual check', () => {
  const meetings = group().slice(0, 3).map(meeting => ({ ...meeting, roomId: '', room: '', providedRoomKeys: [] }))
  const choices = stagePlotRoomSelections(new Map(), meetings.map((meeting, index) => ({ meeting, roomId: String(402 + index) })))
  const checked = toggleParallelSchedulePlot(choices, meetings, rooms)
  assert.equal(parallelPlotCheckboxState(meetings, rooms, checked).checked, true)
  const edited = stagePlotRoomSelections(checked, [{ meeting: meetings[2], roomId: '405' }])
  assert.equal(edited.size, 3)
  assert.ok([...edited.values()].every(item => !item.targetStatus))
  assert.equal(edited.get(schedulePlotSelectionKey(meetings[0]))?.roomId, '402')
  assert.equal(parallelPlotCheckboxState(meetings, rooms, edited).checked, false)
  const history = recordPlotSelection(recordPlotSelection(createPlotSelectionHistory(), checked), edited)
  assert.equal(parallelPlotCheckboxState(meetings, rooms, movePlotSelectionHistory(history, false).present).checked, true)
})

test('changing a saved Plot room requires a new manual approval and does not affect another group', () => {
  const meetings = group().slice(0, 3).map(meeting => ({ ...meeting, status: 'Plot', providedRoomKeys: [] }))
  const other = group().map(meeting => ({ ...meeting, id: `other-${meeting.id}`, sourceScheduleId: `other-${meeting.id}`, groupId: 'other' }))
  const otherChecked = toggleParallelSchedulePlot(new Map(), other, rooms)
  const edited = stagePlotRoomSelections(otherChecked, [{ meeting: meetings[2], roomId: '405' }])
  assert.equal(parallelPlotCheckboxState(meetings, rooms, edited).checked, false)
  assert.equal(parallelPlotCheckboxState(other, rooms, edited).checked, true)
})

test('group membership excludes other subjects, meeting slots, and returned schedules', () => {
  const meetings = group()
  const others = [{ ...meetings[0], id: 'other', sourceScheduleId: 'other', groupId: 'other' },
    { ...meetings[0], id: 'lab', sourceScheduleId: 'lab', format: 'Lab' },
    { ...meetings[0], id: 'returned', sourceScheduleId: 'returned', status: 'Returned' }]
  assert.equal(plotParallelGroup([...meetings, ...others], rooms, meetings[0]).length, 4)
})

test('parallel groups of one, two or three schedules can check and uncheck with all actual rooms assigned', () => {
  for (const count of [1, 2, 3]) {
    const meetings = group().slice(0, count)
    assert.equal(plotParallelGroup(meetings, rooms, meetings[0]).length, count)
    assert.equal(parallelPlotCheckboxState(meetings, rooms, new Map()).valid, true)
    const checked = toggleParallelSchedulePlot(new Map(), meetings, rooms)
    assert.equal(checked.size, count)
    assert.equal(parallelPlotCheckboxState(meetings, rooms, checked).checked, true)
    assert.equal(toggleParallelSchedulePlot(checked, meetings, rooms).size, 0)
    const plotted = meetings.map(meeting => ({ ...meeting, status: 'Plot' }))
    const unchecked = toggleParallelSchedulePlot(new Map(), plotted, rooms)
    assert.equal(unchecked.size, count)
    assert.ok([...unchecked.values()].every(item => item.targetStatus === 'Draft'))
    meetings[count - 1].roomId = ''
    assert.equal(parallelPlotCheckboxState(meetings, rooms, new Map()).valid, false)
    assert.equal(toggleParallelSchedulePlot(new Map(), meetings, rooms).size, 0)
  }
  assert.equal(parallelPlotCheckboxState([], rooms, new Map()).valid, false)
})

test('a single parallel schedule without a group ID still has a working checkbox', () => {
  const meeting = { ...group()[0], groupId: '', type: 'parallel' }
  const members = plotParallelGroup([meeting], rooms, meeting)
  assert.equal(members.length, 1)
  assert.equal(parallelPlotCheckboxState(members, rooms, new Map()).valid, true)
  assert.equal(toggleParallelSchedulePlot(new Map(), members, rooms).size, 1)
})
