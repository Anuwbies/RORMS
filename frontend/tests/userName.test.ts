import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatUserName, titleCaseName, userNameFields } from '../src/utils/userName.ts'
import { departmentFacultyNames } from '../src/utils/excelFacultySuggestions.ts'
import { excelScheduleFacultyKeys } from '../src/utils/excelScheduleValidation.ts'

test('title-cases typed and pasted name words while preserving spaces, hyphens, apostrophes and accents', () => {
  for (const input of ['allen francis', 'ALLEN FRANCIS', 'aLlEn fRaNcIs']) assert.equal(titleCaseName(input), 'Allen Francis')
  assert.equal(titleCaseName('RODAS'), 'Rodas')
  assert.equal(titleCaseName("  JEAN-LUC O’NEILL D'ANGELO JOSÉ  "), "  Jean-Luc O’Neill D'Angelo José  ")
  assert.equal(titleCaseName('Jose\u0301'), 'Jose\u0301')
  assert.equal(titleCaseName(''), '')
  assert.equal(titleCaseName('Allen Francis'), 'Allen Francis')
})

test('signup name fields and combined name retain title case when saved and displayed', () => {
  const fields = userNameFields({ firstName: titleCaseName('  aLLEN fRANCIS '), surname: titleCaseName(' RODAS  ') })
  assert.deepEqual(fields, { firstName: 'Allen Francis', surname: 'Rodas', fullName: 'Allen Francis Rodas' })
  assert.equal(formatUserName(fields), 'Rodas, Allen Francis')
})

test('keeps given names and compound surnames intact while formatting surname first', () => {
  const names = userNameFields({ firstName: '  Allen Francis  ', surname: '  De la Cruz  ' })
  assert.deepEqual(names, { firstName: 'Allen Francis', surname: 'De la Cruz', fullName: 'Allen Francis De la Cruz' })
  assert.equal(formatUserName(names), 'De la Cruz, Allen Francis')
  assert.equal(userNameFields(names).fullName, 'Allen Francis De la Cruz')
})

test('legacy and partial profiles retain fullName without guessing name parts', () => {
  const legacy = { fullName: 'Allen Francis De la Cruz' }
  assert.deepEqual(userNameFields(legacy), { firstName: '', surname: '', fullName: legacy.fullName })
  assert.equal(formatUserName({ firstName: 'Allen Francis', ...legacy }), legacy.fullName)
  assert.equal(formatUserName({ surname: 'De la Cruz', ...legacy }), legacy.fullName)
  assert.equal(formatUserName(null, undefined, { fullName: 123 }), '')
})

test('prefers complete profile fields and falls back to complete membership fields', () => {
  const member = { firstName: 'Jan Julienne', surname: 'Narvasa', fullName: 'Old Name' }
  assert.equal(formatUserName({ fullName: 'Stale Name' }, member), 'Narvasa, Jan Julienne')
  assert.equal(formatUserName({ firstName: 'Joy Chrisky', surname: 'Lobendino' }, member), 'Lobendino, Joy Chrisky')
})

test('faculty suggestions format structured names and preserve matching to existing natural-order entries', () => {
  const members = [{ userId: 'faculty', role: 'Instructor', status: 'accepted', department: 'BITE', fullName: 'Old Name' }]
  const users = new Map([['faculty', { firstName: 'Allen Francis', surname: 'De la Cruz', fullName: 'Allen Francis De la Cruz' }]])
  const names = departmentFacultyNames(members, users, 'BITE')
  assert.deepEqual(names, ['De la Cruz, Allen Francis'])
  assert.ok(excelScheduleFacultyKeys('Allen Francis De la Cruz').some(key => excelScheduleFacultyKeys(names[0]).includes(key)))
})
