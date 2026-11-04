/**
 * Displays actionable alerts for lagging questions (e.g., "Q4 · Tangent line is behind") and missing scans.
 * Excludes dropped students automatically from missing-exam alerts.
 * @param {Object} props
 * @param {Array<{ qid: string, title: string, gradedCount: number, totalCount: number, graderCount: number }>} props.bottleneckQuestions
 * @param {Array<{ uid: string, name: string, examId: string }>} props.missingExams
 * @param {(qid: string) => void} props.onReassignGraders - Opens grader reassignment modal for the lagging question
 * @param {(examId: string, uid?: string) => void} props.onUploadMissingExam - Routes to late/makeup scan upload
 */
export function NeedsAttentionSidebar({ bottleneckQuestions, missingExams, onReassignGraders, onUploadMissingExam }) {}