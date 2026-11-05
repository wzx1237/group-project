'use client'

import { useRef, useState } from 'react'
import { FileCheck, FileWarning, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'

// renders a drag and drop file upload zone for single or combined batch exam pdfs
export function PdfDropZone({ onUploadFiles, isUploading = false, uploadProgress = 0 }) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const fileInputRef = useRef(null)

  // handles dragging over the target drop zone
  function handleDragOver(event) {
    event.preventDefault()
    setIsDragOver(true)
  }

  // handles leaving the drop target area
  function handleDragLeave() {
    setIsDragOver(false)
  }

  // processes dropped files and validates that only pdf documents are submitted
  function handleDrop(event) {
    event.preventDefault()
    setIsDragOver(false)
    setErrorMessage('')

    const files = Array.from(event.dataTransfer?.files || [])
    if (files.length === 0) return

    const nonPdfs = files.filter((f) => !f.name.toLowerCase().endsWith('.pdf'))
    if (nonPdfs.length > 0) {
      return setErrorMessage('only scanned pdf files are accepted')
    }

    onUploadFiles?.(files)
  }

  // triggers the hidden native file picker dialog
  function handleFileSelect(event) {
    setErrorMessage('')
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    onUploadFiles?.(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${isDragOver ? '#16756b' : '#b9d7d2'}`,
        backgroundColor: isDragOver ? '#f0fdf4' : '#fafcfc',
        borderRadius: '12px',
        padding: '36px 24px',
        textAlign: 'center',
        position: 'relative',
        transition: 'all 0.15s ease-in-out',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          fontSize: '11px',
          color: '#6b7280',
          fontWeight: 500,
        }}
      >
        PDF files only
      </span>

      <UploadCloud size={40} color="#16756b" style={{ margin: '0 auto 12px' }} />

      <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#202c30', margin: '0 0 6px' }}>
        Drag scanned exam PDFs here
      </h3>
      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
        Upload a single combined batch scan or individual student papers.
      </p>

      {errorMessage && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#dc2626',
            fontSize: '12px',
            marginBottom: '16px',
          }}
        >
          <FileWarning size={14} /> {errorMessage}
        </div>
      )}

      {isUploading ? (
        <div style={{ maxWidth: '320px', margin: '0 auto' }}>
          <ProgressBar value={uploadProgress} label={`Uploading ${uploadProgress}%`} />
        </div>
      ) : (
        <div>
          <Button onClick={() => fileInputRef.current?.click()}>
            <FileCheck size={14} /> Browse files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}
    </div>
  )
}
