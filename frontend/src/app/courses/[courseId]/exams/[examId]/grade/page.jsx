'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
import { gradingProgress, questionLabel } from '@/lib/rubric'
import { gradingQuestions } from '@/lib/gradingQueue'
import { examGradePath, questionStudentsPath } from '@/lib/routes'
import * as regradeService from '@/services/regradeService'
import styles from './gradingWorkspace.module.css'

// PDF.js needs the browser, so the viewer isn't rendered on the server.
const PdfCanvasViewer = dynamic(() => import('@/components/grading/pdfCanvasViewer').then((m) => m.PdfCanvasViewer), {
  ssr: false,
})

function GradingWorkspace() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { course, assignments, refresh } = useCourse()
  const params = useSearchParams()
  const selectedQid = params.get('q')
  const requestedUid = params.get('student')
  const queueHref = examGradePath(String(courseId), examId)
  const assignment = assignments.find((a) => a.id === examId)
  const { rubric, error: rubricError, actions } = useRubric(examId)
  const { queues, loaded: queuesLoaded, error: queueError } = useRegradeQueues(examId)
  // Counts reload after every grade save and whenever the regrade queues change.
  const { progress: questionProgress, refresh: refreshProgress } = useQuestionProgress(examId, queues)
  const session = useGradingSession(examId, rubric?.questions ?? null, refreshProgress, queuesLoaded ? queues : null)
  const [showRegions, setShowRegions] = useState(true)
  const active = useRef(true)
  const { students, student } = session

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (!selectedQid || !requestedUid) {
      router.replace(`${queueHref}${requestedUid ? `?${new URLSearchParams({ student: requestedUid })}` : ''}`)
    }
  }, [selectedQid, requestedUid, queueHref, router])

  if (!assignment) return <p className="status error">Exam not found.</p>

  const questions = rubric?.questions ?? []
  const selectedQuestion = gradingQuestions(questions).find((q) => q.qid === selectedQid)
  const backHref = selectedQuestion ? questionStudentsPath(String(courseId), examId, selectedQid) : queueHref
  const selectedQueues = queues.filter((q) => q.qid === selectedQid)
  const canSubmit = ['grading', 'in_review'].includes(assignment.status)

  async function submit() {
    if (!canSubmit || !selectedQuestion || student?.uid !== requestedUid) return
    if (await session.submit(selectedQid) && active.current) {
      refresh?.()
      router.push(`${backHref}?${new URLSearchParams({ submitted: student.uid })}`)
    }
  }

  if (!selectedQid || !requestedUid) return <p className={styles.empty}>Opening question queue…</p>
  if (rubric && !selectedQuestion) return <main className={styles.summary}><h1 className={styles.title}>Choose a question to grade</h1><p className={styles.meta}>Select a question or subquestion from the grading queue.</p><a href={queueHref}>Back to questions</a></main>
  if (students && student?.uid !== requestedUid) return <main className={styles.summary}><h1 className={styles.title}>Student response not found</h1><a href={backHref}>Back to students</a></main>
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
          progress={gradingProgress(selectedQuestion ? [selectedQuestion] : [], session.decisions)}
          totalPoints={selectedQuestion?.total_score ?? 0}
          questionLabel={selectedQuestion && questionLabel(questions, selectedQid)}
          backHref={backHref}
          onSubmit={submit}
          submitting={session.submitting}
          submitDisabled={!session.loaded || !canSubmit || Boolean(session.locks[selectedQid] && !session.locks[selectedQid].mine)}
          regradeCount={selectedQueues.filter((q) => q.pending_student_uids.includes(student.uid)).length}
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

      {selectedQuestion && (
        <p className={styles.scope}>
          {questionLabel(questions, selectedQid)}{selectedQuestion.title ? ` · ${selectedQuestion.title}` : ''}
          {' · '}{selectedQuestion.region ? `Answer region on page ${selectedQuestion.region.page}` : 'No answer region is set for this question; showing the full exam.'}
        </p>
      )}
      <RegradeQueueSelector queues={selectedQueues} questions={questions} href={reviewHref} />

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
              focusQid={selectedQid}
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
                router.replace(queueHref)
              }
            }}
            focusQid={selectedQid}
            scopeQid={selectedQid}
            questions={questions}
            submissionCount={students?.length ?? 0}
            actions={actions}
            regrade={regrade}
            questionProgress={questionProgress}
            grading={
              student && {
                studentUid: student.uid,
                loaded: session.loaded,
                submitting: session.submitting,
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
