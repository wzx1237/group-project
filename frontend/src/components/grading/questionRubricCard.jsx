'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Lock, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatPoints, gradingProgress, partLabel, plural, questionPoints, scoringOf } from '@/lib/rubric'
import { CommentAndNotesBox } from './commentAndNotesBox'
import { CriterionEditorForm } from './criterionEditorForm'
import { CriterionRow } from './criterionRow'
import { CriterionSplitDialog } from './criterionSplit'
import { FlagRegradeForm } from './flagRegradeForm'
import { icon } from './icon'
import { QuestionEditorForm } from './questionEditorForm'
import styles from './rubricPanel.module.css'

export function QuestionRubricCard(props) {
  const { question, label, parts = [], isPart = false, allowSubquestions = true, collapsed, onToggle, actions, grading } = props
  const { editor, onOpenEditor, onCloseEditor, regrade, questionProgress } = props
  const qid = question.qid
  // Which of this question's editors is open, if any: its question form, one criterion, a new criterion or subquestion.
  const editingQuestion = editor === `edit:${qid}`
  const editingCriterion = editor?.startsWith(`criterion:${qid}:`) ? editor.slice(`criterion:${qid}:`.length) : null
  const editing = editingQuestion || editingCriterion !== null
  const addingCriterion = editor === `new-criterion:${qid}`
  const addingPart = editor === `new-part:${qid}`
  const flagging = editor === `flag:${qid}`
  // Leaving a criterion's form goes back to editing its question.
  const backToQuestion = () => onOpenEditor(`edit:${qid}`, { discard: true })
  const [splitting, setSplitting] = useState(null)
  // Offered after a criterion is added to a question that already has graded answers.
  const [newCriterion, setNewCriterion] = useState(null)
  const [promptProblem, setPromptProblem] = useState('')

  const isCollapsed = collapsed.has(question.qid)
  const hasParts = parts.length > 0
  const name = question.title ? `${label} · ${question.title}` : label
  const points = questionPoints(question, parts)
  const progress = grading && gradingProgress(hasParts ? parts : [question], grading.decisions)
  const counts = questionProgress?.[qid]
  const applied = grading?.decisions[question.qid]?.criteria ?? []
  const retired = (question.retired_criteria ?? []).filter((c) => applied.includes(c.label_id))
  const waiting = grading && regrade ? regrade.queues.filter((q) => q.qid === qid && q.pending_student_uids.includes(grading.studentUid)) : []
  // Another grader is working on this answer, so it is read-only here until they let go or it is taken over.
  const lock = grading?.locks?.[qid]
  const lockedOut = Boolean(lock && !lock.mine)

  function handleTakeOver() {
    if (window.confirm(`Take over this answer from ${lock.holder_name}? They won't be able to save it until they take it back.`)) {
      grading.onTakeOver(qid)
    }
  }

  function handleRemove() {
    const contents = hasParts ? ' and its subquestions' : question.criteria.length ? ' and its criteria' : ''
    if (window.confirm(`Remove ${name}${contents}?`)) actions.removeQuestion(question.qid)
  }

  function handleRemoveCriterion(criterion) {
    if (window.confirm(`Remove the criterion “${criterion.title}”?`)) actions.removeCriterion(question.qid, criterion.label_id)
  }

  async function handleAddCriterion(body) {
    const graded = question.graded
    if (!(await actions.addCriterion(question.qid, body))) return
    onCloseEditor()
    if (regrade && graded) setNewCriterion({ title: body.title, count: graded })
  }

  async function handleSplit(replacements) {
    const { queue } = await actions.splitCriterion(question.qid, splitting.label_id, replacements)
    setSplitting(null)
    onCloseEditor()
    if (queue) regrade.open(queue)
  }

  async function reviewNewCriterion() {
    setPromptProblem('')
    try {
      await regrade.flag(qid, { reason: `New criterion “${newCriterion.title}”` })
    } catch (err) {
      setPromptProblem(err.message)
    }
  }

  return (
    <section className={styles.card} aria-label={name} data-editor-owner={qid}>
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
          {editingQuestion ? (
            <QuestionEditorForm
              heading={`Edit ${label}`}
              initialQuestion={question}
              gradable={!hasParts}
              note={hasParts ? 'Points come from its subquestions' : null}
              onSave={(body) => actions.updateQuestion(question.qid, body).then((ok) => ok && onCloseEditor())}
              onCancel={onCloseEditor}
            />
          ) : (
            <div className={styles.actions}>
              {!hasParts && (
                <Button size="sm" onClick={() => onOpenEditor(`new-criterion:${qid}`)}>
                  <Plus {...icon} />
                  Criterion
                </Button>
              )}
              {!isPart && allowSubquestions && (
                <Button size="sm" onClick={() => onOpenEditor(`new-part:${qid}`)}>
                  <Plus {...icon} />
                  Subquestion
                </Button>
              )}
              {regrade && !hasParts && question.graded > 0 && (
                <Button size="sm" onClick={() => onOpenEditor(`flag:${qid}`)}>
                  <RotateCcw {...icon} />
                  Regrade
                </Button>
              )}
              <Button size="sm" onClick={handleRemove}>
                <Trash2 {...icon} />
                Remove
              </Button>
              <Button size="sm" onClick={() => onOpenEditor(`edit:${qid}`)}>
                <Pencil {...icon} />
                Edit
              </Button>
            </div>
          )}

          {flagging && (
            <FlagRegradeForm question={question} onSubmit={(body) => regrade.flag(qid, body)} onCancel={onCloseEditor} />
          )}

          {waiting.map((queue) => (
            <p key={queue.id} className={styles.waiting}>
              <RotateCcw {...icon} />
              <span className={styles.waitingText}>Waiting for regrade · {queue.reason}</span>
              <Link className={styles.waitingLink} href={regrade.href(queue.id, grading.studentUid)}>
                Review
              </Link>
            </p>
          ))}

          {lockedOut && (
            <p className={styles.lockedBy} role="status">
              <Lock {...icon} />
              <span className={styles.waitingText}>{lock.holder_name} is grading this answer</span>
              <button type="button" className={styles.takeOver} onClick={handleTakeOver}>
                Take over
              </button>
            </p>
          )}

          {(question.criteria.length > 0 || retired.length > 0 || addingCriterion) && (
            <ul className={styles.criteria}>
              {question.criteria.map((criterion) =>
                editingCriterion === criterion.label_id ? (
                  <li key={criterion.label_id}>
                    <CriterionEditorForm
                      initialCriterion={criterion}
                      question={question}
                      onSave={(body) =>
                        actions.updateCriterion(question.qid, criterion.label_id, body).then((ok) => ok && backToQuestion())
                      }
                      onCancel={backToQuestion}
                    />
                  </li>
                ) : (
                  <CriterionRow
                    key={criterion.label_id}
                    criterion={criterion}
                    editing={editing}
                    applied={applied.includes(criterion.label_id)}
                    disabled={lockedOut}
                    onApply={grading && (() => grading.onToggleCriterion(question.qid, criterion.label_id))}
                    onEdit={() => onOpenEditor(`criterion:${qid}:${criterion.label_id}`)}
                    onSplit={regrade && (() => setSplitting(criterion))}
                    onRemove={() => handleRemoveCriterion(criterion)}
                  />
                ),
              )}
              {retired.map((criterion) => (
                <CriterionRow key={criterion.label_id} criterion={criterion} retired />
              ))}
              {addingCriterion && (
                <li>
                  <CriterionEditorForm question={question} onSave={handleAddCriterion} onCancel={onCloseEditor} />
                </li>
              )}
            </ul>
          )}

          {newCriterion && (
            <div className={styles.prompt} role="status">
              <p className={styles.promptText}>
                {`${plural(newCriterion.count, 'answer')} ${newCriterion.count === 1 ? 'was' : 'were'} graded before “${newCriterion.title}” was added. Check ${newCriterion.count === 1 ? 'it' : 'them'} for the new criterion?`}
              </p>
              {promptProblem && (
                <p className={styles.problem} role="alert">
                  {promptProblem}
                </p>
              )}
              <div className={styles.saveActions}>
                <Button size="sm" onClick={() => setNewCriterion(null)}>
                  Not now
                </Button>
                <Button size="sm" variant="primary" onClick={reviewNewCriterion}>
                  Review {plural(newCriterion.count, 'answer')}
                </Button>
              </div>
            </div>
          )}

          {grading?.loaded && !hasParts && (
            <fieldset className={styles.lockScope} disabled={lockedOut}>
              <CommentAndNotesBox
                key={`${grading.studentUid}-${grading.decisions[question.qid]?.version ?? 0}`}
                decision={grading.decisions[question.qid]}
                onSave={(notes) => grading.onSaveNotes(question.qid, notes)}
              />
            </fieldset>
          )}

          {counts?.total > 0 && !hasParts && (
            <div className={styles.progress}>
              <ProgressBar value={counts.finished} total={counts.total} />
              <span className={styles.progressText}>
                {counts.finished} / {counts.total} graded
              </span>
              {counts.regrade > 0 && <Badge tone="warning">{counts.regrade} to regrade</Badge>}
            </div>
          )}

          {(hasParts || addingPart) && (
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
                  regrade={regrade}
                  questionProgress={questionProgress}
                  editor={editor}
                  onOpenEditor={onOpenEditor}
                  onCloseEditor={onCloseEditor}
                />
              ))}
              {addingPart && (
                <QuestionEditorForm
                  heading="New subquestion"
                  initialScoring={scoringOf(question)}
                  note={!hasParts && question.criteria.length ? `${label}'s criteria move into this subquestion` : null}
                  onSave={(body) => actions.addQuestion({ ...body, parent_qid: question.qid }).then((ok) => ok && onCloseEditor())}
                  onCancel={onCloseEditor}
                />
              )}
            </div>
          )}

          {splitting && (
            <CriterionSplitDialog
              criterion={splitting}
              question={question}
              label={label}
              onSplit={handleSplit}
              onClose={() => setSplitting(null)}
            />
          )}
        </>
      )}
    </section>
  )
}
