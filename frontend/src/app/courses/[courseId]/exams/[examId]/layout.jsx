'use client'

import { useParams } from 'next/navigation'
import { PageNotice } from '@/components/layout/PageNotice'
import { useCourse } from '@/context/CourseContext'

// every page under an exam needs an assignment that belongs to the selected course
export default function ExamLayout({ children }) {
  const { examId } = useParams()
  const { assignments } = useCourse()

  if (!assignments.some((a) => a.id === examId)) {
    return <PageNotice title="Assignment not found">This course has no assignment “{examId}”.</PageNotice>
  }
  return children
}
