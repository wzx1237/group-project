'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCourse } from '@/context/CourseContext'
import { useAuth } from '@/hooks/useAuth'
import { coursePath } from '@/lib/routes'
import { Button } from '@/components/ui/Button'
import { formatDue } from '@/exam-distribution/lib/status'
import { RegionCanvas } from './RegionCanvas'
import { QuestionList } from './QuestionList'
import styles from './questions.module.css'

const newId = () => `q-${Math.random().toString(36).slice(2, 8)}`

export default function QuestionsAndRegionsPage() {
  const { examId } = useParams()
  const router = useRouter()
  const { course, assignments } = useCourse()
  const { user } = useAuth()
  const assignment = assignments?.find((a) => a.id === examId)

  const [questions, setQuestions] = useState([{ qid: newId(), title: '', total_score: 5, region: null }])
  const [activeQid, setActiveQid] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)

  function handleAddQuestion() {
    setQuestions((prev) => [...prev, { qid: newId(), title: '', total_score: 5, region: null }])
  }

  function handleUpdateQuestion(qid, body) {
    setQuestions((prev) => prev.map((q) => (q.qid === qid ? { ...q, ...body } : q)))
  }

  function handleRemoveQuestion(qid) {
    setQuestions((prev) => prev.filter((q) => q.qid !== qid))
    if (activeQid === qid) setActiveQid(null)
  }

  function handleSaveRegion(qid, region) {
    setQuestions((prev) => prev.map((q) => (q.qid === qid ? { ...q, region } : q)))
    const next = questions.find((q) => q.qid !== qid && !q.region)
    setActiveQid(next ? next.qid : null)
  }

  if (!course || !assignment) {
    return <p className="empty">Loading…</p>
  }

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
            Region Selecting
          </h1>
        </div>
      </div>

      <div className={styles.split}>
        <RegionCanvas
          questions={questions}
          activeQid={activeQid}
          onSaveRegion={handleSaveRegion}
          currentPage={currentPage}
          onChangePage={setCurrentPage}
        />

        <QuestionList
          questions={questions}
          onAddQuestion={handleAddQuestion}
          onUpdateQuestion={handleUpdateQuestion}
          onRemoveQuestion={handleRemoveQuestion}
          onDraw={setActiveQid}
          onBack={() => router.push(`${coursePath(course)}/exams/${examId}/upload`)}
          onContinue={() => router.push(`${coursePath(course)}/exams/${examId}/rubric`)}
        />
      </div>
    </main>
  )
}
