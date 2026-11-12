'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { formatAdjustment, plural } from '@/lib/rubric'
import styles from './rubricPanel.module.css'

// Puts a question's graded answers in a new regrade queue: all of them, or only those with one criterion applied.
export function FlagRegradeForm({ question, onSubmit, onCancel }) {
  const [criterionId, setCriterionId] = useState('')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const firstField = useRef(null)

  useEffect(() => firstField.current?.focus(), [])

  const used = question.criteria.filter((c) => c.applied > 0)
  const count = criterionId ? (used.find((c) => c.label_id === criterionId)?.applied ?? 0) : question.graded

  async function handleSubmit(event) {
    event.preventDefault()
    if (!reason.trim()) return setProblem('Say why these answers need another look.')
    setProblem('')
    setSaving(true)
    try {
      await onSubmit({ reason: reason.trim(), criterionId: criterionId ? Number(criterionId) : null })
    } catch (err) {
      setProblem(err.message)
      setSaving(false)
    }
  }

  return (
    <form className={styles.editor} onSubmit={handleSubmit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className={styles.editorHeading}>
        <span className={styles.editorTitle}>Regrade answers</span>
        <span className={styles.editorState}>{plural(count, 'answer')}</span>
      </div>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Which answers</span>
        <select ref={firstField} className={styles.input} value={criterionId} onChange={(e) => setCriterionId(e.target.value)}>
          <option value="">{`All ${plural(question.graded, 'graded answer')}`}</option>
          {used.map((c) => (
            <option key={c.label_id} value={c.label_id}>
              {`With “${c.title}” (${formatAdjustment(c.deduction)}) · ${plural(c.applied, 'answer')}`}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Why · graders see this in the queue</span>
        <input
          className={styles.input}
          maxLength={200}
          placeholder="e.g. Partial credit was given unevenly"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.editorActions}>
        <span className={styles.hint}>Scores stay the same until each answer is reviewed</span>
        <div className={styles.saveActions}>
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={saving || !count}>
            Start regrade
          </Button>
        </div>
      </div>
    </form>
  )
}
