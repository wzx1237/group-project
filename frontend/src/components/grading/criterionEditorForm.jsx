'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatPoints, scoreWith, scoringOf } from '@/lib/rubric'
import { SignedPointsInput } from './signedPointsInput'
import styles from './rubricPanel.module.css'

export function CriterionEditorForm({ initialCriterion, question, onSave, onCancel }) {
  const initial = initialCriterion?.deduction
  const [negative, setNegative] = useState(initial ? initial < 0 : scoringOf(question) === 'deduct')
  const [amount, setAmount] = useState(initialCriterion ? String(Math.abs(initial)) : '')
  const [title, setTitle] = useState(initialCriterion?.title ?? '')
  const [description, setDescription] = useState(initialCriterion?.description ?? '')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const firstField = useRef(null)
  const pointsId = useId()

  useEffect(() => firstField.current?.focus(), [])

  const points = Number(amount)
  const valid = amount.trim() !== '' && Number.isFinite(points) && points >= 0
  const adjustment = negative && points ? -points : points

  async function handleSubmit(event) {
    event.preventDefault()
    if (!valid) return setProblem('Enter the points as a number, like 2.')
    if (!title.trim()) return setProblem('Give the criterion a title.')
    setSaving(true)
    await onSave({ deduction: adjustment, title: title.trim(), description: description.trim() })
    setSaving(false)
  }

  return (
    <form className={styles.editor} onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className={styles.editorHeading}>
        <span className={styles.editorTitle}>{initialCriterion ? 'Edit criterion' : 'New criterion'}</span>
        <span className={styles.editorState}>Editing</span>
      </div>
      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.signedField}`}>
          <label className={styles.fieldLabel} htmlFor={pointsId}>
            Points
          </label>
          <SignedPointsInput
            id={pointsId}
            inputRef={firstField}
            negative={negative}
            amount={amount}
            onChange={(next) => {
              setNegative(next.negative)
              setAmount(next.amount)
            }}
          />
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title · shown to students</span>
          <input className={styles.input} maxLength={50} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Description · graders only, optional</span>
        <textarea className={styles.textarea} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.editorActions}>
        <span className={styles.hint}>
          {valid
            ? `Applied alone: ${scoreWith(question, adjustment)} / ${formatPoints(question.total_score)}`
            : `The question starts at ${formatPoints(scoreWith(question, 0))}`}
        </span>
        <div className={styles.saveActions}>
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={saving}>
            Save criterion
          </Button>
        </div>
      </div>
    </form>
  )
}
