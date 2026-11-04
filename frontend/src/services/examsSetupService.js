export async function createExamDraft(courseId, metadata) {}
export async function uploadExamTemplatePdf(examId, file, fileType) {} // 'blank_exam' | 'answer_key'
export async function saveQuestionDefinitionsAndRegions(examId, questions) {}
export async function assignGradersToQuestions(examId, mappingPayload) {} // Reassign endpoint
