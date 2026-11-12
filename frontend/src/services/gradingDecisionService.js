// Grading decisions, saved in the database through backend/app/routing/grading.py.
// The page adds up the applied criteria itself, the same way the backend does, so scores show instantly.

import { request } from '@/services/apiClient'

const base = (examId) => `/assignments/${examId}`

export async function fetchExamDecisions(examId) {
  return request(`${base(examId)}/decisions`)
}

export async function fetchStudentDecisions(examId, studentUid) {
  const decisions = await request(`${base(examId)}/decisions?${new URLSearchParams({ student_uid: studentUid })}`)
  return decisions[studentUid] ?? {}
}

// How far grading has got, over enrolled students with a paper:
// { questions: [{ qid, total, finished, regrade }], students: [{ uid, name, questions, finished, regrade, status, answers }] }
export async function fetchExamProgress(examId) {
  return request(`${base(examId)}/question-progress`)
}

// Replaces the whole decision: its criteria, comment and internal note. `version` is the one last loaded (0 for none),
// so a save on top of someone else's newer change is refused instead of overwriting it.
export async function submitGradingDecision(examId, studentUid, qid, { criteria, comment, internal_note, version }) {
  return request(`${base(examId)}/submissions/${studentUid}/questions/${qid}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria, comment, internal_note, version }),
  })
}

// The qid of the lock on a student's overall comment.
export const EXAM_COMMENT_LOCK = ''

// Who is grading which of this student's answers right now: [{ qid, holder, holder_name, mine, expires_at }].
export const fetchAnswerLocks = (examId, studentUid) => request(`${base(examId)}/submissions/${studentUid}/locks`)

// Holds an answer, or the overall comment (or renews the hold). Taking over another grader's hold has to be asked for.
export const lockAnswer = (examId, studentUid, qid, takeOver = false) =>
  request(`${base(examId)}/submissions/${studentUid}/${qid === EXAM_COMMENT_LOCK ? 'comment' : `questions/${qid}`}/lock`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ take_over: takeOver }),
  })

// A closing page can't wait for a response, so it sends this URL with navigator.sendBeacon.
export const releaseLocksUrl = (examId, studentUid) => `/api${base(examId)}/submissions/${studentUid}/locks/release`

export const releaseAnswerLocks = (examId, studentUid) =>
  request(`${base(examId)}/submissions/${studentUid}/locks/release`, { method: 'POST' })

// One comment to the student about their whole exam, shown on their report. Null when there is none.
export async function fetchExamComment(examId, studentUid) {
  const { comment } = await request(`${base(examId)}/submissions/${studentUid}/comment`)
  return comment
}

// `expected` is the comment as last loaded, so a save on top of someone else's newer comment is refused.
export async function saveExamComment(examId, studentUid, comment, expected) {
  const saved = await request(`${base(examId)}/submissions/${studentUid}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment, expected }),
  })
  return saved.comment
}

export async function forwardNextSubmission(examId, { qid, studentUid, sectionFilter, regradeQueueId }) {} // Forward endpoint
export async function fetchAuthenticatedStudentPdfBlob(examId, studentUid) {}
