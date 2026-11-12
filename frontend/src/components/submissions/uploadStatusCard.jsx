import { formatDateTime } from './format'
import styles from './submissions.module.css'

export function UploadStatusCard({ uploads, students }) {
  const withExam = students.filter((s) => s.submission).length
  const noShow = students.filter((s) => !s.submission && s.status === 'no_show').length
  const excused = students.filter((s) => !s.submission && s.status === 'excused').length
  const unmatched = students.length - withExam - noShow - excused
  const percent = students.length ? Math.round((withExam / students.length) * 100) : 0
  const segments = [
    ['segMatched', withExam, 'Has an exam'],
    ['segNoShow', noShow, 'No-show'],
    ['segExcused', excused, 'Excused (makeup pending)'],
    ['segUnmatched', unmatched, 'Unmatched'],
  ]
  const split = uploads.filter((u) => u.status === 'processed')
  const exams = split.reduce((n, u) => n + u.submissions.length, 0)
  const review = split
    .filter((u) => u.matching === 'done')
    .reduce((n, u) => n + u.submissions.filter((s) => s.match.state === 'needs_review').length, 0)
  const last = uploads.map((u) => u.uploaded_at).sort().at(-1)

  return (
    <section className={styles.card} aria-labelledby="status-heading">
      <h2 id="status-heading" className={styles.cardTitle}>
        Upload Status
      </h2>
      <p className={styles.statusLine}>
        <strong>
          {withExam} of {students.length}
        </strong>{' '}
        {students.length === 1 ? 'student has' : 'students have'} an exam
      </p>
      <div className={styles.stackWrap}>
        <span
          className={styles.stack}
          role="img"
          aria-label={segments.map(([, n, label]) => `${label}: ${n}`).join(', ')}
        >
          {segments.map(([key, n, label]) =>
            n ? <span key={key} className={styles[key]} style={{ flexGrow: n }} title={`${label}: ${n}`} /> : null,
          )}
        </span>
        <span className={styles.stackPercent}>{percent}%</span>
      </div>
      <dl className={styles.counts}>
        <div>
          <dt>Exams found</dt>
          <dd>{exams}</dd>
        </div>
        <div>
          <dt>Need review</dt>
          <dd className={review ? styles.warn : undefined}>{review}</dd>
        </div>
        <div>
          <dt>No-show</dt>
          <dd>{noShow}</dd>
        </div>
        <div>
          <dt>Excused (makeup pending)</dt>
          <dd>{excused}</dd>
        </div>
      </dl>
      <p className={styles.muted}>{last ? `Last upload ${formatDateTime(last)}` : 'Nothing uploaded yet'}</p>
    </section>
  )
}
