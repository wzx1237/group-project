'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Eye, Lock, Plus, User } from 'lucide-react'
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
