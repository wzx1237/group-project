'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, Lock, Plus, User } from 'lucide-react'
import { icon } from './icon'
import styles from './rubricPanel.module.css'

const small = { ...icon, size: 12 }

function NoteField({ id, label, tag, hint, value, onChange, onFocus, onBlur, focusOnOpen, className }) {
  const ref = useRef(null)

  useEffect(() => {
    if (focusOnOpen) ref.current.focus()
  }, [focusOnOpen])

  return (
    <div className={styles.noteField}>
      <div className={styles.noteHeading}>
        <label htmlFor={id}>{label}</label>
        {tag}
      </div>
      <textarea
        ref={ref}
        id={id}
        className={[styles.noteInput, className].filter(Boolean).join(' ')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => e.key === 'Escape' && ref.current.blur()}
        aria-describedby={`${id}-hint`}
      />
      {hint}
    </div>
  )
}

// Each field opens from its own link, stays open while focused, and folds back into the link if left empty.
export function CommentAndNotesBox({ decision, onSave }) {
  const id = useId()
  const [opened, setOpened] = useState(null)
  const [comment, setComment] = useState(decision?.comment ?? '')
  const [note, setNote] = useState(decision?.internal_note ?? '')

  const showComment = opened === 'comment' || comment !== ''
  const showNote = opened === 'note' || note !== ''

  function handleBlur() {
    const notes = { comment: comment.trim() || null, internal_note: note.trim() || null }
    setComment(notes.comment ?? '')
    setNote(notes.internal_note ?? '')
    setOpened(null)
    if (notes.comment !== (decision?.comment ?? null) || notes.internal_note !== (decision?.internal_note ?? null)) {
      onSave(notes)
    }
  }

  return (
    <div className={[styles.notes, (showComment || showNote) && styles.notesOpen].filter(Boolean).join(' ')}>
      <div className={styles.notesBar}>
        <span className={styles.scope}>
          <User {...small} />
          This submission only
        </span>
        <span className={styles.noteLinks}>
          {!showComment && (
            <button type="button" className={styles.noteLink} onClick={() => setOpened('comment')}>
              <Plus {...small} />
              Comment to student
            </button>
          )}
          {!showNote && (
            <button type="button" className={styles.noteLink} onClick={() => setOpened('note')}>
              <Plus {...small} />
              Internal note
            </button>
          )}
        </span>
      </div>
      {showComment && (
        <NoteField
          id={`${id}-comment`}
          label="Comment to student"
          tag={
            <span className={styles.onReport}>
              <Eye {...small} />
              On report
            </span>
          }
          hint={
            <span id={`${id}-comment-hint`} className={styles.noteHint}>
              Appears on the student&apos;s report.
            </span>
          }
          value={comment}
          onChange={setComment}
          onFocus={() => setOpened('comment')}
          onBlur={handleBlur}
          focusOnOpen={opened === 'comment'}
        />
      )}
      {showNote && (
        <NoteField
          id={`${id}-note`}
          label="Internal note"
          tag={
            <span id={`${id}-note-hint`} className={styles.staffOnly}>
              <Lock {...small} />
              Staff only, never shown to students
            </span>
          }
          value={note}
          onChange={setNote}
          onFocus={() => setOpened('note')}
          onBlur={handleBlur}
          focusOnOpen={opened === 'note'}
          className={styles.internal}
        />
      )}
    </div>
  )
}


export const EXAM_COMMENT = 'exam-comment'

// A comment to this student about their whole exam, in a card of its own after the questions. Saves when you leave it.
// `lock` is set when someone is writing it; another grader's lock makes it read-only here until they let go.
export function ExamCommentCard({ comment: savedComment, onSave, collapsed, onToggle, lock, onTakeOver }) {
  const id = useId()
  const [comment, setComment] = useState(savedComment ?? '')
  const lockedOut = Boolean(lock && !lock.mine)

  function handleTakeOver() {
    if (window.confirm(`Take over the overall comment from ${lock.holder_name}? They won't be able to save it until they take it back.`)) {
      onTakeOver()
    }
  }

  function handleBlur() {
    const next = comment.trim() || null
    setComment(next ?? '')
    if (next !== (savedComment ?? null)) onSave(next)
  }

  return (
    <section className={styles.card} aria-labelledby={`${id}-name`}>
      <div className={styles.summary}>
        <button
          type="button"
          className={styles.chevron}
          onClick={() => onToggle(EXAM_COMMENT)}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Show' : 'Hide'} overall comment`}
        >
          {collapsed ? <ChevronRight {...icon} /> : <ChevronDown {...icon} />}
        </button>
        <h3 id={`${id}-name`} className={styles.name}>
          Overall comment
        </h3>
      </div>
      {!collapsed && lockedOut && (
        <p className={styles.lockedBy} role="status">
          <Lock {...icon} />
          <span className={styles.waitingText}>{lock.holder_name} is writing this comment</span>
          <button type="button" className={styles.takeOver} onClick={handleTakeOver}>
            Take over
          </button>
        </p>
      )}
      {!collapsed && (
        <textarea
          className={styles.noteInput}
          aria-labelledby={`${id}-name`}
          disabled={lockedOut}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      )}
    </section>
  )
}
