import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStudents } from '../lib/api.js'
import { studentLabel, studentState } from '../lib/status.js'
import StatusKey from './StatusKey.jsx'

export default function StudentRoster({ course, assignments }) {
  const [students, setStudents] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStudents()
      .then(setStudents)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="status error">Could not load students: {error}</p>
  if (!students) return <p className="status">Loading…</p>

  return (
    <main>
      <Link className="back" href="/courses">
        ← {course.code} {course.term}
      </Link>
      <h1>Student Roster</h1>
      <p className="sub">{students.length} students</p>
      <StatusKey blankLabel="Assignment still in draft" />
      <ul className="student-list">
        {students.map((student) => (
          <li key={student.uid} className="student">
            <div className="student-head">
              <strong>{student.name}</strong>
              <span className="count">
                {student.directory_id} · {student.uid}
              </span>
            </div>
            <div className="boxes">
              {assignments.map((a) => {
                const entry = student.progress[a.id]
                return (
                  <div key={a.id} className="cell" title={`${a.title}: ${studentLabel(entry) || 'Still in draft'}`}>
                    <span className={`box ${studentState(entry)}`} />
                    <span className="cell-label">{a.short}</span>
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
