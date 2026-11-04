import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { formatDue } from '@/exam-distribution/lib/status'
import { coursePath } from '@/lib/routes'
import { ExamRow } from './examRow'
import styles from './courseCard.module.css'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function rowState(assignment) {
  const uploads = assignment.uploads
  if (uploads.length === 0) return { status: null, progress: null, note: 'No uploads yet' }
  if (uploads.some((u) => u.status === 'failed' || u.matching === 'failed')) {
    return { status: { label: 'Failed', tone: 'danger' }, progress: null, note: 'Open to retry' }
  }
  if (uploads.some((u) => u.status !== 'processed' || u.matching === 'running')) {
    return { status: { label: 'Processing', tone: 'outline' }, progress: null, note: 'Splitting or reading UIDs…' }
  }
  const exams = uploads.flatMap((u) => u.submissions)
  if (uploads.some((u) => u.matching !== 'done')) {
    return { status: { label: 'Needs matching', tone: 'warning' }, progress: null, note: `${plural(exams.length, 'exam')} found` }
  }
  const matched = exams.filter((s) => s.match.state !== 'needs_review').length
  return {
    status: matched === exams.length ? { label: 'Matched', tone: 'soft' } : { label: 'Needs assignment', tone: 'warning' },
    progress: { done: matched, total: exams.length },
    note: `${matched} of ${plural(exams.length, 'exam')} matched`,
  }
}

export function CourseCard({ course, assignments, staff, studentCount, onOpenStaff }) {
  const base = coursePath(course)
  const taCount = staff?.filter((person) => person.role === 'ta').length
  const details = [
    course.term,
    course.instructor,
    studentCount != null && plural(studentCount, 'student'),
    taCount != null && plural(taCount, 'TA'),
  ].filter(Boolean)
  const byDue = [...assignments].sort((a, b) => a.due.localeCompare(b.due))

  return (
    <section className={styles.card}>
      <header className={styles.heading}>
        <div className={styles.identity}>
          <h2 className={styles.title}>{course.code}</h2>
          <p className={styles.details}>{details.join(' · ')}</p>
        </div>
        <div className={styles.actions}>
          {staff && (
            <div className={styles.staff}>
              {staff.map((person) => (
                <Avatar key={person.directory_id} name={person.name} className={styles.staffAvatar} />
              ))}
            </div>
          )}
          <Button href={`${base}/roster`}>Student roster</Button>
          {onOpenStaff ? (
            <Button onClick={onOpenStaff}>Staff roster</Button>
          ) : (
            <Button href="/courses/staff">Staff roster</Button>
          )}
        </div>
      </header>
      <div className={styles.columns} aria-hidden="true">
        <span>Assignment</span>
        <span>Due</span>
        <span>Status</span>
        <span>Progress</span>
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