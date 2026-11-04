import Image from 'next/image'
import Link from 'next/link'
import { Avatar } from '@/components/ui/Avatar'
import styles from './TopNavbar.module.css'

/**
 * Renders the top navigation bar with GradeFlow branding, breadcrumb trail, save status, and user avatar.
 * @param {Object} props
 * @param {Array<{ label: string, href?: string }>} props.breadcrumbs - Navigation trail (e.g., MATH 101 > Quiz 03)
 * @param {'saved' | 'saving' | 'unsaved' | 'error'} [props.saveStatus] - Real-time autosave indicator state
 * @param {() => void} [props.onOpenChangeLog] - Opens the audit trail drawer when in the workspace
 * @param {{ label: string, href: string }} [props.backAction] - Back button configuration (e.g., "Back to submissions")
 * @param {{ name: string, initials: string, role: string }} props.currentUser - Logged-in staff profile
 */
export function TopNavbar({ breadcrumbs = [], saveStatus, onOpenChangeLog, backAction, currentUser }) {
  return (
    <nav className={styles.bar}>
      <div className={styles.trail}>
        <Link href="/courses" className={styles.mark} aria-label="GradeFlow home">
          <Image src="/icons/notebook-pen.svg" width={16} height={16} alt="" />
        </Link>
        <ol className={styles.crumbs}>
          {breadcrumbs.map((crumb) => (
            <li key={crumb.label}>{crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : crumb.label}</li>
          ))}
        </ol>
      </div>
      {currentUser && (
        <details className={styles.account}>
          <summary className={styles.trigger} aria-label={`Account menu for ${currentUser.name}`}>
            <Avatar name={currentUser.name} initials={currentUser.initials} />
          </summary>
          <div className={styles.menu}>
            <span className={styles.name}>{currentUser.name}</span>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className={styles.signOut}>
                Sign out
              </button>
            </form>
          </div>
        </details>
      )}
    </nav>
  )
}
