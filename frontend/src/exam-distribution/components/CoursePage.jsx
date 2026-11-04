import { useState } from 'react'
import Link from 'next/link'
import { formatDue } from '../lib/status.js'
import { coursePath } from '@/lib/routes'
import { Button } from '@/components/ui/Button'

const GROUPS = [
  { kind: 'exam', label: 'Exams' },
  { kind: 'quiz', label: 'Quizzes' },
  { kind: 'homework', label: 'Homeworks' },
]
const KIND_LABEL = { exam: 'Exam', quiz: 'Quiz', homework: 'Homework' }

function AssignmentRow({ a, showKind, base }) {
  const uploads = a.uploads.length
  return (
    <li>
      <Link href={`${base}/exams/${a.id}/upload`}>
        <span>
          {a.title} <span className="count">· due {formatDue(a.due)}</span>
        </span>
        <span className="row-meta">
          {showKind && <span className={`role kind-${a.kind}`}>{KIND_LABEL[a.kind]}</span>}
          <span className="count">
            {uploads === 0 ? 'No uploads' : `${uploads} upload${uploads === 1 ? '' : 's'}`}
          </span>
        </span>
      </Link>
    </li>
  )
}

export default function CoursePage({ course, assignments }) {
  const [sortBy, setSortBy] = useState('type')
  const byDate = [...assignments].sort((a, b) => a.due.localeCompare(b.due))
  const base = coursePath(course)

  return (
    <main>
      <header className="course-header">
        <h1>
          {course.code} <span>{course.term}</span>
        </h1>
        <p>Instructor: {course.instructor}</p>
        <div className="actions">
          <Button href={`${base}/roster`}>Student Roster</Button>
          <Button href={`${base}/staff`}>Staff Roster</Button>
        </div>
      </header>

      <div className="sort" role="group" aria-label="Sort assignments">
        <span>Sort by</span>
        <button className={sortBy === 'type' ? 'active' : ''} onClick={() => setSortBy('type')}>
          Type
        </button>
        <button className={sortBy === 'date' ? 'active' : ''} onClick={() => setSortBy('date')}>
          Due date
        </button>
      </div>

      {sortBy === 'date' ? (
        <ul className="assignment-list">
          {byDate.map((a) => (
            <AssignmentRow key={a.id} a={a} base={base} showKind />
          ))}
        </ul>
      ) : (
        GROUPS.map(({ kind, label }) => (
          <section key={kind}>
            <h2>{label}</h2>
            <ul className="assignment-list">
              {assignments
                .filter((a) => a.kind === kind)
                .map((a) => (
                  <AssignmentRow key={a.id} a={a} base={base} />
                ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
