import assert from 'node:assert/strict'
import { test } from 'node:test'
import { departmentFacultyNames, facultyFragment, filterFacultyNames } from '../src/utils/excelFacultySuggestions.ts'
import { replaceFontRuns } from '../src/utils/excelFontRuns.ts'

test('department suggestions use current profile names and exclude other departments, inactive and unaccepted instructors', () => {
  const member = { department: 'BITE', status: 'accepted', role: 'Instructor', fullName: 'Old Name' }
  const members = [
    { ...member, userId: 'cruz' }, { ...member, userId: 'cruz' },
    { ...member, userId: 'inactive' }, { ...member, department: 'CAS', fullName: 'Other Department' },
    { ...member, status: 'pending', fullName: 'Pending Instructor' },
    { ...member, status: 'declined', fullName: 'Declined Instructor' },
    { ...member, role: 'Registrar', fullName: 'Registrar' },
    { ...member, role: 'Dean', fullName: 'Dean' },
    { ...member, role: 'Program Head', fullName: 'Jan Julienne Narvasa' },
  ]
  const users = new Map<string, Record<string, unknown>>([
    ['cruz', { fullName: 'Engelbert Cruz', isActive: true }],
    ['inactive', { fullName: 'Inactive Instructor', isActive: false }],
  ])
  assert.deepEqual(departmentFacultyNames(members, users, 'BITE'), ['Engelbert Cruz', 'Jan Julienne Narvasa'])
})

test('filtering supports partial names, commas, accents and either name order', () => {
  const names = ['Engelbert Cruz', 'Jan Julienne Narvasa', 'José Díaz']
  assert.deepEqual(filterFacultyNames(names, 'CRUZ, eng'), ['Engelbert Cruz'])
  assert.deepEqual(filterFacultyNames(names, 'nar jan'), ['Jan Julienne Narvasa'])
  assert.deepEqual(filterFacultyNames(names, 'jose dia'), ['José Díaz'])
  assert.deepEqual(filterFacultyNames(names, ''), names)
  assert.deepEqual(filterFacultyNames(names, 'unknown'), [])
})

test('selecting a second faculty preserves the first name and its font', () => {
  const text = 'Cruz, Engelbert / Nar'
  const part = facultyFragment(text, text.length)
  assert.equal(part.query, 'Nar')
  const runs = replaceFontRuns([{ text: 'Cruz, Engelbert / ', fontFamily: 'Arial' }, { text: 'Nar', fontFamily: 'Calibri' }], part.start, part.end, [{ text: 'Narvasa, Jan Julienne', fontFamily: 'Calibri' }])
  assert.equal(runs.map(run => run.text).join(''), 'Cruz, Engelbert / Narvasa, Jan Julienne')
  assert.equal(runs[0].fontFamily, 'Arial')
  assert.equal(runs[1].fontFamily, 'Calibri')
})

test('editing a name in the middle replaces that entry and retains later faculty', () => {
  const text = 'Cruz, Engelbert/Narvasa, Jan Julienne'
  const part = facultyFragment(text, 4)
  assert.equal(part.query, 'Cruz')
  assert.equal(text.slice(0, part.start) + 'Lobendino, Joy Chrisky' + text.slice(part.end), 'Lobendino, Joy Chrisky/Narvasa, Jan Julienne')
})

test('new entries after slash, semicolon or newline keep separators and previous faculty', () => {
  for (const separator of ['/', ';', '\n']) {
    const text = `Cruz, Engelbert${separator}`
    const part = facultyFragment(text, text.length)
    assert.equal(part.query, '')
    assert.equal(text.slice(0, part.start) + 'Narvasa, Jan Julienne' + text.slice(part.end), `${text}Narvasa, Jan Julienne`)
  }
})
