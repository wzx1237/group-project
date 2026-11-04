/**
 * Displays top-level KPI cards computed strictly from fully graded submissions (Figure 9b):
 * Class average, Median, Highest score, and Lowest score.
 * @param {Object} props
 * @param {number} props.classAverage - Mean score across fully graded exams
 * @param {number} props.median - Median score across fully graded exams
 * @param {number} props.highest - Maximum score achieved
 * @param {number} props.lowest - Minimum score achieved
 * @param {number} props.maxPossiblePoints - Total exam points (e.g., 20)
 * @param {number} props.fullyGradedCount - Number of completed exams included in class totals
 */
export function SummaryStatCards({
  classAverage,
  median,
  highest,
  lowest,
  maxPossiblePoints,
  fullyGradedCount,
}) {}
