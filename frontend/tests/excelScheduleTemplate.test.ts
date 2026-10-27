import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assignScheduleYear, detectScheduleSetup, isScheduleSubjectRow, moveScheduleSetup, plotScheduleRows, selectedScheduleRows, projectScheduleMerges, readAssignedScheduleRecords, readScheduleRecords, scheduleHeaderAt, scheduleHeaderMerges, scheduleHeaderValues, scheduleStatusStyle, validateScheduleHeader, type ScheduleSetup, type ScheduleYear } from '../src/utils/excelScheduleTemplate.ts'
import { EditHistory } from '../src/utils/editHistory.ts'

const uyColumns = Array.from({ length: 21 }, (_, index) => index)

test('Status formatting follows whole-row edits without changing schedule values or statuses', () => {
  const configured: ScheduleSetup = { ...setup(), years: new Map([[19, 2], [20, 2]]), rowStatuses: new Map([[19, 'Plot']]),
    statusStyles: new Map([[12, { fontSize: 16 }], [19, { backgroundColor: '#ffffff', fontFamily: 'Calibri' }], [20, { borderBottom: '2px solid #000000' }]]) }
  const inserted = moveScheduleSetup(configured, { axis: 'row', start: 19, count: 2, remove: false })!
  assert.deepEqual([...inserted.statusStyles!.keys()], [12, 21, 22])
  const deleted = moveScheduleSetup(inserted, { axis: 'row', start: 22, count: 1, remove: true })!
  assert.deepEqual([...deleted.statusStyles!.keys()], [12, 21])
  assert.equal(deleted.rowStatuses?.get(21), 'Plot')
  const shifted = moveScheduleSetup(deleted, { axis: 'column', start: 0, count: 1, remove: false })!
  assert.deepEqual(shifted.statusStyles, deleted.statusStyles)
  const movedHeader = moveScheduleSetup(configured, { axis: 'row', start: 0, count: 1, remove: false })!
  assert.equal(scheduleStatusStyle(movedHeader, 13).fontSize, 16)
  assert.deepEqual([...configured.statusStyles!.keys()], [12, 19, 20])
})

test('Status validation colors override custom fill temporarily while preserving independent font and borders', () => {
  const configured: ScheduleSetup = { ...setup(), statusStyles: new Map([[19, { backgroundColor: '#e3edda', fontFamily: 'Georgia', fontSize: 18, borderBottom: 'none' }]]) }
  for (const color of ['#fca5a5', '#c4b5fd', '#fde047']) {
    const style = scheduleStatusStyle(configured, 19, color)
    assert.equal(style.backgroundColor, color)
    assert.equal(style.fontFamily, 'Georgia')
    assert.equal(style.fontSize, 18)
    assert.equal(style.borderBottom, 'none')
  }
  assert.equal(scheduleStatusStyle(configured, 19).backgroundColor, '#e3edda')
  assert.equal(configured.rowStatuses, undefined)
})

function uyCells() {
  const cells = new Map<string, string>()
  const values = scheduleHeaderValues()
  values[0][3] = 'Desciptive Title'
  values.forEach((row, r) => row.forEach((value, c) => cells.set(`${r + 12}:${uyColumns[c]}`, value)))
  cells.set('12:1', 'Subject Area')
  cells.set('12:4', 'Course')
  cells.set('12:8', ' ')
  cells.set('13:8', 'Lec')
  cells.set('13:9', 'Lab')
  cells.set('13:10', 'Total')
  for (const row of [19, 20, 29, 81, 153]) {
    cells.set(`${row}:2`, row === 29 ? 'ITE 083' : 'ITE 298')
    cells.set(`${row}:3`, row === 29 ? 'IT Project Management' : 'Information Management')
    cells.set(`${row}:12`, '1')
  }
  cells.set('18:0', '2BSIT: 2023-24 CURRICULUM')
  cells.set('19:14', 'Lobendino, Joy Chrisky')
  cells.set('19:16', '1:30-3:00')
  cells.set('19:18', 'THU/FRI')
  cells.set('19:20', 'PTC 306')
  cells.set('19:1', 'Professional')
  cells.set('19:4', 'BSIT')
  cells.set('19:5', '2')
  cells.set('19:6', '1')
  cells.set('19:7', '3')
  cells.set('19:8', '2')
  cells.set('19:9', '3')
  cells.set('19:10', '5')
  cells.set('29:13', 'Narvasa, Jan Julienne')
  cells.set('29:15', '3:00-6:00')
  cells.set('29:17', 'WED')
  cells.set('29:19', 'PTC 403')
  return { cells, read: (r: number, c: number) => cells.get(`${r}:${c}`) ?? '' }
}
const header = { s: { r: 12, c: 0 }, e: { r: 13, c: 20 } }
const setup = (): ScheduleSetup => ({ header, columns: uyColumns, years: new Map() })

