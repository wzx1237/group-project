'use client'

import { useParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { ExamHeader } from '@/components/exam/examHeader'
import { Button } from '@/components/ui/Button'
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
  const { courseId, examId } = useParams()
  const { refresh } = useCourse()
  const { exam, students, error, uploading, upload, match, reprocess, remove, assign, unassign, mark, reload } =
    useExamUploads(examId, refresh)

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
  // Scans are uploaded and matched only while collecting; excusing and no-shows stay open until the assignment closes.
  const collecting = exam.status === 'collecting'
  const open = ['collecting', 'grading', 'in_review'].includes(exam.status)

  return (
    <main className={styles.page}>
      <ExamHeader
        meta={`${withExam} of ${students.length} ${students.length === 1 ? 'student has' : 'students have'} an exam`}
        onStatusChange={reload}
        showGrading={false}
      />

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
            {exam.status === 'draft' && (
              <p className={styles.notice}>Scans can be uploaded once {exam.title} is published to TAs.</p>
            )}
            {!exam.cover_template && (
              <p className={styles.notice}>
                {exam.title} doesn’t have a cover template yet, so scans can’t be split into one exam per student. Uploading
                opens once the template is set up.
              </p>
            )}
            <PdfDropZone onUploadFiles={upload} uploading={uploading} disabled={!exam.cover_template || !collecting} />
            <UploadedFiles examId={examId} uploads={exam.uploads} onMatch={match} onReprocess={reprocess} onRemove={remove} />
          </section>

          <OcrStudentMatcherList examId={examId} uploads={exam.uploads} students={students} onAssign={assign} onUnassign={unassign} />
        </div>

        <aside className={styles.column}>
          <UploadStatusCard uploads={exam.uploads} students={students} />
          <Button variant="primary" size="lg" href={`/courses/${courseId}/exams/${examId}/grade`} className={styles.grade}>
            Open grading <ArrowRight size={16} strokeWidth={1.6} aria-hidden />
          </Button>
          <MissingExamsCard students={students} open={open} onMark={mark} />
        </aside>
      </div>
    </main>
  )
}
