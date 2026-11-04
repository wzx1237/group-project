/**
 * Modal allowing instructors (or TAs picking up unfinished questions) to redistribute question or section workloads.
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.examId - Target exam identifier
 * @param {Array<Object>} props.questions - Questions with current progress, average grading time, and assigned TAs
 * @param {Array<Object>} props.availableTAs - Course TAs and their current workload metrics
 * @param {(qid: string, graderIds: string[], sectionFilter?: string) => Promise<void>} props.onSaveAssignments
 * @param {() => void} props.onClose
 */
export function ReassignGraders({ isOpen, examId, questions, availableTAs, onSaveAssignments, onClose }) {}
