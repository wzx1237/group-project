'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useCourse } from '@/context/CourseContext'

export default function ExamPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { assignments } = useCourse()
  const status = assignments.find((a) => a.id === examId)?.status

  useEffect(() => {
    if (status) router.replace(`/courses/${courseId}/exams/${examId}/${['grading', 'in_review', 'closed'].includes(status) ? 'grading-queue' : 'upload'}`)
  }, [router, courseId, examId, status])

  return null
}
