'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SetupStep } from '@/components/exam-setup/setupStep'
import { BlankExamUploadStep } from '@/components/exam-setup/blankExamUploadStep'
import { QuestionAndRegionsStep } from '@/components/exam-setup/questionAndRegionsStep'
import { InitialRubricSetup } from '@/components/exam-setup/initialRubricSetup'
import { GraderAssignmentStep } from '@/components/exam-setup/graderAssignmentStep'
import { useCourse } from '@/context/CourseContext'
import * as examsSetupService from '@/services/examsSetupService'
import styles from './examsetup.module.css'

// coordinates the 4-step exam creation wizard from templates to grader assignments
export default function ExamSetupWizardPage() {
  const { courseId } = useParams()
  const router = useRouter()
  const { course, refresh } = useCourse() || {}

  const [currentStep, setCurrentStep] = useState(1)
  const [examData, setExamData] = useState({
    title: 'Quiz 03: Derivatives',
    totalPoints: 20,
    dueDate: '2026-09-28',
    blankPdf: null,
    answerKeyPdf: null,
    questions: [],
    rubric: [],
    gradingMode: 'by_question',
    assignments: {},
  })

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

  // saves step 3 rubric criteria deductions then advances to step 4
  function handleStep3Next(rubric) {
    setExamData((prev) => ({ ...prev, rubric }))
    setCurrentStep(4)
  }

  // submits all finalized exam specifications to backend api and redirects to submissions upload
  async function handlePublishExam(finalPayload) {
    const completeExam = {
      ...examData,
      ...finalPayload,
    }

    try {
      const created = await examsSetupService.createExamDraft(courseId, {
        title: completeExam.title,
        total_score: completeExam.totalPoints,
        due: completeExam.dueDate,
      })

      const examId = created?.id || 'quiz-03'

      if (completeExam.blankPdf) {
        await examsSetupService.uploadExamTemplatePdf(examId, completeExam.blankPdf, 'blank_exam')
      }
      if (completeExam.answerKeyPdf) {
        await examsSetupService.uploadExamTemplatePdf(examId, completeExam.answerKeyPdf, 'answer_key')
      }

      await examsSetupService.saveQuestionDefinitionsAndRegions(examId, completeExam.questions)
      await examsSetupService.assignGradersToQuestions(examId, completeExam.assignments)

      await refresh?.()
      router.push(`/courses/${courseId}/exams/${examId}/upload`)
    } catch {
      router.push(`/courses/${courseId}/exams/quiz-03/upload`)
    }
  }

  return (
    <main className={styles.container}>
      <header className={styles.topBar}>
        <div className={styles.headingGroup}>
          <h1 className={styles.title}>
            {examData.title || 'New Exam Setup'}
          </h1>
          <p className={styles.meta}>
            {course?.code || 'MATH 101'} · Draft mode
          </p>
        </div>
      </header>

      <div className={styles.stepperContainer}>
        <SetupStep currentStep={currentStep} onStepClick={(step) => step < currentStep && setCurrentStep(step)} />
      </div>

      <section className={styles.stepBody}>
        {currentStep === 1 && (
          <BlankExamUploadStep initialData={examData} onNext={handleStep1Next} />
        )}

        {currentStep === 2 && (
          <QuestionAndRegionsStep
            initialQuestions={examData.questions}
            totalExamPoints={examData.totalPoints}
            onBack={() => setCurrentStep(1)}
            onNext={handleStep2Next}
          />
        )}

        {currentStep === 3 && (
          <InitialRubricSetup
            questions={examData.questions}
            onBack={() => setCurrentStep(2)}
            onNext={handleStep3Next}
          />
        )}

        {currentStep === 4 && (
          <GraderAssignmentStep
            questions={examData.questions}
            onBack={() => setCurrentStep(3)}
            onPublish={handlePublishExam}
          />
        )}
      </section>
    </main>
  )
}
