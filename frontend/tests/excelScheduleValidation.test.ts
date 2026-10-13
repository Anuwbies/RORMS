import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseExcelScheduleDays, parseExcelScheduleTime, scheduleValidationIssuesForRows, validateExcelSchedule } from '../src/utils/excelScheduleValidation.ts'
import { readAssignedScheduleRecords, scheduleHeaderAt, type ScheduleRecord, type ScheduleSetup, type ScheduleYear } from '../src/utils/excelScheduleTemplate.ts'

function record(row: number, year: ScheduleYear | undefined, code: string, title: string, section: string): ScheduleRecord {
  const values = Array<string>(21).fill('')
  values[2] = code
  values[3] = title
  values[12] = section
  return { row, year, values }
}

const duplicates = (records: readonly ScheduleRecord[]) => [...validateExcelSchedule(records).duplicateSubjectRows].sort((a, b) => a - b)

function meeting(row: number, year: ScheduleYear | undefined, faculty: string, time: string, days: string, room: string, kind: 'Lec' | 'Lab' = 'Lec') {
  const entry = record(row, year, `SUB ${row}`, `Subject ${row}`, String(row))
  const offset = kind === 'Lec' ? 0 : 1
  entry.values[13 + offset] = faculty
  entry.values[15 + offset] = time
  entry.values[17 + offset] = days
  entry.values[19 + offset] = room
  return entry
}

const overlaps = (records: readonly ScheduleRecord[]) => [...validateExcelSchedule(records).overlapRows].sort((a, b) => a - b)

const roomDirectory = [{ code: 'PTC-201', name: 'Lecture Room 201' }, { code: 'PTC 305', name: 'Computer Lab' }]

const facultyDirectory = { departmentCode: 'BITE', names: ['Engelbert Cruz', 'Narvasa, Jan Julienne', 'José Díaz'] }

test('Plot confirmation includes all existing validation types for the selected row', () => {
  const first = meeting(3, 1, 'Unknown Teacher', '7:30-9:00', 'Mon', 'Unregistered Lab')
  first.values[3] = ''
  const second = meeting(4, 1, 'Unknown Teacher', '8:00-9:30', 'Mon', 'Unregistered Lab')
  second.values[2] = first.values[2]
  second.values[12] = first.values[12]
  const validation = validateExcelSchedule([first, second], roomDirectory, facultyDirectory)
  const issues = scheduleValidationIssuesForRows(validation, [first.row])
  assert.equal(issues.length, 1)
  assert.equal(issues[0].row, first.row)
  assert.ok(issues[0].messages.some(message => message.includes('also booked')))
  assert.ok(issues[0].messages.some(message => message.startsWith('Section')))
  assert.ok(issues[0].messages.some(message => message.includes('does not exist in the rooms collection')))
  assert.ok(issues[0].messages.some(message => message.includes('not an active Instructor or Program Head')))
  assert.ok(issues[0].messages.includes('Missing Descriptive Title.'))
  assert.equal(new Set(issues[0].messages).size, issues[0].messages.length)
})

test('Plot confirmation filters unrelated errors, skips clean rows and orders multiple selected rows', () => {
  const first = record(8, 1, 'ITE 101', 'First subject', '1')
  const second = record(3, 2, 'ITE 102', 'Second subject', '2')
  const clean = meeting(5, 3, 'TBA', '7:30-9:00', 'Mon', 'TBA')
  const unrelated = record(20, 4, 'ITE 103', 'Unselected subject', '3')
  const validation = validateExcelSchedule([first, second, clean, unrelated], roomDirectory, facultyDirectory)
  const issues = scheduleValidationIssuesForRows(validation, [8, 5, 3, 8])
  assert.deepEqual(issues.map(issue => issue.row), [3, 8])
  assert.ok(issues.every(issue => issue.messages.includes('Missing Faculty (both Lec and Lab are empty).')))
  assert.deepEqual(scheduleValidationIssuesForRows(validation, [clean.row]), [])
  assert.deepEqual(scheduleValidationIssuesForRows(validation, []), [])
})

test('Plot confirmation reflects current room and faculty validation without treating unloaded directories as empty', () => {
  const entry = meeting(3, 1, 'Cruz, Engelbert', '7:30-9:00', 'Mon', 'PTC-201')
  assert.deepEqual(scheduleValidationIssuesForRows(validateExcelSchedule([entry]), [3]), [])
  const failed = validateExcelSchedule([entry], [], { departmentCode: 'BITE', names: [] })
  assert.equal(scheduleValidationIssuesForRows(failed, [3])[0].messages.length, 2)
  const resolved = validateExcelSchedule([entry], roomDirectory, facultyDirectory)
  assert.deepEqual(scheduleValidationIssuesForRows(resolved, [3]), [])
})

test('faculty existence accepts complete names with case, spacing, punctuation, accents and surname-first differences', () => {
  for (const name of ['Cruz, Engelbert', ' engelbert   CRUZ ', 'Narvasa, Jan Julienne', 'Jan Julienne Narvasa', 'DIAZ, JOSE']) {
    const entry = meeting(3, 1, name, '', '', '')
    assert.deepEqual([...validateExcelSchedule([entry], undefined, facultyDirectory).invalidFacultyRows], [], name)
  }
  const partial = meeting(3, 1, 'Cruz, Eng', '', '', '')
  assert.deepEqual([...validateExcelSchedule([partial], undefined, facultyDirectory).invalidFacultyRows], [3])
})

test('faculty existence validates Lec and Lab even without meeting times in every year', () => {
  for (const year of [1, 2, 3, 4] as const) {
    const entry = meeting(3, year, 'Unregistered Teacher', '', '', '')
    entry.values[14] = 'Other Department Teacher'
    const validation = validateExcelSchedule([entry], undefined, facultyDirectory)
    assert.deepEqual([...validation.invalidFacultyRows], [3])
    assert.deepEqual(validation.messagesForRow(3), [
      'Faculty "Unregistered Teacher" (Lec) is not an active Instructor or Program Head in department "BITE".',
      'Faculty "Other Department Teacher" (Lab) is not an active Instructor or Program Head in department "BITE".',
    ])
  }
})

