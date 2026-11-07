'use client'

import { useRouter } from 'next/navigation'
import { CourseCard } from '@/components/dashboard/courseCard'
import * as examsSetupService from '@/services/examsSetupService'
import { useCourse } from '@/context/CourseContext'
import { useCourseRoster } from '@/hooks/useCourseRoster'
import styles from '../courses.module.css'

// one course: its assignments and their grading progress
export default function CoursePage() {
  const router = useRouter()
  const { course, assignments, refresh } = useCourse()
  const { staff, studentCount } = useCourseRoster(course?.id)
  const openStaff = () => router.push(`/courses/${course.id}/staff`)

  async function deleteAssignment(a) {
    const ok = window.confirm(
      `Delete "${a.title}"?\n\nThis permanently removes the assignment with its rubric, uploaded papers and all grades. This cannot be undone.`,
    )
    if (!ok) return
    try {
      await examsSetupService.deleteAssignment(a.id)
      await refresh?.()
    } catch (err) {
      window.alert(`Could not delete "${a.title}": ${err.message}`)
    }
  }

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
        onDeleteAssignment={deleteAssignment}
      />
    </main>
  )
}
