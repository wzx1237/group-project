/**
 * Lists active enrolled students missing an uploaded exam scan (shows 0 / total pts until uploaded) with a direct "Upload exam" action for late/makeup scans.
 * @param {Object} props
 * @param {Array<{ uid: string, name: string, maxPoints: number }>} props.missingStudents
 * @param {(uid: string, file: File) => Promise<void>} props.onUploadLateExam - Uploads a single student's late or makeup PDF
 */
export function MissingExamsCard({ missingStudents, onUploadLateExam }) {}