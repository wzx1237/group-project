'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './rubric.module.css'

function CriterionRow({ criterion, onUpdate, onRetire }) {
  const [draft, setDraft] = useState({ title: criterion.title, deduction: criterion.deduction })

  useEffect(() => {
    setDraft({ title: criterion.title, deduction: criterion.deduction })
  }, [criterion.title, criterion.deduction])

  function commit() {
    if (draft.title !== criterion.title || Number(draft.deduction) !== criterion.deduction) {
      onUpdate({ title: draft.title, description: criterion.description, deduction: Number(draft.deduction) || 0 })
    }
  }

  return (
    <li>
      <input
        className="search"
        type="number"
        step="0.5"
        value={draft.deduction}
        onChange={(e) => setDraft({ ...draft, deduction: e.target.value })}
        onBlur={commit}
      />
      <input
        className="search"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        onBlur={commit}
      />
      <Button variant="secondary" size="sm" onClick={onRetire} aria-label="Remove criterion">
        ×
      </Button>
    </li>
  )
}

export function QuestionEditor({ index, question, onUpdateQuestion, onRetireQuestion, onAddCriterion, onUpdateCriterion, onRetireCriterion }) {
  const [draft, setDraft] = useState({ title: question.title, total_score: question.total_score })

  useEffect(() => {
    setDraft({ title: question.title, total_score: question.total_score })
  }, [question.title, question.total_score])

  function commit() {
    if (draft.title !== question.title || Number(draft.total_score) !== question.total_score) {
      onUpdateQuestion({
        qid: question.qid,
        title: draft.title,
        grading_method: question.grading_method,
        total_score: Number(draft.total_score) || 0,
      })
    }
  }

  return (
    <div className={styles.card}>
      <div className="row-meta">
        <span className="role">Q{index + 1}</span>
        <input
          className="search"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          onBlur={commit}
        />
        <input
          className="search"
          type="number"
          step="0.5"
          value={draft.total_score}
          onChange={(e) => setDraft({ ...draft, total_score: e.target.value })}
          onBlur={commit}
        />
        <span>pts</span>
        <Button variant="secondary" size="sm" onClick={onRetireQuestion} aria-label="Remove question">
          ×
        </Button>
      </div>

      <ul className="submission-list">
        {question.criteria.map((c) => (
          <CriterionRow
            key={c.label_id}
            criterion={c}
            onUpdate={(body) => onUpdateCriterion(c.label_id, body)}
            onRetire={() => onRetireCriterion(c.label_id)}
          />
        ))}
      </ul>

      <Button variant="secondary" size="sm" onClick={onAddCriterion}>
        + Add criterion
      </Button>
    </div>
  )
}
