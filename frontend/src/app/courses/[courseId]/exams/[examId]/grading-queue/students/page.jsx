import { Suspense } from 'react'
import { GradingQueue } from '@/components/grading/gradingQueue'

export default function AssignmentStudentsPage() {
  return <Suspense><GradingQueue studentView /></Suspense>
}
