import Link from 'next/link'
import styles from '@/app/courses/courses.module.css'

// a centered message page, such as "Course not found", with an action button or a link back to the courses
export function PageNotice({ title, children, actionLabel, onAction, back = true }) {
  return (
    <main className={styles.page}>
      <div className={styles.emptyStateWrapper}>
        <h1 className={styles.emptyTitle}>{title}</h1>
        {children && <p className={styles.emptySubtitle}>{children}</p>}
        {onAction ? (
          <button type="button" className={styles.signOutButton} onClick={onAction}>
            {actionLabel}
          </button>
        ) : (
          back && (
            <Link href="/courses" className={styles.signOutButton}>
              ← Back to Courses
            </Link>
          )
        )}
      </div>
    </main>
  )
}
