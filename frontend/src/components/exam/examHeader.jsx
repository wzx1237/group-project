'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { ArrowRight, Pencil } from 'lucide-react'
import { ReleaseGrades } from '@/components/reports/releaseGrades'
import { formatDateTime } from '@/components/submissions/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useCourse } from '@/context/CourseContext'
import { changeStatus } from '@/exam-distribution/lib/api'
import { ASSIGNMENT_STATUSES, ORDER, formatDue } from '@/exam-distribution/lib/status'
import styles from './examHeader.module.css'

const TABS = [
  ['upload', 'Upload'],
  ['analytics', 'Analytics'],
  ['reports', 'Reports'],
]

// The title, workflow status and its next step, and the tabs shared by an exam's pages.
export function ExamHeader({ meta, onStatusChange }) {
  const { courseId, examId } = useParams()
  const pathname = usePathname()
  const { course, assignments, refresh } = useCourse()
  const exam = assignments.find((a) => a.id === examId)
  const base = `/courses/${courseId}/exams/${examId}`
  const [releasing, setReleasing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const role = course?.role?.toLowerCase()
  const status = ASSIGNMENT_STATUSES[exam.status]
  const canAdvance = status?.next && status.who.includes(role)
  // Instructors can move back one step; reopening a closed assignment hides its grades again.
  const previous = role === 'instructor' && exam.status !== 'draft' ? ORDER[ORDER.indexOf(exam.status) - 1] : null

  async function move(target, confirm = false) {
    setSaving(true)
    setError('')
    try {
      await changeStatus(examId, target, confirm)
      await refresh?.()
      onStatusChange?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function advance() {
    if (status.next === 'closed') setReleasing(true)
    else move(status.next)
  }

  function moveBack() {
    const label = ASSIGNMENT_STATUSES[previous].label.toLowerCase()
    const warning = exam.status === 'closed' ? ' Students will no longer see their grades.' : ''
    if (window.confirm(`Move ${exam.title} back to ${label}?${warning}`)) move(previous, true)
  }

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>{exam.title}</h1>
          <p className={styles.meta}>{[exam.due && `Due ${formatDue(exam.due)}`, meta].filter(Boolean).join(' · ')}</p>
        </div>
        <div className={styles.actions}>
          {course?.role === 'instructor' && (
            <Button href={`${base}/edit`}>
              <Pencil size={13} aria-hidden /> Edit Assignment
            </Button>
          )}
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {exam.released_at && <span className={styles.meta}>Released {formatDateTime(exam.released_at)}</span>}
          {previous && (
            <Button onClick={moveBack} disabled={saving}>
              {exam.status === 'closed' ? 'Reopen' : 'Move back'}
            </Button>
          )}
          {canAdvance && (
            <Button onClick={advance} disabled={saving}>
              {status.action}
            </Button>
          )}
          <Button variant="primary" href={`${base}/grade`}>
            Open grading <ArrowRight size={14} strokeWidth={1.6} aria-hidden />
          </Button>
        </div>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <nav className={styles.tabs} aria-label={`${exam.title} pages`}>
        {TABS.map(([path, label]) => (
          <Link
            key={path}
            href={`${base}/${path}`}
            className={styles.tab}
            aria-current={pathname.endsWith(`/${path}`) ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      {releasing && (
        <ReleaseGrades
          examId={examId}
          examTitle={exam.title}
          onReleased={async () => {
            setReleasing(false)
            await refresh?.()
            onStatusChange?.()
          }}
          onClose={() => setReleasing(false)}
        />
      )}
    </header>
  )
}
