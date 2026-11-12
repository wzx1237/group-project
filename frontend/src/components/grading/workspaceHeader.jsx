import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatPoints, plural } from '@/lib/rubric'
import { icon } from './icon'
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
export function WorkspaceHeader({ student, uploadedAt, progress, totalPoints, position, onPrevious, onNext, regradeCount = 0 }) {
  const { label, tone } = status(progress, regradeCount)

  return (
    <header className={styles.header}>
      <div className={styles.student}>
        <Avatar name={student.name} className={styles.avatar} />
        <div className={styles.details}>
          <h1 className={styles.name}>{student.name}</h1>
          <p className={styles.meta}>
            Student ID {student.uid}
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
          <Button onClick={onPrevious} disabled={position.index === 0}>
            <ChevronLeft {...icon} size={16} />
            Previous
          </Button>
          <span className={styles.position}>
            {position.index + 1} / {position.count}
          </span>
          <Button onClick={onNext} disabled={position.index === position.count - 1}>
            <ChevronRight {...icon} size={16} />
            Next student
          </Button>
        </nav>
      </div>
    </header>
  )
}
