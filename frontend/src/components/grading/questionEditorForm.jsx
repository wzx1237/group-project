'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { scoringOf } from '@/lib/rubric'
import styles from './rubricPanel.module.css'

const SCORING = [
  ['deduct', 'Take points off', 'Starts at full points. Criteria take points off.'],
  ['add', 'Add points up', 'Starts at 0. Criteria add points.'],
]

export function QuestionEditorForm({ heading, initialQuestion, initialScoring = 'deduct', gradable = true, note, onSave, onCancel }) {
  const [title, setTitle] = useState(initialQuestion?.title ?? '')
  const [points, setPoints] = useState(initialQuestion ? String(initialQuestion.total_score) : '')
  const [scoring, setScoring] = useState(initialQuestion ? scoringOf(initialQuestion) : initialScoring)
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const firstField = useRef(null)

  useEffect(() => firstField.current?.focus(), [])

  async function handleSubmit(event) {
    event.preventDefault()
    const total = Number(points)
    if (gradable && (points.trim() === '' || !Number.isFinite(total) || total < 0)) {
      return setProblem('Enter the points the question is worth, like 5.')
    }
    setSaving(true)
    await onSave({ title: title.trim(), total_score: gradable ? total : initialQuestion.total_score, scoring })
    setSaving(false)
  }

  return (
    <form className={styles.editor} onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className={styles.editorHeading}>
        <span className={styles.editorTitle}>{heading}</span>
        <span className={styles.editorState}>Editing</span>
      </div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input
            ref={firstField}
            className={styles.input}
            placeholder="Chain rule"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {gradable && (
          <label className={`${styles.field} ${styles.narrow}`}>
            <span className={styles.fieldLabel}>Points</span>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.5"
              placeholder="5"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </label>
        )}
      </div>
      {gradable && (
        <fieldset className={styles.scoring}>
          <legend className={styles.fieldLabel}>Scoring</legend>
          <div className={styles.choices}>
            {SCORING.map(([value, label]) => (
              <label key={value} className={[styles.choice, scoring === value && styles.chosen].filter(Boolean).join(' ')}>
                <input type="radio" name="scoring" checked={scoring === value} onChange={() => setScoring(value)} />
                {label}
              </label>
            ))}
          </div>
          <span className={styles.hint}>{SCORING.find(([value]) => value === scoring)[2]}</span>
        </fieldset>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.editorActions}>
        <span className={styles.hint}>{note}</span>
        <div className={styles.saveActions}>
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={saving}>
            Save
          </Button>
        </div>
      </div>
    </form>
  )
}
