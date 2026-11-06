import { useEffect, useState } from 'react'
import { getStaff, getStudents } from '@/exam-distribution/lib/api'

// staff and student counts for course cards; these come from the roster, which is not scoped per course yet
export function useCourseRoster() {
  const [staff, setStaff] = useState(null)
  const [studentCount, setStudentCount] = useState(null)

  useEffect(() => {
    getStaff().then(setStaff).catch(() => {})
    getStudents().then((students) => setStudentCount(students.length)).catch(() => {})
  }, [])

  const taCount = staff?.filter((member) => member.role?.toLowerCase() === 'ta').length ?? null
  return { staff, studentCount, taCount }
}
