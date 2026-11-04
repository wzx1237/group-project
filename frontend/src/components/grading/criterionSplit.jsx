/**
 * Modal to split an existing rubric criterion into two or more granular criteria (Sec 3.5 & 10.1).
 * Creates a dedicated named Regrade Queue while preserving old scores until each affected answer is reviewed.
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Object} props.sourceCriterion - The original criterion being split
 * @param {number} props.affectedCount - Number of graded submissions using the original criterion
 * @param {(replacementCriteria: Array<{ title: string, deduction: number }>, queueName: string) => Promise<void>} props.onConfirmSplit
 * @param {() => void} props.onClose
 */
export function criterionSplit({ isOpen, sourceCriterion, affectedCount, onConfirmSplit, onClose }) {}