test('accepts the complete UY header including fields hidden in Excel and rejects the shortened template', () => {
  const { read } = uyCells()
  assert.equal(validateScheduleHeader(header, read, uyColumns), null)
  assert.equal(validateScheduleHeader(header, read), null)
  assert.match(validateScheduleHeader(header, read, uyColumns.filter(column => ![1, 4, 8, 9, 10].includes(column)))!, /21 template columns/)
  assert.match(validateScheduleHeader({ s: header.s, e: { r: 12, c: 20 } }, read, uyColumns)!, /both header rows/)
})

test('the fixed template matches the screenshot order and its two Lec/Lab/Total groups', () => {
  assert.deepEqual(scheduleHeaderValues(), [
    ['Class Type', 'Subject Area', 'Code', 'Descriptive Title', 'Course', 'Units', '', '', 'Hours', '', '', 'Max No. of Stud.', 'Section', 'Faculty', '', 'F2F Time', '', 'F2F Days', '', 'F2F Room', ''],
    ['', '', '', '', '', 'Lec', 'Lab', 'Total', 'Lec', 'Lab', 'Total', '', '', 'Lec', 'Lab', 'Lec', 'Lab', 'Lec', 'Lab', 'Lec', 'Lab'],
  ])
  const { cells, read } = uyCells()
  assert.equal(isScheduleSubjectRow(setup(), 19, read), true)
  cells.delete('19:2')
  assert.equal(isScheduleSubjectRow(setup(), 19, read), false)
})

test('auto-detection trims trailing blanks while preserving headings and internal blanks in a shifted template', () => {
  const cells = new Map<string, string>([['0:0', 'College']]) // A title is not a matching header.
  scheduleHeaderValues().forEach((row, r) => row.forEach((value, c) => cells.set(`${r + 4}:${c + 2}`, value)))
  cells.set('6:2', 'CITE')
  cells.set('7:2', ' 1bsit: 2023-24 CURRICULUM ')
  cells.set('9:2', '2 BSIT: 2023-24 CURRICULUM')
  cells.set('10:2', '3BSIT') // Subject values must not start another year group.
  cells.set('10:4', 'ITE 298')
  cells.set('10:5', 'Information Management')
  cells.set('10:6', '2BSIT/2ACT')
  cells.set('12:2', '3BSA: CURRICULUM')
  cells.set('14:22', 'PTC 306')
  cells.set('16:2', '4ACT')
  cells.set('18:2', 'OFF-SEM')
  cells.set('22:2', 'Footer')
  const original = [...cells]
  const read = (r: number, c: number) => cells.get(`${r}:${c}`) ?? ''
  const detected = detectScheduleSetup([{ r: 4, c: 2 }, { r: 0, c: 0 }], 22, read)!
  assert.deepEqual(detected.header, { s: { r: 4, c: 2 }, e: { r: 5, c: 22 } })
  assert.deepEqual(detected.columns, uyColumns.map(column => column + 2))
  assert.deepEqual([...detected.years], [[7, 1], [9, 2], [10, 2], [12, 3], [13, 3], [14, 3], [16, 4]])
  assert.equal(detected.includesEmptyRows, true)
  assert.ok(readAssignedScheduleRecords(detected, read).find(record => record.row === 13)!.values.every(value => value === ''))
  assert.deepEqual([...cells], original)
})

test('accepts the former College header in existing workbooks', () => {
  const { cells, read } = uyCells()
  cells.set('12:0', 'College')
  assert.equal(validateScheduleHeader(header, read, uyColumns), null)
  assert.ok(detectScheduleSetup([header.s], 184, read))
})

