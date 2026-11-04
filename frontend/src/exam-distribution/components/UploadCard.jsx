import { useEffect, useState } from 'react'
import { deleteUpload, getStudents, masterUrl, matchUpload, reprocessUpload, submissionUrl, unassignSubmission } from '../lib/api.js'
import AssignPanel from './AssignPanel.jsx'
import { Button } from '@/components/ui/Button'

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

const pageRange = (s) => (s.start_page === s.end_page ? `page ${s.start_page}` : `pages ${s.start_page}–${s.end_page}`)

const REASONS = {
  blank: 'No UID written',
  unclear: 'UID not fully legible',
  not_numeric: 'UID contains letters',
  not_on_roster: 'UID not on roster',
  duplicate_uid: 'Same UID on another exam',
  unassigned: 'Unassigned by grader',
}

function StatusBadge({ upload }) {
  const n = upload.submissions.length
  const text = {
    uploaded: 'Upload complete',
    processing: 'Processing…',
    processed: `Processed · ${n} exam${n === 1 ? '' : 's'} found`,
    failed: 'Failed',
  }[upload.status]
  return <span className={`badge ${upload.status}`}>{text}</span>
}

function PdfActions({ viewing, onToggle, downloadHref }) {
  return (
    <span className="pdf-actions">
      <Button size="sm" onClick={onToggle}>
        {viewing ? 'Hide' : 'View'}
      </Button>
      <Button size="sm" href={downloadHref}>
        Download
      </Button>
    </span>
  )
}

export default function UploadCard({ assignmentId, upload, onChange }) {
  const [viewing, setViewing] = useState(null) // 'master' or a submission id
  const [error, setError] = useState('')
  const [students, setStudents] = useState([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [assigning, setAssigning] = useState(null) // submission id with the assign panel open
  useEffect(() => {
    if (upload.matching === 'done') getStudents().then(setStudents).catch(() => {})
  }, [upload.matching, upload.submissions])

  const toggle = (key) => setViewing((current) => (current === key ? null : key))
  const viewerSrc =
    viewing === 'master'
      ? masterUrl(assignmentId, upload.id)
      : viewing && submissionUrl(assignmentId, upload.id, viewing)

  async function remove() {
    try {
      await deleteUpload(assignmentId, upload.id)
      onChange()
    } catch (err) {
      setConfirmingDelete(false)
      setError(err.message)
    }
  }

  async function runMatching() {
    try {
      await matchUpload(assignmentId, upload.id)
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  const matchDone = upload.status === 'processed' && upload.matching === 'done'
  const needReview = matchDone ? upload.submissions.filter((s) => s.match.state === 'needs_review').length : 0
  const studentName = (uid) => students.find((st) => st.uid === uid)?.name ?? uid

  async function unassign(submissionId) {
    setError('')
    try {
      await unassignSubmission(assignmentId, upload.id, submissionId)
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  async function retry() {
    await reprocessUpload(assignmentId, upload.id)
    onChange()
  }

  return (
    <li className="upload-card">
      <div className="upload-row">
        <div>
          <strong>{upload.filename}</strong>
          <div className="count">
            Master PDF · {formatSize(upload.size_bytes)} · {new Date(upload.uploaded_at).toLocaleString()}
          </div>
        </div>
        <div className="upload-head-right">
          <StatusBadge upload={upload} />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Delete ${upload.filename}`}
            title="Delete this upload and its split PDFs"
            disabled={upload.status === 'uploaded' || upload.status === 'processing'}
            onClick={() => setConfirmingDelete(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pdf-actions-row">
        <PdfActions
          viewing={viewing === 'master'}
          onToggle={() => toggle('master')}
          downloadHref={masterUrl(assignmentId, upload.id, true)}
        />
        {(upload.status === 'processed' || upload.status === 'failed') && (
          <Button size="sm" onClick={retry}>
            Reprocess
          </Button>
        )}
        {upload.status === 'processed' && (upload.matching === 'idle' || upload.matching === 'failed') && (
          <Button variant="primary" size="sm" onClick={runMatching}>
            Match students
          </Button>
        )}
        {upload.matching === 'running' && <span className="badge processing">Matching students…</span>}
        {matchDone && (
          <span className="count">
            {upload.submissions.length - needReview} matched · {needReview} need assignment
          </span>
        )}
      </div>

      {confirmingDelete && (
        <div className="confirm-delete" role="alert">
          <span>
            Delete {upload.filename}
            {upload.submissions.length > 0 &&
              ` and its ${upload.submissions.length} split PDF${upload.submissions.length === 1 ? '' : 's'}`}
            ? This cannot be undone.
          </span>
          <span className="pdf-actions">
            <button type="button" className="danger" onClick={remove}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </span>
        </div>
      )}
      {upload.matching === 'failed' && <p className="status error">Matching failed: {upload.matching_error}</p>}
      {error && <p className="status error">{error}</p>}
      {upload.status === 'failed' && <p className="status error">{upload.error}</p>}

      {upload.status === 'processed' && (
        <ul className="submission-list">
          {upload.submissions.map((s) => (
            <li key={s.id} className="submission">
              <div className="submission-row">
                <span>
                  Exam {Number(s.id)} <span className="count">· {pageRange(s)}</span>
                  {!s.starts_with_cover && <span className="warn"> · no cover page found</span>}
                  {matchDone && s.match.state !== 'needs_review' && (
                    <span className="matched">
                      {' '}
                      · {s.match.state === 'assigned' ? 'Assigned to' : 'Matched'} {studentName(s.match.student_uid)}
                    </span>
                  )}
                  {matchDone && s.match.state === 'needs_review' && (
                    <span className="warn"> · Needs assignment: {REASONS[s.match.reason]}</span>
                  )}
                </span>
                <span className="pdf-actions">
                  {matchDone && s.match.state === 'needs_review' && (
                    <Button variant="primary" size="sm" onClick={() => setAssigning(s.id)}>
                      Assign
                    </Button>
                  )}
                  {matchDone && s.match.state !== 'needs_review' && (
                    <Button size="sm" onClick={() => unassign(s.id)}>
                      Unassign
                    </Button>
                  )}
                  <PdfActions
                    viewing={viewing === s.id}
                    onToggle={() => toggle(s.id)}
                    downloadHref={submissionUrl(assignmentId, upload.id, s.id, true)}
                  />
                </span>
              </div>
              {assigning === s.id && (
                <AssignPanel
                  assignmentId={assignmentId}
                  upload={upload}
                  submission={s}
                  onCancel={() => setAssigning(null)}
                  onDone={() => {
                    setAssigning(null)
                    onChange()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {viewing && <iframe className="viewer" title="PDF viewer" src={viewerSrc} />}
    </li>
  )
}
