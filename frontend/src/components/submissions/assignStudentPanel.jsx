'use client'

import { useState } from 'react'
import { panelImageUrl } from '@/exam-distribution/lib/api'
import { Button } from '@/components/ui/Button'
import styles from './submissions.module.css'

// Shows what the student wrote on the cover so a grader can pick them from the roster.
export function AssignStudentPanel({ examId, upload, exam, students, onAssign, onCancel }) {
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const q = query.trim().toLowerCase()
  const suggested = students.find((s) => s.uid === exam.match.suggestion && !s.submission)
  const shown = students
    .filter((s) => !q || `${s.name} ${s.directory_id ?? ''} ${s.uid}`.toLowerCase().includes(q))
    .sort((a, b) => Boolean(a.submission) - Boolean(b.submission))

  async function choose(student) {
    setSaving(true)
    const done = await onAssign(upload.id, exam.id, student.uid)
    setSaving(false)
    if (done) onCancel()
  }

  return (
    <div className={styles.assignPanel}>
      <figure className={styles.cover}>
        <a href={panelImageUrl(examId, upload.id, exam.id)} target="_blank" rel="noreferrer" title="Open full size">
          <img src={panelImageUrl(examId, upload.id, exam.id)} alt="The UID, name and directory ID written on the cover" />
        </a>
        <figcaption>
          Read as <code>{exam.ocr?.read || '—'}</code> · click the image to enlarge
        </figcaption>
      </figure>

      <div className={styles.picker}>
        {suggested && (
          <p className={styles.suggestion}>
            <span>
              Closest match: <strong>{suggested.name}</strong> · {suggested.uid}
            </span>
            <Button size="sm" variant="primary" onClick={() => choose(suggested)} disabled={saving}>
              Assign
            </Button>
          </p>
        )}
        <input
          type="search"
          className={styles.search}
          placeholder="Search by name, directory ID or UID"
          aria-label="Search the roster"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <ul className={styles.pickList}>
          {shown.map((s) => (
            <li key={s.uid}>
              <span className={styles.pickName}>
                {s.name}
                <span className={styles.muted}>{[s.directory_id, s.uid].filter(Boolean).join(' · ')}</span>
              </span>
              {s.submission ? (
                <span className={styles.muted}>Has an exam</span>
              ) : (
                <Button size="sm" onClick={() => choose(s)} disabled={saving}>
                  Assign
                </Button>
              )}
            </li>
          ))}
          {!shown.length && <li className={styles.muted}>No students match “{query}”.</li>}
        </ul>
        <div>
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