test('auto-detection leaves nonmatching sheets unset and registers a valid header without year headings', () => {
  const { cells, read } = uyCells()
  assert.equal(detectScheduleSetup([], 200, read), null)
  cells.delete('18:0')
  cells.set('15:0', '2023-2024')
  cells.set('16:0', '20BSIT: CURRICULUM')
  const detected = detectScheduleSetup([header.s], 184, read)!
  assert.deepEqual(detected.header, header)
  assert.equal(detected.years.size, 0)
  cells.set('12:1', 'Different field')
  assert.equal(detectScheduleSetup([header.s], 184, read), null)
})

test('auto-detection supports repeated program headings and stops at unsupported years and summer sections', () => {
  const { cells, read } = uyCells()
  cells.set('16:0', '1BSIT: CURRICULUM')
  cells.set('18:0', '2BSIT: CURRICULUM')
  cells.set('30:0', '3BSIT: CURRICULUM')
  cells.set('35:0', '2BSA: CURRICULUM')
  cells.set('40:0', '4BSIT: CURRICULUM')
  cells.set('45:0', '5BSIT: CURRICULUM')
  cells.set('50:0', '1ACT: CURRICULUM')
  cells.set('55:0', 'SUMMER')
  for (const row of [32, 37, 42, 52]) cells.set(`${row}:20`, 'PTC 306')
  const detected = detectScheduleSetup([header.s], 60, read)!
  assert.equal(detected.years.get(16), 1)
  assert.equal(detected.years.get(29), 2)
  assert.equal(detected.years.get(32), 3)
  assert.equal(detected.years.get(37), 2)
  assert.equal(detected.years.get(42), 4)
  for (const row of [17, 33, 34, 38, 39, 43, 44, 53, 54]) assert.equal(detected.years.has(row), false)
  assert.equal(detected.years.has(45), false)
  assert.equal(detected.years.has(49), false)
  assert.equal(detected.years.get(52), 1)
  assert.equal(detected.years.has(55), false)
  assert.equal(detected.years.has(60), false)
})

test('auto-detection trims each repeated same-year block and the final section without discarding hidden field values', () => {
  const { cells, read } = uyCells()
  cells.set('24:0', '2BSA: CURRICULUM')
  cells.set('32:8', '0') // A hidden column still makes this a populated row.
  cells.set('33:0', ' \t ')
  cells.set('34:20', ' ')
  const detected = detectScheduleSetup([header.s], 36, read)!
  assert.equal(detected.years.get(20), 2)
  for (const row of [21, 22, 23, 33, 34, 35, 36]) assert.equal(detected.years.has(row), false)
  assert.equal(detected.years.get(24), 2)
  assert.equal(detected.years.get(32), 2)
  assert.ok(readAssignedScheduleRecords(detected, read).find(record => record.row === 31)!.values.every(value => value === ''))
})

test('rejects reordered or renamed fields and swapped lecture/lab columns', () => {
  const { cells, read } = uyCells()
  cells.set('12:0', 'Session type')
  assert.match(validateScheduleHeader(header, read, uyColumns)!, /column 1/)
  cells.set('12:0', 'College')
  cells.set('13:13', 'Lab')
  assert.match(validateScheduleHeader(header, read, uyColumns)!, /column 14/)
})

test('maps a shifted imported header by physical columns and generates a contiguous new template', () => {
  const { read } = uyCells()
  const shifted = { s: { r: 4, c: 3 }, e: { r: 5, c: 23 } }
  assert.equal(validateScheduleHeader(shifted, (r, c) => read(r + 8, c - 3), uyColumns.map(column => column + 3)), null)
  const generated = scheduleHeaderAt({ r: 4, c: 3 })
  const merges = scheduleHeaderMerges(generated)
  assert.deepEqual(merges[0], { s: { r: 4, c: 3 }, e: { r: 5, c: 3 } })
  assert.deepEqual(merges.at(-1), { s: { r: 4, c: 22 }, e: { r: 4, c: 23 } })
  const matrix = scheduleHeaderValues()
  assert.equal(validateScheduleHeader(generated, (r, c) => matrix[r - 4]?.[c - 3] ?? ''), null)
  const completeHeader = scheduleHeaderAt({ r: 12, c: 0 }, uyColumns)
  assert.deepEqual(completeHeader, header)
  const importedMerges = scheduleHeaderMerges(completeHeader, uyColumns)
  assert.deepEqual(importedMerges[5], { s: { r: 12, c: 5 }, e: { r: 12, c: 7 } })
  assert.deepEqual(importedMerges[6], { s: { r: 12, c: 8 }, e: { r: 12, c: 10 } })
  assert.deepEqual(importedMerges[9], { s: { r: 12, c: 13 }, e: { r: 12, c: 14 } })
})

