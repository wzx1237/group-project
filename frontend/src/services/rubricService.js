export async function fetchExamRubric(examId) {}
export async function createRubricCriterion(examId, qid, criterionData) {}
export async function updateRubricCriterion(examId, qid, labelId, updates) {} // Edit Rubric endpoint (auto-recalculates affected Decisions)
export async function splitRubricCriterion(examId, qid, labelId, replacementCriteria, regradeQueueName) {}
export async function importRubricFromMarkdown(examId, markdownContent) {}
export async function exportRubricToMarkdown(examId) {}
export async function copyRubricFromExam(targetExamId, sourceExamId) {}