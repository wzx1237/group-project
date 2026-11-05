'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// modal allowing instructors to reassign graders and redistribute question workloads
export function ReassignGraders({
  isOpen,
  examId,
  questions = [],
  availableTAs = [],
  onSaveAssignments,
  onClose,
}) {
  const [selectedQid, setSelectedQid] = useState(questions[0]?.qid || 'Q4')
  const [selectedGraders, setSelectedGraders] = useState([])
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  // toggles a teaching assistant assignment for the currently selected question
  function handleToggleGrader(graderId) {
    setSelectedGraders((prev) =>
      prev.includes(graderId) ? prev.filter((id) => id !== graderId) : [...prev, graderId]
    )
  }

  // submits updated grader assignments for the active question
  async function handleSave() {
    setSaving(true)
    try {
      await onSaveAssignments?.(selectedQid, selectedGraders)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
              Reassign Question Graders
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
              Redistribute lagging questions across available teaching assistants.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} color="#6b7280" />
          </button>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4b5563', marginBottom: '6px' }}>
            Select Question
          </label>
          <select
            value={selectedQid}
            onChange={(e) => setSelectedQid(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #dfe5e5',
              fontSize: '13px',
              background: '#ffffff',
            }}
          >
            {questions.map((q) => (
              <option key={q.qid} value={q.qid}>
                {q.qid} · {q.title || 'Question'} ({q.gradedCount ?? 0} of {q.totalCount ?? 36} graded)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#4b5563', marginBottom: '8px' }}>
            Assign Teaching Assistants
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
            {availableTAs.map((ta) => {
              const isAssigned = selectedGraders.includes(ta.id)
              return (
                <div
                  key={ta.id}
                  onClick={() => handleToggleGrader(ta.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${isAssigned ? '#16756b' : '#dfe5e5'}`,
                    background: isAssigned ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#202c30' }}>
                      {ta.name}
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>
                      ({ta.email})
                    </span>
                  </div>
                  {isAssigned && <Check size={16} color="#16756b" />}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save Assignments
          </Button>
        </div>
      </div>
    </div>
  )
}
