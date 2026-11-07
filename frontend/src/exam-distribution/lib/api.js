import { request } from '@/services/apiClient'

export const getCourse = () => request('/course')

export const getCourses = () => request('/courses')

export const createCourse = (body) => request('/courses', { method: 'POST', body: JSON.stringify(body) })

export const updateCourse = (courseId, body) =>
  request(`/courses/${courseId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getAssignment = (assignmentId) => request(`/assignments/${assignmentId}`)

export function uploadPdf(assignmentId, file) {
  const body = new FormData()
  body.append('file', file)
  return request(`/assignments/${assignmentId}/uploads`, { method: 'POST', body })
}

export const masterUrl = (assignmentId, uploadId, download = false) =>
  `/api/assignments/${assignmentId}/uploads/${uploadId}/file${download ? '?download=true' : ''}`

export const submissionUrl = (assignmentId, uploadId, submissionId, download = false) =>
  `/api/assignments/${assignmentId}/uploads/${uploadId}/submissions/${submissionId}/file${download ? '?download=true' : ''}`

export const reprocessUpload = (assignmentId, uploadId) =>
  request(`/assignments/${assignmentId}/uploads/${uploadId}/process`, { method: 'POST' })

export const deleteUpload = (assignmentId, uploadId) =>
  request(`/assignments/${assignmentId}/uploads/${uploadId}`, { method: 'DELETE' })

export const getStudents = () => request('/students')

export const getStaff = () => request('/staff')

export const getCourseStudents = (courseId) => request(`/courses/${courseId}/roster`)

export const getCourseStaff = (courseId) => request(`/courses/${courseId}/staff`)

export const getAssignmentRoster = (assignmentId) => request(`/assignments/${assignmentId}/roster`)

export const matchUpload = (assignmentId, uploadId) =>
  request(`/assignments/${assignmentId}/uploads/${uploadId}/match`, { method: 'POST' })

export const assignSubmission = (assignmentId, uploadId, submissionId, studentUid) =>
  request(`/assignments/${assignmentId}/uploads/${uploadId}/submissions/${submissionId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ student_uid: studentUid }),
  })

export const uidImageUrl = (assignmentId, uploadId, submissionId) =>
  `/api/assignments/${assignmentId}/uploads/${uploadId}/submissions/${submissionId}/uid-image`

export const panelImageUrl = (assignmentId, uploadId, submissionId) =>
  `/api/assignments/${assignmentId}/uploads/${uploadId}/submissions/${submissionId}/panel-image`

export const changeStatus = (assignmentId, status, confirm = false) =>
  request(`/assignments/${assignmentId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, confirm }),
  })

// mark is 'excused', 'no_show', or null to undo either
export const markStudent = (assignmentId, uid, mark, note = null) =>
  request(`/assignments/${assignmentId}/students/${uid}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: mark, note }),
  })

export const unassignSubmission = (assignmentId, uploadId, submissionId) =>
  request(`/assignments/${assignmentId}/uploads/${uploadId}/submissions/${submissionId}/unassign`, { method: 'POST' })
