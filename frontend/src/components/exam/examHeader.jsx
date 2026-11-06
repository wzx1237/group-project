'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { ReleaseGrades } from '@/components/reports/releaseGrades'
import { formatDateTime } from '@/components/submissions/format'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useCourse } from '@/context/CourseContext'
import { formatDue } from '@/exam-distribution/lib/status'
import { fetchReleaseStatus, setGradesReleased } from '@/services/reportExportService'
import styles from './examHeader.module.css'

const TABS = [
  ['upload', 'Upload'],
  ['analytics', 'Analytics'],
  ['reports', 'Reports'],
]

// The title, release status and tabs shared by an exam's pages.
export function ExamHeader({ meta }) {
  const { courseId, examId } = useParams()
  const pathname = usePathname()
  const { assignments, refresh } = useCourse()
  const exam = assignments.find((a) => a.id === examId)
  const base = `/courses/${courseId}/exams/${examId}`
  const [releasedAt, setReleasedAt] = useState() // undefined while loading, null when not released
  const [releasing, setReleasing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchReleaseStatus(examId)
      .then((status) => setReleasedAt(status.released_at))
      .catch((err) => setError(err.message))
  }, [examId])

  async function unrelease() {
    if (!window.confirm(`Hide the grades for ${exam.title} again?`)) return
    try {
      setReleasedAt((await setGradesReleased(examId, false)).released_at)
      refresh?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div>
          <h1 className={styles.title}>{exam.title}</h1>
          <p className={styles.meta}>{[exam.due && `Due ${formatDue(exam.due)}`, meta].filter(Boolean).join(' · ')}</p>
        </div>
        <div className={styles.actions}>
          {releasedAt && <Badge tone="soft">Released {formatDateTime(releasedAt)}</Badge>}
          {releasedAt && <Button onClick={unrelease}>Unrelease</Button>}
          {releasedAt === null && <Button onClick={() => setReleasing(true)}>Release grades</Button>}
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
          onReleased={(at) => {
            setReleasedAt(at)
            setReleasing(false)
            refresh?.()
          }}
          onClose={() => setReleasing(false)}
        />
      )}
    </header>
  )
}
