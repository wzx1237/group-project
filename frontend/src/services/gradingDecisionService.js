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

// Replaces the whole decision: its criteria, comment and internal note.
export async function submitGradingDecision(examId, studentUid, qid, { criteria, comment, internal_note }) {
  return request(`${base(examId)}/submissions/${studentUid}/questions/${qid}/decision`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ criteria, comment, internal_note }),
  })
}

export async function forwardNextSubmission(examId, { qid, studentUid, sectionFilter, regradeQueueId }) {} // Forward endpoint
export async function fetchAuthenticatedStudentPdfBlob(examId, studentUid) {}
