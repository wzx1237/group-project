'use client'

import { useParams } from 'next/navigation'
import { ExamHeader } from '@/components/exam/examHeader'
import { MissingExamsCard } from '@/components/submissions/missingExamsCard'
import { OcrStudentMatcherList } from '@/components/submissions/ocrStudentMatcherList'
import { PdfDropZone } from '@/components/submissions/pdfDropZone'
import { UploadStatusCard } from '@/components/submissions/uploadStatusCard'
import { UploadedFiles } from '@/components/submissions/uploadedFiles'
import cards from '@/components/submissions/submissions.module.css'
import { useCourse } from '@/context/CourseContext'
import { useExamUploads } from '@/hooks/useExamUploads'
import styles from './upload.module.css'

// Upload scanned exams, split them into one PDF per student, and match each to the roster.
export default function UploadSubmissionsPage() {
  const { examId } = useParams()
  const { refresh } = useCourse()
  const { exam, students, error, uploading, upload, match, reprocess, remove, assign, unassign } = useExamUploads(
    examId,
    refresh,
  )

  if (!exam || !students) {
    return (
      <main className={styles.page}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.loading}>Loading…</p>
        )}
      </main>
    )
  }

  const withExam = students.filter((s) => s.submission).length

  return (
    <main className={styles.page}>
      <ExamHeader meta={`${withExam} of ${students.length} ${students.length === 1 ? 'student has' : 'students have'} an exam`} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.column}>
          <section className={cards.card} aria-labelledby="scans-heading">
            <div className={cards.cardHeading}>
              <h2 id="scans-heading" className={cards.cardTitle}>
                Scanned exams
              </h2>
              <span className={cards.cardMeta}>PDF files only</span>
            </div>
            {!exam.cover_template && (
              <p className={styles.notice}>
                {exam.title} doesn’t have a cover template yet, so scans can’t be split into one exam per student. Uploading
                opens once the template is set up.
              </p>
            )}
            <PdfDropZone onUploadFiles={upload} uploading={uploading} disabled={!exam.cover_template} />
            <UploadedFiles examId={examId} uploads={exam.uploads} onMatch={match} onReprocess={reprocess} onRemove={remove} />
          </section>

          <OcrStudentMatcherList examId={examId} uploads={exam.uploads} students={students} onAssign={assign} onUnassign={unassign} />
        </div>

        <aside className={styles.column}>
          <UploadStatusCard uploads={exam.uploads} students={students} />
          <MissingExamsCard students={students} />
        </aside>
      </div>
    </main>
  )
}
