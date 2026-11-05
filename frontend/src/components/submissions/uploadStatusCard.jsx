'use client'

import { ProgressBar } from '@/components/ui/ProgressBar'

// renders real-time exam batch upload counts percentage and last activity timestamp
export function UploadStatusCard({
  uploadedCount = 35,
  totalCount = 36,
  lastUploadTime = 'Sep 29, 2026 at 9:16 AM',
}) {
  const percent = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #dfe5e5',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#202c30', margin: 0 }}>
        Upload status
      </h3>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: '#202c30' }}>
          {uploadedCount} of {totalCount} exams uploaded
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#16756b' }}>
          {percent}%
        </span>
      </div>

      <ProgressBar value={percent} label="" />

      {lastUploadTime && (
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          Last upload {lastUploadTime}
        </div>
      )}
    </div>
  )
}
