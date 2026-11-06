'use client'

import { useRouter } from 'next/navigation'
import { CourseCard } from '@/components/dashboard/courseCard'
import { useCourse } from '@/context/CourseContext'
import { useCourseRoster } from '@/hooks/useCourseRoster'
import styles from '../courses.module.css'

// one course: its assignments and their grading progress
export default function CoursePage() {
  const router = useRouter()
  const { course, assignments } = useCourse()
  const { staff, studentCount } = useCourseRoster()
  const openStaff = () => router.push(`/courses/${course.id}/staff`)

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Courses</h1>
          <p className={styles.details}>{course.term}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.backButton} onClick={() => router.push('/courses')}>
            ← Back to Courses
          </button>
        </div>
      </div>
      <CourseCard
        course={course}
        assignments={assignments}
        staff={staff}
        studentCount={studentCount}
        onOpenStaff={openStaff}
      />
    </main>
  )
}
