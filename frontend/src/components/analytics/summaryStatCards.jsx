import { formatNumber } from '@/lib/rubric'
import styles from './analytics.module.css'

const STATS = [
  ['average', 'Class average'],
  ['median', 'Median'],
  ['highest', 'Highest'],
  ['lowest', 'Lowest'],
]

export function SummaryStatCards({ stats, totalPoints }) {
  return (
    <dl className={styles.stats}>
      {STATS.map(([key, label]) => (
        <div key={key} className={styles.stat}>
          <dt>{label}</dt>
          <dd>
            <span className={styles.statValue}>{stats ? formatNumber(stats[key]) : '—'}</span> / {totalPoints}
          </dd>
        </div>
      ))}
    </dl>
  )
}
