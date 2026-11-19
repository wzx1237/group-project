'use client'

import { useState } from 'react'
import { FileCheck, FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { UidRegionPicker } from './uidRegionPicker'

// renders step 1 of the exam setup wizard for uploading templates and exam metadata
const KINDS = ['exam', 'final exam', 'homework', 'lab', 'quiz', 'essay', 'other']
const kindLabel = (k) => k.replace(/\b\w/g, (c) => c.toUpperCase())

// pdfLocked: the blank exam can't be replaced (the assignment is past draft); nextLabel names the step Continue goes to
// savedPdf: the blank exam already on the server. Any other PDF needs its UID box location confirmed before continuing.
// skipSavesPdf: the skip button saves the chosen PDF too, so it needs the confirmed location as well
// skipWithPdfLabel: the skip button's text once a PDF is chosen (it then saves the PDF instead of skipping it)
export function BlankExamUploadStep({
  initialData = {},
  onNext,
  onSkip,
  skipLabel = 'Skip blank exam & rubric',
  skipWithPdfLabel = null,
  requirePdf = true,
  pdfLocked = false,
  savedPdf = null,
  skipSavesPdf = false,
  nextLabel = 'Questions and Regions',
}) {
  const [kind, setKind] = useState(initialData.kind || 'exam')
  const [title, setTitle] = useState(initialData.title || '')
  const [totalPoints, setTotalPoints] = useState(initialData.totalPoints || '')
  const [dueDate, setDueDate] = useState(initialData.dueDate || '')
  const [blankPdf, setBlankPdf] = useState(initialData.blankPdf || null)
  const [error, setError] = useState('')
  const [skipping, setSkipping] = useState(false)
  const [coverLayout, setCoverLayout] = useState(initialData.coverLayout || null) // { mode, rect }, once the server found the boxes
  const [pickerKey, setPickerKey] = useState(0)
  // the saved PDF's UID box can be marked again without replacing the PDF (kept when coming back from a later step)
  const [redrawing, setRedrawing] = useState(Boolean(initialData.coverLayout) && blankPdf === savedPdf)

  // a PDF that isn't the saved one (new, or replacing it), or a saved one being re-marked, needs its UID box
  // location confirmed
  const layoutNeeded = Boolean(blankPdf) && !pdfLocked && (blankPdf !== savedPdf || redrawing)
  const canRedraw = Boolean(blankPdf) && !pdfLocked && blankPdf === savedPdf && !redrawing
  const layoutMissing = layoutNeeded && !coverLayout
  const layoutMessage = 'please mark where the UID boxes are on the blank exam and wait for them to be found'

  // handles the selection of the blank exam template pdf file; its UID box location starts over
  function handleBlankPdfChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setBlankPdf(file)
    setRedrawing(false)
    setCoverLayout(null)
    setPickerKey((key) => key + 1)
  }

  // starts marking the saved blank exam's UID box again, or goes back to the saved location
  function setMarkingAgain(again) {
    setRedrawing(again)
    setCoverLayout(null)
    setPickerKey((key) => key + 1)
  }

  // validates input fields and advances wizard to the next configuration step
  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) {
      return setError('please enter a title')
    }
    if (!totalPoints || Number(totalPoints) <= 0) {
      return setError('please enter a valid total points value')
    }
    if (requirePdf && !blankPdf) {
      return setError('please upload the blank exam pdf; its cover page is how scans get split into one exam per student')
    }
    if (layoutMissing) {
      return setError(layoutMessage)
    }
    setError('')
    onNext({
      kind,
      title: title.trim(),
      totalPoints: Number(totalPoints),
      dueDate,
      blankPdf,
      coverLayout: layoutNeeded ? coverLayout : null,
    })
  }

  // creates the assignment from just its type, title and due date, without a blank exam or rubric
  async function handleSkip() {
    if (!title.trim()) return setError('please enter a title')
    if (skipSavesPdf && layoutMissing) return setError(layoutMessage)
    setError('')
    setSkipping(true)
    await onSkip({ kind, title: title.trim(), dueDate, blankPdf, coverLayout: layoutNeeded ? coverLayout : null })
    setSkipping(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
          1. Upload Exam Files & Information
        </h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
          Upload the master blank exam PDF.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Assignment Type
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dfe5e5', fontSize: '13px', background: '#ffffff' }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>{kindLabel(k)}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Title
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Quiz 03: Derivatives"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dfe5e5', fontSize: '13px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Total Points
          </label>
          <input
            type="number"
            required
            min="1"
            value={totalPoints}
            onChange={(e) => setTotalPoints(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dfe5e5', fontSize: '13px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Exam Date / Due
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dfe5e5', fontSize: '13px' }}
          />
        </div>
      </div>

      <div
        style={{
          border: '2px dashed #b9d7d2',
          borderRadius: '10px',
          padding: '24px',
          textAlign: 'center',
          background: '#fafcfc',
        }}
      >
        <UploadCloud size={32} color="#16756b" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#202c30', margin: '0 0 4px' }}>
          Blank Exam Template 
        </h3>
        <label style={{ cursor: pdfLocked ? 'not-allowed' : 'pointer', opacity: pdfLocked ? 0.6 : 1 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#16756b',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {blankPdf ? <FileCheck size={15} /> : <FileText size={15} />}
            {blankPdf ? blankPdf.name : 'Upload PDF'}
          </span>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleBlankPdfChange}
            disabled={pdfLocked}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {canRedraw && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#6b7280' }}>
          <span>The UID box location saved with this blank exam stays unless you change it.</span>
          <Button variant="secondary" size="sm" onClick={() => setMarkingAgain(true)}>
            Change UID box location
          </Button>
        </div>
      )}

      {layoutNeeded && blankPdf === savedPdf && (
        <div style={{ fontSize: '13px', color: '#6b7280' }}>
          Marking the UID box again on the saved blank exam.{' '}
          <Button variant="secondary" size="sm" onClick={() => setMarkingAgain(false)}>
            Keep the saved location
          </Button>
        </div>
      )}

      {layoutNeeded && (
        <UidRegionPicker
          key={pickerKey}
          file={blankPdf}
          initial={pickerKey === 0 && blankPdf === initialData.blankPdf ? initialData.coverLayout : null}
          onChange={setCoverLayout}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <Button variant="secondary" onClick={handleSkip} disabled={skipping}>
          {skipping ? 'Saving…' : skipSavesPdf && blankPdf && !pdfLocked && skipWithPdfLabel ? skipWithPdfLabel : skipLabel}
        </Button>
        <Button type="submit" disabled={layoutMissing}>
          Continue to {nextLabel} →
        </Button>
      </div>
    </form>
  )
}
