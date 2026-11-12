import { Circle, CircleCheck, Pencil, Split, Trash2 } from 'lucide-react'
import { formatAdjustment } from '@/lib/rubric'
import { icon } from './icon'
import styles from './rubricPanel.module.css'

// `retired` is a split criterion still on this answer: shown struck through until the answer is regraded.
// `disabled` keeps it from being applied while another grader holds the answer.
export function CriterionRow({ criterion, editing, applied, retired, disabled, onApply, onEdit, onSplit, onRemove }) {
  const content = (
    <>
      <span className={styles.adjustment}>{formatAdjustment(criterion.deduction)}</span>
      <span className={styles.criterionText}>
        <span>{criterion.title}</span>
        {criterion.description && <span className={styles.description}>{criterion.description}</span>}
      </span>
    </>
  )

  if (retired) {
    return (
      <li className={`${styles.criterion} ${styles.retired}`}>
        {content}
        <span className={styles.retiredTag}>Split</span>
      </li>
    )
  }

  if (onApply && !editing) {
    return (
      <li>
        <button
          type="button"
          className={[styles.criterion, styles.applicable, applied && styles.applied].filter(Boolean).join(' ')}
          aria-pressed={applied}
          disabled={disabled}
          onClick={onApply}
        >
          {content}
          {applied ? <CircleCheck {...icon} className={styles.check} /> : <Circle {...icon} className={styles.unchecked} />}
        </button>
      </li>
    )
  }

  return (
    <li className={styles.criterion}>
      {content}
      {editing && (
        <>
          <button type="button" className={styles.iconButton} onClick={onEdit} aria-label={`Edit ${criterion.title}`}>
            <Pencil {...icon} />
          </button>
          {onSplit && (
            <button type="button" className={styles.iconButton} onClick={onSplit} aria-label={`Split ${criterion.title}`}>
              <Split {...icon} />
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={onRemove} aria-label={`Remove ${criterion.title}`}>
            <Trash2 {...icon} />
          </button>
        </>
      )}
    </li>
  )
}
