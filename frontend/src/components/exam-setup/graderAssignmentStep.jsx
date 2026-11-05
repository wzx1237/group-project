'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// renders step 4 of the exam setup wizard for configuring grading modes and assigning tas to questions
export function GraderAssignmentStep({
  questions = [],
  availableTAs = [
    { id: 'ta-1', name: 'Maya Rivera', email: 'mrivera@umd.edu' },
    { id: 'ta-2', name: 'Sarah Kim', email: 'skim@umd.edu' },
    { id: 'ta-3', name: 'Arjun Taylor', email: 'ataylor@umd.edu' },
  ],
  onBack,
  onPublish,
}) {
  const [gradingMode, setGradingMode] = useState('by_question')
  const [assignments, setAssignments] = useState(
    questions.reduce((acc, q, idx) => {
      acc[q.qid] = [availableTAs[idx % availableTAs.length]?.id].filter(Boolean)
      return acc
    }, {})
  )
  const [publishing, setPublishing] = useState(false)

  // toggles the assignment of a teaching assistant to a specific question
  function handleToggleGrader(qid, graderId) {
    setAssignments((prev) => {
      const current = prev[qid] || []
      const next = current.includes(graderId)
        ? current.filter((id) => id !== graderId)
        : [...current, graderId]
      return { ...prev, [qid]: next }
    })
  }

  // publishes the finalized exam draft to active status
  async function handlePublish() {
    setPublishing(true)
    try {
      await onPublish?.({ gradingMode, assignments })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
          4. Grader Assignments & Mode
        </h2>
        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
          Select how grading is distributed and assign staff to questions or discussion sections.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {[
          { id: 'by_question', title: 'Grade by question', desc: 'Each TA grades specific questions across all submissions.' },
          { id: 'by_submission', title: 'Grade whole submission', desc: 'Each TA grades all questions for assigned students.' },
          { id: 'by_section', title: 'Grade by section', desc: 'TAs grade students in their assigned discussion sections.' },
        ].map((mode) => (
          <div
            key={mode.id}
            onClick={() => setGradingMode(mode.id)}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '8px',
              border: `2px solid ${gradingMode === mode.id ? '#16756b' : '#dfe5e5'}`,
              background: gradingMode === mode.id ? '#f7faf9' : '#ffffff',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#202c30', marginBottom: '4px' }}>
              {mode.title}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {mode.desc}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: '#ffffff',
          border: '1px solid #dfe5e5',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #dfe5e5' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4b5563' }}>Question</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4b5563' }}>Points</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, color: '#4b5563' }}>Assigned TAs</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q) => {
              const assigned = assignments[q.qid] || []
              return (
                <tr key={q.qid} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#202c30' }}>
                    {q.qid} · {q.title || 'Question'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>
                    {q.total_score} pts
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {availableTAs.map((ta) => {
                        const isSelected = assigned.includes(ta.id)
                        return (
                          <button
                            key={ta.id}
                            type="button"
                            onClick={() => handleToggleGrader(q.qid, ta.id)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '4px',
                              border: `1px solid ${isSelected ? '#16756b' : '#dfe5e5'}`,
                              background: isSelected ? '#16756b' : '#ffffff',
                              color: isSelected ? '#ffffff' : '#374151',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {isSelected && <CheckCircle2 size={12} />}
                            {ta.name}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <Button variant="secondary" onClick={onBack} disabled={publishing}>
          Back
        </Button>
        <Button onClick={handlePublish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish & Finalize Exam'}
        </Button>
      </div>
    </div>
  )
}
