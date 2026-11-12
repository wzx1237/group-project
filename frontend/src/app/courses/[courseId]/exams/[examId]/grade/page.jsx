'use client'

import { Suspense, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { GradingFilterBar } from '@/components/grading/gradingFilterBar'
import { RegradeQueueSelector } from '@/components/grading/regradeQueueSelector'
import { RubricPanel } from '@/components/grading/rubricPanel'
import { WorkspaceHeader } from '@/components/grading/workspaceHeader'
import { useCourse } from '@/context/CourseContext'
import { submissionUrl } from '@/exam-distribution/lib/api'
import { formatDue } from '@/exam-distribution/lib/status'
import { useGradingSession } from '@/hooks/useGradingSession'
import { useRegradeQueues } from '@/hooks/useRegradeQueues'
import { useQuestionProgress } from '@/hooks/useQuestionProgress'
import { useRubric } from '@/hooks/useRubric'
import { gradingProgress, rubricPoints } from '@/lib/rubric'
import * as regradeService from '@/services/regradeService'
import styles from './gradingWorkspace.module.css'

// PDF.js needs the browser, so the viewer isn't rendered on the server.
const PdfCanvasViewer = dynamic(() => import('@/components/grading/pdfCanvasViewer').then((m) => m.PdfCanvasViewer), {
  ssr: false,
})

function GradingWorkspace() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { course, assignments } = useCourse()
  const assignment = assignments.find((a) => a.id === examId)
  const { rubric, error: rubricError, actions } = useRubric(examId)
  const { queues, loaded: queuesLoaded, error: queueError } = useRegradeQueues(examId)
  // Counts reload after every grade save and whenever the regrade queues change.
  const { progress: questionProgress, refresh: refreshProgress } = useQuestionProgress(examId, queues)
  const session = useGradingSession(examId, rubric?.questions ?? null, refreshProgress, queuesLoaded ? queues : null)
  const [showRegions, setShowRegions] = useState(true)
  const { students, student, index } = session

  if (!assignment) return <p className="status error">Exam not found.</p>

  const questions = rubric?.questions ?? []
  const upload = student && assignment.uploads?.find((u) => u.id === student.submission.upload_id)
  const scan = upload?.submissions?.find((s) => s.id === student.submission.submission_id)
  const error = rubricError || session.error || queueError

  const reviewHref = (queueId, studentUid) =>
    `/courses/${courseId}/exams/${examId}/regrade/${queueId}${studentUid ? `?${new URLSearchParams({ student: studentUid })}` : ''}`
  const regrade = {
    queues,
    href: reviewHref,
    open: (queue) => router.push(reviewHref(queue.id)),
    flag: (qid, body) =>
      regradeService.flagForRegrade(examId, { qid, ...body }).then((queue) => router.push(reviewHref(queue.id))),
  }

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
          regradeCount={queues.filter((q) => q.pending_student_uids.includes(student.uid)).length}
        />
      ) : (
        <header className={styles.summary}>
          <h1 className={styles.title}>{assignment.title}</h1>
          <p className={styles.meta}>
            {course.code} · Due {formatDue(assignment.due)}
            {students && (session.total ? ' · No exams match this filter' : ' · No scanned exams to grade yet')}
          </p>
        </header>
      )}

      {rubric && (
        <GradingFilterBar
          courseId={courseId}
          questions={questions}
          queues={queues}
          filter={session.filter}
          onChange={session.setFilter}
          count={students?.length}
          total={session.total}
        />
      )}

      <RegradeQueueSelector queues={queues} questions={questions} href={reviewHref} />

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
              focusQid={session.filter.q}
              showRegions={showRegions}
              onToggleRegions={() => setShowRegions((shown) => !shown)}
            />
          ) : (
            <p className={styles.empty}>{students ? 'No submission selected' : 'Loading submissions…'}</p>
          )}
        </section>
        {rubric ? (
          <RubricPanel
            className={styles.rubric}
            examId={examId}
            examTitle={assignment.title}
            course={course}
            allowSubquestions={false}
            canModifyQuestions={assignment.status === 'draft'}
            canModifyRubric={assignment.status !== 'closed'}
            onImported={(result) => {
              refreshProgress()
              if (session.filter.q && result?.questions && !result.questions.some((q) => q.qid === session.filter.q)) {
                session.setFilter({ ...session.filter, q: null, criterion: null })
              }
            }}
            focusQid={session.filter.q}
            questions={questions}
            submissionCount={students?.length ?? 0}
            actions={actions}
            regrade={regrade}
            questionProgress={questionProgress}
            grading={
              student && {
                studentUid: student.uid,
                loaded: session.loaded,
                decisions: session.decisions,
                examComment: session.examComment,
                onToggleCriterion: session.toggleCriterion,
                onSaveNotes: session.saveNotes,
                onSaveExamComment: session.saveExamComment,
                locks: session.locks,
                onTakeOver: session.takeOver,
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
