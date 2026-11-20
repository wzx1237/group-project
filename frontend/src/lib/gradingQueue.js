import { appliedCriteria, partsOf, questionScore } from './rubric'

const STUDENT_BASED_KINDS = new Set(['homework', 'lab', 'quiz', 'other'])

export const isStudentBased = (kind) => STUDENT_BASED_KINDS.has(String(kind ?? '').trim().toLowerCase())

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

// Aggregate the same server mapping states used by the question-based student list.
// Regrade takes precedence and an empty rubric must never look finished.
export function studentResponse(questions, student, decisions = {}, assigned = {}, qid = null) {
  const scope = gradingQuestions(questions, qid)
  const states = scope.map((q) => answerState(student.answers?.[q.qid]))
  const state = states.includes('regrade') ? 'regrade'
    : states.length && states.every((s) => s === 'finished') ? 'finished'
      : states.some((s) => s !== 'pending') ? 'in_progress' : 'pending'
  const graded = scope.filter((q) => appliedCriteria(q, decisions[q.qid]).length)
  const graders = [...new Set(scope.map((q) => assigned[`${student.uid}:${q.qid}`] ?? decisions[q.qid]?.grader_directory_id).filter(Boolean))]
  const score = graded.length ? Math.round(graded.reduce((n, q) => n + (decisions[q.qid].score ?? questionScore(q, decisions[q.qid])), 0) * 100) / 100 : null
  return { state, score, total: scope.reduce((n, q) => n + q.total_score, 0), grader: graders.length > 1 ? 'Multiple graders' : graders[0] ?? 'Unassigned' }
}
