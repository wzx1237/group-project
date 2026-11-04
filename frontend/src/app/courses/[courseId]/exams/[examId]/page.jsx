'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ExamPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/courses/${courseId}/exams/${examId}/upload`)
  }, [router, courseId, examId])

  return null
}
