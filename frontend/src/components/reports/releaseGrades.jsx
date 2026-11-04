/**
 * releasing grades (Figure 9a: "Release grades for Quiz 03?").
 * Warns about missing exams, lets instructors select "Email each student" (UMD email) and/or "Download PDFs to print" (ZIP bundle),
 * confirms exclusion of internal notes/grader names, and records the release in the audit log.
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {string} props.examTitle
 * @param {number} props.readyReportCount - Count of graded students who will receive reports (e.g., 35)
 * @param {Array<{ uid: string, name: string }>} props.missingStudents - Students excluded because their scan is missing (e.g., Jordan Lee)
 * @param {(options: { emailStudents: boolean, downloadPrintZip: boolean, scope: 'all' | 'sections' | 'students', targetIds?: string[] }) => Promise<void>} props.onConfirmRelease
 * @param {() => void} props.onClose
 */
export function ReleaseGrades({
  isOpen,
  examTitle,
  readyReportCount,
  missingStudents,
  onConfirmRelease,
  onClose,
}) {}