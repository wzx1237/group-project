/**
 * Renders per-question performance cards (Figure 9b) using graded answers for each respective question.
 * Highlights the "Hardest question" badge, average score, full-credit percentage, and top deductions applied.
 * @param {Object} props
 * @param {Array<{
 *   qid: string,
 *   title: string,
 *   averageScore: number,
 *   maxScore: number,
 *   fullCreditCount: number,
 *   gradedCount: number,
 *   isHardest: boolean,
 *   deductions: Array<{ labelId: number, title: string, points: number, studentCount: number }>
 * }>} props.questionStats
 */
export function QuestionBreakdownGrid({ questionStats }) {}