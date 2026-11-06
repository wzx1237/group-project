import { FileText, RotateCw, Trash2 } from 'lucide-react'
import { masterUrl } from '@/exam-distribution/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { plural } from '@/lib/rubric'
import { formatDateTime, formatSize } from './format'
import styles from './submissions.module.css'

const icon = { size: 13, strokeWidth: 1.6, 'aria-hidden': true }

function status(upload) {
  if (upload.status === 'uploaded' || upload.status === 'processing') return ['neutral', 'Splitting into exams…']
  if (upload.status === 'failed') return ['danger', "Couldn't split"]
  if (upload.matching === 'running') return ['neutral', 'Matching students…']
  if (upload.matching === 'failed') return ['danger', 'Matching failed']
  if (upload.matching === 'idle') return ['outline', 'Not matched yet']
  return ['soft', plural(upload.submissions.length, 'exam')]
}

const working = (upload) =>
  upload.status === 'uploaded' || upload.status === 'processing' || upload.matching === 'running'

export function UploadedFiles({ examId, uploads, onMatch, onReprocess, onRemove }) {
  if (!uploads.length) return null

  return (
    <ul className={styles.files} aria-label="Uploaded PDFs">
      {uploads.map((upload) => {
        const [tone, label] = status(upload)
        const exams = upload.submissions.length
        return (
          <li key={upload.id} className={styles.fileRow}>
            <FileText size={18} strokeWidth={1.6} className={styles.fileIcon} aria-hidden />
            <div className={styles.fileText}>
              <p className={styles.fileName}>{upload.filename}</p>
              <p className={styles.fileMeta}>
                {formatSize(upload.size_bytes)} · uploaded {formatDateTime(upload.uploaded_at)}
              </p>
              {(upload.error || upload.matching_error) && (
                <p className={styles.fileError}>{upload.error || upload.matching_error}</p>
              )}
            </div>
            <Badge tone={tone}>{label}</Badge>
            <div className={styles.fileActions}>
              <Button size="sm" href={masterUrl(examId, upload.id)} target="_blank" rel="noreferrer">
                View
              </Button>
              {upload.status === 'processed' && upload.matching === 'idle' && (
                <Button size="sm" variant="primary" onClick={() => onMatch(upload.id)}>
                  Match students
                </Button>
              )}
              {!working(upload) && (
                <Button
                  size="sm"
                  onClick={() =>
                    window.confirm(`Split and match ${upload.filename} again? Exams assigned by hand will need assigning again.`) &&
                    onReprocess(upload.id)
                  }
                >
                  <RotateCw {...icon} /> Redo
                </Button>
              )}
              <button
                type="button"
                className={styles.iconButton}
                disabled={working(upload)}
                aria-label={`Delete ${upload.filename}`}
                onClick={() =>
                  window.confirm(`Delete ${upload.filename}${exams ? ` and its ${plural(exams, 'exam')}` : ''}? This can't be undone.`) &&
                  onRemove(upload.id)
                }
              >
                <Trash2 {...icon} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
