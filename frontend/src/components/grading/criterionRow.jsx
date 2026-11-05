import { Circle, CircleCheck, Pencil, Trash2 } from 'lucide-react'
import { formatAdjustment } from '@/lib/rubric'
import { icon } from './icon'
import styles from './rubricPanel.module.css'

export function CriterionRow({ criterion, editing, applied, onApply, onEdit, onRemove }) {
  const content = (
    <>
      <span className={styles.adjustment}>{formatAdjustment(criterion.deduction)}</span>
      <span className={styles.criterionText}>
        <span>{criterion.title}</span>
        {criterion.description && <span className={styles.description}>{criterion.description}</span>}
      </span>
    </>
  )

  if (onApply && !editing) {
    return (
      <li>
        <button
          type="button"
          className={[styles.criterion, styles.applicable, applied && styles.applied].filter(Boolean).join(' ')}
          aria-pressed={applied}
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
          <button type="button" className={styles.iconButton} onClick={onRemove} aria-label={`Remove ${criterion.title}`}>
            <Trash2 {...icon} />
          </button>
        </>
      )}
    </li>
  )
}
