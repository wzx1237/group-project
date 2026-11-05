'use client'

import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePdfRegionDrawer } from '@/hooks/usePdfRegionDrawer'

// renders step 2 of the setup wizard for defining questions and drawing answer regions on blank pdf scans
export function QuestionAndRegionsStep({ initialQuestions = [], totalExamPoints = 20, onBack, onNext }) {
  const [questions, setQuestions] = useState(
    initialQuestions.length > 0
      ? initialQuestions
      : [
          { qid: 'Q1', title: 'Power rule', total_score: 5, region: { page: 1, x: 0.1, y: 0.2, width: 0.8, height: 0.15 } },
          { qid: 'Q2', title: 'Chain rule', total_score: 5, region: { page: 1, x: 0.1, y: 0.4, width: 0.8, height: 0.18 } },
          { qid: 'Q3', title: 'Slope at a point', total_score: 5, region: { page: 1, x: 0.1, y: 0.62, width: 0.8, height: 0.15 } },
          { qid: 'Q4', title: 'Tangent line', total_score: 5, region: null },
        ]
  )
  const [activeQid, setActiveQid] = useState('Q4')
  const [currentPage, setCurrentPage] = useState(1)
  const { draftRect, handlePointerDown, handlePointerMove, handlePointerUp } = usePdfRegionDrawer()

  // appends a new question to the exam setup list
  function handleAddQuestion() {
    const nextNum = questions.length + 1
    const newQ = { qid: `Q${nextNum}`, title: '', total_score: 5, region: null }
    setQuestions((prev) => [...prev, newQ])
    setActiveQid(newQ.qid)
  }

  // updates a question title or point score
  function handleUpdateQuestion(qid, field, value) {
    setQuestions((prev) =>
      prev.map((q) => (q.qid === qid ? { ...q, [field]: value } : q))
    )
  }

  // removes a question from the setup list
  function handleRemoveQuestion(qid) {
    setQuestions((prev) => prev.filter((q) => q.qid !== qid))
    if (activeQid === qid) setActiveQid(null)
  }

  // captures the finished drawn bounding box and links it to the active question
  function onCanvasPointerUp(event) {
    const rect = handlePointerUp(event)
    if (rect && activeQid) {
      setQuestions((prev) =>
        prev.map((q) =>
          q.qid === activeQid ? { ...q, region: { page: currentPage, ...rect } } : q
        )
      )
    }
  }

  const assignedSum = questions.reduce((sum, q) => sum + (Number(q.total_score) || 0), 0)
  const pointsMatch = assignedSum === Number(totalExamPoints)
  const regionsDrawnCount = questions.filter((q) => Boolean(q.region)).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', minHeight: '520px' }}>
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #dfe5e5',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
              quiz03_blank.pdf · Page {currentPage} of 2
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid #dfe5e5',
                  background: currentPage === 1 ? '#16756b' : '#ffffff',
                  color: currentPage === 1 ? '#ffffff' : '#374151',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Page 1
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(2)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid #dfe5e5',
                  background: currentPage === 2 ? '#16756b' : '#ffffff',
                  color: currentPage === 2 ? '#ffffff' : '#374151',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Page 2
              </button>
            </div>
          </div>

          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={onCanvasPointerUp}
            style={{
              flex: 1,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'crosshair',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {questions.map((q) => {
              if (!q.region || q.region.page !== currentPage) return null
              const isSelected = q.qid === activeQid
              return (
                <div
                  key={q.qid}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveQid(q.qid)
                  }}
                  style={{
                    position: 'absolute',
                    left: `${q.region.x * 100}%`,
                    top: `${q.region.y * 100}%`,
                    width: `${q.region.width * 100}%`,
                    height: `${q.region.height * 100}%`,
                    border: `2px solid ${isSelected ? '#16756b' : '#0d9488'}`,
                    backgroundColor: isSelected ? 'rgba(22, 117, 107, 0.12)' : 'rgba(13, 148, 136, 0.06)',
                    borderRadius: '4px',
                    pointerEvents: 'auto',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '-20px',
                      background: '#16756b',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}
                  >
                    {q.qid} · {q.title || 'Question'}
                  </span>
                </div>
              )
            })}

            {draftRect && (
              <div
                style={{
                  position: 'absolute',
                  left: `${draftRect.x * 100}%`,
                  top: `${draftRect.y * 100}%`,
                  width: `${draftRect.width * 100}%`,
                  height: `${draftRect.height * 100}%`,
                  border: '2px dashed #16756b',
                  backgroundColor: 'rgba(22, 117, 107, 0.15)',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#202c30', margin: 0 }}>
              Questions & Regions
            </h3>
            <Button size="sm" variant="secondary" onClick={handleAddQuestion}>
              <Plus size={14} />
              Add question
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '460px', overflowY: 'auto' }}>
            {questions.map((q) => {
              const isActive = q.qid === activeQid
              return (
                <div
                  key={q.qid}
                  onClick={() => setActiveQid(q.qid)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: `1px solid ${isActive ? '#16756b' : '#dfe5e5'}`,
                    background: isActive ? '#f7faf9' : '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#16756b', minWidth: '28px' }}>
                      {q.qid}
                    </span>
                    <input
                      type="text"
                      placeholder="Question title"
                      value={q.title}
                      onChange={(e) => handleUpdateQuestion(q.qid, 'title', e.target.value)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #dfe5e5',
                        fontSize: '12px',
                      }}
                    />
                    <input
                      type="number"
                      min="0"
                      value={q.total_score}
                      onChange={(e) => handleUpdateQuestion(q.qid, 'total_score', Number(e.target.value))}
                      style={{
                        width: '54px',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        border: '1px solid #dfe5e5',
                        fontSize: '12px',
                        textAlign: 'right',
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#6b7280' }}>pts</span>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveQuestion(q.qid)
                        }}
                        style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    {q.region ? (
                      <span style={{ color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={12} /> Region on page {q.region.page}
                      </span>
                    ) : (
                      <span style={{ color: '#b45309' }}>
                        No region drawn · Click canvas to draw
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: '#ffffff',
          border: '1px solid #dfe5e5',
          borderRadius: '8px',
        }}
      >
        <div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#202c30' }}>
            {regionsDrawnCount} of {questions.length} regions drawn
          </span>
          <span style={{ fontSize: '12px', color: pointsMatch ? '#166534' : '#dc2626', marginLeft: '12px' }}>
            {questions.length} questions · {assignedSum} pts ({pointsMatch ? `Matches ${totalExamPoints}-point exam` : `Target: ${totalExamPoints} pts`})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={() => onNext(questions)}>
            Continue to rubric →
          </Button>
        </div>
      </div>
    </div>
  )
}
