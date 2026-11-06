'use client'

import { useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { submissionUrl, uidImageUrl } from '@/exam-distribution/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AssignStudentPanel } from './assignStudentPanel'
import { pageRange } from './format'
import styles from './submissions.module.css'

const REASONS = {
  blank: 'No UID written',
  unclear: 'UID not fully legible',
  not_numeric: 'UID contains letters',
  not_on_roster: 'UID not on the roster',
  duplicate_uid: 'Same UID on another exam',
  unassigned: 'Unassigned by a grader',
}

const FILTERS = [
  ['review', 'Needs review'],
  ['matched', 'Matched'],
  ['all', 'All'],
]

function stateOf(upload, exam) {
  if (upload.matching === 'running') return 'reading'
  if (upload.matching !== 'done') return 'unmatched'
  return exam.match.state === 'needs_review' ? 'review' : 'matched'
}

// Every exam split out of the uploaded PDFs, with the student it belongs to.
export function OcrStudentMatcherList({ examId, uploads, students, onAssign, onUnassign }) {
  const [filter, setFilter] = useState(null)
  const [assigning, setAssigning] = useState(null)

  const byUid = Object.fromEntries(students.map((s) => [s.uid, s]))
  const exams = uploads
    .filter((u) => u.status === 'processed')
    .flatMap((upload) => upload.submissions.map((exam) => ({ key: `${upload.id}:${exam.id}`, upload, exam, state: stateOf(upload, exam) })))
  const counts = {
    review: exams.filter((e) => e.state === 'review').length,
    matched: exams.filter((e) => e.state === 'matched').length,
    all: exams.length,
  }
  const current = filter ?? (counts.review ? 'review' : 'all')
  const shown = current === 'all' ? exams : exams.filter((e) => e.state === current)

  return (
    <section className={styles.card} aria-labelledby="match-heading">
      <div className={styles.cardHeading}>
        <div>
          <h2 id="match-heading" className={styles.cardTitle}>
            Match scans to students
          </h2>
          <p className={styles.cardMeta}>Exams are matched by the UID written on the cover. Check the ones that need review.</p>
        </div>
      </div>

      {exams.length === 0 ? (
        <p className={styles.empty}>Upload scanned exams to match them to students.</p>
      ) : (
        <>
          <div className={styles.tabs} role="group" aria-label="Show exams">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={styles.tab} aria-pressed={current === key} onClick={() => setFilter(key)}>
                {label} <span className={styles.tabCount}>{counts[key]}</span>
              </button>
            ))}
          </div>

          <ul className={styles.examList}>
            {shown.map(({ key, upload, exam, state }) => {
              const student = byUid[exam.match?.student_uid]
              return (
                <li key={key} className={styles.examRow}>
                  <div className={styles.examMain}>
                    {(state === 'matched' || state === 'review') && exam.uid_image ? (
                      <img className={styles.uidImage} src={uidImageUrl(examId, upload.id, exam.id)} alt={`UID written on exam ${Number(exam.id)}`} />
                    ) : (
                      <span className={styles.uidImage} />
                    )}
                    <div>
                      <p className={styles.examTitle}>Exam {Number(exam.id)}</p>
                      <p className={styles.examMeta}>
                        {pageRange(exam)} · {upload.filename}
                        {!exam.starts_with_cover && <span className={styles.warn}> · no cover page found</span>}
                      </p>
                    </div>
                  </div>

                  <div className={styles.examStatus}>
                    {state === 'matched' && (
                      <span className={styles.matched}>
                        <CircleCheck size={14} strokeWidth={1.8} aria-hidden />
                        <span>
                          {student?.name ?? exam.match.student_uid}
                          <span className={styles.muted}>
                            {exam.match.student_uid} · {exam.match.state === 'assigned' ? 'assigned by hand' : 'matched by UID'}
                          </span>
                        </span>
                      </span>
                    )}
                    {state === 'review' && <Badge tone="warning">{REASONS[exam.match.reason] ?? 'Needs review'}</Badge>}
                    {state === 'reading' && <span className={styles.muted}>Reading UID…</span>}
                    {state === 'unmatched' && <span className={styles.muted}>Not matched yet</span>}
                  </div>

                  <div className={styles.examActions}>
                    <Button size="sm" href={submissionUrl(examId, upload.id, exam.id)} target="_blank" rel="noreferrer">
                      View
                    </Button>
                    {state === 'matched' && (
                      <Button size="sm" onClick={() => onUnassign(upload.id, exam.id)}>
                        Unassign
                      </Button>
                    )}
                    {state === 'review' && (
                      <Button size="sm" variant="primary" onClick={() => setAssigning(key)} disabled={assigning === key}>
                        Assign
                      </Button>
                    )}
                  </div>

                  {assigning === key && state === 'review' && (
                    <AssignStudentPanel
                      examId={examId}
                      upload={upload}
                      exam={exam}
                      students={students}
                      onAssign={onAssign}
                      onCancel={() => setAssigning(null)}
                    />
                  )}
                </li>
              )
            })}
            {!shown.length && <li className={styles.empty}>Nothing here.</li>}
          </ul>
        </>
      )}
    </section>
  )
}