test('faculty existence checks slash, semicolon and newline entries separately without splitting commas or N/A', () => {
  const entry = meeting(3, 2, 'Cruz, Engelbert/Unknown;Narvasa, Jan Julienne\nN/A', '', '', '')
  entry.values[14] = 'José Díaz/TBA'
  const validation = validateExcelSchedule([entry], undefined, facultyDirectory)
  assert.equal(validation.messagesForRow(3).length, 2)
  assert.ok(validation.messagesForRow(3).some(message => message.includes('"Unknown" (Lec)')))
  assert.ok(validation.messagesForRow(3).some(message => message.includes('"N/A" (Lec)')))
  assert.ok(!validation.messagesForRow(3).some(message => message.includes('"TBA" (Lab)')))
})

test('faculty existence waits for the directory, but a loaded empty directory flags nonblank names', () => {
  const entry = meeting(3, 2, 'Cruz, Engelbert', '', '', '')
  assert.deepEqual([...validateExcelSchedule([entry]).invalidFacultyRows], [])
  assert.deepEqual([...validateExcelSchedule([entry], undefined, { departmentCode: 'BITE', names: [] }).invalidFacultyRows], [3])
  const blank = meeting(4, 2, '', '', '', '')
  const unassigned = meeting(5, undefined, 'Unknown', '', '', '')
  assert.deepEqual([...validateExcelSchedule([blank, unassigned], undefined, { departmentCode: 'BITE', names: [] }).invalidFacultyRows], [])
})

test('TBA is allowed in Lec and Lab faculty and rooms even with empty directories', () => {
  for (const value of ['TBA', 'tba', ' Tba ']) {
    const entry = meeting(3, 2, value, '7:30-9:00', 'MON', value)
    entry.values[14] = value
    entry.values[20] = value
    const validation = validateExcelSchedule([entry], [], { departmentCode: 'BITE', names: [] })
    assert.deepEqual([...validation.invalidFacultyRows], [])
    assert.deepEqual([...validation.invalidRoomRows], [])
    assert.deepEqual(validation.messagesForRow(3), [])
  }
  const entry = meeting(3, 2, 'TBA/Unknown', '', '', 'TBA/Unknown')
  const validation = validateExcelSchedule([entry], [], { departmentCode: 'BITE', names: [] })
  assert.deepEqual([...validation.invalidFacultyRows], [3])
  assert.deepEqual([...validation.invalidRoomRows], [3])
  assert.equal(validation.messagesForRow(3).length, 2)
  assert.ok(validation.messagesForRow(3).every(message => message.includes('"Unknown"')))
})

test('faculty existence errors clear when the name is corrected', () => {
  const entry = meeting(3, 2, 'Unknown', '', '', '')
  assert.deepEqual([...validateExcelSchedule([entry], undefined, facultyDirectory).invalidFacultyRows], [3])
  entry.values[13] = 'Cruz, Engelbert'
  const corrected = validateExcelSchedule([entry], undefined, facultyDirectory)
  assert.deepEqual([...corrected.invalidFacultyRows], [])
  assert.deepEqual(corrected.messagesForRow(3), [])
})

test('faculty errors coexist with room, overlap and duplicate errors', () => {
  const a = meeting(3, 2, 'Unknown', '7:30-9:00', 'WED', 'Missing Room')
  const b = { ...a, row: 4, values: [...a.values] }
  const validation = validateExcelSchedule([a, b], roomDirectory, facultyDirectory)
  assert.deepEqual([...validation.invalidFacultyRows], [3, 4])
  assert.ok(validation.messagesForRow(3).some(message => message.includes('also booked')))
  assert.ok(validation.messagesForRow(3).some(message => message.includes('already has code')))
  assert.ok(validation.messagesForRow(3).some(message => message.includes('does not exist')))
  assert.ok(validation.messagesForRow(3).some(message => message.includes('not an active Instructor')))
})

test('room-existence validation matches registered code or name without case, spacing or hyphen differences', () => {
  for (const room of ['ptc 201', ' PTC-201 ', 'PTC201', 'ptc 305', 'Computer Lab', 'LECTURE ROOM 201']) {
    const entry = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', room)
    assert.deepEqual([...validateExcelSchedule([entry], roomDirectory).invalidRoomRows], [], room)
  }
})

test('unknown rooms are checked in Lec and Lab for every year, without requiring valid time or faculty', () => {
  for (const year of [1, 2, 3, 4] as const) for (const kind of ['Lec', 'Lab'] as const) {
    const entry = meeting(3, year, '', '', '', 'PTC 999', kind)
    const validation = validateExcelSchedule([entry], roomDirectory)
    assert.deepEqual([...validation.invalidRoomRows], [3])
    assert.deepEqual(validation.messagesForRow(3), [`Room "PTC 999" (${kind}) does not exist in the rooms collection.`])
  }
})

test('room validation checks each slash, semicolon and newline-separated entry and deduplicates repeated errors', () => {
  const entry = meeting(3, 2, 'Jane', '7:30-9:00', 'MON', 'PTC 201/PTC 999;PTC 305\nPTC 999')
  entry.values[20] = 'Computer Lab/ITS 999'
  const validation = validateExcelSchedule([entry], roomDirectory)
  assert.deepEqual([...validation.invalidRoomRows], [3])
  assert.deepEqual(validation.messagesForRow(3), [
    'Room "PTC 999" (Lec) does not exist in the rooms collection.',
    'Room "ITS 999" (Lab) does not exist in the rooms collection.',
  ])
})

test('room validation waits for the directory, distinguishes an empty directory, and leaves blank/unassigned rows alone', () => {
  const entry = meeting(3, 2, 'Jane', '7:30-9:00', 'MON', 'PTC 201')
  assert.deepEqual([...validateExcelSchedule([entry]).invalidRoomRows], [])
  assert.deepEqual([...validateExcelSchedule([entry], []).invalidRoomRows], [3])
  const blank = record(4, 2, '', '', '')
  blank.values[19] = ' / ; \n '
  const unassigned = meeting(5, undefined, 'Jane', '', '', 'Unknown')
  assert.deepEqual([...validateExcelSchedule([blank, unassigned], []).invalidRoomRows], [])
})

