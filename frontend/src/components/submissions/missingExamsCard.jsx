import { Badge } from '@/components/ui/Badge'
import styles from './submissions.module.css'

export function MissingExamsCard({ students }) {
  const missing = students.filter((s) => !s.submission)

  return (
    <section className={styles.card} aria-labelledby="missing-heading">
      <div className={styles.cardHeading}>
        <h2 id="missing-heading" className={styles.cardTitle}>
          Students without an exam
        </h2>
        <Badge tone={missing.length ? 'warning' : 'neutral'}>{missing.length}</Badge>
      </div>
      {missing.length ? (
        <>
          <ul className={styles.missingList}>
            {missing.map((s) => (
              <li key={s.uid}>
                <span>{s.name}</span>
                <span className={styles.muted}>{s.uid}</span>
              </li>
            ))}
          </ul>
          <p className={styles.muted}>Upload a late exam above, or assign them an exam that needs review.</p>
        </>
      ) : (
        <p className={styles.muted}>Every student on the roster has an exam.</p>
      )}
    </section>
  )
}
