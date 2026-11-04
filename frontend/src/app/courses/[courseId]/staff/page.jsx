'use client'

import { useCourse } from '@/context/CourseContext'
import StaffRoster from '@/exam-distribution/components/StaffRoster'

export default function CourseStaffPage() {
  const { course } = useCourse()
  return <StaffRoster course={course} />
}
