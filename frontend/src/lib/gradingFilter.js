// Which exams the grading page steps through. The filter lives in the URL (?q=Q3&status=ungraded), so a link or
// a reload keeps it. Relative imports keep this file testable without the '@/' alias.

import { allCriteria, appliedCriteria, gradableQuestions, partsOf, questionScore } from './rubric'

// score is one of SCORES; with 'range', min and max are points. regrade is 'waiting' (any open queue) or a queue's id.
const KEYS = ['q', 'status', 'grader', 'criterion', 'score', 'min', 'max', 'regrade']

export const SCORES = {
  lt25: 'Below 25%',
  lt50: 'Below 50%',
  lt75: 'Below 75%',
  full: 'Full marks',
  zero: 'Zero',
  range: 'Points between…',
}

const BELOW = { lt25: 0.25, lt50: 0.5, lt75: 0.75 }

export const readFilter = (params) => Object.fromEntries(KEYS.map((key) => [key, params.get(key) || null]))

// The URL query for a filter, without the empty parts.
export const filterQuery = (filter) =>
  Object.fromEntries(KEYS.filter((key) => filter?.[key] != null && filter[key] !== '').map((key) => [key, String(filter[key])]))

export const isFiltered = (filter) => Object.keys(filterQuery(filter)).length > 0

// The answers a filter looks at: one question (its subquestions, if it has them) or every gradable question.
export function filteredQuestions(questions, qid) {
  if (!qid) return gradableQuestions(questions)
  const parts = partsOf(questions, qid)
  return parts.length ? parts : questions.filter((q) => q.qid === qid)
}

// The criteria a question can be filtered by, including split ones still on old answers.
export const filterCriteria = (questions, qid) => (qid ? filteredQuestions(questions, qid).flatMap(allCriteria) : [])

const isGraded = (question, decision) => appliedCriteria(question, decision).length > 0

function scoreMatches(question, decision, { score, min, max }) {
  const points = questionScore(question, decision)
  if (score in BELOW) return question.total_score > 0 && points < BELOW[score] * question.total_score
  if (score === 'full') return points === question.total_score
  if (score === 'zero') return points === 0
  if (score === 'range') return (min == null || points >= Number(min)) && (max == null || points <= Number(max))
  return true
}

// Whether one student's exam matches: some answer in scope passes every part of the filter.
// "Graded by" and the score only apply to graded answers. `waiting` lists the open regrade queues
// holding this student's answers, as { id, qid }.
export function matches(decisions, filter, questions, waiting = []) {
  return filteredQuestions(questions, filter.q).some((question) => {
    const decision = decisions?.[question.qid]
    const graded = isGraded(question, decision)
    if (filter.status === 'ungraded' && graded) return false
    if (filter.status === 'graded' && !graded) return false
    if (filter.grader && !(graded && decision.grader_directory_id === filter.grader)) return false
    if (filter.criterion && !decision?.criteria.includes(filter.criterion)) return false
    if (filter.score && !(graded && scoreMatches(question, decision, filter))) return false
    if (filter.regrade && !waiting.some((w) => w.qid === question.qid && (filter.regrade === 'waiting' || w.id === filter.regrade))) {
      return false
    }
    return true
  })
}
