import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { RoleBadge } from '@/components/layout/RoleBadge'
import { ASSIGNMENT_STATUSES, formatDue } from '@/exam-distribution/lib/status'
import { coursePath } from '@/lib/routes'
import { ExamRow } from './examRow'
import styles from './courseCard.module.css'

// formats singular or plural counts for display
const kindLabel = (kind) => (kind || 'exam').replace(/\b\w/g, (c) => c.toUpperCase())
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// a failed or still-running upload, shown as a note while scans are being collected (it is not a status)
function uploadWarning(assignment) {
  const uploads = assignment.uploads || []
  if (uploads.some((u) => u.status === 'failed' || u.matching === 'failed')) return 'An upload failed · open to retry'
  if (uploads.some((u) => u.status !== 'processed' || u.matching === 'running')) return 'Splitting or reading UIDs…'
  return null
}

// the stored status badge and real grading progress (no-shows count as graded) for an assignment row
function rowState(assignment) {
  const status = ASSIGNMENT_STATUSES[assignment.status]
  const warning = assignment.status === 'collecting' ? uploadWarning(assignment) : null
  const { graded = 0, total = 0 } = assignment.progress || {}
  if (assignment.status === 'draft' || total === 0) {
    return { status, progress: null, note: warning || (assignment.status === 'draft' ? 'Setting up' : 'No students yet') }
  }
  return {
    status,
    progress: { done: graded, total },
    note: warning || `${graded} of ${plural(total, 'student')} graded`,
  }
}

// renders the main course card with staff avatars exam list and setup actions
export function CourseCard({ course, assignments = [], staff, studentCount, onOpenStaff, onOpenManageTAs, onDeleteAssignment }) {
  const base = coursePath(course)
  const isInstructor = course.role === 'instructor'
  const taCount = staff?.filter((person) => person.role?.toLowerCase() === 'ta').length
  const details = [
    course.term,
    studentCount != null && plural(studentCount, 'student'),
    taCount != null && plural(taCount, 'TA'),
  ].filter(Boolean)
  const byDue = [...assignments].sort((a, b) => (a.due || '').localeCompare(b.due || ''))

  return (
    <section className={`${styles.card} ${isInstructor ? styles.withDelete : ''}`}>
      <header className={styles.heading}>
        <div className={styles.identity}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 className={styles.title}>{course.code} · {course.title || course.name || 'Course'}</h2>
            <RoleBadge role={course.role || 'Professor'} />
          </div>
          <p className={styles.details}>{details.join(' · ')}</p>
        </div>
        <div className={styles.actions}>
          {staff && (
            <div className={styles.staff}>
              {staff.map((person) => (
                <Avatar key={person.directory_id || person.email || person.name} name={person.name} className={styles.staffAvatar} />
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={onOpenManageTAs || onOpenStaff}>
            Manage TAs
          </Button>
          <Link href={`${base}/roster`}>
            <Button variant="secondary">Students</Button>
          </Link>
          {isInstructor && (
            <Link href={`${base}/exams/new`}>
              <Button>
                <Plus size={14} /> Create Assignment
              </Button>
            </Link>
          )}
        </div>
      </header>
      <div className={styles.columns} aria-hidden="true">
        <span>Assignment</span>
        <span>Assignment Type</span>
        <span>Date</span>
        <span>Status</span>
        <span>Grading progress</span>
        <span />
        {isInstructor && <span />}
      </div>
      <ul className={styles.rows}>
        {byDue.map((a) => (
          <ExamRow key={a.id} href={`${base}/exams/${a.id}/upload`} title={a.title} type={kindLabel(a.kind)} editHref={isInstructor ? `${base}/exams/${a.id}/edit` : undefined} onDelete={isInstructor ? () => onDeleteAssignment?.(a) : undefined} date={formatDue(a.due)} {...rowState(a)} />
        ))}
      </ul>
    </section>
  )
}
