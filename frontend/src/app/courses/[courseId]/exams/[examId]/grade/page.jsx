'use client'

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { RubricPanel } from '@/components/grading/rubricPanel'
import { WorkspaceHeader } from '@/components/grading/workspaceHeader'
import { useCourse } from '@/context/CourseContext'
import { submissionUrl } from '@/exam-distribution/lib/api'
import { formatDue } from '@/exam-distribution/lib/status'
import { useGradingSession } from '@/hooks/useGradingSession'
import { useRubric } from '@/hooks/useRubric'
import { gradingProgress, rubricPoints } from '@/lib/rubric'
import styles from './gradingWorkspace.module.css'

// PDF.js needs the browser, so the viewer isn't rendered on the server.
const PdfCanvasViewer = dynamic(() => import('@/components/grading/pdfCanvasViewer').then((m) => m.PdfCanvasViewer), {
  ssr: false,
})

function GradingWorkspace() {
  const { examId } = useParams()
  const { course, assignments } = useCourse()
  const assignment = assignments.find((a) => a.id === examId)
  const { rubric, error: rubricError, actions } = useRubric(examId)
  const session = useGradingSession(examId)
  const { students, student, index } = session

  if (!assignment) return <p className="status error">Exam not found.</p>

  const questions = rubric?.questions ?? []
  const upload = student && assignment.uploads?.find((u) => u.id === student.submission.upload_id)
  const scan = upload?.submissions?.find((s) => s.id === student.submission.submission_id)
  const error = rubricError || session.error

  return (
    <main className={styles.workspace}>
      {student ? (
        <WorkspaceHeader
          student={student}
          uploadedAt={upload?.uploaded_at}
          progress={gradingProgress(questions, session.decisions)}
          totalPoints={rubricPoints(questions)}
          position={{ index, count: students.length }}
          onPrevious={() => session.goTo(index - 1)}
          onNext={() => session.goTo(index + 1)}
        />
      ) : (
        <header className={styles.summary}>
          <h1 className={styles.title}>{assignment.title}</h1>
          <p className={styles.meta}>
            {course.code} · Due {formatDue(assignment.due)}
            {students && ' · No scanned exams to grade yet'}
          </p>
        </header>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.split}>
        <section className={styles.viewer} aria-label="Student exam">
          {student ? (
            <PdfCanvasViewer
              url={submissionUrl(examId, student.submission.upload_id, student.submission.submission_id)}
              filename={scan?.filename ?? `${student.name}'s exam`}
              questions={questions}
            />
          ) : (
            <p className={styles.empty}>{students ? 'No submission selected' : 'Loading submissions…'}</p>
          )}
        </section>
        {rubric ? (
          <RubricPanel
            className={styles.rubric}
            allowSubquestions={false}
            questions={questions}
            submissionCount={students?.length ?? 0}
            actions={actions}
            grading={
              student && {
                studentUid: student.uid,
                loaded: session.loaded,
                decisions: session.decisions,
                onToggleCriterion: session.toggleCriterion,
                onSaveNotes: session.saveNotes,
              }
            }
          />
        ) : (
          <p className={styles.loading}>Loading rubric…</p>
        )}
      </div>
    </main>
  )
}

export default function GradingWorkspacePage() {
  return (
    <Suspense>
      <GradingWorkspace />
    </Suspense>
  )
}