test('assigns the full year range including blank rows and separators, excludes headers, and retains values', () => {
  const { cells, read } = uyCells()
  const original = [...cells]
  const initial = setup()
  const result = assignScheduleYear(initial, { s: { r: 12, c: 0 }, e: { r: 78, c: 20 } }, 2, read)
  assert.equal(result.count, 65)
  assert.equal(result.setup.years.size, 65)
  assert.equal(result.setup.years.get(13), undefined)
  assert.equal(result.setup.years.get(18), 2)
  assert.equal(result.setup.years.get(21), 2)
  assert.equal(result.setup.years.get(78), 2)
  assert.equal(initial.years.size, 0)
  assert.deepEqual([...cells], original)
  const third = assignScheduleYear(result.setup, { s: { r: 81, c: 3 }, e: { r: 150, c: 3 } }, 3, read)
  const fourth = assignScheduleYear(third.setup, { s: { r: 153, c: 0 }, e: { r: 184, c: 20 } }, 4, read)
  assert.equal(fourth.setup.years.get(81), 3)
  assert.equal(fourth.setup.years.get(153), 4)
})

test('preview keeps lecture and laboratory values in their separate template slots', () => {
  const { read } = uyCells()
  const result = assignScheduleYear(setup(), { s: { r: 19, c: 0 }, e: { r: 29, c: 20 } }, 2, read)
  const records = readScheduleRecords(result.setup, { s: { r: 19, c: 0 }, e: { r: 29, c: 20 } }, read)
  assert.equal(records.length, 11)
  assert.equal(records[0].year, 2)
  assert.equal(records[0].values.length, 21)
  assert.equal(records[0].values[1], 'Professional')
  assert.equal(records[0].values[4], 'BSIT')
  assert.deepEqual(records[0].values.slice(5, 11), ['2', '1', '3', '2', '3', '5'])
  assert.equal(records[0].values[13], '')
  assert.equal(records[0].values[14], 'Lobendino, Joy Chrisky')
  assert.equal(records[0].values[20], 'PTC 306')
  assert.ok(records[2].values.every(value => value === ''))
  assert.equal(records[10].values[13], 'Narvasa, Jan Julienne')
  assert.equal(records[10].values[14], '')
  assert.equal(records[10].values[19], 'PTC 403')
})

test('configured preview reads every assigned group independently of the selected range', () => {
  const { cells, read } = uyCells()
  const years = new Map<number, ScheduleYear>([[153, 4], [81, 3], [19, 2], [12, 2], [99, 3]])
  for (let row = 30; row < 42; row++) {
    cells.set(`${row}:2`, `ITE ${row}`)
    cells.set(`${row}:3`, `Subject ${row}`)
    years.set(row, 2)
  }
  const configured = { ...setup(), years, includesEmptyRows: true }
  const selected = readScheduleRecords(configured, { s: { r: 19, c: 0 }, e: { r: 19, c: 20 } }, read)
  const records = readAssignedScheduleRecords(configured, read)
  assert.equal(selected.length, 1)
  assert.deepEqual(records.map(record => record.row), [19, ...Array.from({ length: 12 }, (_, index) => index + 30), 81, 99, 153])
  assert.equal(records.filter(record => record.year === 2).length, 13)
  assert.equal(records.filter(record => record.year === 3).length, 2)
  assert.ok(records.find(record => record.row === 99)!.values.every(value => value === ''))
  assert.equal(records.filter(record => record.year === 4).length, 1)
  assert.equal(records[0].values.length, 21)
  assert.equal(records[0].values[14], 'Lobendino, Joy Chrisky')
  assert.equal(configured.years.size, 17)
})

