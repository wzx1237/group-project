'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, List, Plus, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { parentQid, partsOf, plural, rubricPoints, topLevel as topLevelOf } from '@/lib/rubric'
import { EXAM_COMMENT, ExamCommentCard } from './commentAndNotesBox'
import { icon } from './icon'
import { ImportRubricDialog } from './importRubricDialog'
import { QuestionEditorForm } from './questionEditorForm'
import { QuestionRubricCard } from './questionRubricCard'
import styles from './rubricPanel.module.css'

const NEW_QUESTION = 'new-question'

// The question an editor key belongs to: 'edit:Q1', 'criterion:Q1:12', 'new-criterion:Q1' and 'new-part:Q1' are Q1's.
const ownerOf = (key) => (key === NEW_QUESTION ? key : key?.split(':')[1])

// `focusQid` (the grading filter's question) is the one card left open, scrolled into view.
export function RubricPanel({
  examId = null,
  examTitle = '',
  course = null,
  questions,
  submissionCount,
  actions,
  grading,
  regrade,
  questionProgress,
  className,
  allowSubquestions = true,
  canModifyQuestions = true,
  canModifyRubric = true,
  onImported,
  focusQid = null,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState(null)
  const [regradeError, setRegradeError] = useState('')
  const list = useRef(null)
  const focusTop = focusQid && (parentQid(focusQid) ?? focusQid)

  // Picking a question in the filter collapses the others; clearing it leaves the cards as they are.
  const [focusedOn, setFocusedOn] = useState(null)
  if (focusedOn !== focusTop) {
    setFocusedOn(focusTop)
    if (focusTop) setCollapsed(new Set(topLevelOf(questions).map((q) => q.qid).filter((qid) => qid !== focusTop)))
  }

  useEffect(() => {
    if (!focusTop) return
    list.current?.querySelector(`[data-editor-owner="${CSS.escape(focusQid)}"]`)?.scrollIntoView({ block: 'start' })
  }, [focusTop, focusQid])
  // Only one editor is open at a time, so opening another closes it.
  const [editor, setEditor] = useState(null)
  const current = useRef(null)
  const dirty = useRef(false)

  // Opening another editor discards an unsaved one only after asking; `discard` skips that, as Save and Cancel do.
  function openEditor(key, { discard = false } = {}) {
    if (!discard && current.current && current.current !== key && dirty.current) {
      if (!window.confirm('Discard your unsaved changes?')) return
    }
    current.current = key
    dirty.current = false
    setEditor(key)
  }

  function closeEditor() {
    current.current = null
    dirty.current = false
    setEditor(null)
  }

  // A click elsewhere in the panel closes an editor nobody has typed in. Clicks outside the panel (the PDF, the
  // header) never do. It runs after the click, so a click that opened another editor isn't undone.
  function handleClick(event) {
    if (!current.current || dirty.current) return
    if (event.target.closest('[data-editor-owner]')?.dataset.editorOwner !== ownerOf(current.current)) closeEditor()
  }

  function handleInput(event) {
    if (event.target.closest('form')) dirty.current = true
  }

  const editors = { editor, onOpenEditor: openEditor, onCloseEditor: closeEditor }

  const topLevel = topLevelOf(questions)

  function toggle(qid) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(qid)) next.add(qid)
      return next
    })
  }

  function openImport() {
    if (current.current && dirty.current) {
      if (!window.confirm('Discard your unsaved changes?')) return
    }
    closeEditor()
    setImportNotice(null)
    setRegradeError('')
    setImporting(true)
  }

  async function handleImport(payload) {
    const result = await actions.importRubric(payload)
    const summary = result?.summary
    if (summary) setImportNotice(summary)
    onImported?.(result)
  }

  async function flagImportedQuestion(qid) {
    setRegradeError('')
    try {
      await regrade.flag(qid, { reason: 'Imported criteria from previous rubric' })
    } catch (err) {
      setRegradeError(err.message)
    }
  }

  return (
    <aside
      className={[styles.pane, className].filter(Boolean).join(' ')}
      aria-labelledby="rubric-heading"
      onClick={handleClick}
      onInput={handleInput}
    >
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
          <Button size="sm" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set([...topLevel.map((q) => q.qid), EXAM_COMMENT]))}>
            <List {...icon} />
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </Button>
        )}
      </div>

      {importNotice && (
        <div className={styles.importBanner} role="status">
          <div className={styles.importBannerTop}>
            <span>
              Imported{' '}
              {[
                importNotice.questions_added > 0 && plural(importNotice.questions_added, 'question'),
                `${importNotice.criteria_added} ${importNotice.criteria_added === 1 ? 'criterion' : 'criteria'}`,
              ]
                .filter(Boolean)
                .join(' and ')}
              {importNotice.criteria_skipped > 0 ? ` (${importNotice.criteria_skipped} duplicate skipped)` : ''}.
            </span>
            <button type="button" className={styles.iconButton} onClick={() => setImportNotice(null)} aria-label="Dismiss notice">
              <X {...icon} />
            </button>
          </div>
          {regrade && importNotice.affected_graded_qids?.length > 0 && (
            <div className={styles.importRegrade}>
              <span>Already-graded answers kept their scores. Review in a regrade queue?</span>
              <div className={styles.saveActions}>
                {importNotice.affected_graded_qids.map((qid) => (
                  <Button key={qid} size="sm" onClick={() => flagImportedQuestion(qid)}>
                    <RotateCcw {...icon} />
                    Regrade {qid}
                  </Button>
                ))}
              </div>
              {regradeError && (
                <p className={styles.problem} role="alert">
                  {regradeError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div ref={list} className={styles.list}>
        {topLevel.length === 0 && editor !== NEW_QUESTION && (
          <div className={styles.empty}>
            <p>No questions yet. Add one to start the rubric.</p>
            {actions?.importRubric && canModifyRubric && (
              <Button size="sm" onClick={openImport}>
                <Download {...icon} />
                Import previous rubric
              </Button>
            )}
          </div>
        )}
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
            regrade={regrade}
            questionProgress={questionProgress}
            allowSubquestions={allowSubquestions}
            {...editors}
          />
        ))}
        {grading?.loaded && (
          <ExamCommentCard
            // A reload with someone else's comment starts the box over with it.
            key={`${grading.studentUid}-${grading.examComment ?? ''}`}
            comment={grading.examComment}
            onSave={grading.onSaveExamComment}
            lock={grading.locks?.['']}
            onTakeOver={() => grading.onTakeOver('')}
            collapsed={collapsed.has(EXAM_COMMENT)}
            onToggle={toggle}
          />
        )}
        {editor === NEW_QUESTION && (
          <div className={styles.card} data-editor-owner={NEW_QUESTION}>
            <QuestionEditorForm
              heading="New question"
              onSave={(body) => actions.addQuestion(body).then((ok) => ok && closeEditor())}
              onCancel={closeEditor}
            />
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          {actions?.importRubric && canModifyRubric && (
            <Button size="sm" onClick={openImport}>
              <Download {...icon} />
              Import rubric
            </Button>
          )}
        </div>
        {canModifyQuestions && canModifyRubric && (
          <Button
            variant="primary"
            data-editor-owner={NEW_QUESTION}
            onClick={() => openEditor(NEW_QUESTION)}
            disabled={editor === NEW_QUESTION}
          >
            <Plus {...icon} size={16} />
            Add question
          </Button>
        )}
      </div>

      {importing && (
        <ImportRubricDialog
          examId={examId}
          examTitle={examTitle}
          course={course}
          targetQuestions={questions}
          canModifyQuestions={canModifyQuestions}
          onImport={handleImport}
          onClose={() => setImporting(false)}
        />
      )}
    </aside>
  )
}
