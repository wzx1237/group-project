// Worked out here from the rubric and grades in the database, until the backend has an analytics endpoint.
// Class results only count fully graded submissions, as the proposal says.

import { getAssignmentRoster } from '@/exam-distribution/lib/api'
import { formatNumber, gradingProgress, rubricPoints, topLevel } from '@/lib/rubric'
import { fetchExamDecisions } from './gradingDecisionService'
import { fetchExamRubric } from './rubricService'

const BUCKET_SIZES = [2, 5, 10, 20]
const round1 = (n) => Math.round(n * 10) / 10
const isMultiple = (n, step) => Math.abs(n / step - Math.round(n / step)) < 1e-9

function median(sorted) {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2)
}

// From the lowest score's bucket up to the top score, with at most about 20 buckets.
// A label ends at the highest score its bucket can hold, so "6–7.5" once half points are used.
function distribution(scores, totalPoints) {
  const size = BUCKET_SIZES.find((s) => totalPoints / s <= 20) ?? 50
  const buckets = []
  if (!scores.length) return { size, buckets }
  const step = [1, 0.5, 0.25, 0.1].find((g) => scores.every((s) => isMultiple(s, g))) ?? 0.01
  const last = Math.max(totalPoints, ...scores)
  for (let start = Math.floor(scores[0] / size) * size; start <= last; start += size) {
    const end = Math.min(Math.round((start + size - step) * 100) / 100, last)
    const range = start < 0 ? `${formatNumber(start)} to ${formatNumber(end)}` : `${start}–${end}`
    buckets.push({
      label: end > start ? range : formatNumber(start),
      count: scores.filter((s) => s >= start && s < start + size).length,
    })
  }
  return { size, buckets }
}

export async function fetchExamAnalytics(examId) {
  const [rubric, decisions, roster] = await Promise.all([
    fetchExamRubric(examId),
    fetchExamDecisions(examId),
    getAssignmentRoster(examId),
  ])
  const submitted = roster.students.filter((s) => s.submission)
  const totalPoints = rubricPoints(rubric.questions)
  const scores = submitted
    .map((s) => gradingProgress(rubric.questions, decisions[s.uid] ?? {}))
    .filter((p) => p.questionCount && p.gradedCount === p.questionCount)
    .map((p) => p.earned)
    .sort((a, b) => a - b)

  return {
    submissionCount: submitted.length,
    questionCount: topLevel(rubric.questions).length,
    totalPoints,
    fullyGraded: scores.length,
    stats: scores.length
      ? {
          average: round1(scores.reduce((sum, s) => sum + s, 0) / scores.length),
          median: median(scores),
          highest: scores.at(-1),
          lowest: scores[0],
        }
      : null,
    distribution: distribution(scores, totalPoints),
  }
}

export async function exportGradesToElmsCsv(examId) {}