test('N/A is one room entry and TBA is allowed alongside registered rooms', () => {
  const entry = meeting(3, 2, 'Jane', '', '', 'N/A/PTC 201/TBA')
  const validation = validateExcelSchedule([entry], roomDirectory)
  assert.deepEqual(validation.messagesForRow(3), [
    'Room "N/A" (Lec) does not exist in the rooms collection.',
  ])
})

test('room errors coexist with other validations and clear after edits or changes to the room directory', () => {
  const a = meeting(3, 2, 'Jane', '7:30-9:00', 'MON', 'PTC 999')
  const b = structuredClone(a)
  b.row = 4
  const invalid = validateExcelSchedule([a, b], roomDirectory)
  assert.deepEqual([...invalid.invalidRoomRows], [3, 4])
  assert.ok(invalid.messagesForRow(3).some(message => message.includes('also booked')))
  assert.ok(invalid.messagesForRow(3).some(message => message.includes('already has code')))
  assert.ok(invalid.messagesForRow(3).some(message => message.includes('does not exist')))
  assert.deepEqual([...validateExcelSchedule([a], [...roomDirectory, { code: 'PTC 999' }]).invalidRoomRows], [])
  a.values[19] = 'PTC 305'
  assert.deepEqual([...validateExcelSchedule([a], roomDirectory).invalidRoomRows], [])
  assert.deepEqual([...validateExcelSchedule([a], roomDirectory.filter(room => room.code !== 'PTC 305')).invalidRoomRows], [3])
})

test('missing-value validation checks only Code, Descriptive Title and Section outside the paired fields', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 201')
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [])
  for (const [field, label] of [[2, 'Code'], [3, 'Descriptive Title'], [12, 'Section']] as const) {
    const entry = structuredClone(a)
    entry.values[field] = ' \t '
    const validation = validateExcelSchedule([entry])
    assert.deepEqual([...validation.missingValueRows], [3])
    assert.deepEqual(validation.missingMessagesForRow(3), [`Missing ${label}.`])
  }
  a.values[12] = '0'
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [])
})

test('Faculty, Time, Days and Room are missing only when both Lec and Lab are blank', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 201')
  for (const [field, label] of [[13, 'Faculty'], [15, 'F2F Time'], [17, 'F2F Days'], [19, 'F2F Room']] as const) {
    const entry = structuredClone(a)
    entry.values[field + 1] = entry.values[field]
    entry.values[field] = ' '
    assert.deepEqual([...validateExcelSchedule([entry]).missingValueRows], [], `${label} Lab only`)
    entry.values[field + 1] = '\t'
    const validation = validateExcelSchedule([entry])
    assert.deepEqual([...validation.missingValueRows], [3])
    assert.deepEqual(validation.missingMessagesForRow(3), [`Missing ${label} (both Lec and Lab are empty).`])
  }
})

test('paired required fields can be filled on different sides and can contain multiple values', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert/Narvasa, Jan Julienne', '10:30-12:00/1:30-3:00', 'MON/WED', 'PTC 201/PTC 305')
  for (const field of [15, 19]) { a.values[field + 1] = a.values[field]; a.values[field] = '' }
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [])
  a.values[13] = 'TBA'
  a.values[20] = 'N/A'
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [])
})

test('empty separators, year headings and unassigned rows do not get missing-value warnings', () => {
  const blank = record(3, 1, '', '', '')
  const heading = record(4, 1, '', '', '')
  heading.values[0] = '1BSIT: 2023-24 CURRICULUM'
  const mergedSeparator = record(5, 1, '', '', '')
  mergedSeparator.values[13] = 'Jane'
  mergedSeparator.values[19] = 'PTC 201'
  const unassigned = record(6, undefined, 'ITE 298', '', '')
  const validation = validateExcelSchedule([blank, heading, mergedSeparator, unassigned])
  assert.deepEqual([...validation.missingValueRows], [])
  for (const row of [3, 4, 5, 6]) assert.deepEqual(validation.missingMessagesForRow(row), [])
})

test('missing values are checked for all four years and never change the source records', () => {
  const records = [1, 2, 3, 4].map(year => record(year * 10, year as ScheduleYear, 'ITE 298', 'Information Management', '1'))
  const before = structuredClone(records)
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.missingValueRows], [10, 20, 30, 40])
  for (const entry of records) assert.deepEqual(validation.missingMessagesForRow(entry.row), [
    'Missing Faculty (both Lec and Lab are empty).',
    'Missing F2F Time (both Lec and Lab are empty).',
    'Missing F2F Days (both Lec and Lab are empty).',
    'Missing F2F Room (both Lec and Lab are empty).',
  ])
  assert.deepEqual(records, before)
})

test('missing warnings coexist with overlap and duplicate issues', () => {
  const records = [meeting(3, 1, 'Jane', '7:30-9:00', 'MON', ''), meeting(4, 1, 'Jane', '8:00-10:00', 'MON', '')]
  for (const field of [2, 3, 12]) records[1].values[field] = records[0].values[field]
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.missingValueRows], [3, 4])
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert.deepEqual([...validation.duplicateSubjectRows], [3, 4])
  assert(validation.messagesForRow(3).some(message => message.startsWith('Faculty')))
  assert(validation.messagesForRow(3).some(message => message.includes('already has code')))
  assert.deepEqual(validation.missingMessagesForRow(3), ['Missing F2F Room (both Lec and Lab are empty).'])
})

test('filling a missing field or either side of a missing pair clears its warning', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', '')
  a.values[2] = ''
  assert.deepEqual(validateExcelSchedule([a]).missingMessagesForRow(3), ['Missing Code.', 'Missing F2F Room (both Lec and Lab are empty).'])
  a.values[2] = 'ITE 298'
  assert.deepEqual(validateExcelSchedule([a]).missingMessagesForRow(3), ['Missing F2F Room (both Lec and Lab are empty).'])
  a.values[20] = 'PTC 201'
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [])
  a.values[20] = ''
  assert.deepEqual([...validateExcelSchedule([a]).missingValueRows], [3])
})

