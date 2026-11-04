/** Same-origin requests retain the existing signed CAS session cookie. */
export async function gradingRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : message } catch {}
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}
export const getCourses = () => gradingRequest('/courses')
export const getQuestions = (course) => gradingRequest(`/courses/${encodeURIComponent(course)}/questions`)
const question = (exam, qid) => `/exams/${encodeURIComponent(exam)}/questions/${encodeURIComponent(qid)}`
const answer = (w) => `/exams/${w.exam_ID}/students/${w.UID}/questions/${encodeURIComponent(w.QID)}`
export const startAnswer = (exam, qid) => gradingRequest(`${question(exam, qid)}/start`, { method: 'POST' })
export const refreshAnswer = (w) => gradingRequest(`${answer(w)}/workspace`)
export const releaseAnswer = (w) => gradingRequest(`${answer(w)}/release`, { method: 'POST' })
export const saveAnswer = (w, labels, comments) => gradingRequest(`${answer(w)}/grade`, {
  method: w.decision ? 'PUT' : 'POST', headers: { 'If-Match': w.grade_token }, body: JSON.stringify({ labels, comments }) })
export const addCriterion = (w, criterion) => gradingRequest(`${question(w.exam_ID, w.QID)}/rubric/labels`, {
  method: 'POST', headers: { 'If-Match': w.rubric_token }, body: JSON.stringify(criterion) })
