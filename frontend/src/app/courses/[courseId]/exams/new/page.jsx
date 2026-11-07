'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { SetupStep } from '@/components/exam-setup/setupStep'
import { BlankExamUploadStep } from '@/components/exam-setup/blankExamUploadStep'
import { QuestionAndRegionsStep } from '@/components/exam-setup/questionAndRegionsStep'
import { InitialRubricSetup } from '@/components/exam-setup/initialRubricSetup'
import { useCourse } from '@/context/CourseContext'
import { topLevel } from '@/lib/rubric'
import * as examsSetupService from '@/services/examsSetupService'
import styles from './examsetup.module.css'

// coordinates the 3-step exam creation wizard: exam files, questions and regions, then the rubric
export default function ExamSetupWizardPage() {
  const { courseId } = useParams()
  const router = useRouter()
  const { course, refresh } = useCourse() || {}

  const [currentStep, setCurrentStep] = useState(1)
  const [publishError, setPublishError] = useState('')
  const [created, setCreated] = useState(null) // the assignment, once creating it has worked
  const [examData, setExamData] = useState({
    kind: 'exam',
    title: '',
    totalPoints: '',
    dueDate: '',
    blankPdf: null,
    questions: [],
  })

  // Step 3 can add, rename, re-point or remove questions, so step 2's list follows it (minus criteria and parts).
  const saveRubric = useCallback(
    (rubric) => setExamData((prev) => ({ ...prev, rubric, questions: topLevel(rubric).map(({ criteria, ...q }) => q) })),
    [],
  )

  // saves step 1 file templates and metadata then advances to step 2
  function handleStep1Next(data) {
    setExamData((prev) => ({ ...prev, ...data }))
    setCurrentStep(2)
  }

  // saves step 2 question definitions and answer regions then advances to step 3
  function handleStep2Next(questions) {
    setExamData((prev) => ({ ...prev, questions }))
    setCurrentStep(3)
  }

  // creates the assignment with no blank exam, questions or rubric; those can be added later
  async function handleSkipSetup(data) {
    setPublishError('')
    try {
      const exam = created || (await examsSetupService.createExamDraft(courseId, { title: data.title, kind: data.kind, due: data.dueDate }))
      setCreated(exam)
      await refresh?.()
      router.push(`/courses/${courseId}/exams/${exam.id}/upload`)
    } catch (err) {
      setPublishError(`Could not create the assignment: ${err.message}`)
    }
  }

  // Creates the exam, saves its blank PDF (which sets up splitting scans), questions, regions and rubric, then opens
  // its upload page. If a later part fails, the wizard keeps its data so Create exam can be tried again.
  async function handleCreateExam(rubric) {
    setPublishError('')

    let exam = created
    if (!exam) {
      try {
        exam = await examsSetupService.createExamDraft(courseId, { title: examData.title, kind: examData.kind, due: examData.dueDate })
      } catch (err) {
        setPublishError(`Could not create the exam: ${err.message}`)
        return
      }
      setCreated(exam)
      await refresh?.()
    }

    try {
      await examsSetupService.uploadExamTemplatePdf(exam.id, examData.blankPdf, 'blank_exam')
      await examsSetupService.saveQuestionsAndRubric(exam.id, rubric)
      router.push(`/courses/${courseId}/exams/${exam.id}/upload`)
    } catch (err) {
      const reason = err.message.replace(/\.$/, '')
      setPublishError(`“${exam.title}” was created, but saving its setup failed: ${reason}. Your setup is still here, so you can try again.`)
    }
  }

  if (course && course.role !== 'instructor') {
    return (
      <main className={styles.container}>
        <p className={styles.publishError} role="alert">Only instructors can create exams.</p>
        <Link href={`/courses/${courseId}`}>Back to course</Link>
      </main>
    )
  }

  return (
    <main className={styles.container}>
      <header className={styles.topBar}>
        <div className={styles.headingGroup}>
          <h1 className={styles.title}>
            {examData.title || 'New Exam Setup'}
          </h1>
          <p className={styles.meta}>
            {course?.code} · Draft mode
          </p>
        </div>
      </header>

      <div className={styles.stepperContainer}>
        <SetupStep currentStep={currentStep} onStepClick={(step) => step < currentStep && setCurrentStep(step)} />
      </div>

      {publishError && (
        <p className={styles.publishError} role="alert">
          {publishError}
          {created && (
            <>
              {' '}
              <Link href={`/courses/${courseId}/exams/${created.id}/upload`}>Open {created.title}</Link>
            </>
          )}
        </p>
      )}

      <section className={styles.stepBody}>
        {currentStep === 1 && (
          <BlankExamUploadStep initialData={examData} onNext={handleStep1Next} onSkip={handleSkipSetup} />
        )}

        {currentStep === 2 && (
          <QuestionAndRegionsStep
            blankPdf={examData.blankPdf}
            initialQuestions={examData.questions}
            totalExamPoints={examData.totalPoints}
            onBack={() => setCurrentStep(1)}
            onNext={handleStep2Next}
          />
        )}

        {currentStep === 3 && (
          <InitialRubricSetup
            questions={examData.questions}
            rubric={examData.rubric}
            onChange={saveRubric}
            onBack={() => setCurrentStep(2)}
            onNext={handleCreateExam}
          />
        )}
      </section>
    </main>
  )
}
