// Grade release and student reports, through backend/app/routing/reports.py.

import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import { gradingProgress, rubricPoints } from '@/lib/rubric'
import { request } from '@/services/apiClient'
import { fetchExamDecisions } from './gradingDecisionService'
import { fetchExamRubric } from './rubricService'

const files = (examId) => `/api/assignments/${examId}`

export const reportUrl = (examId, uid, download = false) =>
  `${files(examId)}/reports/${uid}.pdf${download ? '?download=true' : ''}`
export const reportsZipUrl = (examId) => `${files(examId)}/reports.zip`
export const gradesCsvUrl = (examId) => `${files(examId)}/grades.csv`

export const fetchReleaseStatus = (examId) => request(`/assignments/${examId}/release`)

export const setGradesReleased = (examId, released) =>
  request(`/assignments/${examId}/release`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ released }),
  })

// Every student on the roster with their exam's score, added up the way the grading page does.
export async function fetchStudentScores(examId) {
  const [rubric, decisions, roster] = await Promise.all([
    fetchExamRubric(examId),
    fetchExamDecisions(examId),
    getAssignmentRoster(examId),
  ])
  const possible = rubricPoints(rubric.questions)
  return roster.students.map((s) => {
    const progress = gradingProgress(rubric.questions, decisions[s.uid] ?? {})
    return {
      uid: s.uid,
      name: s.name,
      hasExam: Boolean(s.submission),
      earned: progress.earned,
      possible,
      gradedCount: progress.gradedCount,
      questionCount: progress.questionCount,
      graded: progress.questionCount > 0 && progress.gradedCount === progress.questionCount,
    }
  })
}

export async function downloadScopedReportsZip(examId, { scope, sectionIds, studentUids }) {}
export async function exportArchivalBundle(examId, { includeScans, includeGradingRecords }) {}
export async function deleteExamData(examId, { deleteScansOnly }) {}
