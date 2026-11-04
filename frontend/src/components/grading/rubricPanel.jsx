/**
 * Right pane interactive Question Rubric container (Figure 8).
 * Displays expand/collapse controls, question accordion cards, "+ Add question" action, and the "Rubric changes autosave" footer.
 * @param {Object} props
 * @param {Array<Object>} props.questions - List of exam questions with criteria and current student decisions
 * @param {string} props.selectedQid - Currently focused question ID (drives PDF region highlight)
 * @param {number} props.totalSubmissionsCount - Total submissions count shown in "Applies to all N submissions"
 * @param {(qid: string) => void} props.onSelectQuestion - Focuses a question and highlights its PDF region
 * @param {() => void} props.onExpandAll - Toggles expanding/collapsing all question cards
 * @param {() => void} props.onAddQuestion - Adds a new question to the exam rubric
 * @param {() => void} props.onOpenMarkdownModal - Opens Markdown rubric import/export modal
 */
export function RubricPanel({
  questions,
  selectedQid,
  totalSubmissionsCount,
  onSelectQuestion,
  onExpandAll,
  onAddQuestion,
  onOpenMarkdownModal,
}) {}