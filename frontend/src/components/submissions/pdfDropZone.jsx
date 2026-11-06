'use client'

import { useRef, useState } from 'react'
import { FolderOpen, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import styles from './submissions.module.css'

const isPdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

export function PdfDropZone({ onUploadFiles, uploading, disabled }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)

  function send(fileList) {
    const files = [...fileList].filter(isPdf)
    if (files.length) onUploadFiles(files)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (!disabled && !uploading) send(event.dataTransfer.files)
  }

  if (uploading) {
    return (
      <div className={styles.dropZone}>
        <p className={styles.dropTitle}>Uploading {uploading.filename}</p>
        <div className={styles.uploadBar}>
          <ProgressBar value={uploading.percent} total={100} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={[styles.dropZone, dragging && styles.dragging, disabled && styles.disabled].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <span className={styles.dropIcon}>
        <UploadCloud size={20} strokeWidth={1.6} aria-hidden />
      </span>
      <p className={styles.dropTitle}>Drag scanned exam PDFs here</p>
      <p className={styles.dropHint}>One combined scan of the class, or a single late exam</p>
      <Button size="sm" onClick={() => input.current.click()} disabled={disabled}>
        <FolderOpen size={13} strokeWidth={1.6} aria-hidden /> Browse files
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => {
          send(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
