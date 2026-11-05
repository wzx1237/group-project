'use client'

import { AlertTriangle, FileX } from 'lucide-react'

// renders actionable bottleneck and missing exam alert cards in the dashboard sidebar
export function NeedsAttentionSidebar({
  bottleneckQuestions = [],
  missingExams = [],
  examTitle = 'Quiz 03',
  onReassignGraders,
  onUploadMissingExam,
}) {
  const hasBottlenecks = bottleneckQuestions && bottleneckQuestions.length > 0
  const hasMissing = missingExams && missingExams.length > 0

  return (
    <aside
      aria-label="Needs attention"
      style={{
        background: '#ffffff',
        border: '1px solid #dfe5e5',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#202c30', margin: 0 }}>
          Needs attention
        </h2>
        {examTitle && (
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {examTitle}
          </span>
        )}
      </div>

      {!hasBottlenecks && !hasMissing && (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          No grading bottlenecks or missing exams detected.
        </p>
      )}

      {hasBottlenecks &&
        bottleneckQuestions.map((q) => (
          <div
            key={q.qid}
            style={{
              display: 'flex',
              gap: '12px',
              padding: '12px',
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '8px',
            }}
          >
            <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                {q.qid} · {q.title || 'Question'} is behind
              </div>
              <div style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                {q.gradedCount ?? 22} of {q.totalCount ?? 36} graded · {q.graderCount ?? 1} grader assigned
              </div>
              <button
                type="button"
                onClick={() => onReassignGraders?.(q.qid)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#16756b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Reassign graders →
              </button>
            </div>
          </div>
        ))}

      {hasMissing &&
        missingExams.map((exam, idx) => (
          <div
            key={exam.uid || idx}
            style={{
              display: 'flex',
              gap: '12px',
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fee2e2',
              borderRadius: '8px',
            }}
          >
            <FileX size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
                1 missing exam
              </div>
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                {exam.name || 'Jordan Lee'} · {exam.uid || '204838'} · shows 0 until uploaded
              </div>
              <button
                type="button"
                onClick={() => onUploadMissingExam?.(exam.examId || 'current', exam.uid)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#16756b',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Upload exam →
              </button>
            </div>
          </div>
        ))}
    </aside>
  )
}
