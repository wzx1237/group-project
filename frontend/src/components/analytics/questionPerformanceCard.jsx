import { plural } from '@/lib/rubric'
import styles from './analytics.module.css'

// The share of students graded on each question who got full credit on it
export function QuestionPerformanceCard({ questions }) {
  return (
    <section className={styles.card} aria-labelledby="question-performance-heading">
      <div className={styles.cardHeading}>
        <h2 id="question-performance-heading" className={styles.cardTitle}>
          Question performance 
        </h2>
      </div>

      {questions.length ? (
        <ul className={styles.questionList}>
          {questions.map((q) => {
            const percent = q.graded ? Math.round((q.correct / q.graded) * 100) : null
            return (
              <li key={q.qid} className={styles.questionRow}>
                <span className={styles.questionName} title={q.title || undefined}>
                  {q.title ? `${q.label} · ${q.title}` : q.label}
                </span>
                <span className={styles.questionMeta}>
                  {q.graded ? `${q.correct} of ${q.graded} correct` : 'Not graded yet'}
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <span className={styles.barFill} style={{ width: `${percent ?? 0}%` }} />
                </span>
                <span className={styles.percent}>{percent === null ? '—' : `${percent}%`}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={styles.empty}>The rubric has no questions yet.</p>
      )}
    </section>
  )
}
