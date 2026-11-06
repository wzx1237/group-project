import styles from './setupStep.module.css'

const STEPS = [
  { step: 1, label: 'Exam files' },
  { step: 2, label: 'Questions and regions' },
  { step: 3, label: 'Rubric' },
]

/**
 * Renders the top 3-step progress indicator ("1 Exam files — 2 Questions and regions — 3 Rubric").
 * @param {Object} props
 * @param {1 | 2 | 3} props.currentStep - Active wizard step
 * @param {(step: 1 | 2 | 3) => void} [props.onStepClick] - Navigates between unlocked setup steps
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
              aria-label={`Step ${step}: ${label}${state === 'done' ? ', done' : ''}`}
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
