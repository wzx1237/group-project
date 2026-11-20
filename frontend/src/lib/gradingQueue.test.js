import { describe, expect, it } from 'vitest'
import { answerState, gradingQuestions, isStudentBased, responseCounts, studentResponse } from './gradingQueue'

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


describe('student-based assignment selection and progress', () => {
  const questions = ['Q1', 'Q2'].map((qid) => ({ qid, total_score: 10, scoring: 'deduct', criteria: [{ label_id: qid, deduction: 0 }] }))
  it('forks only the four approved kinds; exams and legacy kinds keep their flow', () => {
    for (const kind of ['homework', 'Lab', ' QUIZ ', 'other']) expect(isStudentBased(kind)).toBe(true)
    for (const kind of ['exam', 'final exam', 'Final Exam', 'essay', undefined]) expect(isStudentBased(kind)).toBe(false)
  })
  it('uses all server mapping states, not a single finished question, for whole-work status', () => {
    const student = { uid: '111', answers: { Q1: 'finished', Q2: 'pending' } }
    expect(studentResponse(questions, student).state).toBe('in_progress')
    expect(studentResponse(questions, { ...student, answers: { Q1: 'finished', Q2: 'done' } }).state).toBe('finished')
    expect(studentResponse(questions, { ...student, answers: { Q1: 'finished', Q2: 'needs_regrade' } }).state).toBe('regrade')
    expect(studentResponse([], student).state).toBe('pending')
  })
  it('sums scores and reports existing graders without inventing a global owner', () => {
    const student = { uid: '111', answers: { Q1: 'finished', Q2: 'finished' } }
    const decisions = { Q1: { criteria: ['Q1'], score: 10, grader_directory_id: 'ta1' }, Q2: { criteria: ['Q2'], score: 8, grader_directory_id: 'ta2' } }
    expect(studentResponse(questions, student, decisions)).toEqual({ state: 'finished', score: 18, total: 20, grader: 'Multiple graders' })
    expect(studentResponse(questions, student, decisions, {}, 'Q1')).toEqual({ state: 'finished', score: 10, total: 10, grader: 'ta1' })
  })
  it('counts leaf questions, not both a parent and its parts', () => {
    const parts = [{ ...questions[0], qid: 'Q1', total_score: 0 }, { ...questions[0], qid: 'Q1.1', total_score: 4 }, { ...questions[0], qid: 'Q1.2', total_score: 6 }]
    expect(studentResponse(parts, { uid: '111', answers: { 'Q1.1': 'done', 'Q1.2': 'pending' } })).toMatchObject({ total: 10, state: 'in_progress' })
  })
})
