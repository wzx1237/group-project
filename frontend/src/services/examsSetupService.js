import * as apiClient from './apiClient'

// creates a new assignment in a course; the server makes its slug (its ID in urls) from the title
export async function createExamDraft(courseId, { title, due }) {
  return apiClient.post(`/courses/${courseId}/assignments`, { title, due: due || null })
}

// uploads the blank exam, which also sets up splitting scans by their cover page, or the answer key
export async function uploadExamTemplatePdf(examId, file, fileType = 'blank_exam') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', fileType)
  return apiClient.upload(`/assignments/${examId}/templates`, formData)
}

const amount = (n) => Math.round((Number(n) || 0) * 100) / 100

// Saves the setup's questions, regions and criteria as the exam's grading rubric. Setup criteria add up from 0
// (full credit is a + criterion), so the questions are "add points up". Questions saved by an earlier try are skipped.
export async function saveQuestionsAndRubric(examId, questions) {
  const base = `/assignments/${examId}/rubric`
  const saved = new Set((await apiClient.get(base)).questions.map((q) => q.qid))
  for (const q of questions) {
    if (saved.has(q.qid)) continue
    await apiClient.post(`${base}/questions`, {
      qid: q.qid,
      title: q.title?.trim() ?? '',
      total_score: amount(q.total_score),
      region: q.region,
      scoring: 'add',
    })
    for (const c of q.criteria ?? []) {
      if (!c.title?.trim()) continue
      await apiClient.post(`${base}/questions/${q.qid}/criteria`, {
        title: c.title.trim().slice(0, 50),
        description: c.description?.trim() ?? '',
        deduction: amount(c.deduction),
      })
    }
  }
}
