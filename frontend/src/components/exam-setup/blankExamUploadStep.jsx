'use client'

import { useState } from 'react'
import { FileCheck, FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// renders step 1 of the exam setup wizard for uploading templates and exam metadata
const KINDS = ['exam', 'final exam', 'homework', 'lab', 'quiz', 'essay', 'other']
const kindLabel = (k) => k.replace(/\b\w/g, (c) => c.toUpperCase())

// pdfLocked: the blank exam can't be replaced (the assignment is past draft); nextLabel names the step Continue goes to
export function BlankExamUploadStep({
  initialData = {},
  onNext,
  onSkip,
  skipLabel = 'Skip blank exam & rubric',
  requirePdf = true,
  pdfLocked = false,
  nextLabel = 'Questions and Regions',
}) {
  const [kind, setKind] = useState(initialData.kind || 'exam')
  const [title, setTitle] = useState(initialData.title || '')
  const [totalPoints, setTotalPoints] = useState(initialData.totalPoints || '')
  const [dueDate, setDueDate] = useState(initialData.dueDate || '')
  const [blankPdf, setBlankPdf] = useState(initialData.blankPdf || null)
  const [error, setError] = useState('')
  const [skipping, setSkipping] = useState(false)

  // handles the selection of the blank exam template pdf file
  function handleBlankPdfChange(event) {
    const file = event.target.files?.[0]
    if (file) setBlankPdf(file)
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
    setError('')
    onNext({
      kind,
      title: title.trim(),
      totalPoints: Number(totalPoints),
      dueDate,
      blankPdf,
    })
  }

  // creates the assignment from just its type, title and due date, without a blank exam or rubric
  async function handleSkip() {
    if (!title.trim()) return setError('please enter a title')
    setError('')
    setSkipping(true)
    await onSkip({ kind, title: title.trim(), dueDate, blankPdf })
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <Button variant="secondary" onClick={handleSkip} disabled={skipping}>
          {skipping ? 'Saving…' : skipLabel}
        </Button>
        <Button type="submit">
          Continue to {nextLabel} →
        </Button>
      </div>
    </form>
  )
}
