import * as apiClient from './apiClient'

// creates a new assignment in a course; the server makes its slug (its ID in urls) from the title
export async function createExamDraft(courseId, { title, kind, due }) {
  return apiClient.post(`/courses/${courseId}/assignments`, { title, kind, due: due || null })
}

// deletes an assignment with its rubric, papers and grades
export async function deleteAssignment(examId) {
  return apiClient.del(`/assignments/${examId}`)
}

// changes an assignment's title, type or due date; its ID in urls stays the same
export async function updateAssignment(examId, { title, kind, due }) {
  return apiClient.patch(`/assignments/${examId}`, { title, kind, due: due || null })
}

// the saved blank exam as a File, or null when none has been uploaded
export async function fetchBlankExam(examId) {
  const response = await fetch(`/api/assignments/${examId}/templates/blank_exam`, { credentials: 'include' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`could not load the blank exam (${response.status})`)
  return new File([await response.blob()], 'blank-exam.pdf', { type: 'application/pdf' })
}

// uploads the blank exam, which also sets up splitting scans by their cover page, or the answer key
export async function uploadExamTemplatePdf(examId, file, fileType = 'blank_exam') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', fileType)
  return apiClient.upload(`/assignments/${examId}/templates`, formData)
}

const amount = (n) => Math.round((Number(n) || 0) * 100) / 100

// Saves the setup's questions, subquestions, regions and criteria as the exam's grading rubric. Each question keeps the
// scoring chosen in setup ("add points up" unless changed). Questions saved by an earlier try are skipped.
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
      grading_method: q.grading_method ?? 'manual',
      scoring: q.scoring ?? 'add',
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

// Brings the saved rubric in line with the edited setup: removed questions and criteria are deleted, new ones added
// and changed ones updated. Criteria saved earlier have numeric IDs; ones added during editing do not.
export async function syncQuestionsAndRubric(examId, questions) {
  const base = `/assignments/${examId}/rubric`
  const saved = (await apiClient.get(base)).questions
  const keep = new Set(questions.map((q) => q.qid))
  // subquestions (Q1.1) go before their question (Q1)
  const removed = saved.filter((q) => !keep.has(q.qid)).sort((a, b) => b.qid.length - a.qid.length)
  for (const old of removed) await apiClient.del(`${base}/questions/${old.qid}`)
  const before = new Map(saved.map((q) => [q.qid, q]))
  for (const q of questions) {
    const body = {
      qid: q.qid,
      title: q.title?.trim() ?? '',
      total_score: amount(q.total_score),
      region: q.region,
      grading_method: q.grading_method ?? 'manual',
      scoring: q.scoring ?? 'add',
    }
    const old = before.get(q.qid)
    if (!old) await apiClient.post(`${base}/questions`, body)
    else if (
      old.title !== body.title ||
      Number(old.total_score) !== body.total_score ||
      (old.scoring ?? 'add') !== body.scoring ||
      JSON.stringify(old.region) !== JSON.stringify(body.region)
    ) {
      await apiClient.patch(`${base}/questions/${q.qid}`, body)
    }

    const oldCriteria = new Map((old?.criteria ?? []).map((c) => [String(c.label_id), c]))
    const kept = new Set()
    for (const c of q.criteria ?? []) {
      if (!c.title?.trim()) continue
      const fields = { title: c.title.trim().slice(0, 50), description: c.description?.trim() ?? '', deduction: amount(c.deduction) }
      const was = oldCriteria.get(String(c.label_id))
      if (!was) {
        await apiClient.post(`${base}/questions/${q.qid}/criteria`, fields)
        continue
      }
      kept.add(String(c.label_id))
      if (was.title !== fields.title || (was.description ?? '') !== fields.description || Number(was.deduction) !== fields.deduction) {
        await apiClient.patch(`${base}/criteria/${c.label_id}`, fields)
      }
    }
    for (const [id] of oldCriteria) {
      if (!kept.has(id)) await apiClient.del(`${base}/criteria/${id}`)
    }
  }
}
