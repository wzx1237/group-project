'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CourseCard } from '@/components/dashboard/courseCard'
import { useCourse } from '@/context/CourseContext'
import { getStaff, getStudents } from '@/exam-distribution/lib/api'
import styles from './courses.module.css'

const GRADEFLOW_COLORS = [
  '#0f6e56', // Primary GradeFlow Emerald
  '#115e59', // Deep Forest Teal
  '#1e4e5f', // Slate Teal
  '#2d5a4c', // Sage Pine
  '#0d9488', // Vibrant Teal
]

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

/**
 * main courses page
 */
export default function CoursesDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { course, assignments, signOut } = useCourse() || {}
  const [staff, setStaff] = useState(null)
  const [taList, setTaList] = useState(DEFAULT_TAS)
  const [newTaInput, setNewTaInput] = useState('')
  const [studentCount, setStudentCount] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [showStaffPage, setShowStaffPage] = useState(false)

  useEffect(() => {
    getStaff()
      .then((data) => {
        setStaff(data)
        if (Array.isArray(data) && data.length > 0) {
          const normalized = data
            .filter((member) => member.role?.toLowerCase() !== 'professor')
            .map((member, idx) => ({
              id: member.directory_id || member.id || member.email || `ta-${idx}`,
              initials:
                member.initials ||
                getInitials(member.name || member.directory_id || member.email),
              name:
                member.name ||
                member.directory_id ||
                member.directoryId ||
                'Course TA',
              email:
                member.email ||
                `${member.directory_id || member.directoryId || 'ta'}@umd.edu`,
              role: 'TA',
              questions: Array.isArray(member.questions)
                ? member.questions.join(', ')
                : member.questions ||
                  DEFAULT_TAS[idx % DEFAULT_TAS.length]?.questions ||
                  '—',
            }))
          if (normalized.length > 0) {
            setTaList(normalized)
          }
        }
      })
      .catch(() => {})

    getStudents()
      .then((students) => setStudentCount(students.length))
      .catch(() => {})
  }, [])

  const forceEmpty = searchParams?.get('empty') === '1'
  const hasNoCourses =
    forceEmpty ||
    !course ||
    (Array.isArray(course) && course.length === 0) ||
    (!course.code && !course.name && !course.id)

  const handleSignOut = () => {
    if (typeof signOut === 'function') {
      signOut()
    }
    router.push('/login')
  }

  // 0. "No courses" Empty State View
  if (hasNoCourses) {
    return (
      <main className={styles.page}>
        <div className={styles.emptyStateWrapper}>
          <div className={styles.emptyIconCircle} aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </div>

          <h1 className={styles.emptyTitle}>You’re not on any courses yet</h1>
          <p className={styles.emptySubtitle}>
            If you’re a TA, ask your course’s professor to add you with your UMD email.
          </p>

          <button
            type="button"
            className={styles.signOutButton}
            onClick={handleSignOut}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>

          <div className={styles.studentNoticeBox}>
            <svg
              className={styles.studentNoticeIcon}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
            </svg>
            <span>
              Students don’t sign in. Your instructor will share your graded report.
            </span>
          </div>
        </div>
      </main>
    )
  }

  const alertCount = Array.isArray(assignments)
    ? assignments.filter(
        (a) =>
          a.status === 'Failed' ||
          a.status === 'Needs assignment' ||
          a.status === 'failed' ||
          a.status === 'needs_assignment'
      ).length
    : 0

  const cardColor = course?.color || GRADEFLOW_COLORS[0]
  const courseCode = course?.code || course?.name || 'CMSC250'
  const courseFullTitle =
    course?.fullTitle ||
    course?.title ||
    `${courseCode} · ${course?.instructor || 'Course'}`
  const taCount = taList.length

  const activeAssignmentName =
    assignments?.[1]?.title ||
    assignments?.[1]?.name ||
    assignments?.[0]?.title ||
    assignments?.[0]?.name ||
    'Quiz 03'

  const instructorInitials = getInitials(course?.instructor || 'LH')

  const handleAddTa = (e) => {
    e.preventDefault()
    const raw = newTaInput.trim()
    if (!raw) return

    const email = raw.includes('@') ? raw : `${raw}@umd.edu`
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
      questions: '—',
    }

    setTaList((prev) => [...prev, newTa])
    setNewTaInput('')
  }

  const handleRemoveTa = (id) => {
    setTaList((prev) => prev.filter((ta) => ta.id !== id))
  }

  // 1. Course Staff Management View
  if (showStaffPage) {
    const totalPeopleCount = 1 + taList.length

    return (
      <main className={styles.page}>
        <div className={styles.headerRow}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Course staff</h1>
            <p className={styles.details}>
              {courseFullTitle} · {course?.term || 'Fall 2026'}
            </p>
          </div>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setShowStaffPage(false)}
          >
            ← Back to courses
          </button>
        </div>

        <div className={styles.staffContentGrid}>
          {/* Left Column: Staff Table Card */}
          <section className={styles.staffCard}>
            <div className={styles.staffCardHeader}>
              <h2 className={styles.staffCardTitle}>Staff</h2>
              <p className={styles.staffCardSubtext}>
                {totalPeopleCount}{' '}
                {totalPeopleCount === 1 ? 'person' : 'people'} · Assignments
                shown for {activeAssignmentName}
              </p>
            </div>

            <table className={styles.staffTable}>
              <thead>
                <tr className={styles.staffTableHeadRow}>
                  <th className={styles.staffTh}>Name</th>
                  <th className={styles.staffTh}>Role</th>
                  <th className={styles.staffTh}>
                    {activeAssignmentName} questions
                  </th>
                  <th className={styles.staffTh} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {/* Logged-in Professor Row */}
                <tr className={styles.staffTrYou}>
                  <td className={styles.staffTd}>
                    <div className={styles.personCell}>
                      <span className={styles.staffAvatar}>
                        {instructorInitials}
                      </span>
                      <div className={styles.personInfo}>
                        <span className={styles.personName}>You</span>
                        <span className={styles.personEmail}>
                          Signed in with UMD
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className={styles.staffTd}>
                    <span className={styles.roleProfessor}>Professor</span>
                  </td>
                  <td className={styles.staffTd}>
                    <span className={styles.questionsText}>—</span>
                  </td>
                  <td className={styles.staffTdAction} />
                </tr>

                {/* TA Rows */}
                {taList.map((ta) => (
                  <tr key={ta.id} className={styles.staffTr}>
                    <td className={styles.staffTd}>
                      <div className={styles.personCell}>
                        <span className={styles.staffAvatar}>
                          {ta.initials}
                        </span>
                        <div className={styles.personInfo}>
                          <span className={styles.personName}>{ta.name}</span>
                          <span className={styles.personEmail}>{ta.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.staffTd}>
                      <span className={styles.roleTa}>{ta.role}</span>
                    </td>
                    <td className={styles.staffTd}>
                      <span className={styles.questionsText}>
                        {ta.questions}
                      </span>
                    </td>
                    <td className={styles.staffTdAction}>
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

            <div className={styles.staffTableFooter}>
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
                Removing a TA ends their access to this course. Their grades and
                comments stay in the change log.
              </span>
            </div>
          </section>

          {/* Right Column: Add a TA + What TAs can do */}
          <aside className={styles.staffSidebar}>
            <form className={styles.sideCard} onSubmit={handleAddTa}>
              <h2 className={styles.sideCardTitle}>Add a TA</h2>
              <div className={styles.inputGroup}>
                <label htmlFor="ta-email-input" className={styles.inputLabel}>
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
                    className={styles.textInput}
                    placeholder="e.g. jdoe@umd.edu or jdoe"
                    value={newTaInput}
                    onChange={(e) => setNewTaInput(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className={styles.addTaButton}>
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
                They&apos;ll see this course the next time they sign in with
                UMD.
              </p>
            </form>

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
      </main>
    )
  }

  // 2. Expanded Course Assignments Table View
  if (selectedCourseId) {
    return (
      <main className={styles.page}>
        <div className={styles.headerRow}>
          <div className={styles.heading}>
            <h1 className={styles.title}>Courses</h1>
            <p className={styles.details}>{course?.term} · 1 course</p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => setShowStaffPage(true)}
            >
              Manage TAs ({taCount})
            </button>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => setSelectedCourseId(null)}
            >
              ← Back to Courses
            </button>
          </div>
        </div>
        <CourseCard
          course={course}
          assignments={assignments}
          staff={staff}
          studentCount={studentCount}
          onOpenStaff={() => setShowStaffPage(true)}
        />
      </main>
    )
  }

  // 3. Default Canvas-Style Course Card Grid View
  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Courses</h1>
          <p className={styles.details}>{course?.term} · 1 course</p>
        </div>
      </div>

      <div className={styles.cardGrid}>
        <div
          role="button"
          tabIndex={0}
          className={styles.courseCard}
          onClick={() => setSelectedCourseId(course?.id || courseCode)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setSelectedCourseId(course?.id || courseCode)
            }
          }}
        >
          {/* GradeFlow Emerald Banner */}
          <div
            className={styles.cardBanner}
            style={{ backgroundColor: cardColor }}
          >
            <span className={styles.roleBadge}>
              {course?.role || 'Professor'}
            </span>
            <button
              type="button"
              className={styles.threeButtonMenu}
              aria-label="Course options"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </div>

          <div className={styles.cardBody}>
            <h2
              className={styles.cardCourseTitle}
              style={{ color: cardColor }}
              title={courseFullTitle}
            >
              {courseFullTitle}
            </h2>
            <p className={styles.cardCourseCode}>{courseCode}</p>
            <p className={styles.cardTerm}>
              {course?.term} · {studentCount ?? 6} students · {taCount}{' '}
              {taCount === 1 ? 'TA' : 'TAs'}
            </p>
          </div>

          <div className={styles.cardFooter}>
            {/* Needs Attention / Alerts Icon */}
            <span className={styles.cardIcon} title="Needs attention">
              {alertCount > 0 && (
                <span className={styles.badge}>{alertCount}</span>
              )}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>

            {/* Exams / Assignments Icon */}
            <span
              className={styles.cardIcon}
              title={`${assignments?.length || 0} Exams`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </span>

            {/* Manage TAs / Staff Roster Icon */}
            <button
              type="button"
              className={styles.cardIconButton}
              title="Manage Course Staff & TAs"
              onClick={(e) => {
                e.stopPropagation()
                setShowStaffPage(true)
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>

            {/* Submissions Folder Icon */}
            <span className={styles.cardIcon} title="Submissions">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}