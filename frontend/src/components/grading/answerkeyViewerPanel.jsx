/**
 * Right-pane "Answer key" tab view (Appendix A - Grading workspace · Answer key).
 * Renders the instructor's reference answer key PDF synchronized to the currently selected question (e.g., "Viewing Q2 · Chain rule reference").
 * @param {Object} props
 * @param {string} props.answerKeyPdfUrl - Authenticated URL for the answer key PDF
 * @param {string} props.activeQid - Currently selected question ID to highlight the matching solution block
 * @param {number} props.pageNumber - Current page of the answer key
 * @param {(page: number) => void} props.onPageChange
 */
export function AnswerKeyViewerPanel({ answerKeyPdfUrl, activeQid, pageNumber, onPageChange }) {}
