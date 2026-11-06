'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { plural } from '@/lib/rubric'
import { fetchStudentScores, reportsZipUrl, setGradesReleased } from '@/services/reportExportService'
import styles from './releaseGrades.module.css'

const names = (students) =>
  students.length <= 3
    ? students.map((s) => s.name).join(', ')
    : `${students.slice(0, 3).map((s) => s.name).join(', ')} and ${students.length - 3} more`

// Figure 9a. Opens as a modal while mounted; grades can be released once every scanned exam is fully graded.
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

  const exams = students?.filter((s) => s.hasExam) ?? []
  const missing = students?.filter((s) => !s.hasExam) ?? []
  const unfinished = exams.filter((s) => !s.graded)
  const ready = exams.length > 0 && unfinished.length === 0

  async function release() {
    setSaving(true)
    setError('')
    try {
      const { released_at } = await setGradesReleased(examId, true)
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
        Release grades for {examTitle}?
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
          {missing.length > 0 && (
            <p className={styles.text}>
              {names(missing)} {missing.length === 1 ? 'has' : 'have'} no exam and won’t get a report.
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
          <p className={styles.muted}>Releasing grades is recorded in the change log.</p>
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
          Release grades
        </Button>
      </div>
    </dialog>
  )
}
