import { describe, expect, it } from 'vitest'
import { answerState, gradingQuestions, responseCounts } from './gradingQueue'

describe('grading queue uses server question identities and mapping statuses', () => {
  it('selects leaf grading units without treating a parent as another answer', () => {
    const questions = [{ qid: 'Q1' }, { qid: 'Q2' }, { qid: 'Q2.1' }, { qid: 'Q2.2' }, { qid: 'Q3' }]
    expect(gradingQuestions(questions).map((q) => q.qid)).toEqual(['Q1', 'Q2.1', 'Q2.2', 'Q3'])
    expect(gradingQuestions(questions, 'Q2').map((q) => q.qid)).toEqual(['Q2.1', 'Q2.2'])
    expect(gradingQuestions(questions, 'Q2.2').map((q) => q.qid)).toEqual(['Q2.2'])
    expect(gradingQuestions(questions, 'deleted-question')).toEqual([])
  })
  it('normalizes both API status vocabularies', () => {
    for (const state of ['finished', 'Finished', 'done']) expect(answerState(state)).toBe('finished')
    for (const state of ['InProgress', 'in_progress']) expect(answerState(state)).toBe('in_progress')
    for (const state of ['Regrade', 'needs_regrade']) expect(answerState(state)).toBe('regrade')
  })
  it('counts statuses for the chosen answer rather than the whole exam', () => {
    const students = [{ answers: { Q1: 'finished', Q2: 'pending' } }, { answers: { Q1: 'inprogress', Q2: 'finished' } }, { answers: { Q1: 'regrade', Q2: 'finished' } }, { answers: {} }]
    expect(responseCounts(students, 'Q1')).toEqual({ pending: 1, in_progress: 1, finished: 1, regrade: 1 })
  })
})
