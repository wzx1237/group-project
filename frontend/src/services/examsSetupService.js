import * as apiClient from './apiClient'

// creates a new assignment draft with title date and total point metadata
export async function createExamDraft(courseId, metadata) {
  return apiClient.post('/assignments', { course_id: courseId, ...metadata })
}

// uploads template pdf files such as blank exam sheets and instructor answer keys
export async function uploadExamTemplatePdf(examId, file, fileType = 'blank_exam') {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('type', fileType)
  return apiClient.upload(`/assignments/${examId}/templates`, formData)
}

// saves visual answer bounding boxes and question definitions for an exam
export async function saveQuestionDefinitionsAndRegions(examId, questions) {
  return apiClient.put(`/assignments/${examId}/questions`, { questions })
}

// assigns teaching assistants to questions or discussion sections to balance workload
export async function assignGradersToQuestions(examId, mappingPayload) {
  return apiClient.post(`/assignments/${examId}/assign`, mappingPayload)
}
