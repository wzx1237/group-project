import { describe, expect, it } from 'vitest'
import { filterQuery, isFiltered, matches, readFilter } from './gradingFilter'

const criterion = (label_id, deduction) => ({ label_id, title: label_id, description: '', deduction })

// Q1 is worth 10 and adds points; Q2 has two subquestions that start full and take points off.
const questions = [
  { qid: 'Q1', total_score: 10, scoring: 'add', criteria: [criterion('1', 10), criterion('2', 4)] },
  { qid: 'Q2', total_score: 0, criteria: [] },
  { qid: 'Q2.1', total_score: 5, scoring: 'deduct', criteria: [criterion('3', -5), criterion('5', 0)] },
  { qid: 'Q2.2', total_score: 5, scoring: 'deduct', criteria: [criterion('4', 0)] },
]

const decision = (criteria, grader = 'ta1') => ({ criteria, grader_directory_id: grader })

const fullMarks = { Q1: decision(['1']), 'Q2.1': decision(['5']), 'Q2.2': decision(['4']) }
const lowQ1 = { Q1: decision(['2'], 'ta2') }
const blank = {}

const filter = (params) => readFilter(new URLSearchParams(params))
const match = (decisions, params) => matches(decisions, filter(params), questions)

describe('matches', () => {
  it('finds ungraded and graded answers to one question', () => {
    expect(match(blank, { q: 'Q1', status: 'ungraded' })).toBe(true)
    expect(match(lowQ1, { q: 'Q1', status: 'ungraded' })).toBe(false)
    expect(match(lowQ1, { q: 'Q1', status: 'graded' })).toBe(true)
  })

  it('looks at subquestions when the question has them', () => {
    expect(match(lowQ1, { q: 'Q2', status: 'ungraded' })).toBe(true)
    expect(match({ 'Q2.1': decision(['3']), 'Q2.2': decision(['4']) }, { q: 'Q2', status: 'ungraded' })).toBe(false)
  })

  it('without a question, looks for any matching answer', () => {
    expect(match(lowQ1, { status: 'ungraded' })).toBe(true)
    expect(match(fullMarks, { status: 'ungraded' })).toBe(false)
  })

  it('filters by who graded the answer', () => {
    expect(match(lowQ1, { q: 'Q1', grader: 'ta2' })).toBe(true)
    expect(match(lowQ1, { q: 'Q1', grader: 'ta1' })).toBe(false)
    expect(match(blank, { q: 'Q1', grader: 'ta2' })).toBe(false)
  })

  it('filters by an applied criterion', () => {
    expect(match(lowQ1, { q: 'Q1', criterion: '2' })).toBe(true)
    expect(match(fullMarks, { q: 'Q1', criterion: '2' })).toBe(false)
  })

  it('needs every part of the filter to hold for the same answer', () => {
    expect(match(lowQ1, { q: 'Q1', grader: 'ta2', criterion: '2' })).toBe(true)
    expect(match(lowQ1, { q: 'Q1', grader: 'ta2', criterion: '1' })).toBe(false)
  })
})

describe('the filter in the URL', () => {
  it('drops empty and unknown values', () => {
    expect(filterQuery(filter({ q: 'Q1', status: '', below: '50' }))).toEqual({ q: 'Q1' })
    expect(isFiltered(filter({}))).toBe(false)
  })
})
