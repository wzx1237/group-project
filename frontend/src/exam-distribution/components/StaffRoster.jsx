import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStaff } from '../lib/api.js'

const ROLE_LABELS = { instructor: 'Instructor', ta: 'TA' }

export default function StaffRoster({ course }) {
  const [staff, setStaff] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStaff()
      .then(setStaff)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="status error">Could not load staff: {error}</p>
  if (!staff) return <p className="status">Loading…</p>

  return (
    <main>
      <Link className="back" href="/courses">
        ← {course.code} {course.term}
      </Link>
      <h1>Staff Roster</h1>
      <p className="sub">Instructor and TAs</p>
      <ul className="upload-list">
        {staff.map((p) => (
          <li key={p.directory_id}>
            <span>
              <strong>{p.name}</strong> <span className="role">{ROLE_LABELS[p.role]}</span>
            </span>
            {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
          </li>
        ))}
      </ul>
    </main>
  )
}
