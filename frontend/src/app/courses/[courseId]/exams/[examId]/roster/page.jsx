'use client'

import { useParams } from 'next/navigation'
import { useCourse } from '@/context/CourseContext'
import AssignmentRoster from '@/exam-distribution/components/AssignmentRoster'

export default function ExamRosterPage() {
  const { examId } = useParams()
  const { course, assignments } = useCourse()
  const assignment = assignments.find((a) => a.id === examId)
  if (!assignment) return <p className="status error">Exam not found.</p>
  return <AssignmentRoster course={course} assignment={assignment} />
}
