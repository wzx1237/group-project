import styles from './ProgressBar.module.css'

export function ProgressBar({ value, total }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return (
    <span className={styles.progress}>
      <span className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <span className={styles.fill} style={{ width: `${percent}%` }} />
      </span>
      <span className={styles.percent}>{percent}%</span>
    </span>
  )
}
