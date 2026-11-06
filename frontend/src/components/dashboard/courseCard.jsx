import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { RoleBadge } from '@/components/layout/RoleBadge'
import { formatDue } from '@/exam-distribution/lib/status'
import { coursePath } from '@/lib/routes'
import { ExamRow } from './examRow'
import styles from './courseCard.module.css'

// formats singular or plural counts for display
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// calculates the status label and progress percentage for an assignment exam row
function rowState(assignment) {
  const uploads = assignment.uploads || []
  if (uploads.length === 0) return { status: null, progress: null, note: 'No uploads yet' }
  if (uploads.some((u) => u.status === 'failed' || u.matching === 'failed')) {
    return { status: { label: 'Failed', tone: 'danger' }, progress: null, note: 'Open to retry' }
  }
  if (uploads.some((u) => u.status !== 'processed' || u.matching === 'running')) {
    return { status: { label: 'Processing', tone: 'outline' }, progress: null, note: 'Splitting or reading UIDs…' }
  }
  const exams = uploads.flatMap((u) => u.submissions || [])
  if (uploads.some((u) => u.matching !== 'done')) {
    return { status: { label: 'Needs matching', tone: 'warning' }, progress: null, note: `${plural(exams.length, 'exam')} found` }
  }
  const matched = exams.filter((s) => s.match?.state !== 'needs_review').length
  let status = { label: 'Grading', tone: 'soft' }
  if (matched !== exams.length) status = { label: 'Needs assignment', tone: 'warning' }
  else if (assignment.released_at) status = { label: 'Released', tone: 'neutral' }
  return {
    status,
    progress: { done: matched, total: exams.length },
    note: `${matched} of ${plural(exams.length, 'exam')} fully graded`,
  }
}

// renders the main course card with staff avatars exam list and setup actions
export function CourseCard({ course, assignments = [], staff, studentCount, onOpenStaff, onOpenManageTAs }) {
  const base = coursePath(course)
  const taCount = staff?.filter((person) => person.role?.toLowerCase() === 'ta').length
  const details = [
    course.term,
    studentCount != null && plural(studentCount, 'student'),
    taCount != null && plural(taCount, 'TA'),
  ].filter(Boolean)
  const byDue = [...assignments].sort((a, b) => (a.due || '').localeCompare(b.due || ''))

  return (
    <section className={styles.card}>
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
          <Link href={`${base}/exams/new`}>
            <Button>
              <Plus size={14} /> New exam
            </Button>
          </Link>
        </div>
      </header>
      <div className={styles.columns} aria-hidden="true">
        <span>Exam</span>
        <span>Date</span>
        <span>Status</span>
        <span>Grading progress</span>
        <span />
      </div>
      <ul className={styles.rows}>
        {byDue.map((a) => (
          <ExamRow key={a.id} href={`${base}/exams/${a.id}/upload`} title={a.title} date={formatDue(a.due)} {...rowState(a)} />
        ))}
      </ul>
    </section>
  )
}
