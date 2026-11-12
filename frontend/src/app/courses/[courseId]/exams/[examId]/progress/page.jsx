'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ExamHeader } from '@/components/exam/examHeader'
import { QuestionProgressTable, StudentProgressTable } from '@/components/progress/progressTables'
import cards from '@/components/submissions/submissions.module.css'
import { useCourse } from '@/context/CourseContext'
import { plural } from '@/lib/rubric'
import { fetchExamProgress } from '@/services/gradingDecisionService'
import styles from './progress.module.css'

// Where grading stands for the whole exam, by question and by student. Open to any TA or instructor in the course.
export default function GradingProgressPage() {
  const { courseId, examId } = useParams()
  const { assignments } = useCourse()
  const exam = assignments.find((a) => a.id === examId)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchExamProgress(examId)
      .then(setProgress)
      .catch((err) => setError(err.message))
  }, [examId])

  if (!exam) return <p className="status error">Exam not found.</p>

  const graded = progress?.students.filter((s) => s.status === 'graded').length
  const gradeHref = (uid) => `/courses/${courseId}/exams/${examId}/grade?${new URLSearchParams({ student: uid })}`

  return (
    <main className={styles.page}>
      <ExamHeader
        meta={progress && `${graded} of ${plural(progress.students.length, 'exam')} fully graded`}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {exam.status === 'draft' && <p className={styles.notice}>Grading hasn’t started: {exam.title} is still a draft.</p>}

      {progress ? (
        <>
          <section className={cards.card} aria-labelledby="by-question">
            <div className={cards.cardHeading}>
              <h2 id="by-question" className={cards.cardTitle}>
                Progress by question
              </h2>
            </div>
            <QuestionProgressTable questions={progress.questions} />
          </section>

          <section className={cards.card} aria-labelledby="by-student">
            <div className={cards.cardHeading}>
              <h2 id="by-student" className={cards.cardTitle}>
                Progress by student
              </h2>
              <span className={cards.cardMeta}>✓ graded · ↻ regrade · … in progress · — not started</span>
            </div>
            <StudentProgressTable students={progress.students} questions={progress.questions} gradeHref={gradeHref} />
          </section>
        </>
      ) : (
        !error && <p className={styles.loading}>Loading progress…</p>
      )}
    </main>
  )
}
