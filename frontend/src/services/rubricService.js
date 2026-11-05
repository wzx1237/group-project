// Rubrics, saved in the database through backend/app/routing/rubrics.py.

import { parentQid } from '@/lib/rubric'
import { request } from '@/services/apiClient'

const base = (examId) => `/assignments/${examId}/rubric`
const send = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Q1, Q2, ... and Q1.1, Q1.2 for the parts of Q1, as in the proposal.
function nextQid(questions, parent) {
  const used = questions.filter((q) => parentQid(q.qid) === parent).map((q) => Number(q.qid.split(/[Q.]/).pop()))
  const n = Math.max(0, ...used) + 1
  return parent ? `${parent}.${n}` : `Q${n}`
}

function findQuestion(questions, qid) {
  const question = questions.find((q) => q.qid === qid)
  if (!question) throw new Error('That question no longer exists')
  return question
}

export async function fetchExamRubric(examId) {
  const rubric = await request(base(examId))
  // The database sorts Q10 before Q2.
  rubric.questions.sort((a, b) => a.qid.localeCompare(b.qid, undefined, { numeric: true }))
  return rubric
}

export async function createRubricQuestion(examId, { title, total_score, scoring, parent_qid = null }) {
  const { questions } = await fetchExamRubric(examId)
  const qid = nextQid(questions, parent_qid)
  const question = await request(`${base(examId)}/questions`, send('POST', { qid, title, scoring, total_score }))
  if (parent_qid && !questions.some((q) => parentQid(q.qid) === parent_qid)) {
    // A question's first subquestion takes over the criteria it already had.
    for (const criterion of findQuestion(questions, parent_qid).criteria) {
      question.criteria.push(await createRubricCriterion(examId, qid, criterion))
      await removeRubricCriterion(examId, parent_qid, criterion.label_id)
    }
  }
  return question
}

export async function updateRubricQuestion(examId, qid, { title, total_score, scoring }) {
  const { questions } = await fetchExamRubric(examId)
  const { criteria, ...current } = findQuestion(questions, qid)
  await request(`${base(examId)}/questions/${qid}`, send('PATCH', { ...current, title, total_score, scoring }))
}

export async function removeRubricQuestion(examId, qid) {
  const { questions } = await fetchExamRubric(examId)
  for (const part of questions.filter((q) => parentQid(q.qid) === qid)) {
    await request(`${base(examId)}/questions/${part.qid}`, { method: 'DELETE' })
  }
  await request(`${base(examId)}/questions/${qid}`, { method: 'DELETE' })
}

export async function createRubricCriterion(examId, qid, { title, description, deduction }) {
  return request(`${base(examId)}/questions/${qid}/criteria`, send('POST', { title, description, deduction }))
}

export async function updateRubricCriterion(examId, qid, labelId, { title, description, deduction }) {
  await request(`${base(examId)}/criteria/${labelId}`, send('PATCH', { title, description, deduction }))
}

export async function removeRubricCriterion(examId, qid, labelId) {
  await request(`${base(examId)}/criteria/${labelId}`, { method: 'DELETE' })
}

export async function splitRubricCriterion(examId, qid, labelId, replacementCriteria, regradeQueueName) {}
export async function importRubricFromMarkdown(examId, markdownContent) {}
export async function exportRubricToMarkdown(examId) {}
export async function copyRubricFromExam(targetExamId, sourceExamId) {}
