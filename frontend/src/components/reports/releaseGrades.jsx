'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { plural } from '@/lib/rubric'
import { changeStatus } from '@/exam-distribution/lib/api'
import { fetchStudentScores, reportsZipUrl } from '@/services/reportExportService'
import styles from './releaseGrades.module.css'

const names = (students) =>
  students.length <= 3
    ? students.map((s) => s.name).join(', ')
    : `${students.slice(0, 3).map((s) => s.name).join(', ')} and ${students.length - 3} more`

// Figure 9a. Opens as a modal while mounted. Closing the assignment releases its grades, once every student has a
// grade: their exam fully graded, or a no-show (0). Missing and excused students have to be resolved first.
export function ReleaseGrades({ examId, examTitle, onReleased, onClose }) {
  const dialog = useRef(null)
  const [students, setStudents] = useState(null)
  const [download, setDownload] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    dialog.current.showModal()
    fetchStudentScores(examId)
      .then(setStudents)
      .catch((err) => setError(err.message))
  }, [examId])

  const tracked = students?.filter((s) => s.status) ?? []
  const exams = tracked.filter((s) => s.hasExam)
  const noShows = tracked.filter((s) => s.noShow)
  const unresolved = tracked.filter((s) => !s.hasExam && !s.noShow)
  const unfinished = exams.filter((s) => !s.graded)
  const ready = tracked.length > 0 && unresolved.length === 0 && unfinished.length === 0

  async function release() {
    setSaving(true)
    setError('')
    try {
      const { released_at } = await changeStatus(examId, 'closed')
      if (download) window.location.assign(reportsZipUrl(examId))
      onReleased(released_at)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="release-title">
      <h2 id="release-title" className={styles.title}>
        Close {examTitle} and release grades?
      </h2>

      {!students && !error && <p className={styles.muted}>Checking grading…</p>}
      {students && (
        <>
          <p className={styles.text}>
            {plural(exams.length, 'student')} will get a report with their scores, applied criteria and comments, followed by their
            scanned exam.
          </p>
          {exams.length === 0 && <p className={styles.warning}>No exams have been uploaded yet.</p>}
          {unfinished.length > 0 && (
            <p className={styles.warning}>
              {plural(unfinished.length, 'exam')} {unfinished.length === 1 ? 'isn’t' : 'aren’t'} fully graded yet ({names(unfinished)}).
              Finish grading before releasing.
            </p>
          )}
          {unresolved.length > 0 && (
            <p className={styles.warning}>
              {names(unresolved)} {unresolved.length === 1 ? 'has' : 'have'} no grade yet (missing or excused). Upload their
              exam or mark them a no-show before closing.
            </p>
          )}
          {noShows.length > 0 && (
            <p className={styles.text}>
              {names(noShows)} {noShows.length === 1 ? 'is a no-show and gets' : 'are no-shows and get'} 0.
            </p>
          )}
          <p className={styles.private}>
            <Lock size={14} strokeWidth={1.6} aria-hidden />
            Each student sees only their own scores, applied criteria and comments. Internal notes, criteria that weren’t applied and
            grader names stay hidden.
          </p>
          <label className={styles.option}>
            <input type="checkbox" checked={download} onChange={(e) => setDownload(e.target.checked)} />
            Download all reports to print
          </label>
          <label className={`${styles.option} ${styles.unavailable}`}>
            <input type="checkbox" disabled />
            Email each student <span className={styles.muted}>· not set up yet</span>
          </label>
          <p className={styles.muted}>Closing locks grading and is recorded in the change log. An instructor can reopen it.</p>
        </>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button onClick={() => dialog.current.close()}>Cancel</Button>
        <Button variant="primary" onClick={release} disabled={!ready || saving}>
          Close and release
        </Button>
      </div>
    </dialog>
  )
}
