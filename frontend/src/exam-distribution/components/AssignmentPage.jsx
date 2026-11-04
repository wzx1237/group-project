import { useEffect, useState } from 'react'
import Link from 'next/link'
import { uploadPdf } from '../lib/api.js'
import UploadCard from './UploadCard.jsx'
import { formatDue } from '../lib/status.js'
import { coursePath } from '@/lib/routes'
import { Button } from '@/components/ui/Button'

export default function AssignmentPage({ course, assignment, onChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const working = assignment.uploads.some((u) => u.status === 'uploaded' || u.status === 'processing' || u.matching === 'running')
  useEffect(() => {
    if (!working) return
    const timer = setInterval(onChange, 1500)
    return () => clearInterval(timer)
  }, [working, onChange])

  async function handleFile(event) {
    const input = event.target
    const file = input.files[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await uploadPdf(assignment.id, file)
      await onChange()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      input.value = ''
    }
  }

  return (
    <main>
      <Link className="back" href="/courses">
        ← {course.code} {course.term}
      </Link>
      <h1>{assignment.title}</h1>
      <p className="sub">Due {formatDue(assignment.due)}</p>
      <div className="actions">
        <Button href={`${coursePath(course)}/exams/${assignment.id}/roster`}>View roster</Button>
        <Button href={`${coursePath(course)}/exams/${assignment.id}/questions`}>Questions and regions</Button>
        <Button href={`${coursePath(course)}/exams/${assignment.id}/rubric`}>Rubric</Button>
      </div>

      <section>
        <h2>Upload PDF</h2>
        <label className={`upload ${busy ? 'busy' : ''}`}>
          <input type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={busy} />
          <span>{busy ? 'Uploading…' : 'Choose a PDF'}</span>
        </label>
        {error && <p className="status error">{error}</p>}
      </section>

      <section>
        <h2>Uploads</h2>
        {assignment.uploads.length === 0 ? (
          <p className="empty">Nothing uploaded yet.</p>
        ) : (
          <ul className="upload-list">
            {assignment.uploads.map((u) => (
              <UploadCard key={u.id} assignmentId={assignment.id} upload={u} onChange={onChange} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
