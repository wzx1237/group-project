'use client'

import { useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// renders step 3 of the exam setup wizard for initial rubric criteria creation and markdown imports
export function InitialRubricSetup({ questions = [], onBack, onNext }) {
  const [rubricQuestions, setRubricQuestions] = useState(
    questions.map((q) => ({
      ...q,
      criteria: q.criteria || [
        { label_id: `${q.qid}-1`, title: 'Correct working and method', deduction: q.total_score, description: 'Full credit' },
        { label_id: `${q.qid}-2`, title: 'Minor algebraic error', deduction: -1, description: 'Deduct 1 point' },
      ],
    }))
  )
  const [activeQid, setActiveQid] = useState(questions[0]?.qid || 'Q1')

  // appends a new rubric criterion deduction to the selected question
  function handleAddCriterion(qid) {
    setRubricQuestions((prev) =>
      prev.map((q) => {
        if (q.qid !== qid) return q
        const nextId = `${qid}-${q.criteria.length + 1}`
        return {
          ...q,
          criteria: [...q.criteria, { label_id: nextId, title: '', deduction: -1, description: '' }],
        }
      })
    )
  }

  // updates a criterion title or deduction points
  function handleUpdateCriterion(qid, labelId, field, value) {
    setRubricQuestions((prev) =>
      prev.map((q) => {
        if (q.qid !== qid) return q
        return {
          ...q,
          criteria: q.criteria.map((c) =>
            c.label_id === labelId ? { ...c, [field]: value } : c
          ),
        }
      })
    )
  }

  // removes a criterion from a question rubric
  function handleRemoveCriterion(qid, labelId) {
    setRubricQuestions((prev) =>
      prev.map((q) => {
        if (q.qid !== qid) return q
        return {
          ...q,
          criteria: q.criteria.filter((c) => c.label_id !== labelId),
        }
      })
    )
  }

  const activeQuestion = rubricQuestions.find((q) => q.qid === activeQid) || rubricQuestions[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#202c30', margin: 0 }}>
            3. Setup Initial Rubrics
          </h2>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            Define initial criteria and deductions. Rubrics can also be modified dynamically during active grading.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px', minHeight: '400px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rubricQuestions.map((q) => (
            <button
              key={q.qid}
              type="button"
              onClick={() => setActiveQid(q.qid)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                border: `1px solid ${q.qid === activeQid ? '#16756b' : '#dfe5e5'}`,
                background: q.qid === activeQid ? '#f7faf9' : '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#202c30' }}>
                  {q.qid} · {q.title || 'Question'}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {q.criteria.length} criteria defined
                </div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#16756b' }}>
                {q.total_score} pts
              </span>
            </button>
          ))}
        </div>

        {activeQuestion && (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #dfe5e5',
              borderRadius: '8px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#202c30', margin: 0 }}>
                {activeQuestion.qid} · {activeQuestion.title || 'Question'} Rubric ({activeQuestion.total_score} pts)
              </h3>
              <Button size="sm" variant="secondary" onClick={() => handleAddCriterion(activeQuestion.qid)}>
                <Plus size={13} /> Add criterion
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeQuestion.criteria.map((criterion) => (
                <div
                  key={criterion.label_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #dfe5e5',
                    background: '#fafcfc',
                  }}
                >
                  <input
                    type="number"
                    value={criterion.deduction}
                    onChange={(e) =>
                      handleUpdateCriterion(activeQuestion.qid, criterion.label_id, 'deduction', Number(e.target.value))
                    }
                    style={{
                      width: '60px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dfe5e5',
                      fontSize: '12px',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Criterion title visible to students"
                    value={criterion.title}
                    onChange={(e) =>
                      handleUpdateCriterion(activeQuestion.qid, criterion.label_id, 'title', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid #dfe5e5',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Grader internal note"
                    value={criterion.description}
                    onChange={(e) =>
                      handleUpdateCriterion(activeQuestion.qid, criterion.label_id, 'description', e.target.value)
                    }
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid #dfe5e5',
                      fontSize: '12px',
                    }}
                  />
                  {activeQuestion.criteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCriterion(activeQuestion.qid, criterion.label_id)}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onNext(rubricQuestions)}>
          Continue to Graders →
        </Button>
      </div>
    </div>
  )
}
