import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previousScheduleTerm } from '../src/utils/roomSchedule.ts'

test('second semester falls back to first semester of the same school year', () => {
  assert.deepEqual(previousScheduleTerm('2026 - 2027', '2nd Semester'), { academicYear: '2026 - 2027', semester: 'sem1' })
})

test('first semester falls back to second semester of the prior school year', () => {
  assert.deepEqual(previousScheduleTerm('2026 - 2027', 'sem1'), { academicYear: '2025 - 2026', semester: 'sem2' })
})
