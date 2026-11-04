'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'
import { coursePath } from '@/lib/routes'
import { Button } from '@/components/ui/Button'
import { formatDue } from '@/exam-distribution/lib/status'
import { QuestionEditor } from './QuestionEditor'
import { RubricPreview, previewIssueCount } from './RubricPreview'
import styles from './rubric.module.css'

const newId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 8)}`

export default function RubricSetupPage() {
  const { courseId, examId } = useParams()
  const router = useRouter()
  const { course, assignments } = useCourse()
  const { user } = useAuth()
  const assignment = assignments?.find((a) => a.id === examId)

  const [questions, setQuestions] = useState([])

  function handleAddQuestion() {
    setQuestions((prev) => [
      ...prev,
      { qid: newId('q-'), title: '', grading_method: 'manual', total_score: 5, criteria: [] },
    ])
  }

  function handleUpdateQuestion(qid, body) {
    setQuestions((prev) => prev.map((q) => (q.qid === qid ? { ...q, ...body } : q)))
  }

  function handleRetireQuestion(qid) {
    setQuestions((prev) => prev.filter((q) => q.qid !== qid))
  }

  function handleAddCriterion(qid) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.qid === qid
          ? { ...q, criteria: [...q.criteria, { label_id: newId('c-'), title: '', description: '', deduction: 1 }] }
          : q,
      ),
    )
  }

  function handleUpdateCriterion(labelId, body) {
    setQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        criteria: q.criteria.map((c) => (c.label_id === labelId ? { ...c, ...body } : c)),
      })),
    )
  }

  function handleRetireCriterion(labelId) {
    setQuestions((prev) => prev.map((q) => ({ ...q, criteria: q.criteria.filter((c) => c.label_id !== labelId) })))
  }

  if (!course || !assignment) {
    return <p className="empty">Loading…</p>
  }

  const totalPts = questions.reduce((sum, q) => sum + (Number(q.total_score) || 0), 0)
  const issues = previewIssueCount(questions)

  return (
    <main>
      <header className="topbar">
        <span className="brand">
          {course.code} · {assignment.title}
        </span>
        <Button variant="secondary" size="sm" onClick={() => router.push(`${coursePath(course)}/exams/${examId}/upload`)}>
          Exit setup
        </Button>
        {user && <span className="role">{user.directory_id.slice(0, 2).toUpperCase()}</span>}
      </header>

      <div className="upload-row">
        <div>
          <h1>
            Rubric edit <span className="badge">Draft</span>
          </h1>
          <p className="sub">
            {assignment.title} · {formatDue(assignment.due)} · {totalPts} pts
          </p>
        </div>
      </div>

      <div className={styles.split}>
        <section className={styles.editor}>
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.qid}
              index={i}
              question={q}
              onUpdateQuestion={(body) => handleUpdateQuestion(q.qid, body)}
              onRetireQuestion={() => handleRetireQuestion(q.qid)}
              onAddCriterion={() => handleAddCriterion(q.qid)}
              onUpdateCriterion={handleUpdateCriterion}
              onRetireCriterion={handleRetireCriterion}
            />
          ))}

          <Button variant="secondary" onClick={handleAddQuestion}>
            + Add question
          </Button>
        </section>

        <aside className={`assign-panel ${styles.preview}`}>
          <div className="upload-row">
            <strong>Preview</strong>
            <span className={issues === 0 ? 'badge' : 'badge processing'}>
              {issues === 0 ? 'No errors' : `${issues} to finish`}
            </span>
          </div>

          <RubricPreview questions={questions} />

          <div className="actions">
            <Button variant="secondary" onClick={() => router.push(`${coursePath(course)}/exams/${examId}/questions`)}>
              ← Back
            </Button>
            <Button variant="primary" onClick={() => router.push(`${coursePath(course)}/exams/${examId}/grade`)}>
              Continue to graders →
            </Button>
          </div>
        </aside>
      </div>
    </main>
  )
}
