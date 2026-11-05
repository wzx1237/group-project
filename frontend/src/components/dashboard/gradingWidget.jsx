'use client'

import { Edit3, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'

// renders the personalized grading progress widget and action button on the dashboard sidebar
export function GradingWidget({
  userRole = 'instructor',
  examTitle = 'Quiz 03',
  assignedQuestions = [
    { qid: 'Q1', title: 'Power rule', gradedCount: 32, totalCount: 36 },
    { qid: 'Q3', title: 'Slope at a point', gradedCount: 28, totalCount: 36 },
  ],
  onContinueGrading,
  onAssignGraders,
}) {
  const isTA = String(userRole).toLowerCase().includes('ta')

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #dfe5e5',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#202c30', margin: 0 }}>
          Your grading
        </h3>
        {examTitle && (
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            {examTitle}
          </span>
        )}
      </div>

      {isTA ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {assignedQuestions.map((q) => {
              const percent = q.totalCount > 0 ? Math.round((q.gradedCount / q.totalCount) * 100) : 0
              return (
                <div key={q.qid}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#202c30' }}>
                      {q.qid} · {q.title}
                    </span>
                    <span style={{ color: '#6b7280' }}>
                      {q.gradedCount} of {q.totalCount} graded
                    </span>
                  </div>
                  <ProgressBar value={percent} label="" />
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '6px' }}>
            <Button
              onClick={onContinueGrading}
              style={{
                width: '100%',
                justifyContent: 'center',
                backgroundColor: '#16756b',
                color: '#ffffff',
              }}
            >
              <Edit3 size={15} /> Continue grading
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
            You aren't assigned to any specific questions on {examTitle}. You can still grade any submission or reassign graders.
          </p>
          <div style={{ marginTop: '4px' }}>
            <Button
              variant="secondary"
              onClick={onAssignGraders}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <UserCheck size={15} /> Assign graders
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
