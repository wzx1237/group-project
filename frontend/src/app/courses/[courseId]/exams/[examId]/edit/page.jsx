'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { PageNotice } from '@/components/layout/PageNotice'
import { SetupStep } from '@/components/exam-setup/setupStep'
import { BlankExamUploadStep } from '@/components/exam-setup/blankExamUploadStep'
import { QuestionAndRegionsStep } from '@/components/exam-setup/questionAndRegionsStep'
import { InitialRubricSetup } from '@/components/exam-setup/initialRubricSetup'
import { useCourse } from '@/context/CourseContext'
import { rubricPoints, topLevel } from '@/lib/rubric'
import { fetchExamRubric } from '@/services/rubricService'
import * as examsSetupService from '@/services/examsSetupService'
import styles from '../../new/examsetup.module.css'

// the exam setup wizard again for an existing assignment: details, blank exam, questions and regions, then rubric
export default function EditAssignmentPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { course, assignments, refresh } = useCourse() || {}
  const assignment = assignments?.find((a) => a.id === examId)

  const [currentStep, setCurrentStep] = useState(1)
  const [examData, setExamData] = useState(null) // null until the saved setup has loaded
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const savedPdf = useRef(null) // the blank exam as loaded, to tell whether a new one was chosen

  useEffect(() => {
    if (!assignment || examData) return
    let cancelled = false
    Promise.all([fetchExamRubric(examId), examsSetupService.fetchBlankExam(examId)])
      .then(([rubric, blankPdf]) => {
        if (cancelled) return
        savedPdf.current = blankPdf
        const total = rubricPoints(rubric.questions)
        setExamData({
          kind: assignment.kind || 'exam',
          title: assignment.title,
          totalPoints: total || '',
          dueDate: assignment.due ? assignment.due.slice(0, 10) : '',
          blankPdf,
          questions: topLevel(rubric.questions).map(({ criteria, ...q }) => q),
          rubric: rubric.questions,
        })
      })
      .catch((err) => !cancelled && setLoadError(err.message))
    return () => {
      cancelled = true
    }
  }, [assignment, examData, examId])

  // Step 3 can add, rename, re-point or remove questions, so step 2's list follows it (minus criteria and parts).
  const saveRubric = useCallback(
    (rubric) => setExamData((prev) => ({ ...prev, rubric, questions: topLevel(rubric).map(({ criteria, ...q }) => q) })),
    [],
  )
  // Past draft, the blank exam and question regions are fixed (scans were matched against them); criteria stay
  // editable until the assignment closes. The server enforces both.
  const locked = assignment && assignment.status !== 'draft'
  const closed = assignment?.status === 'closed'

  if (course && course.role !== 'instructor') {
    return (
      <main className={styles.container}>
        <p className={styles.publishError} role="alert">Only instructors can edit assignments.</p>
        <Link href={`/courses/${courseId}`}>Back to course</Link>
      </main>
    )
  }
  if (loadError) {
    return <PageNotice title="Could not load this assignment">{loadError}</PageNotice>
  }
  if (!examData) {
    return <PageNotice title="Loading assignment…" />
  }

  // saves the title, type and due date, and the blank exam when a different one was chosen
  async function saveDetails(data) {
    await examsSetupService.updateAssignment(examId, { title: data.title, kind: data.kind, due: data.dueDate })
    if (data.blankPdf && data.blankPdf !== savedPdf.current) {
      await examsSetupService.uploadExamTemplatePdf(examId, data.blankPdf, 'blank_exam')
      savedPdf.current = data.blankPdf
    }
  }

  // saves only the details from step 1, leaving the questions and rubric as they are
  async function handleSaveDetails(data) {
    setSaveError('')
    try {
      await saveDetails(data)
      await refresh?.()
      router.push(`/courses/${courseId}`)
    } catch (err) {
      setSaveError(`Could not save: ${err.message}`)
    }
  }

  async function handleSaveAll(rubric) {
    setSaveError('')
    try {
      await saveDetails(examData)
      await examsSetupService.syncQuestionsAndRubric(examId, rubric)
      await refresh?.()
      router.push(`/courses/${courseId}`)
    } catch (err) {
      setSaveError(`Saving failed: ${err.message.replace(/\.$/, '')}. Your changes are still here, so you can try again.`)
    }
  }

  return (
    <main className={styles.container}>
      <header className={styles.topBar}>
        <div className={styles.headingGroup}>
          <h1 className={styles.title}>{examData.title || 'Edit Assignment'}</h1>
          <p className={styles.meta}>{course?.code} · Editing assignment</p>
        </div>
      </header>

      <div className={styles.stepperContainer}>
        <SetupStep currentStep={currentStep} onStepClick={(step) => step < currentStep && setCurrentStep(step)} />
      </div>

      {locked && (
        <p className={styles.meta} role="note">
          {closed
            ? 'This assignment is closed. Only its title, type and due date can change; reopen it to change the rubric.'
            : 'This assignment has been published, so the blank exam and question regions are locked. Rubric criteria can still change.'}
        </p>
      )}

      {saveError && (
        <p className={styles.publishError} role="alert">
          {saveError}
        </p>
      )}

      <section className={styles.stepBody}>
        {currentStep === 1 && (
          <BlankExamUploadStep
            initialData={examData}
            requirePdf={false}
            pdfLocked={locked}
            nextLabel={locked ? 'Rubric' : 'Questions and Regions'}
            skipLabel="Save details only"
            onSkip={handleSaveDetails}
            onNext={(data) => {
              if (closed) return handleSaveDetails(data)
              setExamData((prev) => ({ ...prev, ...data }))
              setCurrentStep(locked ? 3 : 2)
            }}
          />
        )}

        {currentStep === 2 && !locked && (
          <QuestionAndRegionsStep
            blankPdf={examData.blankPdf}
            initialQuestions={examData.questions}
            totalExamPoints={examData.totalPoints}
            onBack={() => setCurrentStep(1)}
            onNext={(questions) => {
              setExamData((prev) => ({ ...prev, questions }))
              setCurrentStep(3)
            }}
          />
        )}

        {currentStep === 3 && (
          <InitialRubricSetup
            examId={examId}
            examTitle={examData.title}
            course={course}
            questions={examData.questions}
            rubric={examData.rubric}
            canModifyQuestions={!locked}
            canModifyRubric={!closed}
            onChange={saveRubric}
            onBack={() => setCurrentStep(locked ? 1 : 2)}
            onNext={handleSaveAll}
            submitLabel="Save changes"
            submittingLabel="Saving…"
          />
        )}
      </section>
    </main>
  )
}
