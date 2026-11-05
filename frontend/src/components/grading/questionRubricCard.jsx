'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatPoints, gradingProgress, partLabel, questionPoints, scoringOf } from '@/lib/rubric'
import { CommentAndNotesBox } from './commentAndNotesBox'
import { CriterionEditorForm } from './criterionEditorForm'
import { CriterionRow } from './criterionRow'
import { icon } from './icon'
import { QuestionEditorForm } from './questionEditorForm'
import styles from './rubricPanel.module.css'

export function QuestionRubricCard({ question, label, parts = [], isPart = false, collapsed, onToggle, actions, grading }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  const isCollapsed = collapsed.has(question.qid)
  const hasParts = parts.length > 0
  const name = question.title ? `${label} · ${question.title}` : label
  const points = questionPoints(question, parts)
  const progress = grading && gradingProgress(hasParts ? parts : [question], grading.decisions)
  const applied = grading?.decisions[question.qid]?.criteria ?? []
  const closeForm = () => setForm(null)

  function handleRemove() {
    const contents = hasParts ? ' and its subquestions' : question.criteria.length ? ' and its criteria' : ''
    if (window.confirm(`Remove ${name}${contents}?`)) actions.removeQuestion(question.qid)
  }

  function handleRemoveCriterion(criterion) {
    if (window.confirm(`Remove the criterion “${criterion.title}”?`)) actions.removeCriterion(question.qid, criterion.label_id)
  }

  return (
    <section className={styles.card} aria-label={name}>
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.chevron}
          onClick={() => onToggle(question.qid)}
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? 'Show' : 'Hide'} ${label}`}
        >
          {isCollapsed ? <ChevronRight {...icon} /> : <ChevronDown {...icon} />}
        </button>
        <h3 className={styles.name}>{name}</h3>
        <span className={styles.points}>
          {progress ? `${progress.gradedCount ? progress.earned : '—'} / ${points}` : formatPoints(points)}
        </span>
      </div>

      {!isCollapsed && (
        <>
          {editing ? (
            <QuestionEditorForm
              heading={`Edit ${label}`}
              initialQuestion={question}
              gradable={!hasParts}
              note={hasParts ? 'Points come from its subquestions' : null}
              onSave={(body) => actions.updateQuestion(question.qid, body).then((ok) => ok && setEditing(false))}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className={styles.actions}>
              {!hasParts && (
                <Button size="sm" onClick={() => setForm('criterion')}>
                  <Plus {...icon} />
                  Criterion
                </Button>
              )}
              {!isPart && (
                <Button size="sm" onClick={() => setForm('part')}>
                  <Plus {...icon} />
                  Subquestion
                </Button>
              )}
              <Button size="sm" onClick={handleRemove}>
                <Trash2 {...icon} />
                Remove
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil {...icon} />
                Edit
              </Button>
            </div>
          )}

          {(question.criteria.length > 0 || form === 'criterion') && (
            <ul className={styles.criteria}>
              {question.criteria.map((criterion) =>
                form === criterion.label_id ? (
                  <li key={criterion.label_id}>
                    <CriterionEditorForm
                      initialCriterion={criterion}
                      question={question}
                      onSave={(body) =>
                        actions.updateCriterion(question.qid, criterion.label_id, body).then((ok) => ok && closeForm())
                      }
                      onCancel={closeForm}
                    />
                  </li>
                ) : (
                  <CriterionRow
                    key={criterion.label_id}
                    criterion={criterion}
                    editing={editing}
                    applied={applied.includes(criterion.label_id)}
                    onApply={grading && (() => grading.onToggleCriterion(question.qid, criterion.label_id))}
                    onEdit={() => setForm(criterion.label_id)}
                    onRemove={() => handleRemoveCriterion(criterion)}
                  />
                ),
              )}
              {form === 'criterion' && (
                <li>
                  <CriterionEditorForm
                    question={question}
                    onSave={(body) => actions.addCriterion(question.qid, body).then((ok) => ok && closeForm())}
                    onCancel={closeForm}
                  />
                </li>
              )}
            </ul>
          )}

          {grading?.loaded && !hasParts && (
            <CommentAndNotesBox
              key={grading.studentUid}
              decision={grading.decisions[question.qid]}
              onSave={(notes) => grading.onSaveNotes(question.qid, notes)}
            />
          )}

          {(hasParts || form === 'part') && (
            <div className={styles.parts}>
              {parts.map((part, i) => (
                <QuestionRubricCard
                  key={part.qid}
                  question={part}
                  label={partLabel(label, i)}
                  isPart
                  collapsed={collapsed}
                  onToggle={onToggle}
                  actions={actions}
                  grading={grading}
                />
              ))}
              {form === 'part' && (
                <QuestionEditorForm
                  heading="New subquestion"
                  initialScoring={scoringOf(question)}
                  note={!hasParts && question.criteria.length ? `${label}'s criteria move into this subquestion` : null}
                  onSave={(body) => actions.addQuestion({ ...body, parent_qid: question.qid }).then((ok) => ok && closeForm())}
                  onCancel={closeForm}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
