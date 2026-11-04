'use client'

import { useCourse } from '@/context/CourseContext'
import StudentRoster from '@/exam-distribution/components/StudentRoster'

/**
 * Manages the student roster: supports CSV upload, individual student additions, section edits, and marking students as dropped.
 * @param {Object} props
 * @param {{ courseId: string }} props.params - Route parameters
 */
export default function CourseRosterPage({ params }) {
  const { course, assignments } = useCourse()
  return <StudentRoster course={course} assignments={assignments} />
}
