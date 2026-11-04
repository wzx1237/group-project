'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'
import { getStaff } from '@/exam-distribution/lib/api'
import styles from './StaffRosterPage.module.css'

const DEFAULT_TAS = [
  {
    id: 'ta-1',
    initials: 'MR',
    name: 'Maya Rivera',
    email: 'mrivera@umd.edu',
    role: 'TA',
    questions: 'Q1, Q3',
  },
  {
    id: 'ta-2',
    initials: 'SK',
    name: 'Sarah Kim',
    email: 'skim@umd.edu',
    role: 'TA',
    questions: 'Q1, Q2',
  },
  {
    id: 'ta-3',
    initials: 'AT',
    name: 'Arjun Taylor',
    email: 'ataylor@umd.edu',
    role: 'TA',
    questions: 'Q2, Q3, Q4',
  },
]

function getInitials(nameOrEmail = '') {
  const parts = nameOrEmail.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return nameOrEmail.slice(0, 2).toUpperCase() || 'TA'
}

export default function StaffRosterPage() {
  const { course, assignments } = useCourse() || {}
  const { user } = useAuth() || {}
  const [taList, setTaList] = useState(DEFAULT_TAS)
  const [newTaInput, setNewTaInput] = useState('')

  useEffect(() => {
    getStaff()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .filter((member) => {
              const role = member.role?.toLowerCase()
              return role !== 'professor' && role !== 'instructor'
            })
            .map((member, idx) => ({
              id: member.directory_id || member.id || member.email || `ta-${idx}`,
              initials:
                member.initials ||
                getInitials(member.name || member.directory_id || member.directoryId || member.email),
              name: member.name || member.directory_id || member.directoryId || 'Course TA',
              email: member.email || `${member.directory_id || member.directoryId || 'ta'}@umd.edu`,
              role: 'TA',
              questions: Array.isArray(member.questions)
                ? member.questions.join(', ')
                : member.questions || DEFAULT_TAS[idx % DEFAULT_TAS.length]?.questions || '—',
            }))
          if (normalized.length > 0) {
            setTaList(normalized)
          }
        }
      })
      .catch(() => {})
  }, [])

  const courseCode = course?.code || 'MATH 101'
  const courseName = course?.name || course?.title || 'Calculus I'
  const courseTerm = course?.term || 'Fall 2026'
  const courseSubtitle = `${courseCode} · ${courseName} · ${courseTerm}`
  const activeAssignmentName = assignments?.[2]?.title || assignments?.[2]?.name || 'Quiz 03'
  const instructorInitials = user?.initials || (user?.name ? getInitials(user.name) : 'JL')

  const handleAddTa = (e) => {
    e.preventDefault()
    const raw = newTaInput.trim()
    if (!raw) return

    const email = (raw.includes('@') ? raw : `${raw}@umd.edu`).toLowerCase()
    if (taList.some((ta) => ta.email.toLowerCase() === email)) return
    const handle = email.split('@')[0]
    const formattedName = handle
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')

    const newTa = {
      id: `ta-${Date.now()}`,
      initials: getInitials(formattedName),
      name: formattedName,
      email,
      role: 'TA',
      questions: 'Unassigned',
    }

    setTaList((prev) => [...prev, newTa])
    setNewTaInput('')
  }

  const handleRemoveTa = (id) => {
    setTaList((prev) => prev.filter((ta) => ta.id !== id))
  }

  const totalPeopleCount = 1 + taList.length

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* Page Title & Back to Courses Button */}
        <div className={styles.headerRow}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Course staff</h1>
            <p className={styles.subtitle}>{courseSubtitle}</p>
          </div>
          <Link href="/courses" className={styles.backButton}>
            ← Back to courses
          </Link>
        </div>

        {/* Main Two-Column Grid */}
        <div className={styles.contentGrid}>
          {/* Left Column: Staff Table Card */}
          <section className={styles.staffCard}>
            <div className={styles.staffCardHeader}>
              <h2 className={styles.cardTitle}>Staff</h2>
              <p className={styles.cardSubtext}>
                {totalPeopleCount} {totalPeopleCount === 1 ? 'person' : 'people'} · Assignments shown for {activeAssignmentName}
              </p>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.tableHeadRow}>
                    <th className={styles.th}>Name</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>{activeAssignmentName} questions</th>
                    <th className={styles.thActionHeader} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1: Logged-in Professor ("You") */}
                  <tr className={styles.trYou}>
                    <td className={styles.td}>
                      <div className={styles.personCell}>
                        <span className={styles.avatarProfessor}>{instructorInitials}</span>
                        <div className={styles.personInfo}>
                          <span className={styles.personName}>You</span>
                          <span className={styles.personEmail}>Signed in with UMD</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.roleProfessor}>Professor</span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.questionsText}>—</span>
                    </td>
                    <td className={styles.tdAction} />
                  </tr>

                  {/* TA Rows */}
                  {taList.map((ta) => (
                    <tr key={ta.id} className={styles.tr}>
                      <td className={styles.td}>
                        <div className={styles.personCell}>
                          <span className={styles.avatarTa}>{ta.initials}</span>
                          <div className={styles.personInfo}>
                            <span className={styles.personName}>{ta.name}</span>
                            <span className={styles.personEmail}>{ta.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.roleTa}>{ta.role}</span>
                      </td>
                      <td className={styles.td}>
                        <span className={styles.questionsText}>{ta.questions}</span>
                      </td>
                      <td className={styles.tdAction}>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => handleRemoveTa(ta.id)}
                        >
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
                      </td>
                    </tr>
                  ))}
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

          {/* Right Column: Add a TA + Permissions Info */}
          <aside className={styles.sidebar}>
            {/* Card 1: Add a TA */}
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

            {/* Card 2: What TAs can do */}
            <div className={styles.sideCard}>
              <h2 className={styles.sideCardTitle}>What TAs can do</h2>
              <ul className={styles.permissionList}>
                {[
                  'Grade and comment on every exam',
                  'Edit rubrics and answer keys',
                  'Upload exams and assign graders',
                  'Release grades and student reports',
                ].map((item) => (
                  <li key={item} className={styles.permissionItem}>
                    <svg
                      className={styles.checkIcon}
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className={styles.permissionFooter}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Only you can add or remove TAs.</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
