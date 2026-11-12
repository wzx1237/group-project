// Student reports and grade exports, through backend/app/routing/reports.py.
// Grades are released by closing the assignment (changeStatus in exam-distribution/lib/api).

import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import { gradingProgress, rubricPoints } from '@/lib/rubric'
import { request } from '@/services/apiClient'
import { fetchExamDecisions } from './gradingDecisionService'
import { fetchExamRubric } from './rubricService'

const files = (examId) => `/api/assignments/${examId}`

export const reportUrl = (examId, uid, download = false) =>
  `${files(examId)}/reports/${uid}.pdf${download ? '?download=true' : ''}`
// student reports zip url with optional section filter or grouping
export const reportsZipUrl = (examId, options = {}) => {
  const params = new URLSearchParams()
  if (options.section) params.set('section', options.section)
  if (options.grouped) params.set('grouped', 'true')
  const qs = params.toString()
  return `${files(examId)}/reports.zip${qs ? `?${qs}` : ''}`
}
export const gradesCsvUrl = (examId) => `${files(examId)}/grades.csv`

// Every student on the roster with their exam's score, added up the way the grading page does.
// Whether they are graded comes from the server's stored status; a no-show is graded with 0.
export async function fetchStudentScores(examId) {
  const [rubric, decisions, roster] = await Promise.all([
    fetchExamRubric(examId),
    fetchExamDecisions(examId),
    getAssignmentRoster(examId),
  ])
  const possible = rubricPoints(rubric.questions)
  return roster.students.map((s) => {
    const progress = gradingProgress(rubric.questions, decisions[s.uid] ?? {})
    const noShow = s.status === 'no_show'
    return {
      uid: s.uid,
      name: s.name,
      section: s.section ?? null,
      status: s.status, // null while the assignment is in draft
      hasExam: Boolean(s.submission),
      noShow,
      earned: noShow ? 0 : progress.earned,
      possible,
      gradedCount: s.progress?.finished ?? progress.gradedCount,
      questionCount: s.progress?.questions ?? progress.questionCount,
      graded: Boolean(s.progress?.graded),
    }
  })
}

// download reports zip scoped or grouped by section
export async function downloadScopedReportsZip(examId, { section = null, grouped = false } = {}) {
  window.location.assign(reportsZipUrl(examId, { section, grouped }))
}
export async function exportArchivalBundle(examId, { includeScans, includeGradingRecords }) {}
export async function deleteExamData(examId, { deleteScansOnly }) {}