function parallelSections() {
  const records = [1, 2, 3, 4].map(section => {
    const entry = meeting(section + 2, 2, 'Jane', '7:30-9:00', 'WED', `Room ${section}`)
    entry.values[2] = 'ITE 298'
    entry.values[3] = 'Information Management'
    entry.values[12] = String(section)
    return entry
  })
  records[0].values[0] = ' parallel '
  return records
}

test('parallel sections inherit the College marker and permit one faculty in four distinct rooms', () => {
  const records = parallelSections()
  const original = structuredClone(records)
  const validation = validateExcelSchedule([...records].reverse())
  assert.equal(validation.overlapRows.size, 0)
  assert.equal(validation.duplicateSubjectRows.size, 0)
  for (const entry of records) assert.deepEqual(validation.messagesForRow(entry.row), [])
  assert.deepEqual(records, original)
  for (const entry of records) entry.values[0] = 'PARALLEL'
  assert.deepEqual(overlaps(records), [])
})

test('parallel classes still flag a room shared by two sections', () => {
  const records = parallelSections()
  records[1].values[19] = 'Room 1'
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert(validation.messagesForRow(3).every(message => message.startsWith('Room')))
  assert(validation.messagesForRow(4).every(message => message.startsWith('Room')))
})

test('a parallel group still conflicts with another subject taught by the same faculty', () => {
  const records = parallelSections()
  const other = meeting(7, 2, 'Jane', '7:30-9:00', 'WED', 'Other room')
  other.values[0] = 'PARALLEL'
  assert.deepEqual(overlaps([...records, other]), [3, 4, 5, 6, 7])
})

test('parallel inheritance stops at blank separators, other College labels, another year or another course', () => {
  for (const boundary of ['blank', 'college', 'year', 'course'] as const) {
    const records = parallelSections().slice(0, 2)
    if (boundary === 'blank') records.splice(1, 0, record(4, 2, '', '', ''))
    const last = records.at(-1)!
    if (boundary === 'blank') last.row = 5
    if (boundary === 'college') last.values[0] = 'OPEN LAB'
    if (boundary === 'year') last.year = 3
    if (boundary === 'course') { records[0].values[4] = 'BSIT'; last.values[4] = 'BSA' }
    assert.deepEqual(overlaps(records), [3, last.row], boundary)
  }
})

test('parallel does not excuse partial time/day matches, the same section or different meeting types', () => {
  for (const mismatch of ['time', 'days', 'section', 'kind'] as const) {
    const records = parallelSections().slice(0, 2)
    const last = records[1]
    if (mismatch === 'time') last.values[15] = '8:00-9:30'
    if (mismatch === 'days') last.values[17] = 'WED/FRI'
    if (mismatch === 'section') last.values[12] = '1'
    if (mismatch === 'kind') for (const field of [13, 15, 17, 19]) { last.values[field + 1] = last.values[field]; last.values[field] = '' }
    assert.deepEqual(overlaps(records), [3, 4], mismatch)
  }
})

test('editing the parallel label updates overlap results', () => {
  const records = parallelSections()
  assert.deepEqual(overlaps(records), [])
  records[0].values[0] = 'CITE'
  assert.deepEqual(overlaps(records), [3, 4, 5, 6])
  records[0].values[0] = 'PARALLEL'
  assert.deepEqual(overlaps(records), [])
})

test('a changed time ends parallel inheritance even when later rows return to the original time', () => {
  const records = parallelSections().slice(0, 3)
  records[1].values[15] = '9:00-10:30'
  assert.deepEqual(overlaps(records), [3, 5])
})

test('a fresh PARALLEL marker starts a group at a new time', () => {
  const records = parallelSections()
  records[2].values[0] = 'PARALLEL'
  records[2].values[15] = records[3].values[15] = '9:00-10:30'
  assert.deepEqual(overlaps(records), [])
  records[2].values[0] = ''
  assert.deepEqual(overlaps(records), [5, 6])
})

test('parallel time continuation compares normalized times and both Lec and Lab fields', () => {
  const records = parallelSections()
  records[1].values[15] = '7:30 AM to 9:00 AM'
  assert.deepEqual(overlaps(records), [])
  records[1].values[16] = '1:30-3:00'
  assert.deepEqual(overlaps(records), [3, 4, 5, 6])
})

test('a missing or invalid time ends parallel inheritance', () => {
  for (const time of ['', 'TBA', 'invalid']) {
    const records = parallelSections().slice(0, 3)
    records[1].values[15] = time
    assert.deepEqual(overlaps(records), [3, 5], time)
  }
})

test('parses imported daytime ranges, 24-hour ranges, AM/PM and noon crossings', () => {
  const minutes = (hour: number, minute = 0) => hour * 60 + minute
  for (const [text, start, end] of [
    ['7:30-9:00', minutes(7, 30), minutes(9)],
    ['1:30-3:00', minutes(13, 30), minutes(15)],
    ['11:30–1:00', minutes(11, 30), minutes(13)],
    ['4:30-7:30', minutes(16, 30), minutes(19, 30)],
    ['13:30-15:00', minutes(13, 30), minutes(15)],
    ['7:30 PM - 9:00', minutes(19, 30), minutes(21)],
    ['7:30 to 9:00 p.m.', minutes(19, 30), minutes(21)],
    ['11:30 AM—1:00 PM', minutes(11, 30), minutes(13)],
    ['00:30-01:00', minutes(0, 30), minutes(1)],
  ] as const) assert.deepEqual(parseExcelScheduleTime(text), { start, end }, text)
  for (const text of ['', 'TBA', '7:99-9:00', '25:00-26:00', '7:00-7:00', '9 AM-8 AM', 'garbage', '7:30']) assert.equal(parseExcelScheduleTime(text), null, text)
})

