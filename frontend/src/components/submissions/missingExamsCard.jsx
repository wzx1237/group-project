'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'

// renders a list of enrolled students who have not yet submitted scans with late upload buttons
export function MissingExamsCard({
  missingStudents = [
    { uid: '204838', name: 'Jordan Lee', status: 'active' },
  ],
  totalPoints = 20,
  onUploadSingleScan,
}) {
  const fileInputRef = useRef(null)
  const activeMissing = missingStudents.filter((s) => s.status !== 'dropped')

  // handles selecting a replacement scan file for a specific missing student
  function handleFileSelected(uid, event) {
    const file = event.target.files?.[0]
    if (file && onUploadSingleScan) {
      onUploadSingleScan(uid, file)
    }
  }

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
          Missing exams
        </h3>
        <span
          style={{
            background: activeMissing.length > 0 ? '#fef3c7' : '#f3f4f6',
            color: activeMissing.length > 0 ? '#b45309' : '#6b7280',
            fontSize: '12px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '9999px',
          }}
        >
          {activeMissing.length}
        </span>
      </div>

      {activeMissing.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
          All active enrolled students have uploaded exams.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeMissing.map((student) => (
            <div
              key={student.uid}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: '8px',
                background: '#fafcfc',
                border: '1px solid #dfe5e5',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#202c30' }}>
                  {student.name}
                </div>
                <div style={{ fontSize: '11px', color: '#dc2626' }}>
                  {student.uid} · Missing exam
                </div>
              </div>

              <label style={{ cursor: 'pointer' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #dfe5e5',
                    background: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#202c30',
                  }}
                >
                  <Upload size={13} /> Upload exam
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFileSelected(student.uid, e)}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.4 }}>
        Missing exams show 0 / {totalPoints} until uploaded. Late and makeup exams can be added at any time. Dropped students are excluded.
      </div>
    </div>
  )
}
