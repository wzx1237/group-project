'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { History, Info, Split, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatAdjustment, plural } from '@/lib/rubric'
import { icon } from './icon'
import { SignedPointsInput } from './signedPointsInput'
import styles from './criterionSplit.module.css'

const LETTERS = ['A', 'B']

// Splits a criterion into two narrower ones. Answers that had it keep their scores until a grader picks which
// replacements apply, in the regrade queue the split opens.
export function CriterionSplitDialog({ criterion, question, label, onSplit, onClose }) {
  const start = { negative: criterion.deduction < 0, amount: String(Math.abs(criterion.deduction)), title: '' }
  const [rows, setRows] = useState([start, start])
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const firstTitle = useRef(null)
  const id = useId()
  const used = criterion.applied ?? 0

  useEffect(() => firstTitle.current?.focus(), [])

  function update(index, changes) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const points = rows.map((row) => Number(row.amount))
    if (rows.some((row, i) => row.amount.trim() === '' || !Number.isFinite(points[i]) || points[i] < 0)) {
      return setProblem('Enter each adjustment as a number, like 1.')
    }
    if (rows.some((row) => !row.title.trim())) return setProblem('Give both new criteria a title.')
    setProblem('')
    setSaving(true)
    try {
      await onSplit(
        rows.map((row, i) => ({
          title: row.title.trim(),
          description: '',
          deduction: row.negative && points[i] ? -points[i] : points[i],
        })),
      )
    } catch (err) {
      setProblem(err.message)
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} data-editor-owner={question.qid} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={handleSubmit}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className={styles.heading}>
          <span className={styles.mark}>
            <Split {...icon} size={18} />
          </span>
          <div className={styles.headingText}>
            <h2 id={`${id}-title`} className={styles.title}>
              Split “{criterion.title}” into two criteria
            </h2>
            <p className={styles.meta}>
              {[label, question.title, formatAdjustment(criterion.deduction), `used on ${plural(used, 'submission')}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X {...icon} size={16} />
          </button>
        </div>

        <div className={styles.rows}>
          <div className={styles.columns} aria-hidden="true">
            <span />
            <span>Adjustment</span>
            <span>Title · shown to students</span>
          </div>
          {rows.map((row, i) => (
            <div key={LETTERS[i]} className={styles.row}>
              <span className={styles.letter}>{LETTERS[i]}</span>
              <SignedPointsInput
                id={`${id}-points-${i}`}
                label={`criterion ${LETTERS[i]}'s points`}
                negative={row.negative}
                amount={row.amount}
                onChange={(next) => update(i, next)}
              />
              <input
                ref={i === 0 ? firstTitle : undefined}
                className={styles.input}
                aria-label={`Criterion ${LETTERS[i]} title`}
                maxLength={50}
                placeholder={i === 0 ? 'e.g. Dropped x in the final answer' : 'e.g. Dropped x in the working'}
                value={row.title}
                onChange={(e) => update(i, { title: e.target.value })}
              />
            </div>
          ))}
        </div>

        <p className={styles.info}>
          <Info {...icon} size={16} />
          {used
            ? `Next, you'll review the ${plural(used, 'submission')} that ${used === 1 ? 'has' : 'have'} “${criterion.title}” and choose which new criteria apply: one, the other, or both. Each score stays the same until its submission is reviewed.`
            : `No submission has “${criterion.title}” yet, so the two new criteria simply replace it.`}
        </p>
        <p className={styles.note}>
          <History {...icon} size={14} />
          The split will be recorded in the change log.
        </p>

        {problem && (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        )}

        <div className={styles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            <Split {...icon} size={16} />
            {used ? `Split and review ${plural(used, 'submission')}` : 'Split criterion'}
          </Button>
        </div>
      </form>
    </div>
  )
}
