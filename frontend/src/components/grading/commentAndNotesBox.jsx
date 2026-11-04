/**
 * Provides separate input fields for student-facing feedback comments (no point penalty attached) and staff-only internal notes (excluded from student PDF reports).
 * @param {Object} props
 * @param {string} props.studentComment - Comment visible on the student's PDF report
 * @param {string} props.internalNote - Confidential note visible only to instructors and TAs
 * @param {(studentComment: string, internalNote: string) => Promise<void>} props.onSaveNotes
 */
export function CommentAndNotesBox({ studentComment, internalNote, onSaveNotes }) {}