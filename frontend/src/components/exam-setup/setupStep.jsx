import styles from './setupStep.module.css'

const STEPS = [
  { step: 1, label: 'Exam files' },
  { step: 2, label: 'Questions and regions' },
  { step: 3, label: 'Rubric' },
  { step: 4, label: 'Graders' },
]

/**
 * Renders the top 4-step progress indicator ("1 Exam files — 2 Questions and regions — 3 Rubric — 4 Graders").
 * @param {Object} props
 * @param {1 | 2 | 3 | 4} props.currentStep - Active wizard step
 * @param {(step: 1 | 2 | 3 | 4) => void} [props.onStepClick] - Navigates between unlocked setup steps
 */
export function SetupStep({ currentStep, onStepClick }) {
  return (
    <ol className={styles.steps}>
      {STEPS.map(({ step, label }) => {
        const state = step < currentStep ? 'done' : step === currentStep ? 'active' : 'upcoming'
        return (
          <li key={step} className={styles.step}>
            <button
              type="button"
              className={`${styles.marker} ${styles[state]}`}
              onClick={() => onStepClick?.(step)}
              disabled={!onStepClick}
            >
              {state === 'done' ? '✓' : step}
            </button>
            <span className={state === 'upcoming' ? styles.labelMuted : styles.label}>{label}</span>
            {step < STEPS.length && <span className={styles.connector} />}
          </li>
        )
      })}
    </ol>
  )
}
