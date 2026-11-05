'use client'

import { useState } from 'react'
import { List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { partsOf, plural, rubricPoints, topLevel as topLevelOf } from '@/lib/rubric'
import { icon } from './icon'
import { QuestionEditorForm } from './questionEditorForm'
import { QuestionRubricCard } from './questionRubricCard'
import styles from './rubricPanel.module.css'

export function RubricPanel({ questions, submissionCount, actions, grading, className }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [adding, setAdding] = useState(false)

  const topLevel = topLevelOf(questions)

  function toggle(qid) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(qid)) next.add(qid)
      return next
    })
  }

  return (
    <aside className={[styles.pane, className].filter(Boolean).join(' ')} aria-labelledby="rubric-heading">
      <div className={styles.header}>
        <div>
          <h2 id="rubric-heading" className={styles.heading}>
            Question rubric
          </h2>
          <p className={styles.subheading}>
            {plural(topLevel.length, 'question')} · {plural(rubricPoints(questions), 'possible point')}
          </p>
        </div>
        {topLevel.length > 0 && (
          <Button size="sm" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(topLevel.map((q) => q.qid)))}>
            <List {...icon} />
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </Button>
        )}
      </div>

      {grading && topLevel.length > 0 && (
        <p className={styles.instructions}>Select criteria to apply adjustments to the question score.</p>
      )}

      <div className={styles.list}>
        {topLevel.length === 0 && !adding && <p className={styles.empty}>No questions yet. Add one to start the rubric.</p>}
        {topLevel.map((question, i) => (
          <QuestionRubricCard
            key={question.qid}
            question={question}
            label={`Q${i + 1}`}
            parts={partsOf(questions, question.qid)}
            collapsed={collapsed}
            onToggle={toggle}
            actions={actions}
            grading={grading}
          />
        ))}
        {adding && (
          <div className={styles.card}>
            <QuestionEditorForm
              heading="New question"
              onSave={(body) => actions.addQuestion(body).then((ok) => ok && setAdding(false))}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.notice}>
          <span>Rubric changes autosave</span>
          <span className={styles.noticeDetail}>
            {submissionCount === 1
              ? 'Applies to 1 submission'
              : submissionCount
                ? `Applies to all ${submissionCount} submissions`
                : 'Applies to every submission'}
          </span>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)} disabled={adding}>
          <Plus {...icon} size={16} />
          Add question
        </Button>
      </div>
    </aside>
  )
}
