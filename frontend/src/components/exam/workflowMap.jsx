import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ASSIGNMENT_STATUSES, ORDER } from '@/exam-distribution/lib/status'
import styles from './workflowMap.module.css'

// A subway-style map of an assignment's workflow: finished stops are filled, the current stop is ringed,
// and stops not reached yet are greyed out. The step buttons sit underneath.
export function WorkflowMap({ current, backLabel, forwardLabel, onBack, onForward, disabled }) {
  const at = ORDER.indexOf(current)

  return (
    <div className={styles.wrap}>
      <h2 className={styles.title}>Status Tracker</h2>
      <ol className={styles.map} aria-label="Assignment progress">
        {ORDER.map((id, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo'
          return (
            <li key={id} className={`${styles.stop} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden>
                {state === 'done' && <Check size={11} strokeWidth={3} />}
              </span>
              <span className={styles.label}>{ASSIGNMENT_STATUSES[id].label}</span>
            </li>
          )
        })}
      </ol>

      {(onBack || onForward) && (
        <div className={styles.buttons}>
          {onBack && (
            <Button size="sm" onClick={onBack} disabled={disabled}>
              <ChevronLeft size={13} aria-hidden /> {backLabel}
            </Button>
          )}
          {onForward && (
            <Button size="sm" variant="primary" onClick={onForward} disabled={disabled}>
              {forwardLabel} <ChevronRight size={13} aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
