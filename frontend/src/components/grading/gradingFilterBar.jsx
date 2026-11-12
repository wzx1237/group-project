'use client'

import { useEffect, useState } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getCourseStaff } from '@/exam-distribution/lib/api'
import { SCORES, filterCriteria, filteredQuestions, isFiltered } from '@/lib/gradingFilter'
import { plural, questionLabel } from '@/lib/rubric'
import { icon } from './icon'
import styles from './gradingFilterBar.module.css'

// Applies a typed number once it is one (or empty), so "2." can be typed on the way to "2.5".
function PointsInput({ label, placeholder, value, onChange }) {
  const [text, setText] = useState(value ?? '')
  return (
    <input
      className={styles.points}
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const typed = e.target.value.trim()
        if (typed === '' || Number.isFinite(Number(typed))) onChange(typed || null)
      }}
    />
  )
}

// Narrows which exams Previous and Next step through: one question's ungraded or graded answers, one grader's
// work, answers with a given criterion or score, or answers waiting in a regrade queue.
export function GradingFilterBar({ courseId, questions, queues = [], filter, onChange, count, total }) {
  const [staff, setStaff] = useState([])
  useEffect(() => {
    getCourseStaff(courseId)
      .then(setStaff)
      .catch(() => setStaff([]))
  }, [courseId])

  const set = (changes) => onChange({ ...filter, ...changes })
  const criteria = filterCriteria(questions, filter.q)
  const filtered = isFiltered(filter)
  const scope = new Set(filteredQuestions(questions, filter.q).map((q) => q.qid))
  const queuesInScope = queues.filter((queue) => scope.has(queue.qid))

  return (
    <div className={styles.bar} role="search" aria-label="Filter exams">
      <span className={styles.label}>
        <Filter {...icon} />
        Show
      </span>

      <select
        className={styles.select}
        aria-label="Question"
        value={filter.q ?? ''}
        // A criterion and a regrade queue belong to one question, so changing the question clears them.
        onChange={(e) =>
          set({ q: e.target.value || null, criterion: null, regrade: filter.regrade === 'waiting' ? 'waiting' : null })
        }
      >
        <option value="">All questions</option>
        {questions.map((q) => (
          <option key={q.qid} value={q.qid}>
            {questionLabel(questions, q.qid)}
            {q.title ? ` · ${q.title}` : ''}
          </option>
        ))}
      </select>

      <select
        className={styles.select}
        aria-label="Grading status"
        value={filter.status ?? ''}
        onChange={(e) => set({ status: e.target.value || null })}
      >
        <option value="">Graded or not</option>
        <option value="ungraded">Ungraded</option>
        <option value="graded">Graded</option>
      </select>

      <select
        className={styles.select}
        aria-label="Graded by"
        value={filter.grader ?? ''}
        onChange={(e) => set({ grader: e.target.value || null })}
      >
        <option value="">Graded by anyone</option>
        {staff.map((person) => (
          <option key={person.directory_id} value={person.directory_id}>
            Graded by {person.name || person.directory_id}
          </option>
        ))}
      </select>

      {filter.q && criteria.length > 0 && (
        <select
          className={styles.select}
          aria-label="Criterion applied"
          value={filter.criterion ?? ''}
          onChange={(e) => set({ criterion: e.target.value || null })}
        >
          <option value="">Any criterion</option>
          {criteria.map((c) => (
            <option key={c.label_id} value={c.label_id}>
              With “{c.title}”
            </option>
          ))}
        </select>
      )}

      <select
        className={styles.select}
        aria-label="Score"
        value={filter.score ?? ''}
        onChange={(e) => set({ score: e.target.value || null, min: null, max: null })}
      >
        <option value="">Any score</option>
        {Object.entries(SCORES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {filter.score === 'range' && (
        <span className={styles.range}>
          <PointsInput label="Lowest score in points" placeholder="min" value={filter.min} onChange={(min) => set({ min })} />
          to
          <PointsInput label="Highest score in points" placeholder="max" value={filter.max} onChange={(max) => set({ max })} />
          pts
        </span>
      )}

      {(queuesInScope.length > 0 || filter.regrade) && (
        <select
          className={styles.select}
          aria-label="Regrade"
          value={filter.regrade ?? ''}
          onChange={(e) => set({ regrade: e.target.value || null })}
        >
          <option value="">Regrade or not</option>
          <option value="waiting">Waiting for regrade</option>
          {queuesInScope.map((queue) => (
            <option key={queue.id} value={queue.id}>
              {`In “${queue.reason}” (${questionLabel(questions, queue.qid)})`}
            </option>
          ))}
        </select>
      )}

      {filtered && (
        <>
          <span className={styles.count} aria-live="polite">
            {count ?? '…'} of {plural(total, 'student')}
          </span>
          <Button size="sm" onClick={() => onChange({})}>
            <X {...icon} />
            Clear
          </Button>
        </>
      )}
    </div>
  )
}
