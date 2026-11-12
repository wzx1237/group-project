export const parentQid = (qid) => (qid.includes('.') ? qid.split('.')[0] : null)

export const topLevel = (questions) => questions.filter((q) => !parentQid(q.qid))

export const partsOf = (questions, qid) => questions.filter((q) => parentQid(q.qid) === qid)

export const partLabel = (label, index) => `${label}(${String.fromCharCode(97 + index)})`

// Q1, Q2, ... and Q1(a), Q1(b) for the parts of Q1, as the rubric panel numbers them.
export function questionLabel(questions, qid) {
  const parent = parentQid(qid)
  const label = `Q${topLevel(questions).findIndex((q) => q.qid === (parent ?? qid)) + 1}`
  return parent ? partLabel(label, partsOf(questions, parent).findIndex((q) => q.qid === qid)) : label
}

// The next free ID: Q1, Q2, ... for questions and Q1.1, Q1.2 for the parts of Q1, as in the proposal.
export function nextQid(questions, parent = null) {
  const used = questions.filter((q) => parentQid(q.qid) === parent).map((q) => Number(q.qid.split(/[Q.]/).pop()))
  const n = Math.max(0, ...used) + 1
  return parent ? `${parent}.${n}` : `Q${n}`
}

// A question with subquestions is worth what its subquestions add up to.
export const questionPoints = (question, parts) =>
  parts.length ? parts.reduce((sum, part) => sum + part.total_score, 0) : question.total_score

export const rubricPoints = (questions) =>
  topLevel(questions).reduce((sum, q) => sum + questionPoints(q, partsOf(questions, q.qid)), 0)

export const gradableQuestions = (questions) => questions.filter((q) => !partsOf(questions, q.qid).length)

// A split criterion is no longer offered but stays on the answers that had it until they are regraded.
export const allCriteria = (question) => [...question.criteria, ...(question.retired_criteria ?? [])]

export const appliedCriteria = (question, decision) =>
  allCriteria(question).filter((c) => decision?.criteria.includes(c.label_id))

const total = (items, value) => Math.round(items.reduce((sum, item) => sum + value(item), 0) * 100) / 100

// Questions saved before scoring was a choice were added up from 0.
export const scoringOf = (question) => question.scoring ?? 'add'

// A question starts at full points or at 0, and its score stays between 0 and its points.
export function scoreWith(question, adjustment) {
  const start = scoringOf(question) === 'deduct' ? question.total_score : 0
  return Math.round(Math.min(Math.max(start + adjustment, 0), question.total_score) * 100) / 100
}

export const questionScore = (question, decision) =>
  scoreWith(question, total(appliedCriteria(question, decision), (c) => c.deduction))

export function gradingProgress(questions, decisions) {
  const gradable = gradableQuestions(questions)
  const graded = gradable.filter((q) => appliedCriteria(q, decisions[q.qid]).length)
  return {
    earned: total(graded, (q) => questionScore(q, decisions[q.qid])),
    gradedPoints: total(graded, (q) => q.total_score),
    gradedCount: graded.length,
    questionCount: gradable.length,
  }
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export const formatNumber = (n) => String(n).replace('-', '−')

export const formatPoints = (points) => `${points} ${points === 1 ? 'pt' : 'pts'}`

export function formatAdjustment(points) {
  const sign = points > 0 ? '+' : points < 0 ? '−' : ''
  return `${sign}${formatPoints(Math.abs(points))}`
}