test('normalizes day lists, abbreviations and repeated days without accepting unknown text', () => {
  assert.deepEqual(parseExcelScheduleDays('THU/FRI'), ['Thu', 'Fri'])
  assert.deepEqual(parseExcelScheduleDays('Monday and Thursday'), ['Mon', 'Thu'])
  assert.deepEqual(parseExcelScheduleDays('MWF'), ['Mon', 'Wed', 'Fri'])
  assert.deepEqual(parseExcelScheduleDays('TTH'), ['Tue', 'Thu'])
  assert.deepEqual(parseExcelScheduleDays('SAT/SAT'), ['Sat'])
  assert.deepEqual(parseExcelScheduleDays('Sun, Tuesday; Wed & Fri'), ['Tue', 'Wed', 'Fri', 'Sun'])
  assert.deepEqual(parseExcelScheduleDays('TBA'), [])
  assert.deepEqual(parseExcelScheduleDays('MON / UNKNOWN'), [])
})

test('flags the screenshot example with two Saturday times on all four sections', () => {
  const records = [5, 6, 7, 8].map(section => {
    const entry = meeting(section, 3, 'CALPOTURA, KRIS', '10:30-12:00/1:30-3:00', 'SAT/SAT', '')
    entry.values[2] = 'ITE 353'
    entry.values[3] = 'Data Scalability and Analytics'
    return entry
  })
  const before = structuredClone(records)
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.overlapRows], [5, 6, 7, 8])
  assert(validation.messagesForRow(5).some(message => message.includes('Sat (10:30-12:00)')))
  assert(validation.messagesForRow(5).some(message => message.includes('Sat (1:30-3:00)')))
  assert.deepEqual(records, before)
})

test('checks both time ranges without treating the gap between them as a meeting', () => {
  const a = meeting(3, 1, 'Jane', '10:30-12:00/1:30-3:00', 'SAT/SAT', 'Room 1')
  for (const [time, expected] of [
    ['11:00-11:30', [3, 4]], ['2:00-2:30', [3, 4]], ['12:00-1:30', []], ['3:00-4:00', []],
  ] as const) assert.deepEqual(overlaps([a, meeting(4, 4, 'Jane', time, 'SAT', 'Room 2')]), expected, time)
})

test('pairs multiple time ranges with the corresponding days rather than combining all days', () => {
  const a = meeting(3, 1, 'Jane', '10:30-12:00/1:30-3:00', 'MON/WED', 'Room 1')
  for (const [time, days, expected] of [
    ['11:00-11:30', 'MON', [3, 4]], ['11:00-11:30', 'WED', []],
    ['2:00-2:30', 'WED', [3, 4]], ['2:00-2:30', 'MON', []],
  ] as const) assert.deepEqual(overlaps([a, meeting(4, 2, 'Jane', time, days, 'Room 2')]), expected, `${time} ${days}`)
  a.values[17] = 'MON/WED/FRI'
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Jane', '2:00-2:30', 'FRI', 'Room 2')]), [3, 4])
})

test('a single day or shared day list applies to each time range', () => {
  for (const dayText of ['SAT', 'SAT/SAT', 'Mon and Saturday']) {
    const a = meeting(3, 1, 'Jane', '10:30-12:00/1:30-3:00', dayText, 'Room 1')
    assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '2:00-2:30', 'SAT', 'Room 2')]), [3, 4], dayText)
  }
})

test('checks multiple Lab times for room conflicts across years and supports line and semicolon separators', () => {
  for (const separator of ['/', ';', '\n']) {
    const a = meeting(3, 1, 'Jane', `10:30-12:00${separator}1:30-3:00`, `MON${separator}WED`, 'PTC 306', 'Lab')
    const b = meeting(4, 4, 'Other faculty', '2:00-2:30', 'WED', 'ptc306')
    const validation = validateExcelSchedule([a, b])
    assert.deepEqual([...validation.overlapRows], [3, 4])
    assert(validation.messagesForRow(4).every(message => message.startsWith('Room') && message.includes('(Lab) on Wed (1:30-3:00)')))
  }
})

test('a malformed time segment does not discard valid segments or shift their day assignments', () => {
  const a = meeting(3, 1, 'Jane', 'TBA/1:30-3:00', 'MON/WED', 'Room 1')
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '2:00-2:30', 'WED', 'Room 2')]), [3, 4])
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '2:00-2:30', 'MON', 'Room 2')]), [])
  a.values[15] = '10:30-12:00/invalid'
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '11:00-11:30', 'MON', 'Room 2')]), [3, 4])
})

test('parallel groups compare every time range and still detect room conflicts', () => {
  const records = parallelSections()
  for (const entry of records) { entry.values[15] = '10:30-12:00/1:30-3:00'; entry.values[17] = 'SAT/SAT' }
  records[1].values[15] = '10:30 AM-12:00 PM/13:30-15:00'
  assert.deepEqual(overlaps(records), [])
  records[1].values[19] = 'Room 1'
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert(validation.messagesForRow(3).every(message => message.startsWith('Room')))
  records[1].values[19] = 'Room 2'
  records[1].values[15] = '10:30-12:00/3:00-4:30'
  assert.deepEqual(overlaps(records), [3, 4, 5, 6])
})

test('correcting the second time range clears its overlap and preserves errors from the first range', () => {
  const records = [meeting(3, 1, 'Jane', '10:30-12:00/1:30-3:00', 'SAT/SAT', 'Room 1'), meeting(4, 2, 'Jane', '2:00-2:30', 'SAT', 'Room 2')]
  assert.deepEqual(overlaps(records), [3, 4])
  records[0].values[15] = '10:30-12:00/3:00-4:30'
  assert.deepEqual(overlaps(records), [])
  records[1].values[15] = '11:00-11:30'
  assert.deepEqual(overlaps(records), [3, 4])
})

