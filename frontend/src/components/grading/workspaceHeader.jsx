import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatPoints, plural } from '@/lib/rubric'
import styles from './workspaceHeader.module.css'

function formatUploaded(iso) {
  const date = new Date(iso)
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day} at ${time}`
}

function status({ gradedCount, questionCount }, regradeCount) {
  if (regradeCount) return { label: 'Needs regrade', tone: 'warning' }
  if (questionCount && gradedCount === questionCount) return { label: 'Graded', tone: 'outline' }
  return gradedCount ? { label: 'In progress', tone: 'soft' } : { label: 'Not started', tone: 'neutral' }
}

// `regradeCount` is how many open regrade queues hold one of this student's answers.
export function WorkspaceHeader({ student, uploadedAt, progress, totalPoints, backHref, onSubmit, submitting, submitDisabled, questionLabel, regradeCount = 0 }) {
  const { label, tone } = status(progress, regradeCount)

  return (
    <header className={styles.header}>
      <div className={styles.student}>
        <Avatar name={student.name} className={styles.avatar} />
        <div className={styles.details}>
          <h1 className={styles.name} title={student.name}>
            {student.name}
          </h1>
          <p className={styles.meta}>
            Student ID {student.uid}
            {questionLabel && ` · ${questionLabel}`}
            {uploadedAt && ` · Uploaded ${formatUploaded(uploadedAt)}`}
          </p>
        </div>
        <Badge tone={tone}>{label}</Badge>
      </div>

      <div className={styles.progress}>
        <div className={styles.score}>
          <p className={styles.scoreValue}>
            {progress.gradedCount ? `${progress.earned} / ${formatPoints(progress.gradedPoints)} graded` : 'Not graded yet'}
          </p>
          <p className={styles.meta}>
            {progress.gradedCount} of {plural(progress.questionCount, 'question')} · {formatPoints(totalPoints)} total
          </p>
        </div>
        <nav className={styles.navigation} aria-label="Students">
          <Button href={backHref}>Back to students</Button>
          <Button variant="primary" onClick={onSubmit} disabled={submitting || submitDisabled}>
            {submitting ? 'Submitting…' : 'Submission'}
          </Button>
        </nav>
      </div>
    </header>
  )
}