test('first-year assignments retain the full template and empty rows independently of other years', () => {
  const { cells, read } = uyCells()
  cells.set('14:2', 'ITE 001')
  cells.set('14:3', 'Introduction to Computing')
  const initial = assignScheduleYear(setup(), { s: { r: 19, c: 0 }, e: { r: 20, c: 20 } }, 2, read).setup
  const first = assignScheduleYear(initial, { s: { r: 14, c: 0 }, e: { r: 17, c: 20 } }, 1, read)
  assert.equal(first.count, 4)
  const records = readAssignedScheduleRecords(first.setup, read).filter(record => record.year === 1)
  assert.deepEqual(records.map(record => record.row), [14, 15, 16, 17])
  assert.equal(records[0].values.length, 21)
  assert.equal(records[0].values[2], 'ITE 001')
  assert.ok(records[1].values.every(value => value === ''))
  assert.equal(first.setup.years.get(19), 2)
  assert.equal(initial.years.has(14), false)
  const history = new EditHistory<ScheduleSetup>((a, b) => a === b)
  history.record(first.setup)
  const cleared = assignScheduleYear(first.setup, { s: { r: 14, c: 0 }, e: { r: 17, c: 20 } }, null, read).setup
  history.record(cleared)
  assert.equal(readAssignedScheduleRecords(cleared, read).filter(record => record.year === 1).length, 0)
  assert.equal(cleared.years.get(19), 2)
  assert.equal(history.undo(), first.setup)
  assert.equal(history.redo(), cleared)
  const legacy = { ...setup(), years: new Map([[14, 1], [17, 1]] as const) }
  assert.deepEqual(readAssignedScheduleRecords(legacy, read).map(record => record.row), [14, 15, 16, 17])
})

test('empty year rows can be assigned, cleared and moved without reappearing in the preview', () => {
  const { read } = uyCells()
  const range = { s: { r: 21, c: 0 }, e: { r: 24, c: 20 } }
  const assigned = assignScheduleYear(setup(), range, 2, read).setup
  assert.equal(readScheduleRecords(assigned, range, read).length, 4)
  assert.equal(readAssignedScheduleRecords(assigned, read).length, 4)
  const cleared = assignScheduleYear(assigned, { s: { r: 22, c: 0 }, e: { r: 22, c: 20 } }, null, read).setup
  assert.deepEqual(readAssignedScheduleRecords(cleared, read).map(record => record.row), [21, 23, 24])
  const moved = moveScheduleSetup(cleared, { axis: 'row', start: 0, count: 1, remove: false })!
  assert.equal(moved.includesEmptyRows, true)
  assert.deepEqual([...moved.years.keys()], [22, 24, 25])
})

test('older subject-only assignments include blank separators without claiming other subject rows', () => {
  const { read } = uyCells()
  const legacy = { ...setup(), years: new Map([[19, 2], [29, 2]] as const) }
  const records = readAssignedScheduleRecords(legacy, read)
  assert.deepEqual(records.map(record => record.row), [19, ...Array.from({ length: 8 }, (_, index) => index + 21), 29])
  assert.equal(legacy.years.size, 2)
  const upgraded = assignScheduleYear(legacy, { s: { r: 25, c: 0 }, e: { r: 25, c: 20 } }, null, read).setup
  assert.ok(!readAssignedScheduleRecords(upgraded, read).some(record => record.row === 25))
})

test('preview merges project onto template columns and visible year rows while retaining their source cell', () => {
  const merges = projectScheduleMerges([19, 21, 22], uyColumns.filter(column => column !== 1), [{ s: { r: 18, c: 0 }, e: { r: 21, c: 3 } }, { s: { r: 22, c: 15 }, e: { r: 22, c: 16 } }])
  const first = merges.get('19:0')!
  assert.equal(first.rowSpan, 2)
  assert.equal(first.columnSpan, 3)
  assert.equal(first.firstRow, 19)
  assert.deepEqual(first.source.s, { r: 18, c: 0 })
  assert.equal(merges.get('21:3'), first)
  assert.equal(merges.get('22:15')!.columnSpan, 2)
  assert.equal(merges.has('22:0'), false)
  const headerCells = projectScheduleMerges([12, 13], uyColumns, scheduleHeaderMerges(header, uyColumns))
  assert.equal(headerCells.get('12:0')!.rowSpan, 2)
  assert.equal(headerCells.get('12:5')!.columnSpan, 3)
})

