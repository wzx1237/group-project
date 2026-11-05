import * as apiClient from './apiClient'

// retrieves course list or details for the authenticated staff member
export async function fetchCoursesForStaff() {
  try {
    const course = await apiClient.get('/course')
    return course ? [course] : []
  } catch {
    return []
  }
}

// fetches the complete student roster for a course including enrollment status
export async function fetchCourseRoster(courseId) {
  try {
    const students = await apiClient.get('/students')
    return Array.isArray(students) ? students : []
  } catch {
    return []
  }
}

// uploads a student roster csv file to populate or update course enrollment
export async function uploadRosterCsv(courseId, csvFile) {
  const formData = new FormData()
  formData.append('file', csvFile)
  return apiClient.upload(`/courses/${courseId}/roster/upload`, formData)
}

// creates or updates an individual student record in the course roster
export async function upsertStudentRecord(courseId, studentData) {
  return apiClient.post(`/courses/${courseId}/roster`, studentData)
}

// updates student enrollment status between active and dropped
export async function updateStudentEnrollmentStatus(courseId, uid, status) {
  return apiClient.patch(`/courses/${courseId}/roster/${encodeURIComponent(uid)}`, { status })
}

// invites or adds a new teaching assistant to the course staff roster
export async function addCourseTA(courseId, identifier, role = 'TA') {
  return apiClient.post('/staff', { identifier, role, course_id: courseId })
}

// removes a teaching assistant from the course while preserving historical grading decisions
export async function removeCourseTA(courseId, graderId) {
  return apiClient.del(`/staff/${encodeURIComponent(graderId)}`)
}
