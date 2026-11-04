import { useEffect, useState } from 'react'
import { assignSubmission, getAssignmentRoster, panelImageUrl } from '../lib/api.js'

export default function AssignPanel({ assignmentId, upload, submission, onDone, onCancel }) {
  const [students, setStudents] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getAssignmentRoster(assignmentId)
      .then((d) => setStudents(d.students))
      .catch((err) => setError(err.message))
  }, [assignmentId])

  async function choose(student) {
    try {
      await assignSubmission(assignmentId, upload.id, submission.id, student.uid)
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }

  const q = query.trim().toLowerCase()
  const shown = (students || []).filter(
    (s) => !q || `${s.name} ${s.directory_id} ${s.uid}`.toLowerCase().includes(q),
  )
  const suggested = students?.find((s) => s.uid === submission.match.suggestion)

  return (
    <div className="assign-panel">
      <div className="uid-read">
        <img src={panelImageUrl(assignmentId, upload.id, submission.id)} alt="Cover page: UID, student name and directory ID" />
        <div className="count">
          Read as <code>{submission.ocr.read}</code>
        </div>
      </div>

      {suggested && !suggested.submission && (
        <p className="suggestion">
          Suggested: <strong>{suggested.name}</strong> ({suggested.uid}) matches most digits.{' '}
          <button type="button" onClick={() => choose(suggested)}>
            Assign to {suggested.name.split(' ')[0]}
          </button>
        </p>
      )}

      <input
        className="search"
        type="search"
        placeholder="Search roster by name, directory ID or UID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="status error">{error}</p>}
      {!students && !error && <p className="count">Loading roster…</p>}
      <ul className="pick-list">
        {shown.map((s) => (
          <li key={s.uid}>
            <span>
              {s.name} <span className="count">· {s.directory_id} · {s.uid}</span>
            </span>
            {s.submission ? (
              <span className="count">has an exam</span>
            ) : (
              <button type="button" onClick={() => choose(s)}>
                Assign
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
