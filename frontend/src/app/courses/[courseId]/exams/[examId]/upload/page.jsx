'use client'

import { useParams } from 'next/navigation'
import { useCourse } from '@/context/CourseContext'
import AssignmentPage from '@/exam-distribution/components/AssignmentPage'

/**
 * Renders the Upload Submissions screen (Appendix A).
 * Supports drag-and-drop batch PDF uploads, upload progress tracking, missing exam alerts, and OCR cover-page matching.
 */
export default function UploadSubmissionsPage() {
  const { examId } = useParams()
  const { course, assignments, refresh } = useCourse()
  const assignment = assignments.find((a) => a.id === examId)
  if (!assignment) return <p className="status error">Exam not found.</p>
  return <AssignmentPage course={course} assignment={assignment} onChange={refresh} />
}
