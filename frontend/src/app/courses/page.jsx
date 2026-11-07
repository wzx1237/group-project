'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, ChevronUp, Image as ImageIcon, Pencil } from 'lucide-react'
import { PageNotice } from '@/components/layout/PageNotice'
import { Button } from '@/components/ui/Button'
import { useCourse } from '@/context/CourseContext'
import { useCourseRoster } from '@/hooks/useCourseRoster'
import { createCourse, updateCourse } from '@/exam-distribution/lib/api'
import styles from './courses.module.css'

const GRADEFLOW_COLORS = [
  '#0f6e56', // primary gradeflow emerald
  '#115e59', // deep forest teal
  '#1e4e5f', // slate teal
  '#2d5a4c', // sage pine
  '#0d9488', // vibrant teal
]

// Precedence of semesters: Spring comes first, then Summer then Fall, then Winter
const SEMESTER_ORDER = {
  spring: 1,
  summer: 2,
  fall: 3,
  winter: 4,
  other: 5,
}

// Parses a term string like "Spring 2026", "Fall 2026", "Summer 2025" into semester, year, and canonical display name
function parseTerm(termStr) {
  if (!termStr || typeof termStr !== 'string') {
    return { semester: 'other', year: 0, displayName: 'Other' }
  }
  const clean = termStr.trim()
  const lower = clean.toLowerCase()

  let semester = 'other'
  let semesterDisplay = ''
  if (lower.includes('spring')) {
    semester = 'spring'
    semesterDisplay = 'Spring'
  } else if (lower.includes('summer')) {
    semester = 'summer'
    semesterDisplay = 'Summer'
  } else if (lower.includes('fall')) {
    semester = 'fall'
    semesterDisplay = 'Fall'
  } else if (lower.includes('winter')) {
    semester = 'winter'
    semesterDisplay = 'Winter'
  }

  const fourDigit = clean.match(/\b(19\d{2}|20\d{2})\b/)
  let year = 0
  if (fourDigit) {
    year = parseInt(fourDigit[1], 10)
  } else {
    const twoDigit = clean.match(/\b'?([2-9]\d)\b/)
    if (twoDigit) {
      year = 2000 + parseInt(twoDigit[1], 10)
    }
  }

  let displayName = clean
  if (semesterDisplay && year) {
    displayName = `${semesterDisplay} ${year}`
  } else if (semesterDisplay) {
    displayName = semesterDisplay
  } else if (year) {
    displayName = `${year}`
  }

  return { semester, year, displayName }
}

// one course card on the dashboard without bottom footer buttons
function CourseTile({ course, color, onOpen, isMenuOpen, onToggleMenu, onEditCourse, onSetImage }) {
  const courseId = course.id ?? course.course_id
  const { studentCount, taCount } = useCourseRoster(courseId)
  const courseFullTitle = [course.code, course.title || course.instructor?.toUpperCase()].filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.courseCard}
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onOpen()
        }
      }}
    >
      {/* gradeflow banner (emerald color or custom uploaded image) */}
      <div
        className={styles.cardBanner}
        style={{
          backgroundColor: color,
          backgroundImage: course.image ? `url(${course.image})` : undefined,
        }}
      >
        <span className={styles.roleBadge}>
          {course.role === 'instructor' ? 'Professor' : 'TA'}
        </span>
        <button
          type="button"
          className={styles.threeButtonMenu}
          aria-label="Course options"
          aria-haspopup="true"
          aria-expanded={isMenuOpen}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMenu(courseId)
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>

        {/* Options Dropdown Menu */}
        {isMenuOpen && (
          <div
            className={styles.optionsMenu}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.optionsMenuItem}
              onClick={(e) => {
                e.stopPropagation()
                onEditCourse(course)
              }}
            >
              <Pencil size={14} className={styles.menuIcon} />
              <span>Edit course details</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.optionsMenuItem}
              onClick={(e) => {
                e.stopPropagation()
                onSetImage(course)
              }}
            >
              <ImageIcon size={14} className={styles.menuIcon} />
              <span>{course.image ? 'Change card image' : 'Add image to card'}</span>
            </button>
          </div>
        )}
      </div>

      <div className={styles.cardBody}>
        <h2
          className={styles.cardCourseTitle}
          style={{ color }}
          title={courseFullTitle}
        >
          {courseFullTitle}
        </h2>
        <p className={styles.cardCourseCode}>{course.code}</p>
        <p className={styles.cardTerm}>
          {[
            course.term,
            studentCount != null && `${studentCount} students`,
            taCount != null && `${taCount} ${taCount === 1 ? 'TA' : 'TAs'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

function AddCourseDialog({ initialTerm = '', onClose, onCreated }) {
  const [form, setForm] = useState({ code: '', title: '', term: initialTerm || '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onCreated(await createCourse(form))
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="add-course-title">
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 id="add-course-title" className={styles.dialogTitle}>Add course</h2>
        <label className={styles.field}>
          Course code
          <input
            className={styles.input}
            required
            placeholder="e.g. CMSC451"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Title (optional)
          <input
            className={styles.input}
            placeholder="e.g. Design and Analysis of Computer Algorithms"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Term
          <input
            className={styles.input}
            required
            placeholder="e.g. Spring 2026, Fall 2026"
            value={form.term}
            onChange={(e) => setForm({ ...form, term: e.target.value })}
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.dialogActions}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create course'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function EditCourseDialog({ course, onClose, onUpdated }) {
  const [form, setForm] = useState({
    code: course.code || '',
    title: course.title || '',
    term: course.term || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onUpdated(course.id ?? course.course_id, form)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="edit-course-title">
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 id="edit-course-title" className={styles.dialogTitle}>Edit course details</h2>
        <p className={styles.dialogSubtitle}>Update course code, title, or academic term.</p>
        <label className={styles.field}>
          Course code
          <input
            className={styles.input}
            required
            placeholder="e.g. CMSC250"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Title (optional)
          <input
            className={styles.input}
            placeholder="e.g. Discrete Structures"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          Term
          <input
            className={styles.input}
            required
            placeholder="e.g. Fall 2026, Spring 2026"
            value={form.term}
            onChange={(e) => setForm({ ...form, term: e.target.value })}
          />
        </label>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.dialogActions}>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function SetCardImageDialog({ course, color, onClose, onUpdated }) {
  const [image, setImage] = useState(course.image || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, etc.)')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setImage(event.target.result)
      setError('')
    }
    reader.onerror = () => setError('Failed to read image file')
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onUpdated(course.id ?? course.course_id, { image: image || '' })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="card-image-title">
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <h2 id="card-image-title" className={styles.dialogTitle}>Course card image</h2>
        <p className={styles.dialogSubtitle}>
          Set a banner image for the green section of <strong>{course.code}</strong>.
        </p>

        {/* Live Preview */}
        <div
          className={styles.imagePreviewBox}
          style={{
            backgroundColor: color,
            backgroundImage: image ? `url(${image})` : undefined,
          }}
        >
          {!image && <span className={styles.imagePreviewEmpty}>Default color banner</span>}
        </div>

        <label className={styles.field}>
          Upload image file
          <input
            type="file"
            accept="image/*"
            className={styles.input}
            onChange={handleFileChange}
          />
        </label>

        <label className={styles.field}>
          Or paste image URL
          <input
            className={styles.input}
            placeholder="https://example.com/banner.jpg"
            value={image}
            onChange={(e) => setImage(e.target.value)}
          />
        </label>

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.dialogActions}>
          {image && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImage('')}
              disabled={saving}
              style={{ marginRight: 'auto' }}
            >
              Remove image
            </Button>
          )}
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save image'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// Main courses dashboard page grouped by semester and year
export default function CoursesDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { courses, loading, error, refresh, signOut } = useCourse() || {}
  const [showAddCourse, setShowAddCourse] = useState(false)
  const [showOlderCourses, setShowOlderCourses] = useState(false)

  // Options menu and dialog state
  const [openMenuCourseId, setOpenMenuCourseId] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [imageCourse, setImageCourse] = useState(null)

  // Local storage customization cache for immediate reactivity and persistence
  const [courseCustomizations, setCourseCustomizations] = useState(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('gradeflow_course_customizations') || '{}')
    } catch {
      return {}
    }
  })

  // Close options menu when clicking outside or pressing Escape
  useEffect(() => {
    function handlePointerDown(e) {
      if (!e.target.closest(`.${styles.optionsMenu}`) && !e.target.closest(`.${styles.threeButtonMenu}`)) {
        setOpenMenuCourseId(null)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpenMenuCourseId(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const isInstructor = courses?.some((c) => c.role === 'instructor') || !courses?.length

  async function handleCourseCreated(course) {
    await refresh()
    setShowAddCourse(false)
    router.push(`/courses/${course.course_id || course.id}`)
  }

  async function handleUpdateCourse(courseId, updates) {
    // 1. Immediately store customization in local state & localStorage
    const next = {
      ...courseCustomizations,
      [courseId]: {
        ...(courseCustomizations[courseId] || {}),
        ...updates,
      },
    }
    setCourseCustomizations(next)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('gradeflow_course_customizations', JSON.stringify(next))
      } catch (e) {
        console.warn('LocalStorage save notice:', e)
      }
    }

    // 2. Persist to backend API
    try {
      await updateCourse(courseId, updates)
      if (typeof refresh === 'function') {
        await refresh()
      }
    } catch (err) {
      console.warn('Backend course update notice:', err.message)
    }

    setEditingCourse(null)
    setImageCourse(null)
  }

  const forceEmpty = searchParams?.get('empty') === '1'
  const hasNoCourses = forceEmpty || !courses?.length

  // Terminates the active staff session and redirects to login
  const handleSignOut = () => {
    if (typeof signOut === 'function') {
      signOut()
    }
    router.push('/login')
  }

  // Consistent color mapping for each course
  const courseColorMap = useMemo(() => {
    const map = {}
    courses?.forEach((c, index) => {
      map[c.id ?? c.course_id] = GRADEFLOW_COLORS[index % GRADEFLOW_COLORS.length]
    })
    return map
  }, [courses])

  // Merge courses with local customizations (overrides and images)
  const enrichedCourses = useMemo(() => {
    if (!courses) return []
    return courses.map((c) => {
      const id = c.id ?? c.course_id
      const custom = courseCustomizations[id] || {}
      return {
        ...c,
        ...custom,
        image: custom.image !== undefined ? custom.image : c.image,
      }
    })
  }, [courses, courseCustomizations])

  // Group and sort courses by semester and year
  const { currentGroups, olderGroups } = useMemo(() => {
    if (!enrichedCourses || enrichedCourses.length === 0) {
      return { currentGroups: [], olderGroups: [] }
    }

    const groupsMap = new Map()
    for (const course of enrichedCourses) {
      const parsed = parseTerm(course.term)
      const key = parsed.displayName
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          ...parsed,
          key,
          courses: [],
        })
      }
      groupsMap.get(key).courses.push(course)
    }

    // Sort groups:
    // 1. By year descending (newer year first, e.g. 2026 before 2025)
    // 2. By semester order within the same year: Spring -> Summer -> Fall -> Winter
    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => {
      if (b.year !== a.year) {
        return b.year - a.year
      }
      const orderA = SEMESTER_ORDER[a.semester] ?? 5
      const orderB = SEMESTER_ORDER[b.semester] ?? 5
      if (orderA !== orderB) {
        return orderA - orderB
      }
      return a.displayName.localeCompare(b.displayName)
    })

    // Sort courses alphabetically by code within each group
    for (const group of sortedGroups) {
      group.courses.sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    }

    // Split into current year groups and older groups
    const years = sortedGroups.map((g) => g.year).filter((y) => y > 0)
    const maxYear = years.length > 0 ? Math.max(...years) : 0

    let current = sortedGroups
    let older = []

    if (maxYear > 0) {
      current = sortedGroups.filter((g) => g.year === maxYear || g.year === 0)
      older = sortedGroups.filter((g) => g.year > 0 && g.year < maxYear)
    }

    return { currentGroups: current, olderGroups: older }
  }, [enrichedCourses])

  const addCourseDialog = showAddCourse && (
    <AddCourseDialog
      initialTerm={currentGroups[0]?.displayName || 'Fall 2026'}
      onClose={() => setShowAddCourse(false)}
      onCreated={handleCourseCreated}
    />
  )

  const editCourseDialog = editingCourse && (
    <EditCourseDialog
      course={editingCourse}
      onClose={() => setEditingCourse(null)}
      onUpdated={handleUpdateCourse}
    />
  )

  const setImageDialog = imageCourse && (
    <SetCardImageDialog
      course={imageCourse}
      color={courseColorMap[imageCourse.id ?? imageCourse.course_id] || GRADEFLOW_COLORS[0]}
      onClose={() => setImageCourse(null)}
      onUpdated={handleUpdateCourse}
    />
  )

  // 0. loading and error states
  if (loading) return <PageNotice title="Loading…" back={false} />
  if (error && !courses?.length) {
    return (
      <PageNotice title="Could not load your courses" actionLabel="Try again" onAction={refresh}>
        {error}
      </PageNotice>
    )
  }

  // 1. empty state view when staff member has no assigned courses
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

          <div className={styles.emptyActions}>
            <Button variant="primary" onClick={() => setShowAddCourse(true)}>
              Add course
            </Button>
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
          </div>

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
        {addCourseDialog}
      </main>
    )
  }

  // 2. grouped course card grid view matching the dashboard design
  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Courses</h1>
          <p className={styles.details}>
            {[
              `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {isInstructor && (
          <Button variant="primary" onClick={() => setShowAddCourse(true)}>
            Add course
          </Button>
        )}
      </div>

      {currentGroups.map((group) => (
        <section key={group.key} className={styles.termSection}>
          <h2 className={styles.termTitle}>{group.displayName}</h2>
          <div className={styles.cardGrid}>
            {group.courses.map((course) => {
              const cId = course.id ?? course.course_id
              return (
                <CourseTile
                  key={cId}
                  course={course}
                  color={courseColorMap[cId] || GRADEFLOW_COLORS[0]}
                  onOpen={() => router.push(`/courses/${cId}`)}
                  isMenuOpen={openMenuCourseId === cId}
                  onToggleMenu={(id) => setOpenMenuCourseId((prev) => (prev === id ? null : id))}
                  onEditCourse={(c) => {
                    setOpenMenuCourseId(null)
                    setEditingCourse(c)
                  }}
                  onSetImage={(c) => {
                    setOpenMenuCourseId(null)
                    setImageCourse(c)
                  }}
                />
              )
            })}
          </div>
        </section>
      ))}

      <div className={styles.olderCoursesSection}>
        <button
          type="button"
          className={styles.olderCoursesToggle}
          onClick={() => setShowOlderCourses(!showOlderCourses)}
        >
          {showOlderCourses ? 'Hide older courses' : 'See older courses'}
          {showOlderCourses ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showOlderCourses && (
          <div className={styles.olderCoursesContent}>
            {olderGroups.length === 0 ? (
              <p className={styles.noOlderCourses}>No older courses to display.</p>
            ) : (
              olderGroups.map((group) => (
                <section key={group.key} className={styles.termSection}>
                  <h2 className={styles.termTitle}>{group.displayName}</h2>
                  <div className={styles.cardGrid}>
                    {group.courses.map((course) => {
                      const cId = course.id ?? course.course_id
                      return (
                        <CourseTile
                          key={cId}
                          course={course}
                          color={courseColorMap[cId] || GRADEFLOW_COLORS[0]}
                          onOpen={() => router.push(`/courses/${cId}`)}
                          isMenuOpen={openMenuCourseId === cId}
                          onToggleMenu={(id) => setOpenMenuCourseId((prev) => (prev === id ? null : id))}
                          onEditCourse={(c) => {
                            setOpenMenuCourseId(null)
                            setEditingCourse(c)
                          }}
                          onSetImage={(c) => {
                            setOpenMenuCourseId(null)
                            setImageCourse(c)
                          }}
                        />
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      {addCourseDialog}
      {editCourseDialog}
      {setImageDialog}
    </main>
  )
}
