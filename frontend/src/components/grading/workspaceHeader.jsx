/**
 * Secondary header bar inside the Grading Workspace showing student name, UID, submission timestamp, status badge ("In progress"),
 * running graded points (e.g., "14 / 15 pts graded · 3 of 4 questions · 20 pts total"), section/queue filters, and Previous/Next student navigation.
 * @param {Object} props
 * @param {{ uid: string, name: string, initials: string, submittedAt: string, status: string, section: string }} props.studentSubmission
 * @param {{ earnedPoints: number, gradedMaxPoints: number, gradedQuestionsCount: number, totalQuestionsCount: number, examMaxPoints: number }} props.scoreSummary
 * @param {{ currentIndex: number, totalCount: number, sectionFilter: string|null, activeRegradeQueueId: string|null }} props.navigationState
 * @param {() => void} props.onPreviousStudent - Navigates to the prior submission in the active queue
 * @param {() => void} props.onNextStudent - Requests/navigates to the next allocated submission in under 3 seconds
 * @param {(section: string|null) => void} props.onChangeSectionFilter - Filters grading queue by course discussion section
 * @param {(uid: string) => void} props.onDownloadSingleStudentPdf - Directly downloads this student's PDF report
 */
export function WorkspaceHeader({
  studentSubmission,
  scoreSummary,
  navigationState,
  onPreviousStudent,
  onNextStudent,
  onChangeSectionFilter,
  onDownloadSingleStudentPdf,
}) {}
