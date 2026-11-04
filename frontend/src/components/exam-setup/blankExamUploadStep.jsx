/**
 * Step 1: Uploads the blank exam template PDF, instructor answer key PDF, and sets exam title, date, and total points.
 * @param {Object} props
 * @param {Object} props.examDraft - Current draft metadata and uploaded file references
 * @param {(file: File, type: 'blank_exam' | 'answer_key') => Promise<void>} props.onUploadTemplateFile
 * @param {(metadata: { title: string, date: string, totalPoints: number }) => void} props.onUpdateMetadata
 * @param {() => void} props.onNextStep
 */
export function BlankExamUploadStep({ examDraft, onUploadTemplateFile, onUpdateMetadata, onNextStep }) {}
