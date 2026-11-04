'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { getCourses } from '@/services/postgresGradingService'
import styles from '@/components/grading/gradingFlow.module.css'

export default function CoursesPage() {
  const [courses, setCourses] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    getCourses().then(data => { if (active) setCourses(data) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])
  return <ProtectedRoute><main className={styles.page}>
    <h1>Courses</h1><p>Your courses and grading assignments</p>
    {error && <p role="alert" className={styles.error}>{error} <button onClick={() => window.location.reload()}>Retry</button></p>}
    {!courses && !error && <p role="status">Loading courses…</p>}
    {courses?.length === 0 && <p>You are not assigned to any courses. Ask your instructor to add you.</p>}
    <div className={styles.grid}>{courses?.map(course => <article className={styles.card} key={course.course_id}>
      <h2><Link href={`/courses/${course.course_id}`}>{course.code}</Link></h2>
      <p>{course.title}</p><p>{course.term} · {course.role}</p>
      <Link href={`/courses/${course.course_id}`}>View grading questions</Link>
    </article>)}</div>
  </main></ProtectedRoute>
}
