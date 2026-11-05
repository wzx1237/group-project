// canonical routing helpers for gradeflow application navigation

// normalizes course object or string into a url safe route identifier
export function courseIdSlug(course) {
  if (!course) return ''
  if (typeof course === 'string') return course
  if (course.id) return course.id
  const code = course.code || 'course'
  const term = course.term || 'term'
  return `${code}-${term}`.toLowerCase().replace(/\s+/g, '-')
}

// builds url path to the main dashboard for a given course
export function coursePath(course) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}`
}

// builds url path to the staff roster view for a course
export function courseStaffPath(course) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/staff`
}

// builds url path to the student roster view for a course
export function courseRosterPath(course) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/roster`
}

// builds url path to the 4-step exam setup wizard for a course
export function examSetupPath(course) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/new`
}

// builds url path to the submissions upload screen for an exam
export function examUploadPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/upload`
}

// builds url path to the question and answer region definition page
export function examQuestionsPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/questions`
}

// builds url path to the rubric setup and editor page
export function examRubricPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/rubric`
}

// builds url path to the interactive grading workspace for an exam
export function examGradePath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/grade`
}

// builds url path to the exam mistake analytics dashboard
export function examAnalyticsPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/analytics`
}

// builds url path to the exam feedback reports and grade release page
export function examReportsPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/reports`
}

// builds url path to the append-only change log and audit trail page
export function examAuditLogPath(course, examId) {
  const slug = courseIdSlug(course)
  return `/courses/${slug}/exams/${examId}/audit_log`
}