test('reassigning and clearing years is immutable and supports undo/redo', () => {
  const { cells, read } = uyCells()
  const range = { s: { r: 19, c: 0 }, e: { r: 20, c: 20 } }
  const history = new EditHistory<ScheduleSetup>((a, b) => a === b)
  const initial = setup()
  history.record(initial)
  const assigned = assignScheduleYear(initial, range, 2, read).setup
  history.record(assigned)
  const reassigned = assignScheduleYear(assigned, range, 3, read).setup
  history.record(reassigned)
  assert.equal(history.undo(), assigned)
  assert.equal(history.redo(), reassigned)
  cells.delete('19:2') // Clearing assignments also works if a subject has since been erased.
  const cleared = assignScheduleYear(reassigned, range, null, read)
  assert.equal(cleared.count, 2)
  assert.equal(cleared.setup.years.size, 0)
  assert.equal(reassigned.years.get(19), 3)
})

test('plotting a cell range marks only its assigned nonempty schedule rows, skipping headers and curriculum labels', () => {
  const { read } = uyCells()
  const initial: ScheduleSetup = { ...setup(), years: new Map([[13, 1], [18, 2], [19, 2], [20, 2], [21, 2], [29, 2]]) }
  const range = { s: { r: 12, c: 14 }, e: { r: 28, c: 14 } }
  assert.deepEqual(selectedScheduleRows(initial, range, read), [19, 20])
  const plotted = plotScheduleRows(initial, range, read)
  assert.deepEqual([...plotted.rowStatuses!], [[19, 'Plot'], [20, 'Plot']])
  assert.equal(initial.rowStatuses, undefined)
  assert.equal(plotScheduleRows(plotted, range, read), plotted)
  assert.equal(plotScheduleRows(initial, { s: { r: 21, c: 0 }, e: { r: 22, c: 20 } }, read), initial)
  assert.equal(plotScheduleRows(setup(), range, read).rowStatuses, undefined)
  const history = new EditHistory<ScheduleSetup>((first, second) => first === second)
  history.record(initial)
  history.record(plotted)
  assert.equal(history.undo(), initial)
  assert.equal(history.redo(), plotted)
  const reassigned = assignScheduleYear(plotted, range, 3, read).setup
  assert.equal(reassigned.rowStatuses?.get(19), 'Plot')
  const cleared = assignScheduleYear(reassigned, range, null, read).setup
  assert.equal(cleared.rowStatuses?.size, 0)
})

test('plotting requires a selection inside the configured schedule header columns', () => {
  const { read } = uyCells()
  const initial: ScheduleSetup = { ...setup(), years: new Map([[19, 2], [20, 2]]) }
  const shifted = moveScheduleSetup(initial, { axis: 'column', start: 0, count: 3, remove: false })!
  const shiftedRead = (row: number, column: number) => read(row, column - 3)
  const range = (first: number, last = first) => ({ s: { r: 19, c: first }, e: { r: 20, c: last } })
  for (const selection of [range(2), range(24), range(2, 3), range(23, 24), range(0, 16383)]) {
    assert.deepEqual(selectedScheduleRows(shifted, selection, shiftedRead), [])
    assert.equal(plotScheduleRows(shifted, selection, shiftedRead), shifted)
  }
  for (const selection of [range(3), range(23), range(16, 17), range(3, 23)]) {
    assert.deepEqual(selectedScheduleRows(shifted, selection, shiftedRead), [19, 20])
    assert.deepEqual([...plotScheduleRows(shifted, selection, shiftedRead).rowStatuses!], [[19, 'Plot'], [20, 'Plot']])
  }
  assert.deepEqual(selectedScheduleRows(shifted, { s: { r: 12, c: 3 }, e: { r: 13, c: 23 } }, shiftedRead), [])
  assert.deepEqual(selectedScheduleRows(shifted, { s: { r: 21, c: 3 }, e: { r: 22, c: 23 } }, shiftedRead), [])
  const withStatus = { ...shifted, statusColumn: 24 }
  for (const selection of [range(24), range(23, 24), range(3, 24)]) {
    assert.deepEqual(selectedScheduleRows(withStatus, selection, shiftedRead), [19, 20])
    assert.deepEqual([...plotScheduleRows(withStatus, selection, shiftedRead).rowStatuses!], [[19, 'Plot'], [20, 'Plot']])
  }
  for (const selection of [range(25), range(24, 25), range(2, 24)]) {
    assert.deepEqual(selectedScheduleRows(withStatus, selection, shiftedRead), [])
    assert.equal(plotScheduleRows(withStatus, selection, shiftedRead), withStatus)
  }
})

