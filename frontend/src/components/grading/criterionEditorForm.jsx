/**
 * Inline form for adding or editing a rubric criterion (e.g., Adjustment "-1 pt", Description "Incorrect tangent intercept") (Figure 8).
 * When editing an existing criterion used on graded exams, previews how many submissions will have their scores automatically recalculated.
 * @param {Object} props
 * @param {Object} [props.initialCriterion] - Existing criterion if editing, or undefined if creating new
 * @param {number} props.questionMaxPoints - Max points for the parent question (displays "Deducts from X pts")
 * @param {number} [props.affectedSubmissionsCount] - Count of already-graded exams that will auto-update upon save
 * @param {(data: { deduction: number, title: string, description: string, requiresManualRegrade: boolean }) => Promise<void>} props.onSave
 * @param {() => void} props.onCancel
 */
export function CriterionEditorForm({
  initialCriterion,
  questionMaxPoints,
  affectedSubmissionsCount,
  onSave,
  onCancel,
}) {}