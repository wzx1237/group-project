'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { getQuestions } from '@/services/postgresGradingService'
import styles from '@/components/grading/gradingFlow.module.css'

export default function CourseQuestionsPage() {
  const { courseId } = useParams()
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getQuestions(courseId).then(data => { if (active) setQuestions(data) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [courseId])
  return <ProtectedRoute><main className={styles.page}>
    <Link href="/courses">← Courses</Link><h1>Grading questions</h1>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!questions && !error && <p role="status">Loading questions…</p>}
    {questions?.length === 0 && <p>No exam questions have been configured for this course yet.</p>}
    <div className={styles.grid}>{questions?.map(q => <article className={styles.card} key={`${q.exam_id}:${q.qid}`}>
      <h2>{q.exam_name} · {q.qid}</h2><p>Maximum score: {q.total_scores}</p>
      <p>Assigned to you: {q.assigned} · Finished: {q.finished} · Regrade: {q.regrade}</p>
      <p>Available answers: {q.available}</p>
      {q.available > 0 ? <Link href={`/courses/${courseId}/exams/${q.exam_id}/grade?qid=${encodeURIComponent(q.qid)}`}>Start grading</Link> : <p>No available answers</p>}
    </article>)}</div>
  </main></ProtectedRoute>
}
