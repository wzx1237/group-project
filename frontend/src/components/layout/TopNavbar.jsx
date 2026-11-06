'use client'

import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import styles from './TopNavbar.module.css'

// renders the top navigation bar with default brand icon, breadcrumb trail, and user account menu
export function TopNavbar({ breadcrumbs = [], saveStatus, onOpenChangeLog, backAction, currentUser }) {
  return (
    <nav className={styles.bar}>
      <div className={styles.trail}>
        <Link href="/courses" className={styles.mark} aria-label="GradeFlow home">
          <GraduationCap size={16} color="white" aria-hidden="true" />
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