// Regrade queues, saved in the database through backend/app/routing/regrade.py.

import { request } from '@/services/apiClient'

const base = (examId) => `/assignments/${examId}/regrade-queues`
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const fetchRegradeQueues = (examId) => request(base(examId))

export const fetchRegradeQueue = (examId, queueId) => request(`${base(examId)}/${queueId}`)

// Puts a question's graded answers in a new queue: all of them, or only these students', or only those with one criterion.
export const flagForRegrade = (examId, { qid, reason, studentUids = null, criterionId = null }) =>
  request(base(examId), post({ qid, reason, student_uids: studentUids, criterion_id: criterionId }))

// Saves the criteria picked for this answer, which takes it out of the queue.
export const resolveRegrade = (examId, queueId, studentUid, criteria) =>
  request(`${base(examId)}/${queueId}/students/${studentUid}/resolve`, post({ criteria }))

export const closeRegradeQueue = (examId, queueId) => request(`${base(examId)}/${queueId}/close`, { method: 'POST' })
