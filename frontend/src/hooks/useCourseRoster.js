import { useEffect, useState } from 'react'
import { getCourseStaff, getCourseStudents } from '@/exam-distribution/lib/api'

// one course's staff and student count, for course cards and the course page
export function useCourseRoster(courseId) {
  const [staff, setStaff] = useState(null)
  const [studentCount, setStudentCount] = useState(null)

  useEffect(() => {
    if (courseId == null) return
    getCourseStaff(courseId).then(setStaff).catch(() => {})
    getCourseStudents(courseId).then((students) => setStudentCount(students.length)).catch(() => {})
  }, [courseId])

  const taCount = staff?.filter((member) => member.role?.toLowerCase() === 'ta').length ?? null
  return { staff, studentCount, taCount }
}