test('pairs multiple faculty and rooms with their corresponding time and day without mixing assignments', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert/Narvasa, Jan Julienne', '10:30-12:00/1:30-3:00', 'MON/WED', 'PTC 201/PTC 305')
  const before = structuredClone(a)
  for (const [time, day, faculty, room, conflict] of [
    ['11:00-11:30', 'MON', 'Cruz, Engelbert', 'Other room', true],
    ['11:00-11:30', 'MON', 'Other faculty', 'PTC 201', true],
    ['2:00-2:30', 'WED', 'Narvasa, Jan Julienne', 'Other room', true],
    ['2:00-2:30', 'WED', 'Other faculty', 'PTC 305', true],
    ['11:00-11:30', 'MON', 'Narvasa, Jan Julienne', 'Other room', false],
    ['11:00-11:30', 'MON', 'Other faculty', 'PTC 305', false],
    ['2:00-2:30', 'WED', 'Cruz, Engelbert', 'Other room', false],
    ['2:00-2:30', 'WED', 'Other faculty', 'PTC 201', false],
    ['11:00-11:30', 'WED', 'Cruz, Engelbert', 'PTC 201', false],
    ['2:00-2:30', 'MON', 'Narvasa, Jan Julienne', 'PTC 305', false],
  ] as const) assert.deepEqual(overlaps([a, meeting(4, 4, faculty, time, day, room)]), conflict ? [3, 4] : [], `${faculty} ${room} ${time} ${day}`)
  assert.deepEqual(a, before)
})

test('one time and two days pair with two rooms while sharing a single faculty', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert', '7:30-9:00', 'MON/WED', 'PTC 201/PTC 305')
  for (const [day, room, conflict] of [
    ['MON', 'PTC 201', true], ['MON', 'PTC 305', false], ['WED', 'PTC 305', true], ['WED', 'PTC 201', false],
  ] as const) assert.deepEqual(overlaps([a, meeting(4, 2, 'Other faculty', '8:00-8:30', day, room)]), conflict ? [3, 4] : [])
  for (const day of ['MON', 'WED']) assert.deepEqual(overlaps([a, meeting(4, 2, 'Cruz, Engelbert', '8:00-8:30', day, 'Other room')]), [3, 4])
})

test('one time and two days pair with two faculty while sharing a single room', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert/Narvasa, Jan Julienne', '7:30-9:00', 'MON/WED', 'PTC 201')
  for (const [day, faculty, conflict] of [
    ['MON', 'Cruz, Engelbert', true], ['MON', 'Narvasa, Jan Julienne', false],
    ['WED', 'Narvasa, Jan Julienne', true], ['WED', 'Cruz, Engelbert', false],
  ] as const) assert.deepEqual(overlaps([a, meeting(4, 2, faculty, '8:00-8:30', day, 'Other room')]), conflict ? [3, 4] : [])
  for (const day of ['MON', 'WED']) assert.deepEqual(overlaps([a, meeting(4, 2, 'Other faculty', '8:00-8:30', day, 'PTC 201')]), [3, 4])
})

test('single resources apply to both time ranges even when the other resource has multiple values', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert', '10:30-12:00/1:30-3:00', 'MON/WED', 'PTC 201/PTC 305')
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Cruz, Engelbert', '2:00-2:30', 'WED', 'Other room')]), [3, 4])
  a.values[13] = 'Cruz, Engelbert/Narvasa, Jan Julienne'
  a.values[19] = 'PTC 201'
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Other faculty', '2:00-2:30', 'WED', 'PTC 201')]), [3, 4])
})

test('a single time and day apply to each faculty and room assignment', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert/Narvasa, Jan Julienne', '7:30-9:00', 'WED', 'PTC 201/PTC 305')
  const b = meeting(4, 2, 'Cruz, Engelbert', '8:00-8:30', 'WED', 'PTC 305')
  const validation = validateExcelSchedule([a, b])
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert.equal(validation.messagesForRow(4).length, 2)
  assert(validation.messagesForRow(4).some(message => message.startsWith('Faculty "Cruz, Engelbert"')))
  assert(validation.messagesForRow(4).some(message => message.startsWith('Room "PTC 305"')))
})

test('keeps N/A and other placeholders from shifting faculty or room positions', () => {
  const a = meeting(3, 1, 'TBA/Narvasa, Jan Julienne', '10:30-12:00/1:30-3:00', 'MON/WED', 'N / A/PTC 305')
  for (const resource of ['N', 'A', 'NA', 'N/A']) assert.deepEqual(overlaps([a, meeting(4, 2, 'TBA', '11:00-11:30', 'MON', resource)]), [])
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Narvasa, Jan Julienne', '2:00-2:30', 'WED', 'Other room')]), [3, 4])
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Other faculty', '2:00-2:30', 'WED', 'ptc305')]), [3, 4])
  a.values[13] = 'N/A/Narvasa, Jan Julienne'
  a.values[19] = 'ONLINE/PTC 305'
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Narvasa, Jan Julienne', '11:00-11:30', 'MON', 'ONLINE')]), [])
})

test('normalizes split resources, preserves surname commas and reports the specific conflicting assignment', () => {
  for (const separator of ['/', ';', '\n']) {
    const a = meeting(3, 1, `Cruz, Engelbert${separator}Narvasa, Jan Julienne`, `10:30-12:00${separator}1:30-3:00`, `MON${separator}WED`, `PTC 201${separator}PTC 305`, 'Lab')
    const b = meeting(4, 4, ' narvasa ,  jan julienne ', '14:00-14:30', 'Wednesday', 'ptc305')
    const validation = validateExcelSchedule([a, b])
    assert.deepEqual([...validation.overlapRows], [3, 4])
    assert.equal(validation.messagesForRow(3).length, 2)
    assert(validation.messagesForRow(3).some(message => message.startsWith('Faculty "Narvasa, Jan Julienne" (Lab)')))
    assert(validation.messagesForRow(3).some(message => message.startsWith('Room "PTC 305" (Lab)')))
    assert(validation.messagesForRow(4).every(message => message.includes('(Lab) on Wed (1:30-3:00)')))
  }
})

