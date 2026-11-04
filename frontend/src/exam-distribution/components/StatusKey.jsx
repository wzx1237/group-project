import { STATUSES } from '../lib/status.js'

export default function StatusKey({ blankLabel = 'Nothing uploaded yet' }) {
  return (
    <ul className="key" aria-label="Key">
      {STATUSES.map((s) => (
        <li key={s.id}>
          <span className={`box ${s.id}`} /> {s.label}
        </li>
      ))}
      <li>
        <span className="box" /> {blankLabel}
      </li>
    </ul>
  )
}
