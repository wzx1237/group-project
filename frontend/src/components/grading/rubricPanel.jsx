'use client'

import { useRef, useState } from 'react'
import { List, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { partsOf, plural, rubricPoints, topLevel as topLevelOf } from '@/lib/rubric'
import { icon } from './icon'
import { QuestionEditorForm } from './questionEditorForm'
import { QuestionRubricCard } from './questionRubricCard'
import styles from './rubricPanel.module.css'

const NEW_QUESTION = 'new-question'

// The question an editor key belongs to: 'edit:Q1', 'criterion:Q1:12', 'new-criterion:Q1' and 'new-part:Q1' are Q1's.
const ownerOf = (key) => (key === NEW_QUESTION ? key : key?.split(':')[1])

export function RubricPanel({ questions, submissionCount, actions, grading, className, allowSubquestions = true }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
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
          <Button size="sm" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(topLevel.map((q) => q.qid)))}>
            <List {...icon} />
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </Button>
        )}
      </div>


      <div className={styles.list}>
        {topLevel.length === 0 && editor !== NEW_QUESTION && (
          <p className={styles.empty}>No questions yet. Add one to start the rubric.</p>
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
            allowSubquestions={allowSubquestions}
            {...editors}
          />
        ))}
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
        <div className={styles.notice}>
        </div>
        <Button
          variant="primary"
          data-editor-owner={NEW_QUESTION}
          onClick={() => openEditor(NEW_QUESTION)}
          disabled={editor === NEW_QUESTION}
        >
          <Plus {...icon} size={16} />
          Add question
        </Button>
      </div>
    </aside>
  )
}
