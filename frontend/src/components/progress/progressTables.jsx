import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import styles from './progressTables.module.css'

const STATUS = {
  graded: { label: 'Graded', tone: 'soft' },
  regrade: { label: 'Regrade', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'outline' },
  not_started: { label: 'Not started', tone: 'neutral' },
}

const ANSWER = { finished: 'Graded', regrade: 'Regrade', inprogress: 'In progress', in_progress: 'In progress', pending: '—' }

// One row per question: how many answers are graded, and how many wait for a regrade.
export function QuestionProgressTable({ questions }) {
  if (!questions.length) return <p className={styles.empty}>No questions in the rubric yet.</p>
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Progress</th>
            <th scope="col" className={styles.number}>
              Graded
            </th>
            <th scope="col" className={styles.number}>
              Regrade
            </th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q, i) => (
            <tr key={q.qid}>
              <th scope="row">Q{i + 1}</th>
              <td>
                <ProgressBar value={q.finished} total={q.total} />
              </td>
              <td className={styles.number}>
                {q.finished} / {q.total}
              </td>
              <td className={styles.number}>{q.regrade > 0 ? <Badge tone="warning">{q.regrade}</Badge> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// One row per student with a paper, with a cell per question. A name opens that student in the grading workspace.
export function StudentProgressTable({ students, questions, gradeHref }) {
  if (!students.length) return <p className={styles.empty}>No scanned exams matched to students yet.</p>
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Status</th>
            <th scope="col">Progress</th>
            {questions.map((q, i) => (
              <th key={q.qid} scope="col" className={styles.cell}>
                Q{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const { label, tone } = STATUS[s.status]
            return (
              <tr key={s.uid}>
                <th scope="row">
                  <Link className={styles.link} href={gradeHref(s.uid)}>
                    {s.name}
                  </Link>
                  <span className={styles.uid}>{s.uid}</span>
                </th>
                <td>
                  <Badge tone={tone}>{label}</Badge>
                </td>
                <td>
                  <ProgressBar value={s.finished} total={s.questions} />
                </td>
                {questions.map((q) => {
                  const state = s.answers[q.qid] ?? 'pending'
                  return (
                    <td key={q.qid} className={`${styles.cell} ${styles[state] ?? ''}`} title={ANSWER[state] ?? state}>
                      {state === 'finished' ? '✓' : state === 'regrade' ? '↻' : state === 'pending' ? '—' : '…'}
                      <span className={styles.srOnly}>{ANSWER[state] ?? state}</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
