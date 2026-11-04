/**
 * Input widget for definite-answer questions (Sec 3.5 & 10.1).
 * Grader enters the student's final value (e.g., "12", "36"), which auto-matches against configured accepted answers/tolerances and applies linked credit/deductions.
 * @param {Object} props
 * @param {string} props.qid - Question ID
 * @param {string} props.enteredValue - Student's transcribed final answer
 * @param {'matched' | 'unmatched_manual_review' | 'empty'} props.matchStatus - Automatic evaluation result
 * @param {(value: string) => Promise<void>} props.onSubmitAnswer - Evaluates and saves the transcribed answer
 */
export function DefiniteAnswerInput({ qid, enteredValue, matchStatus, onSubmitAnswer }) {}