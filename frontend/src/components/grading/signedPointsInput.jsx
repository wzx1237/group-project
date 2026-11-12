'use client'

import styles from './rubricPanel.module.css'

// A +/− toggle and an amount. Typing a sign flips the toggle, so "-2" and "2" both work.
export function SignedPointsInput({ id, negative, amount, onChange, inputRef, label = 'points' }) {
  function handleAmount(value) {
    onChange({ negative: /^[-+−]/.test(value) ? value[0] !== '+' : negative, amount: value.replace(/^[-+−]/, '') })
  }

  return (
    <div className={styles.signed}>
      <button
        type="button"
        className={styles.sign}
        onClick={() => onChange({ negative: !negative, amount })}
        aria-label={negative ? `Takes ${label} off. Switch to adding ${label}` : `Adds ${label}. Switch to taking ${label} off`}
      >
        {negative ? '−' : '+'}
      </button>
      <input
        ref={inputRef}
        id={id}
        className={styles.input}
        inputMode="decimal"
        placeholder="2"
        value={amount}
        onChange={(e) => handleAmount(e.target.value)}
      />
    </div>
  )
}
