/**
 * Interactive expandable table ranking the most common rubric deductions across the exam (Figure 9b).
 * Expanding a row lists all students who received that deduction; clicking a student chip opens their grading workspace directly to that question.
 * @param {Object} props
 * @param {Array<{
 *   labelId: number,
 *   criterionTitle: string,
 *   qid: string,
 *   points: number,
 *   studentCount: number,
 *   percentOfGraded: number,
 *   totalPointsLost: number,
 *   affectedStudents: Array<{ uid: string, name: string }>
 * }>} props.deductions
 * @param {(uid: string, qid: string) => void} props.onOpenStudentWorkspace - Deep-links to the student's answer in the Grading Workspace
 */
export function CommonDeductionsTable({ deductions, onOpenStudentWorkspace }) {}
