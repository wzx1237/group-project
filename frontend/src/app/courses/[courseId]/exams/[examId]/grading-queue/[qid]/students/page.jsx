import { Suspense } from 'react'
import { GradingQueue } from '@/components/grading/gradingQueue'

export default function QuestionStudentsPage() {
  return <Suspense><GradingQueue studentView /></Suspense>
}
