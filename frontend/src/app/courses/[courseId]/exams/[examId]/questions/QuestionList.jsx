'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './questions.module.css'

// renders a single editable question row with title points and region button
function QuestionRow({ index, question, onUpdate, onRemove, onDraw }) {
  const [draft, setDraft] = useState({ title: question.title, total_score: question.total_score })

  useEffect(() => {
    setDraft({ title: question.title, total_score: question.total_score })
  }, [question.title, question.total_score])

  // commits edited question title and points to parent state
  function commit() {
    onUpdate({ title: draft.title, total_score: Number(draft.total_score) || 0 })
  }

  return (
    <div className={styles.card}>
      <div className="row-meta">
        <span className="role">Q{index + 1}</span>
        <input className="search" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={commit} />
        <input
          className="search"
          type="number"
          step="0.5"
          value={draft.total_score}
          onChange={(e) => setDraft({ ...draft, total_score: e.target.value })}
          onBlur={commit}
        />
        <span>pts</span>
        <Button variant="secondary" size="sm" onClick={onRemove} aria-label="Remove question">
          ×
        </Button>
      </div>

      <div className="row-meta">
        <span className="sub">{question.region ? `Region on page ${question.region.page}` : 'No region yet'}</span>
        <Button variant="secondary" size="sm" onClick={onDraw}>
          Draw region
        </Button>
      </div>
    </div>
  )
}

// renders the sidebar list of defined questions with total points summary
export function QuestionList({ questions, onAddQuestion, onUpdateQuestion, onRemoveQuestion, onDraw, onBack, onContinue }) {
  const totalPts = questions.reduce((sum, q) => sum + (Number(q.total_score) || 0), 0)

  return (
    <aside className={`assign-panel ${styles.preview}`}>
      <div className="upload-row">
        <div>
          <strong>Questions</strong>
        </div>
        <Button variant="primary" size="sm" onClick={onAddQuestion}>
          Add question
        </Button>
      </div>

      {questions.map((q, i) => (
        <QuestionRow
          key={q.qid}
          index={i}
          question={q}
          onUpdate={(body) => onUpdateQuestion(q.qid, body)}
          onRemove={() => onRemoveQuestion(q.qid)}
          onDraw={() => onDraw(q.qid)}
        />
      ))}

      <p className="sub">
        {questions.length} question{questions.length === 1 ? '' : 's'} · {totalPts} pts
      </p>

      <div className="actions">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onContinue}>
          Continue to rubric 
        </Button>
      </div>
    </aside>
  )
}