test('parallel groups still permit matching split faculty and flag split room conflicts', () => {
  const records = parallelSections()
  for (const entry of records) {
    entry.values[13] = 'Cruz, Engelbert/Narvasa, Jan Julienne'
    entry.values[15] = '10:30-12:00/1:30-3:00'
    entry.values[17] = 'MON/WED'
    entry.values[19] = `Room ${entry.row}A/Room ${entry.row}B`
  }
  assert.deepEqual(overlaps(records), [])
  records[1].values[19] = 'Room 4A/Room 3B'
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert.equal(validation.messagesForRow(3).length, 1)
  assert(validation.messagesForRow(3)[0].startsWith('Room "Room 3B"'))
  assert.deepEqual(overlaps([...records, meeting(7, 3, 'Narvasa, Jan Julienne', '2:00-2:30', 'WED', 'Other room')]), [3, 4, 5, 6, 7])
})

test('resource edits recalculate split assignment conflicts', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert/Narvasa, Jan Julienne', '10:30-12:00/1:30-3:00', 'MON/WED', 'PTC 201/PTC 305')
  const b = meeting(4, 2, 'Narvasa, Jan Julienne', '2:00-2:30', 'WED', 'PTC 305')
  assert.equal(validateExcelSchedule([a, b]).messagesForRow(3).length, 2)
  a.values[13] = 'Cruz, Engelbert/Other faculty'
  assert.equal(validateExcelSchedule([a, b]).messagesForRow(3).length, 1)
  a.values[19] = 'PTC 201/Other room'
  assert.deepEqual(overlaps([a, b]), [])
})

test('invalid time segments and empty resource entries retain the other assignments positions', () => {
  const a = meeting(3, 1, '/Narvasa, Jan Julienne', 'TBA/1:30-3:00', 'MON/WED', '/PTC 305')
  const validation = validateExcelSchedule([a, meeting(4, 2, 'Narvasa, Jan Julienne', '2:00-2:30', 'WED', 'PTC 305')])
  assert.deepEqual([...validation.overlapRows], [3, 4])
  assert.equal(validation.messagesForRow(3).length, 2)
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Narvasa, Jan Julienne', '11:00-11:30', 'MON', 'PTC 305')]), [])
})

test('blank entries between separators do not shift later faculty and rooms into an earlier meeting', () => {
  const a = meeting(3, 1, 'Cruz, Engelbert//Narvasa, Jan Julienne', '7:30-9:00/10:30-12:00/1:30-3:00', 'MON/WED/FRI', 'PTC 201//PTC 305')
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Narvasa, Jan Julienne', '11:00-11:30', 'WED', 'PTC 305')]), [])
  assert.deepEqual(overlaps([a, meeting(4, 2, 'Narvasa, Jan Julienne', '2:00-2:30', 'FRI', 'PTC 305')]), [3, 4])
})

test('detects faculty and room overlap across different years and Lec/Lab entries', () => {
  const records = [meeting(10, 1, 'Smith, Jane', '1:30-3:00', 'THU/FRI', 'PTC 306'), meeting(20, 4, ' smith,  jane ', '14:00-16:00', 'Friday', 'ptc306', 'Lab')]
  const before = structuredClone(records)
  const validation = validateExcelSchedule(records)
  assert.deepEqual([...validation.overlapRows], [10, 20])
  assert.deepEqual(validation.messagesForRow(10), [
    'Faculty "Smith, Jane" (Lec) is also assigned on Row #21 (Lab) on Fri (14:00-16:00).',
    'Room "PTC 306" (Lec) is also booked on Row #21 (Lab) on Fri (14:00-16:00).',
  ])
  assert.match(validation.messagesForRow(20)[0], /Row #11 \(Lec\).*Fri/)
  assert.deepEqual(records, before)
})

test('faculty conflicts do not require the same room and room conflicts do not require the same faculty', () => {
  const a = meeting(3, 2, 'Jane', '7:30-9:00', 'MON', 'PTC 306')
  const b = meeting(4, 2, 'Jane', '8:00-10:00', 'M', 'ITS 201')
  const c = meeting(5, 2, 'Other faculty', '8:00-10:00', 'M', 'PTC 306')
  const validation = validateExcelSchedule([a, b, c])
  assert.deepEqual([...validation.overlapRows].sort(), [3, 4, 5])
  assert(validation.messagesForRow(4).every(message => message.startsWith('Faculty')))
  assert(validation.messagesForRow(5).every(message => message.startsWith('Room')))
})

test('different days, adjacent times and AM versus PM do not overlap', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 306')
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '7:30-9:00', 'TUE', 'PTC 306')]), [])
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '9:00-10:30', 'MON', 'PTC 306')]), [])
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Jane', '7:30PM-9:00PM', 'MON', 'PTC 306')]), [])
  assert.deepEqual(overlaps([a, meeting(4, 1, 'Other', '7:30-9:00', 'MON', 'ITS 201')]), [])
})

test('skips incomplete meetings, placeholders, unassigned years and self comparisons', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 306')
  for (const b of [
    meeting(4, 1, 'Jane', '', 'MON', 'PTC 306'),
    meeting(4, 1, 'Jane', 'TBA', 'MON', 'PTC 306'),
    meeting(4, 1, 'Jane', '7:30-9:00', '', 'PTC 306'),
    meeting(4, undefined, 'Jane', '7:30-9:00', 'MON', 'PTC 306'),
  ]) assert.deepEqual(overlaps([a, b]), [])
  assert.deepEqual(overlaps([meeting(3, 1, 'TBA', '7:30-9:00', 'MON', 'ONLINE'), meeting(4, 1, 'TBA', '7:30-9:00', 'MON', 'ONLINE')]), [])
  const lab = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 306', 'Lab')
  for (const field of [14, 16, 18, 20]) a.values[field] = lab.values[field]
  assert.deepEqual(overlaps([a]), [])
})

test('still validates meetings without subject details and does not group them as parallel', () => {
  const records = [meeting(3, 1, 'Jane', '7:30-9:00', 'WED', 'Room 1'), meeting(4, 1, 'Jane', '7:30-9:00', 'WED', 'Room 2')]
  for (const entry of records) {
    entry.values[2] = ''
    entry.values[3] = ''
    entry.values[0] = 'PARALLEL'
  }
  assert.deepEqual(overlaps(records), [3, 4])
})

