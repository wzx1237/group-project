'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'
import { getStaff } from '@/exam-distribution/lib/api'
import styles from './StaffRosterPage.module.css'

// derives two-letter initials from full name or directory id
function getInitials(nameOrEmail = '') {
  const parts = nameOrEmail.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return nameOrEmail.slice(0, 2).toUpperCase() || 'TA'
}

// Turns a staff row from /api/staff into a table row.
function toMember(member) {
  const name = member.name || member.directory_id
  return {
    id: member.directory_id,
    initials: getInitials(name),
    name,
    email: member.email || `${member.directory_id}@umd.edu`,
    role: member.role?.toLowerCase() === 'instructor' ? 'instructor' : 'ta',
  }
}

// course staff roster management page
export default function StaffRosterPage() {
  const { course } = useCourse() || {}
  const { user } = useAuth() || {}
  const [staff, setStaff] = useState(null)
  const [error, setError] = useState('')
  const [newTaInput, setNewTaInput] = useState('')

  useEffect(() => {
    getStaff()
      .then((data) => setStaff(data.map(toMember)))
      .catch((err) => setError(err.message))
  }, [])

  // professors first, then TAs, each by name
  const members = [...(staff ?? [])].sort(
    (a, b) => (a.role === 'instructor' ? 0 : 1) - (b.role === 'instructor' ? 0 : 1) || a.name.localeCompare(b.name),
  )
  const isInstructor = members.some((m) => m.id === user?.directory_id && m.role === 'instructor')
  const instructors = members.filter((m) => m.role === 'instructor').map((m) => m.name)
  const courseSubtitle = [course?.code, instructors.join(', '), course?.term].filter(Boolean).join(' · ')

  // appends a new ta member to the local roster list
  const handleAddTa = (e) => {
    e.preventDefault()
    const raw = newTaInput.trim()
    if (!raw) return

    const email = (raw.includes('@') ? raw : `${raw}@umd.edu`).toLowerCase()
    if (members.some((m) => m.email.toLowerCase() === email)) return
    const handle = email.split('@')[0]
    const formattedName = handle
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')

    const newTa = {
      id: handle,
      initials: getInitials(formattedName),
      name: formattedName,
      email,
      role: 'ta',
    }

    setStaff((prev) => [...(prev ?? []), newTa])
    setNewTaInput('')
  }

  // removes a ta member from the active roster view
  const handleRemoveTa = (id) => {
    setStaff((prev) => prev.filter((m) => m.id !== id))
  }

  const totalPeopleCount = members.length

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* page title & back to courses button */}
        <div className={styles.headerRow}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Course staff</h1>
            <p className={styles.subtitle}>{courseSubtitle}</p>
          </div>
          <Link href="/courses" className={styles.backButton}>
            ← Back to courses
          </Link>
        </div>

        {/* main two-column grid */}
        <div className={styles.contentGrid}>
          {/* left column: staff table card */}
          <section className={styles.staffCard}>
            <div className={styles.staffCardHeader}>
              <h2 className={styles.cardTitle}>Staff</h2>
              <p className={styles.cardSubtext}>
                {totalPeopleCount} {totalPeopleCount === 1 ? 'person' : 'people'}
              </p>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.tableHeadRow}>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.thActionHeader} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {!staff && (
                    <tr className={styles.tr}>
                      <td className={styles.td} colSpan={3}>
                        {error ? `Could not load the course staff: ${error}` : 'Loading staff…'}
                      </td>
                    </tr>
                  )}
                  {members.map((m) => {
                    const isYou = m.id === user?.directory_id
                    const isProfessor = m.role === 'instructor'
                    return (
                      <tr key={m.id} className={isYou ? styles.trYou : styles.tr}>
                        <td className={styles.td}>
                          <div className={styles.personCell}>
                            <span className={isProfessor ? styles.avatarProfessor : styles.avatarTa}>{m.initials}</span>
                            <div className={styles.personInfo}>
                              <span className={styles.personName}>
                                {m.name}
                                {isYou && ' (you)'}
                              </span>
                              <span className={styles.personEmail}>{m.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className={styles.td}>
                          <span className={isProfessor ? styles.roleProfessor : styles.roleTa}>
                            {isProfessor ? 'Professor' : 'TA'}
                          </span>
                        </td>
                        <td className={styles.tdAction}>
                          {isInstructor && !isProfessor && (
                            <button type="button" className={styles.removeButton} onClick={() => handleRemoveTa(m.id)}>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.tableFooter}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                Removing a TA ends their access to this course. Their grades and comments stay in the change log.
              </span>
            </div>
          </section>

          {/* right column: add a ta (instructors only) */}
          {isInstructor && (
            <aside className={styles.sidebar}>
            {/* card 1: add a ta */}
            <form className={styles.sideCard} onSubmit={handleAddTa}>
              <h2 className={styles.sideCardTitle}>Add a TA</h2>
              <div className={styles.inputGroup}>
                <label htmlFor="ta-email-input" className={styles.label}>
                  UMD email or Directory ID
                </label>
                <div className={styles.inputWrapper}>
                  <svg
                    className={styles.inputIcon}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <input
                    id="ta-email-input"
                    type="text"
                    className={styles.input}
                    placeholder="e.g. jdoe@umd.edu or jdoe"
                    value={newTaInput}
                    onChange={(e) => setNewTaInput(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className={styles.addButton}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Add TA
              </button>

              <p className={styles.helperText}>
                They&apos;ll see this course the next time they sign in with UMD.
              </p>
            </form>
            </aside>
          )}
        </div>
      </div>
    </main>
  )
}