'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageNotice } from '@/components/layout/PageNotice'
import { Button } from '@/components/ui/Button'
import { useCourse } from '@/context/CourseContext'
import { useCourseRoster } from '@/hooks/useCourseRoster'
import { createCourse } from '@/exam-distribution/lib/api'
import styles from './courses.module.css'

const GRADEFLOW_COLORS = [
  '#0f6e56', // primary gradeflow emerald
  '#115e59', // deep forest teal
  '#1e4e5f', // slate teal
  '#2d5a4c', // sage pine
  '#0d9488', // vibrant teal
]

// one course card on the dashboard without bottom footer buttons
function CourseTile({ course, color, studentCount, taCount, onOpen }) {
  const courseFullTitle = [course.code, course.instructor?.toUpperCase()].filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.courseCard}
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpen()
        }
      }}
    >
      {/* gradeflow emerald banner */}
      <div
        className={styles.cardBanner}
        style={{ backgroundColor: color }}
      >
        <span className={styles.roleBadge}>
          {course.role === 'instructor' ? 'Professor' : 'TA'}
        </span>
        <button
          type="button"
          className={styles.threeButtonMenu}
          aria-label="Course options"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      <div className={styles.cardBody}>
        <h2
          className={styles.cardCourseTitle}
          style={{ color }}
          title={courseFullTitle}
        >
          {courseFullTitle}
        </h2>
        <p className={styles.cardCourseCode}>{course.code}</p>
        <p className={styles.cardTerm}>
          {[
            course.term,
            studentCount != null && `${studentCount} students`,
            taCount != null && `${taCount} ${taCount === 1 ? 'TA' : 'TAs'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

function AddCourseDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ code: '', title: '', term: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreated(await createCourse(form))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="add-course-title">
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 id="add-course-title" className={styles.dialogTitle}>Add course</h2>
        <label className={styles.field}>
          Course code
          <input
            className={styles.input}
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Title (optional)
          <input
            className={styles.input}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Term
          <input
            className={styles.input}
            required
            value={form.term}
            onChange={(e) => setForm({ ...form, term: e.target.value })}
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.dialogActions}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create course'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// main courses page displaying one card for every enrolled course
export default function CoursesDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { courses, loading, error, refresh, signOut } = useCourse() || {}
  const { studentCount, taCount } = useCourseRoster()
  const [showAddCourse, setShowAddCourse] = useState(false)

  async function handleCourseCreated(course) {
    await refresh()
    setShowAddCourse(false)
    router.push(`/courses/${course.course_id}`)
  }

  const addCourseDialog = showAddCourse && (
    <AddCourseDialog onClose={() => setShowAddCourse(false)} onCreated={handleCourseCreated} />
  )

  const forceEmpty = searchParams?.get('empty') === '1'
  const hasNoCourses = forceEmpty || !courses?.length

  // terminates the active staff session and redirects to login
  const handleSignOut = () => {
    if (typeof signOut === 'function') {
      signOut()
    }
    router.push('/login')
  }

  // 0. loading and error states
  if (loading) return <PageNotice title="Loading…" back={false} />
  if (error && !courses?.length) {
    return (
      <PageNotice title="Could not load your courses" actionLabel="Try again" onAction={refresh}>
        {error}
      </PageNotice>
    )
  }

  // 1. empty state view when staff member has no assigned courses
  if (hasNoCourses) {
    return (
      <main className={styles.page}>
        <div className={styles.emptyStateWrapper}>
          <div className={styles.emptyIconCircle} aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>

          <h1 className={styles.emptyTitle}>You’re not on any courses yet</h1>
          <p className={styles.emptySubtitle}>
            If you’re a TA, ask your course’s professor to add you with your UMD email.
          </p>

          <div className={styles.emptyActions}>
            <Button variant="primary" onClick={() => setShowAddCourse(true)}>
              Add course
            </Button>
            <button
              type="button"
              className={styles.signOutButton}
              onClick={handleSignOut}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </div>

          <div className={styles.studentNoticeBox}>
            <svg
              className={styles.studentNoticeIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
            </svg>
            <span>
              Students don’t sign in. Your instructor will share your graded report.
            </span>
          </div>
        </div>
        {addCourseDialog}
      </main>
    )
  }

  // 2. default canvas-style course card grid view
  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Courses</h1>
          <p className={styles.details}>
            {[
              courses[0]?.term || 'Fall 2026',
              `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {courses.some((c) => c.role === 'instructor') && (
          <Button variant="primary" onClick={() => setShowAddCourse(true)}>
            Add course
          </Button>
        )}
      </div>

      <div className={styles.cardGrid}>
        {courses.map((course, index) => (
          <CourseTile
            key={course.id}
            course={course}
            color={GRADEFLOW_COLORS[index % GRADEFLOW_COLORS.length]}
            studentCount={studentCount}
            taCount={taCount}
            onOpen={() => router.push(`/courses/${course.id}`)}
          />
        ))}
      </div>
      {addCourseDialog}
    </main>
  )
}