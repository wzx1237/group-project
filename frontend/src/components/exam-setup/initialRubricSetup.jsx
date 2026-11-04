/**
 * Step 3: Configures initial rubric criteria for each question, Definite-Answer matching rules, Markdown import/export, or copying an existing exam rubric.
 * @param {Object} props
 * @param {Array<Object>} props.questions - Exam questions and their associated rubric criteria
 * @param {(sourceExamId: string) => Promise<void>} props.onCopyRubricFromExam - Clones rubric criteria from a prior exam
 * @param {(markdownText: string) => Promise<void>} props.onImportMarkdown - Parses Markdown into question criteria
 * @param {() => string} props.onExportMarkdown - Serializes current rubric to Markdown
 * @param {() => void} props.onBack
 * @param {() => void} props.onContinueToGraders
 */
export function InitialRubricStep({
  questions,
  onCopyRubricFromExam,
  onImportMarkdown,
  onExportMarkdown,
  onBack,
  onContinueToGraders,
}) {}