'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ExamHeader } from '@/components/exam/examHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useCourse } from '@/context/CourseContext'
import { useGradingQueue } from '@/hooks/useGradingQueue'
import { useRegradeQueues } from '@/hooks/useRegradeQueues'
import { useRubric } from '@/hooks/useRubric'
import { filterQuery, matches, readFilter } from '@/lib/gradingFilter'
import { ANSWER_STATES, answerState, gradingQuestions, isStudentBased, responseCounts, studentResponse } from '@/lib/gradingQueue'
import { byLastName } from '@/lib/names'
import { answerGradePath, coursePath, examGradePath, questionStudentsPath } from '@/lib/routes'
import { formatPoints, questionLabel, rubricPoints } from '@/lib/rubric'
import { GradingFilterBar } from './gradingFilterBar'
import { RegradeQueueSelector } from './regradeQueueSelector'
import styles from './gradingQueue.module.css'

function Status({ value }) {
  const { label, tone } = ANSWER_STATES[value]
  return <Badge tone={tone}>{label}</Badge>
}

export function GradingQueue({ studentView = false }) {
  const { courseId, examId, qid } = useParams()
  const params = useSearchParams()
  const router = useRouter()
  const { course, assignments } = useCourse()
  const exam = assignments.find((a) => a.id === examId)
  const wholeAssignment = isStudentBased(exam?.kind)
  const showStudents = studentView || wholeAssignment
  const { rubric, error: rubricError } = useRubric(examId)
  const { queues, loaded: queuesLoaded, error: queueError } = useRegradeQueues(examId)
  const { data, error: dataError, refresh } = useGradingQueue(examId, params.get('submitted'))
  const [search, setSearch] = useState(params.get('student') ?? '')
  const [state, setState] = useState('')
  const questions = rubric?.questions ?? []
  const question = questions.find((q) => q.qid === qid)
  const filter = { ...readFilter(params), ...(showStudents && { q: qid }) }
  const base = examGradePath(String(courseId), examId, exam?.kind)
  const reviewHref = (queueId, uid) => `/courses/${courseId}/exams/${examId}/regrade/${encodeURIComponent(queueId)}${uid ? `?${new URLSearchParams({ student: uid })}` : ''}`
  const waiting = (uid) => queues.flatMap((queue) => queue.pending_student_uids.includes(uid) ? [{ id: queue.id, qid: queue.qid }] : [])
  const matchesFilter = (student, selected = filter) => matches(data.decisions[student.uid], selected, questions, waiting(student.uid))
  const ready = Boolean(data && rubric && queuesLoaded)
  const error = rubricError || queueError || dataError

  function setFilter(next) {
    const query = new URLSearchParams(filterQuery(next))
    if (params.get('student')) query.set('student', params.get('student'))
    router.replace(`${base}${query.size ? `?${query}` : ''}`, { scroll: false })
  }

  const studentsHref = (id) => {
    const query = new URLSearchParams(filterQuery({ ...filter, q: null }))
    if (params.get('student')) query.set('student', params.get('student'))
    return `${questionStudentsPath(String(courseId), examId, id)}${query.size ? `?${query}` : ''}`
  }

  useEffect(() => {
    if (wholeAssignment && (!studentView || qid)) {
      const query = new URLSearchParams()
      for (const key of ['student', 'submitted']) if (params.get(key)) query.set(key, params.get(key))
      router.replace(`${base}${query.size ? `?${query}` : ''}`)
    }
  }, [wholeAssignment, studentView, qid, base, params, router])

  if (!exam) return <p className="status error">Exam not found.</p>
  if (studentView && !wholeAssignment && rubric && !gradingQuestions(questions).some((q) => q.qid === qid)) {
    return <main className={styles.page}><h1 className={styles.title}>Choose a question to grade</h1><p>This question is unavailable or has subquestions. Select a grading question from the queue.</p><Button href={base}>Back to questions</Button></main>
  }

  const students = ready ? [...data.students].sort(byLastName) : []
  const response = (s) => studentResponse(questions, s, data.decisions[s.uid], data.assigned, wholeAssignment ? null : qid)
  const stateOf = (s) => wholeAssignment ? response(s).state : answerState(s.answers[qid])
  const matching = ready ? (wholeAssignment ? students : students.filter((s) => matchesFilter(s))) : []
  const visible = matching.filter((s) => (!state || stateOf(s) === state) && `${s.name} ${s.uid}`.toLowerCase().includes(search.trim().toLowerCase()))
  const counts = wholeAssignment ? students.reduce((count, s) => { count[stateOf(s)] += 1; return count }, { pending: 0, in_progress: 0, finished: 0, regrade: 0 }) : responseCounts(students, qid)
  const next = visible.find((s) => stateOf(s) === 'pending')
  const savedStudent = students.find((s) => s.uid === params.get('submitted'))
  const scopedQueues = studentView && !wholeAssignment ? queues.filter((q) => q.qid === qid) : queues
  const label = wholeAssignment ? 'Assignment' : question && questionLabel(questions, question.qid)
  const gradeHref = (uid) => answerGradePath(String(courseId), examId, wholeAssignment ? null : qid, uid)

  return (
    <main className={styles.page}>
      <ExamHeader showGrading={false} meta={wholeAssignment ? 'Select a student to grade their whole assignment.' : studentView && question ? `${label}${question.title ? ` · ${question.title}` : ''}` : 'Select a question, then a student to begin grading.'} />
      <div className={styles.heading}>
        <div><h2 className={styles.title}>{showStudents ? `${wholeAssignment ? '' : (label ?? 'Question') + ' · '}Student responses` : 'Grading queue'}</h2>{showStudents && (wholeAssignment || question) && <p className={styles.meta}>{wholeAssignment ? exam.title : question.title} · {formatPoints(wholeAssignment ? rubricPoints(questions) : question.total_score)}</p>}</div>
        <Button href={showStudents && !wholeAssignment ? base : coursePath(course)}>{showStudents && !wholeAssignment ? 'Back to questions' : 'Back to exams'}</Button>
      </div>

      {error && <p className={styles.error} role="alert">{error}{dataError && <Button size="sm" onClick={refresh}>Retry</Button>}</p>}
      {!['grading', 'in_review'].includes(exam.status) && <p className={styles.notice}>Grading is available when the assignment is in Grading or In review. Its current status is {exam.status}.</p>}
      {!ready && !error && <p className={styles.empty}>Loading grading queue…</p>}

      {ready && !showStudents && (
        <>
          <GradingFilterBar courseId={courseId} questions={questions} queues={queues} filter={filter} onChange={setFilter} count={matching.length} total={students.length} />
          <section className={styles.card} aria-label="Questions to grade">
            <div className={styles.scroll}><table className={styles.table}>
              <thead><tr><th scope="col">Question</th><th scope="col">Points</th><th scope="col">Pending</th><th scope="col">In progress</th><th scope="col">Need regrade</th><th scope="col">Grading progress</th><th scope="col">Matching students</th><th scope="col"><span className={styles.srOnly}>Open question</span></th></tr></thead>
              <tbody>{gradingQuestions(questions, filter.q).map((q) => {
                const count = responseCounts(students, q.qid)
                const matchCount = students.filter((s) => matchesFilter(s, { ...filter, q: q.qid })).length
                return <tr key={q.qid}><th scope="row"><Link className={styles.link} href={studentsHref(q.qid)}>{questionLabel(questions, q.qid)}</Link><span className={styles.meta}>{q.title}</span></th><td>{formatPoints(q.total_score)}</td><td>{count.pending}</td><td>{count.in_progress}</td><td>{count.regrade}</td><td><ProgressBar value={count.finished} total={students.length} /><span className={styles.meta}>{count.finished} of {students.length} finished</span></td><td>{matchCount} / {students.length}</td><td><Button size="sm" href={studentsHref(q.qid)}>View students</Button></td></tr>
              })}</tbody>
            </table></div>
            {!gradingQuestions(questions, filter.q).length && <p className={styles.empty}>{questions.length ? 'No questions match this selection.' : 'No questions in the rubric yet.'}</p>}
          </section>
        </>
      )}

      {ready && showStudents && (wholeAssignment || question) && (
        <>
          <div className={styles.stats}>{Object.entries(ANSWER_STATES).map(([key, { label: name }]) => <div className={styles.stat} key={key}><strong>{counts[key]}</strong><span>{name}</span></div>)}</div>
          {savedStudent && <p className={styles.notice} role="status">Grading saved for {savedStudent.name}. Current status: {ANSWER_STATES[stateOf(savedStudent)].label}.</p>}
          <div className={styles.heading}><div><p className={styles.meta}>{wholeAssignment ? 'Selecting a student opens their full assignment and all question rubrics.' : <>Selecting a student opens {label}&apos;s answer region and rubric.</>}</p>{!wholeAssignment && <Link className={styles.link} href={`${base}?${new URLSearchParams(filterQuery(filter))}`}>Edit response filters</Link>}</div>{next && <Button size="sm" variant="primary" href={gradeHref(next.uid)}>Start next pending</Button>}</div>
          <div className={styles.toolbar}><div className={styles.states} role="group" aria-label="Response status"><Button size="sm" variant={state === '' ? 'primary' : 'secondary'} onClick={() => setState('')} aria-pressed={state === ''}>All students</Button>{Object.entries(ANSWER_STATES).map(([key, value]) => <Button key={key} size="sm" variant={state === key ? 'primary' : 'secondary'} onClick={() => setState(key)} aria-pressed={state === key}>{value.label}</Button>)}</div><input className={styles.search} type="search" aria-label="Search students by name or UID" placeholder="Search by name or UID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <section className={styles.card} aria-label={`${label} student responses`}><div className={styles.scroll}><table className={styles.table}>
            <thead><tr><th scope="col">Student</th><th scope="col">UID</th><th scope="col">Status</th><th scope="col">Score</th><th scope="col">Assigned grader</th><th scope="col"><span className={styles.srOnly}>Open response</span></th></tr></thead>
            <tbody>{visible.map((student) => {
              const result = response(student)
              const href = gradeHref(student.uid)
              const review = scopedQueues.find((q) => q.pending_student_uids.includes(student.uid))
              return <tr key={student.uid} className={student.uid === params.get('submitted') ? styles.saved : undefined}><th scope="row"><Link className={styles.link} href={href}>{student.name}</Link></th><td>{student.uid}</td><td><Status value={stateOf(student)} /></td><td>{result.score === null ? '—' : `${result.score} / ${result.total}`} </td><td>{result.grader}</td><td><Button size="sm" href={href}>Open response</Button>{review && <Button size="sm" href={reviewHref(review.id, student.uid)}>Review regrade</Button>}</td></tr>
            })}</tbody>
          </table></div>{!visible.length && <p className={styles.empty}>{students.length ? 'No responses match your filters or search.' : 'No scanned exams matched to students yet.'}</p>}<p className={styles.meta}>Showing {visible.length} of {students.length} students</p></section>
        </>
      )}
      {rubric && <RegradeQueueSelector queues={scopedQueues} questions={questions} href={reviewHref} />}
    </main>
  )
}
