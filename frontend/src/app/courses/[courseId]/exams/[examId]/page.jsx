'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { examGradePath } from '@/lib/routes'
import { useCourse } from '@/context/CourseContext'

export default function ExamPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { assignments } = useCourse()
  const assignment = assignments.find((a) => a.id === examId)
  const status = assignment?.status
  const gradingHref = examGradePath(String(courseId), examId, assignment?.kind)

  useEffect(() => {
    if (status) router.replace(['grading', 'in_review', 'closed'].includes(status) ? gradingHref : `/courses/${courseId}/exams/${examId}/upload`)
  }, [router, courseId, examId, status, gradingHref])

  return null
}
