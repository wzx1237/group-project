import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { studentLabel } from '@/exam-distribution/lib/status'
import styles from './submissions.module.css'

// Students with no exam yet. While the assignment is open, a TA can excuse one (makeup pending) or mark them a
// no-show (scored 0); both count as resolved for "Start grading". onMark(uid, null) undoes either.
export function MissingExamsCard({ students, open, onMark }) {
  const missing = students.filter((s) => !s.submission)
  const unresolved = missing.filter((s) => s.status === 'missing' || s.status === 'needs_review').length

  return (
    <section className={styles.card} aria-labelledby="missing-heading">
      <div className={styles.cardHeading}>
        <h2 id="missing-heading" className={styles.cardTitle}>
          Students without an exam
        </h2>
        <Badge tone={unresolved ? 'warning' : 'neutral'}>{missing.length}</Badge>
      </div>
      {missing.length ? (
        <>
          <ul className={styles.missingList}>
            {missing.map((s) => {
              const marked = s.status === 'excused' || s.status === 'no_show'
              return (
                <li key={s.uid} className={styles.missingRow}>
                  <span>
                    {s.name}
                    <span className={styles.muted}>
                      {' '}
                      · {s.uid}
                      {s.status && ` · ${studentLabel(s.progress)}`}
                    </span>
                  </span>
                  {open && onMark && (
                    <span className={styles.missingActions}>
                      {marked ? (
                        <Button size="sm" onClick={() => onMark(s.uid, null)}>
                          Undo
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => onMark(s.uid, 'excused')}>
                            Excuse
                          </Button>
                          <Button size="sm" onClick={() => onMark(s.uid, 'no_show')}>
                            No-show
                          </Button>
                        </>
                      )}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className={styles.muted}>Every student on the roster has an exam.</p>
      )}
    </section>
  )
}
