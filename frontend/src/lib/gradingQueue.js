import { partsOf } from './rubric'

// The queue and progress APIs use different spellings for the same mapping states.
export function answerState(value) {
  const state = String(value ?? '').toLowerCase()
  if (state === 'finished' || state === 'done') return 'finished'
  if (state === 'regrade' || state === 'needs_regrade') return 'regrade'
  if (state === 'inprogress' || state === 'in_progress') return 'in_progress'
  return 'pending'
}

export const ANSWER_STATES = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'outline' },
  finished: { label: 'Finished', tone: 'soft' },
  regrade: { label: 'Need regrade', tone: 'warning' },
}

// A grading selection is one leaf question. Parent questions remain available in the filter.
export function gradingQuestions(questions, qid = null) {
  const scope = qid ? new Set([qid, ...partsOf(questions, qid).map((q) => q.qid)]) : null
  return questions.filter((q) => !partsOf(questions, q.qid).length && (!scope || scope.has(q.qid)))
}

export function responseCounts(students, qid) {
  return students.reduce((counts, student) => {
    counts[answerState(student.answers?.[qid])] += 1
    return counts
  }, { pending: 0, in_progress: 0, finished: 0, regrade: 0 })
}
