/**
 * Accordion card for a single question (e.g., "Q2 · Chain rule 4 / 5") with action buttons ("+ Criterion", "Remove", "Edit", "Region"),
 * list of clickable criteria rows, definite-answer input (if configured), and comments box.
 * @param {Object} props
 * @param {Object} props.question - Question definition (`qid`, `title`, `totalScore`, `gradingMethod`, `region`)
 * @param {Array<Object>} props.criteria - Shared rubric `Label` items for this question
 * @param {Object} props.decision - Current student's `Decision` (`scores`, `appliedLabels`, `studentComment`, `internalNote`)
 * @param {boolean} props.isExpanded - Whether the accordion body is open
 * @param {(labelId: number) => Promise<void>} props.onToggleCriterion - Applies or removes a criterion and autosaves score
 * @param {(newCriterion: { deduction: number, title: string, description?: string }) => Promise<void>} props.onCreateCriterion
 * @param {(labelId: number, updates: Object) => Promise<void>} props.onEditCriterion - Previews affected submissions and updates criterion
 * @param {(labelId: number) => void} props.onOpenSplitCriterion - Opens modal to split a criterion into multiple replacement criteria
 * @param {(qid: string) => void} props.onStartRedrawRegion - Activates PDF region linking for this question
 */
export function QuestionRubricCard({
  question,
  criteria,
  decision,
  isExpanded,
  onToggleCriterion,
  onCreateCriterion,
  onEditCriterion,
  onOpenSplitCriterion,
  onStartRedrawRegion,
}) {}