test('Plot status follows inserted rows and columns, and is removed with deleted rows', () => {
  const initial: ScheduleSetup = { ...setup(), years: new Map([[19, 2], [20, 2]]), rowStatuses: new Map([[19, 'Plot'], [20, 'Plot']]) }
  const inserted = moveScheduleSetup(initial, { axis: 'row', start: 19, count: 2, remove: false })!
  assert.deepEqual([...inserted.rowStatuses!], [[21, 'Plot'], [22, 'Plot']])
  const deleted = moveScheduleSetup(inserted, { axis: 'row', start: 21, count: 1, remove: true })!
  assert.deepEqual([...deleted.rowStatuses!], [[21, 'Plot']])
  const shifted = moveScheduleSetup(deleted, { axis: 'column', start: 0, count: 1, remove: false })!
  assert.deepEqual([...shifted.rowStatuses!], [[21, 'Plot']])
  assert.deepEqual([...initial.rowStatuses!], [[19, 'Plot'], [20, 'Plot']])
})

test('unplotting returns only selected eligible rows to Draft and supports undo and replot', () => {
  const { read } = uyCells()
  const initial: ScheduleSetup = { ...setup(), statusColumn: 21, years: new Map([[18, 2], [19, 2], [20, 2], [21, 2], [29, 2]]), rowStatuses: new Map([[19, 'Plot'], [29, 'Plot']]) }
  const range = { s: { r: 18, c: 21 }, e: { r: 21, c: 21 } }
  const draft = plotScheduleRows(initial, range, read, 'Draft')
  assert.deepEqual([...draft.rowStatuses!], [[29, 'Plot']])
  assert.deepEqual([...initial.rowStatuses!], [[19, 'Plot'], [29, 'Plot']])
  assert.equal(draft.years, initial.years)
  assert.equal(plotScheduleRows(draft, range, read, 'Draft'), draft)
  assert.equal(plotScheduleRows(initial, { s: { r: 19, c: 22 }, e: { r: 20, c: 22 } }, read, 'Draft'), initial)
  const history = new EditHistory<ScheduleSetup>((first, second) => first === second)
  history.record(initial)
  history.record(draft)
  assert.equal(history.undo(), initial)
  assert.equal(history.redo(), draft)
  const replotted = plotScheduleRows(draft, range, read)
  assert.equal(replotted.rowStatuses?.get(19), 'Plot')
  assert.equal(replotted.rowStatuses?.get(20), 'Plot')
  assert.equal(replotted.rowStatuses?.has(18), false)
  assert.equal(replotted.rowStatuses?.has(21), false)
  assert.equal(replotted.rowStatuses?.get(29), 'Plot')
})

test('whole-row insertion and deletion move year assignments with their subject rows', () => {
  const initial = { ...setup(), years: new Map([[19, 2], [81, 3], [153, 4]] as const) }
  const moved = moveScheduleSetup(initial, { axis: 'row', start: 19, count: 2, remove: false })!
  assert.deepEqual([...moved.years], [[21, 2], [83, 3], [155, 4]])
  assert.deepEqual(moved.header, header)
  const deleted = moveScheduleSetup(moved, { axis: 'row', start: 21, count: 1, remove: true })!
  assert.deepEqual([...deleted.years], [[82, 3], [154, 4]])
  assert.equal(initial.years.get(19), 2)
})

test('edits before the header shift its anchor while edits through the template invalidate it', () => {
  const moved = moveScheduleSetup(setup(), { axis: 'row', start: 0, count: 2, remove: false })!
  assert.equal(moved.header.s.r, 14)
  const shifted = moveScheduleSetup(moved, { axis: 'column', start: 0, count: 1, remove: false })!
  assert.equal(shifted.header.s.c, 1)
  assert.deepEqual(shifted.columns, uyColumns.map(column => column + 1))
  assert.equal(moveScheduleSetup(setup(), { axis: 'column', start: 8, count: 1, remove: true }), null)
  assert.equal(moveScheduleSetup(setup(), { axis: 'row', start: 13, count: 1, remove: false }), null)
  assert.equal(moveScheduleSetup(setup(), { axis: 'row', start: 12, count: 2, remove: true }), null)
  assert.equal(moveScheduleSetup(setup(), { axis: 'column', start: 13, count: 1, remove: false, band: { start: 19, end: 29 } }), null)
  assert.deepEqual(moveScheduleSetup(setup(), { axis: 'column', start: 21, count: 1, remove: false })?.header, header)
})
