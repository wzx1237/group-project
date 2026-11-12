import { describe, expect, it } from 'vitest'
import { firstUngradedIndex } from './pickStudent'

const student = (uid, graded) => ({ uid, progress: { graded } })

describe('firstUngradedIndex', () => {
  const students = [student('a', true), student('b', true), student('c', false), student('d', false)]

  it('keeps the student named in the URL, even if they are graded', () => {
    expect(firstUngradedIndex(students, 'a')).toBe(0)
    expect(firstUngradedIndex(students, 'd')).toBe(3)
  })

  it('falls back to the first student when the named uid is not in the list', () => {
    expect(firstUngradedIndex(students, 'zzz')).toBe(0)
  })

  it('picks the first ungraded student when none is named', () => {
    expect(firstUngradedIndex(students, null)).toBe(2)
    expect(firstUngradedIndex(students, undefined)).toBe(2)
  })

  it('picks the first student when everyone is graded', () => {
    expect(firstUngradedIndex([student('a', true), student('b', true)], null)).toBe(0)
  })

  it('counts a student with no progress as ungraded', () => {
    expect(firstUngradedIndex([student('a', true), { uid: 'b' }], null)).toBe(1)
  })

  it('returns the first student when the first one is ungraded', () => {
    expect(firstUngradedIndex([student('a', false), student('b', false)], null)).toBe(0)
  })
})
