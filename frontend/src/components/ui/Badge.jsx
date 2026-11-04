import styles from './Badge.module.css'

export function Badge({ tone = 'soft', children }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