test('overlap messages coexist with code-first duplicate messages and clear after corrections', () => {
  const a = meeting(3, 1, 'Jane', '7:30-9:00', 'MON', 'PTC 306')
  const b = meeting(4, 1, 'Jane', '8:00-10:00', 'MON', 'PTC 306')
  for (const field of [2, 3, 12]) b.values[field] = a.values[field]
  const validation = validateExcelSchedule([a, b])
  assert.equal(validation.messagesForRow(3).length, 3)
  assert(validation.messagesForRow(3).some(message => message.includes('already has code')))
  assert(validation.messagesForRow(3).every(message => !message.includes('descriptive title')))
  b.values[15] = '9:00-10:00'
  const corrected = validateExcelSchedule([a, b])
  assert.equal(corrected.overlapRows.size, 0)
  assert.equal(corrected.duplicateSubjectRows.size, 2)
  assert.equal(corrected.messagesForRow(3).length, 1)
})

test('tooltip messages identify the repeated field, section and other worksheet rows', () => {
  const validation = validateExcelSchedule([
    record(3, 2, 'ITE 298', 'Information Management', '1'),
    record(4, 2, ' ite 298 ', 'Different title', ' 1 '),
    record(6, 2, 'ITE 298', '', '1'),
    record(8, 2, 'OTHER', ' information management ', '1'),
    record(9, 3, 'ITE 298', 'Information Management', '1'),
  ])
  assert.deepEqual(validation.messagesForRow(3), [
    'Section "1" already has code "ITE 298" on Rows #5, #7.',
  ])
  assert.deepEqual(validation.messagesForRow(8), ['Section "1" already has descriptive title "Information Management" on Row #4.'])
  assert.deepEqual(validation.messagesForRow(4), ['Section "1" already has code "ITE 298" on Rows #4, #7.'])
  assert.deepEqual(validation.messagesForRow(9), [])
})

test('code errors take priority over title errors and title errors return after the code is corrected', () => {
  const records = [record(19, 2, 'ITE 298', 'Information Management', '1'), record(20, 2, 'ITE 298', 'Information Management', '1')]
  const validation = validateExcelSchedule(records)
  assert.deepEqual(validation.messagesForRow(19), ['Section "1" already has code "ITE 298" on Row #21.'])
  assert.deepEqual(validation.messagesForRow(20), ['Section "1" already has code "ITE 298" on Row #20.'])
  records[1].values[2] = 'ITE 299'
  const corrected = validateExcelSchedule(records)
  assert.deepEqual(corrected.messagesForRow(19), ['Section "1" already has descriptive title "Information Management" on Row #21.'])
  assert.deepEqual([...corrected.duplicateSubjectRows], [19, 20])
})

test('flags both rows when either code or title repeats within the same section', () => {
  assert.deepEqual(duplicates([
    record(3, 2, 'ITE 298', 'Information Management', '1'),
    record(4, 2, ' ite 298 ', 'Different title', ' 1 '),
    record(5, 2, 'OTHER', ' information management ', '1'),
    record(6, 2, 'UNIQUE', 'Other subject', '1'),
  ]), [3, 4, 5])
})

test('checks each of the four years independently and requires the same section', () => {
  const records: ScheduleRecord[] = []
  for (const year of [1, 2, 3, 4] as const) {
    records.push(record(year * 10, year, 'ITE 298', 'Information Management', '1'))
    records.push(record(year * 10 + 1, year, 'ITE 298', 'Information Management', '2'))
  }
  assert.deepEqual(duplicates(records), [])
  for (const year of [1, 2, 3, 4] as const) records.push(record(year * 10 + 2, year, 'ITE 298', 'Information Management', '1'))
  assert.deepEqual(duplicates(records), [10, 12, 20, 22, 30, 32, 40, 42])
})

test('blank sections, blank subjects, headings and unassigned rows are ignored', () => {
  assert.deepEqual(duplicates([
    record(2, 1, '', '', '1'), record(3, 1, ' ', ' ', '1'),
    record(4, 1, 'ITE 298', 'Information Management', ''),
    record(5, 1, 'ITE 298', 'Information Management', ' '),
    record(6, undefined, 'ITE 298', 'Information Management', '1'),
    record(7, 1, 'ITE 298', 'Information Management', '1'),
  ]), [])
})

test('matches a populated code or title even if the other field is blank', () => {
  assert.deepEqual(duplicates([
    record(2, 1, 'ITE 298', '', 'BSIT 1-1'),
    record(3, 1, 'ite 298', 'Information Management', 'bsit 1-1'),
    record(4, 1, '', 'Other subject', '1'),
    record(5, 1, 'OTHER', 'OTHER SUBJECT', '1'),
  ]), [2, 3, 4, 5])
})

test('all members of a duplicate group are highlighted without mutating the records', () => {
  const records = [2, 3, 4].map(row => record(row, 4, 'ITE 298', 'Information Management', '1'))
  const original = structuredClone(records)
  assert.deepEqual(duplicates(records), [2, 3, 4])
  assert.deepEqual(records, original)
  assert.deepEqual(duplicates([records[0], records[0]]), [])
})

test('uses template column mapping and recalculates after corrections and year changes', () => {
  const columns = Array.from({ length: 21 }, (_, index) => index + 3)
  const setup: ScheduleSetup = { header: scheduleHeaderAt({ r: 4, c: 3 }), columns, years: new Map([[8, 3], [9, 3]]), includesEmptyRows: true }
  const cells = new Map<string, string>()
  for (const row of [8, 9]) for (const [field, value] of [[2, 'ITE 298'], [3, 'Information Management'], [12, '1']] as const) cells.set(`${row}:${columns[field]}`, value)
  const read = (row: number, column: number) => cells.get(`${row}:${column}`) ?? ''
  const check = () => duplicates(readAssignedScheduleRecords(setup, read))
  assert.deepEqual(check(), [8, 9])
  cells.set(`9:${columns[12]}`, '2')
  assert.deepEqual(check(), [])
  cells.set(`9:${columns[12]}`, '1')
  assert.deepEqual(check(), [8, 9])
  setup.years = new Map([[8, 3], [9, 4]])
  assert.deepEqual(check(), [])
})
