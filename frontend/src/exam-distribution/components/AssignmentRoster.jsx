import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAssignmentRoster, submissionUrl } from '../lib/api.js'
import { studentLabel, studentState } from '../lib/status.js'
import StatusKey from './StatusKey.jsx'
import { coursePath } from '@/lib/routes'

export default function AssignmentRoster({ course, assignment }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getAssignmentRoster(assignment.id)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [assignment.id])

  return (
    <main>
      <Link className="back" href={`${coursePath(course)}/exams/${assignment.id}/upload`}>
        ← {assignment.title}
      </Link>
      <h1>{assignment.title} Roster</h1>
      <p className="sub">
        {course.code} {course.term}
      </p>
      <StatusKey blankLabel="Assignment still in draft" />
      {error && <p className="status error">{error}</p>}
      {!data && !error && <p className="status">Loading…</p>}
      {data && (
        <>
          {data.assignment_status === 'draft' && (
            <p className="note">Student statuses start once the assignment is published to TAs.</p>
          )}
          <ul className="upload-list roster-rows">
            {data.students.map((s) => (
              <li key={s.uid}>
                <span className="roster-name">
                  <span className={`box ${studentState(s.progress)}`} />
                  <span>
                    <strong>{s.name}</strong>
                    <span className="count"> · {s.directory_id}</span>
                  </span>
                </span>
                <span className="roster-right">
                  <span className="count">
                    {studentLabel(s.progress)}
                    {s.progress?.status === 'matched' && !s.progress.graded && s.progress.questions > 0 &&
                      ` · ${s.progress.finished} of ${s.progress.questions} graded`}
                    {s.progress?.note && ` · ${s.progress.note}`}
                  </span>
                  {s.submission && (
                    <a
                      href={submissionUrl(assignment.id, s.submission.upload_id, s.submission.submission_id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View exam
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
