import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankScheduleCourses, resolveScheduleCourse, scheduleCourseYear, type DepartmentCourseSuggestion } from '../src/utils/departmentCourseSuggestions.ts'

const course = (code: string, title: string, yearLevel: number, sourceCell = code): DepartmentCourseSuggestion =>
  ({ code, title, yearLevel, sourceCell, semester: 1, type: 'Lecture', credits: 3, session: '' })
const courses = [course('GEN 001', 'Understanding the Self', 1), course('ITE 398', 'Capstone Project', 4),
  course('ITE 101', 'Computing', 2), course('ITE 398', 'Capstone Project', 3, 'other-semester')]

test('suggestions rank the row year first without removing other department courses', () => {
  const ranked = rankScheduleCourses(courses, '', 4)
  assert.equal(ranked[0].code, 'ITE 398')
  assert.equal(ranked[0].yearLevel, 4)
  assert.deepEqual(new Set(ranked.map(item => item.code)), new Set(['GEN 001', 'ITE 398', 'ITE 101']))
  assert.equal(courses[0].code, 'GEN 001')
})

test('code and title searches use the same directory and remove duplicate choices', () => {
  assert.deepEqual(rankScheduleCourses(courses, 'ite398', 4).map(item => item.title), ['Capstone Project'])
  assert.deepEqual(rankScheduleCourses(courses, 'capstone', 4).map(item => item.code), ['ITE 398'])
})

test('typing either an exact code or title resolves both matching fields', () => {
  for (const [text, column] of [['ite398', 2], ['capstone project', 3], ['capst', 3]] as const) {
    const resolved = resolveScheduleCourse(courses, text, column, 4)!
    assert.equal(resolved.code, 'ITE 398')
    assert.equal(resolved.title, 'Capstone Project')
    assert.equal(resolved.yearLevel, 4)
  }
})

test('exact entries take priority over partial matches and ambiguous entries are not guessed', () => {
  const entries = [course('ITE 398', 'Capstone Project', 4), course('ITE 398A', 'Capstone Extension', 4)]
  assert.equal(resolveScheduleCourse(entries, 'ite398', 2, 4)?.code, 'ITE 398')
  assert.equal(resolveScheduleCourse(entries, 'ite', 2, 4), undefined)
  assert.equal(resolveScheduleCourse(entries, '', 2, 4), undefined)
  assert.equal(resolveScheduleCourse(entries, 'unknown', 3, 4), undefined)
})

test('year priority follows curriculum headings, renamed labels, and source labels', () => {
  assert.equal(scheduleCourseYear('2BSIT: 2023-24 CURRICULUM', undefined, 0), 2)
  assert.equal(scheduleCourseYear('4th Year', undefined, 0), 4)
  assert.equal(scheduleCourseYear('Custom label', '3BSIT: CURRICULUM', 0), 3)
  assert.equal(scheduleCourseYear('Custom label', undefined, 1), 2)
})
