'use client'

import { useState } from 'react'
import { FileCheck, FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// renders step 1 of the exam setup wizard for uploading templates and exam metadata
export function BlankExamUploadStep({ initialData = {}, onNext }) {
  const [title, setTitle] = useState(initialData.title || 'Quiz 03: Derivatives')
  const [totalPoints, setTotalPoints] = useState(initialData.totalPoints || 20)
  const [dueDate, setDueDate] = useState(initialData.dueDate || '2026-09-28')
  const [blankPdf, setBlankPdf] = useState(initialData.blankPdf || null)
  const [answerKeyPdf, setAnswerKeyPdf] = useState(initialData.answerKeyPdf || null)
  const [error, setError] = useState('')

  // handles the selection of the blank exam template pdf file
  function handleBlankPdfChange(event) {
    const file = event.target.files?.[0]
    if (file) setBlankPdf(file)
  }

  // handles the selection of the instructor reference answer key pdf file
  function handleAnswerKeyChange(event) {
    const file = event.target.files?.[0]
    if (file) setAnswerKeyPdf(file)
  }

  // validates input fields and advances wizard to the next configuration step
  function handleSubmit(event) {
    event.preventDefault()
    if (!title.trim()) {
      return setError('please enter an exam title')
    }
    if (!totalPoints || Number(totalPoints) <= 0) {
      return setError('please enter a valid total points value')
    }
    setError('')
    onNext({
      title: title.trim(),
      totalPoints: Number(totalPoints),
      dueDate,
      blankPdf,
      answerKeyPdf,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
          1. Upload Exam Files & Information
        </h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
          Upload the master blank exam PDF and optional reference answer key.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Exam Title
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
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
            Blank Exam Template (PDF)
          </h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
            Master PDF scan used to draw question answer regions.
          </p>
          <label style={{ cursor: 'pointer' }}>
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
              {blankPdf ? blankPdf.name || 'quiz03_blank.pdf' : 'Browse Blank PDF'}
            </span>
            <input type="file" accept="application/pdf" onChange={handleBlankPdfChange} style={{ display: 'none' }} />
          </label>
        </div>

        <div
          style={{
            border: '2px dashed #dfe5e5',
            borderRadius: '10px',
            padding: '24px',
            textAlign: 'center',
            background: '#ffffff',
          }}
        >
          <UploadCloud size={32} color="#6b7280" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#202c30', margin: '0 0 4px' }}>
            Answer Key (PDF)
          </h3>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
            Instructor reference key viewable side-by-side during grading.
          </p>
          <label style={{ cursor: 'pointer' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #dfe5e5',
                background: '#ffffff',
                color: '#202c30',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {answerKeyPdf ? <FileCheck size={15} /> : <FileText size={15} />}
              {answerKeyPdf ? answerKeyPdf.name || 'quiz03_answer_key.pdf' : 'Browse Answer Key'}
            </span>
            <input type="file" accept="application/pdf" onChange={handleAnswerKeyChange} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <Button type="submit">
          Continue to Questions and Regions →
        </Button>
      </div>
    </form>
  )
}
