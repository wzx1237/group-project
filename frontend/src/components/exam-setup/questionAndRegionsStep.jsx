/**
 * Step 1: Uploads the blank exam template PDF, instructor answer key PDF, and sets exam title, date, and total points.
 * @param {Object} props
 * @param {Object} props.examDraft - Current draft metadata and uploaded file references
 * @param {(file: File, type: 'blank_exam' | 'answer_key') => Promise<void>} props.onUploadTemplateFile
 * @param {(metadata: { title: string, date: string, totalPoints: number }) => void} props.onUpdateMetadata
 * @param {() => void} props.onNextStep
 */
export function BlankExamUploadStep({ examDraft, onUploadTemplateFile, onUpdateMetadata, onNextStep }) {}

// src/components/exam-setup/QuestionsAndRegionsStep.jsx
/**
 * Step 2 (Appendix A): Split-pane view with the blank exam PDF canvas on the left and the question list on the right.
 * Allows staff to draw rectangular bounding boxes for each question once for reuse across all student scans.
 * @param {Object} props
 * @param {string} props.blankPdfUrl - URL of the uploaded blank exam PDF
 * @param {Array<Object>} props.questions - List of questions with QID, title, max points, gradingMethod, and region coordinates
 * @param {string|null} props.activeDrawingQid - QID currently in region-drawing mode on the PDF canvas
 * @param {() => void} props.onAddQuestion - Appends a new question card
 * @param {(qid: string, updates: Partial<Object>) => void} props.onUpdateQuestion - Updates title, points, or grading method
 * @param {(qid: string, pageIndex: number, rect: { x: number, y: number, width: number, height: number }) => void} props.onSaveRegion
 * @param {() => void} props.onBack
 * @param {() => void} props.onContinueToRubric
 */
export function QuestionsAndRegionsStep({
  blankPdfUrl,
  questions,
  activeDrawingQid,
  onAddQuestion,
  onUpdateQuestion,
  onSaveRegion,
  onBack,
  onContinueToRubric,
}) {}