'use client'

import { useState } from 'react'
import { CheckCircle2, FileText, Link as LinkIcon, UserCheck } from 'lucide-react'

// renders the ocr cover-page verification queue for matching split scans to roster students
export function OcrStudentMatcherList({
  matches = [
    { scanId: 'scan-1', filename: 'submission_p1_p2.pdf', pageCount: 2, detectedUid: '204831', studentName: 'Alex Chen', confidence: 0.98, matched: true },
    { scanId: 'scan-2', filename: 'submission_p3_p4.pdf', pageCount: 2, detectedUid: '204838', studentName: 'Jordan Lee', confidence: 0.45, matched: false },
  ],
  rosterStudents = [
    { uid: '204831', name: 'Alex Chen' },
    { uid: '204838', name: 'Jordan Lee' },
    { uid: '204840', name: 'Taylor Swift' },
  ],
  onResolveMatch,
}) {
  const [selectedMatches, setSelectedMatches] = useState(
    matches.reduce((acc, m) => {
      acc[m.scanId] = m.detectedUid || ''
      return acc
    }, {})
  )

  // handles user selection of a student uid for an ambiguous or unmatched scan
  function handleSelectStudent(scanId, uid) {
    setSelectedMatches((prev) => ({ ...prev, [scanId]: uid }))
    onResolveMatch?.(scanId, uid)
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #dfe5e5',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#202c30', margin: 0 }}>
            Match scans to students
          </h3>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
            Verify optical character recognition UID matches extracted from cover pages.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {matches.map((item) => {
          const isConfirmed = item.matched && item.confidence > 0.8
          return (
            <div
              key={item.scanId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #dfe5e5',
                background: '#fafcfc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FileText size={20} color="#16756b" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#202c30' }}>
                    {item.filename} ({item.pageCount} pages)
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    OCR detected: {item.detectedUid ? `UID ${item.detectedUid}` : 'No UID detected'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {isConfirmed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#166534' }}>
                    <CheckCircle2 size={15} />
                    <span>{item.studentName} ({item.detectedUid})</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 500 }}>
                      Verify:
                    </span>
                    <select
                      value={selectedMatches[item.scanId] || ''}
                      onChange={(e) => handleSelectStudent(item.scanId, e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #dfe5e5',
                        fontSize: '12px',
                        background: '#ffffff',
                      }}
                    >
                      <option value="">Select student…</option>
                      {rosterStudents.map((s) => (
                        <option key={s.uid} value={s.uid}>
                          {s.name} ({s.uid})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
