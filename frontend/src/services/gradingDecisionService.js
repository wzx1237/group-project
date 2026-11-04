export async function forwardNextSubmission(examId, { qid, studentUid, sectionFilter, regradeQueueId }) {} // Forward endpoint
export async function submitGradingDecision(examId, { uid, qid, appliedLabelIds, definiteAnswer, studentComment, internalNote, timeSpentMs }) {} // Backward endpoint
export async function fetchAuthenticatedStudentPdfBlob(examId, studentUid) {}